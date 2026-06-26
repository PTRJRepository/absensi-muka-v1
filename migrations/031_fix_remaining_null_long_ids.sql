/*
 * Migration: 031_fix_remaining_null_long_ids.sql
 * Date: 2026-06-22
 * Purpose: Fix remaining NULL parsed_employee_code for IDs >5 digits with valid scanner prefix
 *
 * Context: Migration 029 failed at UPDATE step due to invalid column 'updated_at'.
 * Records with parsed_employee_code = NULL, mapping_status = 'NEED_REVIEW',
 * and raw_device_user_id starting with valid scanner prefix (100/200/300/400/500/600/700/800/900)
 * still need to be fixed.
 *
 * Also fixes: parsed_division_code = NULL (uses employee lookup or default locCode)
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 031: Fix remaining NULL parsed_employee_code';
    PRINT '============================================================';
    PRINT '';

    -- Scanner prefix → locCode map (inline)
    DECLARE @prefixA TABLE (prefix CHAR(3), loc_code CHAR(1));
    INSERT INTO @prefixA VALUES
        ('100','A'),('200','J'),('300','B'),('400','H'),
        ('500','C'),('600','D'),('700','E'),('800','F'),('900','G');

    -- STEP 1: Count before
    PRINT '=== STEP 1: Count before ===';

    SELECT
        LEFT(LTRIM(RTRIM(raw_device_user_id)), 3) AS prefix3,
        COUNT(*) AS cnt
    FROM dbo.attendance_scan_logs
    WHERE parsed_employee_code IS NULL
      AND LEN(LTRIM(RTRIM(raw_device_user_id))) > 5
      AND LEFT(LTRIM(RTRIM(raw_device_user_id)), 3) IN ('100','200','300','400','500','600','700','800','900')
    GROUP BY LEFT(LTRIM(RTRIM(raw_device_user_id)), 3)
    ORDER BY cnt DESC;
    PRINT '';

    -- STEP 2: Fix via scanner prefix (assign code from raw ID suffix)
    PRINT '=== STEP 2: Fix via scanner prefix ===';

    UPDATE s
    SET
        s.parsed_employee_code = CONCAT(p.loc_code, RIGHT(LTRIM(RTRIM(s.raw_device_user_id)), 4)),
        s.mapping_status = 'MAPPED',
        s.mapping_reason = 'SSOT_REPAIR_LONG_PREFIX_20260622'
    FROM dbo.attendance_scan_logs s
    INNER JOIN @prefixA p ON LEFT(LTRIM(RTRIM(s.raw_device_user_id)), 3) = p.prefix
    WHERE s.parsed_employee_code IS NULL
      AND s.mapping_status = 'NEED_REVIEW'
      AND s.mapping_reason = 'LONG_RAW_ID_LOOKUP_REQUIRED'
      AND LEN(LTRIM(RTRIM(s.raw_device_user_id))) > 5;

    DECLARE @fixed_prefix INT = @@ROWCOUNT;
    PRINT CONCAT('Fixed via scanner prefix: ', @fixed_prefix);
    PRINT '';

    -- STEP 3: Also fix NULL records where mapping_reason is different but should be parsed
    PRINT '=== STEP 3: Fix other NULL records with valid scanner prefix ===';

    UPDATE s
    SET
        s.parsed_employee_code = CONCAT(p.loc_code, RIGHT(LTRIM(RTRIM(s.raw_device_user_id)), 4)),
        s.mapping_status = 'MAPPED',
        s.mapping_reason = 'SSOT_REPAIR_LONG_PREFIX_20260622'
    FROM dbo.attendance_scan_logs s
    INNER JOIN @prefixA p ON LEFT(LTRIM(RTRIM(s.raw_device_user_id)), 3) = p.prefix
    WHERE s.parsed_employee_code IS NULL
      AND s.mapping_status = 'NEED_REVIEW'
      AND LEN(LTRIM(RTRIM(s.raw_device_user_id))) > 5;

    DECLARE @fixed_other INT = @@ROWCOUNT;
    PRINT CONCAT('Fixed via scanner prefix (other NEED_REVIEW): ', @fixed_other);
    PRINT '';

    -- STEP 4: Summary
    PRINT '=== STEP 4: Summary after fix ===';

    SELECT
        mapping_status,
        COUNT(*) AS cnt
    FROM dbo.attendance_scan_logs
    GROUP BY mapping_status
    ORDER BY cnt DESC;
    PRINT '';

    -- STEP 5: Remaining NULL breakdown
    PRINT '=== STEP 5: Remaining NULL parsed_employee_code ===';

    SELECT
        mapping_status,
        COUNT(*) AS cnt
    FROM dbo.attendance_scan_logs
    WHERE parsed_employee_code IS NULL
    GROUP BY mapping_status
    ORDER BY cnt DESC;
    PRINT '';

    -- STEP 6: Fix parsed_division_code via join to employees table
    PRINT '=== STEP 6: Fix parsed_division_code via employees join ===';

    UPDATE s
    SET s.parsed_division_code = e.division_id
    FROM dbo.attendance_scan_logs s
    INNER JOIN dbo.employees e ON e.employee_code = s.parsed_employee_code
    WHERE s.parsed_division_code IS NULL
      AND s.parsed_employee_code IS NOT NULL;

    DECLARE @fixed_div INT = @@ROWCOUNT;
    PRINT CONCAT('Fixed parsed_division_code: ', @fixed_div);
    PRINT '';

    -- STEP 7: Remaining null division
    PRINT '=== STEP 7: Remaining NULL parsed_division_code ===';

    SELECT
        mapping_status,
        COUNT(*) AS cnt
    FROM dbo.attendance_scan_logs
    WHERE parsed_division_code IS NULL
    GROUP BY mapping_status
    ORDER BY cnt DESC;
    PRINT '';

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 031 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
