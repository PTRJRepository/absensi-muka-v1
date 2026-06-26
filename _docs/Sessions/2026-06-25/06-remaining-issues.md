# Remaining Issues

## 1. 22 NEED_REVIEW rows (AB1 machine, raw_device_user_id empty)

raw_device_user_id is empty/NULL for 22 rows from machine AB1. Cannot auto-map.

Possible causes:
- Machine communication issue during scan
- Employee badge/card not properly registered
- Hardware malfunction

Action: Investigate AB1 machine logs, verify badge enrollment.

## 2. machine_user_raw only 1,228 rows

Should sync getUsers() on all 7 accessible machines to populate. This will improve zkteco_user_name enrichment coverage from 192k to potentially all 788k rows.

Accessible machines: P1A, P1B, OFFICE_PGE, OFFICE_APE, MILL, IJL, AB2

Command: npm run sync:machines

## 3. Division C/D/F low counts

| Division | Employees | Records | Machine | Status |
|----------|-----------|---------|---------|---------|
| C | 4 | 31 | P2A_01, P2A_02 | INACCESSIBLE |
| D | 4 | 38 | P2B | INACCESSIBLE |
| F | 4 | 94 | ARA | INACCESSIBLE |

These machines are on the 10.0.0.x network (PGE estate) but currently unreachable. No sync possible until network connectivity is restored.

## 4. Scheduler Running

APP_PORT=8004 (from .env)
Schedule config: src/config/schedule.json
Currently: enabled: true

Monitor for 3 days for any anomalies.

## 5. getUsers() vs getAttendances()

After restoring scan_logs, the next sync should run getUsers() BEFORE getAttendances() to repopulate machine_user_raw with fresh enrollment data.

The sync orchestrator already calls fetchUsers() before fetchAttendanceRecords() (line 337 vs 349 in sync-orchestrator.service.ts).
