USE rebinmas_absensi_monitoring;
GO

-- =============================================================================
-- Fix UNMAPPED scan logs
-- Problem: IJL employees use IT API format (0010001), but scan logs were parsed
--          to ZKTeco format (L10086) which doesn't match.
-- Solution: For UNMAPPED records where raw_device_user_id directly matches
--           employee_code, update parsed_employee_code to use raw_device_user_id
-- =============================================================================

PRINT '=== Step 1: Fix UNMAPPED records ===';

-- Preview: How many can be fixed
SELECT
  s.machine_code,
  COUNT(*) as fixable_count
FROM attendance_scan_logs s
WHERE s.mapping_status = 'UNMAPPED'
AND EXISTS (
  SELECT 1 FROM employees e
  WHERE e.employee_code = s.raw_device_user_id
)
GROUP BY s.machine_code;

-- Actually fix the UNMAPPED records
UPDATE s
SET s.parsed_employee_code = s.raw_device_user_id,
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Direct match with employees table - IT API format'
FROM attendance_scan_logs s
WHERE s.mapping_status = 'UNMAPPED'
AND EXISTS (
  SELECT 1 FROM employees e
  WHERE e.employee_code = s.raw_device_user_id
);

-- Verify: Check remaining UNMAPPED count
SELECT
  mapping_status,
  COUNT(*) as cnt
FROM attendance_scan_logs
GROUP BY mapping_status;

PRINT 'UNMAPPED records fixed!';
GO
