from typing import Any

from pydantic import BaseModel


class ScanStats(BaseModel):
    """How much work the time-travel scan did (Iceberg file pruning + DuckDB)."""

    snapshot_id: int | None
    total_data_files: int  # files in the resolved snapshot
    files_scanned: int  # files PyIceberg actually read (after pruning)
    rows_read: int  # rows materialized into Arrow before SQL


class QueryRequest(BaseModel):
    """Time-travel query against the feature table, executed in DuckDB."""

    # Resolution mode (mutually exclusive; current if none set):
    snapshot_id: int | None = None
    as_of_timestamp: str | None = None  # ISO 8601; resolves to latest <= ts
    # Optional Iceberg row filter expression (e.g. "label = 1").
    row_filter: str | None = None
    # SQL run by DuckDB over the scanned Arrow table aliased as `t`.
    # Defaults to a simple preview.
    sql: str | None = None
    limit: int = 100


class QueryResult(BaseModel):
    """Rows + columns from DuckDB plus the underlying scan stats."""

    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    scan_stats: ScanStats


class ExportRequest(BaseModel):
    """Export a training slice as a new Parquet object on B2 (the Derive step)."""

    snapshot_id: int | None = None
    as_of_timestamp: str | None = None
    row_filter: str | None = None
    columns: list[str] | None = None  # None -> all columns


class ExportResponse(BaseModel):
    """Result of an export — a new Parquet under exports/ on B2."""

    key: str
    rows_exported: int
    size_bytes: int
    size_human: str
    snapshot_id: int | None
    url: str | None
