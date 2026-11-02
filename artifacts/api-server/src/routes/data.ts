import { randomUUID } from "node:crypto";
import path from "node:path";
import { and, count, desc, eq, gte, ilike, or } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  AskDataAnalystBody,
  AskDataAnalystResponse,
  ExecuteDataPipelineBody,
  ExecuteDataPipelineResponse,
  GetDataCatalogResponse,
  GetDataObservabilityResponse,
  GetDatasetLineageParams,
  GetDatasetLineageResponse,
  GetDatasetParams,
  GetDatasetResponse,
  ImportDatasetBody,
  ImportDatasetResponse,
  ListDataSetsQueryParams,
  ListDataSetsResponse,
  ListDatasetVersionsParams,
  ListDatasetVersionsResponse,
  PreviewDatasetQueryParams,
  PreviewDatasetResponse,
  RunQualityCheckParams,
  RunQualityCheckResponse,
  UpdateDatasetMetadataBody,
  UpdateDatasetMetadataParams,
  UpdateDatasetMetadataResponse,
} from "@workspace/api-zod";
import {
  dataAuditEventsTable,
  dataDatasetVersionsTable,
  dataDatasetsTable,
  dataLineageEventsTable,
  dataPipelineRunsTable,
  dataQualityRunsTable,
  db,
  type DataPlatformColumn,
  type DataPlatformRecord,
} from "@workspace/db";
import {
  answerDatasetQuestion,
  checkQuality,
  getTrainingDatasets,
  inferColumns,
  newDataId,
  parseCsv,
  qualityStatusFor,
  runPipeline,
  type PipelineStep,
  type QualityReport,
} from "../lib/data-platform";

const router: IRouter = Router();

function failure(
  res: Response,
  status: number,
  message: string,
) {
  return res.status(status).json({ error: message });
}

function datasetDto(dataset: typeof dataDatasetsTable.$inferSelect) {
  return {
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    category: dataset.category,
    owner: dataset.owner,
    sourceSystem: dataset.sourceSystem,
    classification: dataset.classification,
    retentionCategory: dataset.retentionCategory,
    updateFrequency: dataset.updateFrequency,
    status: dataset.status,
    recordCount: dataset.recordCount,
    schemaVersion: dataset.schemaVersion,
    qualityStatus: dataset.qualityStatus,
    latestVersion: `v${dataset.latestVersion}`,
    tags: dataset.tags ?? [],
    columns: dataset.columns ?? [],
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt,
  };
}

async function ensureTrainingCatalog(): Promise<void> {
  const existing = await db
    .select({ id: dataDatasetsTable.id })
    .from(dataDatasetsTable);
  const knownIds = new Set(existing.map((dataset) => dataset.id));
  const trainingDatasets = getTrainingDatasets().filter(
    (dataset) => !knownIds.has(dataset.id),
  );
  if (trainingDatasets.length === 0) return;

  await db.transaction(async (tx) => {
    for (const seed of trainingDatasets) {
      await tx
        .insert(dataDatasetsTable)
        .values({
          id: seed.id,
          name: seed.name,
          description: seed.description,
          category: seed.category,
          owner: seed.owner,
          sourceSystem: seed.sourceSystem,
          classification: seed.classification,
          retentionCategory: seed.retentionCategory,
          updateFrequency: seed.updateFrequency,
          status: "active",
          recordCount: seed.recordCount,
          schemaVersion: seed.schemaVersion,
          latestVersion: seed.latestVersion,
          qualityStatus: seed.qualityStatus,
          tags: seed.tags,
          columns: seed.columns,
        })
        .onConflictDoNothing();

      for (const version of seed.versions) {
        const versionStatus = qualityStatusFor(
          checkQuality(seed.id, version.version, version.records, seed.columns),
        );
        await tx
          .insert(dataDatasetVersionsTable)
          .values({
            id: `${seed.id}-v${version.version}`,
            datasetId: seed.id,
            version: version.version,
            recordCount: version.records.length,
            schemaVersion: seed.schemaVersion,
            qualityStatus: versionStatus,
            changeSummary: version.changeSummary,
            sourceReference: "synthetic-training-fixture",
            columns: seed.columns,
            records: version.records,
          })
          .onConflictDoNothing();
      }

      await tx
        .insert(dataLineageEventsTable)
        .values({
          id: `training-lineage-${seed.id}`,
          datasetId: seed.id,
          sourceLabel: "Synthetic fixture generator",
          targetLabel: seed.name,
          relation: "generated",
          detail: "Fabricated records created for local training and data-engineering exercises.",
        })
        .onConflictDoNothing();
    }
  });
}

async function findDataset(datasetId: string) {
  const [dataset] = await db
    .select()
    .from(dataDatasetsTable)
    .where(eq(dataDatasetsTable.id, datasetId))
    .limit(1);
  return dataset;
}

async function latestVersion(datasetId: string, version?: number) {
  const query = db
    .select()
    .from(dataDatasetVersionsTable)
    .where(
      version === undefined
        ? eq(dataDatasetVersionsTable.datasetId, datasetId)
        : and(
            eq(dataDatasetVersionsTable.datasetId, datasetId),
            eq(dataDatasetVersionsTable.version, version),
          ),
    )
    .orderBy(desc(dataDatasetVersionsTable.version))
    .limit(1);
  const [snapshot] = await query;
  return snapshot;
}

function qualityStatusFromRecords(
  datasetId: string,
  version: number,
  records: DataPlatformRecord[],
  columns: DataPlatformColumn[],
): { report: QualityReport; status: ReturnType<typeof qualityStatusFor> } {
  const report = checkQuality(datasetId, version, records, columns);
  return { report, status: qualityStatusFor(report) };
}

async function saveQualityRun(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  report: QualityReport,
): Promise<void> {
  await tx.insert(dataQualityRunsTable).values({
    id: randomUUID(),
    datasetId: report.datasetId,
    version: report.version,
    recordsChecked: report.recordsChecked,
    passedRecords: report.passedRecords,
    failedRecords: report.failedRecords,
    failureRate: report.failureRate,
    dimensions: report.dimensions,
    issues: report.issues,
    createdAt: report.generatedAt,
  });
}

function fileLabel(name: string | undefined): string {
  if (!name) return "Uploaded CSV";
  return path.basename(name).replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "Uploaded CSV";
}

function pipelineColumns(
  names: string[],
  records: DataPlatformRecord[],
): DataPlatformColumn[] {
  return inferColumns(names, records);
}

router.get("/data/catalog", async (_req, res) => {
  await ensureTrainingCatalog();
  const datasets = await db.select().from(dataDatasetsTable);
  const recentEvents = await db
    .select()
    .from(dataLineageEventsTable)
    .orderBy(desc(dataLineageEventsTable.createdAt))
    .limit(10);

  return res.json(
    GetDataCatalogResponse.parse({
      datasetCount: datasets.length,
      activeCount: datasets.filter((dataset) => dataset.status === "active").length,
      archivedCount: datasets.filter((dataset) => dataset.status === "archived").length,
      totalRecords: datasets.reduce((total, dataset) => total + dataset.recordCount, 0),
      qualityFailures: datasets.filter(
        (dataset) =>
          dataset.qualityStatus === "warning" || dataset.qualityStatus === "failed",
      ).length,
      recentEvents,
    }),
  );
});

router.get("/data/datasets", async (req, res) => {
  await ensureTrainingCatalog();
  const parsed = ListDataSetsQueryParams.safeParse(req.query);
  if (!parsed.success) return failure(res, 400, "Invalid dataset search or page values.");

  const { search, category, page, pageSize } = parsed.data;
  const filters = [];
  if (search?.trim()) {
    const safeSearch = search.trim().replace(/[\\%_]/g, "\\$&");
    const pattern = `%${safeSearch}%`;
    filters.push(
      or(
        ilike(dataDatasetsTable.name, pattern),
        ilike(dataDatasetsTable.description, pattern),
        ilike(dataDatasetsTable.owner, pattern),
        ilike(dataDatasetsTable.sourceSystem, pattern),
      ),
    );
  }
  if (category?.trim()) {
    filters.push(ilike(dataDatasetsTable.category, category.trim()));
  }
  const where = and(...filters);
  const [totalResult] = await db
    .select({ total: count() })
    .from(dataDatasetsTable)
    .where(where);
  const datasets = await db
    .select()
    .from(dataDatasetsTable)
    .where(where)
    .orderBy(desc(dataDatasetsTable.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return res.json(
    ListDataSetsResponse.parse({
      items: datasets.map(datasetDto),
      page,
      pageSize,
      total: Number(totalResult?.total ?? 0),
      records: [],
    }),
  );
});

// Keep this before /data/datasets/:datasetId so "preview" is not treated as an ID.
router.get("/data/datasets/preview", async (req, res) => {
  await ensureTrainingCatalog();
  const parsed = PreviewDatasetQueryParams.safeParse(req.query);
  if (!parsed.success) return failure(res, 400, "Invalid dataset preview request.");

  const { datasetId, page, pageSize } = parsed.data;
  const dataset = await findDataset(datasetId);
  if (!dataset) return failure(res, 404, "Dataset not found.");
  const snapshot = await latestVersion(datasetId);
  if (!snapshot) return failure(res, 404, "Dataset snapshot not found.");
  const records = snapshot.records as DataPlatformRecord[];

  return res.json(
    PreviewDatasetResponse.parse({
      items: [datasetDto(dataset)],
      page,
      pageSize,
      total: records.length,
      records: records.slice((page - 1) * pageSize, page * pageSize),
    }),
  );
});

router.get("/data/datasets/:datasetId/versions", async (req, res) => {
  await ensureTrainingCatalog();
  const parsed = ListDatasetVersionsParams.safeParse(req.params);
  if (!parsed.success) return failure(res, 400, "Invalid dataset identifier.");
  const dataset = await findDataset(parsed.data.datasetId);
  if (!dataset) return failure(res, 404, "Dataset not found.");
  const versions = await db
    .select()
    .from(dataDatasetVersionsTable)
    .where(eq(dataDatasetVersionsTable.datasetId, dataset.id))
    .orderBy(desc(dataDatasetVersionsTable.version));

  return res.json(
    ListDatasetVersionsResponse.parse(
      versions.map((version) => ({
        id: version.id,
        version: version.version,
        recordCount: version.recordCount,
        schemaVersion: version.schemaVersion,
        qualityStatus: version.qualityStatus,
        changeSummary: version.changeSummary,
        createdAt: version.createdAt,
      })),
    ),
  );
});

router.get("/data/datasets/:datasetId/lineage", async (req, res) => {
  await ensureTrainingCatalog();
  const parsed = GetDatasetLineageParams.safeParse(req.params);
  if (!parsed.success) return failure(res, 400, "Invalid dataset identifier.");
  const dataset = await findDataset(parsed.data.datasetId);
  if (!dataset) return failure(res, 404, "Dataset not found.");
  const events = await db
    .select()
    .from(dataLineageEventsTable)
    .where(eq(dataLineageEventsTable.datasetId, dataset.id))
    .orderBy(desc(dataLineageEventsTable.createdAt));

  return res.json(GetDatasetLineageResponse.parse(events));
});

router.get("/data/datasets/:datasetId", async (req, res) => {
  await ensureTrainingCatalog();
  const parsed = GetDatasetParams.safeParse(req.params);
  if (!parsed.success) return failure(res, 400, "Invalid dataset identifier.");
  const dataset = await findDataset(parsed.data.datasetId);
  if (!dataset) return failure(res, 404, "Dataset not found.");
  const snapshot = await latestVersion(dataset.id);

  return res.json(
    GetDatasetResponse.parse({
      dataset: datasetDto(dataset),
      sampleRecords: (snapshot?.records as DataPlatformRecord[] | undefined)?.slice(0, 10) ?? [],
    }),
  );
});

router.patch("/data/datasets/:datasetId", async (req, res) => {
  await ensureTrainingCatalog();
  const params = UpdateDatasetMetadataParams.safeParse(req.params);
  const body = UpdateDatasetMetadataBody.safeParse(req.body);
  if (!params.success || !body.success) {
    return failure(res, 400, "Invalid dataset metadata update.");
  }

  const dataset = await findDataset(params.data.datasetId);
  if (!dataset) return failure(res, 404, "Dataset not found.");
  const patch = body.data;
  const changedFields = Object.keys(patch);
  const [updated] = await db
    .update(dataDatasetsTable)
    .set({
      ...(patch.description !== undefined && { description: patch.description.trim() }),
      ...(patch.owner !== undefined && { owner: patch.owner.trim() }),
      ...(patch.category !== undefined && { category: patch.category.trim() }),
      ...(patch.classification !== undefined && { classification: patch.classification }),
      ...(patch.retentionCategory !== undefined && {
        retentionCategory: patch.retentionCategory.trim(),
      }),
      ...(patch.tags !== undefined && { tags: patch.tags }),
      updatedAt: new Date(),
    })
    .where(eq(dataDatasetsTable.id, dataset.id))
    .returning();

  await db.insert(dataAuditEventsTable).values({
    id: randomUUID(),
    datasetId: dataset.id,
    eventType: "dataset.metadata_updated",
    details: { changedFields },
  });

  return res.json(UpdateDatasetMetadataResponse.parse(datasetDto(updated!)));
});

router.post("/data/imports", async (req, res) => {
  await ensureTrainingCatalog();
  const parsed = ImportDatasetBody.safeParse(req.body);
  if (!parsed.success) return failure(res, 400, "Invalid CSV import request.");
  const input = parsed.data;
  const name = input.name.trim();
  if (!name) return failure(res, 400, "Dataset name cannot be blank.");

  const [existing] = await db
    .select({ id: dataDatasetsTable.id })
    .from(dataDatasetsTable)
    .where(eq(dataDatasetsTable.name, name))
    .limit(1);
  if (existing) return failure(res, 409, "A dataset with this name already exists.");

  let csv: ReturnType<typeof parseCsv>;
  try {
    csv = parseCsv(input.csvText);
  } catch (error) {
    return failure(
      res,
      400,
      error instanceof Error ? error.message : "Unable to parse CSV.",
    );
  }

  const id = newDataId();
  const columns = inferColumns(csv.columns, csv.records);
  const report = checkQuality(id, 1, csv.records, columns);
  const status = qualityStatusFor(report);
  const sourceFileName = fileLabel(input.sourceFileName);
  const now = new Date();
  const newDataset = {
    id,
    name,
    description: input.description?.trim() || "User-provided CSV for synthetic training exercises.",
    category: input.category.trim(),
    owner: "Training analyst",
    sourceSystem: "User-provided CSV; not independently verified",
    sourceFileName,
    classification: "internal_synthetic",
    retentionCategory: "Training import",
    updateFrequency: "Manual import",
    status: "active",
    recordCount: csv.records.length,
    schemaVersion: 1,
    latestVersion: 1,
    qualityStatus: status,
    tags: ["user-import", "training", "synthetic"],
    columns,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.transaction(async (tx) => {
      await tx.insert(dataDatasetsTable).values(newDataset);
      await tx.insert(dataDatasetVersionsTable).values({
        id: `${id}-v1`,
        datasetId: id,
        version: 1,
        recordCount: csv.records.length,
        schemaVersion: 1,
        qualityStatus: status,
        changeSummary: `Imported ${csv.records.length} parsed records from ${sourceFileName}.`,
        sourceReference: sourceFileName,
        columns,
        records: csv.records,
        createdAt: now,
      });
      await saveQualityRun(tx, report);
      await tx.insert(dataLineageEventsTable).values({
        id: randomUUID(),
        datasetId: id,
        sourceLabel: sourceFileName,
        targetLabel: name,
        relation: "imported",
        detail: `Imported ${csv.records.length} parsed synthetic-training records. Source contents are not independently verified.`,
      });
      await tx.insert(dataAuditEventsTable).values({
        id: randomUUID(),
        datasetId: id,
        eventType: "dataset.imported",
        details: {
          importedRecords: csv.records.length,
          rejectedRecords: csv.rejectedRecords,
          columnCount: columns.length,
        },
      });
    });
  } catch (error) {
    req.log.error({ err: error }, "CSV import failed");
    return failure(res, 409, "Dataset import could not be committed. Check the name and retry.");
  }

  return res.status(201).json(
    ImportDatasetResponse.parse({
      dataset: datasetDto(newDataset),
      importedRecords: csv.records.length,
      rejectedRecords: csv.rejectedRecords,
      warnings: csv.warnings,
    }),
  );
});

router.post("/data/datasets/:datasetId/quality/run", async (req, res) => {
  await ensureTrainingCatalog();
  const params = RunQualityCheckParams.safeParse(req.params);
  if (!params.success) return failure(res, 400, "Invalid dataset identifier.");
  const dataset = await findDataset(params.data.datasetId);
  if (!dataset) return failure(res, 404, "Dataset not found.");
  const snapshot = await latestVersion(dataset.id);
  if (!snapshot) return failure(res, 404, "Dataset snapshot not found.");

  const records = snapshot.records as DataPlatformRecord[];
  const columns = snapshot.columns as DataPlatformColumn[];
  const { report, status } = qualityStatusFromRecords(
    dataset.id,
    snapshot.version,
    records,
    columns,
  );
  await db.transaction(async (tx) => {
    await saveQualityRun(tx, report);
    await tx
      .update(dataDatasetsTable)
      .set({ qualityStatus: status })
      .where(eq(dataDatasetsTable.id, dataset.id));
    await tx
      .update(dataDatasetVersionsTable)
      .set({ qualityStatus: status })
      .where(eq(dataDatasetVersionsTable.id, snapshot.id));
    await tx.insert(dataAuditEventsTable).values({
      id: randomUUID(),
      datasetId: dataset.id,
      eventType: "dataset.quality_checked",
      details: {
        version: snapshot.version,
        recordsChecked: report.recordsChecked,
        failedRecords: report.failedRecords,
      },
    });
  });

  return res.json(RunQualityCheckResponse.parse(report));
});

router.post("/data/pipelines/execute", async (req, res) => {
  await ensureTrainingCatalog();
  const parsed = ExecuteDataPipelineBody.safeParse(req.body);
  if (!parsed.success) return failure(res, 400, "Invalid pipeline request.");
  const input = parsed.data;
  const source = await findDataset(input.sourceDatasetId);
  if (!source) return failure(res, 404, "Source dataset not found.");
  const snapshot = await latestVersion(source.id);
  if (!snapshot) return failure(res, 404, "Source dataset snapshot not found.");

  let transformed: ReturnType<typeof runPipeline>;
  const startedAt = Date.now();
  try {
    transformed = runPipeline(
      snapshot.records as DataPlatformRecord[],
      snapshot.columns as DataPlatformColumn[],
      input.steps as PipelineStep[],
    );
  } catch (error) {
    return failure(
      res,
      400,
      error instanceof Error ? error.message : "Pipeline validation failed.",
    );
  }

  const runId = randomUUID();
  const outputId = newDataId();
  const outputName = `${source.name} — ${input.name}`.slice(0, 100);
  const [existingOutput] = await db
    .select()
    .from(dataDatasetsTable)
    .where(eq(dataDatasetsTable.name, outputName))
    .limit(1);
  const outputVersion = (existingOutput?.latestVersion ?? 0) + 1;
  const outputDatasetId = existingOutput?.id ?? outputId;
  const quality = checkQuality(
    outputDatasetId,
    outputVersion,
    transformed.records,
    transformed.columns,
  );
  const status = qualityStatusFor(quality);
  const now = new Date();
  const durationMs = Math.max(0, Date.now() - startedAt);
  const output = {
    id: outputDatasetId,
    name: outputName,
    description: `Output of ${input.name} from ${source.name}; generated from synthetic training data.`,
    category: source.category,
    owner: "GridPulse Data Engineering",
    sourceSystem: `Pipeline from ${source.name}`,
    classification: source.classification,
    retentionCategory: source.retentionCategory,
    updateFrequency: "Pipeline execution",
    status: "active",
    recordCount: transformed.records.length,
    schemaVersion: source.schemaVersion + 1,
    latestVersion: outputVersion,
    qualityStatus: status,
    tags: [...new Set([...source.tags, "pipeline-output"])],
    columns: transformed.columns,
    createdAt: existingOutput?.createdAt ?? now,
    updatedAt: now,
  };

  await db.transaction(async (tx) => {
    if (existingOutput) {
      await tx
        .update(dataDatasetsTable)
        .set({
          description: output.description,
          recordCount: output.recordCount,
          schemaVersion: output.schemaVersion,
          latestVersion: output.latestVersion,
          qualityStatus: output.qualityStatus,
          columns: output.columns,
          updatedAt: now,
        })
        .where(eq(dataDatasetsTable.id, outputDatasetId));
    } else {
      await tx.insert(dataDatasetsTable).values(output);
    }
    await tx.insert(dataDatasetVersionsTable).values({
      id: `${outputDatasetId}-v${outputVersion}-${runId.slice(0, 8)}`,
      datasetId: outputDatasetId,
      version: outputVersion,
      recordCount: transformed.records.length,
      schemaVersion: output.schemaVersion,
      qualityStatus: status,
      changeSummary: `Created by pipeline "${input.name}" using ${input.steps.length} validated step(s).`,
      sourceReference: `pipeline:${runId}`,
      columns: transformed.columns,
      records: transformed.records,
      createdAt: now,
    });
    await saveQualityRun(tx, quality);
    await tx.insert(dataLineageEventsTable).values({
      id: randomUUID(),
      datasetId: outputDatasetId,
      sourceDatasetId: source.id,
      sourceLabel: `${source.name} · v${snapshot.version}`,
      targetLabel: `${output.name} · v${outputVersion}`,
      relation: "transformed",
      detail: `Pipeline "${input.name}" produced ${transformed.records.length} records from ${snapshot.recordCount}; ${transformed.recordsRejected} were filtered or removed.`,
      createdAt: now,
    });
    await tx.insert(dataPipelineRunsTable).values({
      id: runId,
      name: input.name,
      status: "succeeded",
      sourceDatasetId: source.id,
      outputDatasetId,
      recordsProcessed: snapshot.recordCount,
      recordsRejected: transformed.recordsRejected,
      durationMs,
      message: `Completed ${input.steps.length} validated step(s); output version v${outputVersion} was saved.`,
      createdAt: now,
    });
    await tx.insert(dataAuditEventsTable).values({
      id: randomUUID(),
      datasetId: outputDatasetId,
      eventType: "pipeline.executed",
      details: {
        pipelineRunId: runId,
        sourceDatasetId: source.id,
        outputVersion,
        stepCount: input.steps.length,
      },
      createdAt: now,
    });
  });

  return res.status(201).json(
    ExecuteDataPipelineResponse.parse({
      id: runId,
      name: input.name,
      status: "succeeded",
      sourceDatasetId: source.id,
      outputDatasetId,
      recordsProcessed: snapshot.recordCount,
      recordsRejected: transformed.recordsRejected,
      durationMs,
      message: `Completed ${input.steps.length} validated step(s); output version v${outputVersion} was saved.`,
      createdAt: now,
    }),
  );
});

router.post("/data/analyst/ask", async (req, res) => {
  await ensureTrainingCatalog();
  const parsed = AskDataAnalystBody.safeParse(req.body);
  if (!parsed.success) return failure(res, 400, "Invalid analyst question.");
  const { datasetId, question } = parsed.data;
  const dataset = await findDataset(datasetId);
  if (!dataset) return failure(res, 404, "Dataset not found.");
  const snapshot = await latestVersion(datasetId);
  if (!snapshot) return failure(res, 404, "Dataset snapshot not found.");

  return res.json(
    AskDataAnalystResponse.parse(
      answerDatasetQuestion({
        datasetId,
        datasetName: dataset.name,
        version: snapshot.version,
        question,
        records: snapshot.records as DataPlatformRecord[],
        columns: snapshot.columns as DataPlatformColumn[],
      }),
    ),
  );
});

router.get("/data/observability", async (_req, res) => {
  await ensureTrainingCatalog();
  const datasets = await db.select().from(dataDatasetsTable);
  const staleBefore = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const staleDatasets = datasets.filter(
    (dataset) => dataset.status === "active" && dataset.updatedAt.getTime() < staleBefore,
  ).length;
  const failedDatasets = datasets.filter(
    (dataset) =>
      dataset.qualityStatus === "failed" || dataset.qualityStatus === "warning",
  ).length;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [imports] = await db
    .select({ total: count() })
    .from(dataAuditEventsTable)
    .where(
      and(
        eq(dataAuditEventsTable.eventType, "dataset.imported"),
        gte(dataAuditEventsTable.createdAt, weekAgo),
      ),
    );
  const lastUpdatedAt = datasets.reduce<Date | null>(
    (latest, dataset) =>
      latest === null || dataset.updatedAt > latest ? dataset.updatedAt : latest,
    null,
  );
  const status =
    datasets.length === 0
      ? "empty"
      : staleDatasets > 0 || failedDatasets > 0
        ? "attention"
        : "healthy";

  return res.json(
    GetDataObservabilityResponse.parse({
      datasetCount: datasets.length,
      staleDatasets,
      failedDatasets,
      recentImports: Number(imports?.total ?? 0),
      lastUpdatedAt,
      status,
    }),
  );
});

export default router;
