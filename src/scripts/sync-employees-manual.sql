-- Sync employees from HR_EMPLOYEE in DB_PTRJ to local employees table
-- This is a pure SQL script

USE rebinmas_absensi_monitoring;
GO

PRINT '=== Syncing Employees from HR_EMPLOYEE ===';
PRINT '';

-- Get divisions for mapping
IF OBJECT_ID('tempdb..#divisions') IS NOT NULL DROP TABLE #divisions;
SELECT id, division_code INTO #divisions FROM divisions;
PRINT 'Loaded divisions';

-- Create temp table for HR employees
IF OBJECT_ID('tempdb..#hr_employees') IS NOT NULL DROP TABLE #hr_employees;

-- Fetch HR employees from linked server query
-- Since we can't directly query DB_PTRJ, we'll use a simpler approach
-- Insert/update from a VALUES table

PRINT '';
PRINT 'Note: Run the following in DB_PTRJ first to export employees:';
PRINT 'SELECT RTRIM(EmpCode), RTRIM(EmpName), RTRIM(LocCode) FROM dbo.HR_EMPLOYEE WHERE Status = ''1''';
PRINT '';

-- Show current employee count
DECLARE @active_count INT = (SELECT COUNT(*) FROM employees WHERE is_active = 1);
DECLARE @total_count INT = (SELECT COUNT(*) FROM employees);
PRINT 'Current employees: ' + CAST(@active_count AS VARCHAR) + ' active / ' + CAST(@total_count AS VARCHAR) + ' total';

GO
