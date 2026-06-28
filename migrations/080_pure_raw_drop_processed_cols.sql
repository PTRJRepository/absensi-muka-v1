-- Migration 080: Make attendance_raw PURE + redefine compat view with scan_map JOIN
-- Strategy: drop 9 processed cols from base table; compat view attendance_scan_logs
-- exposes them via JOIN scan_map so legacy readers don't break.
-- Prerequisite: scan_map fully populated (808093 rows, verified migration 079).

-- 1. Redefine compat view FIRST (so readers still see processed cols via JOIN)
IF OBJECT_ID('dbo.attendance_scan_logs', 'V') IS NOT NULL
  DROP VIEW dbo.attendance_scan_logs;
GO

CREATE VIEW dbo.attendance_scan_logs AS
SELECT
  r.id, r.machine_id, r.machine_code, r.raw_device_user_id, r.raw_user_sn,
  r.raw_record_time, r.raw_ip,
  sm.parsed_emp_code AS parsed_employee_code,
  sm.loc_code AS parsed_division_code,
  sm.map_status AS mapping_status,
  sm.map_reason AS mapping_reason,
  r.scan_time, r.scan_date, r.event_type, r.verify_type, r.work_code,
  r.sync_batch_id, r.created_at,
  r.scan_time_original, r.scan_date_original, r.scan_time_wib, r.scan_date_wib,
  r.time_correction_status, r.time_correction_offset_minutes, r.time_correction_reason,
  r.time_corrected_at, r.time_corrected_by, r.time_correction_batch_id,
  r.zkteco_user_name_source, r.zkteco_user_name_synced_at, r.zkteco_user_name_sync_status,
  r.zkteco_user_name,
  sm.current_emp_code,
  -- current_employee_id derived via JOIN employees (not stored in raw anymore)
  (SELECT TOP 1 e.id FROM employees e WHERE e.employee_code = sm.current_emp_code ORDER BY e.id DESC) AS current_employee_id,
  sm.resolution_status AS current_mapping_status,
  sm.resolution_method AS current_mapping_reason,
  sm.resolved_at AS current_resolved_at
FROM attendance_raw r
LEFT JOIN scan_map sm ON sm.scan_log_id = r.id;
GO

-- 2. Now drop processed cols from base table (safe: view no longer reads them directly)
ALTER TABLE dbo.attendance_raw
  DROP COLUMN parsed_employee_code, parsed_division_code,
              mapping_status, mapping_reason,
              current_emp_code, current_employee_id,
              current_mapping_status, current_mapping_reason, current_resolved_at;
GO

-- 3. Verify: raw cols reduced, view still works
SELECT COUNT(*) AS raw_cols FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='attendance_raw';
GO
SELECT TOP 3 id, raw_device_user_id, parsed_employee_code, mapping_status, current_emp_code
FROM attendance_scan_logs ORDER BY id DESC;
GO
