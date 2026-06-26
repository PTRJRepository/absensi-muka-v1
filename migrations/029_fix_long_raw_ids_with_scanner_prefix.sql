/*
 * Migration: 029_fix_long_raw_ids_with_scanner_prefix.sql
 * Date: 2026-06-22
 * Purpose: Fix parsed_employee_code = NULL for IDs > 5 digits that START with a valid scanner prefix
 *
 * Context: 1000890 → A0890 (prefix 100 → A, suffix 0890)
 *         5000669 → C0669 (prefix 500 → C, suffix 0669)
 *         7000130 → E0130 (prefix 700 → E, suffix 0130)
 *         1000012 → A0012 (prefix 100 → A, suffix 0012)
 *
 * Before this migration, IDs > 5 digits were ALL returned as NONE/NULL by the parser.
 * This migration re-parses them using the correct SSOT algorithm.
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 029: Fix long raw IDs with scanner prefix';
    PRINT '============================================================';
    PRINT '';

    -- STEP 1: Count records affected
    PRINT '=== STEP 1: Count affected records ===';

    DECLARE @total_null_long_with_prefix INT;
    SELECT @total_null_long_with_prefix = COUNT(*)
    FROM attendance_scan_logs
    WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) > 5
      AND parsed_employee_code IS NULL
      AND mapping_status IN ('UNMAPPED', 'NEED_REVIEW')
      AND LEFT(LTRIM(RTRIM(raw_device_user_id)), 3) IN ('100','200','300','400','500','600','700','800','900');

    PRINT CONCAT('Records to fix (NULL, >5 digits, valid scanner prefix): ', @total_null_long_with_prefix);
    PRINT '';

    -- STEP 2: Show sample BEFORE
    PRINT '=== STEP 2: Sample BEFORE (top 20) ===';

    SELECT TOP 20
        raw_device_user_id,
        parsed_employee_code AS before_parsed,
        mapping_status,
        mapping_reason,
        COUNT(*) AS cnt
    FROM attendance_scan_logs
    WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) > 5
      AND parsed_employee_code IS NULL
      AND LEFT(LTRIM(RTRIM(raw_device_user_id)), 3) IN ('100','200','300','400','500','600','700','800','900')
    GROUP BY raw_device_user_id, parsed_employee_code, mapping_status, mapping_reason
    ORDER BY cnt DESC;
    PRINT '';

    -- STEP 3: Show expected results per raw ID
    PRINT '=== STEP 3: Expected parsed codes ===';

    DECLARE @prefixA TABLE (prefix CHAR(3), loc_code CHAR(1));
    INSERT INTO @prefixA VALUES ('100','A'),('200','J'),('300','B'),('400','H'),('500','C'),('600','D'),('700','E'),('800','F'),('900','G');

    SELECT TOP 30
        raw_device_user_id,
        LEFT(LTRIM(RTRIM(raw_device_user_id)), 3) AS scanner_prefix,
        p.loc_code,
        RIGHT(LTRIM(RTRIM(raw_device_user_id)), 4) AS suffix4,
        CONCAT(p.loc_code, RIGHT(LTRIM(RTRIM(raw_device_user_id)), 4)) AS expected_parsed,
        COUNT(*) AS cnt
    FROM attendance_scan_logs s
    INNER JOIN @prefixA p ON LEFT(LTRIM(RTRIM(s.raw_device_user_id)), 3) = p.prefix
    WHERE LEN(LTRIM(RTRIM(s.raw_device_user_id))) > 5
      AND s.parsed_employee_code IS NULL
      AND s.mapping_status IN ('UNMAPPED', 'NEED_REVIEW')
    GROUP BY s.raw_device_user_id, p.loc_code
    ORDER BY cnt DESC;
    PRINT '';

    -- STEP 4: Apply the fix
    PRINT '=== STEP 4: Applying fix ===';

    UPDATE s
    SET
        s.parsed_employee_code = CONCAT(p.loc_code, RIGHT(LTRIM(RTRIM(s.raw_device_user_id)), 4)),
        s.mapping_status = 'MAPPED',
        s.mapping_reason = 'SSOT_REPAIR_LONG_PREFIX_20260622'
    FROM attendance_scan_logs s
    INNER JOIN @prefixA p ON LEFT(LTRIM(RTRIM(s.raw_device_user_id)), 3) = p.prefix
    WHERE LEN(LTRIM(RTRIM(s.raw_device_user_id))) > 5
      AND s.parsed_employee_code IS NULL
      AND s.mapping_status IN ('UNMAPPED', 'NEED_REVIEW');

    DECLARE @fixed_count INT = @@ROWCOUNT;
    PRINT CONCAT('Records fixed: ', @fixed_count);
    PRINT '';

    -- STEP 5: Verify fix
    PRINT '=== STEP 5: Verify fix (sample) ===';

    SELECT TOP 15
        raw_device_user_id,
        parsed_employee_code AS after_parsed,
        mapping_status,
        mapping_reason,
        COUNT(*) AS cnt
    FROM attendance_scan_logs
    WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) > 5
      AND LEFT(LTRIM(RTRIM(raw_device_user_id)), 3) IN ('100','200','300','400','500','600','700','800','900')
    GROUP BY raw_device_user_id, parsed_employee_code, mapping_status, mapping_reason
    ORDER BY cnt DESC;
    PRINT '';

    -- STEP 6: Summary stats
    PRINT '=== STEP 6: Summary ===';

    SELECT
        mapping_status,
        COUNT(*) AS record_count
    FROM attendance_scan_logs
    GROUP BY mapping_status
    ORDER BY record_count DESC;
    PRINT '';

    -- STEP 7: Verify specific cases
    PRINT '=== STEP 7: Verify specific cases ===';

    SELECT TOP 5
        raw_device_user_id,
        parsed_employee_code,
        mapping_status,
        mapping_reason
    FROM attendance_scan_logs
    WHERE raw_device_user_id = '1000890'
    ORDER BY scan_date DESC;

    SELECT TOP 5
        raw_device_user_id,
        parsed_employee_code,
        mapping_status,
        mapping_reason
    FROM attendance_scan_logs
    WHERE raw_device_user_id = '5000669'
    ORDER BY scan_date DESC;

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 029 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
