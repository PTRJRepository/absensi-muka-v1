# MIGRATION_ROADMAP — Cleanup Bertahap

> Rule: jangan drop langsung. Urutan: Audit → Patch → Mark deprecated → Archive → Drop.
> Related: [[DATABASE_CLEANUP_PLAN]] [[LEGACY_DEPRECATION_LIST]] [[DEPENDENCY_AUDIT]]

---

## Phase 1: Audit Only (✅ DONE 2026-06-26)

Dokumen ini + 7 dokumen `final-architecture-cleanup/` + `db-audit-results.json` (baseline pre-cleanup).

**Deliverable:** inventory 65 tabel, klasifikasi, dependency FK graph, DQ metrics.

---

## Phase 2: Compatibility Views/API Patch (Low risk)

Goal: stop dependency ke broken/legacy tanpa drop. Bypass via service direct query.

| Task | File | Aksi |
|------|------|------|
| 2.1 Bypass `vw_attendance_monthly_matrix` | `attendance.routes.ts` | Sudah — `mode=database` call `monthly-matrix.service.ts`. Verifikasi tidak ada query langsung ke view. |
| 2.2 Fix `vw_employee_master_clean` (BROKEN) | View + caller | Drop/replace. Cari caller: jika ada route query view ini, bypass ke `employees` direct. |
| 2.3 Fix `quality.routes.ts` query dropped `zkteco_absensi_user_registry` | `quality.routes.ts:450,461,563,575` | Migrasi query ke `employees`+`hr_employee_current_snapshot`. |
| 2.4 Add try/catch + `error.code`/`detail` | matrix DB/datamesin/cell, dashboard | Bungkus handler, emit `{code:'MATRIX_DB_FAILED', detail:err.message}`. |
| 2.5 Unify response wrapper | machine-employee, dashboard | Migrasi `sendJson` → `sendEnvelope`. |
| 2.6 Fix `quality_score` hardcoded + `online==total` bug | `dashboard.routes.ts` | Compute DQ score; query `last_sync_at` recency. |
| 2.7 Fix `extend_db_ptrj` hardcoded default | `sql-client.ts:31`, `app-config.ts:39` | Default `rebinmas_absensi_monitoring` atau wajib env. |
| 2.8 Parameterize SQL injection | `attendance-raw.repository.ts`, `employee-mapping.service.ts`, `attendance-reconcile.service.ts:258`, `import-job.service.ts:154` | Ganti `${var}` → `@param`. |
| 2.9 Stop `machine_user_map` usage | `attendance-raw.repository.ts`, `employee-mapping.service.ts`, `summary.service.ts` | Migrasi JOIN ke `machine_user_raw`+`employees`. |
| 2.10 Remove IT Solution API frontend refs | `AttendancePage.tsx:408,672`, `status-mapping.ts:73` | Remove badge + branch. |
| 2.11 Update `vw_attendance_zkteco_*` to current_emp_code | 3 views | Ganti `parsed_employee_code` join → `current_emp_code` (lihat [[ARCHITECTURE_FINAL]] §6). |
| 2.12 Add resolution fields to matrix database response | `monthly-matrix.service.ts` | Tambah `parsed_employee_code`, `current_resolution_status`, `current_resolution_method`, `resolved_nik`. |
| 2.13 Fix frontend duplicate keys | `DataTable.tsx:69`, `QualityPage.tsx:218`, `MonitoringDashboard.tsx:151`, `MachinesPage.tsx:300,435` | Lihat [[FRONTEND_RENDERING_CONTRACT]] §2. |

**Migration file:** `migrations/075_phase2_compat_patch.sql` (view drops + constraint drop IT_SOLUTION_API).

---

## Phase 3: Mark Legacy Tables Deprecated (Low risk)

Goal: tandai legacy tanpa hilangkan data. Soft signal ke developer.

```sql
-- 076_mark_legacy_deprecated.sql
EXEC sp_addextendedproperty
  @name = N'is_deprecated', @value = N'true',
  @level0type = N'SCHEMA', @level0name = N'dbo',
  @level1type = N'TABLE', @level1name = N'zkteco_hr_employee_map';
-- repeat for: machine_user_map, mst_employee, mst_division, mst_machine,
-- mst_gang, mst_estate, api_attendance_raw, attendance_raw_log,
-- attendance_daily_process, attendance_process_detail, attendance_division_reconcile,
-- attendance_anomaly, attendance_manual_adjustment, employee_daily_assignment,
-- employee_division_history, employee_mapping_overrides, employee_schedules,
-- monitoring_daily_summary, import_batch, sync_job, shifts,
-- attendance_time_correction_batch, attendance_time_correction_detail,
-- app_configs (duplikat)
```

Plus drop broken views (sudah tidak dipakai setelah Phase 2 bypass):
```sql
IF OBJECT_ID('dbo.vw_attendance_monthly_matrix','V') IS NOT NULL DROP VIEW dbo.vw_attendance_monthly_matrix;
IF OBJECT_ID('dbo.vw_employee_master_clean','V') IS NOT NULL DROP VIEW dbo.vw_employee_master_clean;
IF OBJECT_ID('dbo.vw_attendance_anomaly_open','V') IS NOT NULL DROP VIEW dbo.vw_attendance_anomaly_open;
IF OBJECT_ID('dbo.vw_attendance_monitoring_daily','V') IS NOT NULL DROP VIEW dbo.vw_attendance_monitoring_daily;
```

---

## Phase 4: Archive Legacy/Backup Tables (Medium risk)

Goal: pindah backup + 0-row legacy ke cold storage / DB arsip, lalu drop dari DB utama.

### 4.1 Archive backup tables (3.9M rows)
```sql
-- 077_archive_backup_tables.sql
-- Opsi A: SELECT INTO ke DB arsip terpisah (rebinmas_absensi_archive)
-- Opsi B: bulk export ke parquet/csv via bcp, lalu DROP
SELECT * INTO rebinmas_absensi_archive.dbo.attendance_scan_logs_backup_20260623_233022
FROM dbo.attendance_scan_logs_backup_20260623_233022;
-- repeat untuk 14 backup/state/archive tables
-- lalu DROP TABLE dbo.<each>;
```

Target tables (lihat [[DATABASE_CLEANUP_PLAN]] §1.8):
- `attendance_scan_logs_backup_20260623_233022` (788.915)
- `attendance_scan_logs_backup_20260623_233115` (788.915)
- `attendance_scan_logs_linked_backup_20260623` (788.656)
- `attendance_scan_logs_unmapped_backup_20260623` (428.429)
- `scan_logs_backup_current_empcode_20260623` (788.677)
- `attendance_scan_logs_state_before_recovery_20260625` (24.279)
- `attendance_imports_backup_before_rebuild_20260625` (38.382)
- `attendance_imports_state_before_recovery_20260625` (0)
- `attendance_machines_state_before_recovery_20260625` (16)
- `employees_state_before_recovery_20260625` (0)
- `employees_backup_20260623` (3.761)
- `employees_contaminated_archive` (1.973)
- `zkteco_absensi_user_registry_backup_current_empcode_20260623` (1.827)
- `zkteco_hr_employee_map_backup_20260623` (6.474)

### 4.2 Drop 0-row legacy tables (drop FK dulu)

Urutan drop (child FK dulu — lihat [[DATABASE_CLEANUP_PLAN]] §2 Schema B):

```sql
-- 078_drop_legacy_phase4.sql
-- Step 1: drop FK yang ref mst_* (child)
ALTER TABLE api_attendance_raw DROP CONSTRAINT FK_api_raw_division; -- jika constraint ada
ALTER TABLE attendance_anomaly DROP CONSTRAINT FK_anomaly_division, FK_anomaly_employee, FK_anomaly_machine, FK_anomaly_process;
ALTER TABLE attendance_daily_process DROP CONSTRAINT FK_daily_division, FK_daily_scan_division, FK_daily_home_division, FK_daily_employee, FK_daily_gang;
ALTER TABLE attendance_division_reconcile DROP CONSTRAINT FK_reconcile_*;
ALTER TABLE attendance_manual_adjustment DROP CONSTRAINT FK_manual_process, FK_manual_employee;
ALTER TABLE attendance_process_detail DROP CONSTRAINT FK_process_detail_*;
ALTER TABLE attendance_raw_log DROP CONSTRAINT FK_raw_log_batch, FK_raw_log_machine;
ALTER TABLE employee_daily_assignment DROP CONSTRAINT FK_emp_daily_*;
ALTER TABLE employee_division_history DROP CONSTRAINT FK_emp_div_hist_*;
ALTER TABLE import_batch DROP CONSTRAINT FK_import_batch_*;
ALTER TABLE machine_user_map DROP CONSTRAINT FK_machine_user_map_employee, FK_machine_user_map_machine;
ALTER TABLE machine_user_raw DROP CONSTRAINT FK_machine_user_raw_batch, FK_machine_user_raw_machine; -- legacy FK
ALTER TABLE monitoring_daily_summary DROP CONSTRAINT FK_summary_division, FK_summary_estate;
ALTER TABLE mst_employee DROP CONSTRAINT FK_mst_employee_division, FK_mst_employee_gang;
ALTER TABLE mst_machine DROP CONSTRAINT FK_mst_machine_division, FK_mst_machine_estate;
ALTER TABLE mst_gang DROP CONSTRAINT FK_mst_gang_division;
ALTER TABLE mst_division DROP CONSTRAINT FK_mst_division_estate;

-- Step 2: drop child tables (leaf dulu)
DROP TABLE IF EXISTS api_attendance_raw;
DROP TABLE IF EXISTS attendance_process_detail;
DROP TABLE IF EXISTS attendance_division_reconcile;
DROP TABLE IF EXISTS attendance_anomaly;
DROP TABLE IF EXISTS attendance_manual_adjustment;
DROP TABLE IF EXISTS attendance_raw_log;
DROP TABLE IF EXISTS employee_daily_assignment;
DROP TABLE IF EXISTS employee_division_history;
DROP TABLE IF EXISTS employee_mapping_overrides;
DROP TABLE IF EXISTS employee_schedules;
DROP TABLE IF EXISTS monitoring_daily_summary;
DROP TABLE IF EXISTS shifts;
DROP TABLE IF EXISTS sync_job;
DROP TABLE IF EXISTS import_batch;
DROP TABLE IF EXISTS attendance_daily_process;
DROP TABLE IF EXISTS attendance_time_correction_detail;
DROP TABLE IF EXISTS attendance_time_correction_batch;
DROP TABLE IF EXISTS attendance_holiday; -- atau holidays, pilih satu
DROP TABLE IF EXISTS app_configs; -- duplikat

-- Step 3: drop mst_* (parent)
DROP TABLE IF EXISTS mst_employee;
DROP TABLE IF EXISTS mst_gang;
DROP TABLE IF EXISTS mst_machine;
DROP TABLE IF EXISTS mst_division;
DROP TABLE IF EXISTS mst_estate;

-- Step 4: drop mapping legacy
DROP TABLE IF EXISTS machine_user_map;
DROP TABLE IF EXISTS zkteco_hr_employee_map;
```

---

## Phase 5: Final Drop + Verify (High risk — setelah Phase 4 no dependency)

```sql
-- 079_final_drop_verify.sql
-- Verifikasi 0 dependency sebelum drop
SELECT t.name, COUNT(*) AS ref_count
FROM sys.tables t
LEFT JOIN sys.foreign_keys fk ON fk.referenced_object_id = t.object_id
WHERE t.name IN ('zkteco_hr_employee_map','machine_user_map') -- dst
GROUP BY t.name HAVING COUNT(*) > 0;
-- jika ref_count > 0 → JANGAN drop, fix dependency dulu

-- Drop tersisa
DROP TABLE IF EXISTS zkteco_hr_employee_map;
-- (sudah di Phase 4, ini redundansi verifikasi)
```

---

## SQL Validation Queries (pre & post drop)

```sql
-- V1: tabel yang masih ada
SELECT name FROM sys.tables ORDER BY name;
-- target: ~29 tabel aktif bersih

-- V2: view yang masih ada
SELECT name FROM sys.views ORDER BY name;
-- target: vw_attendance_final, vw_attendance_daily_summary, vw_attendance_monthly_summary(_v2), vw_attendance_zkteco_*(3), vw_sync_latest_status

-- V3: FK ke legacy (harus 0)
SELECT fk.name FROM sys.foreign_keys fk
JOIN sys.tables t ON fk.referenced_object_id = t.object_id
WHERE t.name LIKE 'mst[_]%' OR t.name IN ('zkteco_hr_employee_map','machine_user_map','import_batch');
-- target: 0 rows

-- V4: endpoint masih 200
-- GET /api/attendance/monthly-matrix?mode=database → 200
-- GET /api/attendance/monthly-matrix?mode=datamesin → 200
-- GET /api/monitoring/machine/P1A/employees → 200
-- GET /api/employees-comprehensive?mode=database → 200
-- GET /api/dashboard/stats → 200

-- V5: row counts utama (tidak berubah)
SELECT 'attendance_scan_logs', COUNT(*) FROM attendance_scan_logs UNION ALL
SELECT 'attendance_imports', COUNT(*) FROM attendance_imports UNION ALL
SELECT 'employees', COUNT(*) FROM employees;
-- target: 808093 / 55057 / 8005

-- V6: code grep legacy (harus 0 active source)
-- rg "zkteco_hr_employee_map" src/ → 0
-- rg "machine_user_map" src/api/routes src/modules → 0
-- rg "IT_SOLUTION_API" src/ frontend/src/ → 0
-- rg "extend_db_ptrj" src/ → 0
```

---

## Rollback Plan

| Phase | Rollback |
|-------|----------|
| 2 (patch) | `git revert` code changes. DB: re-create views dari backup definition (`db-audit-results.json` `viewdefs`). |
| 3 (mark) | `sp_dropextendedproperty` — no data loss. |
| 4 (archive+drop) | Restore dari `rebinmas_absensi_archive` DB: `SELECT * INTO dbo.<table> FROM rebinmas_absensi_archive.dbo.<table>`. Atau bcp import dari parquet. |
| 5 (final) | Sama dgn Phase 4. |

**Pre-deploy wajib:** full DB backup (`BACKUP DATABASE rebinmas_absensi_monitoring TO DISK = '...pre_cleanup_<date>.bak'`).

---

## Pre-Deployment Checklist

- [ ] Full DB backup done + verified restore
- [ ] `db-audit-results.json` baseline saved
- [ ] Code changes Phase 2 tested locally (`npm run build`, manual hit endpoints)
- [ ] Frontend `npm run build` pass
- [ ] Scheduler stopped (`schedule.json enabled:false`) selama migration
- [ ] Stakeholder notify (downtime window)
- [ ] Rollback script tested di staging

## Post-Deployment Checklist

- [ ] V1–V6 validation queries pass
- [ ] All 6 endpoints return 200
- [ ] Row counts utama unchanged (V5)
- [ ] Scheduler re-enabled
- [ ] `npm run build` + restart server
- [ ] Frontend pages render (matrix, employees-comprehensive, dashboard, machines)
- [ ] No `zkteco_hr_employee_map`/`machine_user_map`/`IT_SOLUTION_API`/`extend_db_ptrj` in active source (V6)
- [ ] Update CLAUDE.md + MEMORY.md dengan state post-cleanup
