/** Archive export (PRD §5.5 portability, §3 amendment 2026-07-09). */

export const EXPORT_QUEUE = "export";

export interface ArchiveExportJob {
  treeId: string;
  /** archive_exports row created when the export was requested. */
  exportId: string;
}

/** Bump when the shape of data.json changes. */
export const EXPORT_SCHEMA_VERSION = 1;

/** Completed bundles are kept this long, then removed by the cleanup job. */
export const EXPORT_RETENTION_DAYS = 7;

export const EXPORT_STATUSES = ["pending", "running", "complete", "failed"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

/** Entry counts recorded on the export row and inside manifest.json. */
export interface ExportCounts {
  people: number;
  relationships: number;
  places: number;
  media: number;
  collections: number;
  sources: number;
  suggestions: number;
}
