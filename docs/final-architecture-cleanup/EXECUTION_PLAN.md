# EXECUTION_PLAN — Cleanup + Rename Bertahap

> Keputusan user (2026-06-26):
> - Rename tabel: **YA, bertahap** (compat view layer, jangan break web app)
> - Backup: **YA, lakukan dulu**
> - Time correction (13 kolom nonaktif): **KEEP** — nanti pakai alternatif approach. Skip drop.
> - gangs: **DROP**
> - Rename bertahap sambil perbaiki web app, **jangan sampai broken**
>
> Related: [[DATABASE_REDESIGN_PLAN]] [[MIGRATION_ROADMAP]]

---

## Strategy: Compatibility View Layer (non-breaking rename)

Untuk setiap tabel rename, urutan aman:
1. Update **write path** code (INSERT/UPDATE) ke nama tabel baru — write path terbatas.
2. `EXEC sp_rename '<lama>', '<baru>'`
3. `CREATE VIEW <lama> AS SELECT * FROM <baru>` — compat untuk SELECT path yang belum diupdate.
4. Update **SELECT path** code bertahap ke nama baru. Build + test tiap step.
5. Drop view compat setelah semua SELECT migrasi.

Rename kolom: tahap terakhir, setelah tabel rename stabil (view bisa alias kolom).

---

## Phase 0: Backup (SEKARANG, sebelum apapun)

| Step | Aksi |
|------|------|
| 0.1 | Full DB backup: `BACKUP DATABASE rebinmas_absensi_monitoring TO DISK` (butuh path server) |
| 0.2 | Safety snapshot tabel kritikal yg akan rename (fallback kalau full backup gagal) |
| 0.3 | Archive 14 backup tables → rename `_archive_20260626` (preserve in-DB) |

## Phase A: Drop Unused 0-row + gangs + broken views (low risk, non-breaking)

| Step | Aksi | Non-breaking? |
|------|------|---------------|
| A.1 | Drop 4 broken views (backend sudah bypass) | ✅ |
| A.2 | Recreate 3 active views tanpa gangs join (gangs=0 rows → gang_code='N/A') | ✅ |
| A.3 | Drop legacy FKs + gangs FKs + machine_user_raw legacy FKs | ✅ |
| A.4 | Drop 18 legacy leaf tables (0 rows) | ✅ |
| A.5 | Drop gangs | ✅ (after A.2) |
| A.6 | Drop mst_* parents (5) | ✅ |
| A.7 | Drop zkteco_hr_employee_map (0 rows) | ✅ |
| A.8 | Drop app_configs (dup) | ✅ |
| A.9 | Verify: 6 endpoint 200 + table count | — |

**Tidak didrop Phase A (active dep):** `machine_user_map` (Phase B stop usage dulu), backup tables (Phase 0.3 archive), time_correction kolom (KEEP per user).

## Phase B: Fix Active-Broken Deps

| Step | Aksi |
|------|------|
| B.1 | Stop `machine_user_map` usage: migrate 3 service (attendance-raw.repository, employee-mapping.service, summary.service) ke `machine_user_raw`+`employees` |
| B.2 | Fix `quality.routes.ts` query dropped `zkteco_absensi_user_registry` → migrate ke `employees`+`hr_current_snapshot` |
| B.3 | Parameterize SQL injection (4 file high-risk) |
| B.4 | Fix `extend_db_ptrj` hardcoded default → `rebinmas_absensi_monitoring` |
| B.5 | Drop `machine_user_map` (after B.1, 0 rows) |
| B.6 | Drop backup tables (after Phase 0.3 archive verified) |

## Phase C: Trim Kolom Nonaktif (SKIP time_correction per user)

| Step | Aksi |
|------|------|
| C.1 | Drop `scan_time_wib`/`scan_date_wib` (redundant dgn scan_time/scan_date) |
| C.2 | ~~Drop time_correction_* (13 kolom)~~ — **SKIP, user KEEP untuk alternatif** |
| C.3 | Drop `parsed_division_code` (final lewat division_id) |

## Phase D: Rename Tabel Bertahap (compat view, non-breaking)

Urutan (lowest write-path risk dulu):

| Step | Tabel lama → baru | Write path | View compat |
|------|-------------------|-----------|-------------|
| D.1 | `attendance_manual_corrections` → `attendance_corrections` | low (HR admin, 0 rows) | view lama pass-through |
| D.2 | `attendance_import_batches` → `sync_batches` | med (scheduler writes) | view |
| D.3 | `attendance_machines` → `machines` | med | view |
| D.4 | `machine_user_raw` → `zk_machine_users` | med (sync-machines writes) | view |
| D.5 | `attendance_imports` → `attendance_daily` | med (rebuild writes) | view |
| D.6 | `attendance_scan_logs` → `zk_scan_logs` | med (sync-orchestrator writes) | view |
| D.7 | `hr_employee_current_snapshot` → `hr_current_snapshot` | med (snapshot sync writes) | view |

Tiap step D.x: update write code → sp_rename → create view compat → update SELECT code bertahap → build+test → drop view.

## Phase E: Rename Kolom (setelah tabel stabil)

Rename kolom per [[DATABASE_REDESIGN_PLAN]] §5 (raw_device_user_id→device_user_id, dst). View compat alias kolom lama. Bertahap.

## Phase F: Pisah Staging (scan_map)

Buat `scan_map`, migrasi enrichment kolom dari scan_logs. Raw jadi immutable.

## Verify (tiap phase)

```sql
SELECT COUNT(*) FROM sys.tables;  -- target Phase A: ~47 (dari 65)
-- 6 endpoint HTTP 200
-- row counts utama: scan_logs 808093, imports 55057, employees 8005
```

---

## Rollback

- Pre Phase 0: full DB backup (gold standard)
- Per phase: `SELECT * INTO _snapshot_<table>` sebelum drop/rename
- Code: git revert
- Rename: `sp_rename` balik + drop view compat
