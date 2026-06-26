/*
 * Migration: 041_clean_invalid_employee_codes.sql
 * Date: 2026-06-23
 * Purpose: Deactivate employees with raw card number as employee_code (not parsed employee code)
 *
 * These employees have employee_code = raw card number (e.g., '10001', '10039')
 * instead of parsed employee code (e.g., 'A0001', 'H0039').
 *
 * This happens when ZKTeco machines enrolled employees with card numbers as codes.
 * Correct behavior: employee_code should ALWAYS be the parsed format [A-Z][0-9]{4}
 *
 * 10 ACTIVE records (CT001-CT010) are VALID contractor codes — kept.
 * 650 INACTIVE records with raw card numbers — deactivate.
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 041: Clean invalid employee_code (raw card numbers)';
    PRINT '============================================================';

    -- Count: contractor codes (CT*) - VALID, keep active
    DECLARE @contractors INT;
    SELECT @contractors = COUNT(*)
    FROM dbo.employees
    WHERE employee_code LIKE 'CT%'
      AND is_active = 1;
    PRINT CONCAT('Contractor codes (VALID, keep): ', @contractors);

    -- Count: inactive raw card codes - deactivate
    DECLARE @inactive_raw_codes INT;
    SELECT @inactive_raw_codes = COUNT(*)
    FROM dbo.employees
    WHERE LEN(employee_code) <= 5
      AND employee_code NOT LIKE '[A-Z][0-9][0-9][0-9][0-9]'
      AND employee_code NOT LIKE 'CT%'
      AND is_active = 0;
    PRINT CONCAT('Inactive raw-card codes to deactivate: ', @inactive_raw_codes);

    -- Deactivate invalid employee_code records
    UPDATE e
    SET e.is_active = 0,
        e.updated_at = GETDATE()
    FROM dbo.employees e
    WHERE LEN(e.employee_code) <= 5
      AND e.employee_code NOT LIKE '[A-Z][0-9][0-9][0-9][0-9]'
      AND e.employee_code NOT LIKE 'CT%';

    DECLARE @updated INT = @@ROWCOUNT;
    PRINT CONCAT('Deactivated: ', @updated);

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 041 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
