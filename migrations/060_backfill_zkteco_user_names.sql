-- Migration: 060_backfill_zkteco_user_names.sql
-- Date: 2026-06-25
-- Purpose: Backfill zkteco_user_name from machine_user_raw for existing data
-- Source: docs/ZKTECO-RAW-USER-SYNC-FIRST.md

PRINT '=== Running migration 060: Backfill zkteco_user_name from machine_user_raw ===';

DECLARE @syncTime DATETIME2 = SYSDATETIME();

-- Step 1: Count records needing backfill
PRINT 'Records needing backfill: ' + CAST((
    SELECT COUNT(*) FROM attendance_scan_logs
    WHERE zkteco_user_name IS NULL OR LEN(LTRIM(RTRIM(zkteco_user_name))) = 0
) AS NVARCHAR(20));

-- Step 2: Fill from machine_user_raw
UPDATE sl SET
    sl.zkteco_user_name = LTRIM(RTRIM(r.user_name)),
    sl.zkteco_user_name_source = 'MACHINE_USER_RAW',
    sl.zkteco_user_name_synced_at = @syncTime,
    sl.zkteco_user_name_sync_status = 'FILLED'
FROM attendance_scan_logs sl
INNER JOIN machine_user_raw r ON r.machine_id = sl.machine_id AND r.machine_user_id = sl.raw_device_user_id
WHERE (sl.zkteco_user_name IS NULL OR LEN(LTRIM(RTRIM(sl.zkteco_user_name))) = 0)
  AND r.user_name IS NOT NULL AND LEN(LTRIM(RTRIM(r.user_name))) > 0;

PRINT 'Filled from machine_user_raw: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));

-- Step 3: Mark empty raw user names
UPDATE sl SET
    sl.zkteco_user_name_source = 'MACHINE_USER_RAW',
    sl.zkteco_user_name_sync_status = 'EMPTY_RAW_USER_NAME',
    sl.zkteco_user_name_synced_at = @syncTime
FROM attendance_scan_logs sl
INNER JOIN machine_user_raw r ON r.machine_id = sl.machine_id AND r.machine_user_id = sl.raw_device_user_id
WHERE (sl.zkteco_user_name IS NULL OR LEN(LTRIM(RTRIM(sl.zkteco_user_name))) = 0)
  AND (r.user_name IS NULL OR LEN(LTRIM(RTRIM(r.user_name))) = 0);

PRINT 'Marked EMPTY_RAW_USER_NAME: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));

-- Step 4: Mark no raw user
UPDATE sl SET
    sl.zkteco_user_name_source = 'UNKNOWN',
    sl.zkteco_user_name_sync_status = 'NO_RAW_USER',
    sl.zkteco_user_name_synced_at = @syncTime
FROM attendance_scan_logs sl
LEFT JOIN machine_user_raw r ON r.machine_id = sl.machine_id AND r.machine_user_id = sl.raw_device_user_id
WHERE (sl.zkteco_user_name IS NULL OR LEN(LTRIM(RTRIM(sl.zkteco_user_name))) = 0)
  AND r.id IS NULL;

PRINT 'Marked NO_RAW_USER: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));

-- Step 5: Mark pre-existing names
UPDATE sl SET
    sl.zkteco_user_name_source = 'ATTENDANCE_RECORD',
    sl.zkteco_user_name_synced_at = COALESCE(sl.zkteco_user_name_synced_at, @syncTime)
FROM attendance_scan_logs sl
WHERE zkteco_user_name IS NOT NULL AND LEN(LTRIM(RTRIM(zkteco_user_name))) > 0
  AND zkteco_user_name_source IS NULL;

PRINT 'Marked ATTENDANCE_RECORD: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));

-- Step 6: Verification
PRINT '';
PRINT '=== Verification ===';
SELECT zkteco_user_name_sync_status AS status, COUNT(*) AS total
FROM attendance_scan_logs WHERE zkteco_user_name_sync_status IS NOT NULL
GROUP BY zkteco_user_name_sync_status;

PRINT '';
PRINT 'Sample:';
SELECT TOP 5 sl.machine_code, sl.raw_device_user_id, sl.zkteco_user_name,
       sl.zkteco_user_name_source, sl.zkteco_user_name_sync_status
FROM attendance_scan_logs sl
WHERE zkteco_user_name_sync_status IS NOT NULL
ORDER BY sl.scan_time DESC;

PRINT '';
PRINT '=== Migration 060 complete ===';
