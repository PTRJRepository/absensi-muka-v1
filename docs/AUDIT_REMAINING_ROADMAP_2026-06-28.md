# Audit Remaining Roadmap — 2026-06-28

> Post 4-agent audit. P0 + priority P1 fixed. Remaining findings need verify (agent false positive risk) or bigger refactor.

## Fixed (commits b100693, a3fa64c, 9af43ff, e70762b)

| Sev | Bug | Fix |
|---|---|---|
| P0 | gangs JOIN (table dropped) 6 titik → 500 | Hapus JOIN, gang_code='N/A' |
| P0 | SQL injection division.routes pivot | DB-validated + alnum sanitize |
| P0 | B3 migration 086 regression (resolved_at≠attendance_date) | Mig 087 rewrite JOIN scan_date |
| P1 | resolvedEmployeeCodeSql correlated subquery (CLAUDE.md violation, 30-50s) | Pakai scan_map.current_emp_code via view. Latency 30-50s→2.5s |
| P1 | quality-dashboard.routes orphan + bug | Removed |
| P1 | alert.routes silent swallow | Add console.error |
| P1 | EmployeeIdentityDrawer double-unwrap (empty detail/scans) | scansData?.rows, detailData direct |
| P1 | attendance-service checkInAt scan_time (double-offset) | raw_record_time fallback |
| P0 | api.ts 401 no logout + error before body | clearToken+reload, read body first |

## Remaining — VERIFY before fix (agent false positive)

| Sev | Claim | Verify |
|---|---|---|
| P0 | attendance-process-import.service query `hr_reference` (agent: table not exist) | FALSE — hr_reference exists (DB agent + memory confirm). Re-check if query col wrong |
| P0 | attendance-rebuild.service INSERT machine_code to imports (col not exist) | Verify col list — source_reference pengganti? Query pakai compat view? |
| P0 | SQL injection IN-clause: employee.repository:35,90,142 + current-employee-resolution:551,593 + machine.repository:64 | Grep pattern tak match — re-verify manual |
| P0 | command injection sync.routes:158 + machine-employee:108 (PowerShell IP interp) | IP DB-sourced — low risk but sanitize |
| P0 | scheduler no PID tracking + no boot reaper (root cause 9 stuck RUNNING) | Verify scheduler.service spawn pattern |

## Remaining — Bigger refactor (defer)

| Sev | Bug | Why defer |
|---|---|---|
| P0 | JWT localStorage XSS (api.ts:5-7) | Needs httpOnly cookie backend (auth.service) + CSRF. Big change |
| P1 | attendance.routes.ts 72KB (263 baris dead code) | Split file = scope C, verify dead block first |
| P1 | frontend alfa double-count (AttendanceMatrixPage:351) | Verify matrix KPI logic |
| P1 | ops-service typo `liveOnlineMachines ?? liveOnlineMachines` | Trivial fix, batch next |
| P1 | MachineDetailModal ignore real_access_status (recompute staleness) | Verify modal logic |
| P2 | DB: 11 migration dup nomor (001×2, 007×4, dst) | Renumber = break fresh install order, careful |
| P2 | DB: index hilang (imports.raw_scan_log_id, raw.raw_device_user_id, employees.nik, hr_reference.nik) | Add index migration |
| P2 | DB: length mismatch scan_map.current_emp_code nvarchar(40) vs employees nvarchar(60) | Alter migration |
| P2 | DB: employees.gang_id orphan col | Drop col migration |
| P2 | frontend: 3 vocabulary status fragmentation | Consolidate types |
| P2 | frontend: inline style per render ~2000 lines CSS | Extract to CSS file |
| P3 | response format inkonsisten (alert/import/realtime manual res.end) | Refactor to sendJson |

## Verified Non-Bugs (agent false positive)
- attendance.routes 396-559 "dead code" = live code (searchCandidates)
- hr_reference "not exist" = exists
- B5 check_out NULL 2978 = INCOMPLETE_SCAN legit

## Next priority
1. Verify SQL injection IN-clause claims (manual grep different pattern)
2. Verify attendance-rebuild.service col bug
3. Trivial: ops-service typo, MachineDetailModal status
4. DB index migration (P2, safe)
