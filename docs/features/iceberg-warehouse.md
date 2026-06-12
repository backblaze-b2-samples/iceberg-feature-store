<!-- last_verified: 2026-06-12 -->
# Feature: Iceberg Warehouse on B2

## Purpose
Keep a versioned Apache Iceberg feature table — data files, manifests, and metadata — entirely on Backblaze B2, with only a tiny local SQLite pointer catalog and no warehouse server.

## Used By
- All Iceberg features (ingest, tables, query, dashboard) resolve against this catalog
- API: indirectly via `/ingest/*`, `/tables/*`, `/query/*`, `/dashboard/*`; `/health` checks catalog connectivity

## Core Functions
- `services/api/app/repo/iceberg_catalog.py` — `get_catalog()` (SqlCatalog with B2 S3 FileIO props), `ensure_table()`, `check_catalog_connectivity()`
- `services/api/app/config/settings.py` — `warehouse_uri`, `catalog_name`, `catalog_db_file`, `namespace`, `table_name`
- `services/api/app/repo/b2_client.py` — `get_prefix_size("warehouse/")` for warehouse byte totals

## Canonical Files
- Catalog wiring: `services/api/app/repo/iceberg_catalog.py`

## Inputs
- B2 credentials (`B2_*` env vars) — the only configuration this app needs

## Outputs
- A `SqlCatalog` whose pointer DB is `services/api/data/catalog.db` (gitignored)
- Iceberg objects on B2 under `warehouse/` (Parquet data, Avro manifests/lists, `metadata.json`)

## Flow
- `get_catalog()` validates B2 creds (fails fast with a clear message if missing), then constructs `SqlCatalog(uri="sqlite:///…", warehouse="s3://<bucket>/warehouse/", s3.endpoint/region/access-key-id/secret-access-key=…)`
- PyIceberg's default `PyArrowFileIO` performs all warehouse I/O against B2's S3 API
- The table is created lazily on first append (create-with-data); empty `create_table` doesn't round-trip on object stores

## Edge Cases
- Missing B2 creds → `get_catalog()` raises a clear RuntimeError; the catalog/append path fails fast (no silent local fallback)
- No conditional-PUT problem: commit atomicity is in SQLite, not S3, so no `AWS_S3_ALLOW_UNSAFE_RENAME` is needed (single-writer)
- Standard #2 deviation: PyIceberg's internal PyArrow S3 client has no UA override; the boto3 client is UA-tagged (`b2ai-iceberg-feature-store`). See ARCHITECTURE.md.

## Verification
- Test files: `services/api/tests/test_structure.py` (SDK containment), live B2 needed for catalog round-trip
- Required cases: catalog creation, append→read round-trip, time-travel scan, rollback (verified manually against B2 during the build)
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: structure tests green; with B2 creds, an append+read round-trips

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/RELIABILITY.md](../RELIABILITY.md)
