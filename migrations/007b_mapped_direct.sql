-- ============================================================
-- Step 2: Insert MAPPED records - direct match only
-- (simple insert - no complex OR/CASE JOIN)
-- ============================================================

SET NOCOUNT ON;

PRINT 'Inserting MAPPED records (direct match)...';

INSERT INTO attendance_imports (
  employee_id, employee_code, division_code,
  attendance_date, attendance_year, attendance_month,
  check_in_at, check_out_at,
  attendance_status, has_work,
  source, source_reference, batch_id, needs_manual_review
)
SELECT TOP 500
  e.id AS employee_id,
  e.employee_code,
  ISNULL(d.division_code, s.parsed_division_code),
  s.scan_date,
  YEAR(s.scan_date),
  MONTH(s.scan_date),
  MIN(s.scan_time),
  MAX(s.scan_time),
  CASE WHEN COUNT(*) >= 2 THEN 'HADIR' ELSE 'TIDAK_HADIR' END,
  CASE WHEN COUNT(*) >= 2 THEN 1 ELSE 0 END,
  'ZKTECO',
  s.machine_code,
  s.sync_batch_id,
  0
FROM attendance_scan_logs s
JOIN employees e ON e.employee_code = s.parsed_employee_code
LEFT JOIN divisions d ON d.id = e.division_id
WHERE s.mapping_status = 'MAPPED'
  AND s.parsed_employee_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM attendance_imports ai
    WHERE ai.employee_code = s.parsed_employee_code
      AND ai.attendance_date = s.scan_date
      AND ai.source_reference = s.machine_code
  )
GROUP BY e.id, e.employee_code, d.division_code, s.parsed_division_code,
         s.scan_date, s.machine_code, s.sync_batch_id;

PRINT 'MAPPED (direct) inserted: ' + CAST(@@ROWCOUNT AS VARCHAR);
GO
