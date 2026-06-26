-- Migration 046: Update attendance tables to use canonical employee_id
-- PRD: Refactor Master Employee - Link all attendance data to canonical employee
-- Date: 2026-06-23
-- Author: Claude Code

-- ============================================
-- BEFORE: Audit attendance linkage
-- ============================================
PRINT '==============================================';
PRINT 'AUDIT: Attendance Linkage to Canonical Employee';
PRINT '==============================================';

-- attendance_scan_logs linkage
PRINT '';
PRINT '1. attendance_scan_logs linkage:';
SELECT
  COUNT(*) as total_scan_logs,
  SUM(CASE WHEN employee_id IS NOT NULL THEN 1 ELSE 0 END) as with_employee_id,
  SUM(CASE WHEN employee_id IS NULL THEN 1 ELSE 0 END) as without_employee_id,
  SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) as mapped_status,
  SUM(CASE WHEN mapping_status = 'UNMAPPED' THEN 1 ELSE 0 END) as unmapped_status,
  SUM(CASE WHEN mapping_status = 'NEED_REVIEW' THEN 1 ELSE 0 END) as need_review_status
FROM attendance_scan_logs;

-- Check for records that can be linked
PRINT '';
PRINT '2. Records that CAN be linked but are not:';
SELECT TOP 20
  s.parsed_employee_code,
  s.mapping_status,
  e.id as employee_id_exists,
  COUNT(*) as record_count
FROM attendance_scan_logs s
LEFT JOIN employees e ON e.employee_code = s.parsed_employee_code
WHERE s.employee_id IS NULL
  AND s.mapping_status = 'MAPPED'
GROUP BY s.parsed_employee_code, s.mapping_status, e.id
HAVING e.id IS NOT NULL
ORDER BY COUNT(*) DESC;

PRINT '';
PRINT '==============================================';
PRINT 'END AUDIT';
PRINT '==============================================';

-- GO to execute updates
-- GO

-- ============================================
-- STEP 1: Link scan logs to canonical employee_id
-- ============================================
PRINT '';
PRINT 'Step 1: Linking attendance_scan_logs to employee_id...';

DECLARE @UpdatedScans INT = 0;

UPDATE s
SET s.employee_id = e.id
FROM dbo.attendance_scan_logs s
INNER JOIN dbo.employees e
  ON e.employee_code = s.parsed_employee_code
WHERE s.employee_id IS NULL
  AND s.mapping_status = 'MAPPED'
  AND e.id IS NOT NULL
  AND e.data_quality_status IN ('VALID_STANDARD_FORMAT', 'NORMALIZED_IJL_FORMAT', NULL);

SET @UpdatedScans = @@ROWCOUNT;
PRINT 'Linked ' + CAST(@@UpdatedScans AS VARCHAR) + ' scan logs to employee_id';
GO

-- ============================================
-- STEP 2: Check attendance_imports
-- ============================================
PRINT '';
PRINT 'Step 2: Checking attendance_imports structure...';

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'attendance_imports')
BEGIN
  DECLARE @ImpCols NVARCHAR(MAX);
  SELECT @ImpCols = COALESCE(@ImpCols + ', ', '') + COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'attendance_imports'
  ORDER BY ORDINAL_POSITION;

  PRINT 'attendance_imports columns: ' + @ImpCols;

  -- Add employee_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'attendance_imports' AND COLUMN_NAME = 'employee_id'
  )
  BEGIN
    EXEC('ALTER TABLE dbo.attendance_imports ADD employee_id INT NULL');
    PRINT 'Added employee_id to attendance_imports';
  END

  -- Link attendance_imports
  UPDATE ai
  SET ai.employee_id = e.id
  FROM dbo.attendance_imports ai
  INNER JOIN dbo.employees e
    ON e.employee_code = ai.employee_code
  WHERE ai.employee_id IS NULL
    AND e.id IS NOT NULL
    AND ai.employee_code IS NOT NULL;

  PRINT 'Linked attendance_imports to employee_id';
END
ELSE
BEGIN
  PRINT 'attendance_imports table does not exist - skipping';
END
GO

-- ============================================
-- STEP 3: Create summary views
-- ============================================
PRINT '';
PRINT 'Step 3: Creating attendance summary views...';

IF OBJECT_ID('dbo.vw_attendance_monthly_by_employee', 'V') IS NOT NULL
  DROP VIEW dbo.vw_attendance_monthly_by_employee;
GO

CREATE VIEW dbo.vw_attendance_monthly_by_employee AS
SELECT
  YEAR(s.scan_date) as year,
  MONTH(s.scan_date) as month,
  e.id as employee_id,
  e.employee_code,
  e.employee_name,
  e.nik,
  d.division_code,
  COUNT(*) as total_scans,
  COUNT(DISTINCT s.scan_date) as days_present,
  MIN(s.scan_time) as first_scan,
  MAX(s.scan_time) as last_scan
FROM dbo.attendance_scan_logs s
INNER JOIN dbo.employees e ON e.id = s.employee_id
LEFT JOIN dbo.divisions d ON d.id = e.division_id
WHERE s.employee_id IS NOT NULL
GROUP BY
  YEAR(s.scan_date),
  MONTH(s.scan_date),
  e.id,
  e.employee_code,
  e.employee_name,
  e.nik,
  d.division_code;
GO

PRINT 'Created view: vw_attendance_monthly_by_employee';
GO

-- ============================================
-- VERIFICATION
-- ============================================
PRINT '';
PRINT 'Verification:';

SELECT
  (SELECT COUNT(*) FROM dbo.attendance_scan_logs) as total_scan_logs,
  (SELECT COUNT(*) FROM dbo.attendance_scan_logs WHERE employee_id IS NOT NULL) as with_employee_id,
  (SELECT COUNT(*) FROM dbo.attendance_scan_logs WHERE employee_id IS NULL) as without_employee_id,
  (SELECT COUNT(DISTINCT employee_id) FROM dbo.attendance_scan_logs WHERE employee_id IS NOT NULL) as unique_employees;

PRINT '';
PRINT 'Migration 046 completed!';
GO
