# DATABASE_CLEANUP_PLAN — Inventory & Klasifikasi Tabel

> Basis: live DB `rebinmas_absensi_monitoring` (65 base tables + 12 views, audited 2026-06-26 14:15).
> Related: [[ARCHITECTURE_FINAL]] [[DATA_DICTIONARY_FINAL]] [[MIGRATION_ROADMAP]] [[DEPENDENCY_AUDIT]]

---

## 1. Inventory Lengkap (65 tables)

### 1.1 ACTIVE — RAW (2)

| Tabel | Rows | Klasifikasi | Rekomendasi |
|-------|------|-----------|-------------|
| `machine_user_raw` | 6.293 | RAW | **KEEP** — enrollment mesin |
| `attendance_scan_logs` | 808.093 | RAW | **KEEP** — raw scan, source of truth mesin |

### 1.2 ACTIVE — MASTER (6)

| Tabel | Rows | Klasifikasi | Rekomendasi |
|-------|------|-----------|-------------|
| `employees` | 8.005 | MASTER | **KEEP** — SSOT karyawan |
| `divisions` | 16 | MASTER | **KEEP** (11 real + 5 dummy) |
| `gangs` | 0 | MASTER | **KEEP** (skema ada, belum dipakai) |
| `attendance_machines` | 16 | MASTER | **KEEP** — inventory mesin |
| `loc_codes` | 11 | MASTER (reference) | **KEEP** — mapping locCode (A/B/C...) |
| `scanner_codes` | 9 | MASTER (reference) | **KEEP** — mapping scanner (100/200...) |

### 1.3 ACTIVE — REFERENCE / HISTORY (2)

| Tabel | Rows | Klasifikasi | Rekomendasi |
|-------|------|-----------|-------------|
| `hr_employee_current_snapshot` | 4.763 | REFERENCE | **KEEP** — current identity per NIK |
| `employee_code_history` | 5.967 | HISTORY | **KEEP** — riwayat kode per NIK |

### 1.4 ACTIVE — PROCESSED (2)

| Tabel | Rows | Klasifikasi | Rekomendasi |
|-------|------|-----------|-------------|
| `attendance_imports` | 55.057 | PROCESSED | **KEEP** — attendance final harian |
| `attendance_manual_corrections` | 0 | PROCESSED | **KEEP** — manual correction (kosong, schema siap) |

### 1.5 ACTIVE — OPERATIONAL/AUDIT (≈8)

| Tabel | Rows | Klasifikasi | Rekomendasi |
|-------|------|-----------|-------------|
| `attendance_import_batches` | 304 | AUDIT | **DEPRECATE as dashboard metric** — jangan source of truth dashboard. KEEP untuk batch tracking operasional saja. |
| `attendance_sync_logs` | 0 | AUDIT | **KEEP** — log sync (kosong, mungkin tak terisi) |
| `machine_connection_logs` | 0 | AUDIT | **KEEP** — log koneksi mesin |
| `attendance_machine_time_profile` | 1 | OPERATIONAL | **KEEP** — profil jam mesin |
| `attendance_work_config` | 7 | OPERATIONAL | **KEEP** — config hari kerja |
| `attendance_holiday` / `holidays` | 0 | OPERATIONAL | **KEEP salah satu** — ada duplikat `attendance_holiday` vs `holidays`, konsolidasi (lihat §3) |
| `audit_log` | 0 | AUDIT | **KEEP** |
| `attendance_change_logs` | 0 | AUDIT | **KEEP** |

### 1.6 LEGACY — IT Solution / mst_* (DROP_CANDIDATE, 0 rows, dependency ke view lama)

| Tabel | Rows | Klasifikasi | Rekomendasi | Alasan |
|-------|------|-----------|-------------|--------|
| `mst_employee` | 0 | LEGACY | **DROP** (Phase 5) | Digantikan `employees`. FK hanya dari tabel legacy lain. |
| `mst_division` | 13 | LEGACY | **DROP** (Phase 5) | Digantikan `divisions`. Masih jadi FK target view lama. |
| `mst_machine` | 15 | LEGACY | **DROP** (Phase 5) | Digantikan `attendance_machines`. |
| `mst_gang` | 0 | LEGACY | **DROP** | Digantikan `gangs`. |
| `mst_estate` | 8 | LEGACY | **DROP** (Phase 5) | Tidak ada di arsitektur final. |
| `api_attendance_raw` | 0 | LEGACY (IT Solution) | **DROP** | IT Solution API deprecated. FK → import_batch. |
| `attendance_raw_log` | 0 | LEGACY | **DROP** | Digantikan `attendance_scan_logs`. |
| `attendance_daily_process` | 0 | LEGACY | **DROP** | Schema proses lama (reconcile). |
| `attendance_process_detail` | 0 | LEGACY | **DROP** | Detail proses lama. |
| `attendance_division_reconcile` | 0 | LEGACY | **DROP** | Reconcile lama. |
| `attendance_anomaly` | 0 | LEGACY | **DROP** | Digantikan (belum ada pengganti aktif — anomaly detection unimplemented). |
| `attendance_manual_adjustment` | 0 | LEGACY | **DROP** | Digantikan `attendance_manual_corrections`. |
| `employee_daily_assignment` | 0 | LEGACY | **DROP** | Schema lama. |
| `employee_division_history` | 0 | LEGACY | **DROP** | Digantikan `employee_code_history`? (beda skema — verifikasi). |
| `employee_mapping_overrides` | 0 | LEGACY | **DROP** | Tidak dipakai. |
| `employee_schedules` | 0 | LEGACY | **DROP** | Tidak dipakai. |
| `monitoring_daily_summary` | 0 | LEGACY | **DROP** | Digantikan query langsung. |
| `import_batch` | 0 | LEGACY | **DROP** | Digantikan `attendance_import_batches`. |
| `sync_job` | 0 | LEGACY | **DROP** | Digantikan scheduler. |
| `attendance_time_correction_batch` | 0 | LEGACY | **DROP** | Fitur time-correction tidak aktif. |
| `attendance_time_correction_detail` | 0 | LEGACY | **DROP** | Sama. |
| `shifts` | 0 | LEGACY | **DROP** | Tidak dipakai. |

### 1.7 LEGACY — Mapping Tables (DROPPED/EMPTY)

| Tabel | Rows | Klasifikasi | Rekomendasi | Alasan |
|-------|------|-----------|-------------|--------|
| `zkteco_hr_employee_map` | **0** | LEGACY | **DROP** (Phase 5) | Sudah DROPPED di migration 056? Tabel masih ada, 0 rows. Masih diref `vw_attendance_monthly_matrix` (BROKEN view). |
| `machine_user_map` | **0** | LEGACY | **DROP** (Phase 5) | Masih dipakai di `attendance-raw.repository.ts`, `employee-mapping.service.ts`, `summary.service.ts` (FK `mst_employee`/`mst_machine`). Stop usage dulu. |
| `zkteco_absensi_user_registry_backup_current_empcode_20260623` | 1.827 | BACKUP | **ARCHIVE→DROP** (Phase 4) | Backup lama. |
| `zkteco_hr_employee_map_backup_20260623` | 6.474 | BACKUP | **ARCHIVE→DROP** (Phase 4) | Backup map lama. |

> Catatan: `zkteco_absensi_user_registry` + `zkteco_absensi_user_machine` + `employee_machine_enrollments` sudah DROPPED (tidak di `sys.tables`), tapi masih diref di banyak migration + script lama + 1 view (`vw_employee_master_clean` refs `employee_machine_enrollments` → **BROKEN view**).

### 1.8 BACKUP / STATE / ARCHIVE (DROP_CANDIDATE — data recovery, simpan dulu)

| Tabel | Rows | Rekomendasi |
|-------|------|-------------|
| `attendance_scan_logs_backup_20260623_233022` | 788.915 | **ARCHIVE** (bisa drop Phase 4, simpan ke cold storage) |
| `attendance_scan_logs_backup_20260623_233115` | 788.915 | **ARCHIVE→DROP** (duplikat 233022) |
| `attendance_scan_logs_linked_backup_20260623` | 788.656 | **ARCHIVE→DROP** |
| `attendance_scan_logs_unmapped_backup_20260623` | 428.429 | **ARCHIVE→DROP** |
| `scan_logs_backup_current_empcode_20260623` | 788.677 | **ARCHIVE→DROP** |
| `attendance_scan_logs_state_before_recovery_20260625` | 24.279 | **ARCHIVE→DROP** |
| `attendance_imports_backup_before_rebuild_20260625` | 38.382 | **ARCHIVE→DROP** |
| `attendance_imports_state_before_recovery_20260625` | 0 | **DROP** |
| `attendance_machines_state_before_recovery_20260625` | 16 | **DROP** |
| `employees_state_before_recovery_20260625` | 0 | **DROP** |
| `employees_backup_20260623` | 3.761 | **ARCHIVE→DROP** |
| `employees_contaminated_archive` | 1.973 | **ARCHIVE→DROP** (data kontaminasi, simpan audit trail) |

> ⚠️ Backup tables total ~3.9M rows. Pindah ke DB arsip terpisah atau cold storage sebelum drop. Jangan drop sebelum verifikasi recovery complete.

### 1.9 APP CONFIG / AUTH (verifikasi pemakaian)

| Tabel | Rows | Rekomendasi |
|-------|------|-------------|
| `app_config` | 5 | **KEEP** (verifikasi dipakai) |
| `app_configs` | 0 | **DROP** (duplikat `app_config`) |
| `users` | 0 | **KEEP** (schema auth, belum ada user) |
| `roles` | 5 | **KEEP** |
| `user_roles` | 0 | **KEEP** |

---

## 2. Dependency Check — Legacy Tables (FK graph)

FK analysis (from `sys.foreign_keys`) menunjukkan **2 schema paralel**:

### Schema A — NEW (ZKTeco-native, ACTIVE)
```
attendance_scan_logs.machine_id      → attendance_machines.id
attendance_scan_logs.sync_batch_id   → attendance_import_batches.id
attendance_imports.employee_id       → employees.id
attendance_imports.batch_id          → attendance_import_batches.id
attendance_imports.raw_scan_log_id   → attendance_scan_logs.id
attendance_manual_corrections.employee_id → employees.id
attendance_manual_corrections.created_by  → users.id
employees.division_id                → divisions.id
employees.gang_id                    → gangs.id
gangs.division_id                    → divisions.id
attendance_import_batches.machine_id → attendance_machines.id
```

### Schema B — LEGACY (IT Solution / mst_*)
```
api_attendance_raw       → import_batch, mst_division
attendance_anomaly       → attendance_daily_process, mst_division, mst_employee, mst_machine
attendance_daily_process → mst_division(x3), mst_employee, mst_gang
attendance_division_reconcile → attendance_daily_process, mst_division(x4), mst_employee, mst_machine
attendance_manual_adjustment  → attendance_daily_process, mst_employee
attendance_process_detail → attendance_daily_process, attendance_raw_log, mst_division, mst_machine
attendance_raw_log       → import_batch, mst_machine
employee_daily_assignment → mst_division(x2), mst_employee
employee_division_history → mst_division, mst_employee, mst_estate, mst_gang
import_batch             → mst_division, mst_machine, sync_job
machine_user_map         → mst_employee, mst_machine
machine_user_raw         → import_batch, mst_machine   ⚠️ machine_user_raw masih FK ke mst_machine + import_batch (legacy FK tersisa)
monitoring_daily_summary → mst_division, mst_estate
mst_division             → mst_estate
mst_employee             → mst_division, mst_gang
mst_machine              → mst_division, mst_estate
```

**⚠️ Blokade drop:** `mst_machine` + `mst_division` jadi FK parent untuk banyak legacy + `machine_user_raw`. Harus drop child dulu, atau drop FK bersamaan. Lihat [[MIGRATION_ROADMAP]] urutan drop.

**⚠️ `machine_user_raw` hybrid:** FK ke `mst_machine` + `import_batch` (legacy) padahal di arsitektur final harusnya FK `attendance_machines`. Perlu drop FK lama + tambah FK baru (atau biarkan tanpa FK, FK optional).

---

## 3. Redundansi / Duplikat

| Issue | Tabel | Rekomendasi |
|-------|-------|-------------|
| Config duplikat | `app_config` (5) vs `app_configs` (0) | Konsolidasi ke `app_config`, drop `app_configs` |
| Holiday duplikat | `attendance_holiday` (0) vs `holidays` (0) | Pilih satu, drop lainnya. Verifikasi mana yang dipakai dashboard. |
| Batch duplikat | `attendance_import_batches` (304) vs `import_batch` (0 legacy) | Drop `import_batch` |
| Mapping legacy | `zkteco_hr_employee_map` (0) + `machine_user_map` (0) vs `employees`+`hr_employee_current_snapshot` | Drop keduanya setelah stop usage |
| mst_* vs native | `mst_employee`/`mst_division`/`mst_machine`/`mst_gang` vs `employees`/`divisions`/`attendance_machines`/`gangs` | Drop mst_* Phase 5 |
| Kode lama di employees | 1.204 employees `current_emp_code ≠ employee_code` | Bukan redundansi tabel — perlu resolution (lihat [[ARCHITECTURE_FINAL]] §6) |

---

## 4. Tahapan Cleanup Aman

Lihat detail di [[MIGRATION_ROADMAP]]. Ringkasan:

| Phase | Aksi | Risiko |
|-------|------|--------|
| 1 | Audit only (DONE — dokumen ini) | None |
| 2 | Patch compatibility: bypass broken views, fix API endpoints | Low — sudah sebagian dilakukan (web app patch 2026-06-26) |
| 3 | Mark legacy tables deprecated (add `is_deprecated` comment / rename `_DEPRECATED`) | Low |
| 4 | Archive backup + state tables → cold storage DB | Medium — 3.9M rows, butuh storage |
| 5 | Drop legacy tables setelah 0 dependency (drop child FK dulu) | High — butuh urutan FK benar + rollback |

---

## 5. Risiko & Rollback

### Risiko
1. **Drop FK cascade salah urutan** → drop parent sebelum child gagal. Solusi: drop semua FK yang ref legacy dulu, baru drop tabel.
2. **View broken sudah ada** → `vw_attendance_monthly_matrix` (refs dropped `zkteco_hr_employee_map`), `vw_employee_master_clean` (refs dropped `employee_machine_enrollments`). Backend sudah bypass via service direct query. Drop view ini di Phase 3.
3. **Backup tables besar** → drop tanpa arsip = kehilangan data recovery. Wajib archive Phase 4.
4. **`machine_user_map` masih dipakai code** → 3 service masih JOIN. Stop usage dulu (Phase 2/3) sebelum drop.
5. **Migration 020 + 023 DEPRECATED** → jangan re-run (refs dropped tables).

### Rollback Plan
- **Pre-drop snapshot:** `SELECT * INTO <table>_snapshot_<date>` untuk setiap tabel yang akan didrop (backup tables tidak perlu — sudah backup itu sendiri).
- **Migration reversibel:** setiap drop migration sertakan `CREATE TABLE` + `INSERT FROM snapshot` di file rollback terpisah.
- **Code rollback:** git revert. Legacy code di service yang di-stop-usage harus tetap di git history.
- **DB state:** simpan `db-audit-results.json` (sudah ada) sebagai baseline pre-cleanup.

---

## 6. Ringkasan Klasifikasi Count

| Klasifikasi | Jumlah tabel | Rows (approx) |
|-------------|-------------|---------------|
| ACTIVE (RAW+MASTER+REF+PROCESSED+OPS) | ~20 | 878K utama + kecil |
| LEGACY (IT Solution/mst_*/process) | ~22 | 0 (semua kosong) |
| BACKUP/STATE/ARCHIVE | 14 | ~3.9M |
| Duplikat config/holiday | ~3 | kecil |
| **Total** | **65** | — |

**Drop candidate final:** ~36 tabel (22 legacy 0-rows + 14 backup). Setelah cleanup: ~29 tabel aktif bersih.
