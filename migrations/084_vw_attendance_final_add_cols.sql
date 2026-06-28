-- Migration 084: Add source_reference + raw_scan_log_id to vw_attendance_final
-- Card popup needs real machine_code (source_reference) not just source.
-- Also backfix attendance_imports.check_in/out to raw_record_time UTC (done separately).

IF OBJECT_ID('dbo.vw_attendance_final','V') IS NOT NULL DROP VIEW dbo.vw_attendance_final;
GO
CREATE VIEW dbo.vw_attendance_final AS
SELECT
  e.employee_code,
  e.employee_name,
  d.division_code,
  'N/A' AS gang_code,
  cal.attendance_date,
  COALESCE(i.attendance_status, 'NO_DATA') AS attendance_status,
  COALESCE(i.has_work, CONVERT(bit,0)) AS has_work,
  COALESCE(i.is_leave, CONVERT(bit,0)) AS is_leave,
  COALESCE(i.is_sick, CONVERT(bit,0)) AS is_sick,
  COALESCE(i.is_holiday, CONVERT(bit,0)) AS is_holiday,
  COALESCE(i.overtime_hours, 0) AS overtime_hours,
  COALESCE(i.source, 'NO_DATA') AS source,
  i.source_reference AS source_reference,
  CONVERT(bit,0) AS has_conflict,
  i.id AS import_id,
  i.check_in_at,
  i.check_out_at,
  i.employee_id,
  i.raw_scan_log_id
FROM employees e
INNER JOIN divisions d ON d.id = e.division_id
CROSS APPLY (
  SELECT DISTINCT attendance_date
  FROM attendance_imports
  WHERE attendance_imports.employee_code = e.employee_code
) cal
LEFT JOIN attendance_imports i ON i.employee_code = e.employee_code AND i.attendance_date = cal.attendance_date;
GO
SELECT TOP 1 employee_code, source_reference, check_in_at, check_out_at FROM vw_attendance_final WHERE source_reference IS NOT NULL;
GO
