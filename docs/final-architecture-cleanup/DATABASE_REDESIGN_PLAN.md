# DATABASE_REDESIGN_PLAN — Skema Profesional + Cleanup Map

> ⚠️ **PLANNING ONLY. Jangan edit kode/DB apa pun sebelum approval.** Dokumen ini peta + rancangan.
> Basis: live DB audit 2026-06-26 (65 tabel, 12 view) + source audit.
> Related: [[ARCHITECTURE_FINAL]] [[DATABASE_CLEANUP_PLAN]] [[DATA_DICTIONARY_FINAL]] [[MIGRATION_ROADMAP]]

---

## 0. Ringkasan Eksekutif

3 keluhan user:
1. Banyak tabel unused + backup → **bersihkan** (peta §1–2).
2. Nama kolom berantakan → **sederhanakan** (skema target §4).
3. Buat skema **serprofesional/sesistematis mungkin** dengan 2 zona jelas:
   - **RAW**: original dari mesin (termasuk tag scan in/out), **tanpa proses apapun**.
   - **PROCESSED**: hasil mapping + join DB_PTRJ HR + cross-absen + agregasi.

**Prinsip desain:** pemisahan tegas RAW vs PROCESSED. Saat ini `attendance_scan_logs` (37 kolom) mencampur raw mesin + hasil parser + enrichment current_emp_code → **kotor**. Skema target pisahkan 3 lapis: raw murni, staging/parse, processed final.

---

## 1. Peta Tabel UNUSED (siap bersihkan — 0 rows + 0 dependency aktif)

> Aman dibersihkan setelah verifikasi dependency (§2). Urutan drop lihat [[MIGRATION_ROADMAP]].

### 1.1 Legacy IT Solution / mst_* / process (22 tabel, semua 0 rows kecuali mst config)

| Tabel | Rows | Kenapa unused | Aksi |
|-------|------|---------------|------|
| `mst_employee` | 0 | Diganti `employees`. Hanya FK target legacy. | DROP |
| `mst_division` | 13 | Diganti `divisions`. Masih FK target view legacy. | DROP (after view drop) |
| `mst_machine` | 15 | Diganti `attendance_machines`. Masih FK parent `machine_user_raw`. | DROP (after FK drop) |
| `mst_gang` | 0 | Diganti `gangs`. | DROP |
| `mst_estate` | 8 | Tidak ada di arsitektur final. Hanya FK mst_*. | DROP |
| `api_attendance_raw` | 0 | IT Solution API deprecated. | DROP |
| `attendance_raw_log` | 0 | Diganti `attendance_scan_logs`. | DROP |
| `attendance_daily_process` | 0 | Schema proses lama. | DROP |
| `attendance_process_detail` | 0 | Detail proses lama. | DROP |
| `attendance_division_reconcile` | 0 | Reconcile lama. | DROP |
| `attendance_anomaly` | 0 | Anomaly detection unimplemented. | DROP |
| `attendance_manual_adjustment` | 0 | Diganti `attendance_manual_corrections`. | DROP |
| `employee_daily_assignment` | 0 | Schema lama. | DROP |
| `employee_division_history` | 0 | Diganti `employee_code_history` (verifikasi). | DROP |
| `employee_mapping_overrides` | 0 | Tidak dipakai. | DROP |
| `employee_schedules` | 0 | Tidak dipakai. | DROP |
| `monitoring_daily_summary` | 0 | Diganti query langsung. | DROP |
| `import_batch` | 0 | Diganti `attendance_import_batches`. | DROP |
| `sync_job` | 0 | Diganti scheduler. | DROP |
| `attendance_time_correction_batch` | 0 | Fitur nonaktif. | DROP |
| `attendance_time_correction_detail` | 0 | Fitur nonaktif. | DROP |
| `shifts` | 0 | Tidak dipakai. | DROP |

### 1.2 Mapping legacy (0 rows atau DROPPED)

| Tabel | Rows | Status | Aksi |
|-------|------|--------|------|
| `zkteco_hr_employee_map` | 0 | Masih ada, 0 rows. View BROKEN ref. | DROP (after view drop) |
| `machine_user_map` | 0 | ⚠️ **Masih dipakai 3 service aktif**. | STOP USAGE dulu → DROP |
| `app_configs` | 0 | Duplikat `app_config`. | DROP |

### 1.3 Duplikat config/holiday

| Tabel | Rows | Issue | Aksi |
|-------|------|-------|------|
| `app_configs` (0) vs `app_config` (5) | — | Duplikat | KEEP `app_config`, DROP `app_configs` |
| `attendance_holiday` (0) vs `holidays` (0) | — | Duplikat | Pilih satu (verifikasi caller), DROP lain |

---

## 2. Peta Tabel BACKUP / STATE / ARCHIVE (siap arsip → drop, ~3.9M rows)

> Wajib **archive ke cold storage** sebelum drop. Jangan drop tanpa arsip.

| Tabel | Rows | Kategori | Aksi |
|-------|------|----------|------|
| `attendance_scan_logs_backup_20260623_233022` | 788.915 | backup scan | ARCHIVE → DROP |
| `attendance_scan_logs_backup_20260623_233115` | 788.915 | duplikat 233022 | ARCHIVE → DROP |
| `attendance_scan_logs_linked_backup_20260623` | 788.656 | backup | ARCHIVE → DROP |
| `attendance_scan_logs_unmapped_backup_20260623` | 428.429 | backup | ARCHIVE → DROP |
| `scan_logs_backup_current_empcode_20260623` | 788.677 | backup | ARCHIVE → DROP |
| `attendance_scan_logs_state_before_recovery_20260625` | 24.279 | state | ARCHIVE → DROP |
| `attendance_imports_backup_before_rebuild_20260625` | 38.382 | backup | ARCHIVE → DROP |
| `attendance_imports_state_before_recovery_20260625` | 0 | state | DROP |
| `attendance_machines_state_before_recovery_20260625` | 16 | state | DROP |
| `employees_state_before_recovery_20260625` | 0 | state | DROP |
| `employees_backup_20260623` | 3.761 | backup | ARCHIVE → DROP |
| `employees_contaminated_archive` | 1.973 | kontaminasi | ARCHIVE (audit trail) → DROP |
| `zkteco_absensi_user_registry_backup_current_empcode_20260623` | 1.827 | backup map | ARCHIVE → DROP |
| `zkteco_hr_employee_map_backup_20260623` | 6.474 | backup map | ARCHIVE → DROP |

**Total cleanup:** ~36 tabel (22 legacy + 14 backup). Setelah cleanup: ~29 tabel aktif.

---

## 3. Peta REDUNDANSI (kolom & tabel yang tumpang tindih)

### 3.1 `attendance_scan_logs` — 37 kolom, 3 lapis tercampur (KOTOR)

Saat ini satu tabel campur raw + parse + enrichment. Ini pelanggaran zona RAW.

| Lapis | Kolom saat ini | Masalah |
|-------|---------------|---------|
| 🟢 RAW mesin | `raw_device_user_id, raw_user_sn, raw_record_time, raw_ip, event_type, verify_type, work_code, zkteco_user_name` | ✅ murni mesin — tapi namanya tidak konsisten (`raw_` prefix vs `zkteco_`) |
| 🟡 Parse hasil | `parsed_employee_code, parsed_division_code, mapping_status, mapping_reason` | ⚠️ Bukan raw — hasil SSOT parser. Harus di staging, bukan raw. |
| 🔵 Enrichment | `current_emp_code, current_employee_id, current_mapping_status, current_mapping_reason, current_resolved_at` | ⚠️ Bukan raw — hasil join HR. Harus di processed/staging. |
| ⚙️ Sistem | `scan_time, scan_date, sync_batch_id, created_at` | OK (WIB correction + batch tracking) |
| ⚠️ Nonaktif | `scan_time_original, scan_date_original, scan_time_wib, scan_date_wib, time_correction_status, time_correction_offset_minutes, time_correction_reason, time_corrected_at, time_corrected_by, time_correction_batch_id, zkteco_user_name_source, zkteco_user_name_synced_at, zkteco_user_name_sync_status` | 13 kolom fitur nonaktif/redundan |

### 3.2 Redundansi cross-table

| Redundansi | Lokasi | Solusi |
|-----------|--------|--------|
| Division code 3 sumber | `scan_logs.parsed_division_code`, `employees.division_id`, `imports.division_code` | Final: `employees.division_id→divisions`. Drop `parsed_division_code`. |
| Scan time 4 kolom | `scan_logs.raw_record_time, scan_time, scan_time_original, scan_time_wib` | Raw: `raw_record_time`. WIB: `scan_time`. Drop 2 lainnya. |
| Employee code 3 label | `parsed_employee_code`, `current_emp_code`, `imports.employee_code` | Raw: parsed (di staging). Final: current (di processed). |
| Batch tracking | `attendance_import_batches` vs `import_batch` (legacy) | Drop `import_batch`. Batches bukan source of truth dashboard. |
| Machine identity | `attendance_machines` vs `mst_machine` (legacy) | Drop `mst_machine`. |

---

## 4. SKEMA TARGET — Profesional & Sistematis

> Desain 4 lapis dengan pemisahan tegas. Raw = **immutable, tidak ada proses**.

### 4.1 Prinsip

1. **RAW layer**: snapshot mesin murni. Tidak ada parsing, tidak ada join, tidak ada enrichment. Append-only. Kolom = persis field ZKTeco + metadata sync. **Termasuk tag in/out** (`event_type`).
2. **STAGING/MAP layer**: hasil parse SSOT + mapping. Bisa re-run dari raw tanpa koneksi mesin.
3. **MASTER/REF layer**: identitas karyawan + HR reference.
4. **PROCESSED layer**: hasil final per employee per date (mapping + HR join + cross-absen merge). Single source of truth untuk API/frontend.

### 4.2 Daftar Tabel Target (~17 tabel bersih)

```
RAW (dari mesin, immutable)
├── zk_machine_users         (enrollment: zk.getUsers)
└── zk_scan_logs             (raw scans: zk.getAttendances — TERMASUK event_type in/out)

STAGING (parse + map, derived dari RAW)
└── scan_map                 (parsed_employee_code, mapping_status, current_emp_code resolution)

MASTER
├── employees                (SSOT karyawan)
├── divisions
├── gangs
├── machines                 (inventory mesin)
├── loc_codes
└── scanner_codes

REFERENCE/HISTORY (dari DB_PTRJ)
├── hr_current_snapshot      (current_emp_code per NIK)
└── employee_code_history    (riwayat kode)

PROCESSED (final, untuk API/frontend)
├── attendance_daily         (per employee per date: check_in/out, status, cross-machine merge)
├── attendance_corrections   (manual override)
└── sync_batches             (batch tracking operasional, BUKAN dashboard metric)

OPS/AUDIT
├── sync_logs                (log sync)
└── machine_connection_logs
```

### 4.3 Skema Kolom Sederhana — RAW `zk_scan_logs` (ganti `attendance_scan_logs`)

> Tujuan: kolom singkat, jelas, konsisten prefix. Tidak ada enrichment di sini.

```sql
-- RAW: zk_scan_logs (immutable, append-only, dari mesin)
id              bigint PK
machine_id      int FK→machines.id          -- mesin sumber
machine_code    nvarchar(20)                -- kode mesin (denormalized untuk audit)
device_user_id  nvarchar(50)                -- raw user ID mesin (ganti raw_device_user_id)
user_sn         nvarchar(50) NULL           -- serial number user
record_time     datetime2                   -- timestamp asli mesin (UTC, untouched)
scan_time_wib   datetime2                   -- WIB-corrected (satu field konversi, bukan 4)
scan_date       date                        -- WIB date
ip_address      nvarchar(45) NULL           -- IP mesin
event_type      tinyint NULL                -- ⭐ TAG IN/OUT ZKTeco (0=check-in,1=check-out,2=break-out,3=break-in,4=OT-in,5=OT-out)
verify_type     tinyint NULL                -- cara verifikasi (1=fp,2=card,...)
work_code       nvarchar(20) NULL           -- work code mesin
user_name       nvarchar(200) NULL          -- nama di mesin (dari enrollment, raw)
sync_batch_id   bigint NULL FK→sync_batches.id
synced_at       datetime2                   -- kapan masuk DB
```
**14 kolom** (dari 37). Raw murni, tidak ada `parsed_*`/`current_*`/`time_correction_*`.

### 4.4 Skema Kolom — STAGING `scan_map` (ganti enrichment di scan_logs)

```sql
-- STAGING: hasil parse + current_emp_code resolution (derived dari zk_scan_logs)
scan_log_id        bigint PK FK→zk_scan_logs.id
parsed_emp_code    nvarchar(20)              -- SSOT parser hasil (kode lama OK)
scanner_prefix     nvarchar(3) NULL
loc_code           nvarchar(5) NULL
map_status         nvarchar(20)              -- MAPPED/NEED_REVIEW/UNMAPPED
map_reason         nvarchar(200) NULL
current_emp_code   nvarchar(20) NULL         -- HR current (join hr_current_snapshot via NIK)
current_emp_name   nvarchar(200) NULL
resolved_nik       nvarchar(20) NULL
resolution_status  nvarchar(20)              -- RESOLVED/NEED_REVIEW/FALLBACK_PARSED/NO_NIK
resolution_method  nvarchar(30)              -- HR_SNAPSHOT_NIK/EMPLOYEE_CURRENT/PARSED_FALLBACK/NONE
resolved_at        datetime2 NULL
```
**12 kolom**. Pisah dari raw → raw tetap immutable.

### 4.5 Skema Kolom — PROCESSED `attendance_daily` (ganti `attendance_imports`)

```sql
-- PROCESSED: final per employee per date (cross-machine merge + HR join)
id               bigint PK
employee_id      int FK→employees.id         -- COALESCE(e_current, e_parsed)
employee_code    nvarchar(20)                -- FINAL (current bila ada)
division_code    nvarchar(10)                -- dari current employee
gang_code        nvarchar(20) NULL
attendance_date  date
check_in_at      datetime2 NULL              -- MIN(scan_time_wib) hari itu
check_out_at     datetime2 NULL             -- MAX(scan_time_wib) hari itu
status           nvarchar(20)               -- HADIR/INCOMPLETE_SCAN/MANUAL_REVIEW
scan_count       int                         -- jumlah scan hari itu
source           nvarchar(20)               -- ZKTECO
needs_review     bit
has_manual_fix   bit                         -- ada correction override?
nik              nvarchar(20) NULL
batch_id         bigint NULL FK→sync_batches.id
created_at       datetime2
UNIQUE (employee_code, attendance_date)
```
**17 kolom** (dari 30). Hapus `parsed_employee_code` (ada di staging via JOIN), hapus redundant `hr_status`/`hr_loc_code`/`current_*` (JOIN ke employees saat query). `raw_scan_log_id` dihapus (82% NULL) → ganti `scan_count` + JOIN ke scan_map untuk provenance.

### 4.6 Kolom Sederhana — tabel lain

| Tabel target | Ganti | Kolom inti (sederhana) |
|--------------|-------|------------------------|
| `zk_machine_users` | `machine_user_raw` | `id, machine_id, device_user_id, user_name, role, card_no, password_exists, first_seen_at, last_seen_at, synced_at` (10) |
| `machines` | `attendance_machines` | `id, code, name, ip, port, scanner_code, loc_code, access_status, is_active, last_sync_at, clock_status, clock_drift_minutes` (12, drop redundant) |
| `employees` | `employees` (kurangi 42→~20) | `id, code, name, division_id, gang_id, nik, current_emp_code, current_emp_name, hr_loc_code, hr_status, is_active, created_at, updated_at` + few |
| `attendance_corrections` | `attendance_manual_corrections` | `id, employee_id, attendance_date, status, check_in_at, check_out_at, reason, is_deleted, created_by, created_at` (10) |

---

## 5. Penamaan Kolom — Aturan Sederhana

| Aturan | Contoh |
|--------|--------|
| `snake_case` konsisten | `device_user_id` bukan `raw_device_user_id` |
| Prefix zona hanya bila perlu | RAW: no prefix (default). FK: `_id` suffix. |
| 1 konsep = 1 nama | `scan_time_wib` (bukan 4 varian) |
| Boolean `is_`/`has_` | `is_active`, `has_manual_fix` |
| Timestamp `*_at` | `created_at`, `synced_at`, `resolved_at` |
| Status `*_status` | `map_status`, `resolution_status` |
| Hindari singkatan ambigu | `emp_code` OK, `nm` no |

### Rename map (lama → baru)
| Lama | Baru |
|------|------|
| `attendance_scan_logs` | `zk_scan_logs` |
| `machine_user_raw` | `zk_machine_users` |
| `attendance_machines` | `machines` |
| `attendance_imports` | `attendance_daily` |
| `attendance_manual_corrections` | `attendance_corrections` |
| `attendance_import_batches` | `sync_batches` |
| `hr_employee_current_snapshot` | `hr_current_snapshot` |
| `raw_device_user_id` | `device_user_id` |
| `parsed_employee_code` | `parsed_emp_code` |
| `attendance_status` | `status` |
| `needs_manual_review` | `needs_review` |

> Rename tabel = breaking change untuk code. Dilakukan Phase terakhir setelah semua query migrasi.

---

## 6. Alur Data Skema Target

```
ZKTeco mesin
  │ getUsers()    → zk_machine_users (RAW)
  │ getAttendances() → zk_scan_logs (RAW, immutable, +event_type in/out)
  │
  │  [STAGING: parse SSOT + HR resolution — derived, re-runnable]
  │  zk_scan_logs.id → scan_map
  │    ├─ parseZktecoUserIdToEmployeeCode → parsed_emp_code, map_status
  │    └─ JOIN employees(nik) → hr_current_snapshot → current_emp_code
  │
  │  [PROCESSED: cross-machine merge per date]
  │  scan_map + zk_scan_logs GROUP BY current_emp_code, scan_date
  │    → attendance_daily (check_in=MIN, check_out=MAX, scan_count, status)
  │    → COALESCE(correction, daily) untuk final
  │
  → API → Frontend (mode Database = attendance_daily, mode Data Mesin = zk_scan_logs + scan_map)
```

---

## 7. Phased Migration (planning — eksekusi setelah approval)

| Phase | Aksi | Risk | Detail |
|-------|------|------|--------|
| **A. Cleanup unused** | Drop 22 legacy 0-rows + archive 14 backup | Low | [[MIGRATION_ROADMAP]] Phase 3–4. Archive backup ke cold DB dulu. |
| **B. Fix active-broken** | Stop `machine_user_map` usage (3 svc), fix `quality.routes.ts` (dropped table), parameterize SQL, fix `extend_db_ptrj` default | Med | Phase 2 [[MIGRATION_ROADMAP]] |
| **C. Drop broken views** | `vw_attendance_monthly_matrix`, `vw_employee_master_clean`, 2 legacy mst views | Low | Backend sudah bypass |
| **D. Trim kolom nonaktif** | Drop 13 `time_correction_*`/`scan_time_*` redundant di scan_logs | Low | Fitur nonaktif, verifikasi tidak ada caller |
| **E. Pisah staging** | Buat `scan_map`, migrasi enrichment kolom dari scan_logs | Med | Raw jadi immutable. Update query yang baca `current_emp_code` dari scan_logs → JOIN scan_map. |
| **F. Simplify processed** | Trim `attendance_imports` 30→17 kolom, rename `attendance_daily` | Med | Update `monthly-matrix.service.ts`, `rebuild-attendance-imports.ts` |
| **G. Rename tabel** | Apply rename map (breaking) | High | Update semua route/service/script. Build + test penuh. |
| **H. Verify** | V1–V6 queries, 6 endpoint 200, row counts utama unchanged | — | [[MIGRATION_ROADMAP]] §validation |

> Phase A–D = cleanup (aman). Phase E–G = redesign (breaking, butuh staging + rollback ketat).

---

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Rename tabel break code | Phase G terakhir, setelah semua query migrasi. Git revert + DB backup pre-rename. |
| Enrichment pisah dari raw → query lama 500 | Phase E: update semua query yang baca `current_emp_code`/`parsed_*` langsung dari scan_logs → JOIN scan_map. Audit dulu ([[DEPENDENCY_AUDIT]] §1.1). |
| Backup drop tanpa arsip = kehilangan recovery | Phase A wajib `SELECT INTO` ke `rebinmas_absensi_archive` DB atau bcp parquet. |
| `machine_user_map` masih aktif di 3 service | Phase B stop usage dulu, baru drop. |
| `raw_scan_log_id` 82% NULL → provenance | Skema target ganti dengan `scan_count` + JOIN scan_map (lebih robust). |
| Data migration 808K rows | Batch INSERT (TOP batchSize loop) seperti `rebuild-attendance-imports.ts` existing. |

---

## 9. Yang TIDAK Diubah (preserve)

- SSOT parser `zkteco-employee-code-parser.ts` — tetap, jangan bikin baru.
- Data mesin raw (808K scan_logs, 6.3K users) — hanya kolom yg disederhanakan, row data utuh.
- `employees` (8.005), `divisions` (16), `hr_current_snapshot` (4.763), `employee_code_history` (5.967) — struktur trim, data utuh.
- Sync pipeline 3-job (scheduler) — arsitektur tetap, hanya target tabel disesuaikan.

---

## 10. Pertanyaan untuk User (sebelum eksekusi)

1. **Rename tabel breaking?** `attendance_scan_logs`→`zk_scan_logs` dst. Iya → Phase G jalan. Tidak → keep nama lama, hanya trim kolom.
2. **Archive backup ke mana?** DB `rebinmas_absensi_archive` terpisah, atau bcp parquet ke disk?
3. **Fitur time_correction** (13 kolom nonaktif): drop permanen atau keep untuk future?
4. **`gangs` (0 rows)**: keep schema atau drop sampai dipakai?
5. **Rename dieksekusi sekaligus atau bertahap?** Sekaligus = 1 migration besar + downtime. Bertahap = view compatibility layer.

> Jawaban → update plan, lalu mulai Phase A (cleanup, lowest risk).
