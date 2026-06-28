-- Migration 079: Backfill scan_map DB_PTRJ resolution + link attendance_imports.raw_scan_log_id
-- Cascade: parsed_emp_code → employees(nik) → hr_reference(type=current, emp_code)
-- Baseline: 789959/808093 (97.8%) already resolved. This fills the remaining gaps + NULL resolution_status.

-- 1. Backfill current_emp_code/name/nik/resolution for rows where parsed_emp_code matches employees
UPDATE sm
SET
  current_emp_code = COALESCE(h.emp_code, sm.parsed_emp_code),
  current_emp_name = COALESCE(h.emp_name, e.employee_name),
  resolved_nik = e.nik,
  resolution_status = CASE
    WHEN h.is_ambiguous = 1 THEN 'AMBIGUOUS'
    WHEN h.emp_code IS NOT NULL THEN 'MAPPED'
    WHEN e.nik IS NULL OR LTRIM(RTRIM(e.nik))='' THEN 'NEED_REVIEW'
    ELSE 'NEED_REVIEW'
  END,
  resolution_method = CASE
    WHEN h.emp_code IS NOT NULL THEN 'db_ptrj_hr_nik_cascade'
    WHEN e.nik IS NOT NULL THEN 'nik_no_hr_current_match'
    ELSE 'parsed_only_no_nik'
  END,
  resolved_at = SYSUTCDATETIME()
FROM scan_map sm
INNER JOIN employees e ON e.employee_code = sm.parsed_emp_code
LEFT JOIN hr_reference h ON h.nik = e.nik AND h.type = 'current'
WHERE sm.current_emp_code IS NULL
  AND sm.parsed_emp_code IS NOT NULL;
GO

-- 2. Set resolution_status for rows still NULL (parsed_emp_code null = raw 6-digit new hires)
UPDATE scan_map
SET resolution_status = 'NEED_REVIEW',
    resolution_method = COALESCE(resolution_method, 'no_parsed_emp_code'),
    resolved_at = COALESCE(resolved_at, SYSUTCDATETIME())
WHERE resolution_status IS NULL;
GO

-- 3. Link attendance_imports.raw_scan_log_id from scan_map (currently 82% NULL)
-- Match: employee_code + attendance_date → scan_map row
UPDATE ai
SET raw_scan_log_id = sm.scan_log_id
FROM attendance_imports ai
INNER JOIN scan_map sm ON sm.current_emp_code = ai.employee_code
INNER JOIN attendance_raw r ON r.id = sm.scan_log_id
WHERE ai.raw_scan_log_id IS NULL
  AND CAST(r.scan_date AS DATE) = ai.attendance_date;
GO

-- Verify
SELECT 'current_emp_code not null' AS metric, COUNT(*) c FROM scan_map WHERE current_emp_code IS NOT NULL
UNION ALL SELECT 'resolution_status set', COUNT(*) FROM scan_map WHERE resolution_status IS NOT NULL
UNION ALL SELECT 'imports raw_scan_log_id linked', COUNT(*) FROM attendance_imports WHERE raw_scan_log_id IS NOT NULL;
GO
