# DATA_DICTIONARY_FINAL — Kamus Kolom Tabel Aktif

> Basis: live schema `rebinmas_absensi_monitoring` (audited 2026-06-26). Kolom dari `INFORMATION_SCHEMA.COLUMNS`.
> Related: [[ARCHITECTURE_FINAL]] [[DATABASE_CLEANUP_PLAN]]
> Notasi: `?` = NULLABLE. Source: 🟢ZKTeco · 🔵HR/DB_PTRJ · 🟡parser · ⚙️sistem · ✍️manual

---

## 1. `attendance_scan_logs` (RAW, 808.093 rows, 37 cols)

Source of truth raw scan dari mesin.

| Kolom | Tipe | Source | Keterangan |
|-------|------|--------|-----------|
| `id` | bigint | ⚙️ | PK |
| `machine_id` | int? | ⚙️ | FK→attendance_machines.id |
| `machine_code` | nvarchar | 🟢 | kode mesin (P1A, ARC_01, dll) |
| `raw_device_user_id` | nvarchar | 🟢 | user ID mentah dari mesin (mis. "10044") |
| `raw_user_sn` | nvarchar? | 🟢 | serial number user mesin |
| `raw_record_time` | datetime2 | 🟢 | timestamp UTC dari mesin |
| `raw_ip` | nvarchar? | 🟢 | IP mesin saat scan |
| `parsed_employee_code` | nvarchar? | 🟡 | SSOT parser hasil (mis. "A0044"). **Bisa kode lama.** |
| `parsed_division_code` | nvarchar? | 🟡 | ⚠️ parser hasil locCode. **Tidak dipakai lagi untuk final** — final pakai `employees.division_id`. Lihat §11. |
| `mapping_status` | nvarchar | ⚙️ | MAPPED / NEED_REVIEW |
| `mapping_reason` | nvarchar? | ⚙️ | alasan mapping |
| `scan_time` | datetime2 | ⚙️ | WIB-corrected scan time |
| `scan_date` | date | ⚙️ | WIB date |
| `event_type` | nvarchar? | 🟢 | jenis event mesin |
| `verify_type` | nvarchar? | 🟢 | cara verifikasi (fingerprint/card) |
| `work_code` | nvarchar? | 🟢 | work code mesin |
| `sync_batch_id` | bigint? | ⚙️ | FK→attendance_import_batches.id |
| `created_at` | datetime2 | ⚙️ | |
| `scan_time_original` | datetime2? | 🟢 | timestamp asli sebelum WIB correction |
| `scan_date_original` | date? | 🟢 | date asli |
| `scan_time_wib` | datetime2? | ⚙️ | WIB (redundan dgn `scan_time`? — lihat §11) |
| `scan_date_wib` | date? | ⚙️ | WIB date |
| `time_correction_status` | nvarchar? | ⚙️ | status time correction (fitur nonaktif) |
| `time_correction_offset_minutes` | int? | ⚙️ | offset menit |
| `time_correction_reason` | nvarchar? | ⚙️ | |
| `time_corrected_at` | datetime2? | ⚙️ | |
| `time_corrected_by` | nvarchar? | ⚙️ | |
| `time_correction_batch_id` | bigint? | ⚙️ | |
| `zkteco_user_name_source` | nvarchar? | ⚙️ | sumber nama user |
| `zkteco_user_name_synced_at` | datetime2? | ⚙️ | |
| `zkteco_user_name_sync_status` | nvarchar? | ⚙️ | |
| `zkteco_user_name` | nvarchar? | 🟢/⚙️ | nama user dari mesin |
| `current_emp_code` | nvarchar? | 🔵 | **resolved saat import** — HR current. Lihat [[ARCHITECTURE_FINAL]] §6 |
| `current_employee_id` | int? | 🔵 | resolved employee_id |
| `current_mapping_status` | nvarchar? | 🔵 | status mapping current |
| `current_mapping_reason` | nvarchar? | 🔵 | |
| `current_resolved_at` | datetime2? | 🔵 | |

### Field tidak boleh dipakai lagi
- `parsed_division_code` — final division lewat `employees.division_id→divisions`, bukan parsed.
- `scan_time_wib`/`scan_date_wib` — redundant dengan `scan_time`/`scan_date` (sudah WIB). Hapus salah satu.

### Field redundant
- Banyak kolom `time_correction_*` (8 kolom) untuk fitur nonaktif. Bisa hapus Phase 4 jika fitur tidak akan diaktifkan.

---

## 2. `machine_user_raw` (RAW, 6.293 rows, 14 cols)

Enrollment user dari `zk.getUsers()`.

| Kolom | Tipe | Source | Keterangan |
|-------|------|--------|-----------|
| `machine_user_raw_id` | bigint | ⚙️ | PK |
| `import_batch_id` | bigint? | ⚙️ | FK→import_batch (⚠️ legacy FK, target legacy table) |
| `machine_id` | int | ⚙️ | FK mesin |
| `machine_uid` | int? | 🟢 | internal UID mesin |
| `machine_user_id` | nvarchar | 🟢 | user ID mesin (raw_device_user_id setara) |
| `user_name` | nvarchar? | 🟢 | nama di mesin |
| `role` | int? | 🟢 | role mesin |
| `card_no` | nvarchar? | 🟢 | nomor kartu |
| `password_exists` | bit? | 🟢 | |
| `raw_payload` | nvarchar? | 🟢 | payload mentah |
| `imported_at` | datetime2? | ⚙️ | |
| `first_seen_at` | datetime2? | ⚙️ | |
| `last_seen_at` | datetime2? | ⚙️ | |
| `machine_raw_user_name` | nvarchar? | ⚙️ | nama normalized (untuk display fallback) |

### Field tidak dipakai lagi
- `import_batch_id` → FK ke legacy `import_batch`. Drop FK (Phase 2/3).

---

## 3. `employees` (MASTER/SSOT, 8.005 rows, 42 cols)

SSOT utama data karyawan.

| Kolom | Tipe | Source | Keterangan |
|-------|------|--------|-----------|
| `id` | int | ⚙️ | PK |
| `employee_code` | nvarchar | 🟡 | parsed code (SSOT format). Bisa kode lama. |
| `employee_name` | nvarchar | 🟢/🔵 | nama |
| `division_id` | int? | 🔵 | FK→divisions.id. **CORRECT** (fix 2026-06-25 via hr_loc_code lookup) |
| `gang_id` | int? | 🔵 | FK→gangs.id |
| `employment_status` | nvarchar | 🔵 | status HR |
| `is_active` | bit | ⚙️ | |
| `created_at` / `updated_at` | datetime2 | ⚙️ | |
| `nik` | nvarchar? | 🔵 | **NIK dari HR. 2.038 NULL** — fallback parsed. |
| `current_emp_code` | nvarchar? | 🔵 | HR current. 1.204 ≠ employee_code (mutasi). |
| `current_emp_name` | nvarchar? | 🔵 | HR current name |
| `hr_employee_code` | nvarchar? | 🔵 | kode HR asli |
| `hr_loc_code` | nvarchar? | 🔵 | loc code HR (P1A, P2B, ...) — key untuk division_id lookup |
| `hr_status` | nvarchar? | 🔵 | |
| `raw_device_user_id` | nvarchar? | 🟢 | raw ID mesin |
| `zkteco_user_name` | nvarchar? | 🟢 | |
| `parsed_division_code` | nvarchar? | 🟡 | ⚠️ tidak dipakai final |
| `mapping_status` | nvarchar? | ⚙️ | |
| `mapping_reason` | nvarchar? | ⚙️ | |
| `current_resolution_status` | nvarchar? | ⚙️ | RESOLVED/NEED_REVIEW/FALLBACK_PARSED/NO_NIK |
| `current_resolution_method` | nvarchar? | ⚙️ | HR_SNAPSHOT_NIK/EMPLOYEE_CURRENT/PARSED_FALLBACK/NONE |
| `current_resolution_reason` | nvarchar? | ⚙️ | |
| `current_hr_loc_code` | nvarchar? | 🔵 | current loc code (mutasi) |
| `current_hr_create_date` | datetime2? | 🔵 | |
| `current_hr_update_date` | datetime2? | 🔵 | |
| `current_resolved_at` | datetime2? | ⚙️ | |
| `resolved_nik` | nvarchar? | 🔵 | NIK resolved |
| `scan_count` | int? | ⚙️ | jumlah scan |
| `first_seen_at` / `last_seen_at` | datetime2? | ⚙️ | |
| `raw_id_length` | int? | ⚙️ | |
| `id_category` | nvarchar? | ⚙️ | |
| `hr_verified` | bit? | ⚙️ | |
| `hr_verified_at` | datetime2? | ⚙️ | |
| `data_quality_status` | nvarchar? | ⚙️ | |
| `data_quality_reason` | nvarchar? | ⚙️ | |
| `zkteco_user_id` | nvarchar? | 🟢 | |
| `is_raw_id` | bit? | ⚙️ | |
| `batch_import` | nvarchar? | ⚙️ | |
| `machine_codes` | nvarchar? | ⚙️ | CSV mesin (dari backfill 054) |
| `identity_source` | nvarchar? | ⚙️ | |

### Field tidak dipakai lagi
- `parsed_division_code` — final lewat `division_id`.

### Field redundant (sederhanakan)
- `current_emp_code` vs `hr_employee_code` — beda? verifikasi. Jika sama, drop satu.
- `hr_loc_code` vs `current_hr_loc_code` — current untuk mutasi. KEEP keduanya (beda semantik).
- `zkteco_user_name` vs `zkteco_user_id` vs `raw_device_user_id` — 3 field mesin, mungkin overlap.

---

## 4. `attendance_imports` (PROCESSED, 55.057 rows, 30 cols)

Hasil akhir absensi per employee per date.

| Kolom | Tipe | Source | Keterangan |
|-------|------|--------|-----------|
| `id` | bigint | ⚙️ | PK |
| `employee_id` | int? | 🔵 | FK→employees.id (COALESCE e_current, e_parsed) |
| `employee_code` | nvarchar | 🔵 | FINAL code (current bila ada, else parsed) |
| `division_code` | nvarchar | 🔵 | dari employees.division_id→divisions (BUKAN parsed) |
| `gang_code` | nvarchar? | 🔵 | |
| `attendance_date` | date | ⚙️ | |
| `attendance_year` | int | ⚙️ | |
| `attendance_month` | int | ⚙️ | |
| `check_in_at` | datetime2? | ⚙️ | MIN(scan_time) hari itu |
| `check_out_at` | datetime2? | ⚙️ | MAX(scan_time) hari itu |
| `attendance_status` | nvarchar | ⚙️ | HADIR / INCOMPLETE_SCAN / MANUAL_REVIEW |
| `has_work` | bit | ⚙️ | |
| `is_leave` / `is_sick` / `is_holiday` | bit | ⚙️/✍️ | |
| `overtime_hours` | decimal | ⚙️/✍️ | |
| `source` | nvarchar | ⚙️ | 'ZKTECO' |
| `source_reference` | nvarchar? | ⚙️ | |
| `batch_id` | bigint? | ⚙️ | FK→attendance_import_batches.id |
| `raw_scan_log_id` | bigint? | ⚙️ | FK→attendance_scan_logs.id. **82% NULL** (aggregate-per-date drop link). |
| `created_at` | datetime2 | ⚙️ | |
| `needs_manual_review` | bit | ⚙️ | |
| `parsed_employee_code` | nvarchar | 🟡 | parsed code (untuk debug/provenance) |
| `employee_name` | nvarchar? | 🔵 | FINAL name (current) |
| `hr_status` | nvarchar? | 🔵 | |
| `hr_loc_code` | nvarchar? | 🔵 | |
| `nik` | nvarchar? | 🔵 | |
| `current_emp_name` | nvarchar? | 🔵 | HR current name |
| `current_hr_loc_code` | nvarchar? | 🔵 | current (mutasi) |
| `current_hr_status` | nvarchar? | 🔵 | |

### Field issue
- `raw_scan_log_id` 82% NULL → provenance broken. Solusi: saat processScanLogsForBatch, simpan MIN/MAX scan_log_id atau array. Atau accepted limitation (aggregate per date memang drop 1:1 link).

---

## 5. `attendance_machines` (MASTER, 16 rows, 23 cols)

| Kolom | Tipe | Source | Keterangan |
|-------|------|--------|-----------|
| `id` | int | ⚙️ | PK |
| `machine_code` | nvarchar | ⚙️ | kode (P1A, ARC_01, ...) |
| `location_name` | nvarchar | ⚙️ | |
| `ip_address` | nvarchar? | ⚙️ | |
| `port` | int? | ⚙️ | 4370 |
| `local_ip` | nvarchar? | ⚙️ | |
| `machine_type` | nvarchar | ⚙️ | |
| `scanner_code` | int? | ⚙️ | 100/200/... → locCode |
| `loc_code` | nvarchar? | ⚙️ | A/B/C/... |
| `access_status` | nvarchar | ⚙️ | reachable/unreachable |
| `data_source` | nvarchar | ⚙️ | |
| `notes` | nvarchar? | ⚙️ | |
| `is_active` | bit | ⚙️ | |
| `last_sync_at` | datetime2? | ⚙️ | |
| `last_error_message` | nvarchar? | ⚙️ | |
| `created_at`/`updated_at` | datetime2 | ⚙️ | |
| `timezone_mode` | nvarchar? | ⚙️ | |
| `timezone_offset_minutes` | int? | ⚙️ | |
| `clock_status` | nvarchar? | ⚙️ | OK/DRIFT |
| `clock_drift_minutes` | int? | ⚙️ | |
| `last_clock_checked_at` | datetime2? | ⚙️ | |
| `clock_note` | nvarchar? | ⚙️ | |

---

## 6. `divisions` (MASTER, 16 rows, 5 cols)

| Kolom | Tipe | Keterangan |
|-------|------|-----------|
| `id` | int | PK. 6=P1A,7=P1B,8=P2A,9=P2B,10=DME,11=ARA,12=AB1,13=AB2,14=ARC,15=IJL,16=PGE |
| `division_code` | nvarchar | P1A/P1B/... |
| `division_name` | nvarchar | |
| `is_active` | bit | |
| `created_at` | datetime2 | |

## 7. `gangs` (MASTER, 0 rows, 5 cols)

| Kolom | Tipe | Keterangan |
|-------|------|-----------|
| `id` | int | PK |
| `gang_code` | nvarchar | |
| `gang_name` | nvarchar | |
| `division_id` | int | FK→divisions.id |
| `is_active` | bit | |

Belum dipakai (0 rows). Schema siap.

## 8. `hr_employee_current_snapshot` (REFERENCE, 4.763 rows, 13 cols)

Reference current identity per NIK. Diisi daily dari DB_PTRJ.

| Kolom | Tipe | Source | Keterangan |
|-------|------|--------|-----------|
| `id` | bigint | ⚙️ | PK |
| `nik` | nvarchar | 🔵 | key |
| `current_emp_code` | nvarchar | 🔵 | HR current code |
| `current_emp_name` | nvarchar? | 🔵 | |
| `current_loc_code` | nvarchar? | 🔵 | P1A/P2B/... |
| `current_status` | nvarchar? | 🔵 | |
| `current_create_date` | datetime2? | 🔵 | |
| `current_update_date` | datetime2? | 🔵 | |
| `active_count` | int | ⚙️ | jumlah row aktif per NIK sebelum dedup |
| `row_count` | int | ⚙️ | total row per NIK |
| `is_ambiguous` | bit | ⚙️ | **1 = NIK punya >1 emp_code aktif → NEED_REVIEW** (23 rows) |
| `ambiguity_reason` | nvarchar? | ⚙️ | |
| `synced_at` | datetime2 | ⚙️ | |

## 9. `employee_code_history` (HISTORY, 5.967 rows, 11 cols)

| Kolom | Tipe | Source | Keterangan |
|-------|------|--------|-----------|
| `id` | bigint | ⚙️ | PK |
| `nik` | nvarchar | 🔵 | key |
| `emp_code` | nvarchar | 🔵 | kode historis |
| `emp_name` | nvarchar? | 🔵 | |
| `loc_code` | nvarchar? | 🔵 | |
| `hr_status` | nvarchar? | 🔵 | |
| `create_date` | datetime2? | 🔵 | |
| `update_date` | datetime2? | 🔵 | |
| `is_current` | bit | ⚙️ | 1 = kode aktif saat ini |
| `source_table` | nvarchar | ⚙️ | sumber (HR_EMPLOYEE) |
| `synced_at` | datetime2 | ⚙️ | |

## 10. `attendance_manual_corrections` (PROCESSED, 0 rows, 20 cols)

| Kolom | Tipe | Source | Keterangan |
|-------|------|--------|-----------|
| `id` | bigint | ⚙️ | PK |
| `employee_id` | int | ✍️ | FK→employees.id |
| `employee_code` | nvarchar | ✍️ | |
| `division_code` | nvarchar | ✍️ | |
| `gang_code` | nvarchar? | ✍️ | |
| `attendance_date` | date | ✍️ | |
| `attendance_status` | nvarchar | ✍️ | |
| `check_in_at`/`check_out_at` | datetime2? | ✍️ | |
| `has_work`/`is_leave`/`is_sick`/`is_holiday` | bit | ✍️ | |
| `overtime_hours` | decimal | ✍️ | |
| `reason` | nvarchar | ✍️ | alasan correction |
| `is_deleted` | bit | ✍️ | soft delete |
| `created_by`/`updated_by` | int? | ✍️ | FK→users.id |
| `created_at`/`updated_at` | datetime2 | ⚙️ | |

---

## 11. Field Tidak Boleh Dipakai Lagi / Redundant (cross-table)

| Field | Tabel | Status | Solusi |
|-------|-------|--------|--------|
| `parsed_division_code` | scan_logs, employees, imports | ❌ tidak dipakai final | Final division lewat `employees.division_id→divisions`. Hapus dari SELECT baru. |
| `scan_time_wib` / `scan_date_wib` | scan_logs | ⚠️ redundant dgn `scan_time`/`scan_date` | Drop salah satu (sudah WIB-corrected). |
| `time_correction_*` (8 cols) | scan_logs | ⚠️ fitur nonaktif | Hapus Phase 4 jika fitur tidak aktif. |
| `current_emp_code` vs `hr_employee_code` | employees | ⚠️ verifikasi duplikat | Drop jika sama. |
| `import_batch_id` FK | machine_user_raw | ❌ FK ke legacy | Drop FK Phase 2/3. |
| `raw_scan_log_id` | imports | ⚠️ 82% NULL | Provenance broken — accepted limitation atau fix di processScanLogsForBatch. |

---

## 12. Source Legend

| Simbol | Source |
|--------|--------|
| 🟢 | ZKTeco (dari mesin via node-zklib) |
| 🔵 | HR / DB_PTRJ (via snapshot sync) |
| 🟡 | Parser (SSOT `zkteco-employee-code-parser.ts`) |
| ⚙️ | Sistem (dihasilkan/computed saat import/process) |
| ✍️ | Manual correction (HR Admin input) |
