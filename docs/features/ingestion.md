<!-- last_verified: 2026-06-12 -->
# Feature: Batch Ingestion & Schema Evolution

## Purpose
Append a batch of feature rows to the Iceberg table (committing a new snapshot to B2), or evolve the schema by adding a nullable column with no rewrite.

## Used By
- UI: `/ingest` page (`apps/web/src/components/ingest/ingest-panel.tsx`)
- API: `POST /ingest/batch`, `POST /ingest/raw?key=…`, `POST /ingest/evolve-schema`

## Core Functions
- `services/api/app/service/ingest.py` — `ingest_synthetic()`, `ingest_raw_file()`, `evolve()`
- `services/api/app/repo/iceberg_schema.py` — `synthetic_batch()`, `parse_file_to_arrow()`, `arrow_schema()`
- `services/api/app/repo/iceberg_catalog.py` — `append_arrow()` (create-with-data on first append), `evolve_schema()`
- `apps/web/src/lib/queries.ts` — `useIngestBatch()`, `useIngestRawFile()`, `useEvolveSchema()`

## Canonical Files
- Ingest service: `services/api/app/service/ingest.py`

## Inputs
- `IngestRequest.rows` (synthetic batch size; defaults to `settings.default_batch_rows = 500`)
- `key` query param (a `raw/`-prefixed object to parse) for raw-file ingest
- None for evolve-schema

## Outputs
- `IngestResponse` (rows_appended, snapshot_id, total_rows, total_data_files, source) — and a new Iceberg snapshot on B2
- `EvolveResponse` (column_added=`feature_c`, new_schema_id, current_schema_id, already_present)
- Side effect: an entry appended to the ops log

## Flow
- **Synthetic**: generate N rows (timezone-aware microsecond timestamps) → Arrow batch → `append_arrow` commits a snapshot
- **Raw file**: read the `raw/` object from B2 → parse CSV/JSON/Parquet → coerce to the feature schema → `append_arrow`
- **Evolve**: `update_schema().add_column("feature_c", DoubleType(), required=False)` — Iceberg tracks columns by ID, so existing snapshots are untouched
- Each commit re-loads the table and reports running totals; new rows after an evolve carry `feature_c`

## Edge Cases
- Raw key not under `raw/` → 400; B2 read failure → 502
- Unsupported file type or empty file → 400
- Evolve before the table exists → 400 ("Ingest a batch first")
- Evolve when `feature_c` already present → returns `already_present: true` (idempotent, no-op)

## UX States
- Empty/idle: row-count input + Append button; raw-file picker (lists objects under `raw/`) + Ingest button; Evolve button
- Raw-file picker is disabled with an Upload-page hint when no `raw/` objects exist
- Loading: spinner on the active button
- Success/Error: toast with snapshot id + totals (raw-file toast names the source key), or the API error message

## Verification
- Test files: `services/api/tests/test_ingest_query.py` (synthetic batch schema, file parsing)
- Required cases: synthetic batch matches schema, evolved column present, CSV/JSON parsing coerces schema
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [README.md](../../README.md)
- [Iceberg Warehouse on B2](iceberg-warehouse.md)
- [Snapshots & Time Travel](snapshots-time-travel.md)
