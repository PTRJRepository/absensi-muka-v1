-- Migration: 057_add_zkteco_user_name_to_scan_logs.sql
-- Date: 2026-06-23
-- Purpose: Add zkteco_user_name column + UNIQUE dedup constraint to attendance_scan_logs
-- Why: Sync stores raw data only — name from machine needed for audit
-- Why: UNIQUE constraint guarantees no duplicate records at DB level

PRINT '=== Running migration 057: Add zkteco_user_name + UNIQUE dedup constraint ===';

-- Step 1: Add zkteco_user_name column if not exists
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND COLUMN_NAME = 'zkteco_user_name'
)
BEGIN
    ALTER TABLE dbo.attendance_scan_logs
    ADD zkteco_user_name NVARCHAR(150) NULL;

    PRINT '  [OK] Added zkteco_user_name (NVARCHAR(150), NULL) to attendance_scan_logs';
END
ELSE
BEGIN
    PRINT '  [SKIP] zkteco_user_name column already exists';
END

-- Step 2: Clean existing duplicates before adding UNIQUE constraint
DECLARE @dupCount INT;
WITH dupes AS (
    SELECT
        machine_code,
        raw_device_user_id,
        raw_record_time,
        MIN(id) AS keep_id
    FROM attendance_scan_logs
    GROUP BY machine_code, raw_device_user_id, raw_record_time
    HAVING COUNT(*) > 1
)
SELECT @dupCount = COUNT(*)
FROM dupes;

IF @dupCount > 0
BEGIN
    PRINT '  [WARN] Found ' + CAST(@dupCount AS NVARCHAR(20)) + ' duplicate groups in attendance_scan_logs';

    DELETE FROM a
    FROM attendance_scan_logs a
    INNER JOIN (
        SELECT machine_code, raw_device_user_id, raw_record_time, MIN(id) AS keep_id
        FROM attendance_scan_logs
        GROUP BY machine_code, raw_device_user_id, raw_record_time
        HAVING COUNT(*) > 1
    ) dup
        ON a.machine_code = dup.machine_code
       AND a.raw_device_user_id = dup.raw_device_user_id
       AND a.raw_record_time = dup.raw_record_time
    WHERE a.id > dup.keep_id;

    PRINT '  [OK] Removed duplicate rows, kept first occurrence per (machine_code, raw_device_user_id, raw_record_time)';
END
ELSE
BEGIN
    PRINT '  [OK] No duplicate rows found in attendance_scan_logs';
END

-- Step 3: Add UNIQUE constraint for deduplication guarantee
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND CONSTRAINT_TYPE = 'UNIQUE'
      AND CONSTRAINT_NAME = 'uq_scan_logs_dedup'
)
BEGIN
    ALTER TABLE dbo.attendance_scan_logs
    ADD CONSTRAINT uq_scan_logs_dedup UNIQUE (machine_code, raw_device_user_id, raw_record_time);

    PRINT '  [OK] Added UNIQUE constraint uq_scan_logs_dedup (machine_code, raw_device_user_id, raw_record_time)';
END
ELSE
BEGIN
    PRINT '  [SKIP] UNIQUE constraint uq_scan_logs_dedup already exists';
END

-- Step 4: Verify final state
PRINT '';
PRINT '=== Verification ===';
SELECT
    'zkteco_user_name column' AS check_item,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo'
              AND TABLE_NAME = 'attendance_scan_logs'
              AND COLUMN_NAME = 'zkteco_user_name'
        ) THEN 'EXISTS'
        ELSE 'MISSING'
    END AS status;

SELECT
    'uq_scan_logs_dedup constraint' AS check_item,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = 'dbo'
              AND TABLE_NAME = 'attendance_scan_logs'
              AND CONSTRAINT_NAME = 'uq_scan_logs_dedup'
        ) THEN 'EXISTS'
        ELSE 'MISSING'
    END AS status;

SELECT
    'attendance_scan_logs total rows' AS check_item,
    CAST(COUNT(*) AS NVARCHAR(20)) AS status
FROM attendance_scan_logs;

PRINT '';
PRINT '=== Migration 057 complete ===';
