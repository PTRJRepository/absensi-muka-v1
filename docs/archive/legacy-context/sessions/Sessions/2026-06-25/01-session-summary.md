# Session 2026-06-25 — Emergency Recovery Execution

## Recovery Phases Executed

| Phase | Status | Key Actions |
|-------|--------|-------------|
| 0 | DONE | Scheduler frozen, state snapshots created |
| 1 | DONE | Backup discovery: 788,915 scan_logs, 3,761 employees |
| 2 | DONE | Machines (16) + employees (3,761 all divisions) already existed |
| 3 | DONE | 788,915 scan_logs restored; FK dummy batches inserted |
| 4 | DONE | Schema audit log created |
| 5 | DONE | 192,353 names enriched from machine_user_raw; 596,562 NO_RAW_USER |
| 6 | DONE | 788,915 rows UTC->WIB corrected; scan_time/scan_date +7h |
| 7 | DONE | attendance_imports rebuilt: 38,604 rows across 10 divisions A-L |
| 8 | DONE | Validation: B0193 shows correct WIB times (12:42->20:39 HADIR) |
| 9 | DONE | Backend COALESCE fix applied in sync-orchestrator.service.ts |
| 10 | DONE | Schema fixes: attendance_machines, attendance_scan_logs FK |
| 11 | DONE | Scheduler re-enabled |

## DB Fixes Applied (not in original migration scripts)

1. FK constraint -- fk_scan_logs_batch blocked Phase 3 INSERT. Fixed by inserting dummy rows into attendance_import_batches for missing batch IDs.

2. machine_user_raw schema -- live table has machine_id (int) and NO machine_code column. JOIN via machine_id to attendance_machines.id.

3. attendance_machine_time_profile schema -- has evidence_note (not notes), profile_id (not id), no machine_id column. JOIN via machine_code.

4. Phase 4 index creation -- CREATE INDEX on non-existent machine_code column failed. Fixed with COL_LENGTH() guard.

5. SQL TRY/CATCH -- Phase 1 used TRY/CATCH on non-existent table queries which fail at compile time. Fixed with IF OBJECT_ID() + dynamic SQL.

6. G0628 bug -- 7 rows (machine AB1) had MAPPED status but NULL current_emp_code. Fixed by setting current_emp_code = parsed_employee_code.

## Final DB State

attendance_scan_logs: 789,314 rows
attendance_imports: 38,604 rows (10 divisions A-L)
attendance_machines: 16 rows
employees: 8,005 rows
machine_user_raw: 1,228 rows
attendance_import_batches: 257 rows

## attendance_imports Breakdown

| Division | Records | Employees | Notes |
|----------|---------|-----------|-------|
| J | 12,096 | 238 | ARC machine (P1B network) |
| E | 9,102 | 176 | DME machine (inaccessible) |
| G | 4,934 | 136 | Main division |
| H | 3,989 | 109 | AB2 machine (OFFICE_PGE IP) |
| L | 2,894 | 45 | IJL machine (inaccessible) |
| A | 2,806 | 174 | P1A machine (accessible) |
| B | 2,620 | 162 | P1B machine (accessible) |
| F | 94 | 4 | ARA machine (inaccessible) |
| D | 38 | 4 | P2B machine (inaccessible) |
| C | 31 | 4 | P2A machines (inaccessible) |

Status: HADIR: 33,884 | INCOMPLETE_SCAN: 4,720

## Null current_emp_code (unresolved)

22 rows -- raw_device_user_id empty, parsed_employee_code = NULL, machine AB1. Cannot auto-map. Needs manual investigation.

7 G0628 rows were fixed (MAPPED but NULL current_emp_code).

## Pending Tasks

1. Sync getUsers() on 7 accessible machines -> populate machine_user_raw
2. npm run build (already done, clean)
3. Start backend: npm run start (APP_PORT=8004)
4. Monitor for 3 days
5. Investigate 22 NEED_REVIEW rows on AB1 (empty raw_device_user_id)
