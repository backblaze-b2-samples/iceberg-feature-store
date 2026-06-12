"""Reusable annotated field types for the typed API boundary."""

from typing import Annotated

from pydantic import BeforeValidator, PlainSerializer


def _coerce_snapshot_id(v: object) -> object:
    """Accept an int or a numeric string; pass None through for optional fields."""
    if v is None or v == "":
        return None
    return int(v)


# Iceberg snapshot ids are random 64-bit integers. A JavaScript ``Number`` is a
# float64 and silently rounds any integer above 2**53, which corrupts the id on
# a JSON round-trip — a rollback would then target a snapshot that no longer
# matches ("Snapshot ... is not in this table's history"). We carry snapshot
# ids as strings on the wire and coerce them back to int on the way in. Inside
# Python (``model_dump()`` python mode) they stay ints, so the repo layer is
# unaffected.
SnapshotId = Annotated[
    int,
    BeforeValidator(_coerce_snapshot_id),
    PlainSerializer(str, return_type=str, when_used="json"),
]
