USE rebinmas_absensi_monitoring;
GO

-- =============================================================================
-- Updated ZKTeco attendance view using zkteco_hr_employee_map
-- This maps: machine_code + raw_device_user_id -> hr_employee_code
-- =============================================================================

-- Drop existing views
IF OBJECT_ID('vw_attendance_zkteco_final', 'V') IS NOT NULL DROP VIEW vw_attendance_zkteco_final;
IF OBJECT_ID('vw_attendance_zkteco_daily_summary', 'V') IS NOT NULL DROP VIEW vw_attendance_zkteco_daily_summary;
IF OBJECT_ID('vw_attendance_zkteco_monthly_summary', 'V') IS NOT NULL DROP VIEW vw_attendance_zkteco_monthly_summary;
GO

-- Main attendance view with full details
CREATE OR ALTER VIEW vw_attendance_zkteco_final AS
SELECT
  e.employee_code,
  e.employee_name,
  d.division_code,
  COALESCE(g.gang_code, 'N/A') AS gang_code,
  cal.attendance_date,
  CASE WHEN s.id IS NOT NULL THEN 'PRESENT' ELSE 'NO_DATA' END AS attendance_status,
  CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_work,
  0 AS is_leave,
  0 AS is_sick,
  0 AS is_holiday,
  0 AS overtime_hours,
  CASE WHEN s.id IS NOT NULL THEN 'DIRECT_ZKTECO' ELSE 'NO_DATA' END AS source,
  s.machine_code,
  s.raw_device_user_id,
  m.hr_employee_code AS mapped_hr_code
FROM employees e
INNER JOIN divisions d ON d.id = e.division_id
LEFT JOIN gangs g ON g.id = e.gang_id
-- Calendar of all dates that have scan logs
CROSS APPLY (
  SELECT DISTINCT CAST(scan_date AS DATE) AS attendance_date
  FROM attendance_scan_logs
  WHERE scan_date >= DATEADD(day, -90, GETDATE())
) cal
-- Join via mapping table: scan_logs + machine -> mapping -> employee
LEFT JOIN attendance_scan_logs s
  ON s.scan_date = cal.attendance_date
LEFT JOIN zkteco_hr_employee_map m
  ON m.machine_code = s.machine_code
  AND m.zkteco_user_id = s.raw_device_user_id
  AND m.hr_employee_code IS NOT NULL
-- Final join: mapped HR code matches employee code
WHERE e.employee_code = COALESCE(m.hr_employee_code, s.parsed_employee_code);
GO

-- Daily summary view
CREATE OR ALTER VIEW vw_attendance_zkteco_daily_summary AS
SELECT
  cal.attendance_date,
  d.division_code,
  COUNT(DISTINCT e.employee_code) AS total_employees,
  COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN e.employee_code END) AS total_present,
  COUNT(DISTINCT CASE WHEN s.id IS NULL THEN e.employee_code END) AS total_absent,
  0 AS total_leave,
  0 AS total_sick,
  0 AS total_overtime_hours
FROM employees e
INNER JOIN divisions d ON d.id = e.division_id
CROSS APPLY (
  SELECT DISTINCT CAST(scan_date AS DATE) AS attendance_date
  FROM attendance_scan_logs
  WHERE scan_date >= DATEADD(day, -90, GETDATE())
) cal
LEFT JOIN attendance_scan_logs s
  ON s.scan_date = cal.attendance_date
LEFT JOIN zkteco_hr_employee_map m
  ON m.machine_code = s.machine_code
  AND m.zkteco_user_id = s.raw_device_user_id
  AND m.hr_employee_code IS NOT NULL
WHERE e.is_active = 1
AND e.employee_code = COALESCE(m.hr_employee_code, s.parsed_employee_code)
GROUP BY cal.attendance_date, d.division_code;
GO

-- Monthly summary for attendance matrix
CREATE OR ALTER VIEW vw_attendance_zkteco_monthly_summary AS
SELECT
  YEAR(cal.attendance_date) AS attendance_year,
  MONTH(cal.attendance_date) AS attendance_month,
  e.employee_code,
  e.employee_name,
  d.division_code,
  COALESCE(g.gang_code, 'N/A') AS gang_code,
  COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN cal.attendance_date END) AS total_present,
  COUNT(DISTINCT CASE WHEN s.id IS NULL THEN cal.attendance_date END) AS total_absent,
  0 AS total_leave,
  0 AS total_sick,
  0 AS total_overtime_hours
FROM employees e
INNER JOIN divisions d ON d.id = e.division_id
LEFT JOIN gangs g ON g.id = e.gang_id
CROSS APPLY (
  SELECT DISTINCT CAST(scan_date AS DATE) AS attendance_date
  FROM attendance_scan_logs
  WHERE scan_date >= DATEADD(day, -90, GETDATE())
) cal
LEFT JOIN attendance_scan_logs s
  ON s.scan_date = cal.attendance_date
LEFT JOIN zkteco_hr_employee_map m
  ON m.machine_code = s.machine_code
  AND m.zkteco_user_id = s.raw_device_user_id
  AND m.hr_employee_code IS NOT NULL
WHERE e.is_active = 1
AND e.employee_code = COALESCE(m.hr_employee_code, s.parsed_employee_code)
GROUP BY YEAR(cal.attendance_date), MONTH(cal.attendance_date),
     e.employee_code, e.employee_name, d.division_code, g.gang_code;
GO

-- Test the view
PRINT '=== Testing vw_attendance_zkteco_monthly_summary ===';
SELECT TOP 20 * FROM vw_attendance_zkteco_monthly_summary
WHERE attendance_year = 2026 AND attendance_month = 6
ORDER BY division_code, employee_code;

-- Show summary by division
PRINT '';
PRINT '=== Summary by Division (June 2026) ===';
SELECT division_code, COUNT(*) as total_rows, SUM(total_present) as total_present
FROM vw_attendance_zkteco_monthly_summary
WHERE attendance_year = 2026 AND attendance_month = 6
GROUP BY division_code
ORDER BY division_code;

PRINT '';
PRINT 'Updated ZKTeco attendance views successfully';
GO
