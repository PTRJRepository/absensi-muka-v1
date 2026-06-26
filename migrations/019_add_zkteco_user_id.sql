-- Add zkteco_user_id column to employees table
USE rebinmas_absensi_monitoring;
GO

-- Add column if not exists
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employees') AND name = 'zkteco_user_id')
BEGIN
  ALTER TABLE employees ADD zkteco_user_id NVARCHAR(100) NULL;
  PRINT 'Added zkteco_user_id column to employees table';
END
ELSE
BEGIN
  PRINT 'zkteco_user_id column already exists';
END
GO

-- Update zkteco_user_id from the mapping table
USE rebinmas_absensi_monitoring;
GO

UPDATE e
SET e.zkteco_user_id = m.zkteco_user_id
FROM employees e
INNER JOIN zkteco_hr_employee_map m ON m.hr_employee_code = e.employee_code
WHERE m.hr_employee_code IS NOT NULL;

DECLARE @updated INT = @@ROWCOUNT;
PRINT 'Updated zkteco_user_id for ' + CAST(@updated AS VARCHAR) + ' employees';

-- Show sample
PRINT '';
PRINT '=== Sample employees with zkteco_user_id ===';
SELECT TOP 20 employee_code, zkteco_user_id, employee_name
FROM employees
WHERE zkteco_user_id IS NOT NULL
ORDER BY employee_code;

GO
