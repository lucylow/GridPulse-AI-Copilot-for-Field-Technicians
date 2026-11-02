import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type DataPlatformColumn = {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
};

export type DataPlatformRecord = Record<string, unknown>;

export const dataDatasetsTable = pgTable(
  "data_datasets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    owner: text("owner").notNull(),
    sourceSystem: text("source_system").notNull(),
    sourceFileName: text("source_file_name"),
    classification: text("classification").notNull(),
    retentionCategory: text("retention_category").notNull(),
    updateFrequency: text("update_frequency").notNull(),
    status: text("status").notNull().default("active"),
    recordCount: integer("record_count").notNull().default(0),
    schemaVersion: integer("schema_version").notNull().default(1),
    latestVersion: integer("latest_version").notNull().default(1),
    qualityStatus: text("quality_status").notNull().default("unverified"),
    tags: jsonb("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    columns: jsonb("columns")
      .$type<DataPlatformColumn[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("data_datasets_category_idx").on(table.category),
    index("data_datasets_updated_at_idx").on(table.updatedAt),
    index("data_datasets_quality_status_idx").on(table.qualityStatus),
  ],
);

export const dataDatasetVersionsTable = pgTable(
  "data_dataset_versions",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => dataDatasetsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    recordCount: integer("record_count").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    qualityStatus: text("quality_status").notNull(),
    changeSummary: text("change_summary").notNull(),
    sourceReference: text("source_reference").notNull(),
    columns: jsonb("columns")
      .$type<DataPlatformColumn[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    records: jsonb("records")
      .$type<DataPlatformRecord[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("data_dataset_versions_dataset_version_uq").on(
      table.datasetId,
      table.version,
    ),
    index("data_dataset_versions_created_at_idx").on(table.createdAt),
  ],
);

export const dataQualityRunsTable = pgTable(
  "data_quality_runs",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => dataDatasetsTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    recordsChecked: integer("records_checked").notNull(),
    passedRecords: integer("passed_records").notNull(),
    failedRecords: integer("failed_records").notNull(),
    failureRate: doublePrecision("failure_rate").notNull(),
    dimensions: jsonb("dimensions").notNull(),
    issues: jsonb("issues").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("data_quality_runs_dataset_created_idx").on(
      table.datasetId,
      table.createdAt,
    ),
  ],
);

export const dataLineageEventsTable = pgTable(
  "data_lineage_events",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id")
      .notNull()
      .references(() => dataDatasetsTable.id, { onDelete: "cascade" }),
    sourceDatasetId: text("source_dataset_id"),
    sourceLabel: text("source_label").notNull(),
    targetLabel: text("target_label").notNull(),
    relation: text("relation").notNull(),
    detail: text("detail").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("data_lineage_events_dataset_created_idx").on(
      table.datasetId,
      table.createdAt,
    ),
  ],
);

export const dataPipelineRunsTable = pgTable(
  "data_pipeline_runs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    sourceDatasetId: text("source_dataset_id"),
    outputDatasetId: text("output_dataset_id"),
    recordsProcessed: integer("records_processed").notNull(),
    recordsRejected: integer("records_rejected").notNull(),
    durationMs: integer("duration_ms").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("data_pipeline_runs_created_idx").on(table.createdAt),
    index("data_pipeline_runs_status_idx").on(table.status),
  ],
);

export const dataAuditEventsTable = pgTable(
  "data_audit_events",
  {
    id: text("id").primaryKey(),
    datasetId: text("dataset_id").references(() => dataDatasetsTable.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("data_audit_events_created_idx").on(table.createdAt),
    index("data_audit_events_type_created_idx").on(
      table.eventType,
      table.createdAt,
    ),
  ],
);
