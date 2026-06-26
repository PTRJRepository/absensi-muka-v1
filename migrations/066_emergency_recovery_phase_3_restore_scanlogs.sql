-- ============================================================
-- [PHASE 3] RESTORE RAW ATTENDANCE SCAN LOGS
-- ============================================================
-- Prerequisites: Phase 2 complete (machines + employees restored)
-- Duration: ~5-15 minutes (788k rows)
-- Risk: HIGH - large data insert
-- Recommendation: Run during low-traffic hours
-- ============================================================

PRINT '=== [PHASE 3] RESTORE RAW ATTENDANCE SCAN LOGS ===';

-- Verify prerequisites
DECLARE @pre_machines INT = (SELECT COUNT(*) FROM attendance_machines);
DECLARE @pre_employees INT = (SELECT COUNT(*) FROM employees);

PRINT '  Prerequisites check:';
PRINT '    attendance_machines rows: ' + CAST(@pre_machines AS VARCHAR);
PRINT '    employees rows: ' + CAST(@pre_employees AS VARCHAR);

IF @pre_machines = 0 OR @pre_employees = 0
BEGIN
    PRINT '';
    PRINT '  ABORT: Prerequisites not met. Run Phase 2 first.';
    PRINT '  machines=' + CAST(@pre_machines AS VARCHAR) + ', employees=' + CAST(@pre_employees AS VARCHAR);
    RETURN;
END

-- 3A.0: Fix FK constraint — insert dummy batch rows for missing sync_batch_ids
-- The FK fk_scan_logs_batch references attendance_import_batches(id)
-- Backup has 200+ batch IDs not present in the current batches table
PRINT '';
PRINT '  [3.0] Fixing FK constraint - inserting dummy batch rows...';
SET IDENTITY_INSERT attendance_import_batches ON;
INSERT INTO attendance_import_batches (id, batch_code, source, status, started_at, records_total, records_success, records_failed)
SELECT DISTINCT b.sync_batch_id,
    'RECOVERY_BATCH_' + CAST(b.sync_batch_id AS VARCHAR),
    'RECOVERY', 'RECOVERED', SYSDATETIME(),
    COUNT(*) OVER (PARTITION BY b.sync_batch_id),
    COUNT(*) OVER (PARTITION BY b.sync_batch_id), 0
FROM attendance_scan_logs_backup_20260623_233022 b
WHERE b.sync_batch_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM attendance_import_batches ib WHERE ib.id = b.sync_batch_id);
SET IDENTITY_INSERT attendance_import_batches OFF;
PRINT '  Inserted ' + CAST(@@ROWCOUNT AS VARCHAR) + ' dummy batch rows';

-- Check backup source
IF OBJECT_ID('attendance_scan_logs_backup_20260623_233022', 'U') IS NULL
BEGIN
    PRINT '';
    PRINT '  ERROR: attendance_scan_logs_backup_20260623_233022 NOT FOUND';
    PRINT '  Cannot proceed without backup source.';
    PRINT 'GO';
    RETURN;
END

-- Count backup rows
DECLARE @backup_cnt BIGINT = (SELECT COUNT(*) FROM attendance_scan_logs_backup_20260623_233022);
DECLARE @active_cnt BIGINT = (SELECT COUNT(*) FROM attendance_scan_logs);
PRINT '';
PRINT '  Backup source: attendance_scan_logs_backup_20260623_233022';
PRINT '  Backup rows: ' + CAST(@backup_cnt AS VARCHAR);
PRINT '  Active rows (before): ' + CAST(@active_cnt AS VARCHAR);

-- Preview sample
PRINT '';
PRINT '  [3.1] Sample from backup (first 5 rows):';
SELECT TOP 5
    id, machine_code, raw_device_user_id, parsed_employee_code,
    parsed_division_code, mapping_status, scan_time, scan_date
FROM attendance_scan_logs_backup_20260623_233022
ORDER BY id;

-- ============================================================
-- 3A: Restore scan_logs (IDENTITY_INSERT, WHERE NOT EXISTS)
-- ============================================================
PRINT '';
PRINT '  [3.2] Starting restore...';
PRINT '  NOTE: This may take 5-15 minutes for 788k rows. DO NOT CANCEL.';

DECLARE @start_restore DATETIME2 = SYSDATETIME();

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    SET IDENTITY_INSERT attendance_scan_logs ON;

    INSERT INTO attendance_scan_logs (
        id, machine_id, machine_code, raw_device_user_id, raw_user_sn,
        raw_record_time, raw_ip, parsed_employee_code, parsed_division_code,
        mapping_status, mapping_reason, scan_time, scan_date,
        event_type, verify_type, work_code, sync_batch_id, created_at
    )
    SELECT
        b.id, b.machine_id, b.machine_code, b.raw_device_user_id, b.raw_user_sn,
        b.raw_record_time, b.raw_ip, b.parsed_employee_code, b.parsed_division_code,
        b.mapping_status, b.mapping_reason, b.scan_time, b.scan_date,
        b.event_type, b.verify_type, b.work_code, b.sync_batch_id, b.created_at
    FROM attendance_scan_logs_backup_20260623_233022 b
    WHERE NOT EXISTS (
        SELECT 1 FROM attendance_scan_logs sl
        WHERE sl.id = b.id
    );

    DECLARE @rows_inserted INT = @@ROWCOUNT;

    SET IDENTITY_INSERT attendance_scan_logs OFF;

    COMMIT TRANSACTION;

    DECLARE @elapsed_ms INT = DATEDIFF(MILLISECOND, @start_restore, SYSDATETIME());
    PRINT '  RESTORE COMPLETE: ' + CAST(@rows_inserted AS VARCHAR) + ' rows inserted in ' + CAST(@elapsed_ms/1000 AS VARCHAR) + ' seconds.';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    SET IDENTITY_INSERT attendance_scan_logs OFF;
    PRINT '  ERROR during restore: ' + ERROR_MESSAGE();
    PRINT '  State: ' + CAST(ERROR_STATE() AS VARCHAR);
END CATCH

-- ============================================================
-- 3B: Validation
-- ============================================================
PRINT '';
PRINT '  [3.3] Post-restore validation:';

DECLARE @post_cnt BIGINT = (SELECT COUNT(*) FROM attendance_scan_logs);
PRINT '    attendance_scan_logs rows (after): ' + CAST(@post_cnt AS VARCHAR);

IF @post_cnt > 0
BEGIN
    -- Machine distribution
    PRINT '';
    PRINT '    [3.3.1] Machine distribution:';
    SELECT TOP 20 machine_code, COUNT(*) AS total_scans
    FROM attendance_scan_logs
    GROUP BY machine_code
    ORDER BY total_scans DESC;

    -- Mapping status distribution
    PRINT '';
    PRINT '    [3.3.2] Mapping status distribution:';
    SELECT mapping_status, COUNT(*) AS total
    FROM attendance_scan_logs
    GROUP BY mapping_status
    ORDER BY total DESC;

    -- Division distribution
    PRINT '';
    PRINT '    [3.3.3] Division distribution (from parsed_division_code):';
    SELECT parsed_division_code, COUNT(*) AS total
    FROM attendance_scan_logs
    GROUP BY parsed_division_code
    ORDER BY parsed_division_code;

    -- Date range
    PRINT '';
    PRINT '    [3.3.4] Date range:';
    SELECT MIN(scan_date) AS earliest_date, MAX(scan_date) AS latest_date,
           DATEDIFF(DAY, MIN(scan_date), MAX(scan_date)) AS day_span
    FROM attendance_scan_logs;

    -- B0193 sample
    PRINT '';
    PRINT '    [3.3.5] B0193 sample (from PRD test case):';
    SELECT TOP 10
        parsed_employee_code, scan_date, scan_time,
        MIN(scan_time) OVER (PARTITION BY parsed_employee_code, scan_date) AS check_in,
        MAX(scan_time) OVER (PARTITION BY parsed_employee_code, scan_date) AS check_out,
        COUNT(*) OVER (PARTITION BY parsed_employee_code, scan_date) AS scan_count
    FROM attendance_scan_logs
    WHERE parsed_employee_code = 'B0193'
    ORDER BY scan_date DESC;

    -- Sample with timezone issue (UTC date != WIB date)
    PRINT '';
    PRINT '    [3.3.6] Records where scan_date != DATE of scan_time (UTC vs WIB mismatch):';
    SELECT TOP 10
        id, machine_code, raw_device_user_id, parsed_employee_code,
        scan_time, scan_date,
        CONVERT(DATE, scan_time) AS scan_time_date_part,
        CASE WHEN CONVERT(DATE, scan_time) <> scan_date THEN 'MISMATCH' ELSE 'OK' END AS tz_status
    FROM attendance_scan_logs
    WHERE CONVERT(DATE, scan_time) <> scan_date
    ORDER BY scan_time DESC;
END
ELSE
BEGIN
    PRINT '    WARNING: attendance_scan_logs is EMPTY after restore.';
    PRINT '    Check: Did the backup table have data?';
END

PRINT '';
PRINT '[PHASE 3] COMPLETE. Verify: scan_logs rows restored, all divisions represented.';
PRINT 'GO';

