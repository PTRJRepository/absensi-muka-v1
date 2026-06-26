-- ============================================================
-- [PHASE 4] SCHEMA VALIDATION & CREATE MACHINE_USER_RAW
-- ============================================================
-- Prerequisites: Phase 3 complete (scan_logs restored)
-- Duration: ~1 minute
-- ============================================================

PRINT '=== [PHASE 4] SCHEMA VALIDATION & MACHINE_USER_RAW ===';

-- ============================================================
-- 4A: Ensure machine_user_raw exists
-- ============================================================
PRINT '';
PRINT '  [4A] machine_user_raw table...';

IF OBJECT_ID('dbo.machine_user_raw', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.machine_user_raw (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        import_batch_id BIGINT NULL,
        machine_id INT NOT NULL,
        machine_code NVARCHAR(50) NOT NULL,
        machine_uid NVARCHAR(100) NULL,
        machine_user_id NVARCHAR(100) NOT NULL,
        user_name NVARCHAR(150) NULL,
        machine_raw_user_name NVARCHAR(150) NULL,
        role NVARCHAR(50) NULL,
        card_no NVARCHAR(100) NULL,
        password_exists BIT NULL,
        raw_payload NVARCHAR(MAX) NULL,
        first_seen_at DATETIME2 NULL,
        last_seen_at DATETIME2 NULL,
        imported_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        updated_at DATETIME2 NULL
    );
    PRINT '  Created: machine_user_raw';
END
ELSE
BEGIN
    PRINT '  Exists: machine_user_raw';
END

-- 4A.2: Create indexes if not exist
PRINT '';
PRINT '  [4A.2] Creating indexes...';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_machine_user_raw_machine_user')
BEGIN
    CREATE UNIQUE INDEX UQ_machine_user_raw_machine_user
    ON dbo.machine_user_raw(machine_id, machine_user_id);
    PRINT '  Created: UQ_machine_user_raw_machine_user';
END
ELSE
    PRINT '  Exists: UQ_machine_user_raw_machine_user';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_machine_user_raw_machine_code_user')
AND COL_LENGTH('machine_user_raw', 'machine_code') IS NOT NULL
BEGIN
    CREATE INDEX IX_machine_user_raw_machine_code_user
    ON dbo.machine_user_raw(machine_code, machine_user_id);
    PRINT '  Created: IX_machine_user_raw_machine_code_user';
END
ELSE IF COL_LENGTH('machine_user_raw', 'machine_code') IS NULL
    PRINT '  Skipped: IX_machine_user_raw_machine_code_user (machine_code column missing)';
ELSE
    PRINT '  Exists: IX_machine_user_raw_machine_code_user';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_machine_user_raw_user_name')
BEGIN
    CREATE INDEX IX_machine_user_raw_user_name
    ON dbo.machine_user_raw(user_name);
    PRINT '  Created: IX_machine_user_raw_user_name';
END
ELSE
    PRINT '  Exists: IX_machine_user_raw_user_name';

-- ============================================================
-- 4B: Ensure attendance_recovery_audit_log exists
-- ============================================================
PRINT '';
PRINT '  [4B] attendance_recovery_audit_log table...';

IF OBJECT_ID('attendance_recovery_audit_log', 'U') IS NULL
BEGIN
    CREATE TABLE attendance_recovery_audit_log (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        recovery_code NVARCHAR(100) NOT NULL,
        phase NVARCHAR(100) NOT NULL,
        action_name NVARCHAR(150) NOT NULL,
        status NVARCHAR(30) NOT NULL,
        records_affected INT NULL,
        message NVARCHAR(1000) NULL,
        executed_by NVARCHAR(100) NULL,
        started_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        completed_at DATETIME2 NULL
    );
    PRINT '  Created: attendance_recovery_audit_log';
END
ELSE
    PRINT '  Exists: attendance_recovery_audit_log';

-- ============================================================
-- 4C: Validate required columns on attendance_scan_logs
-- ============================================================
PRINT '';
PRINT '  [4C] Schema validation - attendance_scan_logs columns:';

DECLARE @required_cols TABLE(col_name NVARCHAR(100));
INSERT INTO @required_cols VALUES
    ('zkteco_user_name'), ('zkteco_user_name_source'),
    ('zkteco_user_name_sync_status'), ('zkteco_user_name_synced_at'),
    ('scan_time_original'), ('scan_date_original'),
    ('scan_time_wib'), ('scan_date_wib'),
    ('time_correction_status'), ('time_correction_offset_minutes'),
    ('time_corrected_at');

DECLARE @col NVARCHAR(100), @missing INT = 0;
DECLARE col_cursor CURSOR FOR SELECT col_name FROM @required_cols;
OPEN col_cursor; FETCH NEXT FROM col_cursor INTO @col;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF COL_LENGTH('attendance_scan_logs', @col) IS NULL
    BEGIN
        PRINT '  MISSING: ' + @col + ' - needs migration';
        SET @missing = 1;
    END
    ELSE
        PRINT '  OK: ' + @col;
    FETCH NEXT FROM col_cursor INTO @col;
END
CLOSE col_cursor; DEALLOCATE col_cursor;

IF @missing = 1
BEGIN
    PRINT '';
    PRINT '  ACTION REQUIRED: Run pending migrations (npm run db:migrate) to add missing columns.';
    PRINT '  Then re-run Phase 4 to verify.';
END

-- ============================================================
-- 4D: Check MachineTimeProfile
-- ============================================================
PRINT '';
PRINT '  [4D] Machine time profile...';

IF OBJECT_ID('attendance_machine_time_profile', 'U') IS NOT NULL
BEGIN
    DECLARE @profiles INT = (SELECT COUNT(*) FROM attendance_machine_time_profile);
    PRINT '  attendance_machine_time_profile: EXISTS (' + CAST(@profiles AS VARCHAR) + ' profiles)';

    IF @profiles = 0
    BEGIN
        PRINT '  No profiles. Creating default UTC profiles for all machines...';
        INSERT INTO attendance_machine_time_profile (machine_code, timezone_mode, offset_minutes, evidence_note, is_active, created_at)
        SELECT machine_code, 'UTC_SOURCE', 420, 'Default recovery profile', 1, GETDATE()
        FROM attendance_machines
        WHERE NOT EXISTS (
            SELECT 1 FROM attendance_machine_time_profile p
            WHERE p.machine_code = attendance_machines.machine_code
        );
        PRINT '  Created ' + CAST(@@ROWCOUNT AS VARCHAR) + ' default profiles';
    END

    PRINT '  Current profiles:';
    SELECT machine_code, timezone_mode, offset_minutes FROM attendance_machine_time_profile;
END
ELSE
BEGIN
    PRINT '  attendance_machine_time_profile: NOT FOUND (created by migration 059)';
    PRINT '  Run pending migrations first.';
END

PRINT '';
PRINT '[PHASE 4] COMPLETE.';
PRINT 'GO';

