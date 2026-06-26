-- ============================================================================
-- VALIDATE-CURRENT-EMPCODE.SQL
-- Comprehensive SQL validation script for currentEmpCode implementation
-- Run in SQL Server Management Studio (SSMS) or via sqlcmd
-- ============================================================================

PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'CURRENT EMPCODE IMPLEMENTATION VALIDATION';
PRINT 'Generated: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '═══════════════════════════════════════════════════════════════════════';

-- ============================================================================
-- SECTION A: PRE-MIGRATION CHECK (Verify existing columns before migration)
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION A: PRE-MIGRATION CHECK';
PRINT 'Check existing columns before running migrations';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- A.1: Check existing employee-related columns ---';

SELECT
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
    AND COLUMN_NAME IN (
        'nik',
        'hr_employee_code',
        'parsed_employee_code',
        'current_emp_code',
        'current_resolution_status',
        'resolved_nik'
    )
ORDER BY TABLE_NAME, COLUMN_NAME;

-- ============================================================================
-- SECTION B: POST-MIGRATION VERIFICATION
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION B: POST-MIGRATION VERIFICATION';
PRINT 'Verify all new columns and tables exist';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- B.1: Verify all new columns exist ---';

SELECT
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'dbo'
    AND COLUMN_NAME IN (
        'resolved_nik',
        'current_emp_code',
        'current_emp_name',
        'current_hr_status',
        'current_hr_loc_code',
        'current_hr_create_date',
        'current_hr_update_date',
        'current_mapping_status',
        'current_resolution_status',
        'current_resolution_method',
        'current_resolution_reason',
        'current_resolved_at',
        'mapping_version',
        'parsed_employee_code'
    )
ORDER BY TABLE_NAME, COLUMN_NAME;

PRINT '';
PRINT '--- B.2: Verify new tables exist ---';

SELECT
    TABLE_NAME,
    CREATE_DATE,
    Modify_Date
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME IN (
        'hr_employee_current_snapshot',
        'employee_code_history',
        'zkteco_absensi_user_registry'
    )
ORDER BY TABLE_NAME;

-- ============================================================================
-- SECTION C: DATA QUALITY CHECKS
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION C: DATA QUALITY CHECKS';
PRINT 'Comprehensive data quality validation';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- C.1: NIK Quality in HR_EMPLOYEE ---';

DECLARE @HRServer NVARCHAR(100) = N'DESKTOP-U5GUJPG'; -- Update if different

EXEC ('
    SELECT
        COUNT(*) AS total_rows,
        SUM(CASE WHEN NewICNo IS NULL OR LTRIM(RTRIM(NewICNo)) = '''' THEN 1 ELSE 0 END) AS missing_nik,
        COUNT(DISTINCT NULLIF(LTRIM(RTRIM(NewICNo)), '''')) AS distinct_nik
    FROM [' + @HRServer + '].DB_PTRJ.dbo.HR_EMPLOYEE
');

PRINT '';
PRINT '--- C.2: Resolution Status Distribution in Registry ---';

SELECT
    current_resolution_status,
    COUNT(*) AS total,
    CAST(CAST(COUNT(*) AS FLOAT) / NULLIF((SELECT COUNT(*) FROM dbo.zkteco_absensi_user_registry WHERE current_resolution_status IS NOT NULL), 0) * 100 AS DECIMAL(5,2)) AS percentage
FROM dbo.zkteco_absensi_user_registry
WHERE current_resolution_status IS NOT NULL
GROUP BY current_resolution_status
ORDER BY COUNT(*) DESC;

PRINT '';
PRINT '--- C.3: Ambiguous NIKs in HR Snapshot ---';

SELECT TOP 50
    nik,
    current_emp_code,
    current_emp_name,
    active_count,
    row_count,
    ambiguity_reason
FROM dbo.hr_employee_current_snapshot
WHERE is_ambiguous = 1
ORDER BY active_count DESC, nik ASC;

PRINT '';
PRINT '--- C.4: Snapshot Sync Health ---';

SELECT
    COUNT(*) AS snapshot_count,
    SUM(CASE WHEN is_ambiguous = 1 THEN 1 ELSE 0 END) AS ambiguous_nik_count,
    MAX(synced_at) AS last_sync,
    DATEDIFF(HOUR, MAX(synced_at), GETDATE()) AS hours_since_sync,
    MIN(synced_at) AS oldest_sync
FROM dbo.hr_employee_current_snapshot;

PRINT '';
PRINT '--- C.5: Employee Code History Summary ---';

SELECT
    COUNT(*) AS total_history_rows,
    COUNT(DISTINCT nik) AS distinct_nik,
    SUM(CASE WHEN is_current = 1 THEN 1 ELSE 0 END) AS current_rows,
    COUNT(DISTINCT emp_code) AS distinct_emp_codes
FROM dbo.employee_code_history;

-- ============================================================================
-- SECTION D: EXAMPLE NIK VERIFICATION
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION D: EXAMPLE NIK VERIFICATION';
PRINT 'Verify the example from PRD: NIK 1906041207910002 -> currentEmpCode A0966';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- D.1: Verify Example NIK 1906041207910002 ---';

DECLARE @ExampleNIK NVARCHAR(50) = N'1906041207910002';

-- Check in HR Snapshot
PRINT 'Checking hr_employee_current_snapshot...';
SELECT
    nik,
    current_emp_code,
    current_emp_name,
    current_loc_code,
    current_status,
    is_ambiguous,
    active_count,
    row_count,
    synced_at
FROM dbo.hr_employee_current_snapshot
WHERE nik = @ExampleNIK;

-- Check history for this NIK
PRINT '';
PRINT 'Checking employee_code_history for NIK ' + @ExampleNIK + '...';
SELECT
    nik,
    emp_code,
    emp_name,
    loc_code,
    hr_status,
    is_current,
    create_date,
    update_date
FROM dbo.employee_code_history
WHERE nik = @ExampleNIK
ORDER BY create_date DESC, update_date DESC;

-- Verify in ZKTeco Registry
PRINT '';
PRINT 'Checking zkteco_absensi_user_registry for raw IDs linked to ' + @ExampleNIK + '...';
SELECT TOP 20
    raw_device_user_id,
    parsed_employee_code,
    current_emp_code,
    resolved_nik,
    current_resolution_status,
    current_resolution_reason
FROM dbo.zkteco_absensi_user_registry
WHERE resolved_nik = @ExampleNIK
    OR current_emp_code IN (
        SELECT current_emp_code
        FROM dbo.hr_employee_current_snapshot
        WHERE nik = @ExampleNIK
    )
ORDER BY raw_device_user_id;

-- ============================================================================
-- SECTION E: PARSEDCODE VS CURRENT EMPCODE CHANGES
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION E: PARSEDCODE CHANGES';
PRINT 'Find cases where parsedCode differs from currentEmpCode';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- E.1: Summary of parsedCode -> currentEmpCode changes ---';

SELECT
    current_resolution_status,
    COUNT(*) AS total_count,
    COUNT(DISTINCT parsed_employee_code) AS unique_parsed_codes,
    COUNT(DISTINCT current_emp_code) AS unique_current_codes
FROM dbo.zkteco_absensi_user_registry
WHERE current_resolution_status IS NOT NULL
GROUP BY current_resolution_status
ORDER BY COUNT(*) DESC;

PRINT '';
PRINT '--- E.2: Top 50 parsedCode -> currentEmpCode changes ---';

SELECT TOP 50
    parsed_employee_code,
    current_emp_code,
    COUNT(*) AS raw_id_count,
    STRING_AGG(raw_device_user_id, ', ') AS sample_raw_ids
FROM dbo.zkteco_absensi_user_registry
WHERE current_emp_code IS NOT NULL
    AND parsed_employee_code <> current_emp_code
GROUP BY parsed_employee_code, current_emp_code
ORDER BY raw_id_count DESC;

-- ============================================================================
-- SECTION F: BACKFILL VERIFICATION
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION F: BACKFILL VERIFICATION';
PRINT 'Verify backfill completeness across all tables';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- F.1: Registry backfill status ---';

SELECT
    COUNT(*) AS total_registry_rows,
    SUM(CASE WHEN current_resolution_status IS NOT NULL THEN 1 ELSE 0 END) AS resolved_count,
    SUM(CASE WHEN current_resolution_status IS NULL THEN 1 ELSE 0 END) AS unresolved_count,
    SUM(CASE WHEN current_resolution_status = 'MAPPED_CURRENT' THEN 1 ELSE 0 END) AS mapped_current_count,
    SUM(CASE WHEN current_resolution_status LIKE '%NOT_FOUND%' THEN 1 ELSE 0 END) AS not_found_count,
    SUM(CASE WHEN current_resolution_status = 'NIK_DUPLICATE_AMBIGUOUS' THEN 1 ELSE 0 END) AS ambiguous_count
FROM dbo.zkteco_absensi_user_registry;

PRINT '';
PRINT '--- F.2: Scan logs backfill status ---';

SELECT
    COUNT(*) AS total_scan_logs,
    SUM(CASE WHEN current_emp_code IS NOT NULL THEN 1 ELSE 0 END) AS has_current_emp_code,
    SUM(CASE WHEN resolved_nik IS NOT NULL THEN 1 ELSE 0 END) AS has_resolved_nik,
    SUM(CASE WHEN current_emp_code IS NULL AND parsed_employee_code IS NOT NULL THEN 1 ELSE 0 END) AS missing_current_emp_code
FROM dbo.attendance_scan_logs;

PRINT '';
PRINT '--- F.3: Attendance imports backfill status ---';

SELECT
    COUNT(*) AS total_imports,
    SUM(CASE WHEN current_emp_code IS NOT NULL THEN 1 ELSE 0 END) AS has_current_emp_code,
    SUM(CASE WHEN current_emp_code IS NULL AND employee_code IS NOT NULL THEN 1 ELSE 0 END) AS missing_current_emp_code
FROM dbo.attendance_imports;

-- ============================================================================
-- SECTION G: RESOLUTION CASCADE VALIDATION
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION G: RESOLUTION CASCADE VALIDATION';
PRINT 'Verify each resolution status is correctly assigned';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- G.1: MAPPED_CURRENT - should have valid parsedCode, NIK, and currentEmpCode ---';

SELECT TOP 20
    raw_device_user_id,
    parsed_employee_code,
    current_emp_code,
    current_emp_name,
    current_resolution_reason
FROM dbo.zkteco_absensi_user_registry
WHERE current_resolution_status = 'MAPPED_CURRENT'
    AND current_emp_code IS NOT NULL
ORDER BY current_resolved_at DESC;

PRINT '';
PRINT '--- G.2: PARSED_CODE_NOT_FOUND_IN_HR - parsedCode not in HR_EMPLOYEE ---';

SELECT TOP 20
    raw_device_user_id,
    parsed_employee_code,
    current_resolution_status,
    current_resolution_reason
FROM dbo.zkteco_absensi_user_registry
WHERE current_resolution_status = 'PARSED_CODE_NOT_FOUND_IN_HR'
ORDER BY raw_device_user_id;

PRINT '';
PRINT '--- G.3: NIK_NOT_FOUND - parsedCode found but no NewICNo/NIK ---';

SELECT TOP 20
    raw_device_user_id,
    parsed_employee_code,
    current_resolution_status,
    current_resolution_reason
FROM dbo.zkteco_absensi_user_registry
WHERE current_resolution_status = 'NIK_NOT_FOUND'
ORDER BY raw_device_user_id;

PRINT '';
PRINT '--- G.4: NIK_DUPLICATE_AMBIGUOUS - multiple active HR rows for same NIK ---';

SELECT TOP 20
    raw_device_user_id,
    parsed_employee_code,
    resolved_nik,
    current_emp_code,
    current_resolution_status,
    current_resolution_reason
FROM dbo.zkteco_absensi_user_registry
WHERE current_resolution_status = 'NIK_DUPLICATE_AMBIGUOUS'
ORDER BY resolved_nik;

-- ============================================================================
-- SECTION H: SUMMARY REPORT
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION H: SUMMARY REPORT';
PRINT 'Overall implementation status';
PRINT '═══════════════════════════════════════════════════════════════════════';

PRINT '';
PRINT '--- Implementation Status Summary ---';

SELECT
    'Tables Created' AS metric,
    CASE
        WHEN EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'hr_employee_current_snapshot') THEN 'YES'
        ELSE 'NO'
    END AS status
UNION ALL
SELECT
    'History Table Created' AS metric,
    CASE
        WHEN EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'employee_code_history') THEN 'YES'
        ELSE 'NO'
    END AS status
UNION ALL
SELECT
    'Registry has current_emp_code' AS metric,
    CASE
        WHEN EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'zkteco_absensi_user_registry' AND COLUMN_NAME = 'current_emp_code') THEN 'YES'
        ELSE 'NO'
    END AS status
UNION ALL
SELECT
    'Snapshot Populated' AS metric,
    CASE
        WHEN EXISTS (SELECT 1 FROM dbo.hr_employee_current_snapshot) THEN 'YES'
        ELSE 'NO'
    END AS status;

PRINT '';
PRINT '--- Record Counts ---';

SELECT
    'HR Employee Snapshot Rows' AS metric,
    CAST(COUNT(*) AS VARCHAR(20)) AS value
FROM dbo.hr_employee_current_snapshot
UNION ALL
SELECT
    'Employee Code History Rows' AS metric,
    CAST(COUNT(*) AS VARCHAR(20)) AS value
FROM dbo.employee_code_history
UNION ALL
SELECT
    'Registry with current_emp_code' AS metric,
    CAST(SUM(CASE WHEN current_emp_code IS NOT NULL THEN 1 ELSE 0 END) AS VARCHAR(20)) AS value
FROM dbo.zkteco_absensi_user_registry
UNION ALL
SELECT
    'Ambiguous NIKs' AS metric,
    CAST(SUM(CASE WHEN is_ambiguous = 1 THEN 1 ELSE 0 END) AS VARCHAR(20)) AS value
FROM dbo.hr_employee_current_snapshot;

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'END OF CURRENT EMPCODE VALIDATION';
PRINT '═══════════════════════════════════════════════════════════════════════';
