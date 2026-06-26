/*
 * Migration: 049_add_current_empcode_imports
 * Purpose: Add currentEmpCode columns to attendance_imports table
 * Date: 2026-06-23
 */

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'MIGRATION 049: Add currentEmpCode columns to imports';
PRINT '============================================================';
PRINT '';

-- Step 1: Add parsed_employee_code
PRINT 'Step 1: Adding parsed_employee_code...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_imports') AND name = 'parsed_employee_code')
BEGIN
  ALTER TABLE dbo.attendance_imports ADD parsed_employee_code NVARCHAR(30) NULL;
  PRINT '  Added: parsed_employee_code';
END
ELSE
BEGIN
  PRINT '  Already exists: parsed_employee_code';
END

-- Step 2: Add resolved_nik
PRINT 'Step 2: Adding resolved_nik...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_imports') AND name = 'resolved_nik')
BEGIN
  ALTER TABLE dbo.attendance_imports ADD resolved_nik NVARCHAR(50) NULL;
  PRINT '  Added: resolved_nik';
END
ELSE
BEGIN
  PRINT '  Already exists: resolved_nik';
END

-- Step 3: Add current_emp_code
PRINT 'Step 3: Adding current_emp_code...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_imports') AND name = 'current_emp_code')
BEGIN
  ALTER TABLE dbo.attendance_imports ADD current_emp_code NVARCHAR(30) NULL;
  PRINT '  Added: current_emp_code';
END
ELSE
BEGIN
  PRINT '  Already exists: current_emp_code';
END

-- Step 4: Add current_employee_id
PRINT 'Step 4: Adding current_employee_id...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_imports') AND name = 'current_employee_id')
BEGIN
  ALTER TABLE dbo.attendance_imports ADD current_employee_id INT NULL;
  PRINT '  Added: current_employee_id';
END
ELSE
BEGIN
  PRINT '  Already exists: current_employee_id';
END

-- Step 5: Add mapping_version
PRINT 'Step 5: Adding mapping_version...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_imports') AND name = 'mapping_version')
BEGIN
  ALTER TABLE dbo.attendance_imports ADD mapping_version NVARCHAR(50) NULL;
  PRINT '  Added: mapping_version';
END
ELSE
BEGIN
  PRINT '  Already exists: mapping_version';
END

PRINT '';
PRINT '============================================================';
PRINT 'MIGRATION 049 COMPLETED';
PRINT '============================================================';
