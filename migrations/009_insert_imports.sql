SET NOCOUNT ON;

-- Step 1: Clear attendance_imports
DELETE FROM attendance_imports;
DECLARE @del INT = @@ROWCOUNT;
PRINT 'Cleared ' + CAST(@del AS VARCHAR) + ' existing rows';

-- Step 2: Insert MAPPED records
PRINT '';
PRINT 'Inserting MAPPED records...';

DECLARE @t1 DATETIME = GETDATE();

INSERT INTO attendance_imports (
    employee_id, employee_code, division_code,
    attendance_date, attendance_year, attendance_month,
    check_in_at, check_out_at,
    attendance_status, has_work,
    source, source_reference, batch_id, needs_manual_review, raw_scan_log_id,
    gang_code, is_leave, is_sick, is_holiday, overtime_hours
)
SELECT
    e.id,
    grp.parsed_employee_code,
    ISNULL(d.division_code, grp.parsed_division_code),
    grp.scan_date,
    YEAR(grp.scan_date),
    MONTH(grp.scan_date),
    grp.first_scan,
    grp.last_scan,
    CASE WHEN grp.scan_count >= 2 THEN 'HADIR' ELSE 'TIDAK_HADIR' END,
    CASE WHEN grp.scan_count >= 2 THEN 1 ELSE 0 END,
    'ZKTECO',
    grp.machine_code,
    grp.sync_batch_id,
    0,
    grp.min_id,
    NULL, 0, 0, 0, 0.00
FROM (
    SELECT 
        s.parsed_employee_code, s.parsed_division_code,
        CAST(s.scan_date AS DATE) AS scan_date,
        s.machine_code, s.sync_batch_id,
        MIN(s.scan_time) AS first_scan, MAX(s.scan_time) AS last_scan,
        COUNT(*) AS scan_count, MIN(s.id) AS min_id
    FROM attendance_scan_logs s
    WHERE s.mapping_status = 'MAPPED'
    AND s.parsed_employee_code IS NOT NULL
    GROUP BY s.parsed_employee_code, s.parsed_division_code, CAST(s.scan_date AS DATE), s.machine_code, s.sync_batch_id
) grp
INNER JOIN employees e ON e.employee_code = grp.parsed_employee_code
LEFT JOIN divisions d ON d.id = e.division_id;

DECLARE @mapped INT = @@ROWCOUNT;
DECLARE @t2 DATETIME = GETDATE();
PRINT 'MAPPED inserted: ' + CAST(@mapped AS VARCHAR) + ' rows in ' + CAST(DATEDIFF(SECOND,@t1,@t2) AS VARCHAR) + 's';

-- Step 3: Insert NEED_REVIEW records
PRINT '';
PRINT 'Inserting NEED_REVIEW records...';

DECLARE @t3 DATETIME = GETDATE();

INSERT INTO attendance_imports (
    employee_id, employee_code, division_code,
    attendance_date, attendance_year, attendance_month,
    check_in_at, check_out_at,
    attendance_status, has_work,
    source, source_reference, batch_id, needs_manual_review, raw_scan_log_id,
    gang_code, is_leave, is_sick, is_holiday, overtime_hours
)
SELECT
    0,
    'MANUAL_' + grp.raw_device_user_id,
    ISNULL(d.division_code, 'MANUAL_REVIEW'),
    grp.scan_date,
    YEAR(grp.scan_date),
    MONTH(grp.scan_date),
    grp.first_scan,
    grp.last_scan,
    CASE WHEN grp.scan_count >= 2 THEN 'HADIR' ELSE 'TIDAK_HADIR' END,
    CASE WHEN grp.scan_count >= 2 THEN 1 ELSE 0 END,
    'ZKTECO',
    grp.machine_code,
    grp.sync_batch_id,
    1,
    grp.min_id,
    NULL, 0, 0, 0, 0.00
FROM (
    SELECT 
        s.raw_device_user_id, s.parsed_division_code,
        CAST(s.scan_date AS DATE) AS scan_date,
        s.machine_code, s.sync_batch_id,
        MIN(s.scan_time) AS first_scan, MAX(s.scan_time) AS last_scan,
        COUNT(*) AS scan_count, MIN(s.id) AS min_id
    FROM attendance_scan_logs s
    WHERE s.mapping_status = 'NEED_REVIEW'
    AND LEN(ISNULL(s.raw_device_user_id, '')) > 0
    GROUP BY s.raw_device_user_id, s.parsed_division_code, CAST(s.scan_date AS DATE), s.machine_code, s.sync_batch_id
) grp
LEFT JOIN divisions d ON d.division_code = grp.parsed_division_code;

DECLARE @nr INT = @@ROWCOUNT;
DECLARE @t4 DATETIME = GETDATE();
PRINT 'NEED_REVIEW inserted: ' + CAST(@nr AS VARCHAR) + ' rows in ' + CAST(DATEDIFF(SECOND,@t3,@t4) AS VARCHAR) + 's';

-- Step 4: Final Report
PRINT '';
PRINT '=== FINAL REPORT ===';
DECLARE @total INT, @hadir INT, @tdk INT, @rev INT, @emp INT, @mindt DATETIME, @maxdt DATETIME;
SELECT 
    @total = COUNT(*),
    @rev = SUM(CAST(needs_manual_review AS INT)),
    @hadir = SUM(CASE WHEN attendance_status = 'HADIR' THEN 1 ELSE 0 END),
    @tdk = SUM(CASE WHEN attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END),
    @emp = COUNT(DISTINCT employee_code),
    @mindt = MIN(CAST(attendance_date AS DATE)),
    @maxdt = MAX(CAST(attendance_date AS DATE))
FROM attendance_imports;

PRINT 'Total attendance_imports: ' + CAST(@total AS VARCHAR);
PRINT '  Hadir: ' + CAST(@hadir AS VARCHAR) + ' | Tidak Hadir: ' + CAST(@tdk AS VARCHAR);
PRINT '  Needs manual review: ' + CAST(@rev AS VARCHAR);
PRINT '  Unique employees: ' + CAST(@emp AS VARCHAR);
PRINT '  Date range: ' + CONVERT(VARCHAR, @mindt, 23) + ' to ' + CONVERT(VARCHAR, @maxdt, 23);
PRINT '';
PRINT 'Total time: ' + CAST(DATEDIFF(SECOND,@t1,@t4) AS VARCHAR) + 's';
GO
