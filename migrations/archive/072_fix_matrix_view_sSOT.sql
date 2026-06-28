USE rebinmas_absensi_monitoring;
GO

-- =============================================================================
-- Migration 072: Fix vw_attendance_monthly_matrix — SSOT + NIK Cascade Only
-- Created: 2026-06-25
--
-- REMOVES: zkteco_hr_employee_map references (DROPPED 2026-06-24)
-- USES: attendance_imports (SSOT) + attendance_scan_logs (raw) + employees (enrichment)
--
-- Priority cascade:
--   1. attendance_manual_corrections (manual override)
--   2. attendance_imports          (SSOT processed: HAS current_emp_name, division_code)
--   3. attendance_scan_logs        (raw ZKTeco: parsed_employee_code + employees JOIN)
-- =============================================================================

PRINT 'Migration 072: Rebuilding vw_attendance_monthly_matrix...';
GO

-- Drop old views that reference zkteco_hr_employee_map
IF OBJECT_ID('dbo.vw_attendance_monthly_matrix', 'V') IS NOT NULL
BEGIN
  DROP VIEW dbo.vw_attendance_monthly_matrix;
  PRINT '  Dropped: vw_attendance_monthly_matrix';
END
GO

IF OBJECT_ID('dbo.vw_attendance_monthly_summary_v2', 'V') IS NOT NULL
BEGIN
  DROP VIEW dbo.vw_attendance_monthly_summary_v2;
  PRINT '  Dropped: vw_attendance_monthly_summary_v2';
END
GO

-- Rebuild vw_attendance_monthly_matrix using SSOT + NIK cascade
-- attendance_imports is the AUTHORITATIVE source (built from scan_logs via NIK cascade)
CREATE OR ALTER VIEW dbo.vw_attendance_monthly_matrix AS
WITH calendar AS (
  -- All dates that have attendance data (from processed imports)
  SELECT DISTINCT CAST(attendance_date AS DATE) AS attendance_date
  FROM dbo.attendance_imports
  UNION
  -- Also include dates from raw scan logs (for employees without imports yet)
  SELECT DISTINCT CAST(scan_date AS DATE) AS attendance_date
  FROM dbo.attendance_scan_logs
  WHERE mapping_status IN ('MAPPED', 'AUTO_MAPPED')
  UNION
  -- Include dates from manual corrections
  SELECT DISTINCT CAST(attendance_date AS DATE) AS attendance_date
  FROM dbo.attendance_manual_corrections
  WHERE is_deleted = 0
),
-- Processed attendance: from attendance_imports (SSOT pipeline output)
import_daily AS (
  SELECT
    ai.employee_code,
    ai.employee_id,
    ai.attendance_date,
    ai.check_in_at,
    ai.check_out_at,
    ai.attendance_status,
    ai.division_code,
    ai.source,
    ai.needs_manual_review,
    ai.employee_name,
    ai.current_emp_name,
    ai.current_hr_loc_code,
    ai.nik,
    ai.hr_status,
    ai.current_hr_status,
    ai.hr_loc_code,
    ai.batch_id
  FROM dbo.attendance_imports ai
),
-- Raw ZKTeco scans: for employees not yet in attendance_imports
raw_daily AS (
  SELECT
    s.parsed_employee_code,
    CAST(s.scan_date AS DATE) AS attendance_date,
    MIN(s.scan_time) AS zkteco_check_in,
    MAX(s.scan_time) AS zkteco_check_out,
    MIN(s.machine_code) AS zkteco_machine_code,
    MAX(s.mapping_status) AS mapping_status
  FROM dbo.attendance_scan_logs s
  WHERE s.parsed_employee_code IS NOT NULL
    AND s.parsed_employee_code != ''
    AND s.mapping_status IN ('MAPPED', 'AUTO_MAPPED')
  GROUP BY s.parsed_employee_code, CAST(s.scan_date AS DATE)
),
-- Enrich raw scans with employee data (NIK cascade: scan_logs → employees → current_emp_code)
raw_enriched AS (
  SELECT
    r.parsed_employee_code,
    r.attendance_date,
    r.zkteco_check_in,
    r.zkteco_check_out,
    r.zkteco_machine_code,
    r.mapping_status,
    e.id AS employee_id,
    e.employee_code,
    e.employee_name,
    COALESCE(e.current_emp_name, e.employee_name) AS enriched_emp_name,
    e.division_id,
    d.division_code,
    d.division_name,
    e.hr_loc_code,
    e.current_hr_loc_code,
    e.nik,
    e.hr_status,
    e.current_hr_status,
    CASE WHEN COUNT(*) OVER (PARTITION BY r.parsed_employee_code, r.attendance_date) >= 2
         THEN 'HADIR' ELSE 'INCOMPLETE_SCAN' END AS raw_status
  FROM raw_daily r
  INNER JOIN dbo.employees e ON e.employee_code = r.parsed_employee_code
  INNER JOIN dbo.divisions d ON d.id = e.division_id
),
-- Manual corrections (highest priority)
correction_daily AS (
  SELECT
    employee_code,
    attendance_date,
    check_in_at,
    check_out_at,
    attendance_status,
    is_leave,
    is_sick,
    is_holiday,
    overtime_hours
  FROM dbo.attendance_manual_corrections
  WHERE is_deleted = 0
)
SELECT
  -- Metadata
  YEAR(cal.attendance_date) AS attendance_year,
  MONTH(cal.attendance_date) AS attendance_month,
  cal.attendance_date,

  -- Employee identity (from processed imports when available)
  COALESCE(i.employee_id, re.employee_id, e.id) AS employee_id,
  COALESCE(i.employee_code, re.employee_code, e.employee_code) AS employee_code,
  COALESCE(i.employee_name, re.enriched_emp_name, e.employee_name) AS employee_name,

  -- Division (from employees.division_id → divisions.division_code)
  COALESCE(i.division_code, re.division_code, d.division_code) AS division_code,
  COALESCE(re.division_name, d.division_name) AS division_name,

  -- Gang
  COALESCE(g.gang_code, 'N/A') AS gang_code,

  -- ZKTeco raw data (from raw scans)
  re.zkteco_check_in,
  re.zkteco_check_out,
  re.zkteco_machine_code,

  -- Database processed data (from attendance_imports)
  i.check_in_at AS db_check_in,
  i.check_out_at AS db_check_out,
  i.attendance_status AS db_status,
  i.source AS db_source,

  -- Final status (correction > import > raw ZKTeco)
  CASE
    WHEN c.employee_code IS NOT NULL THEN c.attendance_status
    WHEN i.employee_code IS NOT NULL THEN i.attendance_status
    WHEN re.employee_code IS NOT NULL THEN re.raw_status
    ELSE 'NO_DATA'
  END AS final_status,

  -- Final check-in / check-out
  CASE
    WHEN c.check_in_at IS NOT NULL THEN c.check_in_at
    WHEN i.check_in_at IS NOT NULL THEN i.check_in_at
    WHEN re.zkteco_check_in IS NOT NULL THEN re.zkteco_check_in
    ELSE NULL
  END AS final_check_in,

  CASE
    WHEN c.check_out_at IS NOT NULL THEN c.check_out_at
    WHEN i.check_out_at IS NOT NULL THEN i.check_out_at
    WHEN re.zkteco_check_out IS NOT NULL THEN re.zkteco_check_out
    ELSE NULL
  END AS final_check_out,

  -- Source provenance
  CASE
    WHEN c.employee_code IS NOT NULL THEN 'MANUAL_CORRECTION'
    WHEN i.employee_code IS NOT NULL THEN COALESCE(i.source, 'ZKTECO')
    WHEN re.employee_code IS NOT NULL THEN 'ZKTECO'
    ELSE 'NO_DATA'
  END AS source,

  -- Flags
  CAST(COALESCE(c.is_leave, 0) AS BIT) AS is_leave,
  CAST(COALESCE(c.is_sick, 0) AS BIT) AS is_sick,
  CAST(COALESCE(c.is_holiday, 0) AS BIT) AS is_holiday,
  COALESCE(c.overtime_hours, 0) AS overtime_hours,

  -- Enrichment fields from attendance_imports (SSOT pipeline output)
  i.nik,
  i.hr_status,
  i.hr_loc_code,
  i.current_emp_name,
  i.current_hr_loc_code,
  i.current_hr_status,

  -- Batch reference
  i.batch_id,

  -- Raw scan enrichment
  re.mapping_status AS raw_mapping_status,
  re.zkteco_machine_code AS raw_machine_code
FROM calendar cal
CROSS JOIN dbo.employees e
INNER JOIN dbo.divisions d ON d.id = e.division_id
LEFT JOIN dbo.gangs g ON g.id = e.gang_id
-- Priority 3: Processed attendance_imports (SSOT)
LEFT JOIN import_daily i
  ON i.employee_code = e.employee_code
 AND i.attendance_date = cal.attendance_date
-- Priority 4: Raw scans (for employees without imports)
LEFT JOIN raw_enriched re
  ON re.parsed_employee_code = e.employee_code
 AND re.attendance_date = cal.attendance_date
-- Priority 2: Manual corrections (overrides everything)
LEFT JOIN correction_daily c
  ON c.employee_code = e.employee_code
 AND c.attendance_date = cal.attendance_date
WHERE e.is_active = 1;
GO

-- Rebuild summary view
CREATE OR ALTER VIEW dbo.vw_attendance_monthly_summary_v2 AS
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
  SUM(CASE WHEN final_status IN ('HADIR', 'PRESENT') THEN 1 ELSE 0 END) AS total_present,
  SUM(CASE WHEN final_status IN ('TIDAK_HADIR', 'ABSENT', 'ALPHA') THEN 1 ELSE 0 END) AS total_absent,
  SUM(CASE WHEN final_status = 'NO_DATA' THEN 1 ELSE 0 END) AS total_no_data,
  SUM(CASE WHEN is_leave = 1 THEN 1 ELSE 0 END) AS total_leave,
  SUM(CASE WHEN is_sick = 1 THEN 1 ELSE 0 END) AS total_sick,
  SUM(CASE WHEN is_holiday = 1 THEN 1 ELSE 0 END) AS total_holiday,
  SUM(overtime_hours) AS total_overtime_hours,
  SUM(CASE WHEN source IN ('ZKTECO', 'DIRECT_ZKTECO') THEN 1 ELSE 0 END) AS days_from_zkteco,
  SUM(CASE WHEN source IN ('IT_SOLUTION_API', 'API') THEN 1 ELSE 0 END) AS days_from_api,
  SUM(CASE WHEN source = 'MANUAL_CORRECTION' THEN 1 ELSE 0 END) AS days_from_manual,
  SUM(CASE WHEN source = 'NO_DATA' THEN 1 ELSE 0 END) AS days_no_data
FROM dbo.vw_attendance_monthly_matrix
GROUP BY attendance_year, attendance_month,
         employee_id, employee_code, employee_name,
         division_code, division_name, gang_code;
GO

-- Verify the view works
PRINT '';
PRINT '=== Verifying vw_attendance_monthly_matrix ===';
DECLARE @cnt INT;
SELECT @cnt = COUNT(*) FROM dbo.vw_attendance_monthly_matrix;
PRINT 'Total rows: ' + CAST(@cnt AS VARCHAR(20));

PRINT '';
PRINT '=== Summary by division ===';
SELECT TOP 11
  division_code,
  COUNT(DISTINCT employee_code) AS employees,
  SUM(CASE WHEN final_status = 'HADIR' THEN 1 ELSE 0 END) AS hadir,
  SUM(CASE WHEN final_status = 'NO_DATA' THEN 1 ELSE 0 END) AS no_data
FROM dbo.vw_attendance_monthly_matrix
WHERE attendance_year = 2026 AND attendance_month = 6
GROUP BY division_code
ORDER BY hadir DESC;

PRINT '';
PRINT 'Migration 072 complete: vw_attendance_monthly_matrix rebuilt (no zkteco_hr_employee_map)';
GO
