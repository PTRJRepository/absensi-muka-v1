-- =============================================================================
-- Phase A: Drop Unused 0-row tables + gangs + broken views
-- NON-BREAKING. Backend sudah bypass broken views. gangs=0 rows.
-- Prereq: 075_phase0_backup.sql run first.
-- =============================================================================

-- A.1 Drop broken views (refs dropped tables, backend bypass via service)
IF OBJECT_ID('dbo.vw_attendance_monthly_matrix','V') IS NOT NULL
  DROP VIEW dbo.vw_attendance_monthly_matrix;       -- refs dropped zkteco_hr_employee_map
IF OBJECT_ID('dbo.vw_employee_master_clean','V') IS NOT NULL
  DROP VIEW dbo.vw_employee_master_clean;           -- refs dropped employee_machine_enrollments
IF OBJECT_ID('dbo.vw_attendance_anomaly_open','V') IS NOT NULL
  DROP VIEW dbo.vw_attendance_anomaly_open;         -- refs mst_* (legacy)
IF OBJECT_ID('dbo.vw_attendance_monitoring_daily','V') IS NOT NULL
  DROP VIEW dbo.vw_attendance_monitoring_daily;     -- refs attendance_daily_process + mst_*
GO

-- A.2 Recreate 3 active views WITHOUT gangs join (gangs=0 rows, gang_code='N/A' hardcoded)
IF OBJECT_ID('dbo.vw_attendance_final','V') IS NOT NULL DROP VIEW dbo.vw_attendance_final;
GO
CREATE VIEW dbo.vw_attendance_final AS
SELECT
  e.employee_code,
  e.employee_name,
  d.division_code,
  'N/A' AS gang_code,
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
CROSS APPLY (
  SELECT DISTINCT attendance_date FROM attendance_imports
  UNION
  SELECT DISTINCT attendance_date FROM attendance_manual_corrections WHERE is_deleted = 0
) calendar
LEFT JOIN attendance_imports i ON i.employee_code = e.employee_code AND i.attendance_date = calendar.attendance_date
LEFT JOIN attendance_manual_corrections c ON c.employee_code = e.employee_code AND c.attendance_date = calendar.attendance_date AND c.is_deleted = 0;
GO

IF OBJECT_ID('dbo.vw_attendance_zkteco_final','V') IS NOT NULL DROP VIEW dbo.vw_attendance_zkteco_final;
GO
CREATE VIEW dbo.vw_attendance_zkteco_final AS
SELECT
  e.employee_code,
  e.employee_name,
  d.division_code,
  'N/A' AS gang_code,
  cal.attendance_date,
  CASE WHEN s.id IS NOT NULL THEN 'PRESENT' ELSE 'NO_DATA' END AS attendance_status,
  CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_work,
  0 AS is_leave, 0 AS is_sick, 0 AS is_holiday, 0 AS overtime_hours,
  CASE WHEN s.id IS NOT NULL THEN 'DIRECT_ZKTECO' ELSE 'NO_DATA' END AS source,
  s.machine_code
FROM employees e
INNER JOIN divisions d ON d.id = e.division_id
CROSS APPLY (
  SELECT DISTINCT CAST(scan_date AS DATE) AS attendance_date
  FROM attendance_scan_logs WHERE scan_date >= DATEADD(day, -60, GETDATE())
) cal
LEFT JOIN attendance_scan_logs s
  ON s.parsed_employee_code = e.employee_code AND s.scan_date = cal.attendance_date;
GO

IF OBJECT_ID('dbo.vw_attendance_zkteco_monthly_summary','V') IS NOT NULL DROP VIEW dbo.vw_attendance_zkteco_monthly_summary;
GO
CREATE VIEW dbo.vw_attendance_zkteco_monthly_summary AS
SELECT
  YEAR(cal.attendance_date) AS attendance_year,
  MONTH(cal.attendance_date) AS attendance_month,
  e.employee_code,
  e.employee_name,
  d.division_code,
  'N/A' AS gang_code,
  COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN cal.attendance_date END) AS total_present,
  COUNT(DISTINCT CASE WHEN s.id IS NULL THEN cal.attendance_date END) AS total_absent,
  0 AS total_leave, 0 AS total_sick, 0 AS total_overtime_hours
FROM employees e
INNER JOIN divisions d ON d.id = e.division_id
CROSS APPLY (
  SELECT DISTINCT CAST(scan_date AS DATE) AS attendance_date
  FROM attendance_scan_logs WHERE scan_date >= DATEADD(day, -90, GETDATE())
) cal
LEFT JOIN attendance_scan_logs s ON s.parsed_employee_code = e.employee_code AND s.scan_date = cal.attendance_date
WHERE e.is_active = 1
GROUP BY YEAR(cal.attendance_date), MONTH(cal.attendance_date),
  e.employee_code, e.employee_name, d.division_code;
GO

-- A.3 Drop FKs that block table drops (gangs + mst_* + machine_user_raw legacy)
-- gangs FK: employees.gang_id, gangs.division_id
IF OBJECT_ID('dbo.fk_employees_gang','F') IS NOT NULL ALTER TABLE dbo.employees DROP CONSTRAINT fk_employees_gang;
IF OBJECT_ID('dbo.fk_gangs_division','F') IS NOT NULL ALTER TABLE dbo.gangs DROP CONSTRAINT fk_gangs_division;
-- employees.gang_id column now orphaned (FK gone); leave column for now (drop in Phase C)

-- machine_user_raw legacy FK to mst_machine + import_batch
IF OBJECT_ID('dbo.FK_machine_user_raw_machine','F') IS NOT NULL ALTER TABLE dbo.machine_user_raw DROP CONSTRAINT FK_machine_user_raw_machine;
IF OBJECT_ID('dbo.FK_machine_user_raw_batch','F') IS NOT NULL ALTER TABLE dbo.machine_user_raw DROP CONSTRAINT FK_machine_user_raw_batch;

-- machine_user_map FKs to mst_* (machine_user_map NOT dropped Phase A, but FKs block mst drop)
IF OBJECT_ID('dbo.FK_machine_user_map_employee','F') IS NOT NULL ALTER TABLE dbo.machine_user_map DROP CONSTRAINT FK_machine_user_map_employee;
IF OBJECT_ID('dbo.FK_machine_user_map_machine','F') IS NOT NULL ALTER TABLE dbo.machine_user_map DROP CONSTRAINT FK_machine_user_map_machine;

-- mst_* FKs (internal + inbound)
IF OBJECT_ID('dbo.FK_mst_division_estate','F') IS NOT NULL ALTER TABLE dbo.mst_division DROP CONSTRAINT FK_mst_division_estate;
IF OBJECT_ID('dbo.FK_mst_employee_division','F') IS NOT NULL ALTER TABLE dbo.mst_employee DROP CONSTRAINT FK_mst_employee_division;
IF OBJECT_ID('dbo.FK_mst_employee_gang','F') IS NOT NULL ALTER TABLE dbo.mst_employee DROP CONSTRAINT FK_mst_employee_gang;
IF OBJECT_ID('dbo.FK_mst_gang_division','F') IS NOT NULL ALTER TABLE dbo.mst_gang DROP CONSTRAINT FK_mst_gang_division;
IF OBJECT_ID('dbo.FK_mst_machine_division','F') IS NOT NULL ALTER TABLE dbo.mst_machine DROP CONSTRAINT FK_mst_machine_division;
IF OBJECT_ID('dbo.FK_mst_machine_estate','F') IS NOT NULL ALTER TABLE dbo.mst_machine DROP CONSTRAINT FK_mst_machine_estate;
GO

-- A.4 Drop legacy leaf tables (0 rows, all children of mst_*)
IF OBJECT_ID('dbo.api_attendance_raw','U') IS NOT NULL DROP TABLE dbo.api_attendance_raw;
IF OBJECT_ID('dbo.attendance_process_detail','U') IS NOT NULL DROP TABLE dbo.attendance_process_detail;
IF OBJECT_ID('dbo.attendance_division_reconcile','U') IS NOT NULL DROP TABLE dbo.attendance_division_reconcile;
IF OBJECT_ID('dbo.attendance_anomaly','U') IS NOT NULL DROP TABLE dbo.attendance_anomaly;
IF OBJECT_ID('dbo.attendance_manual_adjustment','U') IS NOT NULL DROP TABLE dbo.attendance_manual_adjustment;
IF OBJECT_ID('dbo.attendance_raw_log','U') IS NOT NULL DROP TABLE dbo.attendance_raw_log;
IF OBJECT_ID('dbo.employee_daily_assignment','U') IS NOT NULL DROP TABLE dbo.employee_daily_assignment;
IF OBJECT_ID('dbo.employee_division_history','U') IS NOT NULL DROP TABLE dbo.employee_division_history;
IF OBJECT_ID('dbo.employee_mapping_overrides','U') IS NOT NULL DROP TABLE dbo.employee_mapping_overrides;
IF OBJECT_ID('dbo.employee_schedules','U') IS NOT NULL DROP TABLE dbo.employee_schedules;
IF OBJECT_ID('dbo.monitoring_daily_summary','U') IS NOT NULL DROP TABLE dbo.monitoring_daily_summary;
IF OBJECT_ID('dbo.shifts','U') IS NOT NULL DROP TABLE dbo.shifts;
IF OBJECT_ID('dbo.sync_job','U') IS NOT NULL DROP TABLE dbo.sync_job;
IF OBJECT_ID('dbo.import_batch','U') IS NOT NULL DROP TABLE dbo.import_batch;
IF OBJECT_ID('dbo.attendance_daily_process','U') IS NOT NULL DROP TABLE dbo.attendance_daily_process;
IF OBJECT_ID('dbo.attendance_time_correction_batch','U') IS NOT NULL DROP TABLE dbo.attendance_time_correction_batch;
IF OBJECT_ID('dbo.attendance_time_correction_detail','U') IS NOT NULL DROP TABLE dbo.attendance_time_correction_detail;
GO

-- A.5 Drop gangs (0 rows, FKs gone, views recreated without it)
IF OBJECT_ID('dbo.gangs','U') IS NOT NULL DROP TABLE dbo.gangs;
GO

-- A.6 Drop mst_* parents (FKs gone, children dropped)
IF OBJECT_ID('dbo.mst_employee','U') IS NOT NULL DROP TABLE dbo.mst_employee;
IF OBJECT_ID('dbo.mst_gang','U') IS NOT NULL DROP TABLE dbo.mst_gang;
IF OBJECT_ID('dbo.mst_machine','U') IS NOT NULL DROP TABLE dbo.mst_machine;
IF OBJECT_ID('dbo.mst_division','U') IS NOT NULL DROP TABLE dbo.mst_division;
IF OBJECT_ID('dbo.mst_estate','U') IS NOT NULL DROP TABLE dbo.mst_estate;
GO

-- A.7 Drop zkteco_hr_employee_map (0 rows, broken view already dropped in A.1)
IF OBJECT_ID('dbo.zkteco_hr_employee_map','U') IS NOT NULL DROP TABLE dbo.zkteco_hr_employee_map;
GO

-- A.8 Drop app_configs (duplikat, 0 rows)
IF OBJECT_ID('dbo.app_configs','U') IS NOT NULL DROP TABLE dbo.app_configs;
GO

-- NOTE: machine_user_map NOT dropped here (Phase B — still active in 3 services)
-- NOTE: time_correction_* columns in attendance_scan_logs NOT dropped (user KEEP)
