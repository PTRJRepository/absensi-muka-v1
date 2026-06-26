/*
 * Migration: 050_add_current_empcode_employees
 * Purpose: Add currentEmpCode columns to employees table
 * Date: 2026-06-23
 */

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'MIGRATION 050: Add currentEmpCode columns to employees';
PRINT '============================================================';
PRINT '';

-- Step 1: Add current_emp_code
PRINT 'Step 1: Adding current_emp_code...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.employees') AND name = 'current_emp_code')
BEGIN
  ALTER TABLE dbo.employees ADD current_emp_code NVARCHAR(30) NULL;
  PRINT '  Added: current_emp_code';
END
ELSE
BEGIN
  PRINT '  Already exists: current_emp_code';
END

-- Step 2: Add current_emp_name
PRINT 'Step 2: Adding current_emp_name...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.employees') AND name = 'current_emp_name')
BEGIN
  ALTER TABLE dbo.employees ADD current_emp_name NVARCHAR(150) NULL;
  PRINT '  Added: current_emp_name';
END
ELSE
BEGIN
  PRINT '  Already exists: current_emp_name';
END

-- Step 3: Add identity_source
PRINT 'Step 3: Adding identity_source...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.employees') AND name = 'identity_source')
BEGIN
  ALTER TABLE dbo.employees ADD identity_source NVARCHAR(50) NULL;
  PRINT '  Added: identity_source';
END
ELSE
BEGIN
  PRINT '  Already exists: identity_source';
END

-- Step 4: Add identity_resolution_reason
PRINT 'Step 4: Adding identity_resolution_reason...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.employees') AND name = 'identity_resolution_reason')
BEGIN
  ALTER TABLE dbo.employees ADD identity_resolution_reason NVARCHAR(500) NULL;
  PRINT '  Added: identity_resolution_reason';
END
ELSE
BEGIN
  PRINT '  Already exists: identity_resolution_reason';
END

PRINT '';
PRINT '============================================================';
PRINT 'MIGRATION 050 COMPLETED';
PRINT '============================================================';
