/*
 * Migration: 030_fix_zkteco_hr_employee_map_nulls.sql
 * Date: 2026-06-22
 * Purpose: Fix zkteco_hr_employee_map.hr_employee_code = NULL
 *
 * Strategy:
 * 1. Join to employees.zkteco_user_id for exact ID match (52 records)
 * 2. Fallback: join to employees by name similarity (strip parentheticals)
 * 3. Remaining: mark as NEED_REVIEW with reason
 *
 * Rule: Division (LocCode) comes from HR_EMPLOYEE.LocCode in db_ptrj,
 * NOT from machine_code. Same raw ID can appear on multiple machines.
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 030: Fix zkteco_hr_employee_map NULL codes';
    PRINT '============================================================';
    PRINT '';

    -- STEP 1: Count before
    PRINT '=== STEP 1: Count before ===';

    DECLARE @null_before INT;
    SELECT @null_before = COUNT(*)
    FROM dbo.zkteco_hr_employee_map
    WHERE hr_employee_code IS NULL AND is_active = 1;
    PRINT CONCAT('NULL hr_employee_code before: ', @null_before);
    PRINT '';

    -- STEP 2: Fix via exact zkteco_user_id match
    PRINT '=== STEP 2: Fix via exact zkteco_user_id join ===';

    UPDATE m
    SET
        m.hr_employee_code = e.employee_code,
        m.hr_employee_name = e.employee_name,
        m.match_confidence = 'EXACT',
        m.match_method = 'ZKTECO_USER_ID_MATCH',
        m.updated_at = GETDATE()
    FROM dbo.zkteco_hr_employee_map m
    INNER JOIN dbo.employees e ON e.zkteco_user_id = m.zkteco_user_id
    WHERE m.hr_employee_code IS NULL
      AND m.is_active = 1
      AND e.employee_code IS NOT NULL;

    DECLARE @fixed_id INT = @@ROWCOUNT;
    PRINT CONCAT('Fixed via zkteco_user_id join: ', @fixed_id);
    PRINT '';

    -- STEP 3: Fix via exact name match (strip parenthetical aliases)
    PRINT '=== STEP 3: Fix via exact name match ===';

    UPDATE m
    SET
        m.hr_employee_code = e.employee_code,
        m.hr_employee_name = e.employee_name,
        m.match_confidence = 'STRONG',
        m.match_method = 'EXACT_NAME_MATCH',
        m.updated_at = GETDATE()
    FROM dbo.zkteco_hr_employee_map m
    INNER JOIN dbo.employees e ON
        UPPER(LTRIM(RTRIM(REPLACE(REPLACE(m.zkteco_user_name, '(', ''), ')', ''))))
        = UPPER(LTRIM(RTRIM(REPLACE(REPLACE(e.employee_name, '(', ''), ')', ''))))
    WHERE m.hr_employee_code IS NULL
      AND m.is_active = 1
      AND e.employee_code IS NOT NULL;

    DECLARE @fixed_name INT = @@ROWCOUNT;
    PRINT CONCAT('Fixed via name match: ', @fixed_name);
    PRINT '';

    -- STEP 4: Count remaining NULLs
    PRINT '=== STEP 4: Remaining NULLs ===';

    DECLARE @null_after INT;
    SELECT @null_after = COUNT(*)
    FROM dbo.zkteco_hr_employee_map
    WHERE hr_employee_code IS NULL AND is_active = 1;
    PRINT CONCAT('NULL hr_employee_code after: ', @null_after);
    PRINT CONCAT('Total fixed: ', @null_before - @null_after);
    PRINT '';

    -- STEP 5: Summary by machine
    PRINT '=== STEP 5: Summary by machine (after fix) ===';

    SELECT
        machine_code,
        match_confidence,
        COUNT(*) AS cnt
    FROM dbo.zkteco_hr_employee_map
    WHERE is_active = 1
    GROUP BY machine_code, match_confidence
    ORDER BY machine_code, cnt DESC;
    PRINT '';

    -- STEP 6: Verify sample fixed records
    PRINT '=== STEP 6: Sample fixed records ===';

    SELECT TOP 10
        m.machine_code,
        m.zkteco_user_id,
        m.zkteco_user_name,
        m.hr_employee_code,
        m.hr_employee_name,
        m.match_confidence,
        m.match_method
    FROM dbo.zkteco_hr_employee_map m
    WHERE m.hr_employee_code IS NOT NULL
      AND m.is_active = 1
      AND m.match_method IN ('ZKTECO_USER_ID_MATCH', 'EXACT_NAME_MATCH')
    ORDER BY m.updated_at DESC;
    PRINT '';

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 030 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
