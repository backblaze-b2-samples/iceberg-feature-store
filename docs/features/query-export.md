<!-- last_verified: 2026-06-12 -->
# Feature: Time-Travel Query & Export

## Purpose
Run a time-travel query against the feature table — PyIceberg prunes files and reads only the needed Parquet from B2, DuckDB runs SQL in-memory — and export the result as a new Parquet slice on B2 (the Derive step).

## Used By
- UI: `/query` page (`apps/web/src/components/query/query-panel.tsx`, `query-results.tsx`)
- API: `POST /query`, `POST /query/export`

## Core Functions
- `services/api/app/service/query.py` — `run_query()`, `export_slice()`
- `services/api/app/repo/iceberg_catalog.py` — `scan()` (resolves snapshot/as-of, prunes via `plan_files`, returns Arrow + scan stats)
- `services/api/app/repo/query_engine.py` — `run_sql()` (DuckDB over the Arrow table aliased `t`)
- `services/api/app/repo/iceberg_schema.py` — `arrow_to_parquet_bytes()`
- `services/api/app/repo/b2_client.py` — `upload_file()` writes the export to `exports/` (UA-tagged)

## Canonical Files
- Query/export service: `services/api/app/service/query.py`
- DuckDB engine: `services/api/app/repo/query_engine.py`

## Inputs
- `QueryRequest` (snapshot_id | as_of_timestamp, optional row_filter, optional sql, limit)
- `ExportRequest` (snapshot_id | as_of_timestamp, optional row_filter, optional columns)

## Outputs
- `QueryResult` (columns, rows, row_count, scan_stats: files_scanned / total_data_files / rows_read)
- `ExportResponse` (key, rows_exported, size_bytes/human, snapshot_id, url) — and a new Parquet under `exports/` on B2
- Side effect: a `query` / `export` ops-log entry

## Flow
- Resolve the scan: explicit `snapshot_id`, or the latest snapshot `<=` `as_of_timestamp`, or current
- PyIceberg `plan_files()` prunes data files; `to_arrow()` reads only those Parquet files from B2 into an Arrow table
- DuckDB registers the Arrow table as `t` and runs the SQL (default `SELECT * FROM t`); a `LIMIT` is appended if absent
- Timestamps in results are serialized as ISO strings (JSON-safe)
- Export: scan with optional column projection → Parquet bytes → `put_object` to `exports/slice_<ts>.parquet`

## Edge Cases
- Both `snapshot_id` and `as_of_timestamp` set → 400
- Scan failure (bad filter, B2 error) → 502; invalid SQL → 400 with the DuckDB message
- Export producing 0 rows → 400 (nothing to write)
- No table yet → scan returns an empty Arrow table and zeroed stats

## UX States
- Idle: snapshot select + row filter + SQL textarea + Run / Export buttons
- Loading: spinner on the active button
- Results: scan-stats summary + a scrollable results table
- Error: toast with the API message

## Verification
- Test files: `services/api/tests/test_ingest_query.py` (DuckDB run_sql, datetime serialization, Parquet round-trip)
- Required cases: default select, aggregation, datetime serialization, Parquet round-trip; live B2 for full scan/export
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [README.md](../../README.md)
- [Snapshots & Time Travel](snapshots-time-travel.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
