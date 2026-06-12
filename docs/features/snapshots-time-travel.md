<!-- last_verified: 2026-06-12 -->
# Feature: Snapshots & Time Travel

## Purpose
Browse the Iceberg table's snapshot history and schema versions, roll the table pointer back to a prior snapshot, and inspect the raw `warehouse/` files on B2. This is the sample's warehouse-scoped asset explorer.

## Used By
- UI: `/tables` page (`apps/web/src/components/tables/`)
- API: `GET /tables`, `GET /tables/snapshots`, `GET /tables/schema`, `GET /tables/warehouse-files`, `POST /tables/rollback`

## Core Functions
- `services/api/app/service/tables.py` — `get_table_info()`, `get_snapshots()`, `get_schema_versions()`, `rollback()`, `list_warehouse_files()`
- `services/api/app/repo/iceberg_history.py` — `table_stats()`, `list_snapshots()`, `schema_versions()`
- `services/api/app/repo/iceberg_catalog.py` — `rollback_to()` (`manage_snapshots().set_current_snapshot().commit()`)
- `services/api/app/repo/b2_client.py` — `list_files("warehouse/")` for the warehouse-files sub-view
- `apps/web/src/components/tables/` — `tables-view`, `snapshots-table`, `schema-history`, `warehouse-files`

## Canonical Files
- Tables service: `services/api/app/service/tables.py`
- Snapshots + rollback UI: `apps/web/src/components/tables/snapshots-table.tsx`

## Inputs
- None for the read views; `snapshot_id` query param for rollback; `limit` for warehouse-files (1–10000)

## Outputs
- `TableInfo`, `SnapshotInfo[]` (newest first), `SchemaVersion[]`, `FileMetadata[]` (warehouse objects)
- Rollback returns the updated `TableInfo`; side effect: a `rollback` ops-log entry
- **Snapshot ids cross the API as strings.** Iceberg snapshot ids are 64-bit; a JS `Number` is float64 and rounds anything above 2**53, so the `SnapshotId` field type (`services/api/app/types/fields.py`) serializes them as strings and coerces them back to int on input. The frontend (`SnapshotInfo`, `TableInfo`, `QueryRequest`, …) types them as `string`.

## Flow
- Tables view loads `TableInfo`; if the table doesn't exist yet, shows a "no table" empty state
- Snapshots tab: per-snapshot id, operation, +rows, total rows, files, committed time, and a Roll back action (disabled for the current snapshot)
- Schema tab: each schema version's columns (field id, name, type, required), current flagged
- Warehouse files tab: lists `warehouse/` objects, classifying each by Iceberg role (data / manifest / snapshot / metadata)
- Rollback moves the table pointer to the chosen snapshot via a confirmation dialog; newer snapshots stay in history

## Edge Cases
- No table yet → empty state pointing to Ingest
- Rollback to a snapshot not in history → 400. (Before snapshot ids were carried as strings, *every* large id round-tripped through JS as a rounded float and hit this path — "Snapshot … is not in this table's history" even for a valid snapshot.)
- Rollback leaves superseded data files on B2 until expiration (orphan files; see RELIABILITY.md)
- Empty warehouse → empty state

## UX States
- Loading: skeletons
- Empty: "No snapshots yet" / "Warehouse is empty"
- Loaded: snapshot table, schema cards, warehouse file table
- Confirm: AlertDialog before rollback

## Verification
- Test files: `services/api/tests/test_snapshot_id.py` (64-bit id string round-trip — no B2 needed); live B2 needed for snapshot history; `services/api/tests/test_structure.py` for boundaries
- Required cases: snapshot list after appends, rollback changes current pointer, time-travel reads the old schema (verified manually against B2 during the build)
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: structure tests green; with B2 creds, rollback round-trips

## Related Docs
- [README.md](../../README.md)
- [Time-Travel Query & Export](query-export.md)
- [docs/RELIABILITY.md](../RELIABILITY.md)
