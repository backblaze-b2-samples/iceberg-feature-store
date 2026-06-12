"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  deleteFile,
  evolveSchema,
  getDashboardActivity,
  getDashboardStats,
  getFiles,
  getFileStats,
  getPreviewUrl,
  getSchemaVersions,
  getSnapshots,
  getTableInfo,
  getUploadActivity,
  getWarehouseFiles,
  ingestBatch,
  ingestRawFile,
  rollbackSnapshot,
} from "@/lib/api-client";
import type {
  ActivityEntry,
  DashboardStats,
  FileMetadata,
  SchemaVersion,
  SnapshotInfo,
  TableInfo,
} from "@iceberg-feature-store/shared";

// Single source of truth for query keys. Keep these tightly scoped so that
// invalidating "files" doesn't blow away unrelated caches, and so an IDE
// "find usages" of `qk.files` reveals every consumer.
export const qk = {
  all: ["b2"] as const,
  files: (prefix?: string, limit?: number) =>
    [...qk.all, "files", prefix ?? "", limit ?? 100] as const,
  stats: () => [...qk.all, "stats"] as const,
  uploadActivity: (days: number) =>
    [...qk.all, "stats", "activity", days] as const,
  preview: (key: string) => [...qk.all, "preview", key] as const,
  table: () => [...qk.all, "table"] as const,
  snapshots: () => [...qk.all, "snapshots"] as const,
  schema: () => [...qk.all, "schema"] as const,
  warehouseFiles: (limit: number) =>
    [...qk.all, "warehouse-files", limit] as const,
  dashboardStats: () => [...qk.all, "dashboard", "stats"] as const,
  dashboardActivity: (limit: number) =>
    [...qk.all, "dashboard", "activity", limit] as const,
};

export function useFiles(prefix = "", limit = 100) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.files(prefix, limit),
    queryFn: () => getFiles(prefix, limit),
  });
}

export function useFileStats() {
  return useQuery({
    queryKey: qk.stats(),
    queryFn: getFileStats,
  });
}

export function useUploadActivity(days = 7) {
  return useQuery({
    queryKey: qk.uploadActivity(days),
    queryFn: () => getUploadActivity(days),
  });
}

// Presigned preview URL — only fetched when `enabled` is true (e.g., when
// the dialog opens for a specific file). Kept short-lived (60s) because
// the URL itself has a presigned expiry and is cheap to regenerate.
export function usePreviewUrl(key: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.preview(key ?? ""),
    queryFn: () => getPreviewUrl(key as string),
    enabled: enabled && !!key,
    staleTime: 60_000,
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileKey: string) => deleteFile(fileKey),
    // After delete, blow away every cached file list + stats. Cheap and
    // correct — the dashboard re-fetches lazily as components remount.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.all });
    },
  });
}

// --- Iceberg feature store ---

export function useTableInfo() {
  return useQuery<TableInfo, ApiError>({
    queryKey: qk.table(),
    queryFn: getTableInfo,
  });
}

export function useSnapshots() {
  return useQuery<SnapshotInfo[], ApiError>({
    queryKey: qk.snapshots(),
    queryFn: getSnapshots,
  });
}

export function useSchemaVersions() {
  return useQuery<SchemaVersion[], ApiError>({
    queryKey: qk.schema(),
    queryFn: getSchemaVersions,
  });
}

export function useWarehouseFiles(limit = 1000) {
  return useQuery<FileMetadata[], ApiError>({
    queryKey: qk.warehouseFiles(limit),
    queryFn: () => getWarehouseFiles(limit),
  });
}

export function useDashboardStats() {
  return useQuery<DashboardStats, ApiError>({
    queryKey: qk.dashboardStats(),
    queryFn: getDashboardStats,
  });
}

export function useDashboardActivity(limit = 20) {
  return useQuery<ActivityEntry[], ApiError>({
    queryKey: qk.dashboardActivity(limit),
    queryFn: () => getDashboardActivity(limit),
  });
}

// A commit (ingest / evolve / rollback) changes the whole table — invalidate
// everything Iceberg-derived so cards, snapshots, schema, and activity refresh.
function invalidateTableState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.table() });
  qc.invalidateQueries({ queryKey: qk.snapshots() });
  qc.invalidateQueries({ queryKey: qk.schema() });
  qc.invalidateQueries({ queryKey: qk.dashboardStats() });
  qc.invalidateQueries({ queryKey: qk.dashboardActivity(20) });
  qc.invalidateQueries({ queryKey: qk.all });
}

export function useIngestBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows?: number | null) => ingestBatch(rows),
    onSuccess: () => invalidateTableState(qc),
  });
}

export function useIngestRawFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => ingestRawFile(key),
    onSuccess: () => invalidateTableState(qc),
  });
}

export function useEvolveSchema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => evolveSchema(),
    onSuccess: () => invalidateTableState(qc),
  });
}

export function useRollback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (snapshotId: string) => rollbackSnapshot(snapshotId),
    onSuccess: () => invalidateTableState(qc),
  });
}
