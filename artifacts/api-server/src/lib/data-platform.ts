import { randomUUID } from "node:crypto";
import type {
  DataPlatformColumn,
  DataPlatformRecord,
} from "@workspace/db";

export type QualityStatus = "pass" | "warning" | "failed" | "unverified";

export type QualityDimension = {
  name: string;
  status: QualityStatus;
  score: number | null;
  details: string;
};

export type QualityIssue = {
  field: string;
  rule: string;
  severity: "low" | "medium" | "high";
  failedRecords: number;
  sampleValue: string | null;
};

export type QualityReport = {
  datasetId: string;
  version: number;
  recordsChecked: number;
  passedRecords: number;
  failedRecords: number;
  failureRate: number;
  dimensions: QualityDimension[];
  issues: QualityIssue[];
  generatedAt: Date;
  accuracyNote: string;
};

export type PipelineStep = {
  operation:
    | "select_columns"
    | "rename_column"
    | "filter_equals"
    | "remove_duplicates"
    | "require_field"
    | "aggregate_count";
  column?: string;
  columns?: string[];
  newName?: string;
  value?: string;
};

export type CsvParseResult = {
  columns: string[];
  records: DataPlatformRecord[];
  rejectedRecords: number;
  warnings: string[];
};

const trainingColumns = (
  definitions: Array<[string, string, boolean, string]>,
): DataPlatformColumn[] =>
  definitions.map(([name, type, nullable, description]) => ({
    name,
    type,
    nullable,
    description,
  }));

export function getTrainingDatasets() {
  const expenses = [
    { recordId: "SYN-EXP-001", month: "2026-01", department: "Field Services", project: "SIM-Transformer Review", amount: 18400, currency: "CAD" },
    { recordId: "SYN-EXP-002", month: "2026-01", department: "Planning", project: "SIM-Load Study", amount: 6250, currency: "CAD" },
    { recordId: "SYN-EXP-003", month: "2026-01", department: "Field Services", project: "SIM-Inspection Route", amount: 9100, currency: "CAD" },
    { recordId: "SYN-EXP-004", month: "2026-02", department: "Asset Records", project: "SIM-Work Order Cleanup", amount: 4720, currency: "CAD" },
    { recordId: "SYN-EXP-005", month: "2026-02", department: "Planning", project: "SIM-Load Study", amount: 8800, currency: "CAD" },
    { recordId: "SYN-EXP-006", month: "2026-02", department: null, project: "SIM-Inspection Route", amount: 3400, currency: "CAD" },
    { recordId: "SYN-EXP-007", month: "2026-03", department: "Field Services", project: "SIM-Transformer Review", amount: 18400, currency: "CAD" },
    { recordId: "SYN-EXP-008", month: "2026-03", department: "Asset Records", project: "SIM-Work Order Cleanup", amount: 5210, currency: "CAD" },
    { recordId: "SYN-EXP-009", month: "2026-03", department: "Planning", project: "SIM-Load Study", amount: null, currency: "CAD" },
    { recordId: "SYN-EXP-009", month: "2026-03", department: "Planning", project: "SIM-Load Study", amount: null, currency: "CAD" },
  ];
  const workOrders = [
    { workOrderId: "SIM-WO-101", assetId: "SIM-ASSET-04", workType: "inspection", status: "complete", openedAt: "2026-01-03", durationHours: 3.5 },
    { workOrderId: "SIM-WO-102", assetId: "SIM-ASSET-11", workType: "review", status: "complete", openedAt: "2026-01-08", durationHours: 2 },
    { workOrderId: "SIM-WO-103", assetId: "SIM-ASSET-04", workType: "inspection", status: "queued", openedAt: "2026-01-14", durationHours: null },
    { workOrderId: "SIM-WO-104", assetId: "SIM-ASSET-08", workType: "records", status: "in_review", openedAt: "2026-01-18", durationHours: 1.25 },
    { workOrderId: "SIM-WO-105", assetId: "SIM-ASSET-11", workType: "review", status: "complete", openedAt: "2026-02-02", durationHours: 2.75 },
    { workOrderId: "SIM-WO-106", assetId: "SIM-ASSET-08", workType: "records", status: "queued", openedAt: "2026-02-11", durationHours: null },
    { workOrderId: "SIM-WO-107", assetId: "SIM-ASSET-17", workType: "inspection", status: "complete", openedAt: "2026-02-22", durationHours: 4 },
  ];
  const readings = [
    { eventId: "SIM-EVT-001", simulatedAt: "2026-02-01T08:00:00Z", assetId: "SIM-FEEDER-01", voltageV: 121.4, loadPct: 41.2, scenarioLabel: "Training baseline" },
    { eventId: "SIM-EVT-002", simulatedAt: "2026-02-01T08:15:00Z", assetId: "SIM-FEEDER-01", voltageV: 120.8, loadPct: 43.8, scenarioLabel: "Training baseline" },
    { eventId: "SIM-EVT-003", simulatedAt: "2026-02-01T08:30:00Z", assetId: "SIM-FEEDER-01", voltageV: 119.9, loadPct: 47.1, scenarioLabel: "Training baseline" },
    { eventId: "SIM-EVT-004", simulatedAt: "2026-02-01T08:45:00Z", assetId: "SIM-FEEDER-01", voltageV: 118.7, loadPct: 51.3, scenarioLabel: "Training baseline" },
    { eventId: "SIM-EVT-005", simulatedAt: "2026-02-01T09:00:00Z", assetId: "SIM-FEEDER-02", voltageV: 122.1, loadPct: 38.6, scenarioLabel: "Training baseline" },
    { eventId: "SIM-EVT-006", simulatedAt: "2026-02-01T09:15:00Z", assetId: "SIM-FEEDER-02", voltageV: 121.8, loadPct: 39.2, scenarioLabel: "Training baseline" },
    { eventId: "SIM-EVT-007", simulatedAt: "2026-02-01T09:30:00Z", assetId: "SIM-FEEDER-02", voltageV: 0, loadPct: 41.1, scenarioLabel: "Training baseline" },
    { eventId: "SIM-EVT-008", simulatedAt: "2026-02-01T09:45:00Z", assetId: "SIM-FEEDER-02", voltageV: 121.1, loadPct: 42, scenarioLabel: "Training baseline" },
  ];

  return [
    {
      id: "training-dataset-expenses",
      name: "Simulated Maintenance Spend",
      description: "Synthetic monthly planning figures for data-quality and aggregation exercises.",
      category: "Planning",
      owner: "GridPulse Training",
      sourceSystem: "Synthetic fixture generator",
      classification: "internal_synthetic",
      retentionCategory: "Training fixture",
      updateFrequency: "Static demo",
      recordCount: expenses.length,
      schemaVersion: 1,
      latestVersion: 2,
      qualityStatus: "warning" as const,
      tags: ["synthetic", "training", "planning"],
      columns: trainingColumns([
        ["recordId", "string", false, "Synthetic expense record identifier."],
        ["month", "date", false, "Synthetic reporting month."],
        ["department", "string", true, "Training department label."],
        ["project", "string", false, "Synthetic project label."],
        ["amount", "number", true, "Synthetic planned amount."],
        ["currency", "string", false, "Training currency code."],
      ]),
      versions: [
        { version: 1, records: expenses.slice(0, 8), changeSummary: "Initial synthetic training snapshot." },
        { version: 2, records: expenses, changeSummary: "Added two rows, including a deliberate duplicate and missing amount." },
      ],
    },
    {
      id: "training-dataset-work-orders",
      name: "Synthetic Work Order Register",
      description: "Mock work-order records for schema, completeness, and filtering exercises.",
      category: "Maintenance",
      owner: "GridPulse Training",
      sourceSystem: "Synthetic fixture generator",
      classification: "internal_synthetic",
      retentionCategory: "Training fixture",
      updateFrequency: "Static demo",
      recordCount: workOrders.length,
      schemaVersion: 1,
      latestVersion: 1,
      qualityStatus: "warning" as const,
      tags: ["synthetic", "training", "maintenance"],
      columns: trainingColumns([
        ["workOrderId", "string", false, "Synthetic work-order identifier."],
        ["assetId", "string", false, "Synthetic asset identifier."],
        ["workType", "string", false, "Training work category."],
        ["status", "string", false, "Mock workflow status."],
        ["openedAt", "date", false, "Synthetic open date."],
        ["durationHours", "number", true, "Mock duration in hours."],
      ]),
      versions: [
        { version: 1, records: workOrders, changeSummary: "Initial synthetic work-order fixture." },
      ],
    },
    {
      id: "training-dataset-readings",
      name: "Training Feeder Readings",
      description: "Fabricated readings for query and anomaly-check demonstrations; not telemetry.",
      category: "Simulated telemetry",
      owner: "GridPulse Training",
      sourceSystem: "Synthetic fixture generator",
      classification: "internal_synthetic",
      retentionCategory: "Training fixture",
      updateFrequency: "Static demo",
      recordCount: readings.length,
      schemaVersion: 1,
      latestVersion: 1,
      qualityStatus: "warning" as const,
      tags: ["synthetic", "training", "simulated"],
      columns: trainingColumns([
        ["eventId", "string", false, "Synthetic event identifier."],
        ["simulatedAt", "date", false, "Fabricated timestamp."],
        ["assetId", "string", false, "Synthetic feeder identifier."],
        ["voltageV", "number", false, "Illustrative voltage value."],
        ["loadPct", "number", false, "Illustrative load percentage."],
        ["scenarioLabel", "string", false, "Training scenario label."],
      ]),
      versions: [
        { version: 1, records: readings, changeSummary: "Initial fabricated reading fixture; values are not operational telemetry." },
      ],
    },
  ];
}

export function parseCsv(csvText: string): CsvParseResult {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let cell = "";
  let inQuotes = false;
  const input = csvText.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inQuotes) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (character === ",") {
      currentRow.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      currentRow.push(cell);
      rows.push(currentRow);
      currentRow = [];
      cell = "";
      if (character === "\r" && input[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }

  if (inQuotes) throw new Error("CSV contains an unclosed quoted field.");
  if (cell.length > 0 || currentRow.length > 0) {
    currentRow.push(cell);
    rows.push(currentRow);
  }

  const nonBlankRows = rows.filter((row) => row.some((value) => value.trim() !== ""));
  if (nonBlankRows.length < 2) throw new Error("CSV needs a header and at least one data row.");
  if (nonBlankRows.length - 1 > 5_000) throw new Error("CSV exceeds the 5,000-record import limit.");

  const rawHeaders = nonBlankRows[0]!;
  if (rawHeaders.length > 100) throw new Error("CSV exceeds the 100-column limit.");
  const used = new Map<string, number>();
  const columns = rawHeaders.map((header, index) => {
    const base = header.trim() || `column_${index + 1}`;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
  const warnings: string[] = [];
  if (columns.some((name, index) => name !== rawHeaders[index]?.trim())) {
    warnings.push("Blank or duplicate headers were normalized to unique column names.");
  }

  let rejectedRecords = 0;
  const records: DataPlatformRecord[] = [];
  for (const row of nonBlankRows.slice(1)) {
    if (row.length > columns.length || row.some((value) => value.length > 20_000)) {
      rejectedRecords += 1;
      continue;
    }
    if (row.length !== columns.length) {
      warnings.push("Some rows had missing cells; missing values were stored as null.");
    }
    records.push(
      Object.fromEntries(
        columns.map((column, index) => [
          column,
          row[index] === undefined || row[index] === "" ? null : row[index],
        ]),
      ),
    );
  }
  if (records.length === 0) throw new Error("CSV contains no valid data records.");
  if (rejectedRecords > 0) {
    warnings.push(`${rejectedRecords} rows were rejected for exceeding the header width or cell limit.`);
  }

  return {
    columns,
    records,
    rejectedRecords,
    warnings: [...new Set(warnings)],
  };
}

export function inferColumns(
  names: string[],
  records: DataPlatformRecord[],
): DataPlatformColumn[] {
  return names.map((name) => {
    const values = records.map((record) => record[name]);
    const nonEmpty = values.filter(
      (value) => value !== null && value !== undefined && value !== "",
    );
    let type = "string";
    if (
      nonEmpty.length > 0 &&
      nonEmpty.every(
        (value) =>
          typeof value === "number" ||
          (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))),
      )
    ) {
      type = "number";
    } else if (
      nonEmpty.length > 0 &&
      nonEmpty.every(
        (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)),
      ) &&
      nonEmpty.some((value) => typeof value === "string" && /[-T:/]/.test(value))
    ) {
      type = "date";
    } else if (
      nonEmpty.length > 0 &&
      nonEmpty.every((value) => typeof value === "boolean")
    ) {
      type = "boolean";
    }

    return {
      name,
      type,
      nullable: nonEmpty.length !== values.length,
      description: "Imported from a user-provided CSV; contents are not independently verified.",
    };
  });
}

function scoreStatus(score: number): QualityStatus {
  if (score >= 99) return "pass";
  if (score >= 90) return "warning";
  return "failed";
}

function rowKey(record: DataPlatformRecord): string {
  return JSON.stringify(
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key]]),
  );
}

export function checkQuality(
  datasetId: string,
  version: number,
  records: DataPlatformRecord[],
  columns: DataPlatformColumn[],
): QualityReport {
  const checked = records.length;
  const failedIndexes = new Set<number>();
  const issues: QualityIssue[] = [];
  const totalCells = checked * columns.length;
  let missingCells = 0;

  for (const column of columns) {
    const missingIndexes = records
      .map((record, index) => ({ record, index }))
      .filter(
        ({ record }) =>
          record[column.name] === null ||
          record[column.name] === undefined ||
          record[column.name] === "",
      )
      .map(({ index }) => index);
    missingCells += missingIndexes.length;
    missingIndexes.forEach((index) => failedIndexes.add(index));
    if (missingIndexes.length > 0) {
      issues.push({
        field: column.name,
        rule: "Non-empty values",
        severity: column.nullable ? "low" : "medium",
        failedRecords: missingIndexes.length,
        sampleValue: null,
      });
    }
  }

  const keyColumn = columns.find((column) =>
    /^(id|recordid|eventid|workorderid)$/i.test(column.name),
  );
  const seen = new Set<string>();
  let duplicateCount = 0;
  for (const [index, record] of records.entries()) {
    const key = keyColumn
      ? String(record[keyColumn.name] ?? "")
      : rowKey(record);
    if (key && seen.has(key)) {
      duplicateCount += 1;
      failedIndexes.add(index);
    }
    if (key) seen.add(key);
  }
  if (duplicateCount > 0) {
    issues.push({
      field: keyColumn?.name ?? "(whole row)",
      rule: keyColumn ? "Unique identifier" : "Unique rows",
      severity: "medium",
      failedRecords: duplicateCount,
      sampleValue: keyColumn ? String(records.find((record, index) => {
        const key = String(record[keyColumn.name] ?? "");
        return key && records.some((other, otherIndex) => otherIndex > index && String(other[keyColumn.name] ?? "") === key);
      })?.[keyColumn.name] ?? "") : null,
    });
  }

  const numericColumns = columns.filter((column) => column.type === "number");
  let invalidNumericRecords = 0;
  for (const [index, record] of records.entries()) {
    const invalid = numericColumns.some((column) => {
      const value = record[column.name];
      return (
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !Number.isFinite(Number(value))
      );
    });
    if (invalid) {
      invalidNumericRecords += 1;
      failedIndexes.add(index);
    }
  }
  if (invalidNumericRecords > 0) {
    issues.push({
      field: numericColumns.map((column) => column.name).join(", "),
      rule: "Numeric values are parseable",
      severity: "medium",
      failedRecords: invalidNumericRecords,
      sampleValue: "See preview",
    });
  }

  const completenessScore =
    totalCells === 0 ? 100 : Math.round((1 - missingCells / totalCells) * 100);
  const uniquenessScore =
    checked === 0 ? 100 : Math.round((1 - duplicateCount / checked) * 100);
  const validityScore =
    checked === 0 ? 100 : Math.round((1 - invalidNumericRecords / checked) * 100);
  const failedRecords = failedIndexes.size;
  const dimensions: QualityDimension[] = [
    {
      name: "Completeness",
      status: scoreStatus(completenessScore),
      score: completenessScore,
      details: `${missingCells} of ${totalCells} cells are empty.`,
    },
    {
      name: "Uniqueness",
      status: scoreStatus(uniquenessScore),
      score: uniquenessScore,
      details: `${duplicateCount} duplicate records detected.`,
    },
    {
      name: "Type validity",
      status: scoreStatus(validityScore),
      score: validityScore,
      details: `${invalidNumericRecords} records contain unparseable numeric values.`,
    },
    {
      name: "Accuracy",
      status: "unverified",
      score: null,
      details: "Real-world accuracy cannot be established from synthetic or user-provided data.",
    },
  ];

  return {
    datasetId,
    version,
    recordsChecked: checked,
    passedRecords: checked - failedRecords,
    failedRecords,
    failureRate: checked === 0 ? 0 : Number((failedRecords / checked).toFixed(4)),
    dimensions,
    issues: issues.slice(0, 50),
    generatedAt: new Date(),
    accuracyNote:
      "Structural checks only. This report does not verify operational accuracy or real-world conditions.",
  };
}

export function qualityStatusFor(report: QualityReport): QualityStatus {
  if (report.failedRecords === 0) return "pass";
  if (report.failureRate >= 0.25) return "failed";
  return "warning";
}

function requireColumn(
  columns: DataPlatformColumn[],
  name: string | undefined,
): DataPlatformColumn {
  if (!name) throw new Error("A column name is required for this operation.");
  const column = columns.find((candidate) => candidate.name === name);
  if (!column) throw new Error(`Column "${name}" does not exist in the selected dataset.`);
  return column;
}

export function runPipeline(
  sourceRecords: DataPlatformRecord[],
  sourceColumns: DataPlatformColumn[],
  steps: PipelineStep[],
): {
  records: DataPlatformRecord[];
  columns: DataPlatformColumn[];
  recordsRejected: number;
} {
  let records = sourceRecords.map((record) => ({ ...record }));
  let columns = sourceColumns.map((column) => ({ ...column }));
  let recordsRejected = 0;

  for (const step of steps) {
    switch (step.operation) {
      case "select_columns": {
        const selected = step.columns ?? [];
        if (selected.length === 0 || new Set(selected).size !== selected.length) {
          throw new Error("Select at least one unique column.");
        }
        selected.forEach((name) => requireColumn(columns, name));
        records = records.map((record) =>
          Object.fromEntries(selected.map((name) => [name, record[name]])),
        );
        columns = selected.map((name) => ({ ...requireColumn(columns, name) }));
        break;
      }
      case "rename_column": {
        const column = requireColumn(columns, step.column);
        const newName = step.newName?.trim();
        if (!newName) throw new Error("A new column name is required.");
        if (columns.some((candidate) => candidate.name === newName)) {
          throw new Error(`Column "${newName}" already exists.`);
        }
        records = records.map((record) => {
          const { [column.name]: value, ...rest } = record;
          return { ...rest, [newName]: value };
        });
        columns = columns.map((candidate) =>
          candidate.name === column.name
            ? { ...candidate, name: newName, description: `Renamed from ${column.name}.` }
            : candidate,
        );
        break;
      }
      case "filter_equals": {
        const column = requireColumn(columns, step.column);
        if (step.value === undefined) throw new Error("A filter value is required.");
        const filtered = records.filter(
          (record) => String(record[column.name] ?? "") === step.value,
        );
        recordsRejected += records.length - filtered.length;
        records = filtered;
        break;
      }
      case "remove_duplicates": {
        const seen = new Set<string>();
        const unique: DataPlatformRecord[] = [];
        for (const record of records) {
          const key = rowKey(record);
          if (seen.has(key)) {
            recordsRejected += 1;
          } else {
            seen.add(key);
            unique.push(record);
          }
        }
        records = unique;
        break;
      }
      case "require_field": {
        const column = requireColumn(columns, step.column);
        const filtered = records.filter((record) => {
          const value = record[column.name];
          return value !== null && value !== undefined && String(value).trim() !== "";
        });
        recordsRejected += records.length - filtered.length;
        records = filtered;
        break;
      }
      case "aggregate_count": {
        const column = requireColumn(columns, step.column);
        const counts = new Map<string, number>();
        for (const record of records) {
          const value = String(record[column.name] ?? "(blank)");
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        records = [...counts.entries()].map(([value, count]) => ({
          [column.name]: value,
          count,
        }));
        columns = [
          { ...column, nullable: false },
          {
            name: "count",
            type: "number",
            nullable: false,
            description: "Number of records in each group.",
          },
        ];
        break;
      }
    }
  }

  return { records, columns, recordsRejected };
}

function findMentionedColumn(
  question: string,
  columns: DataPlatformColumn[],
): DataPlatformColumn | undefined {
  const normalized = question.toLowerCase();
  return [...columns]
    .sort((a, b) => b.name.length - a.name.length)
    .find((column) => normalized.includes(column.name.toLowerCase()));
}

export function answerDatasetQuestion(input: {
  datasetId: string;
  datasetName: string;
  version: number;
  question: string;
  records: DataPlatformRecord[];
  columns: DataPlatformColumn[];
}) {
  const { datasetId, datasetName, version, question, records, columns } = input;
  const normalized = question.toLowerCase();
  const mentioned = findMentionedColumn(question, columns);
  let answer: string;
  let evidence: string[] = [];

  if (/(missing|null|blank|empty|completeness)/.test(normalized)) {
    const missing = columns
      .map((column) => ({
        name: column.name,
        count: records.filter((record) => {
          const value = record[column.name];
          return value === null || value === undefined || value === "";
        }).length,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
    answer = missing.length
      ? `Missing values appear in ${missing.length} field${missing.length === 1 ? "" : "s"}. ${missing.slice(0, 4).map((item) => `${item.name}: ${item.count}`).join("; ")}.`
      : "No missing values were found in the inspected records.";
    evidence = missing.slice(0, 5).map((item) => `${item.name}: ${item.count} missing of ${records.length} records`);
  } else if (/(duplicate|duplicated|repeated)/.test(normalized)) {
    const keyColumn = columns.find((column) =>
      /^(id|recordid|eventid|workorderid)$/i.test(column.name),
    );
    const keys = new Set<string>();
    let duplicates = 0;
    for (const record of records) {
      const key = keyColumn ? String(record[keyColumn.name] ?? "") : rowKey(record);
      if (key && keys.has(key)) duplicates += 1;
      if (key) keys.add(key);
    }
    answer = `${duplicates} duplicate record${duplicates === 1 ? "" : "s"} found using ${keyColumn?.name ?? "whole-row comparison"}.`;
    evidence = [`${duplicates} repeated keys or rows across ${records.length} inspected records`, `Comparison method: ${keyColumn?.name ?? "normalized full-row values"}`];
  } else if (/(sum|total|average|mean|maximum|minimum|largest|smallest)/.test(normalized)) {
    const numericColumns = columns.filter((column) => column.type === "number");
    const column =
      (mentioned?.type === "number" ? mentioned : undefined) ??
      (numericColumns.length === 1 ? numericColumns[0] : undefined);
    if (!column) {
      answer = numericColumns.length
        ? `Name one numeric field to analyze: ${numericColumns.map((item) => item.name).join(", ")}.`
        : "This dataset has no fields identified as numeric.";
      evidence = [`Numeric fields in schema: ${numericColumns.map((item) => item.name).join(", ") || "none"}`];
    } else {
      const values = records
        .map((record) => Number(record[column.name]))
        .filter((value) => Number.isFinite(value));
      const sum = values.reduce((total, value) => total + value, 0);
      if (values.length === 0) {
        answer = `No parseable numeric values were found in ${column.name}.`;
      } else if (/(average|mean)/.test(normalized)) {
        answer = `The mean of ${column.name} is ${(sum / values.length).toFixed(2)} across ${values.length} parseable values.`;
      } else if (/(maximum|largest)/.test(normalized)) {
        answer = `The maximum ${column.name} is ${Math.max(...values)} across ${values.length} parseable values.`;
      } else if (/(minimum|smallest)/.test(normalized)) {
        answer = `The minimum ${column.name} is ${Math.min(...values)} across ${values.length} parseable values.`;
      } else {
        answer = `The total ${column.name} is ${sum.toFixed(2)} across ${values.length} parseable values.`;
      }
      evidence = [`Field: ${column.name}`, `${values.length} parseable values from ${records.length} inspected records`, `Computed using local numeric aggregation`];
    }
  } else if (/(count by|group by|grouped by|breakdown by)/.test(normalized)) {
    const groupColumn = mentioned ?? columns.find((column) => column.type !== "number");
    if (!groupColumn) {
      answer = "No categorical field is available for a grouped count.";
    } else {
      const counts = new Map<string, number>();
      for (const record of records) {
        const value = String(record[groupColumn.name] ?? "(blank)");
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      answer = top.length
        ? `Record counts by ${groupColumn.name}: ${top.map(([value, count]) => `${value} ${count}`).join("; ")}.`
        : `No records are available to group by ${groupColumn.name}.`;
      evidence = [`Grouped ${records.length} records by ${groupColumn.name}`, `${counts.size} distinct group${counts.size === 1 ? "" : "s"}`];
    }
  } else if (/(summary|summarize|describe|overview|profile)/.test(normalized)) {
    const missing = columns.reduce(
      (total, column) =>
        total +
        records.filter((record) => {
          const value = record[column.name];
          return value === null || value === undefined || value === "";
        }).length,
      0,
    );
    const preview = columns.slice(0, 8).map((column) => `${column.name} (${column.type})`).join(", ");
    answer = `${records.length} records across ${columns.length} fields. ${missing} empty cells found. Fields: ${preview || "none"}.`;
    evidence = [`Dataset snapshot v${version}`, `${records.length} records and ${columns.length} fields inspected`, `${missing} empty cells`];
  } else {
    answer = "I can summarize this dataset, find missing or duplicate records, calculate a named numeric field, or count records by a field. Try one of those questions.";
    evidence = [`Available fields: ${columns.map((column) => column.name).join(", ") || "none"}`];
  }

  return {
    datasetId,
    datasetName,
    datasetVersion: version,
    question,
    answer,
    method: "Deterministic local analysis over the selected synthetic dataset; no model-generated SQL.",
    evidence,
    limitations: [
      "This workspace is a training simulation. Data may be fabricated or user-provided and is not independently verified.",
      "The analyst supports bounded summaries and aggregates; it does not establish real-world accuracy or operational conditions.",
    ],
    rowsExamined: records.length,
    generatedAt: new Date(),
  };
}

export function newDataId(): string {
  return randomUUID();
}
