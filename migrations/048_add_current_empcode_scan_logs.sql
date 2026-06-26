/*
 * Migration: 048_add_current_empcode_scan_logs
 * Purpose: Add currentEmpCode resolution columns to attendance_scan_logs table
 * Date: 2026-06-23
 */

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'MIGRATION 048: Add currentEmpCode columns to scan_logs';
PRINT '============================================================';
PRINT '';

-- Step 1: Add resolved_nik
PRINT 'Step 1: Adding resolved_nik...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_scan_logs') AND name = 'resolved_nik')
BEGIN
  ALTER TABLE dbo.attendance_scan_logs ADD resolved_nik NVARCHAR(50) NULL;
  PRINT '  Added: resolved_nik';
END
ELSE
BEGIN
  PRINT '  Already exists: resolved_nik';
END

-- Step 2: Add current_emp_code
PRINT 'Step 2: Adding current_emp_code...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_scan_logs') AND name = 'current_emp_code')
BEGIN
  ALTER TABLE dbo.attendance_scan_logs ADD current_emp_code NVARCHAR(30) NULL;
  PRINT '  Added: current_emp_code';
END
ELSE
BEGIN
  PRINT '  Already exists: current_emp_code';
END

-- Step 3: Add current_employee_id
PRINT 'Step 3: Adding current_employee_id...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_scan_logs') AND name = 'current_employee_id')
BEGIN
  ALTER TABLE dbo.attendance_scan_logs ADD current_employee_id INT NULL;
  PRINT '  Added: current_employee_id';
END
ELSE
BEGIN
  PRINT '  Already exists: current_employee_id';
END

-- Step 4: Add current_mapping_status
PRINT 'Step 4: Adding current_mapping_status...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_scan_logs') AND name = 'current_mapping_status')
BEGIN
  ALTER TABLE dbo.attendance_scan_logs ADD current_mapping_status NVARCHAR(30) NULL;
  PRINT '  Added: current_mapping_status';
END
ELSE
BEGIN
  PRINT '  Already exists: current_mapping_status';
END

-- Step 5: Add current_mapping_reason
PRINT 'Step 5: Adding current_mapping_reason...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_scan_logs') AND name = 'current_mapping_reason')
BEGIN
  ALTER TABLE dbo.attendance_scan_logs ADD current_mapping_reason NVARCHAR(500) NULL;
  PRINT '  Added: current_mapping_reason';
END
ELSE
BEGIN
  PRINT '  Already exists: current_mapping_reason';
END

-- Step 6: Add current_resolved_at
PRINT 'Step 6: Adding current_resolved_at...';
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_scan_logs') AND name = 'current_resolved_at')
BEGIN
  ALTER TABLE dbo.attendance_scan_logs ADD current_resolved_at DATETIME2 NULL;
  PRINT '  Added: current_resolved_at';
END
ELSE
BEGIN
  PRINT '  Already exists: current_resolved_at';
END

PRINT '';
PRINT '============================================================';
PRINT 'MIGRATION 048 COMPLETED';
PRINT '============================================================';
