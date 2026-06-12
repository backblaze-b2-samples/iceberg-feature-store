"""Query service — time-travel scan + DuckDB SQL, and the export (Derive) step.

Flow: PyIceberg resolves the scan (current / a snapshot / as-of timestamp),
prunes files, and reads only the needed Parquet from B2 into Arrow. DuckDB then
runs SQL purely in-memory over that Arrow table. Export writes a new Parquet to
exports/ on B2 via the UA-tagged boto3 client (so Derive writes are tagged too).
"""

import logging
from datetime import UTC, datetime

from app.config import settings
from app.repo import (
    arrow_to_parquet_bytes,
    log_op,
    run_sql,
    scan,
    upload_file,
)
from app.types import (
    ExportRequest,
    ExportResponse,
    QueryRequest,
    QueryResult,
    ScanStats,
)

logger = logging.getLogger(__name__)


class QueryError(Exception):
    """Raised when a query/export request is invalid."""

    def __init__(self, detail: str, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def run_query(req: QueryRequest) -> QueryResult:
    """Plan a time-travel scan, then run SQL over the Arrow result in DuckDB."""
    if req.snapshot_id is not None and req.as_of_timestamp:
        raise QueryError("Provide either snapshot_id or as_of_timestamp, not both")
    try:
        arrow, stats = scan(
            snapshot_id=req.snapshot_id,
            as_of=req.as_of_timestamp,
            row_filter=req.row_filter,
        )
    except (RuntimeError, ValueError) as e:
        raise QueryError(f"Scan failed: {e}", status_code=502) from e
    try:
        result = run_sql(arrow, req.sql, limit=req.limit)
    except Exception as e:  # DuckDB surfaces SQL errors as generic exceptions
        raise QueryError(f"SQL error: {e}") from e
    log_op(
        "query",
        f"scanned {stats['files_scanned']}/{stats['total_data_files']} files, "
        f"{result['row_count']} rows returned",
        stats["snapshot_id"],
        result["row_count"],
    )
    return QueryResult(
        columns=result["columns"],
        rows=result["rows"],
        row_count=result["row_count"],
        scan_stats=ScanStats(**stats),
    )


def export_slice(req: ExportRequest) -> ExportResponse:
    """Export a (filtered, projected) training slice as new Parquet on B2."""
    if req.snapshot_id is not None and req.as_of_timestamp:
        raise QueryError("Provide either snapshot_id or as_of_timestamp, not both")
    try:
        arrow, stats = scan(
            snapshot_id=req.snapshot_id,
            as_of=req.as_of_timestamp,
            row_filter=req.row_filter,
            columns=req.columns,
        )
    except (RuntimeError, ValueError) as e:
        raise QueryError(f"Scan failed: {e}", status_code=502) from e
    if arrow.num_rows == 0:
        raise QueryError("Export produced 0 rows — nothing to write")

    parquet_bytes = arrow_to_parquet_bytes(arrow)
    ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    key = f"{settings.exports_prefix}slice_{ts}.parquet"
    result = upload_file(parquet_bytes, key, "application/vnd.apache.parquet")
    log_op("export", f"exported {arrow.num_rows} rows -> {key}", stats["snapshot_id"], arrow.num_rows)
    logger.info("Exported %d rows to %s (%d bytes)", arrow.num_rows, key, result.size_bytes)
    return ExportResponse(
        key=result.key,
        rows_exported=arrow.num_rows,
        size_bytes=result.size_bytes,
        size_human=result.size_human,
        snapshot_id=stats["snapshot_id"],
        url=result.url,
    )
