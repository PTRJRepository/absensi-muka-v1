USE rebinmas_absensi_monitoring;
GO

-- =============================================================================
-- FIX: Scan logs with IT API format raw_device_user_id should use that as parsed_employee_code
-- Because employees.employee_code is ALSO in IT API format!
--
-- The UNMAPPED scan logs have raw_device_user_id like "0010017" which DIRECTLY MATCHES
-- employees.employee_code "0010017"
-- =============================================================================

PRINT '=== Step 1: Update parsed_employee_code for UNMAPPED records ===';
PRINT 'These records have IT API format raw IDs that match employee codes directly';

BEGIN TRANSACTION;

-- Update parsed_employee_code where raw_device_user_id matches an employee
UPDATE s
SET s.parsed_employee_code = LTRIM(RTRIM(s.raw_device_user_id)),
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Direct match with employees table'
FROM attendance_scan_logs s
WHERE s.mapping_status = 'UNMAPPED'
AND EXISTS (
  SELECT 1 FROM employees e
  WHERE e.employee_code = LTRIM(RTRIM(s.raw_device_user_id))
);

PRINT 'Updated UNMAPPED records that directly match employee codes';

-- Verify the update
SELECT TOP 10
  raw_device_user_id,
  parsed_employee_code,
  mapping_status,
  mapping_reason
FROM attendance_scan_logs
WHERE mapping_status = 'MAPPED'
ORDER BY id DESC;

PRINT '=== Step 2: Statistics after update ===';

SELECT
  mapping_status,
  COUNT(*) as count
FROM attendance_scan_logs
GROUP BY mapping_status;

-- Check if parsed_employee_code now matches employees
SELECT TOP 10
  s.parsed_employee_code,
  e.employee_code,
  e.employee_name,
  COUNT(*) as cnt
FROM attendance_scan_logs s
JOIN employees e ON e.employee_code = s.parsed_employee_code
GROUP BY s.parsed_employee_code, e.employee_code, e.employee_name
ORDER BY cnt DESC;

COMMIT TRANSACTION;
GO

-- =============================================================================
-- Step 2: Update the ZKTeco view to handle IT API format codes
-- The view should use raw_device_user_id directly when parsed_employee_code is null
-- =============================================================================

PRINT '=== Step 3: Update ZKTeco views to handle both formats ===';

DROP VIEW IF EXISTS vw_attendance_zkteco_final;
GO

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
  WHERE scan_date >= DATEADD(day, -90, GETDATE())
) cal
-- Scan logs joined on parsed_employee_code (now matches employees.employee_code!)
LEFT JOIN attendance_scan_logs s
  ON (s.parsed_employee_code = e.employee_code OR s.raw_device_user_id = e.employee_code)
  AND s.scan_date = cal.attendance_date;
GO

DROP VIEW IF EXISTS vw_attendance_zkteco_monthly_summary;
GO

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
  ON (s.parsed_employee_code = e.employee_code OR s.raw_device_user_id = e.employee_code)
  AND s.scan_date = cal.attendance_date
WHERE e.is_active = 1
GROUP BY YEAR(cal.attendance_date), MONTH(cal.attendance_date),
     e.employee_code, e.employee_name, d.division_code, g.gang_code;
GO

DROP VIEW IF EXISTS vw_attendance_zkteco_daily_summary;
GO

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
  ON (s.parsed_employee_code = e.employee_code OR s.raw_device_user_id = e.employee_code)
  AND s.scan_date = cal.attendance_date
WHERE e.is_active = 1
GROUP BY cal.attendance_date, d.division_code;
GO

PRINT 'Fixed! Scan logs now match employees correctly.';
