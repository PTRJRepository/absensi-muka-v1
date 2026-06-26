/*
 * Migration: 033_reactivate_enrolled_employees.sql
 * Date: 2026-06-22
 * Purpose: Reactivate zkteco_hr_employee_map records where employee exists in employees table
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 033: Reactivate enrolled employees';
    PRINT '============================================================';
    PRINT '';

    -- Count matchable inactive records first
    PRINT '=== Counting matchable inactive records ===';

    SELECT COUNT(*) AS matchable_inactive
    FROM dbo.zkteco_hr_employee_map m
    WHERE m.is_active = 0
      AND m.hr_employee_code IS NULL
      AND m.zkteco_user_name IS NOT NULL
      AND LEN(LTRIM(RTRIM(m.zkteco_user_name))) > 0
      AND EXISTS (
        SELECT 1 FROM dbo.employees e
        WHERE e.employee_code NOT LIKE '%[^A-Z0-9]%'
          AND CHARINDEX(UPPER(e.employee_name), UPPER(m.zkteco_user_name)) > 0
      );
    PRINT '';

    -- Update inactive records where employee name matches
    PRINT '=== Updating matched records ===';

    UPDATE m
    SET
        m.hr_employee_code = e.employee_code,
        m.hr_employee_name = e.employee_name,
        m.match_confidence = 'STRONG',
        m.match_method = 'NAME_MATCH_EMPLOYEE_TABLE',
        m.is_active = 1,
        m.updated_at = GETDATE()
    FROM dbo.zkteco_hr_employee_map m
    INNER JOIN dbo.employees e ON
        CHARINDEX(UPPER(e.employee_name), UPPER(m.zkteco_user_name)) > 0
        OR CHARINDEX(UPPER(m.zkteco_user_name), UPPER(e.employee_name)) > 0
    WHERE m.is_active = 0
      AND m.hr_employee_code IS NULL
      AND e.employee_code NOT LIKE '%[^A-Z0-9]%'
      AND LEN(LTRIM(RTRIM(m.zkteco_user_name))) > 0;

    DECLARE @updated INT = @@ROWCOUNT;
    PRINT CONCAT('Records reactivated: ', @updated);
    PRINT '';

    -- Summary
    PRINT '=== Summary ===';

    SELECT
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_records,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_records,
        COUNT(*) AS total_records
    FROM dbo.zkteco_hr_employee_map;

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 033 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
