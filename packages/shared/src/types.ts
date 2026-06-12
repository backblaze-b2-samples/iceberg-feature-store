export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // PDF-specific
  pdf_pages: number | null;
  pdf_author: string | null;
  pdf_title: string | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- Iceberg feature store ---

export interface ColumnInfo {
  field_id: number;
  name: string;
  type: string;
  required: boolean;
}

export interface SchemaVersion {
  schema_id: number;
  columns: ColumnInfo[];
  is_current: boolean;
}

export interface TableInfo {
  identifier: string;
  exists: boolean;
  current_schema_id: number;
  columns: ColumnInfo[];
  snapshot_count: number;
  current_snapshot_id: number | null;
  total_rows: number;
  total_data_files: number;
  warehouse_uri: string;
}

export interface SnapshotInfo {
  snapshot_id: number;
  parent_id: number | null;
  committed_at: string;
  operation: string;
  schema_id: number | null;
  added_records: number;
  added_data_files: number;
  total_records: number;
  total_data_files: number;
  is_current: boolean;
}

export interface IngestRequest {
  rows?: number | null;
}

export interface IngestResponse {
  rows_appended: number;
  snapshot_id: number;
  total_rows: number;
  total_data_files: number;
  source: string;
}

export interface EvolveResponse {
  column_added: string;
  new_schema_id: number;
  current_schema_id: number;
  already_present: boolean;
}

export interface ScanStats {
  snapshot_id: number | null;
  total_data_files: number;
  files_scanned: number;
  rows_read: number;
}

export interface QueryRequest {
  snapshot_id?: number | null;
  as_of_timestamp?: string | null;
  row_filter?: string | null;
  sql?: string | null;
  limit?: number;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  scan_stats: ScanStats;
}

export interface ExportRequest {
  snapshot_id?: number | null;
  as_of_timestamp?: string | null;
  row_filter?: string | null;
  columns?: string[] | null;
}

export interface ExportResponse {
  key: string;
  rows_exported: number;
  size_bytes: number;
  size_human: string;
  snapshot_id: number | null;
  url: string | null;
}

export interface SnapshotGrowthPoint {
  snapshot_id: number;
  committed_at: string;
  total_rows: number;
}

export interface DashboardStats {
  table_exists: boolean;
  snapshot_count: number;
  current_total_rows: number;
  current_data_files: number;
  current_schema_id: number;
  warehouse_size_bytes: number;
  warehouse_size_human: string;
  write_amplification: number;
  current_logical_bytes: number;
  current_logical_human: string;
  growth: SnapshotGrowthPoint[];
}

export interface ActivityEntry {
  ts: string;
  op: string;
  detail: string;
  snapshot_id: number | null;
  rows: number | null;
}
