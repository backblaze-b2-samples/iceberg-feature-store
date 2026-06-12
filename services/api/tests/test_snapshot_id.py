"""Snapshot ids are 64-bit and must survive the JSON round-trip as strings.

A JavaScript ``Number`` is a float64 and silently rounds any integer above
2**53, which previously corrupted the id a rollback or time-travel query sent
back to the API ("Snapshot ... is not in this table's history"). The
``SnapshotId`` field type carries them as strings on the wire and coerces them
back to a precise int on the way in.
"""

import json

from app.types import IngestResponse, QueryRequest, ScanStats, SnapshotInfo, TableInfo

# Larger than 2**53 (9_007_199_254_740_992): float64 would round it.
BIG_ID = 371062506199945317
ROUNDED = int(float(BIG_ID))


def test_float64_would_corrupt_the_id():
    # Documents *why* the wire format must be a string, not a number.
    assert ROUNDED != BIG_ID


def _snapshot(**overrides) -> SnapshotInfo:
    base = dict(
        snapshot_id=BIG_ID,
        parent_id=None,
        committed_at="2026-06-12T00:00:00+00:00",
        operation="append",
        schema_id=0,
        added_records=1,
        added_data_files=1,
        total_records=1,
        total_data_files=1,
        is_current=True,
    )
    base.update(overrides)
    return SnapshotInfo(**base)


def test_snapshot_id_serializes_as_exact_string():
    payload = json.loads(_snapshot().model_dump_json())
    assert payload["snapshot_id"] == str(BIG_ID)  # full precision, as a string
    assert isinstance(payload["snapshot_id"], str)


def test_optional_snapshot_id_null_stays_null():
    payload = json.loads(_snapshot(parent_id=None).model_dump_json())
    assert payload["parent_id"] is None

    info = TableInfo(
        identifier="x",
        exists=False,
        current_schema_id=0,
        columns=[],
        snapshot_count=0,
        current_snapshot_id=None,
        total_rows=0,
        total_data_files=0,
        warehouse_uri="b2://bucket/warehouse",
    )
    assert json.loads(info.model_dump_json())["current_snapshot_id"] is None


def test_snapshot_id_accepts_string_input_and_coerces_to_int():
    # The frontend now sends the id back as a string (query scope, export).
    req = QueryRequest.model_validate({"snapshot_id": str(BIG_ID)})
    assert req.snapshot_id == BIG_ID  # precise int, not the rounded float

    stats = ScanStats.model_validate(
        {
            "snapshot_id": str(BIG_ID),
            "total_data_files": 1,
            "files_scanned": 1,
            "rows_read": 1,
        }
    )
    assert stats.snapshot_id == BIG_ID


def test_ingest_response_snapshot_id_is_a_string_on_the_wire():
    resp = IngestResponse(
        rows_appended=1,
        snapshot_id=BIG_ID,
        total_rows=1,
        total_data_files=1,
        source="synthetic",
    )
    assert json.loads(resp.model_dump_json())["snapshot_id"] == str(BIG_ID)
