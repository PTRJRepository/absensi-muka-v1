SET NOCOUNT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '=== TRUNCATE attendance_imports ===';
    TRUNCATE TABLE attendance_imports;
    PRINT 'Truncated. Rows: ' + CAST((SELECT COUNT(*) FROM attendance_imports) AS VARCHAR);

    PRINT '';
    PRINT '=== INSERT MAPPED records ===';

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
            s.parsed_employee_code,
            s.parsed_division_code,
            CAST(s.scan_date AS DATE) AS scan_date,
            s.machine_code,
            s.sync_batch_id,
            MIN(s.scan_time) AS first_scan,
            MAX(s.scan_time) AS last_scan,
            COUNT(*) AS scan_count,
            MIN(s.id) AS min_id
        FROM attendance_scan_logs s
        WHERE s.mapping_status = 'MAPPED'
        AND s.parsed_employee_code IS NOT NULL
        GROUP BY s.parsed_employee_code, s.parsed_division_code, CAST(s.scan_date AS DATE), s.machine_code, s.sync_batch_id
    ) grp
    INNER JOIN employees e ON e.employee_code = grp.parsed_employee_code
    LEFT JOIN divisions d ON d.id = e.division_id;

    DECLARE @mapped_ins INT = @@ROWCOUNT;
    PRINT 'MAPPED inserted: ' + CAST(@mapped_ins AS VARCHAR);

    PRINT '';
    PRINT '=== INSERT NEED_REVIEW records ===';

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
            s.raw_device_user_id,
            s.parsed_division_code,
            CAST(s.scan_date AS DATE) AS scan_date,
            s.machine_code,
            s.sync_batch_id,
            MIN(s.scan_time) AS first_scan,
            MAX(s.scan_time) AS last_scan,
            COUNT(*) AS scan_count,
            MIN(s.id) AS min_id
        FROM attendance_scan_logs s
        WHERE s.mapping_status = 'NEED_REVIEW'
        AND LEN(ISNULL(s.raw_device_user_id, '')) > 0
        GROUP BY s.raw_device_user_id, s.parsed_division_code, CAST(s.scan_date AS DATE), s.machine_code, s.sync_batch_id
    ) grp
    LEFT JOIN divisions d ON d.division_code = grp.parsed_division_code;

    DECLARE @nr_ins INT = @@ROWCOUNT;
    PRINT 'NEED_REVIEW inserted: ' + CAST(@nr_ins AS VARCHAR);

    PRINT '';
    PRINT '=== FINAL REPORT ===';
    SELECT 
        COUNT(*) as grand_total,
        SUM(CASE WHEN needs_manual_review = 1 THEN 1 ELSE 0 END) as needs_review,
        SUM(CASE WHEN attendance_status = 'HADIR' THEN 1 ELSE 0 END) as hadir,
        SUM(CASE WHEN attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END) as tidak_hadir,
        COUNT(DISTINCT employee_code) as unique_employees,
        MIN(CAST(attendance_date AS DATE)) as from_date,
        MAX(CAST(attendance_date AS DATE)) as to_date
    FROM attendance_imports;

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '=== DONE - COMMITED ===';
END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    PRINT 'ERROR: ' + CAST(ERROR_NUMBER() AS VARCHAR) + ' - ' + ERROR_MESSAGE();
END CATCH;
