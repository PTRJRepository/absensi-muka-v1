-- Migration: 073_normalize_mapping_status_and_current_emp_code.sql
-- Date: 2026-06-25
-- Purpose: Fix 3 database-level issues:
--   1. mapping_status inconsistency: AUTO_MAPPED → MAPPED (sync scripts vs pipeline)
--   2. employees.current_emp_code backfill from hr_employee_current_snapshot via NIK
--   3. attendance_scan_logs.current_emp_code / current_employee_id / current_mapping_status
--      populate from employees for records that have parsed_employee_code

SET NOCOUNT ON;
PRINT '=== Migration 073: Normalize mapping_status + current_emp_code ===';
PRINT '';

-- ============================================================
-- STEP 1: Fix mapping_status consistency
-- Problem: sync scripts write 'AUTO_MAPPED', all pipelines filter on 'MAPPED'
-- ============================================================
PRINT 'Step 1: Normalizing mapping_status AUTO_MAPPED → MAPPED...';

DECLARE @autoMapped INT = 0;
SELECT @autoMapped = COUNT(*) FROM dbo.attendance_scan_logs WHERE mapping_status = 'AUTO_MAPPED';
PRINT '  Records with AUTO_MAPPED: ' + CAST(@autoMapped AS VARCHAR);

IF @autoMapped > 0
BEGIN
    UPDATE dbo.attendance_scan_logs
    SET mapping_status = 'MAPPED'
    WHERE mapping_status = 'AUTO_MAPPED';
    PRINT '  [OK] Converted ' + CAST(@@ROWCOUNT AS VARCHAR) + ' AUTO_MAPPED → MAPPED';
END
ELSE
    PRINT '  [SKIP] No AUTO_MAPPED records found';

-- ============================================================
-- STEP 2: Backfill employees.current_emp_code from HR snapshot
-- Problem: employees.current_emp_code is NULL for many employees.
-- Flow:  employees.nik → hr_employee_current_snapshot.nik → current_emp_code
-- ============================================================
PRINT '';
PRINT 'Step 2: Backfilling employees.current_emp_code from HR snapshot...';

-- 2a: Check if hr_employee_current_snapshot exists and has data
DECLARE @snapshotExists INT = 0;
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'hr_employee_current_snapshot')
    SELECT @snapshotExists = COUNT(*) FROM dbo.hr_employee_current_snapshot;

PRINT '  hr_employee_current_snapshot rows: ' + CAST(@snapshotExists AS VARCHAR);

IF @snapshotExists > 0
BEGIN
    UPDATE e
    SET
        e.current_emp_code = snap.current_emp_code,
        e.current_emp_name = snap.current_emp_name,
        e.current_hr_loc_code = snap.current_loc_code,
        e.current_hr_create_date = snap.current_create_date,
        e.current_hr_update_date = snap.current_update_date,
        e.current_resolution_status = CASE
            WHEN snap.is_ambiguous = 1 THEN 'NIK_DUPLICATE_AMBIGUOUS'
            ELSE 'MAPPED_CURRENT'
        END,
        e.current_resolution_method = 'snapshot_lookup_073',
        e.current_resolution_reason = CASE
            WHEN snap.is_ambiguous = 1 THEN 'NIK ambiguous - tiebreaker: update_date DESC, create_date DESC'
            ELSE 'Backfilled via NIK from hr_employee_current_snapshot'
        END,
        e.current_resolved_at = SYSUTCDATETIME()
    FROM dbo.employees e
    INNER JOIN dbo.hr_employee_current_snapshot snap
        ON snap.nik = e.nik
    WHERE e.nik IS NOT NULL
      AND e.nik != ''
      AND (e.current_emp_code IS NULL
           OR e.current_emp_code = ''
           OR e.current_emp_code = e.employee_code);  -- also update if current = same (stale)

    PRINT '  [OK] Updated ' + CAST(@@ROWCOUNT AS VARCHAR) + ' employees with current_emp_code from HR snapshot';
END
ELSE
    PRINT '  [WARN] hr_employee_current_snapshot is empty or doesn''t exist';

-- 2b: For employees where current_emp_code is still NULL, set to employee_code (self)
UPDATE e
SET
    e.current_emp_code = e.employee_code,
    e.current_emp_name = e.employee_name,
    e.current_resolution_status = 'PARSED_ONLY',
    e.current_resolution_method = 'self_reference_073',
    e.current_resolution_reason = 'No HR snapshot NIK match - using own employee_code',
    e.current_resolved_at = SYSUTCDATETIME()
FROM dbo.employees e
WHERE (e.current_emp_code IS NULL OR e.current_emp_code = '')
  AND e.employee_code IS NOT NULL
  AND e.employee_code != '';

PRINT '  [OK] Self-referenced ' + CAST(@@ROWCOUNT AS VARCHAR) + ' employees (current_emp_code = employee_code)';

-- ============================================================
-- STEP 3: Populate attendance_scan_logs.current_emp_code / current_employee_id
-- Problem: migration 048 added columns but sync scripts never populate them.
-- New records from sync have NULL current_emp_code.
-- ============================================================
PRINT '';
PRINT 'Step 3: Populating scan_logs current_emp_code from employees...';

-- 3a: Via parsed_employee_code → employees.employee_code → employees.current_emp_code
--     This is the NIK resolution cascade: parsed → employee → current_emp_code
UPDATE sl
SET
    sl.current_emp_code = e.current_emp_code,
    sl.current_employee_id = e_curr.id,
    sl.current_mapping_status = CASE
        WHEN e_curr.id IS NOT NULL THEN 'MAPPED'
        WHEN e.current_emp_code IS NOT NULL AND e_curr.id IS NULL THEN 'NEED_REVIEW'
        ELSE 'NEED_REVIEW'
    END,
    sl.current_mapping_reason = CASE
        WHEN e_curr.id IS NOT NULL THEN 'NIK_RESOLVED_VIA_CURRENT_EMP_CODE'
        WHEN e.current_emp_code IS NOT NULL AND e_curr.id IS NULL
            THEN 'CURRENT_EMP_CODE_NOT_IN_EMPLOYEES_TABLE'
        ELSE 'NO_CURRENT_EMP_CODE_AVAILABLE'
    END,
    sl.current_resolved_at = SYSUTCDATETIME()
FROM dbo.attendance_scan_logs sl
INNER JOIN dbo.employees e
    ON e.employee_code = sl.parsed_employee_code
LEFT JOIN dbo.employees e_curr
    ON e_curr.employee_code = e.current_emp_code
    AND e_curr.is_active = 1
    AND e_curr.employee_code != e.employee_code  -- only if different
WHERE sl.parsed_employee_code IS NOT NULL
  AND sl.parsed_employee_code != ''
  AND sl.current_emp_code IS NULL;

PRINT '  [OK] Populated ' + CAST(@@ROWCOUNT AS VARCHAR) + ' scan_logs with current_emp_code via parsed_employee_code';

-- 3b: Via raw_device_user_id → employees.zkteco_user_id (direct match fallback)
UPDATE sl
SET
    sl.current_emp_code = e.current_emp_code,
    sl.current_employee_id = e.id,
    sl.current_mapping_status = 'MAPPED',
    sl.current_mapping_reason = 'DIRECT_MATCH_VIA_ZKTECO_USER_ID',
    sl.current_resolved_at = SYSUTCDATETIME()
FROM dbo.attendance_scan_logs sl
INNER JOIN dbo.employees e
    ON LTRIM(RTRIM(e.zkteco_user_id)) = LTRIM(RTRIM(sl.raw_device_user_id))
WHERE sl.current_emp_code IS NULL
  AND e.zkteco_user_id IS NOT NULL
  AND e.zkteco_user_id != '';

PRINT '  [OK] Populated ' + CAST(@@ROWCOUNT AS VARCHAR) + ' scan_logs via zkteco_user_id direct match';

-- 3c: Mark remaining NULL as NEED_REVIEW with reason
UPDATE dbo.attendance_scan_logs
SET
    current_mapping_status = 'NEED_REVIEW',
    current_mapping_reason = CASE
        WHEN parsed_employee_code IS NULL AND LEN(LTRIM(RTRIM(ISNULL(raw_device_user_id, '')))) <= 5
            THEN 'RAW_ID_TOO_SHORT_EXCLUDED'
        WHEN parsed_employee_code IS NULL AND LEN(LTRIM(RTRIM(ISNULL(raw_device_user_id, '')))) > 5
            THEN 'LONG_RAW_ID_NO_PREFIX_LOOKUP_REQUIRED'
        WHEN parsed_employee_code IS NOT NULL AND parsed_employee_code != ''
            THEN 'PARSED_CODE_NOT_FOUND_IN_EMPLOYEES'
        ELSE 'UNSUPPORTED_FORMAT'
    END,
    current_resolved_at = SYSUTCDATETIME()
WHERE current_emp_code IS NULL
  AND current_mapping_status IS NULL;

PRINT '  [OK] Marked ' + CAST(@@ROWCOUNT AS VARCHAR) + ' remaining scan_logs as NEED_REVIEW';

-- ============================================================
-- STEP 4: Verification
-- ============================================================
PRINT '';
PRINT '=== Verification ===';

PRINT '';
PRINT '--- attendance_scan_logs mapping_status distribution ---';
SELECT
    mapping_status,
    COUNT(*) AS cnt
FROM dbo.attendance_scan_logs
GROUP BY mapping_status
ORDER BY cnt DESC;

PRINT '';
PRINT '--- attendance_scan_logs current_mapping_status distribution ---';
SELECT
    current_mapping_status,
    COUNT(*) AS cnt
FROM dbo.attendance_scan_logs
GROUP BY current_mapping_status
ORDER BY cnt DESC;

PRINT '';
PRINT '--- employees current_emp_code population ---';
SELECT
    COUNT(*) AS total_employees,
    SUM(CASE WHEN current_emp_code IS NOT NULL AND current_emp_code != '' THEN 1 ELSE 0 END) AS has_current_emp_code,
    SUM(CASE WHEN current_emp_code IS NULL OR current_emp_code = '' THEN 1 ELSE 0 END) AS missing_current_emp_code,
    SUM(CASE WHEN nik IS NOT NULL AND nik != '' THEN 1 ELSE 0 END) AS has_nik,
    SUM(CASE WHEN current_emp_code != employee_code AND current_emp_code IS NOT NULL THEN 1 ELSE 0 END) AS code_changed_from_original
FROM dbo.employees
WHERE is_active = 1;

PRINT '';
PRINT '--- Sample: employees with changed codes (NIK-resolved) ---';
SELECT TOP 10
    employee_code,
    current_emp_code,
    employee_name,
    current_emp_name,
    nik,
    current_resolution_status,
    current_resolution_method
FROM dbo.employees
WHERE current_emp_code IS NOT NULL
  AND current_emp_code != employee_code
  AND is_active = 1
ORDER BY id DESC;

PRINT '';
PRINT '=== Migration 073 complete ===';