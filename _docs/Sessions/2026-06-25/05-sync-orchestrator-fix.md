# Sync Orchestrator Name Priority Fix

## Problem (Old Code)

In src/modules/import/sync-orchestrator.service.ts, the enrichment UPDATE used:

    sl.zkteco_user_name = COALESCE(
        NULLIF(LTRIM(RTRIM(sl.zkteco_user_name)), ''),
        LTRIM(RTRIM(r.user_name))
    )

This meant: KEEP the attendance record name, only use machine_user_raw.name if attendance record name is empty.

This is WRONG because attendance records can have garbled or missing names from the machine.

## Fix Applied

    sl.zkteco_user_name = LTRIM(RTRIM(r.user_name))  -- machine_user_raw is authority

    sl.zkteco_user_name_source = CASE
        WHEN r.user_name IS NOT NULL AND LEN(LTRIM(RTRIM(r.user_name))) > 0
        THEN 'MACHINE_USER_RAW'
        WHEN sl.zkteco_user_name IS NOT NULL THEN 'ATTENDANCE_RECORD'
        ELSE 'UNKNOWN' END

Now machine_user_raw.user_name is always the authority. Attendance record name only used as fallback.

## DB-Side Fix (Migration 069)

The same logic was applied to historical data via migration 069 Phase 9.

## Frontend getDisplayName() Priority (attendance-service.ts)

The frontend already had correct priority:

    employee_name (HR) -> current_emp_name -> zkteco_user_name -> machine_raw_user_name
    -> current_emp_code -> parsed_employee_code -> raw_device_user_id

The backend fix now matches the frontend logic.
