"""Tests for the Iceberg-free units: synthetic batch schema, file parsing,
DuckDB query engine, and Parquet round-trip. These exercise the repo helpers
that do NOT require B2 credentials (catalog/append require live B2)."""

import io

import pyarrow.parquet as pq

from app.repo.iceberg_schema import (
    EVOLVE_COLUMN,
    arrow_schema,
    arrow_to_parquet_bytes,
    parse_file_to_arrow,
    synthetic_batch,
)
from app.repo.query_engine import run_sql


def test_synthetic_batch_matches_base_schema():
    table = synthetic_batch(10)
    assert table.num_rows == 10
    assert table.column_names == [
        "entity_id",
        "event_ts",
        "feature_a",
        "feature_b",
        "label",
        "ingested_at",
    ]
    # Timestamps are timezone-aware microsecond UTC (matches TimestamptzType).
    assert str(table.schema.field("event_ts").type) == "timestamp[us, tz=UTC]"


def test_synthetic_batch_with_evolved_column():
    table = synthetic_batch(5, with_evolved=True)
    assert EVOLVE_COLUMN in table.column_names
    assert table.num_rows == 5


def test_parse_csv_to_arrow_coerces_schema():
    csv_bytes = (
        b"entity_id,event_ts,feature_a,feature_b,label\n"
        b"e1,2026-01-01T00:00:00+00:00,1.5,2.5,1\n"
        b"e2,2026-01-02T00:00:00+00:00,3.5,4.5,0\n"
    )
    table = parse_file_to_arrow(csv_bytes, "batch.csv")
    assert table.num_rows == 2
    assert table.schema.equals(arrow_schema())
    rows = table.to_pylist()
    assert rows[0]["entity_id"] == "e1"
    assert rows[0]["feature_a"] == 1.5
    assert rows[0]["label"] == 1


def test_parse_json_list_to_arrow():
    json_bytes = b'[{"entity_id": "x", "feature_a": 9.0, "label": 1}]'
    table = parse_file_to_arrow(json_bytes, "batch.json")
    assert table.num_rows == 1
    assert table.to_pylist()[0]["feature_a"] == 9.0


def test_parquet_round_trip():
    table = synthetic_batch(7)
    data = arrow_to_parquet_bytes(table)
    back = pq.read_table(io.BytesIO(data))
    assert back.num_rows == 7
    assert back.column_names == table.column_names


def test_run_sql_default_select():
    table = synthetic_batch(20)
    result = run_sql(table, None, limit=5)
    assert result["row_count"] == 5
    assert "entity_id" in result["columns"]


def test_run_sql_aggregation_and_datetime_serialization():
    table = synthetic_batch(50)
    result = run_sql(table, "SELECT label, COUNT(*) AS n FROM t GROUP BY label")
    assert "label" in result["columns"]
    assert "n" in result["columns"]
    # Sanity: a SELECT * row serializes timestamps as ISO strings (JSON-safe).
    preview = run_sql(table, "SELECT * FROM t", limit=1)
    assert isinstance(preview["rows"][0]["event_ts"], str)
