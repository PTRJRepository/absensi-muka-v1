-- Migration 044: Backfill employee_machine_enrollments
-- PRD: Refactor Master Employee - Populate bridge table from existing data
-- Date: 2026-06-23
-- Author: Claude Code

-- ============================================
-- STEP 1: Dry Run - Count before execution
-- ============================================
PRINT '==============================================';
PRINT 'DRY RUN: Backfill employee_machine_enrollments';
PRINT '==============================================';

-- Count potential enrollments from zkteco_hr_employee_map
PRINT '';
PRINT 'Source: zkteco_hr_employee_map';
SELECT
  COUNT(DISTINCT zm.machine_code + ':' + zm.zkteco_user_id) as unique_enrollments,
  COUNT(DISTINCT zm.hr_employee_code) as unique_employees,
  COUNT(DISTINCT zm.machine_code) as unique_machines
FROM dbo.zkteco_hr_employee_map zm
WHERE zm.hr_employee_code IS NOT NULL
  AND zm.hr_employee_code != ''
  AND zm.is_active = 1;

-- Count potential enrollments from zkteco_absensi_user_registry
PRINT '';
PRINT 'Source: zkteco_absensi_user_registry';
SELECT
  COUNT(*) as total_registry_entries,
  SUM(machine_count) as total_enrollments,
  COUNT(DISTINCT hr_employee_code) as mapped_employees
FROM dbo.zkteco_absensi_user_registry
WHERE hr_employee_code IS NOT NULL;

-- Count employees that will NOT be linked (raw IDs, unmapped)
PRINT '';
PRINT 'Employees NOT in mapping (will have no enrollments):';
SELECT COUNT(*) as unmapped_count
FROM dbo.employees e
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.zkteco_hr_employee_map zm
  WHERE zm.hr_employee_code = e.employee_code
    AND zm.is_active = 1
);

PRINT '';
PRINT '==============================================';
PRINT 'END DRY RUN - Run with "GO" to execute';
PRINT '==============================================';

-- UNCOMMENT THE FOLLOWING TO EXECUTE:
-- GO

-- ============================================
-- STEP 2: Backfill from zkteco_hr_employee_map
-- ============================================
PRINT '';
PRINT 'Step 2: Backfilling from zkteco_hr_employee_map...';

SET IDENTITY_INSERT dbo.employee_machine_enrollments ON;

INSERT INTO dbo.employee_machine_enrollments (
  id,
  employee_id,
  employee_code,
  machine_id,
  machine_code,
  raw_device_user_id,
  zkteco_user_name,
  parsed_employee_code,
  scanner_prefix,
  loc_code,
  mapping_status,
  mapping_confidence,
  mapping_reason,
  name_similarity_score,
  is_primary_machine,
  is_active,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
)
SELECT
  NEWID() % 2147483647 as id,  -- temp id, will be overwritten by identity
  e.id as employee_id,
  e.employee_code,
  m.id as machine_id,
  zm.machine_code,
  zm.zkteco_user_id,
  zm.zkteco_user_name,
  NULL as parsed_employee_code,  -- will be computed by parser
  NULL as scanner_prefix,  -- will be computed by parser
  NULL as loc_code,
  CASE
    WHEN zm.match_confidence = 'EXACT' THEN 'MAPPED'
    WHEN zm.match_confidence = 'STRONG' THEN 'MAPPED'
    WHEN zm.match_confidence = 'WEAK' THEN 'NEED_REVIEW'
    WHEN zm.match_confidence = 'NONE' THEN 'UNMAPPED'
    ELSE zm.match_confidence
  END as mapping_status,
  zm.match_confidence,
  zm.match_method + ' mapping from legacy zkteco_hr_employee_map',
  NULL as name_similarity_score,
  1 as is_primary_machine,  -- First enrollment is primary
  zm.is_active,
  zm.created_at as first_seen_at,
  zm.updated_at as last_seen_at,
  zm.created_at as created_at,
  zm.updated_at as updated_at
FROM dbo.zkteco_hr_employee_map zm
INNER JOIN dbo.employees e
  ON e.employee_code = zm.hr_employee_code
LEFT JOIN dbo.attendance_machines m
  ON m.machine_code = zm.machine_code
WHERE zm.hr_employee_code IS NOT NULL
  AND zm.hr_employee_code != ''
  AND zm.is_active = 1
  AND e.id IS NOT NULL
ON DUPLICATE KEY UPDATE id = id;

SET IDENTITY_INSERT dbo.employee_machine_enrollments OFF;

PRINT 'Backfilled enrollments from zkteco_hr_employee_map';
GO

-- ============================================
-- STEP 3: Mark primary machines
-- ============================================
PRINT '';
PRINT 'Step 3: Marking primary machines...';

-- Mark the machine with most scans as primary for each employee
WITH PrimaryMachines AS (
  SELECT
    employee_id,
    machine_code,
    ROW_NUMBER() OVER (
      PARTITION BY employee_id
      ORDER BY COUNT(*) DESC, MAX(last_seen_at) DESC
    ) as rn
  FROM dbo.employee_machine_enrollments
  WHERE is_active = 1
  GROUP BY employee_id, machine_code
)
UPDATE eme
SET is_primary_machine = 1
FROM dbo.employee_machine_enrollments eme
INNER JOIN PrimaryMachines pm
  ON pm.employee_id = eme.employee_id
  AND pm.machine_code = eme.machine_code
WHERE pm.rn = 1;

PRINT 'Primary machines marked';
GO

-- ============================================
-- STEP 4: Backfill employee_id to attendance_scan_logs
-- ============================================
PRINT '';
PRINT 'Step 4: Backfilling employee_id to attendance_scan_logs...';

UPDATE s
SET s.employee_id = e.id
FROM dbo.attendance_scan_logs s
INNER JOIN dbo.employees e
  ON e.employee_code = s.parsed_employee_code
WHERE s.employee_id IS NULL
  AND s.mapping_status = 'MAPPED'
  AND e.id IS NOT NULL;

PRINT 'Updated ' + CAST(@@ROWCOUNT AS VARCHAR) + ' scan logs with employee_id';
GO

-- ============================================
-- STEP 5: Verify counts
-- ============================================
PRINT '';
PRINT 'Step 5: Verification counts...';

SELECT
  (SELECT COUNT(*) FROM dbo.employee_machine_enrollments) as total_enrollments,
  (SELECT COUNT(DISTINCT employee_id) FROM dbo.employee_machine_enrollments) as employees_with_enrollments,
  (SELECT COUNT(*) FROM dbo.employees WHERE is_raw_id = 1) as raw_id_employees,
  (SELECT COUNT(*) FROM dbo.employees WHERE is_raw_id = 0) as valid_employees,
  (SELECT COUNT(*) FROM dbo.attendance_scan_logs WHERE employee_id IS NOT NULL) as scan_logs_with_employee_id;

PRINT '';
PRINT 'Migration 044 backfill completed!';
GO
