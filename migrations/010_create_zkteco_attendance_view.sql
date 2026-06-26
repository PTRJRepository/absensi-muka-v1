USE rebinmas_absensi_monitoring;
GO

-- =============================================================================
-- ZKTeco-native attendance view using direct scan logs
-- Key insight: attendance_scan_logs.parsed_employee_code matches employees.employee_code
-- Both are in ZKTeco format (e.g., "A0044", not IT API format "0010001")
-- =============================================================================

-- Create a calendar table function approach using CROSS APPLY
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
  s.machine_code
FROM employees e
INNER JOIN divisions d ON d.id = e.division_id
LEFT JOIN gangs g ON g.id = e.gang_id
-- Calendar of all dates that have scan logs
CROSS APPLY (
  SELECT DISTINCT CAST(scan_date AS DATE) AS attendance_date
  FROM attendance_scan_logs
  WHERE scan_date >= DATEADD(day, -60, GETDATE())  -- Last 60 days only for performance
) cal
-- Scan logs joined on parsed_employee_code (ZKTeco format)
LEFT JOIN attendance_scan_logs s
  ON s.parsed_employee_code = e.employee_code
  AND s.scan_date = cal.attendance_date;
GO

-- =============================================================================
-- ZKTeco-native daily summary
-- =============================================================================

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
  WHERE scan_date >= DATEADD(day, -60, GETDATE())
) cal
LEFT JOIN attendance_scan_logs s
  ON s.parsed_employee_code = e.employee_code
  AND s.scan_date = cal.attendance_date
WHERE e.is_active = 1
GROUP BY cal.attendance_date, d.division_code;
GO

-- =============================================================================
-- ZKTeco-native monthly summary for attendance matrix
-- =============================================================================

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
  ON s.parsed_employee_code = e.employee_code
  AND s.scan_date = cal.attendance_date
WHERE e.is_active = 1
GROUP BY YEAR(cal.attendance_date), MONTH(cal.attendance_date),
     e.employee_code, e.employee_name, d.division_code, g.gang_code;
GO

PRINT 'Created ZKTeco-native attendance views successfully';
