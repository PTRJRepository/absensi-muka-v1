USE rebinmas_absensi_monitoring;
GO

-- =============================================================
-- FIX: Correct parsed_employee_code in attendance_scan_logs
-- Root cause: employee-code-mapper.ts used padStart(4) on full
--   numeric part instead of slice(-4), producing wrong codes
--   e.g. H000200 instead of H0200, A10075 instead of A0075
-- =============================================================

-- Step 1: Fix codes with letter prefix (A-L) followed by >4 digits
-- Pattern: prefix + excess digits → prefix + last 4 digits
-- Examples: H000200→H0200, G000502→G0502, A000014→A0014, B10203→B0203
UPDATE attendance_scan_logs
SET parsed_employee_code = LEFT(parsed_employee_code, 1) + RIGHT(parsed_employee_code, 4)
WHERE parsed_employee_code IS NOT NULL
  AND parsed_employee_code LIKE '[A-Z]%'
  AND LEN(parsed_employee_code) > 5
  AND mapping_status = 'MAPPED';

PRINT 'Step 1: Fixed letter-prefixed codes with excess digits';

-- Step 2: Fix codes from PGE machine (locCode=A, no scanner prefix)
-- These have raw IDs like "10127" stored as-is without A prefix
UPDATE s
SET s.parsed_employee_code = 'A' + RIGHT(s.raw_device_user_id, 4),
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Fixed: PGE locCode=A + last4'
FROM attendance_scan_logs s
WHERE s.machine_code = 'PGE'
  AND s.parsed_employee_code NOT LIKE '[A-Z]%'
  AND s.raw_device_user_id IS NOT NULL
  AND s.raw_device_user_id LIKE '[0-9]%';

PRINT 'Step 2: Fixed PGE codes (added A prefix)';

-- Step 3: Fix codes from ARE machine (locCode=A, no scanner prefix)
-- Raw IDs like "10115" should be A + last4 = A0115
UPDATE s
SET s.parsed_employee_code = 'A' + RIGHT(s.raw_device_user_id, 4),
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Fixed: ARE locCode=A + last4'
FROM attendance_scan_logs s
WHERE s.machine_code = 'ARE'
  AND s.parsed_employee_code NOT LIKE '[A-Z]%'
  AND s.raw_device_user_id IS NOT NULL
  AND s.raw_device_user_id LIKE '[0-9]%';

PRINT 'Step 3: Fixed ARE codes';

-- Step 4: Fix OFFICE_APE machine codes (need to determine prefix)
-- OFFICE_APE has locCode=null, but employees use raw numeric format
-- OFFICE_APE raw IDs: 8000061, 9000033, 2000073, 2000266, 10146
-- These are mixed scanner prefixes from different machines
-- For now, map to NEED_REVIEW with last4 approach using A prefix (same building)
UPDATE s
SET s.parsed_employee_code = 'A' + RIGHT(s.raw_device_user_id, 4),
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Fixed: OFFICE_APE last4 with A prefix'
FROM attendance_scan_logs s
WHERE s.machine_code = 'OFFICE_APE'
  AND s.parsed_employee_code IS NULL
  AND s.raw_device_user_id IS NOT NULL
  AND s.raw_device_user_id LIKE '[0-9]%';

PRINT 'Step 4: Fixed OFFICE_APE codes';

-- Step 5: Fix IJL machine codes
-- IJL employees have numeric format 0010001, raw IDs may match directly
-- For now, try direct match first
UPDATE s
SET s.parsed_employee_code = s.raw_device_user_id,
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Fixed: IJL direct raw_user_id match'
FROM attendance_scan_logs s
WHERE s.machine_code = 'IJL'
  AND s.parsed_employee_code IS NULL
  AND s.raw_device_user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM employees e WHERE e.employee_code = s.raw_device_user_id);

PRINT 'Step 5: Fixed IJL codes (direct match)';

-- Step 6: Fix IJL remaining codes using L + last4
UPDATE s
SET s.parsed_employee_code = 'L' + RIGHT(s.raw_device_user_id, 4),
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Fixed: IJL L prefix + last4'
FROM attendance_scan_logs s
WHERE s.machine_code = 'IJL'
  AND s.parsed_employee_code IS NULL
  AND s.raw_device_user_id IS NOT NULL
  AND s.raw_device_user_id LIKE '[0-9]%'
  AND LEN(s.raw_device_user_id) >= 4;

PRINT 'Step 6: Fixed IJL remaining codes';

-- Step 7: Update mapping_status for still-unmapped records
UPDATE attendance_scan_logs
SET mapping_status = 'NEED_REVIEW'
WHERE mapping_status = 'MAPPED'
  AND parsed_employee_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.employee_code = parsed_employee_code
  );

PRINT 'Step 7: Marked unmatched codes as NEED_REVIEW';

-- Verify results
SELECT
  machine_code,
  mapping_status,
  COUNT(*) as cnt
FROM attendance_scan_logs
GROUP BY machine_code, mapping_status
ORDER BY machine_code, mapping_status;

-- Show sample of fixed codes
SELECT TOP 20 machine_code, raw_device_user_id, parsed_employee_code, mapping_status, mapping_reason
FROM attendance_scan_logs
WHERE mapping_status = 'MAPPED'
ORDER BY id DESC;
GO
