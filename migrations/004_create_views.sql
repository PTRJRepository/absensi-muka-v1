USE rebinmas_absensi_monitoring;
GO

CREATE OR ALTER VIEW vw_attendance_final AS
SELECT
  e.employee_code,
  e.employee_name,
  d.division_code,
  g.gang_code,
  calendar.attendance_date,
  COALESCE(c.attendance_status, i.attendance_status, 'NO_DATA') AS attendance_status,
  COALESCE(c.has_work, i.has_work, CONVERT(bit,0)) AS has_work,
  COALESCE(c.is_leave, i.is_leave, CONVERT(bit,0)) AS is_leave,
  COALESCE(c.is_sick, i.is_sick, CONVERT(bit,0)) AS is_sick,
  COALESCE(c.is_holiday, i.is_holiday, CONVERT(bit,0)) AS is_holiday,
  COALESCE(c.overtime_hours, i.overtime_hours, 0) AS overtime_hours,
  CASE WHEN c.id IS NOT NULL THEN 'MANUAL_CORRECTION' WHEN i.id IS NOT NULL THEN i.source ELSE 'NO_DATA' END AS source,
  CASE WHEN c.id IS NOT NULL AND i.id IS NOT NULL THEN CONVERT(bit,1) ELSE CONVERT(bit,0) END AS has_conflict,
  i.id AS import_id,
  c.id AS correction_id
FROM employees e
JOIN divisions d ON d.id = e.division_id
LEFT JOIN gangs g ON g.id = e.gang_id
CROSS APPLY (
  SELECT DISTINCT attendance_date FROM attendance_imports
  UNION
  SELECT DISTINCT attendance_date FROM attendance_manual_corrections WHERE is_deleted = 0
) calendar
LEFT JOIN attendance_imports i ON i.employee_code = e.employee_code AND i.attendance_date = calendar.attendance_date
LEFT JOIN attendance_manual_corrections c ON c.employee_code = e.employee_code AND c.attendance_date = calendar.attendance_date AND c.is_deleted = 0;
GO

CREATE OR ALTER VIEW vw_attendance_daily_summary AS
SELECT
  attendance_date,
  division_code,
  COUNT(*) AS total_employees,
  SUM(CASE WHEN attendance_status = 'PRESENT' THEN 1 ELSE 0 END) AS total_present,
  SUM(CASE WHEN attendance_status = 'ABSENT' OR attendance_status = 'NO_DATA' THEN 1 ELSE 0 END) AS total_absent,
  SUM(CASE WHEN is_leave = 1 THEN 1 ELSE 0 END) AS total_leave,
  SUM(CASE WHEN is_sick = 1 THEN 1 ELSE 0 END) AS total_sick,
  SUM(overtime_hours) AS total_overtime_hours
FROM vw_attendance_final
GROUP BY attendance_date, division_code;
GO

CREATE OR ALTER VIEW vw_attendance_monthly_summary AS
SELECT
  YEAR(attendance_date) AS attendance_year,
  MONTH(attendance_date) AS attendance_month,
  employee_code,
  employee_name,
  division_code,
  gang_code,
  SUM(CASE WHEN attendance_status = 'PRESENT' THEN 1 ELSE 0 END) AS total_present,
  SUM(CASE WHEN attendance_status = 'ABSENT' OR attendance_status = 'NO_DATA' THEN 1 ELSE 0 END) AS total_absent,
  SUM(CASE WHEN is_leave = 1 THEN 1 ELSE 0 END) AS total_leave,
  SUM(CASE WHEN is_sick = 1 THEN 1 ELSE 0 END) AS total_sick,
  SUM(overtime_hours) AS total_overtime_hours
FROM vw_attendance_final
GROUP BY YEAR(attendance_date), MONTH(attendance_date), employee_code, employee_name, division_code, gang_code;
GO

CREATE OR ALTER VIEW vw_sync_latest_status AS
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY COALESCE(machine_code, division_code, source) ORDER BY started_at DESC) AS rn
  FROM attendance_sync_logs
)
SELECT
  id,
  sync_type,
  source,
  machine_id,
  machine_code,
  division_code,
  status,
  failure_category,
  started_at,
  finished_at,
  duration_ms,
  records_synced,
  error_message,
  is_dry_run
FROM ranked
WHERE rn = 1;
GO
