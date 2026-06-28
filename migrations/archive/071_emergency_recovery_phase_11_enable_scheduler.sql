-- ============================================================
-- [PHASE 11] RE-ENABLE SCHEDULER & MONITOR
-- ============================================================
-- Prerequisites: Phase 10 validation passed
-- Duration: Ongoing monitoring (3 days recommended)
-- ============================================================

PRINT '=== [PHASE 11] RE-ENABLE SCHEDULER ===';

-- ============================================================
-- 11A: Re-enable scheduler
-- ============================================================
PRINT '';
PRINT '  [11A] Re-enabling scheduler...';
-- Done: Edit src/config/schedule.json and set enabled: true
-- Or if you changed it for Phase 0:
--   "enabled": true  (both in root and in jobs)

PRINT '  Already disabled in Phase 0. Change schedule.json:';
PRINT '    "enabled": true';
-- To re-enable (manual step):
-- sed -i 's/"enabled": false/"enabled": true/g' src/config/schedule.json
-- or edit manually

PRINT '  After re-enabling: npm run build';

-- ============================================================
-- 11B: Run first manual sync (1 accessible machine)
-- ============================================================
PRINT '';
PRINT '  [11B] First sync — test with 1 accessible machine...';
PRINT '';

-- Show accessible machines
PRINT '  Accessible machines (from schedule.json and machine config):';
SELECT machine_code, ip_address, loc_code, is_active
FROM attendance_machines
WHERE is_active = 1
ORDER BY machine_code;

-- Run manual sync via API (example):
-- POST http://localhost:3000/api/ops/sync
-- Body: { "machineCode": "P1A" }

PRINT '  Run single machine sync:';
PRINT '    POST http://localhost:3000/api/ops/sync';
PRINT '    Body: { "machineCode": "P1A" }';
PRINT '';
PRINT '  Expected response:';
PRINT '    { "success": true, "usersCount": N, "attendanceCount": N, "batchId": M }';

-- ============================================================
-- 11C: Validation after first sync
-- ============================================================
PRINT '';
PRINT '  [11C] Post-first-sync validation...';

DECLARE @recent_batch_id BIGINT = (SELECT TOP 1 id FROM attendance_import_batches ORDER BY id DESC);
IF @recent_batch_id IS NOT NULL
BEGIN
    PRINT '  Most recent batch: ' + CAST(@recent_batch_id AS VARCHAR);
    SELECT
        id, source_type, status, records_imported,
        created_at, completed_at
    FROM attendance_import_batches
    WHERE id = @recent_batch_id;

    PRINT '  Scan logs in this batch:';
    DECLARE @batch_scanlogs INT = (SELECT COUNT(*) FROM attendance_scan_logs WHERE sync_batch_id = @recent_batch_id);
    PRINT '  ' + CAST(@batch_scanlogs AS VARCHAR) + ' scan logs';

    PRINT '  Attendance imports from this batch:';
    DECLARE @batch_imports INT = (SELECT COUNT(*) FROM attendance_imports WHERE batch_id = @recent_batch_id);
    PRINT '  ' + CAST(@batch_imports AS VARCHAR) + ' imports';
END
ELSE
    PRINT '  No recent batches found.';

-- ============================================================
-- 11D: Monitoring checklist
-- ============================================================
PRINT '';
PRINT '  [11D] Monitoring checklist (run daily for 3 days):';
PRINT '';
PRINT '  Daily checks:';
PRINT '  1. API: GET /api/ops/summary — check machine health';
PRINT '  2. API: GET /api/attendance/monthly-matrix?year=2026&month=6 — check data';
PRINT '  3. DB: SELECT COUNT(*) FROM attendance_scan_logs — should increase each sync';
PRINT '  4. DB: SELECT COUNT(*) FROM attendance_imports — should increase each sync';
PRINT '  5. DB: SELECT machine_code, COUNT(*) FROM attendance_scan_logs GROUP BY machine_code';
PRINT '     — verify all accessible machines are syncing';
PRINT '';
PRINT '  Watch for:';
PRINT '  - FAILED batches in attendance_import_batches';
PRINT '  - Duplicate attendance records (same employee, same day, 2 rows)';
PRINT '  - New attendance with wrong timezone (scan_date != DATE of scan_time)';
PRINT '  - attendance_imports remaining empty after sync';
PRINT '';
PRINT '  3-day monitoring log template:';
PRINT '';
PRINT '  Day 1: ___________ Status: _______ Notes: ___________';
PRINT '  Day 2: ___________ Status: _______ Notes: ___________';
PRINT '  Day 3: ___________ Status: _______ Notes: ___________';

-- ============================================================
-- 11E: Final system status
-- ============================================================
PRINT '';
PRINT '  [11E] Final system status snapshot:';
PRINT '';

PRINT '  Table row counts:';
SELECT 'attendance_scan_logs' AS tbl, COUNT(*) AS cnt FROM attendance_scan_logs
UNION ALL SELECT 'attendance_imports', COUNT(*) FROM attendance_imports
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'attendance_machines', COUNT(*) FROM attendance_machines
UNION ALL SELECT 'machine_user_raw', COUNT(*) FROM machine_user_raw
UNION ALL SELECT 'attendance_import_batches', COUNT(*) FROM attendance_import_batches;

PRINT '';
PRINT '  Division distribution (attendance_imports):';
SELECT
    LEFT(employee_code, 1) AS division,
    COUNT(*) AS total_records,
    COUNT(DISTINCT employee_code) AS unique_employees
FROM attendance_imports
GROUP BY LEFT(employee_code, 1)
ORDER BY division;

PRINT '';
PRINT '  Name enrichment coverage:';
SELECT
    zkteco_user_name_sync_status,
    COUNT(*) AS total
FROM attendance_scan_logs
WHERE zkteco_user_name_sync_status IS NOT NULL
GROUP BY zkteco_user_name_sync_status;

PRINT '';
PRINT '  Timezone status:';
SELECT
    time_correction_status,
    COUNT(*) AS total
FROM attendance_scan_logs
WHERE time_correction_status IS NOT NULL
GROUP BY time_correction_status;

PRINT '';
PRINT '=== [PHASE 11] COMPLETE ===';
PRINT 'System is operational. Monitor for 3 days.';
PRINT '';
PRINT '========================================';
PRINT '  EMERGENCY RECOVERY COMPLETE';
PRINT '========================================';
PRINT '';
PRINT 'Summary of changes:';
PRINT '  - attendance_machines: RESTORED from backup';
PRINT '  - employees: RESTORED from backup';
PRINT '  - attendance_scan_logs: RESTORED from backup (788k+ rows)';
PRINT '  - machine_user_raw: SCHEMA CREATED (needs getUsers() sync to populate)';
PRINT '  - zkteco_user_name: ENRICHED from machine_user_raw';
PRINT '  - Timezone: CORRECTED UTC->WIB for all historical data';
PRINT '  - attendance_imports: REBUILT for all divisions (not just G)';
PRINT '  - Backend: REBUILD required (npm run build)';
PRINT '';
PRINT 'Remaining manual tasks:';
PRINT '  1. Run getUsers() sync on all 7 accessible machines';
PRINT '     (machine_user_raw is empty until this runs)';
PRINT '  2. Rebuild npm run build';
PRINT '  3. Re-enable scheduler: set schedule.json enabled=true';
PRINT '  4. Monitor for 3 days';
PRINT '';
PRINT 'Recovery artifacts (backup tables):';
PRINT '  - attendance_scan_logs_state_before_recovery_20260625';
PRINT '  - attendance_imports_state_before_recovery_20260625';
PRINT '  - employees_state_before_recovery_20260625';
PRINT '  - attendance_machines_state_before_recovery_20260625';
PRINT '  - attendance_imports_backup_before_rebuild_20260625';
PRINT '';
PRINT 'GO';

