PRINT 'Creating vw_attendance_monthly_matrix...';
GO

CREATE OR ALTER VIEW vw_attendance_monthly_matrix AS
SELECT
  cal.attendance_year,
  cal.attendance_month,
  cal.attendance_date,
  e.id AS employee_id,
  e.employee_code,
  e.employee_name,
  d.division_code,
  d.division_name,
  COALESCE(g.gang_code, 'N/A') AS gang_code,
  z.zkteco_status,
  z.zkteco_check_in,
  z.zkteco_check_out,
  z.zkteco_machine_code,
  imp.attendance_status AS db_status,
  imp.check_in_at AS db_check_in,
  imp.check_out_at AS db_check_out,
  imp.source AS db_source,
  CASE
    WHEN mc.id IS NOT NULL THEN mc.attendance_status
    WHEN imp.attendance_status IS NOT NULL THEN imp.attendance_status
    WHEN z.zkteco_status IS NOT NULL THEN z.zkteco_status
    ELSE 'NO_DATA'
  END AS final_status,
  COALESCE(mc.check_in_at, imp.check_in_at, z.zkteco_check_in) AS final_check_in,
  COALESCE(mc.check_out_at, imp.check_out_at, z.zkteco_check_out) AS final_check_out,
  CASE
    WHEN mc.id IS NOT NULL THEN 'MANUAL_CORRECTION'
    WHEN imp.id IS NOT NULL THEN imp.source
    WHEN z.zkteco_status IS NOT NULL THEN 'DIRECT_ZKTECO'
    ELSE 'NO_DATA'
  END AS source,
  COALESCE(mc.is_leave, imp.is_leave, 0) AS is_leave,
  COALESCE(mc.is_sick, imp.is_sick, 0) AS is_sick,
  COALESCE(mc.is_holiday, imp.is_holiday, 0) AS is_holiday,
  COALESCE(mc.overtime_hours, imp.overtime_hours, 0) AS overtime_hours
FROM (
  SELECT DISTINCT
    YEAR(attendance_date) AS attendance_year,
    MONTH(attendance_date) AS attendance_month,
    attendance_date
  FROM attendance_imports
  UNION
  SELECT DISTINCT
    YEAR(CAST(scan_date AS DATE)) AS attendance_year,
    MONTH(CAST(scan_date AS DATE)) AS attendance_month,
    CAST(scan_date AS DATE) AS attendance_date
  FROM attendance_scan_logs
) cal
CROSS JOIN employees e
INNER JOIN divisions d ON d.id = e.division_id
LEFT JOIN gangs g ON g.id = e.gang_id
LEFT JOIN (
  SELECT
    CAST(scan_date AS DATE) AS scan_date,
    COALESCE(parsed_employee_code, raw_device_user_id) AS employee_code,
    'PRESENT' AS zkteco_status,
    MIN(scan_time) AS zkteco_check_in,
    MAX(scan_time) AS zkteco_check_out
  FROM attendance_scan_logs
  WHERE (parsed_employee_code IS NOT NULL OR raw_device_user_id IS NOT NULL)
  GROUP BY CAST(scan_date AS DATE), COALESCE(parsed_employee_code, raw_device_user_id)
) z ON z.scan_date = cal.attendance_date AND z.employee_code = e.employee_code
LEFT JOIN attendance_imports imp ON imp.employee_code = e.employee_code
  AND imp.attendance_date = cal.attendance_date
LEFT JOIN attendance_manual_corrections mc ON mc.employee_code = e.employee_code
  AND mc.attendance_date = cal.attendance_date
  AND mc.is_deleted = 0
WHERE e.is_active = 1;
GO

PRINT 'Creating vw_attendance_monthly_summary_v2...';
GO

CREATE OR ALTER VIEW vw_attendance_monthly_summary_v2 AS
SELECT
  attendance_year,
  attendance_month,
  employee_id,
  employee_code,
  employee_name,
  division_code,
  division_name,
  gang_code,
  COUNT(*) AS total_days,
  SUM(CASE WHEN final_status = 'PRESENT' THEN 1 ELSE 0 END) AS total_present,
  SUM(CASE WHEN final_status = 'ABSENT' THEN 1 ELSE 0 END) AS total_absent,
  SUM(CASE WHEN final_status = 'NO_DATA' THEN 1 ELSE 0 END) AS total_no_data,
  SUM(CASE WHEN is_leave = 1 THEN 1 ELSE 0 END) AS total_leave,
  SUM(CASE WHEN is_sick = 1 THEN 1 ELSE 0 END) AS total_sick,
  SUM(CASE WHEN is_holiday = 1 THEN 1 ELSE 0 END) AS total_holiday,
  SUM(overtime_hours) AS total_overtime_hours,
  SUM(CASE WHEN source = 'DIRECT_ZKTECO' THEN 1 ELSE 0 END) AS days_from_zkteco,
  SUM(CASE WHEN source = 'IT_SOLUTION_API' THEN 1 ELSE 0 END) AS days_from_api,
  SUM(CASE WHEN source = 'MANUAL_CORRECTION' THEN 1 ELSE 0 END) AS days_from_manual,
  SUM(CASE WHEN source = 'NO_DATA' THEN 1 ELSE 0 END) AS days_no_data
FROM vw_attendance_monthly_matrix
GROUP BY attendance_year, attendance_month, employee_id, employee_code, employee_name,
         division_code, division_name, gang_code;
GO

PRINT 'Monthly matrix views created successfully!';
GO
