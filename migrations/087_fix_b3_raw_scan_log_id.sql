-- Migration 087: Fix B3 regression from migration 086
-- 086 B3 JOIN pakai scan_map.resolved_at (tanggal sync) ≠ attendance_imports.attendance_date (tanggal absen)
-- → 229 rows still NULL. Rewrite JOIN pakai attendance_raw.scan_date via scan_map.scan_log_id -> raw.id
-- scan_map.scan_log_id = attendance_raw.id (FK). raw.scan_date = tanggal absen WIB.

-- Backfill raw_scan_log_id: link import to raw scan via (emp_code, scan_date)
-- Pick MIN raw id (first scan of day) as representative link per (emp, date)
UPDATE ai
SET ai.raw_scan_log_id = rid.raw_id
FROM attendance_imports ai
INNER JOIN (
  SELECT sm.current_emp_code AS emp_code,
         CAST(r.scan_date AS DATE) AS scan_date,
         MIN(r.id) AS raw_id
  FROM scan_map sm
  INNER JOIN attendance_raw r ON r.id = sm.scan_log_id
  WHERE sm.current_emp_code IS NOT NULL
    AND r.scan_date IS NOT NULL
  GROUP BY sm.current_emp_code, CAST(r.scan_date AS DATE)
) rid
  ON rid.emp_code = ai.employee_code
  AND rid.scan_date = ai.attendance_date
WHERE ai.raw_scan_log_id IS NULL;
