-- Migration 078: Fix vw_sync_latest_status (broken, ref dropped attendance_sync_logs)
-- Recreate from attendance_import_batches (closest operational table)
-- Consumer: dashboard.routes.ts:27 /api/dashboard/sync-status

IF OBJECT_ID('dbo.vw_sync_latest_status', 'V') IS NOT NULL
  DROP VIEW dbo.vw_sync_latest_status;
GO

CREATE VIEW dbo.vw_sync_latest_status AS
WITH ranked AS (
  SELECT
    id,
    source        AS sync_type,
    source,
    machine_id,
    NULL          AS machine_code,  -- batches has machine_id only; code via JOIN if needed
    division_code,
    status,
    NULL          AS failure_category,
    started_at,
    finished_at,
    DATEDIFF(millisecond, started_at, finished_at) AS duration_ms,
    records_success AS records_synced,
    error_message,
    0             AS is_dry_run,
    ROW_NUMBER() OVER (PARTITION BY COALESCE(division_code, source) ORDER BY started_at DESC) AS rn
  FROM attendance_import_batches
)
SELECT
  id, sync_type, source, machine_id, machine_code, division_code, status,
  failure_category, started_at, finished_at, duration_ms, records_synced,
  error_message, is_dry_run
FROM ranked
WHERE rn = 1;
GO

-- Verify
SELECT TOP 3 * FROM vw_sync_latest_status ORDER BY started_at DESC;
