-- ============================================================
-- [PHASE 1] BACKUP DISCOVERY & SCHEMA VALIDATION
-- ============================================================
-- STEP 1: Discover all backup tables
-- STEP 2: Validate backup row counts
-- STEP 3: Check active table schemas & identity columns
-- STEP 4: Confirm required columns exist
-- ============================================================

PRINT '=== [PHASE 1] BACKUP DISCOVERY & SCHEMA VALIDATION ===';

-- STEP 1: Discover backup tables
PRINT '';
PRINT '  [1.1] Backup tables found:';
SELECT
    t.name AS TABLE_NAME,
    SUM(p.rows) AS TABLE_ROWS
FROM sys.tables t
LEFT JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE t.name LIKE '%backup%'
GROUP BY t.name
ORDER BY t.name;

-- STEP 2: Validate critical backup counts (dynamic SQL to avoid compilation errors)
PRINT '';
PRINT '  [1.2] Critical backup counts:';

IF OBJECT_ID('attendance_scan_logs_backup_20260623_233022', 'U') IS NOT NULL
BEGIN
    DECLARE @scanlog_cnt BIGINT;
    EXEC sp_executesql N'SELECT @cnt = COUNT(*) FROM attendance_scan_logs_backup_20260623_233022', N'@cnt BIGINT OUTPUT', @cnt = @scanlog_cnt OUTPUT;
    PRINT '  attendance_scan_logs_backup_20260623_233022: EXISTS (' + CAST(@scanlog_cnt AS VARCHAR) + ' rows)';
END
ELSE
    PRINT '  attendance_scan_logs_backup_20260623_233022: NOT FOUND';

IF OBJECT_ID('employees_backup_20260623', 'U') IS NOT NULL
BEGIN
    DECLARE @emp_cnt BIGINT;
    EXEC sp_executesql N'SELECT @cnt = COUNT(*) FROM employees_backup_20260623', N'@cnt BIGINT OUTPUT', @cnt = @emp_cnt OUTPUT;
    PRINT '  employees_backup_20260623: EXISTS (' + CAST(@emp_cnt AS VARCHAR) + ' rows)';
END
ELSE
    PRINT '  employees_backup_20260623: NOT FOUND';

IF OBJECT_ID('attendance_machines_backup_20260623', 'U') IS NOT NULL
BEGIN
    DECLARE @mach_cnt BIGINT;
    EXEC sp_executesql N'SELECT @cnt = COUNT(*) FROM attendance_machines_backup_20260623', N'@cnt BIGINT OUTPUT', @cnt = @mach_cnt OUTPUT;
    PRINT '  attendance_machines_backup_20260623: EXISTS (' + CAST(@mach_cnt AS VARCHAR) + ' rows)';
END
ELSE
    PRINT '  attendance_machines_backup_20260623: NOT FOUND';

-- STEP 3: Active table row counts
PRINT '';
PRINT '  [1.3] Active table current counts:';
SELECT 'attendance_scan_logs' AS tbl, COUNT(*) AS cnt FROM attendance_scan_logs
UNION ALL SELECT 'attendance_imports', COUNT(*) FROM attendance_imports
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'attendance_machines', COUNT(*) FROM attendance_machines
UNION ALL SELECT 'attendance_import_batches', COUNT(*) FROM attendance_import_batches;

-- STEP 4: Validate required columns exist
PRINT '';
PRINT '  [1.4] Schema validation - attendance_scan_logs columns:';
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'attendance_scan_logs'
ORDER BY ORDINAL_POSITION;

-- STEP 5: Check if machine_user_raw exists
PRINT '';
PRINT '  [1.5] machine_user_raw table check:';
IF OBJECT_ID('machine_user_raw', 'U') IS NOT NULL
BEGIN
    PRINT '  machine_user_raw: EXISTS';
    DECLARE @raw_cnt BIGINT;
    EXEC sp_executesql N'SELECT @cnt = COUNT(*) FROM machine_user_raw', N'@cnt BIGINT OUTPUT', @cnt = @raw_cnt OUTPUT;
    PRINT '  machine_user_raw count: ' + CAST(@raw_cnt AS VARCHAR);
    EXEC sp_executesql N'
        SELECT TOP 5 r.machine_id, m.machine_code, COUNT(*) AS users
        FROM machine_user_raw r
        LEFT JOIN attendance_machines m ON m.id = r.machine_id
        GROUP BY r.machine_id, m.machine_code
        ORDER BY users DESC';
END
ELSE
BEGIN
    PRINT '  machine_user_raw: DOES NOT EXIST - will be created in Phase 4';
END

-- STEP 6: Check attendance_machine_time_profile
PRINT '';
PRINT '  [1.6] Machine time profile table check:';
IF OBJECT_ID('attendance_machine_time_profile', 'U') IS NOT NULL
BEGIN
    PRINT '  attendance_machine_time_profile: EXISTS';
    DECLARE @prof_cnt BIGINT;
    EXEC sp_executesql N'SELECT @cnt = COUNT(*) FROM attendance_machine_time_profile', N'@cnt BIGINT OUTPUT', @cnt = @prof_cnt OUTPUT;
    PRINT '  profile count: ' + CAST(@prof_cnt AS VARCHAR);
END
ELSE
BEGIN
    PRINT '  attendance_machine_time_profile: DOES NOT EXIST';
END

-- STEP 7: Check identity columns
PRINT '';
PRINT '  [1.7] Identity column check:';
SELECT TABLE_NAME, COLUMN_NAME, COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA+'.'+TABLE_NAME), COLUMN_NAME, 'IsIdentity') AS is_identity
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME IN ('attendance_scan_logs', 'attendance_imports', 'employees', 'attendance_machines', 'attendance_import_batches')
  AND COLUMN_NAME IN ('id', 'batch_id')
ORDER BY TABLE_NAME, COLUMN_NAME;

PRINT '';
PRINT '[PHASE 1] COMPLETE. Proceed to Phase 2 to restore master tables.';
PRINT 'GO';