-- Migration: 072_backfill_parsed_employee_code.sql
-- Date: 2026-06-25
-- Purpose: Backfill parsed_employee_code, parsed_division_code, mapping_status,
--          mapping_reason for existing attendance_scan_logs records using SSOT rules
-- Source: src/modules/mapping/zkteco-employee-code-parser.ts

PRINT '=== Running migration 072: Backfill parsed_employee_code ===';

-- Step 1: Already-parsed format (A0044, B0232, etc.)
-- Pattern: single letter + 4 digits = already employee code
UPDATE sl
SET
    sl.parsed_employee_code = sl.raw_device_user_id,
    sl.parsed_division_code = LEFT(sl.raw_device_user_id, 1),
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'RAW_ID_ALREADY_EMPLOYEE_CODE'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND sl.raw_device_user_id LIKE '[A-Z][0-9][0-9][0-9][0-9]';

PRINT '  [OK] Backfilled already-parsed employee codes';

-- Step 2: Numeric IDs with scanner prefix (length > 5)
-- Scanner prefix → locCode: 001→L, 100→A, 200→J, 300→B, 400→H, 500→C, 600→D, 700→E, 800→F, 900→G
-- Algorithm: strip 3-digit prefix, take last 4 digits of suffix, pad to 4, prepend locCode
UPDATE sl
SET
    sl.parsed_employee_code = 'L' + RIGHT(SUBSTRING(sl.raw_device_user_id, 4, LEN(sl.raw_device_user_id) - 3), 4),
    sl.parsed_division_code = 'L',
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'PARSED_SCANNER_PREFIX_001_LOC_L'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(sl.raw_device_user_id) > 5
  AND sl.raw_device_user_id LIKE '001%';

UPDATE sl
SET
    sl.parsed_employee_code = 'A' + RIGHT(SUBSTRING(sl.raw_device_user_id, 4, LEN(sl.raw_device_user_id) - 3), 4),
    sl.parsed_division_code = 'A',
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'PARSED_SCANNER_PREFIX_100_LOC_A'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(sl.raw_device_user_id) > 5
  AND sl.raw_device_user_id LIKE '100%';

UPDATE sl
SET
    sl.parsed_employee_code = 'J' + RIGHT(SUBSTRING(sl.raw_device_user_id, 4, LEN(sl.raw_device_user_id) - 3), 4),
    sl.parsed_division_code = 'J',
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'PARSED_SCANNER_PREFIX_200_LOC_J'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(sl.raw_device_user_id) > 5
  AND sl.raw_device_user_id LIKE '200%';

UPDATE sl
SET
    sl.parsed_employee_code = 'B' + RIGHT(SUBSTRING(sl.raw_device_user_id, 4, LEN(sl.raw_device_user_id) - 3), 4),
    sl.parsed_division_code = 'B',
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'PARSED_SCANNER_PREFIX_300_LOC_B'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(sl.raw_device_user_id) > 5
  AND sl.raw_device_user_id LIKE '300%';

UPDATE sl
SET
    sl.parsed_employee_code = 'H' + RIGHT(SUBSTRING(sl.raw_device_user_id, 4, LEN(sl.raw_device_user_id) - 3), 4),
    sl.parsed_division_code = 'H',
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'PARSED_SCANNER_PREFIX_400_LOC_H'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(sl.raw_device_user_id) > 5
  AND sl.raw_device_user_id LIKE '400%';

UPDATE sl
SET
    sl.parsed_employee_code = 'C' + RIGHT(SUBSTRING(sl.raw_device_user_id, 4, LEN(sl.raw_device_user_id) - 3), 4),
    sl.parsed_division_code = 'C',
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'PARSED_SCANNER_PREFIX_500_LOC_C'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(sl.raw_device_user_id) > 5
  AND sl.raw_device_user_id LIKE '500%';

UPDATE sl
SET
    sl.parsed_employee_code = 'D' + RIGHT(SUBSTRING(sl.raw_device_user_id, 4, LEN(sl.raw_device_user_id) - 3), 4),
    sl.parsed_division_code = 'D',
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'PARSED_SCANNER_PREFIX_600_LOC_D'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(sl.raw_device_user_id) > 5
  AND sl.raw_device_user_id LIKE '600%';

UPDATE sl
SET
    sl.parsed_employee_code = 'E' + RIGHT(SUBSTRING(sl.raw_device_user_id, 4, LEN(sl.raw_device_user_id) - 3), 4),
    sl.parsed_division_code = 'E',
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'PARSED_SCANNER_PREFIX_700_LOC_E'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(sl.raw_device_user_id) > 5
  AND sl.raw_device_user_id LIKE '700%';

UPDATE sl
SET
    sl.parsed_employee_code = 'F' + RIGHT(SUBSTRING(sl.raw_device_user_id, 4, LEN(sl.raw_device_user_id) - 3), 4),
    sl.parsed_division_code = 'F',
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'PARSED_SCANNER_PREFIX_800_LOC_F'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(sl.raw_device_user_id) > 5
  AND sl.raw_device_user_id LIKE '800%';

UPDATE sl
SET
    sl.parsed_employee_code = 'G' + RIGHT(SUBSTRING(sl.raw_device_user_id, 4, LEN(sl.raw_device_user_id) - 3), 4),
    sl.parsed_division_code = 'G',
    sl.mapping_status = 'AUTO_MAPPED',
    sl.mapping_reason = 'PARSED_SCANNER_PREFIX_900_LOC_G'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(sl.raw_device_user_id) > 5
  AND sl.raw_device_user_id LIKE '900%';

PRINT '  [OK] Backfilled scanner-prefix parsed employee codes';

-- Step 3: Short IDs (<=5 digits) → EXCLUDED from auto-mapping
UPDATE sl
SET
    sl.mapping_status = 'NEED_REVIEW',
    sl.mapping_reason = 'RAW_ID_TOO_SHORT_EXCLUDED'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND sl.mapping_status = 'NEED_REVIEW'
  AND sl.raw_device_user_id LIKE '%[0-9]%'
  AND LEN(sl.raw_device_user_id) <= 5;

PRINT '  [OK] Marked short IDs as NEED_REVIEW';

-- Step 4: Long numeric IDs without scanner prefix → NEED_REVIEW (needs lookup)
UPDATE sl
SET
    sl.mapping_status = 'NEED_REVIEW',
    sl.mapping_reason = 'LONG_RAW_ID_NO_PREFIX_LOOKUP_REQUIRED'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND sl.mapping_status = 'NEED_REVIEW'
  AND sl.raw_device_user_id LIKE '%[0-9]%'
  AND LEN(sl.raw_device_user_id) > 5;

PRINT '  [OK] Marked long no-prefix IDs as NEED_REVIEW';

-- Step 5: Remaining unmapped non-numeric → UNSUPPORTED_FORMAT
UPDATE sl
SET
    sl.mapping_status = 'NEED_REVIEW',
    sl.mapping_reason = 'UNSUPPORTED_FORMAT'
FROM dbo.attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND sl.mapping_reason IS NULL;

PRINT '  [OK] Marked unsupported format IDs as NEED_REVIEW';

-- Step 6: Verification
PRINT '';
PRINT '=== Backfill Verification ===';

SELECT
    'AUTO_MAPPED' AS mapping_status,
    COUNT(*) AS cnt
FROM dbo.attendance_scan_logs
WHERE mapping_status = 'AUTO_MAPPED'
UNION ALL
SELECT 'NEED_REVIEW', COUNT(*)
FROM dbo.attendance_scan_logs
WHERE mapping_status = 'NEED_REVIEW';

-- Sample: show parsed codes
PRINT '';
PRINT '=== Sample parsed employee codes ===';
SELECT TOP 20
    raw_device_user_id,
    machine_code,
    parsed_employee_code,
    parsed_division_code,
    mapping_status,
    mapping_reason
FROM dbo.attendance_scan_logs
WHERE parsed_employee_code IS NOT NULL
ORDER BY id DESC;

PRINT '';
PRINT '=== Migration 072 complete ===';