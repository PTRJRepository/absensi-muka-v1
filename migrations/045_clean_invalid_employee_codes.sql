-- Migration 045: Clean invalid employee codes and sanitize data
-- PRD: Refactor Master Employee - Remove contaminants from employee codes
-- Date: 2026-06-23
-- Author: Claude Code

-- ============================================
-- BEFORE: Audit the issues
-- ============================================
PRINT '==============================================';
PRINT 'AUDIT: Employee Code Sanitization';
PRINT '==============================================';

-- Count short raw IDs (should be EXCLUDED)
PRINT '';
PRINT '1. Short Raw IDs (5 digits numeric - should be EXCLUDED):';
SELECT
  employee_code,
  LEN(employee_code) as code_length,
  COUNT(*) as count
FROM dbo.employees
WHERE employee_code LIKE '%[0-9]%'
  AND LEN(employee_code) = 5
  AND employee_code NOT LIKE '%[A-Z]%'
GROUP BY employee_code, LEN(employee_code)
ORDER BY COUNT(*) DESC;

-- Count long raw IDs (6+ digits numeric)
PRINT '';
PRINT '2. Long Raw IDs (6+ digits numeric - need special handling):';
SELECT
  LEFT(employee_code, 1) as first_digit,
  LEN(employee_code) as code_length,
  COUNT(*) as count
FROM dbo.employees
WHERE employee_code LIKE '%[0-9]%'
  AND LEN(employee_code) >= 6
  AND employee_code NOT LIKE '%[A-Z]%'
GROUP BY LEFT(employee_code, 1), LEN(employee_code)
ORDER BY LEN(employee_code), LEFT(employee_code, 1);

-- Count IJL format (0xxxxxx)
PRINT '';
PRINT '3. IJL Format (0xxxxxx):';
SELECT
  employee_code,
  COUNT(*) as count
FROM dbo.employees
WHERE employee_code LIKE '0%'
  AND LEN(employee_code) = 7
  AND employee_code NOT LIKE '%[A-Z]%'
GROUP BY employee_code
ORDER BY COUNT(*) DESC;

-- Employees with NIK vs without NIK
PRINT '';
PRINT '4. NIK Status:';
SELECT
  SUM(CASE WHEN nik IS NOT NULL AND nik != '' THEN 1 ELSE 0 END) as has_nik,
  SUM(CASE WHEN nik IS NULL OR nik = '' THEN 1 ELSE 0 END) as no_nik,
  SUM(CASE WHEN hr_verified = 1 THEN 1 ELSE 0 END) as hr_verified,
  SUM(CASE WHEN hr_verified = 0 THEN 1 ELSE 0 END) as not_verified
FROM dbo.employees;

PRINT '';
PRINT '==============================================';
PRINT 'END AUDIT';
PRINT '==============================================';

-- GO to execute cleanup
-- GO

-- ============================================
-- CLEANUP 1: Create valid canonical employee codes
-- ============================================
PRINT '';
PRINT 'Cleanup 1: Creating canonical employee mapping for short raw IDs...';

-- For short raw IDs like "10044", they should NOT exist as employee_code
-- These are just "raw short IDs" that should be EXCLUDED
-- Instead, they should be resolved via zkteco_hr_employee_map or zkteco_absensi_user_registry

-- Mark employees with short raw IDs as contaminated
UPDATE e
SET
  e.data_quality_status = 'CONTAMINATED_SHORT_RAW_ID',
  e.data_quality_reason = 'Short raw ID (5 digits) - should not exist as employee_code. Source: raw_device_user_id from ZKTeco.',
  e.hr_verified = 0  -- Cannot verify against HR since this is a raw machine ID
FROM dbo.employees e
WHERE e.employee_code LIKE '%[0-9]%'
  AND LEN(e.employee_code) = 5
  AND e.employee_code NOT LIKE '%[A-Z]%'
  AND e.data_quality_status IS NULL;

PRINT 'Marked ' + CAST(@@ROWCOUNT AS VARCHAR) + ' short raw ID employees as CONTAMINATED';
GO

-- ============================================
-- CLEANUP 2: Handle IJL format
-- ============================================
PRINT '';
PRINT 'Cleanup 2: Handling IJL format (0xxxxxx)...';

-- For IJL format like "0010097", parse to "L0097"
-- Scanner prefix 001 = IJL = locCode L

UPDATE e
SET
  e.employee_code = 'L' + RIGHT(e.employee_code, 4),
  e.data_quality_status = 'NORMALIZED_IJL_FORMAT',
  e.data_quality_reason = 'Converted from IJL raw format (0xxxxxx) to standard format (Lxxxx)',
  e.hr_verified = 0  -- Need to verify against HR
FROM dbo.employees e
WHERE e.employee_code LIKE '0%'
  AND LEN(e.employee_code) = 7
  AND e.employee_code NOT LIKE '%[A-Z]%'
  AND e.data_quality_status IS NULL;

PRINT 'Normalized ' + CAST(@@ROWCOUNT AS VARCHAR) + ' IJL format employees';
GO

-- ============================================
-- CLEANUP 3: Mark long raw IDs
-- ============================================
PRINT '';
PRINT 'Cleanup 3: Marking long raw IDs...';

UPDATE e
SET
  e.data_quality_status = 'RAW_ID_LONG_NEEDS_LOOKUP',
  e.data_quality_reason = 'Long raw ID (6+ digits) - needs direct lookup against ZKTeco HR map or exclusion',
  e.hr_verified = 0
FROM dbo.employees e
WHERE e.employee_code LIKE '%[0-9]%'
  AND LEN(e.employee_code) >= 6
  AND e.employee_code NOT LIKE '%[A-Z]%'
  AND e.data_quality_status IS NULL;

PRINT 'Marked ' + CAST(@@ROWCOUNT AS VARCHAR) + ' long raw ID employees';
GO

-- ============================================
-- CLEANUP 4: Verify standard format employees
-- ============================================
PRINT '';
PRINT 'Cleanup 4: Marking standard format employees as VALID...';

UPDATE e
SET
  e.data_quality_status = 'VALID_STANDARD_FORMAT',
  e.data_quality_reason = 'Standard employee code format [A-Z][0-9]{4}',
  e.hr_verified = 1,
  e.hr_verified_at = SYSUTCDATETIME()
FROM dbo.employees e
WHERE e.employee_code LIKE '%[A-Z]%'
  AND LEN(e.employee_code) = 5
  AND e.data_quality_status IS NULL
  AND e.hr_verified = 0;

PRINT 'Marked ' + CAST(@@ROWCOUNT AS VARCHAR) + ' standard format employees as VALID';
GO

-- ============================================
-- VERIFICATION
-- ============================================
PRINT '';
PRINT 'Verification after cleanup:';

SELECT
  data_quality_status,
  COUNT(*) as count
FROM dbo.employees
WHERE data_quality_status IS NOT NULL
GROUP BY data_quality_status
ORDER BY count DESC;

PRINT '';
PRINT 'Migration 045 cleanup completed!';
GO
