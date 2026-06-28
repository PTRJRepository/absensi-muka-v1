# EXECUTION_PLAN — Cleanup + Rename Bertahap

> ✅ Phase 0 + Phase A DONE 2026-06-26 (65→51 tables, gangs gone, 4 broken views dropped, 8 views clean, 0 dangling refs).
> Backup in-DB: 12 `snap_*_20260626` tables + 12 `arch_*` archive tables.
>
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

| Step | Aksi | Status |
|------|------|--------|
| B.2 | Fix `quality.routes.ts` query dropped `zkteco_absensi_user_registry` → repoint ke `employees` | ✅ DONE 2026-06-26 (2 endpoint fixed + pre-existing TOP+OFFSET bug + missing column fix) |
| B.1 | ~~Migrate machine_user_map usage~~ → **DEAD CODE CLUSTER found**: attendance-raw.repository + data-quality.service + summary.service + employee-mapping.service all unrouted/vestigial (queries dropped attendance_raw_log/mst_machine/machine_user_map). Marked deprecated, table DROPPED (0 rows, 0 FKs, 0 live callers). No rewrite needed. | ✅ DONE 2026-06-26 (table dropped 65→50) |
| B.3 | Parameterize SQL injection (4 file high-risk: attendance-raw.repository, employee-mapping.service, attendance-reconcile.service:258, import-job.service:154) | pending (riskiest) |
| B.4 | Fix `extend_db_ptrj` hardcoded default → `rebinmas_absensi_monitoring` | pending (CAUTION: SqlClient is HTTP-gateway client, 23 services use it — changing default risks gateway connectivity, needs separate audit) |
| B.5 | Drop `machine_user_map` (after B.1, 0 rows) | pending |
| B.6 | Drop backup tables (after Phase 0 archive verified) | pending |

## Phase C: Trim Kolom Nonaktif (SKIP time_correction per user)

| Step | Aksi |
|------|------|
| C.1 | Drop `scan_time_wib`/`scan_date_wib` (redundant dgn scan_time/scan_date) |
| C.2 | ~~Drop time_correction_* (13 kolom)~~ — **SKIP, user KEEP untuk alternatif** |
| C.3 | Drop `parsed_division_code` (final lewat division_id) |

## Phase D: Rename Tabel Bertahap (FUTURE — not executed 2026-06-26)

**Status:** System clean & stable at 50 tables. Rename = polish, not cleanup. Deferred for future work when time/risk tolerance allows.

**Risk assessment (live route usage):**

| Tabel → New | Route hits | Write paths | Risk | Why deferred |
|-------------|-----------|-------------|------|-------------|
| `attendance_manual_corrections` → `attendance_corrections` | 15 (incl INSERT in route) | attendance.routes.ts INSERT | **High** | SQL Server view can't support INSERT without INSTEAD OF trigger. Complex. |
| `attendance_import_batches` → `sync_batches` | 36 (all read) | scripts only | **Med** | Many routes to migrate. Current name works fine. |
| `attendance_machines` → `machines` | 20 (all read) | scripts/seed only | **Low** | Could do with compat view, but low value vs risk. |
| `machine_user_raw` → `zk_machine_users` | 3 (all read) | sync-machines.ts write | **Low** | Few callers, but `zk_` prefix non-standard. |
| `attendance_imports` → `attendance_daily` | 15+ (read/write) | rebuild script | **High** | Complex query migration. Current name clear enough. |
| `attendance_scan_logs` → `zk_scan_logs` | 15+ (read/write) | sync-orchestrator writes | **High** | Core table, many dependencies. Current name clear. |
| `hr_employee_current_snapshot` → `hr_current_snapshot` | 3 (all read) | snapshot sync writes | **Low** | Few callers, but current name descriptive. |

**Strategy if proceeding:**
1. Update write paths first (scripts/services) to new table name
2. `EXEC sp_rename '<old>', '<new>'`
3. `CREATE VIEW <old> AS SELECT * FROM <new>` (compat for read paths)
4. Migrate read paths gradually
5. Drop compat view when all migrated
6. Verify: 6 endpoint 200, row counts unchanged

**Blockers:**
- `attendance_manual_corrections` has INSERT in route → need INSTEAD OF trigger or route code update before rename
- High-risk tables (scan_logs, imports) have 15+ route hits each → large migration surface
- Low ROI: current names already clear, system stable

**Conclusion:** Rename = polish. Not needed for Phase A–C cleanup success. Defer to future iteration.

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
