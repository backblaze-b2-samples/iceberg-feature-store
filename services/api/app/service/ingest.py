"""Ingest service — append batches to the Iceberg feature table.

Two paths, both committing a new Iceberg snapshot to B2:
  * synthetic batch — generate N feature rows (zero-setup demo)
  * raw file       — parse a previously uploaded CSV/JSON/Parquet under raw/

Plus a schema-evolution action (add the nullable ``feature_c`` column). Every
action is recorded in the ops log for the dashboard's recent-activity table.
"""

import logging

from app.config import settings
from app.repo import (
    EVOLVE_COLUMN,
    append_arrow,
    evolve_schema,
    get_object_bytes,
    log_op,
    parse_file_to_arrow,
    synthetic_batch,
    table_stats,
)
from app.types import EvolveResponse, IngestResponse

logger = logging.getLogger(__name__)


class IngestError(Exception):
    """Raised when an ingest request is invalid."""

    def __init__(self, detail: str, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def _has_evolved_column() -> bool:
    stats = table_stats()
    return any(c["name"] == EVOLVE_COLUMN for c in stats["columns"])


def ingest_synthetic(rows: int | None) -> IngestResponse:
    """Append a synthetic batch and commit a new snapshot."""
    n = rows or settings.default_batch_rows
    batch = synthetic_batch(n, with_evolved=_has_evolved_column())
    commit = append_arrow(batch)
    log_op("ingest", f"synthetic batch ({n} rows)", commit["snapshot_id"], n)
    return IngestResponse(
        rows_appended=n,
        snapshot_id=commit["snapshot_id"],
        total_rows=commit["total_rows"],
        total_data_files=commit["total_data_files"],
        source="synthetic",
    )


def ingest_raw_file(key: str) -> IngestResponse:
    """Parse a raw/ file already on B2 into the feature schema and append it."""
    if not key.startswith(settings.raw_prefix):
        raise IngestError(
            f"Ingest source must be under '{settings.raw_prefix}'. Got: {key}"
        )
    try:
        data = get_object_bytes(key)
    except RuntimeError as e:
        raise IngestError(f"Could not read '{key}' from B2: {e}", status_code=502) from e
    try:
        batch = parse_file_to_arrow(data, key, with_evolved=_has_evolved_column())
    except ValueError as e:
        raise IngestError(str(e)) from e
    commit = append_arrow(batch)
    log_op("ingest", f"raw file {key} ({batch.num_rows} rows)", commit["snapshot_id"], batch.num_rows)
    return IngestResponse(
        rows_appended=batch.num_rows,
        snapshot_id=commit["snapshot_id"],
        total_rows=commit["total_rows"],
        total_data_files=commit["total_data_files"],
        source=f"raw:{key}",
    )


def evolve() -> EvolveResponse:
    """Add the nullable ``feature_c`` column (schema-evolution demo)."""
    try:
        result = evolve_schema()
    except RuntimeError as e:
        raise IngestError(str(e)) from e
    if not result["already_present"]:
        log_op("evolve", f"added column {EVOLVE_COLUMN}", None, None)
    return EvolveResponse(
        column_added=EVOLVE_COLUMN,
        new_schema_id=result["new_schema_id"],
        current_schema_id=result["current_schema_id"],
        already_present=result["already_present"],
    )
