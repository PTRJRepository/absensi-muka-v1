-- ============================================================
-- [PHASE 5-8] ENRICH NAMES + TIMEZONE + REBUILD IMPORTS
-- Most critical phases
-- ============================================================
-- Prerequisites: Phase 4 complete
-- Duration: ~10-20 minutes total
-- Risk: HIGH - UPDATE and DELETE operations
-- ============================================================

PRINT '=== [PHASE 5-8] ENRICH + TIMEZONE + REBUILD IMPORTS ===';

-- Verify prerequisites
DECLARE @scanlogs INT = (SELECT COUNT(*) FROM attendance_scan_logs);
DECLARE @employees INT = (SELECT COUNT(*) FROM employees);
DECLARE @machines INT = (SELECT COUNT(*) FROM attendance_machines);

PRINT '  Prerequisites:';
PRINT '    scan_logs: ' + CAST(@scanlogs AS VARCHAR);
PRINT '    employees: ' + CAST(@employees AS VARCHAR);
PRINT '    machines: ' + CAST(@machines AS VARCHAR);

IF @scanlogs = 0
BEGIN
    PRINT '  ABORT: scan_logs empty. Run Phase 3 first.';
    PRINT 'GO'; RETURN;
END

-- ============================================================
-- [PHASE 5] BACKFILL zkteco_user_name from machine_user_raw
-- ============================================================
PRINT '';
PRINT '=== [PHASE 5] BACKFILL ZKTECO USER NAMES ===';

-- 5A: Enrich filled names
PRINT '';
PRINT '  [5A] Enriching names from machine_user_raw...';

BEGIN TRY
    UPDATE sl
    SET
        sl.zkteco_user_name = LTRIM(RTRIM(r.user_name)),
        sl.zkteco_user_name_source = 'MACHINE_USER_RAW',
        sl.zkteco_user_name_synced_at = SYSDATETIME(),
        sl.zkteco_user_name_sync_status = 'FILLED'
    FROM attendance_scan_logs sl
    INNER JOIN machine_user_raw r
        ON r.machine_id = sl.machine_id
       AND r.machine_user_id = sl.raw_device_user_id
    WHERE
        (sl.zkteco_user_name IS NULL OR LTRIM(RTRIM(sl.zkteco_user_name)) = '')
        AND r.user_name IS NOT NULL
        AND LEN(LTRIM(RTRIM(r.user_name))) > 0;

    DECLARE @filled INT = @@ROWCOUNT;
    PRINT '  FILLED: ' + CAST(@filled AS VARCHAR) + ' rows enriched from machine_user_raw';

    -- 5B: Mark missing raw user
    PRINT '';
    PRINT '  [5B] Marking NO_RAW_USER (no matching machine_user_raw)...';

    UPDATE sl
    SET
        sl.zkteco_user_name_sync_status = 'NO_RAW_USER',
        sl.zkteco_user_name_synced_at = SYSDATETIME()
    FROM attendance_scan_logs sl
    LEFT JOIN machine_user_raw r
        ON r.machine_id = sl.machine_id
       AND r.machine_user_id = sl.raw_device_user_id
    WHERE
        sl.zkteco_user_name_sync_status IS NULL
        AND r.machine_user_raw_id IS NULL;

    DECLARE @no_raw INT = @@ROWCOUNT;
    PRINT '  NO_RAW_USER: ' + CAST(@no_raw AS VARCHAR) + ' rows (no machine_user_raw match)';

    -- 5C: Detect conflicts (existing name differs from machine_user_raw)
    PRINT '';
    PRINT '  [5C] Detecting name conflicts...';

    UPDATE sl
    SET
        sl.zkteco_user_name_sync_status = 'CONFLICT',
        sl.zkteco_user_name_synced_at = SYSDATETIME()
    FROM attendance_scan_logs sl
    INNER JOIN machine_user_raw r
        ON r.machine_id = sl.machine_id
       AND r.machine_user_id = sl.raw_device_user_id
    WHERE
        sl.zkteco_user_name IS NOT NULL
        AND LTRIM(RTRIM(sl.zkteco_user_name)) <> ''
        AND r.user_name IS NOT NULL
        AND LTRIM(RTRIM(r.user_name)) <> ''
        AND LTRIM(RTRIM(sl.zkteco_user_name)) <> LTRIM(RTRIM(r.user_name))
        AND sl.zkteco_user_name_sync_status IS NULL;

    DECLARE @conflict INT = @@ROWCOUNT;
    PRINT '  CONFLICT: ' + CAST(@conflict AS VARCHAR) + ' rows';

END TRY
BEGIN CATCH
    PRINT '  ERROR during name enrichment: ' + ERROR_MESSAGE();
END CATCH

-- 5D: Validation
PRINT '';
PRINT '  [5D] Name enrichment summary:';
SELECT
    zkteco_user_name_sync_status AS sync_status,
    COUNT(*) AS total
FROM attendance_scan_logs
WHERE zkteco_user_name_sync_status IS NOT NULL
GROUP BY zkteco_user_name_sync_status
ORDER BY total DESC;

DECLARE @still_null INT = (SELECT COUNT(*) FROM attendance_scan_logs
    WHERE zkteco_user_name IS NULL OR LTRIM(RTRIM(zkteco_user_name)) = '');
PRINT '  Still without zkteco_user_name: ' + CAST(@still_null AS VARCHAR);

PRINT '';
PRINT '[PHASE 5] COMPLETE.';
PRINT 'GO';

-- ============================================================
-- [PHASE 6] TIMEZONE CORRECTION (UTC -> WIB)
-- ============================================================
PRINT '';
PRINT '=== [PHASE 6] TIMEZONE CORRECTION (UTC -> WIB) ===';

-- 6A: Preview
PRINT '';
PRINT '  [6A] Preview: UTC vs WIB mismatch (scan_date != DATE of scan_time):';
SELECT TOP 20
    machine_code,
    COUNT(*) AS mismatch_count,
    MIN(scan_time) AS earliest_mismatch,
    MAX(scan_time) AS latest_mismatch
FROM attendance_scan_logs
WHERE
    ISNULL(time_correction_status, '') NOT IN ('CORRECTED_UTC_TO_WIB', 'SKIPPED_WIB_ALREADY')
    AND CONVERT(DATE, scan_time) <> scan_date
GROUP BY machine_code
ORDER BY mismatch_count DESC;

-- 6B: Apply correction with idempotent guard
PRINT '';
PRINT '  [6B] Applying UTC->WIB correction...';

DECLARE @tz_before INT = (SELECT COUNT(*) FROM attendance_scan_logs
    WHERE ISNULL(time_correction_status, '') <> 'CORRECTED_UTC_TO_WIB');

PRINT '  Rows to correct: ' + CAST(@tz_before AS VARCHAR);
PRINT '  WARNING: This updates scan_time/scan_date by adding 7 hours (UTC->WIB).';

IF @tz_before > 0
BEGIN
    DECLARE @tz_start DATETIME2 = SYSDATETIME();

    UPDATE attendance_scan_logs
    SET
        scan_time_original = ISNULL(scan_time_original, scan_time),
        scan_date_original = ISNULL(scan_date_original, scan_date),
        scan_time_wib = DATEADD(HOUR, 7, scan_time),
        scan_date_wib = CONVERT(DATE, DATEADD(HOUR, 7, scan_time)),
        scan_time = DATEADD(HOUR, 7, scan_time),
        scan_date = CONVERT(DATE, DATEADD(HOUR, 7, scan_time)),
        time_correction_status = 'CORRECTED_UTC_TO_WIB',
        time_correction_offset_minutes = 420,
        time_corrected_at = SYSDATETIME()
    WHERE ISNULL(time_correction_status, '') NOT IN ('CORRECTED_UTC_TO_WIB', 'SKIPPED_WIB_ALREADY');

    DECLARE @tz_corrected INT = @@ROWCOUNT;
    DECLARE @tz_elapsed INT = DATEDIFF(SECOND, @tz_start, SYSDATETIME());
    PRINT '  CORRECTED: ' + CAST(@tz_corrected AS VARCHAR) + ' rows in ' + CAST(@tz_elapsed AS VARCHAR) + ' seconds';
END
ELSE
BEGIN
    PRINT '  No rows need correction (all already corrected or not UTC source)';
END

-- 6C: Validation
PRINT '';
PRINT '  [6C] Post-correction validation:';
DECLARE @tz_mismatch INT = (SELECT COUNT(*) FROM attendance_scan_logs
    WHERE CONVERT(DATE, scan_time) <> scan_date);
PRINT '  Rows where scan_date != DATE(scan_time): ' + CAST(@tz_mismatch AS VARCHAR);
IF @tz_mismatch = 0
    PRINT '  VALID: All scan_dates match their scan_times.';
ELSE
    PRINT '  WARNING: ' + CAST(@tz_mismatch AS VARCHAR) + ' mismatches remain - investigate.';

-- B0193 sample
PRINT '';
PRINT '  [6C.2] B0193 sample (PRD test case):';
SELECT TOP 10
    parsed_employee_code,
    scan_date,
    MIN(scan_time) OVER (PARTITION BY parsed_employee_code, scan_date) AS check_in_wib,
    MAX(scan_time) OVER (PARTITION BY parsed_employee_code, scan_date) AS check_out_wib,
    COUNT(*) OVER (PARTITION BY parsed_employee_code, scan_date) AS scan_count
FROM attendance_scan_logs
WHERE parsed_employee_code = 'B0193'
ORDER BY scan_date DESC;

PRINT '';
PRINT '[PHASE 6] COMPLETE.';
PRINT 'GO';

-- ============================================================
-- [PHASE 7] REBUILD ATTENDANCE_IMPORTS (ALL DIVISIONS)
-- ============================================================
PRINT '';
PRINT '=== [PHASE 7] REBUILD ATTENDANCE_IMPORTS (ALL DIVISIONS) ===';

-- 7A: Backup current imports
PRINT '';
PRINT '  [7A] Backup current imports...';

IF OBJECT_ID('attendance_imports_backup_before_rebuild_20260625', 'U') IS NULL
BEGIN
    SELECT GETDATE() AS backup_time, * INTO attendance_imports_backup_before_rebuild_20260625 FROM attendance_imports;
    DECLARE @backup_cnt INT = (SELECT COUNT(*) FROM attendance_imports_backup_before_rebuild_20260625);
    PRINT '  Backed up ' + CAST(@backup_cnt AS VARCHAR) + ' rows';
END
ELSE
    PRINT '  Backup already exists - skipping backup (already backed up)';

-- 7B: Check preconditions
PRINT '';
PRINT '  [7B] Preconditions:';
DECLARE @mapped INT = (SELECT COUNT(*) FROM attendance_scan_logs WHERE mapping_status = 'MAPPED');
DECLARE @parsed INT = (SELECT COUNT(*) FROM attendance_scan_logs WHERE parsed_employee_code IS NOT NULL);
PRINT '  Mapped scan_logs: ' + CAST(@mapped AS VARCHAR);
PRINT '  Parsed employee codes: ' + CAST(@parsed AS VARCHAR);
PRINT '  Employees in table: ' + CAST(@employees AS VARCHAR);

-- 7C: Delete existing imports
PRINT '';
PRINT '  [7C] Clearing attendance_imports...';
DELETE FROM attendance_imports;
PRINT '  Cleared attendance_imports';

-- 7D: Rebuild for all employees (NO G-ONLY FILTER)
PRINT '';
PRINT '  [7D] Rebuilding attendance_imports for ALL divisions...';

DECLARE @rebuild_start DATETIME2 = SYSDATETIME();

-- The key: GROUP BY parsed_employee_code + scan_date (NOT machine_code)
-- This gives ONE row per employee per day across ALL machines they scanned
INSERT INTO attendance_imports (
    employee_id, employee_code, division_code, gang_code,
    attendance_date, attendance_year, attendance_month,
    check_in_at, check_out_at, attendance_status,
    has_work, is_leave, is_sick, is_holiday, overtime_hours,
    source, source_reference, batch_id, raw_scan_log_id,
    created_at, needs_manual_review
)
SELECT
    e.id AS employee_id,
    e.employee_code,
    LEFT(e.employee_code, 1) AS division_code,
    NULL AS gang_code,
    x.attendance_date,
    YEAR(x.attendance_date) AS attendance_year,
    MONTH(x.attendance_date) AS attendance_month,
    x.check_in_at,
    x.check_out_at,
    CASE
        WHEN x.scan_count >= 2 THEN 'HADIR'
        WHEN x.scan_count = 1 THEN 'INCOMPLETE_SCAN'
        ELSE 'TIDAK_HADIR'
    END AS attendance_status,
    0 AS has_work,
    0 AS is_leave,
    0 AS is_sick,
    0 AS is_holiday,
    0 AS overtime_hours,
    'ZKTECO' AS source,
    x.machine_code AS source_reference,
    x.sync_batch_id AS batch_id,
    x.first_raw_scan_log_id AS raw_scan_log_id,
    SYSDATETIME() AS created_at,
    CASE WHEN x.scan_count = 1 THEN 1 ELSE 0 END AS needs_manual_review
FROM (
    SELECT
        -- Key change: group by parsed_employee_code + attendance_date ONLY
        -- This aggregates across ALL machines for same employee on same day
        parsed_employee_code,
        scan_date AS attendance_date,
        MIN(scan_time) AS check_in_at,
        MAX(scan_time) AS check_out_at,
        COUNT(*) AS scan_count,
        MIN(machine_code) AS machine_code,
        MIN(id) AS first_raw_scan_log_id,
        MIN(sync_batch_id) AS sync_batch_id
    FROM attendance_scan_logs
    WHERE mapping_status = 'MAPPED'
      AND parsed_employee_code IS NOT NULL
      AND scan_date IS NOT NULL
    GROUP BY
        parsed_employee_code,
        scan_date
) x
INNER JOIN employees e
    ON e.employee_code = x.parsed_employee_code;

DECLARE @rebuilt INT = @@ROWCOUNT;
DECLARE @rebuild_elapsed INT = DATEDIFF(SECOND, @rebuild_start, SYSDATETIME());
PRINT '  REBUILT: ' + CAST(@rebuilt AS VARCHAR) + ' attendance_imports rows in ' + CAST(@rebuild_elapsed AS VARCHAR) + ' seconds';

-- 7E: Validation - division distribution
PRINT '';
PRINT '  [7E] Post-rebuild validation:';

SELECT
    LEFT(employee_code, 1) AS division_code,
    COUNT(*) AS total_imports,
    COUNT(DISTINCT employee_code) AS total_employees
FROM attendance_imports
GROUP BY LEFT(employee_code, 1)
ORDER BY division_code;

-- Status distribution
PRINT '';
PRINT '  [7E.2] Attendance status distribution:';
SELECT attendance_status, COUNT(*) AS total, COUNT(DISTINCT employee_code) AS employees
FROM attendance_imports
GROUP BY attendance_status
ORDER BY total DESC;

-- Sample: B0193 attendance
PRINT '';
PRINT '  [7E.3] B0193 attendance (PRD sample):';
SELECT
    attendance_date,
    check_in_at,
    check_out_at,
    attendance_status,
    division_code
FROM attendance_imports
WHERE employee_code = 'B0193'
ORDER BY attendance_date DESC;

-- Check for G-only
DECLARE @g_only INT = (SELECT COUNT(DISTINCT LEFT(employee_code, 1)) FROM attendance_imports);
IF @g_only = 1
BEGIN
    DECLARE @first_div CHAR(1) = (SELECT TOP 1 LEFT(employee_code, 1) FROM attendance_imports);
    PRINT '';
    PRINT '  WARNING: Only 1 division in imports: ' + @first_div;
    PRINT '  Check: Are employees table populated for all divisions?';
    PRINT '  employees division distribution:';
    SELECT LEFT(employee_code, 1) AS div, COUNT(*) AS cnt FROM employees GROUP BY LEFT(employee_code, 1) ORDER BY div;
END
ELSE
BEGIN
    PRINT '';
    PRINT '  SUCCESS: Multiple divisions in attendance_imports (' + CAST(@g_only AS VARCHAR) + ' divisions).';
END

PRINT '';
PRINT '[PHASE 7] COMPLETE.';
PRINT 'GO';

-- ============================================================
-- [PHASE 8] VALIDATION SUMMARY
-- ============================================================
PRINT '';
PRINT '=== [PHASE 8] FINAL VALIDATION SUMMARY ===';

PRINT '';
PRINT '  AC-001 scan_logs restored:       ' + CAST(@scanlogs AS VARCHAR) + ' rows';
PRINT '  AC-002 employees restored:        ' + CAST(@employees AS VARCHAR) + ' rows';
PRINT '  AC-003 machines restored:         ' + CAST(@machines AS VARCHAR) + ' rows';
PRINT '  AC-004 machine_user_raw:         ' + CAST((SELECT COUNT(*) FROM machine_user_raw) AS VARCHAR) + ' rows';
PRINT '  AC-005 zkteco_user_name filled:  ' + CAST((SELECT COUNT(*) FROM attendance_scan_logs WHERE zkteco_user_name_sync_status = 'FILLED') AS VARCHAR) + ' rows';
PRINT '  AC-006 timezone corrected:       ' + CAST((SELECT COUNT(*) FROM attendance_scan_logs WHERE time_correction_status = 'CORRECTED_UTC_TO_WIB') AS VARCHAR) + ' rows';
PRINT '  AC-007 attendance_imports:       ' + CAST((SELECT COUNT(*) FROM attendance_imports) AS VARCHAR) + ' rows';
PRINT '  AC-008 divisions in imports:     ' + CAST(@g_only AS VARCHAR) + ' divisions';

PRINT '';
PRINT '  [8.1] Quick health check - top 10 employees by scan count:';
SELECT TOP 10
    employee_code,
    COUNT(*) AS attendance_days,
    SUM(CASE WHEN attendance_status = 'HADIR' THEN 1 ELSE 0 END) AS hadir,
    SUM(CASE WHEN attendance_status = 'INCOMPLETE_SCAN' THEN 1 ELSE 0 END) AS incomplete,
    SUM(CASE WHEN attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END) AS tidak_hadir
FROM attendance_imports
GROUP BY employee_code
ORDER BY attendance_days DESC;

PRINT '';
PRINT '=== ALL PHASES COMPLETE ===';
PRINT 'Next: Phase 9 (Backend Hardening), Phase 10 (API/Frontend Validation), Phase 11 (Re-enable Scheduler)';
PRINT 'GO';

