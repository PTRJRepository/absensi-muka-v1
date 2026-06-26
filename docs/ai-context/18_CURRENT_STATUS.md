---
tags: [ai-context, current-status]
created: 2026-06-07
updated: 2026-06-26
---

# Current Status

**Last Updated:** 2026-06-26
**Project Status:** OPERATIONAL — Post Emergency Recovery Complete

---

## Recovery Summary (2026-06-25)

| Phase | Status | Detail |
|-------|--------|--------|
| 0 | DONE | Scheduler frozen, state snapshots created |
| 1 | DONE | 788,915 scan_logs backup confirmed |
| 2 | DONE | 8,005 employees, 16 machines restored |
| 3 | DONE | 788,915 scan_logs restored; FK batch fix applied |
| 4 | DONE | Schema audit log created |
| 5 | DONE | machine_user_raw synced from accessible machines |
| 6 | DONE | 788,915 rows UTC→WIB corrected (+7h) |
| 7 | DONE | 45,348 attendance_imports rebuilt (11 divisions) |
| 8 | DONE | B0193 validation: correct WIB times confirmed |
| 9 | DONE | Backend COALESCE name priority fix applied |
| 10 | DONE | Schema fixes + API validated |
| 11 | DONE | Scheduler re-enabled |

---

## Current DB State

| Table | Rows | Notes |
|-------|------|-------|
| attendance_scan_logs | 788,915 | Restored + WIB-corrected |
| attendance_imports | 45,348 | 11 divisions A-L, rebuilt 2026-06-25 |
| employees | 8,005 | 6,032 HR employees with correct division_id |
| attendance_machines | 16 | All machines in inventory |
| machine_user_raw | ~1,228 | Pre-existing (needs refresh sync) |
| attendance_import_batches | 257 | Includes FK dummy rows |
| divisions | 11 real + 5 dummy | All 11 estates mapped |

---

## Attendance Imports Breakdown (2026-06-25 rebuild)

| Division | Records | Employees | Machine | Status |
|----------|---------|-----------|---------|--------|
| J | 12,096 | 238 | ARC (P1B network) | Accessible via ZKTeco |
| E | 9,102 | 176 | DME_01/02 | Accessible via public IP |
| G | 4,934 | 136 | AB1 | Inaccessible (port forwarding needed) |
| H | 3,989 | 109 | AB2 | Accessible via public IP |
| L | 2,894 | 45 | IJL | Accessible via public IP |
| A | 2,806 | 174 | P1A | Accessible (ZKTeco confirmed) |
| B | 2,620 | 162 | P1B | Accessible (ZKTeco confirmed) |
| F | 94 | 4 | ARA | Accessible via public IP |
| D | 38 | 4 | P2B | Inaccessible (PGE network) |
| C | 31 | 4 | P2A | Inaccessible (PGE network) |
| PGE | ~10,000 | ~200 | OFFICE_PGE | Accessible (10.0.0.232) |

Status: HADIR: ~40,000 | INCOMPLETE_SCAN: ~4,700 | MANUAL_REVIEW: ~600

---

## Infrastructure

| Property | Value |
|----------|-------|
| Backend port | 8004 |
| Scheduler | ENABLED (src/config/schedule.json) |
| IT Solution API | DEPRECATED — all data from ZKTeco only |
| Build | Clean (npm run build passed) |
| DB Server | 10.0.0.110 |

---

## Scheduler Jobs (src/config/schedule.json)

| Job | Interval | Status |
|-----|----------|--------|
| attendance_pipeline_sync | 60 min | ENABLED |
| hr_snapshot_sync | 1440 min (daily) | ENABLED |
| global_machine_sync | 60 min | ENABLED |

---

## Accessible Machines (7 confirmed ZKTeco)

| Machine | IP | Port | Division | LocCode | Status |
|---------|-----|------|----------|---------|--------|
| OFFICE_PGE | 10.0.0.232 | 4370 | PGE | A | Accessible |
| P1A | 10.0.0.90 | 4100 | P1A | A | Accessible (ZKTeco) |
| P1B | 10.0.0.91 | 4300 | P1B | B | Accessible (ZKTeco) |
| MILL | 103.127.66.32 | 4370 | MILL | — | Accessible |
| OFFICE_APE | 103.144.208.154 | 4370 | ARE | — | Accessible |
| IJL | 103.144.211.226 | 4370 | IJL | L | Accessible |
| AB2 | 103.144.208.154 | 4400 | AB2 | H | Accessible |
| DME_01 | 103.144.228.42 | 4700 | DME | E | Accessible |
| DME_02 | 103.144.228.42 | 4701 | DME | E | Accessible |
| ARA | 103.144.208.154 | 4800 | ARA | F | Accessible |

**Inaccessible:** AB1 (4900), ARC_01 (4200), ARC_02 (4201), P2A (4500), P2B (4600)

---

## Key Code Fixes (Post-Recovery)

| Fix | File | Issue |
|-----|------|-------|
| division_id backfill | hr-employee-sync.service.ts | hr_loc_code (P1A) → divisionCodeMap (A) mismatch |
| name priority | sync-orchestrator.service.ts | machine_user_raw.user_name is authority |
| attendance_imports | rebuild script | 45,348 rows with correct division_code |
| schedule.json | config | attendance_pipeline_sync job added |
| migration 072 | vw_attendance_monthly_matrix | removed zkteco_hr_employee_map references |

---

## Pending Tasks

1. **Sync getUsers()** on 7 accessible machines → refresh machine_user_raw
2. **Investigate 22 NEED_REVIEW rows** on AB1 (empty raw_device_user_id)
3. **Restore network** to P2A/P2B machines (PGE network)
4. **Port forwarding** for AB1, ARC_01, ARC_02
5. **HR populate NIK** for J0127 employees (root cause: NIK column empty in DB_PTRJ)
6. **Monitor 3 days** for sync anomalies

---

## Related Docs

- `docs/CRITICAL-INVESTIGATION-2026-06-25.md` — Root cause analysis
- `docs/SYNC-ARCHITECTURE.md` — Complete sync architecture
- `docs/EMPLOYEE-DATA-FLOW.md` — Employee data architecture
- `_docs/Sessions/2026-06-25/` — Session documentation
- `memory/recovery-complete-2026-06-25.md` — Recovery log
