/*
 * Migration: 032_fix_attendance_imports_wrong_codes.sql
 * Date: 2026-06-22
 * Purpose: Fix attendance_imports.employee_code using correct parsed_employee_code from attendance_scan_logs
 *
 * Step 1: Fix 40,784 records where attendance_scan_logs.parsed_employee_code is already correct
 * Step 2: Fix 3,469 records with prefix 001*** (raw IDs like 0010107, 0010015)
 *         - These need direct join to employees.zkteco_user_id
 *         - If not found in employees, need lookup in db_ptrj HR_EMPLOYEE by name
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 032: Fix attendance_imports wrong employee codes';
    PRINT '============================================================';
    PRINT '';

    -- STEP 1: Count before
    PRINT '=== STEP 1: Count before ===';

    DECLARE @invalid_before INT;
    SELECT @invalid_before = COUNT(*)
    FROM dbo.attendance_imports
    WHERE employee_code IS NOT NULL
      AND employee_code NOT LIKE '[A-Z][0-9][0-9][0-9][0-9]';
    PRINT CONCAT('Invalid employee_code before: ', @invalid_before);
    PRINT '';

    -- STEP 2: Fix attendance_imports via attendance_scan_logs join
    -- attendance_scan_logs.parsed_employee_code is the CORRECT code
    PRINT '=== STEP 2: Fix via attendance_scan_logs join ===';

    UPDATE i
    SET
        i.employee_code = s.parsed_employee_code,
        i.division_code = s.parsed_division_code
    FROM dbo.attendance_imports i
    INNER JOIN dbo.attendance_scan_logs s ON s.id = i.raw_scan_log_id
    WHERE i.employee_code IS NOT NULL
      AND i.employee_code NOT LIKE '[A-Z][0-9][0-9][0-9][0-9]'
      AND s.parsed_employee_code IS NOT NULL
      AND s.parsed_employee_code <> i.employee_code;

    DECLARE @fixed_step2 INT = @@ROWCOUNT;
    PRINT CONCAT('Fixed via scan_log join: ', @fixed_step2);
    PRINT '';

    -- STEP 3: Fix records with prefix 001*** via employees.zkteco_user_id direct lookup
    PRINT '=== STEP 3: Fix 001*** prefix records via employees.zkteco_user_id ===';

    UPDATE i
    SET
        i.employee_code = e.employee_code
    FROM dbo.attendance_imports i
    INNER JOIN dbo.attendance_scan_logs s ON s.id = i.raw_scan_log_id
    INNER JOIN dbo.employees e ON e.zkteco_user_id = s.raw_device_user_id
    WHERE i.employee_code IS NOT NULL
      AND i.employee_code NOT LIKE '[A-Z][0-9][0-9][0-9][0-9]'
      AND s.parsed_employee_code IS NULL
      AND s.raw_device_user_id LIKE '001%';

    DECLARE @fixed_step3 INT = @@ROWCOUNT;
    PRINT CONCAT('Fixed via employees.zkteco_user_id join: ', @fixed_step3);
    PRINT '';

    -- STEP 4: Count remaining
    PRINT '=== STEP 4: Count remaining ===';

    DECLARE @invalid_after INT;
    SELECT @invalid_after = COUNT(*)
    FROM dbo.attendance_imports
    WHERE employee_code IS NOT NULL
      AND employee_code NOT LIKE '[A-Z][0-9][0-9][0-9][0-9]';
    PRINT CONCAT('Invalid employee_code after: ', @invalid_after);
    PRINT CONCAT('Total fixed: ', @invalid_before - @invalid_after);
    PRINT '';

    -- STEP 5: Show remaining (need db_ptrj HR lookup)
    PRINT '=== STEP 5: Remaining invalid codes ===';

    SELECT TOP 20
        employee_code,
        COUNT(*) as cnt
    FROM dbo.attendance_imports
    WHERE employee_code IS NOT NULL
      AND employee_code NOT LIKE '[A-Z][0-9][0-9][0-9][0-9]'
    GROUP BY employee_code
    ORDER BY cnt DESC;
    PRINT '';

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 032 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
