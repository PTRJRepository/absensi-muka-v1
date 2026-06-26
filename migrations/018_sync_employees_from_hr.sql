-- Sync employees from HR_EMPLOYEE in DB_PTRJ
USE rebinmas_absensi_monitoring;
GO

PRINT '=== Syncing Employees from HR_EMPLOYEE (DB_PTRJ) ===';
PRINT '';

-- Count before
DECLARE @before_active INT = (SELECT COUNT(*) FROM employees WHERE is_active = 1);
DECLARE @before_total INT = (SELECT COUNT(*) FROM employees);
PRINT 'Before: ' + CAST(@before_active AS VARCHAR) + ' active / ' + CAST(@before_total AS VARCHAR) + ' total';

-- Insert or update employees from HR_EMPLOYEE
PRINT '';
PRINT 'Upserting employees...';

MERGE INTO employees AS target
USING (
  SELECT
    RTRIM(EmpCode) as emp_code,
    RTRIM(EmpName) as emp_name,
    RTRIM(LocCode) as loc_code
  FROM [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE
  WHERE Status = '1'
) AS source ON target.employee_code = source.emp_code
WHEN MATCHED THEN
  UPDATE SET
    employee_name = source.emp_name,
    division_id = (SELECT TOP 1 id FROM divisions WHERE division_code = source.loc_code),
    is_active = 1,
    updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
  INSERT (employee_code, employee_name, division_id, gang_id, employment_status, is_active, created_at)
  VALUES (
    source.emp_code,
    source.emp_name,
    (SELECT TOP 1 id FROM divisions WHERE division_code = source.loc_code),
    NULL,
    'ACTIVE',
    1,
    SYSUTCDATETIME()
  );

-- Deactivate employees not in HR anymore
DECLARE @hr_count INT;
SELECT @hr_count = COUNT(*) FROM [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE WHERE Status = '1';
PRINT 'HR_EMPLOYEE count: ' + CAST(@hr_count AS VARCHAR);

-- Get HR codes
IF OBJECT_ID('tempdb..#hr_codes') IS NOT NULL DROP TABLE #hr_codes;
SELECT DISTINCT RTRIM(EmpCode) as emp_code
INTO #hr_codes
FROM [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE
WHERE Status = '1';

UPDATE employees
SET is_active = 0, updated_at = SYSUTCDATETIME()
WHERE employee_code NOT IN (SELECT emp_code FROM #hr_codes)
AND is_active = 1;

DECLARE @deactivated INT = @@ROWCOUNT;
PRINT 'Deactivated: ' + CAST(@deactivated AS VARCHAR) + ' employees';

-- Count after
DECLARE @after_active INT = (SELECT COUNT(*) FROM employees WHERE is_active = 1);
DECLARE @after_inactive INT = (SELECT COUNT(*) FROM employees WHERE is_active = 0);
PRINT '';
PRINT 'After: ' + CAST(@after_active AS VARCHAR) + ' active / ' + CAST(@after_inactive AS VARCHAR) + ' inactive';

-- Sample employees
PRINT '';
PRINT '=== Sample Employees ===';
SELECT TOP 20 employee_code, employee_name
FROM employees
WHERE is_active = 1
ORDER BY employee_code;

PRINT '';
PRINT '=== Sample by Prefix ===';

DECLARE @prefixes TABLE (prefix VARCHAR(10));
INSERT INTO @prefixes VALUES ('A'), ('B'), ('C'), ('D'), ('H'), ('G'), ('L'), ('0');

DECLARE @prefix VARCHAR(10);
DECLARE cur CURSOR FOR SELECT prefix FROM @prefixes;
OPEN cur;
FETCH NEXT FROM cur INTO @prefix;
WHILE @@FETCH_STATUS = 0
BEGIN
  DECLARE @cnt INT;
  SELECT @cnt = COUNT(*) FROM employees WHERE is_active = 1 AND employee_code LIKE @prefix + '%';
  IF @cnt > 0
  BEGIN
    PRINT 'Prefix ' + @prefix + ': ' + CAST(@cnt AS VARCHAR) + ' employees';
  END
  FETCH NEXT FROM cur INTO @prefix;
END
CLOSE cur;
DEALLOCATE cur;

GO
