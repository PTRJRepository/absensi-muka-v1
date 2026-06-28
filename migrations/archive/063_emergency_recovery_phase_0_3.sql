-- ============================================================
-- EMERGENCY RECOVERY MIGRATION
-- Attendance Pipeline Rebuild - Full Restore & Correction
-- ============================================================
-- Execution: Run batch-by-batch using SSMS "Execute" button
--            or: SQLCMD -S server -i migration_063_emergency_recovery.sql
-- Safety: Each phase has rollback comment
-- Idempotent: Most operations use IF NOT EXISTS / WHERE NOT EXISTS
-- ============================================================

-- ============================================================
-- [PHASE 0] EMERGENCY FREEZE & STATE SNAPSHOT
-- Before: Scheduler disabled (schedule.json enabled=false)
-- ============================================================

PRINT '=== [PHASE 0] EMERGENCY FREEZE & STATE SNAPSHOT ===';

-- Create pre-recovery state backup tables (even if empty = empty backup)
IF OBJECT_ID('attendance_scan_logs_state_before_recovery_20260625', 'U') IS NULL
BEGIN
    SELECT GETDATE() AS snapshot_time, 'BEFORE_RECOVERY_20260625' AS recovery_phase, * INTO attendance_scan_logs_state_before_recovery_20260625 FROM attendance_scan_logs;
    PRINT '  Created: attendance_scan_logs_state_before_recovery_20260625';
END ELSE PRINT '  Exists: attendance_scan_logs_state_before_recovery_20260625';

IF OBJECT_ID('attendance_imports_state_before_recovery_20260625', 'U') IS NULL
BEGIN
    SELECT GETDATE() AS snapshot_time, 'BEFORE_RECOVERY_20260625' AS recovery_phase, * INTO attendance_imports_state_before_recovery_20260625 FROM attendance_imports;
    PRINT '  Created: attendance_imports_state_before_recovery_20260625';
END ELSE PRINT '  Exists: attendance_imports_state_before_recovery_20260625';

IF OBJECT_ID('employees_state_before_recovery_20260625', 'U') IS NULL
BEGIN
    SELECT GETDATE() AS snapshot_time, 'BEFORE_RECOVERY_20260625' AS recovery_phase, * INTO employees_state_before_recovery_20260625 FROM employees;
    PRINT '  Created: employees_state_before_recovery_20260625';
END ELSE PRINT '  Exists: employees_state_before_recovery_20260625';

IF OBJECT_ID('attendance_machines_state_before_recovery_20260625', 'U') IS NULL
BEGIN
    SELECT GETDATE() AS snapshot_time, 'BEFORE_RECOVERY_20260625' AS recovery_phase, * INTO attendance_machines_state_before_recovery_20260625 FROM attendance_machines;
    PRINT '  Created: attendance_machines_state_before_recovery_20260625';
END ELSE PRINT '  Exists: attendance_machines_state_before_recovery_20260625';

-- Verify counts
PRINT '';
PRINT '  Pre-recovery counts:';
SELECT 'attendance_scan_logs' AS tbl, COUNT(*) AS cnt FROM attendance_scan_logs
UNION ALL SELECT 'attendance_imports', COUNT(*) FROM attendance_imports
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'attendance_machines', COUNT(*) FROM attendance_machines;

PRINT '';
PRINT '[PHASE 0] COMPLETE. Verify: no active sync batches should be created.';
PRINT 'GO';

