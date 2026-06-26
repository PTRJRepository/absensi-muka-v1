/*
 * Migration: 055_backfill_employees_current_emp_code
 * Purpose: Backfill employees.current_emp_code from hr_employee_current_snapshot via nik
 * Date: 2026-06-23
 */

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'MIGRATION 055: Backfill employees.current_emp_code from HR snapshot';
PRINT '============================================================';
PRINT '';

-- Check if hr_employee_current_snapshot exists
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hr_employee_current_snapshot' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  PRINT 'ERROR: hr_employee_current_snapshot does not exist. Run migration 051 first.';
  RETURN;
END

-- Step 1: Backfill employees.current_emp_code, current_emp_name, identity_source
PRINT 'Step 1: Backfilling employees.current_emp_code from hr_employee_current_snapshot...';

BEGIN TRY
  UPDATE e
  SET
    e.current_emp_code = s.current_emp_code,
    e.current_emp_name = s.current_emp_name,
    e.identity_source = 'HR_SNAPSHOT_NIK_LOOKUP',
    e.identity_resolution_reason = 'Resolved via nik from hr_employee_current_snapshot'
  FROM dbo.employees e
  INNER JOIN dbo.hr_employee_current_snapshot s ON s.nik = e.nik
  WHERE e.nik IS NOT NULL
    AND LEN(LTRIM(RTRIM(e.nik))) > 0
    AND e.current_emp_code IS NULL;

  PRINT '  Updated employees.current_emp_code from HR snapshot';
END TRY
BEGIN CATCH
  PRINT '  WARNING: ' + ERROR_MESSAGE();
END CATCH

-- Step 2: Mark employees that have nik but no match in HR snapshot
PRINT '';
PRINT 'Step 2: Mark unmatched employees...';

BEGIN TRY
  UPDATE e
  SET
    e.identity_source = 'NIK_NO_MATCH',
    e.identity_resolution_reason = 'nik exists but not found in hr_employee_current_snapshot'
  FROM dbo.employees e
  WHERE e.nik IS NOT NULL
    AND LEN(LTRIM(RTRIM(e.nik))) > 0
    AND e.current_emp_code IS NULL
    AND e.identity_source IS NULL;

  PRINT '  Marked unmatched employees';
END TRY
BEGIN CATCH
  PRINT '  WARNING: ' + ERROR_MESSAGE();
END CATCH

-- Step 3: Report summary
PRINT '';
PRINT 'Step 3: Summary...';

DECLARE @total INT, @withCurrent INT, @unmatched INT;
SELECT @total = COUNT(*) FROM dbo.employees WHERE nik IS NOT NULL AND LEN(LTRIM(RTRIM(nik))) > 0;
SELECT @withCurrent = COUNT(*) FROM dbo.employees WHERE nik IS NOT NULL AND LEN(LTRIM(RTRIM(nik))) > 0 AND current_emp_code IS NOT NULL;
SELECT @unmatched = COUNT(*) FROM dbo.employees WHERE nik IS NOT NULL AND LEN(LTRIM(RTRIM(nik))) > 0 AND current_emp_code IS NULL;

PRINT '  Total employees with NIK: ' + CAST(@total AS NVARCHAR(20));
PRINT '  With current_emp_code: ' + CAST(@withCurrent AS NVARCHAR(20));
PRINT '  Unmatched (NIK no snapshot): ' + CAST(@unmatched AS NVARCHAR(20));

PRINT '';
PRINT '============================================================';
PRINT 'MIGRATION 055 COMPLETED';
PRINT '============================================================';
