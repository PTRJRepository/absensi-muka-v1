-- Migration 081: Fix broken legacy views (ref dropped attendance_manual_corrections)
-- Root cause: vw_attendance_final LEFT JOIN attendance_manual_corrections (DROPPED Phase B)
-- Fix: recreate WITHOUT corrections ref, base on attendance_imports + employees + divisions
-- Consumers: reports.routes.ts, dashboard.routes.ts

-- 1. Drop all broken views (cascade)
IF OBJECT_ID('dbo.vw_attendance_monthly_summary_v2','V') IS NOT NULL DROP VIEW dbo.vw_attendance_monthly_summary_v2;
IF OBJECT_ID('dbo.vw_attendance_monthly_summary','V') IS NOT NULL DROP VIEW dbo.vw_attendance_monthly_summary;
IF OBJECT_ID('dbo.vw_attendance_daily_summary','V') IS NOT NULL DROP VIEW dbo.vw_attendance_daily_summary;
IF OBJECT_ID('dbo.vw_attendance_final','V') IS NOT NULL DROP VIEW dbo.vw_attendance_final;
IF OBJECT_ID('dbo.vw_attendance_zkteco_daily_summary','V') IS NOT NULL DROP VIEW dbo.vw_attendance_zkteco_daily_summary;
IF OBJECT_ID('dbo.vw_attendance_zkteco_monthly_summary','V') IS NOT NULL DROP VIEW dbo.vw_attendance_zkteco_monthly_summary;
GO

-- 2. Recreate vw_attendance_final (NO corrections — they were dropped, 0 rows existed)
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
  CONVERT(bit,0) AS has_conflict,
  i.id AS import_id,
  i.check_in_at,
  i.check_out_at,
  i.employee_id
FROM employees e
INNER JOIN divisions d ON d.id = e.division_id
CROSS APPLY (
  SELECT DISTINCT attendance_date
  FROM attendance_imports
  WHERE attendance_imports.employee_code = e.employee_code
) cal
LEFT JOIN attendance_imports i ON i.employee_code = e.employee_code AND i.attendance_date = cal.attendance_date;
GO

-- 3. Recreate vw_attendance_daily_summary (layer final)
CREATE VIEW dbo.vw_attendance_daily_summary AS
SELECT
  attendance_date,
  division_code,
  COUNT(*) AS total_employees,
  SUM(CASE WHEN attendance_status = 'HADIR' THEN 1 ELSE 0 END) AS total_present,
  SUM(CASE WHEN attendance_status IN ('INCOMPLETE_SCAN','NO_DATA') THEN 1 ELSE 0 END) AS total_absent,
  SUM(CASE WHEN is_leave = 1 THEN 1 ELSE 0 END) AS total_leave,
  SUM(CASE WHEN is_sick = 1 THEN 1 ELSE 0 END) AS total_sick,
  SUM(overtime_hours) AS total_overtime_hours
FROM vw_attendance_final
GROUP BY attendance_date, division_code;
GO

-- 4. Recreate vw_attendance_monthly_summary (layer final)
CREATE VIEW dbo.vw_attendance_monthly_summary AS
SELECT
  YEAR(attendance_date) AS attendance_year,
  MONTH(attendance_date) AS attendance_month,
  employee_code,
  employee_name,
  division_code,
  gang_code,
  SUM(CASE WHEN attendance_status = 'HADIR' THEN 1 ELSE 0 END) AS total_present,
  SUM(CASE WHEN attendance_status IN ('INCOMPLETE_SCAN','NO_DATA') THEN 1 ELSE 0 END) AS total_absent,
  SUM(CASE WHEN is_leave = 1 THEN 1 ELSE 0 END) AS total_leave,
  SUM(CASE WHEN is_sick = 1 THEN 1 ELSE 0 END) AS total_sick,
  SUM(overtime_hours) AS total_overtime_hours
FROM vw_attendance_final
GROUP BY YEAR(attendance_date), MONTH(attendance_date), employee_code, employee_name, division_code, gang_code;
GO

-- 5. Recreate vw_attendance_zkteco_daily_summary (scan-based, no CROSS APPLY all dates)
CREATE VIEW dbo.vw_attendance_zkteco_daily_summary AS
SELECT
  s.scan_date AS attendance_date,
  s.machine_code AS division_code,
  COUNT(*) AS total_scans,
  COUNT(DISTINCT sm.parsed_emp_code) AS unique_employees,
  MIN(s.scan_time) AS first_scan,
  MAX(s.scan_time) AS last_scan
FROM attendance_raw s
LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
GROUP BY s.scan_date, s.machine_code;
GO

-- 6. Recreate vw_attendance_zkteco_monthly_summary
CREATE VIEW dbo.vw_attendance_zkteco_monthly_summary AS
SELECT
  YEAR(s.scan_date) AS attendance_year,
  MONTH(s.scan_date) AS attendance_month,
  s.machine_code AS division_code,
  COUNT(*) AS total_scans,
  COUNT(DISTINCT sm.parsed_emp_code) AS unique_employees,
  MIN(s.scan_time) AS first_scan,
  MAX(s.scan_time) AS last_scan
FROM attendance_raw s
LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
GROUP BY YEAR(s.scan_date), MONTH(s.scan_date), s.machine_code;
GO

-- 7. Verify all
SELECT name FROM sys.views WHERE name LIKE 'vw_attendance%' ORDER BY name;
GO
