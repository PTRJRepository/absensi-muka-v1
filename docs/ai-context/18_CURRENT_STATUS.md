---
tags: [ai-context, current-status]
created: 2026-06-07
updated: 2026-06-26
---

# Current Status

**Last Updated:** 2026-06-26
**Project Status:** OPERATIONAL — Full System Audit Complete

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
| 6 | DONE | 808,093 rows UTC→WIB corrected (+7h) |
| 7 | DONE | 45,348 attendance_imports rebuilt (11 divisions) |
| 8 | DONE | B0193 validation: correct WIB times confirmed |
| 9 | DONE | Backend COALESCE name priority fix applied |
| 10 | DONE | Schema fixes + API validated |
| 11 | DONE | Scheduler re-enabled |

---

## Post-Audit Fixes (2026-06-26)

| Fix | Detail |
|-----|--------|
| Migration 074 | Rescued 10,022 MANUAL_REVIEW orphans → enriched records |
| attendance-process-import.service.ts | Direct `raw_device_user_id → employee_code` fallback (PGE/MILL/APE) |
| zkteco-employee-code-parser.ts | 6-digit IDs → NONE → NEED_REVIEW (new hires not in HR) |
| schedule.json | `attendance_pipeline_sync` ENABLED (60 min) |
| Corrupt rows (23 total) | 12 attendance_imports + 11 scan_logs deleted (date < 2020) |
| 9 stuck RUNNING batches | Marked FAILED (orphan process cleanup) |

---

## Web App Patch (2026-06-26)

All previously-500ing endpoints now return 200 (live-verified):

| Endpoint | Fix |
|----------|-----|
| `/api/attendance/monthly-matrix?mode=database` | New `monthly-matrix.service.ts` queries `attendance_imports` directly (bypass `vw_attendance_monthly_matrix` that hangs >60s) |
| `/api/attendance/monthly-matrix?mode=datamesin` | Replaced correlated subqueries with direct `current_emp_code`/`mapping_reason` columns — 30-50s → 2.6s |
| `/api/monitoring/machine/:code/employees` | Rewrite to `machine_user_raw` base (offline machines return 200 with imported data, not 500) |
| `/api/employees-comprehensive` (both modes) | Fixed non-existent `employees` columns (`division_code`/`gang_code`/`machine_count`/`parsed_employee_code`) + missing `@mappingStatus` param |

**Architecture principle:** Machine data = already-imported raw data (`machine_user_raw` + `attendance_scan_logs`), NOT live ZKTeco connections. No correlated subqueries in matrix/machine queries (caused 30-50s timeouts on 800k scan_logs).

**Frontend fixes:** duplicate React key `undefined`, envelope mismatch (employees-comprehensive stuck/empty), nested `<button>`, isError states, new `safeText()` helper.

---

## Current DB State (2026-06-26)

| Table | Rows | Notes |
|-------|------|-------|
| attendance_scan_logs | 808,093 | WIB-corrected, 0 corrupt dates |
| attendance_imports | 55,051 | 11 divisions, 99.99% enriched |
| employees | 8,005 | 6,032 HR employees correct division_id |
| attendance_machines | 16 | All machines in inventory |
| machine_user_raw | 6,293 | Needs refresh sync |
| attendance_import_batches | 296 | All stuck RUNNING resolved |
| divisions | 16 | 11 real + 5 dummy |

### Schema Integrity: CLEAN
- FK constraints: 0 violations
- Unique constraints: 0 duplicate groups
- attendance_status: 0 unexpected values
- Code vs DB schema: 0 mismatches

### Enrichment Quality (55,051 enriched records)
employee_name: 99.5% | nik: 81.2% | hr_loc_code: 81.3% | current_emp_name: 81.3%
Gap in nik: PGE employees (legacy, not in DB_PTRJ HR)

---

## Attendance Imports Breakdown (2026-06-26)

| Division | Records | Employees | Machine | Status |
|----------|---------|-----------|---------|---------|
| ARC | 13,873 | 238 | ARC_01/02 | Accessible (port forwarding needed) |
| PGE | 9,936 | ~200 | OFFICE_PGE | Accessible (10.0.0.232) |
| DME | 9,249 | 176 | DME_01/02 | Accessible |
| AB1 | 6,018 | 136 | AB1 | Inaccessible (port forwarding) |
| AB2 | 5,954 | 109 | AB2 | Accessible |
| P1A | 3,492 | 174 | P1A | Accessible |
| P1B | 3,316 | 162 | P1B | Accessible |
| IJL | 2,895 | 45 | IJL | Accessible |
| ARA | 254 | 4 | ARA | Accessible |
| P2B | 40 | 4 | P2B | Unreachable (PGE network) |
| P2A | 34 | 4 | P2A | Unreachable (PGE network) |
| MANUAL_REVIEW | **2** | — | — | **New hires (not orphans)**: G0628, A0979, H0572-575 enrolled on machine but not yet in HR snapshot. HR process needed. |

> **Note on MANUAL_REVIEW:** After migration 074 rescued 10,022 orphaned MANUAL_REVIEW records, 2 genuine records remain. These are **new hire employees** enrolled on ZKTeco machines (AB1, AB2, P1A) but not yet in DB_PTRJ.HR_EMPLOYEE. HR process should add them. These are NOT orphan/rescue data.

---

## Infrastructure

| Property | Value |
|----------|-------|
| Backend port | 8004 |
| Scheduler | ENABLED |
| IT Solution API | DEPRECATED — ZKTeco direct only |
| Build | Clean (npm run build passed) |
| DB Server | 10.0.0.110 |

---

## Scheduler Jobs (src/config/schedule.json)

| Job | Interval | Status |
|-----|----------|--------|
| global sync | 60 min | ENABLED |
| attendance_pipeline_sync | 60 min | ENABLED |
| hr_snapshot_sync | 1440 min | ENABLED |

---

## Accessible Machines (10 confirmed ZKTeco)

| Machine | IP | Port | Division | LocCode | Network |
|---------|-----|------|----------|---------|---------|
| OFFICE_PGE | 10.0.0.232 | 4370 | PGE | A | Local PGE |
| P1A | 10.0.0.90 | 4100 | P1A | A | Local PGE |
| P1B | 10.0.0.91 | 4300 | P1B | B | Local PGE |
| MILL | 103.127.66.32 | 4370 | MILL | — | Public direct |
| OFFICE_APE | 103.144.208.154 | 4370 | ARE | — | Public |
| IJL | 103.144.211.226 | 4370 | IJL | L | Public direct |
| AB2 | 103.144.208.154 | 4400 | AB2 | H | Public |
| DME_01 | 103.144.228.42 | 4700 | DME | E | Public |
| DME_02 | 103.144.228.42 | 4701 | DME | E | Public |
| ARA | 103.144.208.154 | 4800 | ARA | F | Public |

---

## Known Remaining Issues

| # | Issue | Priority |
|---|-------|----------|
| 1 | Port forwarding on APE estate router (ARC_01, ARC_02, AB1) | HIGH |
| 2 | P2A/P2B network unreachable | LOW |
| 3 | 6-digit orphan IDs (AB2/HAB2) — new hires not in HR | MEDIUM |
| 4 | Batch tracking table gap | LOW |
| 5 | raw_scan_log_id 81.8% NULL | LOW |

---

## Full Audit Report
See `docs/FULL_SYSTEM_AUDIT_2026-06-26.md` for complete findings.
