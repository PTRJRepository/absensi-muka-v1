-- Migration: 059_add_zkteco_user_name_metadata.sql
-- Date: 2026-06-25
-- Purpose: Add metadata columns to attendance_scan_logs for user name sync tracking
-- Source: docs/ZKTECO-RAW-USER-SYNC-FIRST.md

PRINT '=== Running migration 059: Add zkteco_user_name metadata columns ===';

-- Step 1: Add zkteco_user_name_source
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND COLUMN_NAME = 'zkteco_user_name_source'
)
BEGIN
    ALTER TABLE dbo.attendance_scan_logs
    ADD zkteco_user_name_source NVARCHAR(30) NULL;
    PRINT '  [OK] Added zkteco_user_name_source NVARCHAR(30) NULL';
END
ELSE
BEGIN
    PRINT '  [SKIP] zkteco_user_name_source already exists';
END

-- Step 2: Add zkteco_user_name_synced_at
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND COLUMN_NAME = 'zkteco_user_name_synced_at'
)
BEGIN
    ALTER TABLE dbo.attendance_scan_logs
    ADD zkteco_user_name_synced_at DATETIME2 NULL;
    PRINT '  [OK] Added zkteco_user_name_synced_at DATETIME2 NULL';
END
ELSE
BEGIN
    PRINT '  [SKIP] zkteco_user_name_synced_at already exists';
END

-- Step 3: Add zkteco_user_name_sync_status
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND COLUMN_NAME = 'zkteco_user_name_sync_status'
)
BEGIN
    ALTER TABLE dbo.attendance_scan_logs
    ADD zkteco_user_name_sync_status NVARCHAR(30) NULL;
    PRINT '  [OK] Added zkteco_user_name_sync_status NVARCHAR(30) NULL';
END
ELSE
BEGIN
    PRINT '  [SKIP] zkteco_user_name_sync_status already exists';
END

-- Step 4: Add columns to machine_user_raw
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'machine_user_raw'
      AND COLUMN_NAME = 'first_seen_at'
)
BEGIN
    ALTER TABLE dbo.machine_user_raw ADD first_seen_at DATETIME2 NULL;
    PRINT '  [OK] Added first_seen_at to machine_user_raw';
END

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'machine_user_raw'
      AND COLUMN_NAME = 'last_seen_at'
)
BEGIN
    ALTER TABLE dbo.machine_user_raw ADD last_seen_at DATETIME2 NULL;
    PRINT '  [OK] Added last_seen_at to machine_user_raw';
END

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'machine_user_raw'
      AND COLUMN_NAME = 'machine_raw_user_name'
)
BEGIN
    ALTER TABLE dbo.machine_user_raw ADD machine_raw_user_name NVARCHAR(150) NULL;
    PRINT '  [OK] Added machine_raw_user_name to machine_user_raw';
END

-- Step 5: Create indexes on machine_user_raw
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_machine_user_raw_machine_code_user')
BEGIN
    CREATE INDEX IX_machine_user_raw_machine_code_user ON machine_user_raw(machine_code, machine_user_id);
    PRINT '  [OK] Created index IX_machine_user_raw_machine_code_user';
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_machine_user_raw_user_name')
BEGIN
    CREATE INDEX IX_machine_user_raw_user_name ON machine_user_raw(user_name);
    PRINT '  [OK] Created index IX_machine_user_raw_user_name';
END

-- Step 6: Verification
PRINT '';
PRINT '=== Verification ===';
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'attendance_scan_logs'
  AND COLUMN_NAME IN ('zkteco_user_name_source', 'zkteco_user_name_synced_at', 'zkteco_user_name_sync_status')
ORDER BY COLUMN_NAME;

PRINT '';
PRINT '=== Migration 059 complete ===';
