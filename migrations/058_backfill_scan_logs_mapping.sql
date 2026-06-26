-- Migration 058: Backfill attendance_scan_logs mapping columns
-- Populates:
--   1. parsed_employee_code — via SSOT parser (scanner prefix → locCode + last4)
--   2. current_emp_code    — via employees table join on zkteco_user_id or employee_code
--   3. employee_id          — FK to employees.id
--   4. current_mapping_status — derived from current_emp_code presence
-- Run only once. Idempotent (uses UPDATE WHERE NULL).

-- STEP 1: Parse parsed_employee_code via SSOT scanner prefix logic
-- Scanner prefix → locCode: 100→A, 200→J, 300→B, 400→H, 500→C, 600→D, 700→E, 800→F, 900→G
BEGIN TRY
BEGIN TRANSACTION BackfillScanLogs;

PRINT 'Step 1: Backfilling parsed_employee_code...';
UPDATE sl
SET sl.parsed_employee_code = CASE
    WHEN LEN(LTRIM(RTRIM(sl.raw_device_user_id))) = 5
      THEN NULL
    WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '100'
      THEN 'A' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
    WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '200'
      THEN 'J' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
    WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '300'
      THEN 'B' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
    WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '400'
      THEN 'H' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
    WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '500'
      THEN 'C' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
    WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '600'
      THEN 'D' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
    WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '700'
      THEN 'E' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
    WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '800'
      THEN 'F' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
    WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '900'
      THEN 'G' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
    WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '001'
      THEN 'L' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
    ELSE NULL
  END,
  sl.mapping_status = CASE
    WHEN
      CASE
        WHEN LEN(LTRIM(RTRIM(sl.raw_device_user_id))) = 5 THEN NULL
        WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '100'
          THEN 'A' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
        WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '200'
          THEN 'J' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
        WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '300'
          THEN 'B' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
        WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '400'
          THEN 'H' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
        WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '500'
          THEN 'C' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
        WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '600'
          THEN 'D' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
        WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '700'
          THEN 'E' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
        WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '800'
          THEN 'F' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
        WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '900'
          THEN 'G' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
        WHEN LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) = '001'
          THEN 'L' + RIGHT('0000' + RIGHT(LTRIM(RTRIM(sl.raw_device_user_id)), 4), 4)
        ELSE NULL
      END IS NULL
    THEN 'NEED_REVIEW'
    ELSE sl.mapping_status
  END
FROM attendance_scan_logs sl
WHERE sl.parsed_employee_code IS NULL
  AND LEN(LTRIM(RTRIM(ISNULL(sl.raw_device_user_id, '')))) > 5
  AND LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 1) IN ('1','2','3','4','5','6','7','8','9','0')
  AND LEFT(LTRIM(RTRIM(sl.raw_device_user_id)), 3) IN ('100','200','300','400','500','600','700','800','900','001');

PRINT 'Step 1 done.';

-- STEP 2: Backfill current_emp_code via employees table (employees.zkteco_user_id = scan_logs.raw_device_user_id)
PRINT 'Step 2a: Backfilling current_emp_code via zkteco_user_id join...';
UPDATE sl
SET
  sl.current_emp_code = emp.current_emp_code,
  sl.employee_id = emp.id,
  sl.current_mapping_status = CASE WHEN emp.current_emp_code IS NOT NULL THEN 'MAPPED' ELSE 'NEED_REVIEW' END,
  sl.current_mapping_reason = CASE
    WHEN emp.current_emp_code IS NOT NULL THEN 'MAPPED_VIA_EMPLOYEES_ZKTECO_USER_ID'
    ELSE 'CURRENT_EMP_CODE_NOT_FOUND'
  END,
  sl.current_resolved_at = SYSUTCDATETIME()
FROM attendance_scan_logs sl
INNER JOIN employees emp
  ON LTRIM(RTRIM(emp.zkteco_user_id)) = LTRIM(RTRIM(sl.raw_device_user_id))
WHERE sl.current_emp_code IS NULL;

PRINT 'Step 2a done.';

-- STEP 2b: Backfill remaining via employees table (employees.employee_code = scan_logs.parsed_employee_code)
PRINT 'Step 2b: Backfilling current_emp_code via employee_code join...';
UPDATE sl
SET
  sl.current_emp_code = emp.current_emp_code,
  sl.employee_id = emp.id,
  sl.current_mapping_status = CASE WHEN emp.current_emp_code IS NOT NULL THEN 'MAPPED' ELSE 'NEED_REVIEW' END,
  sl.current_mapping_reason = CASE
    WHEN emp.current_emp_code IS NOT NULL THEN 'MAPPED_VIA_EMPLOYEES_EMP_CODE'
    ELSE 'CURRENT_EMP_CODE_NOT_FOUND'
  END,
  sl.current_resolved_at = SYSUTCDATETIME()
FROM attendance_scan_logs sl
INNER JOIN employees emp
  ON LTRIM(RTRIM(emp.employee_code)) = LTRIM(RTRIM(sl.parsed_employee_code))
WHERE sl.current_emp_code IS NULL
  AND sl.parsed_employee_code IS NOT NULL;

PRINT 'Step 2b done.';

-- STEP 3: Mark remaining unmapped as NEED_REVIEW
PRINT 'Step 3: Marking unmapped records...';
UPDATE sl
SET
  sl.current_mapping_status = CASE
    WHEN LEN(LTRIM(RTRIM(ISNULL(sl.raw_device_user_id, '')))) <= 5 THEN 'EXCLUDED_SHORT_ID'
    WHEN sl.current_emp_code IS NULL THEN 'NEED_REVIEW'
    ELSE sl.current_mapping_status
  END,
  sl.current_mapping_reason = CASE
    WHEN sl.current_emp_code IS NULL
      AND LEN(LTRIM(RTRIM(ISNULL(sl.raw_device_user_id, '')))) <= 5
      THEN 'RAW_ID_TOO_SHORT_EXCLUDED'
    WHEN sl.current_emp_code IS NULL
      AND LEN(LTRIM(RTRIM(ISNULL(sl.raw_device_user_id, '')))) > 5
      THEN 'CURRENT_EMP_CODE_NOT_FOUND_IN_EMPLOYEES'
    ELSE sl.current_mapping_reason
  END,
  sl.current_resolved_at = SYSUTCDATETIME()
FROM attendance_scan_logs sl
WHERE sl.current_mapping_status IS NULL;

PRINT 'Step 3 done.';

COMMIT TRANSACTION BackfillScanLogs;

-- Verification
PRINT '';
PRINT '=== Backfill Complete ===';
SELECT
  COUNT(*) AS total_logs,
  SUM(CASE WHEN parsed_employee_code IS NOT NULL THEN 1 ELSE 0 END) AS has_parsed,
  SUM(CASE WHEN current_emp_code IS NOT NULL THEN 1 ELSE 0 END) AS has_current_code,
  SUM(CASE WHEN employee_id IS NOT NULL THEN 1 ELSE 0 END) AS has_employee_id,
  SUM(CASE WHEN current_mapping_status = 'MAPPED' THEN 1 ELSE 0 END) AS mapped,
  SUM(CASE WHEN current_mapping_status = 'NEED_REVIEW' THEN 1 ELSE 0 END) AS need_review,
  SUM(CASE WHEN current_mapping_status = 'EXCLUDED_SHORT_ID' THEN 1 ELSE 0 END) AS excluded_short
FROM attendance_scan_logs;

END TRY
BEGIN CATCH
  ROLLBACK TRANSACTION BackfillScanLogs;
  PRINT 'ERROR: ' + ERROR_MESSAGE();
  THROW;
END CATCH;
