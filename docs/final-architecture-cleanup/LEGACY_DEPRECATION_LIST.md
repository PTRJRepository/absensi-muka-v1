# LEGACY_DEPRECATION_LIST — File/Tabel/View/Endpoint/Migration Deprecated

> Basis: repo scan + DB audit 2026-06-26.
> Related: [[DATABASE_CLEANUP_PLAN]] [[MIGRATION_ROADMAP]] [[DEPENDENCY_AUDIT]]

---

## 1. IT Solution API References (DEPRECATED — jangan jadikan source of truth)

### Docs/code yang masih menyebut IT Solution API

| File:line | Konteks | Aksi |
|-----------|---------|------|
| `_dev_utils/src/absensi-client.ts:5,7,101` | `AbsensiApiClient` class, "Terhubung ke IT Solution Absensi 10.0.0.110:5176" | **DELETE file** (dev_utils, tak dipakai prod) |
| `_dev_utils/src/config.ts:16` | "IT Solution API Configuration" | DELETE |
| `_dev_utils/src/sync.ts:7` | "Sync dari IT Solution" | DELETE |
| `_dev_utils/migration_v1_employee_attendance.sql:68,136` | comment IT_SOLUTION_API | UPDATE comment |
| `_dev_utils/migration_v3_seed_master.sql:71-77` | seed "via IT Solution API" | UPDATE comment |
| `frontend/src/components/features/attendance/AttendancePage.tsx:408,672` | badge `source === 'IT_SOLUTION_API'` | **REMOVE badge** — source tidak mungkin IT_SOLUTION_API lagi |
| `frontend/src/services/status-mapping.ts:73` | `raw.includes('IT_SOLUTION') → 'API'` | REMOVE branch |
| `migrations/002_create_tables.sql:114` | CHECK constraint `data_source IN ('DIRECT_ZKTECO','IT_SOLUTION_API',...)` | ⚠️ constraint masih ada — drop constraint Phase 3 |
| `migrations/014_monthly_matrix_view.sql:98` | `SUM CASE source='IT_SOLUTION_API'` | view legacy, bypass |
| `migrations/023_live_attendance_compat.sql:241` | `SUM CASE source IN ('IT_SOLUTION_API','API')` | **DEPRECATED migration** (jangan rerun) |
| `migrations/072_fix_matrix_view_sSOT.sql:251` | `SUM CASE source IN ('IT_SOLUTION_API','API')` | UPDATE view def |

---

## 2. `api-attendance-import.service.ts` (DEPRECATED)

| Aspek | Status |
|-------|--------|
| File `src/modules/import/api-attendance-import.service.ts` | **Tidak ditemukan di disk** (0 hits grep). CLAUDE.md catatan DEPRECATED. |
| Referensi import | 0 di active source. |
| Aksi | Pastikan tidak ada route/script yang import. Jika file ada, DELETE. |

---

## 3. Legacy Mapping Tables

### `zkteco_hr_employee_map` (NON-PRIMARY, 0 rows)
- **Status:** DROPPED di migration 056? Tabel masih ada di `sys.tables` (0 rows). Backup `zkteco_hr_employee_map_backup_20260623` (6.474 rows).
- **Masih diref oleh:**
  - `vw_attendance_monthly_matrix` (BROKEN view — backend sudah bypass via `monthly-matrix.service.ts`)
  - Migrations: 017, 019, 020 (DEPRECATED), 022, 023 (DEPRECATED), 024, 027, 030, 033, 038, 040, 041, 043, 044, 045, 072, 073
  - Scripts: `analyze-database.ts`, `audit-employee-master.ts`, `audit-long-raw-device-id-cases.ts`, `repair-long-raw-device-id-mappings.ts`, `run-employee-master-migrations.ts`, `run-migration-030.ts`, `run-migration-033.ts`, `sync-zkteco-hr-mapping.ts`
  - `sql/diagnostic-intermittent-data.sql`
- **Aksi:** Drop tabel Phase 5. Stop usage di service (sudah — `employee-comprehensive.service.ts:85` comment "No more zkteco_hr_employee_map"). Drop view `vw_attendance_monthly_matrix` Phase 3 (ganti service direct).

### `machine_user_map` (LEGACY, 0 rows, MASIH DIPAKAI CODE ⚠️)
- **Status:** 0 rows. FK ke `mst_employee`+`mst_machine` (legacy). PK `map_id` terdaftar di `sql-client.ts:181`.
- **Masih dipakai di ACTIVE source:**
  - `src/modules/attendance/attendance-raw.repository.ts:72,78,117,138,148,166` (JOIN + unmapped query)
  - `src/modules/employees/employee-mapping.service.ts:377,391,399,414,430,456,476` (upsert + JOIN + delete)
  - `src/modules/monitoring/summary.service.ts:200` (LEFT JOIN)
  - `src/scripts/check-machine-user-mapping.ts`
- **Aksi:** **STOP USAGE dulu** (Phase 2/3) — migrasi query ke `machine_user_raw` + `employees`. Baru drop tabel Phase 5.

### `zkteco_absensi_user_registry` (DROPPED, masih diref)
- **Status:** Tabel DROPPED (tidak di `sys.tables`). Backup `zkteco_absensi_user_registry_backup_current_empcode_20260623` (1.827 rows).
- **Masih diref:** Migrations 041, 043, 044, 045, 047, 056, 065; scripts `analyze-database.ts`, `analyze-db-stats.ts`, `audit-employee-master.ts`, `backfill-current-empcode-registry.ts`, `backfill-current-empcode-scan-logs.ts`, `check-schema.ts`, `investigate-record.ts`, `test-current-empcode.ts`; `sql/rollback-current-empcode.sql`, `sql/validate-current-empcode.sql`; `src/api/routes/quality.routes.ts:450,461,563,575` (**ACTIVE route** ⚠️).
- **Aksi:** Fix `quality.routes.ts` (query ke tabel dropped → 500). Drop backup Phase 4.

### `zkteco_absensi_user_machine` (DROPPED, masih diref)
- **Status:** DROPPED. Diref di migrations 041, scripts `analyze-database.ts`, `analyze-db-stats.ts`, `investigate-record.ts:155`.
- **Aksi:** Cleanup script references.

### `employee_machine_enrollments` (DROPPED, tapi diref VIEW BROKEN ⚠️)
- **Status:** DROPPED. Diref `vw_employee_master_clean` (BROKEN view — query akan 500/error).
- **Masih diref:** migrations 043, 044, 054, 056; scripts `run-employee-master-migrations.ts`, `sanitize-employee-master.ts`.
- **Aksi:** Drop/fix `vw_employee_master_clean` Phase 3.

---

## 4. Migrations Deprecated (JANGAN RERUN)

| Migration | Alasan |
|-----------|--------|
| `020_update_attendance_views.sql` | Ref `zkteco_hr_employee_map` (DROPPED) |
| `023_live_attendance_compat.sql` | Ref `zkteco_hr_employee_map` (DROPPED) |
| `017_create_zkteco_hr_mapping.sql` | CREATE tabel dropped |
| `030_fix_zkteco_hr_employee_map_nulls.sql` | Fix tabel dropped |
| `038_sanitize_zkteco_map_short_converted.sql` | Sanitize tabel dropped |
| `041_sanitize_long_absensi_user_registry.sql` | Ref tabel dropped |
| `043_create_employee_machine_enrollments.sql` | CREATE tabel dropped |
| `044_backfill_employee_machine_enrollments.sql` | Backfill tabel dropped |
| `056_merge_and_simplify_employee_tables.sql` | DROP tabel (sudah jalan) |
| `065_emergency_recovery_phase_2_restore_master.sql` | Emergency (one-shot) |

> `migrations/073_deprecate_legacy_migrations.sql` sudah menandai beberapa. Verifikasi daftar lengkap.

---

## 5. Views Legacy (ganti/fix)

| View | Status | Aksi |
|------|--------|------|
| `vw_attendance_monthly_matrix` | **BROKEN** (refs dropped `zkteco_hr_employee_map`) | Drop Phase 3. Backend sudah bypass via `monthly-matrix.service.ts`. |
| `vw_employee_master_clean` | **BROKEN** (refs dropped `employee_machine_enrollments`) | Drop/fix Phase 3. |
| `vw_attendance_anomaly_open` | Refs legacy `mst_employee`+`mst_division` (0 rows) | Drop Phase 3 (anomaly unimplemented). |
| `vw_attendance_monitoring_daily` | Refs legacy `attendance_daily_process`+`mst_*` (0 rows) | Drop Phase 3. |
| `vw_attendance_monthly_summary` / `_v2` | Layer di atas `vw_attendance_final`/matrix | Review — mungkin masih dipakai reports.routes. |
| `vw_attendance_final` | Active (employees+divisions+imports+corrections) | KEEP |
| `vw_attendance_zkteco_*` (3) | Active tapi pakai `parsed_employee_code` only | ⚠️ Perlu update ke `current_emp_code` (lihat [[ARCHITECTURE_FINAL]] §6). |
| `vw_sync_latest_status` | Active (attendance_sync_logs) | KEEP |
| `vw_attendance_daily_summary` | Active (layer final) | KEEP |

---

## 6. Endpoints Legacy (redirect/disable)

| Endpoint | Status | Aksi |
|----------|--------|------|
| Route yang query `vw_attendance_monthly_matrix` langsung (jika ada selain service) | Bypass via service | Sudah — verifikasi |
| `reports.routes.ts:8,15,26,33` | `SELECT * FROM vw_attendance_final` / `vw_attendance_monthly_summary` | Review: pakai view active atau migrasi ke service. |
| `quality.routes.ts:450,461,563,575` | Query `zkteco_absensi_user_registry` (DROPPED) → **500** | **FIX** — migrasi ke `employees`+`hr_employee_current_snapshot`. |
| IT Solution API endpoints (jika ada route `/api/itsolution/*`) | Tidak ditemukan | — |
| `attendance-process.routes.ts` | Review — mungkin legacy `attendance_daily_process` | Audit |

---

## 7. Legacy DB Client / DB Name

| Item | Status | Aksi |
|------|--------|------|
| `extend_db_ptrj` (legacy DB name) | Hardcoded default di `sql-client.ts:31`, `app-config.ts:39` | **FIX** — ganti default ke `rebinmas_absensi_monitoring` atau hapus default (wajib env). |
| `SqlClient` class | **AKTIF** (23 file pakai) — bukan legacy, tapi banyak service pakai. | KEEP tapi audit injection risk. Jangan dipakai untuk attendance baru? (CLAUDE.md rule: direct MSSQL). |
| `_dev_utils/src/database.ts`, `db-diag.ts`, `db-direct.ts`, `init-attendance-tables.ts`, `init-db.ts`, `test.ts` | `extend_db_ptrj` hardcoded | dev_utils — DELETE atau update. |

---

## 8. Legacy Tables Summary (drop candidates)

Lihat [[DATABASE_CLEANUP_PLAN]] §1.6–1.8 untuk detail + row counts. Ringkasan:
- **mst_*** (5 tabel, 0 rows kecuali mst_division=13, mst_machine=15, mst_estate=8)
- **IT Solution/process** (api_attendance_raw, attendance_raw_log, attendance_daily_process, attendance_process_detail, attendance_division_reconcile, attendance_anomaly, attendance_manual_adjustment, employee_daily_assignment, employee_division_history, employee_mapping_overrides, employee_schedules, monitoring_daily_summary, import_batch, sync_job, shifts) — semua 0 rows
- **Time correction** (attendance_time_correction_batch, attendance_time_correction_detail) — 0 rows, fitur nonaktif
- **Backup/state/archive** (14 tabel, ~3.9M rows) — archive dulu
- **Mapping legacy** (zkteco_hr_employee_map=0, machine_user_map=0, + 2 backup)
