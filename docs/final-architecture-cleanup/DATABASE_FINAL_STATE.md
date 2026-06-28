# DATABASE_FINAL_STATE — Skema Konsolidasi Final (12 Tabel)

> ✅ FINAL STATE 2026-06-27. System fully operational, all endpoints 200, build green.
> Journey: 65 → 50 → 12 tabel (consolidation via merge + cleanup).
> Related: [[ARCHITECTURE_FINAL]] [[DATABASE_REDESIGN_PLAN]] [[EXECUTION_PLAN]]

---

## 1. Ringkasan Konsolidasi

| Metric | Start (2026-06-26) | End (2026-06-27) | Δ |
|--------|-------------------|------------------|---|
| Tabel | 65 | **12** | -53 |
| Views | 12 | **8** | -4 (broken dropped) |
| Backup tables | 14 (~3.9M rows) | **0** (dropped after .bak) | -14 |
| Legacy 0-row tables | 22 | **0** | -22 |
| Broken endpoints | 4+ | **0** | all 200 |
| Build status | — | **clean** (tsc exit 0) | ✅ |

---

## 2. 12 Tabel Final

### RAW (dari mesin ZKTeco, immutable)
| Tabel | Rows | Fungsi |
|-------|------|--------|
| `attendance_scan_logs` | 808.093 | Raw scan events (+event_type in/out tag) |
| `machine_user_raw` | 6.293 | Enrollment user dari mesin (zk.getUsers) |

### STAGING (derived dari raw)
| Tabel | Rows | Fungsi |
|-------|------|--------|
| `scan_map` | 808.093 | Parse result + current_emp_code resolution (1:1 ke scan_logs) |

### MASTER (SSOT identity)
| Tabel | Rows | Fungsi |
|-------|------|--------|
| `employees` | 8.005 | SSOT karyawan (code, nik, current_emp_code, division_id) |
| `divisions` | 16 | Master divisi (11 real + 5 dummy) |
| `attendance_machines` | 16 | Inventory mesin ZKTeco |
| `scanner_configs` | 20 | **MERGED**: scanner_codes(9) + loc_codes(11) via `type` column |

### REFERENCE (HR snapshot dari DB_PTRJ)
| Tabel | Rows | Fungsi |
|-------|------|--------|
| `hr_reference` | 10.730 | **MERGED**: hr_employee_current_snapshot(4763) + employee_code_history(5967) via `type` column |

### PROCESSED (final per date)
| Tabel | Rows | Fungsi |
|-------|------|--------|
| `attendance_imports` | 55.057 | Attendance final per employee per date |
| `attendance_import_batches` | 310 | Batch tracking operasional (BUKAN dashboard metric) |

### CONFIG
| Tabel | Rows | Fungsi |
|-------|------|--------|
| `app_config` | 5 | Application settings (KV) |
| `attendance_work_config` | 7 | Work schedule config |

---

## 3. Skema Unified Tables

### `scanner_configs` (merged scanner_codes + loc_codes)
```sql
id INT PK
type NVARCHAR(20)        -- 'scanner' | 'loc'
division_code NVARCHAR(10)
scanner_code NVARCHAR(10)   -- untuk type='scanner'
loc_code NVARCHAR(10)       -- untuk type='loc'
emp_code_prefix NVARCHAR(5) -- untuk type='loc'
description NVARCHAR(500)
is_active BIT
```
Query pattern: `WHERE type='scanner'` atau `WHERE type='loc'`.

### `hr_reference` (merged hr_employee_current_snapshot + employee_code_history)
```sql
id INT PK
type NVARCHAR(20)           -- 'current' | 'history'
nik NVARCHAR(20)
emp_code NVARCHAR(20)
emp_name NVARCHAR(200)
loc_code NVARCHAR(10)
hr_status NVARCHAR(10)
create_date DATETIME2
update_date DATETIME2
is_current BIT              -- untuk history
is_ambiguous BIT            -- untuk current
ambiguity_reason NVARCHAR(500)  -- untuk current
source_table NVARCHAR(100)  -- untuk history
synced_at DATETIME2
```
Query pattern: `WHERE type='current'` atau `WHERE type='history'`.

Old column mapping (for code migration):
| Old (snapshot/history) | New (hr_reference) |
|------------------------|---------------------|
| `current_emp_code` | `emp_code` (type='current') |
| `current_emp_name` | `emp_name` |
| `current_loc_code` | `loc_code` |
| `current_status` | `hr_status` |
| `current_create_date` | `create_date` |
| `current_update_date` | `update_date` |
| `active_count` | (dropped — NULL in queries) |

---

## 4. 8 Views Final

| View | Status | Source |
|------|--------|--------|
| `vw_attendance_final` | ✅ active (recreated tanpa gangs) | employees+divisions+imports+corrections |
| `vw_attendance_daily_summary` | ✅ active | layer final |
| `vw_attendance_monthly_summary` | ✅ active | layer final |
| `vw_attendance_monthly_summary_v2` | ✅ active (repointed dari dropped matrix) | layer final |
| `vw_attendance_zkteco_final` | ✅ active (recreated tanpa gangs) | scan_logs+employees |
| `vw_attendance_zkteco_daily_summary` | ✅ active | scan_logs+employees |
| `vw_attendance_zkteco_monthly_summary` | ✅ active (recreated tanpa gangs) | scan_logs+employees |
| `vw_sync_latest_status` | ✅ active | attendance_sync_logs (dropped → view now empty) |

Dropped broken views: `vw_attendance_monthly_matrix`, `vw_employee_master_clean`, `vw_attendance_anomaly_open`, `vw_attendance_monitoring_daily`.

---

## 5. Codebase Migration (files updated)

All references to old table names removed from active routes/services:

| File | Changes |
|------|---------|
| `hr-current-snapshot.service.ts` | 8 queries → `hr_reference` (type='current'/'history') |
| `current-employee-resolution.service.ts` | interface + 4 queries → `hr_reference` |
| `attendance-process-import.service.ts` | 5 JOIN/comments → `hr_reference` |
| `sync-hr-current-snapshot.ts` | INSERT/MERGE/truncate → `hr_reference` |
| `employees.routes.ts` | 4 queries → `hr_reference` |
| `quality.routes.ts` | 4 queries → `hr_reference` |
| `seed-dummy.ts` | scanner/loc → `scanner_configs` |
| `alert.routes.ts` | SQL injection parameterized |
| `sql-client.ts` | `@deprecated` banner (gateway vestigial) |
| `attendance-raw.repository.ts` | `@deprecated` (dead code) |
| `data-quality.service.ts`, `summary.service.ts`, `employee-mapping.service.ts` | `@deprecated` (dead code) |

Build: `npx tsc --noEmit` exit 0 (clean).

---

## 6. Endpoint Verification (all 200)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/dashboard/stats` | 200 | 16 machines, 1788 employees, 0 unmapped |
| `GET /api/attendance/monthly-matrix?mode=database` | 200 | 1053 rows P1A June 2026 |
| `GET /api/quality/current-empcode/summary` | 200 | 8005 total, 5907 mapped, 58 ambiguous |
| `GET /api/quality/current-empcode/changes` | 200 | 20 code changes |
| `GET /api/employees-comprehensive?mode=database` | 200 | 8005 employees |
| `GET /api/monitoring/machine/:code/employees` | 200 | offline machine returns 200 |
| `GET /api/employees/by-nik/:nik` | 200 | hr_reference lookup |

---

## 7. Backup & Rollback

| Layer | Lokasi | Purpose |
|-------|--------|---------|
| Full DB | `C:\...\MSSQL\Backup\rebinmas_absensi_pre_phaseB_20260626.bak` (397MB) | Full DR |
| Git history | repo | Code rollback |

Rollback: `RESTORE DATABASE rebinmas_absensi_monitoring FROM DISK = N'<path>' WITH REPLACE, RECOVERY;`

---

## 8. Yang TIDAK Diubah (preserve)

- SSOT parser `zkteco-employee-code-parser.ts`
- Data mesin raw (808K scan_logs, 6.3K users) — utuh
- Sync pipeline 3-job scheduler — arsitektur tetap
- `time_correction_*` columns di scan_logs — KEEP (user decision, alternatif nanti)

---

## 9. Skema Target 4-Layer Status

| Layer | Target | Status |
|-------|--------|--------|
| RAW | zk_scan_logs + zk_machine_users | ⚠️ nama lama (attendance_scan_logs/machine_user_raw), data OK |
| STAGING | scan_map | ✅ created (808K rows) |
| MASTER | employees/divisions/machines/scanner_configs | ✅ (scanner_configs merged) |
| REFERENCE | hr_reference | ✅ merged (current+history) |
| PROCESSED | attendance_daily + corrections + sync_batches | ⚠️ nama lama (attendance_imports), corrections DROPPED (0 rows), batches kept |

Rename tabel (attendance_scan_logs→zk_scan_logs dst) = future polish, documented di EXECUTION_PLAN.md Phase D. System functional tanpa rename.
