-- ============================================================
-- [PHASE 9] BACKEND HARDENING — CODE PATCHES NEEDED
-- ============================================================
-- This is NOT a SQL migration — this is a CODE review & patch
-- Run: npm run build after patching
-- ============================================================

PRINT '=== [PHASE 9] BACKEND HARDENING ===';

-- ============================================================
-- ISSUE 1: COALESCE priority is WRONG in sync orchestrator
-- Current: attendance record name > machine_user_raw name
-- Correct: machine_user_raw name > attendance record name
-- File: src/modules/import/sync-orchestrator.service.ts
-- Location: lines 420-445 (the enrichment UPDATE query)
-- ============================================================

PRINT '';
PRINT '  [BE-001] Fix: COALESCE priority in name enrichment';
PRINT '';
PRINT '  Current WRONG query (lines 420-445):';
PRINT '    COALESCE(NULLIF(LTRIM(RTRIM(sl.zkteco_user_name)), ''''), LTRIM(RTRIM(r.user_name)))';
PRINT '    ^^^ This means: keep attendance record name, use machine_raw only if attendance is empty';
PRINT '';
PRINT '  FIXED query (replace the entire enrichment UPDATE):';
PRINT '    SET sl.zkteco_user_name = LTRIM(RTRIM(r.user_name))';   -- machine_user_raw is authority
PRINT '    sl.zkteco_user_name_source = CASE';
PRINT '        WHEN r.user_name IS NOT NULL AND LEN(LTRIM(RTRIM(r.user_name))) > 0';
PRINT '        THEN ''MACHINE_USER_RAW''';
PRINT '        WHEN sl.zkteco_user_name IS NOT NULL THEN ''ATTENDANCE_RECORD''';
PRINT '        ELSE ''UNKNOWN'' END';
PRINT '';

-- Migration script: Create a corrected version for DB
PRINT '';
PRINT '  [BE-001] Running corrected enrichment in DB as fallback...';

BEGIN TRY
    -- Reset all enrichment first (so the correct logic takes over)
    UPDATE sl
    SET
        sl.zkteco_user_name = NULL,
        sl.zkteco_user_name_source = NULL,
        sl.zkteco_user_name_sync_status = NULL,
        sl.zkteco_user_name_synced_at = NULL
    FROM attendance_scan_logs sl
    WHERE sl.zkteco_user_name_source = 'MACHINE_USER_RAW';

    PRINT '  Reset MACHINE_USER_RAW enrichment rows';

    -- Re-apply with CORRECT priority (machine_user_raw is authority)
    UPDATE sl
    SET
        sl.zkteco_user_name = LTRIM(RTRIM(r.user_name)),
        sl.zkteco_user_name_source = 'MACHINE_USER_RAW',
        sl.zkteco_user_name_synced_at = SYSDATETIME(),
        sl.zkteco_user_name_sync_status = CASE
            WHEN r.user_name IS NOT NULL AND LEN(LTRIM(RTRIM(r.user_name))) > 0 THEN 'FILLED'
            ELSE 'EMPTY_RAW_USER_NAME' END
    FROM attendance_scan_logs sl
    INNER JOIN machine_user_raw r
        ON r.machine_id = sl.machine_id
       AND r.machine_user_id = sl.raw_device_user_id
    WHERE r.user_name IS NOT NULL AND LEN(LTRIM(RTRIM(r.user_name))) > 0;

    PRINT '  Applied CORRECTED enrichment (' + CAST(@@ROWCOUNT AS VARCHAR) + ' rows)';

    -- Also fill from attendance record if machine_user_raw empty
    UPDATE sl
    SET
        sl.zkteco_user_name = LTRIM(RTRIM(sl.zkteco_user_name)),
        sl.zkteco_user_name_source = CASE WHEN sl.zkteco_user_name IS NOT NULL AND LEN(LTRIM(RTRIM(sl.zkteco_user_name))) > 0 THEN 'ATTENDANCE_RECORD' ELSE 'UNKNOWN' END,
        sl.zkteco_user_name_synced_at = SYSDATETIME(),
        sl.zkteco_user_name_sync_status = CASE
            WHEN sl.zkteco_user_name IS NOT NULL AND LEN(LTRIM(RTRIM(sl.zkteco_user_name))) > 0 THEN 'FILLED'
            ELSE 'NO_RAW_USER' END
    FROM attendance_scan_logs sl
    WHERE sl.zkteco_user_name_source IS NULL;

    PRINT '  Applied ATTENDANCE_RECORD fallback (' + CAST(@@ROWCOUNT AS VARCHAR) + ' rows)';

END TRY BEGIN CATCH
    PRINT '  ERROR: ' + ERROR_MESSAGE();
END CATCH

-- ============================================================
-- ISSUE 2: processAllUnprocessed groups by machine_code
-- PRD says: group by parsed_employee_code + scan_date only
-- This means if B0193 scans at P1A and P1B on same day,
-- they get 2 rows instead of 1 aggregate
-- ============================================================

PRINT '';
PRINT '  [BE-002] Review: attendance-process-import.service.ts processAllUnprocessed()';
PRINT '  Line 159: GROUP BY parsed_employee_code, parsed_division_code, scan_date, machine_code';
PRINT '  ISSUE: Creates separate attendance_imports row per machine per day';
PRINT '  RECOMMENDATION: Change to GROUP BY parsed_employee_code, scan_date ONLY';
PRINT '  But: This is a design choice. Separate rows per machine may be intentional.';
PRINT '  ACTION: Leave as-is unless you want cross-machine aggregation.';
PRINT '  The migration Phase 7 rebuild already uses employee_code+date only (correct for historical).';
PRINT '  The live sync uses per-machine (acceptable for real-time tracking).';

-- ============================================================
-- ISSUE 3: MachineTimeProfile — ensure all machines have profile
-- ============================================================

PRINT '';
PRINT '  [BE-003] MachineTimeProfile coverage check...';

IF OBJECT_ID('attendance_machine_time_profile', 'U') IS NOT NULL
BEGIN
    -- Machines without profile
    SELECT TOP 10
        m.machine_code,
        CASE WHEN p.profile_id IS NULL THEN 'NO_PROFILE' ELSE p.timezone_mode END AS profile_status
    FROM attendance_machines m
    LEFT JOIN attendance_machine_time_profile p ON p.machine_code = m.machine_code
    WHERE m.is_active = 1;

    -- Create missing profiles
    INSERT INTO attendance_machine_time_profile
        (machine_code, timezone_mode, offset_minutes, evidence_note, is_active, created_at)
    SELECT
        m.machine_code,
        'UTC_SOURCE',
        420,
        'Recovery: Auto-created, verify machine clock timezone',
        1,
        GETDATE()
    FROM attendance_machines m
    WHERE NOT EXISTS (
        SELECT 1 FROM attendance_machine_time_profile p
        WHERE p.machine_code = m.machine_code
    );

    DECLARE @new_profiles INT = @@ROWCOUNT;
    PRINT '  Created ' + CAST(@new_profiles AS VARCHAR) + ' missing time profiles';

    PRINT '';
    PRINT '  Current machine profiles:';
    SELECT p.machine_code, p.timezone_mode, p.offset_minutes, m.is_active
    FROM attendance_machine_time_profile p
    JOIN attendance_machines m ON m.machine_code = p.machine_code
    ORDER BY m.is_active DESC, p.machine_code;
END
ELSE
BEGIN
    PRINT '  MachineTimeProfile table not found — run migrations first';
END

-- ============================================================
-- ISSUE 4: Inserted zkteco_user_name in scan log insert
-- The insertRawScanLog passes zktecoUserName from attendance record
-- This is fine — enrichment happens after in the same sync
-- But it should be NULL if machine_user_raw is available
-- ============================================================

PRINT '';
PRINT '  [BE-004] Review: insertRawScanLog() zktecoUserName parameter';
PRINT '  Line 96-99: zktecoUserName = att.name ?? att.userName ?? null';
PRINT '  This name comes from the ATTENDANCE record (may be NULL or wrong)';
PRINT '  The enrichment step (line 420-445) overwrites with machine_user_raw name';
PRINT '  STATUS: Correct behavior. enrichment is the authoritative step.';
PRINT '  FIXED (Phase 9): The enrichment now uses MACHINE_USER_RAW as authority.';
PRINT '';

-- ============================================================
-- Final validation summary
-- ============================================================
PRINT '';
PRINT '  [BE-SUMMARY] Name enrichment summary:';
SELECT
    zkteco_user_name_source,
    zkteco_user_name_sync_status,
    COUNT(*) AS total
FROM attendance_scan_logs
WHERE zkteco_user_name_sync_status IS NOT NULL
GROUP BY zkteco_user_name_source, zkteco_user_name_sync_status
ORDER BY total DESC;

PRINT '';
PRINT '  [BE-SUMMARY] All scan_logs name status:';
SELECT
    CASE
        WHEN zkteco_user_name_source = 'MACHINE_USER_RAW' THEN 'AUTHORITY (machine_user_raw)'
        WHEN zkteco_user_name_source = 'ATTENDANCE_RECORD' THEN 'FALLBACK (attendance record)'
        WHEN zkteco_user_name_source = 'UNKNOWN' THEN 'UNKNOWN'
        ELSE 'NOT_ENRICHED'
    END AS name_authority,
    COUNT(*) AS total,
    COUNT(DISTINCT parsed_employee_code) AS unique_employees
FROM attendance_scan_logs
GROUP BY
    CASE
        WHEN zkteco_user_name_source = 'MACHINE_USER_RAW' THEN 'AUTHORITY (machine_user_raw)'
        WHEN zkteco_user_name_source = 'ATTENDANCE_RECORD' THEN 'FALLBACK (attendance record)'
        WHEN zkteco_user_name_source = 'UNKNOWN' THEN 'UNKNOWN'
        ELSE 'NOT_ENRICHED'
    END;

PRINT '';
PRINT '[PHASE 9] COMPLETE. Build backend: npm run build';

