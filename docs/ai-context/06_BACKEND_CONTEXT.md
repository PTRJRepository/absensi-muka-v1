---
tags: [ai-context, backend]
created: 2026-06-07
updated: 2026-06-25
---

# Backend Context

## Post-Recovery Status (2026-06-25)

**IT Solution API:** DEPRECATED. All attendance data from ZKTeco machines only.
**Scheduler:** ENABLED (port 8004, APP_PORT in .env)
**attendance_imports:** 38,604 rows, 10 divisions A-L
**attendance_scan_logs:** 789,314 rows, WIB-corrected timezone
**Known issues:** 22 NEED_REVIEW rows (AB1 machine, empty raw_device_user_id); machine_user_raw low coverage (1,228 rows) -- sync getUsers() needed

## Architecture Overview

Node.js/TypeScript backend collecting attendance from ZKTeco machines via TCP (port 4370), storing in SQL Server.

```
ZKTeco TCP (port 4370) -> node-zklib -> attendance_scan_logs -> attendance_imports -> monthly matrix API
                                     -> machine_user_raw (getUsers only)
```

## Sync Entry Points

| Entry Point | Mechanism | Use |
|---|---|---|
| Scheduler | setInterval -> child_process.fork | Auto, every N minutes |
| HTTP API | POST /api/ops/sync | Manual per machine |
| CLI | node dist/scripts/sync-machines.js | Full manual sync |

## Key Backend Files

| File | Purpose |
|------|---------|
| src/modules/import/sync-orchestrator.service.ts | ZKTeco TCP sync orchestration |
| src/modules/import/import-job.service.ts | Batch management |
| src/modules/import/attendance-process-import.service.ts | Daily import pipeline |
| src/modules/machines/machine-time-profile.service.ts | Timezone profiles (UTC+420 for WIB) |
| src/modules/attendance/attendance-process.service.ts | Attendance import logic |
| src/config/schedule.json | Scheduler config (enabled: true) |

## Name Enrichment (Post-Fix)

**OLD (WRONG):** COALESCE(attendance_record_name, machine_raw_name)
**NEW (CORRECT:** machine_user_raw.user_name is the authority.

**Source priority:** machine_user_raw.name -> attendance_record_name -> UNKNOWN

## Sync Orchestrator Flow

1. fetchUsers() -> machine_user_raw (get enrollment data)
2. fetchAttendanceRecords() -> attendance_scan_logs (raw log, no mapping)
3. Enrichment UPDATE: set zkteco_user_name from machine_user_raw WHERE machine_id + machine_user_id match
4. rebuildImportsForMachineDates() -> attendance_imports (MIN check-in, MAX check-out, COUNT >= 2 -> HADIR)

## Error Handling

- Network errors: retry once then skip with log entry
- FK constraint errors: batch insert with WHERE NOT EXISTS guard
- Timezone: MachineTimeProfileService applies +7h (UTC_SOURCE -> WIB) on insert
- Duplicate: dedup key = machine_code + raw_device_user_id + raw_record_time
