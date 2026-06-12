<!-- last_verified: 2026-06-12 -->
# Feature: Dashboard

## Purpose
Provide an at-a-glance overview of the Iceberg feature table on B2: current rows, snapshots, warehouse size, write-amplification ratio, schema version, a rows-over-snapshots growth chart, and recent activity.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /dashboard/stats`, `GET /dashboard/activity`

## Core Functions
- `apps/web/src/components/dashboard/stats-cards.tsx` — 4 stat cards (rows, snapshots, warehouse on B2, write amplification)
- `apps/web/src/components/dashboard/upload-chart.tsx` — `RowsOverSnapshotsChart` (cumulative rows at each commit)
- `apps/web/src/components/dashboard/recent-uploads-table.tsx` — `RecentActivityTable` (last 10 ops)
- `apps/web/src/lib/api-client.ts` — `getDashboardStats()`, `getDashboardActivity()`
- `services/api/app/runtime/dashboard.py` — `GET /dashboard/stats` + `/dashboard/activity` handlers
- `services/api/app/service/dashboard.py` — `get_dashboard_stats()`, `recent_activity()` business logic
- `services/api/app/repo/iceberg_history.py` — `table_stats()`, `list_snapshots()`, `current_logical_bytes()`
- `services/api/app/repo/b2_client.py` — `get_prefix_size("warehouse/")` for all-time warehouse bytes
- `services/api/app/repo/ops_log.py` — `get_recent_ops()` durable activity log

## Canonical Files
- Dashboard aggregation: `services/api/app/service/dashboard.py`
- Stat cards: `apps/web/src/components/dashboard/stats-cards.tsx`

## Inputs
- None (dashboard loads data automatically); `limit` query param on `/dashboard/activity` (1–50)

## Outputs
- `GET /dashboard/stats` → `DashboardStats` (table_exists, snapshot_count, current_total_rows, current_data_files, current_schema_id, warehouse_size_bytes/human, write_amplification, current_logical_bytes/human, growth[])
- `GET /dashboard/activity?limit=10` → `ActivityEntry[]` (ts, op, detail, snapshot_id, rows)

## Flow
- Page loads → parallel API calls (`stats`, `activity`)
- Stat cards: current rows + data files; snapshots + schema version; all-time warehouse size on B2; write-amplification ratio (all-time warehouse bytes ÷ current-snapshot logical bytes)
- Growth chart: cumulative `total_records` at each snapshot, oldest → newest
- Activity table: last 10 ops (ingest / evolve / query / export / rollback) with detail + timestamp
- A commit mutation (ingest/evolve/rollback) invalidates the dashboard queries so cards refresh

## Edge Cases
- No table yet → `table_exists: false`, zeros, empty chart/table states
- API unavailable → inline `ErrorState` with Retry (cards never render fake zeros on error)
- `current_logical_bytes == 0` → write amplification reported as `0.0x` (no divide-by-zero)
- Large warehouse → `get_prefix_size` paginates through all objects with `ContinuationToken`

## UX States
- Loading: skeleton placeholders for cards and table
- Empty: "No snapshots yet" / "No activity yet"
- Loaded: populated cards, growth chart, activity table

## Verification
- Test files: `services/api/tests/test_ingest_query.py` (unit), live B2 needed for full stats
- Required cases: stats with a table, stats with no table (zeros), activity log round-trip
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Snapshots & Time Travel](snapshots-time-travel.md)
- [App Workflows](../app-workflows.md)
