-- =============================================================================
-- Phase 0: Safety Backup + Archive backup tables (rename, preserve in-DB)
-- NON-BREAKING. Run BEFORE any drop/rename.
-- User decision 2026-06-26: backup YA, gangs DROP, time_correction KEEP.
-- =============================================================================

-- 0.1 Rename backup/state/archive tables (preserve in-DB as cold archive)
-- Keep data, just signal "legacy archive" via suffix.
EXEC sp_rename 'dbo.attendance_scan_logs_backup_20260623_233022', 'arch_scan_logs_bak_20260623a';
EXEC sp_rename 'dbo.attendance_scan_logs_backup_20260623_233115', 'arch_scan_logs_bak_20260623b';
EXEC sp_rename 'dbo.attendance_scan_logs_linked_backup_20260623', 'arch_scan_logs_linked_20260623';
EXEC sp_rename 'dbo.attendance_scan_logs_unmapped_backup_20260623', 'arch_scan_logs_unmapped_20260623';
EXEC sp_rename 'dbo.scan_logs_backup_current_empcode_20260623', 'arch_scan_logs_empcode_20260623';
EXEC sp_rename 'dbo.attendance_scan_logs_state_before_recovery_20260625', 'arch_scan_logs_state_20260625';
EXEC sp_rename 'dbo.attendance_imports_backup_before_rebuild_20260625', 'arch_imports_rebuild_20260625';
EXEC sp_rename 'dbo.attendance_imports_state_before_recovery_20260625', 'arch_imports_state_20260625';
EXEC sp_rename 'dbo.attendance_machines_state_before_recovery_20260625', 'arch_machines_state_20260625';
EXEC sp_rename 'dbo.employees_state_before_recovery_20260625', 'arch_employees_state_20260625';
EXEC sp_rename 'dbo.employees_backup_20260623', 'arch_employees_bak_20260623';
EXEC sp_rename 'dbo.employees_contaminated_archive', 'arch_employees_contaminated';
EXEC sp_rename 'dbo.zkteco_absensi_user_registry_backup_current_empcode_20260623', 'arch_user_registry_empcode_20260623';
EXEC sp_rename 'dbo.zkteco_hr_employee_map_backup_20260623', 'arch_hr_emp_map_bak_20260623';

-- 0.2 Drop only truly-empty state tables (0 rows). Keep arch_machines_state (16 rows).
IF OBJECT_ID('dbo.arch_imports_state_20260625','U') IS NOT NULL DROP TABLE dbo.arch_imports_state_20260625;
IF OBJECT_ID('dbo.arch_employees_state_20260625','U') IS NOT NULL DROP TABLE dbo.arch_employees_state_20260625;
-- arch_machines_state_20260625 (16 rows) and arch_scan_logs_state_20260625 (24279 rows) KEPT as archive
GO

-- NOTE: Full DB backup via SSMS/sqlcmd separate step:
-- BACKUP DATABASE rebinmas_absensi_monitoring TO DISK = '<server_path>\rebinmas_pre_cleanup_20260626.bak'
-- WITH INIT, COMPRESSION, STATS=10;
