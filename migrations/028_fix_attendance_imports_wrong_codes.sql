/*
 * Migration: 028_fix_attendance_imports_wrong_codes.sql
 * Date: 2026-06-22
 * Purpose: Fix attendance_imports that reference wrong employee codes
 *
 * After migration 027 fixed attendance_scan_logs, attendance_imports
 * may still reference old wrong codes (e.g., E0040 instead of C0040).
 *
 * FIX: Update attendance_imports based on attendance_scan_logs raw_scan_log_id
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 028: Fix attendance_imports wrong codes';
    PRINT '============================================================';
    PRINT '';

    -- STEP 1: Check attendance_imports with potential wrong codes
    PRINT '=== STEP 1: Employee codes that look like scanner prefix results ===';

    SELECT
        employee_code,
        COUNT(*) AS record_count,
        MIN(attendance_date) AS first_date,
        MAX(attendance_date) AS last_date
    FROM attendance_imports
    WHERE employee_code LIKE '[ABCDEFGHJ]%'
      AND LEN(employee_code) = 5
      AND LEFT(employee_code, 1) IN ('A','B','C','D','E','F','G','H','J')
      AND ISNUMERIC(RIGHT(employee_code, 4)) = 1
    GROUP BY employee_code
    ORDER BY record_count DESC;
    PRINT '';

    -- STEP 2: Check specific wrong codes (E0040, A0040 from P2A machines)
    PRINT '=== STEP 2: Check attendance_imports for E0040 ===';

    SELECT TOP 10
        ai.id,
        ai.employee_code,
        ai.attendance_date,
        ai.raw_scan_log_id,
        s.raw_device_user_id,
        s.parsed_employee_code AS correct_code,
        ai.source
    FROM attendance_imports ai
    LEFT JOIN attendance_scan_logs s ON s.id = ai.raw_scan_log_id
    WHERE ai.employee_code = 'E0040'
    ORDER BY ai.attendance_date DESC;
    PRINT '';

    DECLARE @e0040_count INT;
    SELECT @e0040_count = COUNT(*)
    FROM attendance_imports ai
    WHERE ai.employee_code = 'E0040'
      AND ai.raw_scan_log_id IS NOT NULL;
    PRINT CONCAT('attendance_imports with E0040 (has raw_scan_log_id): ', @e0040_count);
    PRINT '';

    -- STEP 3: Show raw_scan_log_id join to verify correct codes
    PRINT '=== STEP 3: Verify raw_scan_log_id -> correct parsed_employee_code ===';

    SELECT TOP 20
        ai.employee_code AS wrong_code,
        ai.raw_scan_log_id,
        s.raw_device_user_id,
        s.parsed_employee_code AS correct_code,
        ai.attendance_date
    FROM attendance_imports ai
    INNER JOIN attendance_scan_logs s ON s.id = ai.raw_scan_log_id
    WHERE ai.employee_code <> s.parsed_employee_code
      AND s.parsed_employee_code IS NOT NULL
      AND ai.employee_code NOT LIKE 'MANUAL_%'
    ORDER BY ai.attendance_date DESC;
    PRINT '';

    DECLARE @wrong_ref_count INT = @@ROWCOUNT;
    PRINT CONCAT('Records with wrong employee_code reference: ', @wrong_ref_count);
    PRINT '';

    -- STEP 4: Fix attendance_imports via raw_scan_log_id join
    PRINT '=== STEP 4: Fixing attendance_imports via raw_scan_log_id ===';

    IF @wrong_ref_count > 0
    BEGIN
        UPDATE ai
        SET
            ai.employee_code = s.parsed_employee_code,
            ai.division_code = s.parsed_division_code
        FROM attendance_imports ai
        INNER JOIN attendance_scan_logs s ON s.id = ai.raw_scan_log_id
        WHERE ai.employee_code <> s.parsed_employee_code
          AND s.parsed_employee_code IS NOT NULL
          AND ai.employee_code NOT LIKE 'MANUAL_%'
          AND ai.source = 'ZKTECO';

        DECLARE @fixed_imports INT = @@ROWCOUNT;
        PRINT CONCAT('Fixed attendance_imports rows: ', @fixed_imports);
    END
    ELSE
    BEGIN
        PRINT 'No wrong references found in attendance_imports';
    END
    PRINT '';

    -- STEP 5: Verify fix
    PRINT '=== STEP 5: Verify E0040 is gone from ZKTECO source ===';

    SELECT COUNT(*) AS remaining_e0040
    FROM attendance_imports
    WHERE employee_code = 'E0040'
      AND source = 'ZKTECO';
    PRINT '';

    -- STEP 6: Show updated codes for former E0040 users
    PRINT '=== STEP 6: Former E0040 now shows correct codes ===';

    SELECT TOP 10
        ai.employee_code,
        COUNT(*) AS cnt,
        MIN(ai.attendance_date) AS first_date,
        MAX(ai.attendance_date) AS last_date
    FROM attendance_imports ai
    WHERE ai.source = 'ZKTECO'
      AND ai.employee_code IN ('C0040', 'A0040', 'B0040', 'H0040')
    GROUP BY ai.employee_code
    ORDER BY ai.employee_code;
    PRINT '';

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 028 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
