-- ============================================================================
-- ROLLBACK-CURRENT-EMPCODE.SQL
-- Rollback script for currentEmpCode implementation
-- WARNING: This will remove all currentEmpCode data and schema changes
-- RUN AT YOUR OWN RISK - Backup your data first!
-- ============================================================================

PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'ROLLBACK: currentEmpCode Implementation';
PRINT 'WARNING: This will remove all currentEmpCode data and schema changes';
PRINT 'Generated: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT '';

-- ============================================================================
-- SECTION 0: PRE-ROLLBACK CHECK
-- ============================================================================

PRINT '--- Pre-rollback Check ---';

-- Check if tables exist before proceeding
DECLARE @RegistryExists BIT = CASE WHEN EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'zkteco_absensi_user_registry'
) THEN 1 ELSE 0 END;

DECLARE @SnapshotExists BIT = CASE WHEN EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'hr_employee_current_snapshot'
) THEN 1 ELSE 0 END;

DECLARE @HistoryExists BIT = CASE WHEN EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'employee_code_history'
) THEN 1 ELSE 0 END;

PRINT 'Table existence check:';
PRINT '  zkteco_absensi_user_registry: ' + CASE WHEN @RegistryExists = 1 THEN 'EXISTS' ELSE 'NOT FOUND' END;
PRINT '  hr_employee_current_snapshot: ' + CASE WHEN @SnapshotExists = 1 THEN 'EXISTS' ELSE 'NOT FOUND' END;
PRINT '  employee_code_history: ' + CASE WHEN @HistoryExists = 1 THEN 'EXISTS' ELSE 'NOT FOUND' END;

-- ============================================================================
-- SECTION 1: BACKUP DATA (Optional - uncomment to create backup tables)
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 1: BACKUP DATA (Optional)';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- Creating backup tables (if not exist) ---';

-- Backup registry current_emp_code data
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'zkteco_absensi_user_registry_BACKUP')
BEGIN
    PRINT 'Backing up zkteco_absensi_user_registry data...';

    -- Create backup table with only the new columns
    SELECT TOP 0
        id,
        raw_device_user_id,
        parsed_employee_code,
        resolved_nik,
        current_emp_code,
        current_emp_name,
        current_hr_status,
        current_hr_loc_code,
        current_hr_create_date,
        current_hr_update_date,
        current_resolution_status,
        current_resolution_method,
        current_resolution_reason,
        current_resolved_at
    INTO dbo.zkteco_absensi_user_registry_BACKUP
    FROM dbo.zkteco_absensi_user_registry;

    -- Copy data
    INSERT INTO dbo.zkteco_absensi_user_registry_BACKUP
    SELECT
        id,
        raw_device_user_id,
        parsed_employee_code,
        resolved_nik,
        current_emp_code,
        current_emp_name,
        current_hr_status,
        current_hr_loc_code,
        current_hr_create_date,
        current_hr_update_date,
        current_resolution_status,
        current_resolution_method,
        current_resolution_reason,
        current_resolved_at
    FROM dbo.zkteco_absensi_user_registry
    WHERE resolved_nik IS NOT NULL
       OR current_emp_code IS NOT NULL
       OR current_resolution_status IS NOT NULL;

    PRINT 'Backup table dbo.zkteco_absensi_user_registry_BACKUP created with '
        + CAST((SELECT COUNT(*) FROM dbo.zkteco_absensi_user_registry_BACKUP) AS VARCHAR) + ' rows';
END
ELSE
BEGIN
    PRINT 'Backup table zkteco_absensi_user_registry_BACKUP already exists, skipping';
END

-- Backup scan logs current_emp_code data
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'attendance_scan_logs_BACKUP')
BEGIN
    PRINT 'Backing up attendance_scan_logs data...';

    SELECT TOP 0
        id,
        raw_device_user_id,
        parsed_employee_code,
        resolved_nik,
        current_emp_code
    INTO dbo.attendance_scan_logs_BACKUP
    FROM dbo.attendance_scan_logs;

    INSERT INTO dbo.attendance_scan_logs_BACKUP
    SELECT TOP 10000
        id,
        raw_device_user_id,
        parsed_employee_code,
        resolved_nik,
        current_emp_code
    FROM dbo.attendance_scan_logs
    WHERE resolved_nik IS NOT NULL OR current_emp_code IS NOT NULL;

    PRINT 'Backup table dbo.attendance_scan_logs_BACKUP created with '
        + CAST((SELECT COUNT(*) FROM dbo.attendance_scan_logs_BACKUP) AS VARCHAR) + ' rows';
END
ELSE
BEGIN
    PRINT 'Backup table attendance_scan_logs_BACKUP already exists, skipping';
END

-- Backup imports current_emp_code data
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'attendance_imports_BACKUP')
BEGIN
    PRINT 'Backing up attendance_imports data...';

    SELECT TOP 0
        id,
        employee_code,
        current_emp_code
    INTO dbo.attendance_imports_BACKUP
    FROM dbo.attendance_imports;

    INSERT INTO dbo.attendance_imports_BACKUP
    SELECT TOP 10000
        id,
        employee_code,
        current_emp_code
    FROM dbo.attendance_imports
    WHERE current_emp_code IS NOT NULL;

    PRINT 'Backup table dbo.attendance_imports_BACKUP created with '
        + CAST((SELECT COUNT(*) FROM dbo.attendance_imports_BACKUP) AS VARCHAR) + ' rows';
END
ELSE
BEGIN
    PRINT 'Backup table attendance_imports_BACKUP already exists, skipping';
END

-- ============================================================================
-- SECTION 2: CLEAR BACKFILL DATA FROM MAIN TABLES
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 2: Clear Backfill Data';
PRINT '═══════════════════════════════════════════════════════════════════════';

-- 2.1: Clear attendance_imports.current_emp_code
PRINT '';
PRINT '--- 2.1: Clearing attendance_imports.current_emp_code ---';

DECLARE @ImportsCleared INT = 0;
UPDATE dbo.attendance_imports
SET current_emp_code = NULL;
SET @ImportsCleared = @@ROWCOUNT;
PRINT 'Cleared current_emp_code from ' + CAST(@ImportsCleared AS VARCHAR) + ' attendance_imports rows';

-- 2.2: Clear attendance_scan_logs columns
PRINT '';
PRINT '--- 2.2: Clearing attendance_scan_logs columns ---';

DECLARE @ScanLogsCleared INT = 0;
UPDATE dbo.attendance_scan_logs
SET resolved_nik = NULL, current_emp_code = NULL;
SET @ScanLogsCleared = @@ROWCOUNT;
PRINT 'Cleared resolved_nik and current_emp_code from ' + CAST(@ScanLogsCleared AS VARCHAR) + ' scan_logs rows';

-- 2.3: Clear zkteco_absensi_user_registry columns (keep parsed_employee_code)
PRINT '';
PRINT '--- 2.3: Clearing zkteco_absensi_user_registry columns ---';

DECLARE @RegistryCleared INT = 0;
UPDATE dbo.zkteco_absensi_user_registry
SET
    resolved_nik = NULL,
    current_emp_code = NULL,
    current_emp_name = NULL,
    current_hr_status = NULL,
    current_hr_loc_code = NULL,
    current_hr_create_date = NULL,
    current_hr_update_date = NULL,
    current_resolution_status = NULL,
    current_resolution_method = NULL,
    current_resolution_reason = NULL,
    current_resolved_at = NULL;
SET @RegistryCleared = @@ROWCOUNT;
PRINT 'Cleared currentEmpCode columns from ' + CAST(@RegistryCleared AS VARCHAR) + ' registry rows';

-- 2.4: Clear employees.current_emp_code columns
PRINT '';
PRINT '--- 2.4: Clearing employees.current_emp_code columns ---';

DECLARE @EmployeesCleared INT = 0;
BEGIN TRY
    UPDATE dbo.employees
    SET
        resolved_nik = NULL,
        current_emp_code = NULL,
        current_mapping_status = NULL;
    SET @EmployeesCleared = @@ROWCOUNT;
    PRINT 'Cleared currentEmpCode columns from ' + CAST(@EmployeesCleared AS VARCHAR) + ' employee rows';
END TRY
BEGIN CATCH
    PRINT 'No employees columns to clear (may not exist)';
END CATCH

-- ============================================================================
-- SECTION 3: DROP NEW TABLES
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 3: Drop New Tables';
PRINT '═══════════════════════════════════════════════════════════════════════';

-- 3.1: Drop hr_employee_current_snapshot
PRINT '';
PRINT '--- 3.1: Dropping hr_employee_current_snapshot table ---';

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'hr_employee_current_snapshot')
BEGIN
    -- Check for foreign key constraints
    DECLARE @FKCount1 INT = (SELECT COUNT(*) FROM sys.foreign_keys
        WHERE referenced_object_id = OBJECT_ID('dbo.hr_employee_current_snapshot'));

    IF @FKCount1 > 0
    BEGIN
        PRINT 'WARNING: Found ' + CAST(@FKCount1 AS VARCHAR) + ' foreign key references. Dropping...';

        DECLARE @FKName1 NVARCHAR(256);
        DECLARE fk_cursor1 CURSOR FOR
        SELECT name FROM sys.foreign_keys
        WHERE referenced_object_id = OBJECT_ID('dbo.hr_employee_current_snapshot');

        OPEN fk_cursor1;
        FETCH NEXT FROM fk_cursor1 INTO @FKName1;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC('ALTER TABLE ' + @FKName1 + ' DROP CONSTRAINT ' + @FKName1);
            PRINT '  Dropped FK: ' + @FKName1;
            FETCH NEXT FROM fk_cursor1 INTO @FKName1;
        END
        CLOSE fk_cursor1;
        DEALLOCATE fk_cursor1;
    END

    DROP TABLE dbo.hr_employee_current_snapshot;
    PRINT 'Table hr_employee_current_snapshot dropped successfully';
END
ELSE
BEGIN
    PRINT 'Table hr_employee_current_snapshot does not exist, skipping';
END

-- 3.2: Drop employee_code_history
PRINT '';
PRINT '--- 3.2: Dropping employee_code_history table ---';

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'employee_code_history')
BEGIN
    -- Check for foreign key constraints
    DECLARE @FKCount2 INT = (SELECT COUNT(*) FROM sys.foreign_keys
        WHERE referenced_object_id = OBJECT_ID('dbo.employee_code_history'));

    IF @FKCount2 > 0
    BEGIN
        PRINT 'WARNING: Found ' + CAST(@FKCount2 AS VARCHAR) + ' foreign key references. Dropping...';

        DECLARE @FKName2 NVARCHAR(256);
        DECLARE fk_cursor2 CURSOR FOR
        SELECT name FROM sys.foreign_keys
        WHERE referenced_object_id = OBJECT_ID('dbo.employee_code_history');

        OPEN fk_cursor2;
        FETCH NEXT FROM fk_cursor2 INTO @FKName2;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC('ALTER TABLE ' + @FKName2 + ' DROP CONSTRAINT ' + @FKName2);
            PRINT '  Dropped FK: ' + @FKName2;
            FETCH NEXT FROM fk_cursor2 INTO @FKName2;
        END
        CLOSE fk_cursor2;
        DEALLOCATE fk_cursor2;
    END

    DROP TABLE dbo.employee_code_history;
    PRINT 'Table employee_code_history dropped successfully';
END
ELSE
BEGIN
    PRINT 'Table employee_code_history does not exist, skipping';
END

-- ============================================================================
-- SECTION 4: DROP COLUMNS FROM MAIN TABLES (Optional - commented out by default)
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 4: Drop Columns from Main Tables (Optional)';
PRINT 'NOTE: These are commented out to preserve schema compatibility';
PRINT 'Uncomment if you want to completely remove the columns';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- Skipping column drops (uncomment below to enable) ---';

-- NOTE: Dropping columns is optional and may break application code that expects these columns.
-- The columns can remain as NULL-able without data, which is the safer option.

/*
-- 4.1: Drop columns from attendance_imports
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'attendance_imports' AND COLUMN_NAME = 'current_emp_code')
BEGIN
    ALTER TABLE dbo.attendance_imports DROP COLUMN current_emp_code;
    PRINT 'Dropped column: attendance_imports.current_emp_code';
END

-- 4.2: Drop columns from attendance_scan_logs
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'attendance_scan_logs' AND COLUMN_NAME = 'resolved_nik')
BEGIN
    ALTER TABLE dbo.attendance_scan_logs DROP COLUMN resolved_nik;
    PRINT 'Dropped column: attendance_scan_logs.resolved_nik';
END

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'attendance_scan_logs' AND COLUMN_NAME = 'current_emp_code')
BEGIN
    ALTER TABLE dbo.attendance_scan_logs DROP COLUMN current_emp_code;
    PRINT 'Dropped column: attendance_scan_logs.current_emp_code';
END

-- 4.3: Drop columns from zkteco_absensi_user_registry
DECLARE @RegistryCols TABLE (col_name NVARCHAR(256));
INSERT INTO @RegistryCols VALUES ('resolved_nik'), ('current_emp_code'), ('current_emp_name'),
    ('current_hr_status'), ('current_hr_loc_code'), ('current_hr_create_date'),
    ('current_hr_update_date'), ('current_resolution_status'), ('current_resolution_method'),
    ('current_resolution_reason'), ('current_resolved_at');

DECLARE @col NVARCHAR(256);
DECLARE col_cursor CURSOR FOR SELECT col_name FROM @RegistryCols;
OPEN col_cursor;
FETCH NEXT FROM col_cursor INTO @col;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'zkteco_absensi_user_registry' AND COLUMN_NAME = @col)
    BEGIN
        DECLARE @sql NVARCHAR(500) = 'ALTER TABLE dbo.zkteco_absensi_user_registry DROP COLUMN ' + @col;
        EXEC sp_executesql @sql;
        PRINT 'Dropped column: zkteco_absensi_user_registry.' + @col;
    END
    FETCH NEXT FROM col_cursor INTO @col;
END
CLOSE col_cursor;
DEALLOCATE col_cursor;
*/

-- ============================================================================
-- SECTION 5: VERIFICATION
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 5: Verification';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- Verification: New tables should not exist ---';

SELECT
    TABLE_NAME,
    CASE WHEN TABLE_NAME IN ('hr_employee_current_snapshot', 'employee_code_history')
        THEN 'SHOULD NOT EXIST' ELSE 'OK' END AS status
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME IN ('hr_employee_current_snapshot', 'employee_code_history');

PRINT '';
PRINT '--- Verification: New columns should be NULL (if still exist) ---';

SELECT
    TABLE_NAME,
    COLUMN_NAME,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME IN (
    'resolved_nik', 'current_emp_code', 'current_resolution_status',
    'current_resolution_method', 'current_resolution_reason'
)
ORDER BY TABLE_NAME, COLUMN_NAME;

PRINT '';
PRINT '--- Verification: Data cleared from main tables ---';

DECLARE @ImportsWithCurrent INT, @ScanLogsWithCurrent INT, @RegistryWithCurrent INT;

SELECT @ImportsWithCurrent = COUNT(*) FROM dbo.attendance_imports WHERE current_emp_code IS NOT NULL;
SELECT @ScanLogsWithCurrent = COUNT(*) FROM dbo.attendance_scan_logs WHERE current_emp_code IS NOT NULL;
SELECT @RegistryWithCurrent = COUNT(*) FROM dbo.zkteco_absensi_user_registry WHERE current_emp_code IS NOT NULL;

PRINT 'attendance_imports with current_emp_code: ' + CAST(@ImportsWithCurrent AS VARCHAR);
PRINT 'attendance_scan_logs with current_emp_code: ' + CAST(@ScanLogsWithCurrent AS VARCHAR);
PRINT 'zkteco_absensi_user_registry with current_emp_code: ' + CAST(@RegistryWithCurrent AS VARCHAR);

IF @ImportsWithCurrent = 0 AND @ScanLogsWithCurrent = 0 AND @RegistryWithCurrent = 0
BEGIN
    PRINT 'VERIFICATION PASSED: All currentEmpCode data has been cleared';
END
ELSE
BEGIN
    PRINT 'WARNING: Some currentEmpCode data may remain. Review above counts.';
END

-- ============================================================================
-- SECTION 6: SUMMARY
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'ROLLBACK SUMMARY';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT 'Tables dropped:';
PRINT '  - hr_employee_current_snapshot' + CASE WHEN @SnapshotExists = 1 THEN ' (DROPPED)' ELSE ' (NOT FOUND)' END;
PRINT '  - employee_code_history' + CASE WHEN @HistoryExists = 1 THEN ' (DROPPED)' ELSE ' (NOT FOUND)' END;

PRINT '';
PRINT 'Backup tables created (data preserved):';
PRINT '  - zkteco_absensi_user_registry_BACKUP';
PRINT '  - attendance_scan_logs_BACKUP';
PRINT '  - attendance_imports_BACKUP';

PRINT '';
PRINT 'Data cleared from:';
PRINT '  - attendance_imports (current_emp_code)';
PRINT '  - attendance_scan_logs (resolved_nik, current_emp_code)';
PRINT '  - zkteco_absensi_user_registry (all current_* columns)';

PRINT '';
PRINT 'Columns preserved (set to NULL):';
PRINT '  - attendance_imports.current_emp_code';
PRINT '  - attendance_scan_logs.resolved_nik, current_emp_code';
PRINT '  - zkteco_absensi_user_registry (all current_* columns)';

PRINT '';
PRINT 'NOTE: Columns are preserved but set to NULL to maintain schema compatibility.';
PRINT '      To completely remove columns, run Section 4 after uncommenting.';
PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'ROLLBACK COMPLETED';
PRINT 'To restore, run migrations 047-052 and backfill scripts again.';
PRINT '═══════════════════════════════════════════════════════════════════════';
