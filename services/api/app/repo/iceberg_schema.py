"""Iceberg + PyArrow schema definitions and Arrow batch builders.

All ``pyarrow`` schema construction, synthetic-batch generation, and
uploaded-file parsing live here so ``iceberg_catalog.py`` stays focused on
catalog/table operations. Both modules are part of the repo layer (external
SDKs confined here).
"""

import csv
import io
import json
import random
import uuid
from datetime import UTC, datetime, timedelta

import pyarrow as pa
import pyarrow.parquet as pq
from pyiceberg.schema import Schema
from pyiceberg.types import (
    DoubleType,
    IntegerType,
    NestedField,
    StringType,
    TimestamptzType,
)

# Iceberg table schema v1. Field IDs are explicit and stable — Iceberg tracks
# columns by ID, which is what makes schema evolution + time-travel safe.
SCHEMA_V1 = Schema(
    NestedField(1, "entity_id", StringType(), required=False),
    NestedField(2, "event_ts", TimestamptzType(), required=False),
    NestedField(3, "feature_a", DoubleType(), required=False),
    NestedField(4, "feature_b", DoubleType(), required=False),
    NestedField(5, "label", IntegerType(), required=False),
    NestedField(6, "ingested_at", TimestamptzType(), required=False),
)

# The schema-evolution demo adds this nullable column.
EVOLVE_COLUMN = "feature_c"

# PyArrow schema mirroring the Iceberg schema. Timestamps are timezone-aware
# microsecond UTC to match TimestamptzType and avoid cast errors on append.
_BASE_FIELDS = [
    pa.field("entity_id", pa.large_string()),
    pa.field("event_ts", pa.timestamp("us", tz="UTC")),
    pa.field("feature_a", pa.float64()),
    pa.field("feature_b", pa.float64()),
    pa.field("label", pa.int32()),
    pa.field("ingested_at", pa.timestamp("us", tz="UTC")),
]

_BASE_COLUMNS = [f.name for f in _BASE_FIELDS]


def arrow_schema(with_evolved: bool = False) -> pa.Schema:
    fields = list(_BASE_FIELDS)
    if with_evolved:
        fields.append(pa.field(EVOLVE_COLUMN, pa.float64()))
    return pa.schema(fields)


def synthetic_batch(rows: int, with_evolved: bool = False) -> pa.Table:
    """Generate a synthetic batch of feature rows (zero-setup demo)."""
    now = datetime.now(UTC)
    entity_ids = [f"entity_{uuid.uuid4().hex[:8]}" for _ in range(rows)]
    event_ts = [now - timedelta(minutes=random.randint(0, 10_000)) for _ in range(rows)]
    feature_a = [round(random.gauss(0.0, 1.0), 6) for _ in range(rows)]
    feature_b = [round(random.uniform(0.0, 100.0), 6) for _ in range(rows)]
    label = [random.randint(0, 1) for _ in range(rows)]
    ingested_at = [now] * rows
    data = {
        "entity_id": entity_ids,
        "event_ts": event_ts,
        "feature_a": feature_a,
        "feature_b": feature_b,
        "label": label,
        "ingested_at": ingested_at,
    }
    if with_evolved:
        data[EVOLVE_COLUMN] = [round(random.gauss(0.5, 0.25), 6) for _ in range(rows)]
    return pa.Table.from_pydict(data, schema=arrow_schema(with_evolved))


def _coerce_record(record: dict, with_evolved: bool) -> dict:
    """Coerce one raw record into the base feature schema (best-effort)."""
    now = datetime.now(UTC)

    def _num(value, default=0.0):
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    out = {
        "entity_id": str(record.get("entity_id") or f"entity_{uuid.uuid4().hex[:8]}"),
        "event_ts": _parse_ts(record.get("event_ts")) or now,
        "feature_a": _num(record.get("feature_a")),
        "feature_b": _num(record.get("feature_b")),
        "label": int(_num(record.get("label"), 0)),
        "ingested_at": now,
    }
    if with_evolved:
        out[EVOLVE_COLUMN] = _num(record.get(EVOLVE_COLUMN))
    return out


def _parse_ts(value) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value))
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except ValueError:
        return None


def parse_file_to_arrow(data: bytes, filename: str, with_evolved: bool = False) -> pa.Table:
    """Parse an uploaded CSV / JSON / Parquet file into the feature schema."""
    name = filename.lower()
    if name.endswith(".parquet"):
        table = pq.read_table(io.BytesIO(data))
        records = table.to_pylist()
    elif name.endswith(".json"):
        parsed = json.loads(data.decode("utf-8"))
        records = parsed if isinstance(parsed, list) else parsed.get("rows", [])
    elif name.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(data.decode("utf-8")))
        records = list(reader)
    else:
        raise ValueError(f"Unsupported file type for ingest: {filename}")

    if not records:
        raise ValueError("Uploaded file contained no rows")

    coerced = [_coerce_record(r, with_evolved) for r in records]
    return pa.Table.from_pylist(coerced, schema=arrow_schema(with_evolved))


def arrow_to_parquet_bytes(arrow_table: pa.Table) -> bytes:
    """Serialize an Arrow table to Parquet bytes (for the export/Derive step)."""
    buffer = io.BytesIO()
    pq.write_table(arrow_table, buffer)
    return buffer.getvalue()
