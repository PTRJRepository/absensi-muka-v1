# Data Dictionary — Kolom Database

## attendance_scan_logs

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT IDENTITY | Primary key |
| `raw_device_user_id` | NVARCHAR(100) | ID asli dari mesin ZKTeco |
| `machine_code` | NVARCHAR(30) | Kode mesin (P1A, IJL, dll) |
| `scan_time` | DATETIME2 | Timestamp scan (UTC) |
| `scan_date` | DATE (computed) | Tanggal scan (dari scan_time) |
| `parsed_employee_code` | NVARCHAR(30) | Employee code hasil parsing (A0044) |
| `parsed_division_code` | NVARCHAR(20) | Division code hasil parsing (A, C, L) |
| `mapping_status` | NVARCHAR(20) | MAPPED / NEED_REVIEW / UNMAPPED |
| `mapping_reason` | NVARCHAR(500) | Alasan mapping (debug) |
| `created_at` | DATETIME2 | Timestamp insert |

---

## attendance_imports

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT IDENTITY | Primary key |
| `employee_id` | INT | FK ke employees.id |
| `employee_code` | NVARCHAR(30) | Employee code (A0044) |
| `division_code` | NVARCHAR(20) | Division code (A, C) |
| `gang_code` | NVARCHAR(20) | Gang code |
| `attendance_date` | DATE | Tanggal absensi |
| `attendance_status` | NVARCHAR(30) | HADIR / TIDAK_HADIR / NO_CHECKOUT / dll |
| `check_in_time` | TIME | Jam masuk |
| `check_out_time` | TIME | Jam pulang |
| `source` | NVARCHAR(30) | ZKTECO / MANUAL / CORRECTION |
| `raw_scan_log_id` | BIGINT | FK ke attendance_scan_logs |
| `needs_manual_review` | BIT | Perlu review manual |
| `created_at` | DATETIME2 | Timestamp insert |

---

## employees

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT IDENTITY | Primary key |
| `employee_code` | NVARCHAR(30) | Canonical employee code (A0044) |
| `employee_name` | NVARCHAR(150) | Nama employee |
| `division_id` | INT | FK ke divisions.id |
| `gang_id` | INT | FK ke gangs.id |
| `zkteco_user_id` | NVARCHAR(100) | Raw device user ID dari ZKTeco (untuk lookup) |
| `is_active` | BIT | Active/inactive |
| `created_at` | DATETIME2 | Timestamp insert |
| `updated_at` | DATETIME2 | Timestamp update |

---

## zkteco_absensi_user_registry (NEW)

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT IDENTITY | Primary key |
| `raw_device_user_id` | NVARCHAR(100) | ID asli (canonical) |
| `raw_id_length` | INT | Panjang ID |
| `id_category` | NVARCHAR(30) | 'LONG' |
| `scanner_prefix` | NVARCHAR(3) | Prefix (001, 100, 500, dll) |
| `parsed_employee_code` | NVARCHAR(30) | Hasil parsing (C0040) |
| `parsed_division_code` | NVARCHAR(20) | Division code (C, L, A) |
| `hr_employee_code` | NVARCHAR(30) | Dari db_ptrj lookup |
| `hr_employee_name` | NVARCHAR(150) | Dari db_ptrj lookup |
| `hr_loc_code` | NVARCHAR(20) | Dari db_ptrj lookup |
| `hr_status` | NVARCHAR(20) | Dari db_ptrj lookup |
| `mapping_status` | NVARCHAR(30) | MAPPED / NEED_REVIEW |
| `mapping_reason` | NVARCHAR(500) | Alasan |
| `machine_count` | INT | Berapa mesin kartu ini terdaftar |
| `scan_count` | BIGINT | Total scan |
| `first_seen_at` | DATETIME2 | Scan pertama |
| `last_seen_at` | DATETIME2 | Scan terakhir |
| `sample_zkteco_user_name` | NVARCHAR(200) | Sample nama ZKTeco |
| `is_active` | BIT | Active |

---

## zkteco_absensi_user_machine

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT IDENTITY | Primary key |
| `registry_id` | BIGINT | FK ke registry |
| `machine_code` | NVARCHAR(30) | Kode mesin |
| `raw_device_user_id` | NVARCHAR(100) | ID di mesin ini |
| `zkteco_user_name` | NVARCHAR(200) | Nama di mesin ini |
| `scan_count` | BIGINT | Scan count di mesin ini |
| `first_seen_at` | DATETIME2 | Scan pertama di mesin |
| `last_seen_at` | DATETIME2 | Scan terakhir di mesin |
| `is_active` | BIT | Active |

---

## zkteco_hr_employee_map

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT IDENTITY | Primary key |
| `machine_code` | NVARCHAR(30) | Kode mesin |
| `zkteco_user_id` | NVARCHAR(100) | Raw device user ID |
| `zkteco_user_name` | NVARCHAR(200) | Nama dari ZKTeco |
| `hr_employee_code` | NVARCHAR(30) | Mapped employee code |
| `hr_employee_name` | NVARCHAR(150) | Mapped employee name |
| `match_confidence` | NVARCHAR(30) | EXACT / CONVERTED / UNMATCHED |
| `match_method` | NVARCHAR(30) | IDENTITY / ID_CONVERSION / NAME_MATCH / OVERRIDE |
| `is_active` | BIT | Active |
| `created_at` | DATETIME2 | Timestamp insert |
| `updated_at` | DATETIME2 | Timestamp update |

---

## attendance_machines

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT IDENTITY | Primary key |
| `machine_code` | NVARCHAR(30) | Kode unik mesin |
| `machine_name` | NVARCHAR(100) | Nama display |
| `ip_address` | NVARCHAR(20) | IP address |
| `port` | INT | TCP port |
| `location` | NVARCHAR(100) | Lokasi fisik |
| `is_active` | BIT | Active |
| `last_sync_at` | DATETIME2 | Last sync timestamp |
| `created_at` | DATETIME2 | Timestamp insert |

---

## divisions

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT IDENTITY | Primary key |
| `division_code` | NVARCHAR(20) | Kode division (A, B, C, dll) |
| `division_name` | NVARCHAR(100) | Nama division |
| `created_at` | DATETIME2 | Timestamp insert |

---

## gangs

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT IDENTITY | Primary key |
| `gang_code` | NVARCHAR(20) | Kode gang |
| `gang_name` | NVARCHAR(100) | Nama gang |
| `division_id` | INT | FK ke divisions |
| `created_at` | DATETIME2 | Timestamp insert |

---

## holidays

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT IDENTITY | Primary key |
| `holiday_date` | DATE | Tanggal holiday |
| `holiday_name` | NVARCHAR(100) | Nama holiday |
| `created_at` | DATETIME2 | Timestamp insert |

---

## shifts

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT IDENTITY | Primary key |
| `shift_name` | NVARCHAR(30) | Nama shift |
| `start_time` | TIME | Jam mulai |
| `end_time` | TIME | Jam selesai |

---

## machine_user_map

| Column | Type | Description |
|--------|------|-------------|
| `map_id` | BIGINT IDENTITY | Primary key |
| `machine_id` | INT | FK ke attendance_machines |
| `machine_user_id` | NVARCHAR(100) | Raw device user ID |
| `employee_id` | INT | FK ke employees |
| `emp_code` | NVARCHAR(30) | Employee code |
| `mapped_by_rule` | NVARCHAR(50) | Rule yang digunakan |
| `mapped_source` | NVARCHAR(20) | SYSTEM / MANUAL / OVERRIDE |
| `loc_code` | NVARCHAR(20) | Loc code |
| `scanner_code` | INT | Scanner code |
| `confidence_score` | INT | 0-100 |
| `is_active` | BIT | Active |
| `first_seen_at` | DATETIME2 | First seen |
| `last_seen_at` | DATETIME2 | Last seen |
| `verified_by` | NVARCHAR(50) | Verified by |
| `verified_at` | DATETIME2 | Verified timestamp |
| `created_at` | DATETIME2 | Timestamp insert |
| `updated_at` | DATETIME2 | Timestamp update |

---

## attendance_sync_logs

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT IDENTITY | Primary key |
| `machine_code` | NVARCHAR(30) | Kode mesin |
| `sync_type` | NVARCHAR(20) | FULL / INCREMENTAL |
| `status` | NVARCHAR(20) | SUCCESS / FAILED / PARTIAL |
| `records_count` | INT | Jumlah record |
| `started_at` | DATETIME2 | Start timestamp |
| `completed_at` | DATETIME2 | Completion timestamp |
| `error_message` | NVARCHAR(500) | Error message if failed |

---

## attendance_manual_corrections

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGINT IDENTITY | Primary key |
| `employee_code` | NVARCHAR(30) | Employee code |
| `work_date` | DATE | Tanggal koreksi |
| `correction_type` | NVARCHAR(30) | MANUAL_IN / MANUAL_OUT / STATUS_CHANGE |
| `original_status` | NVARCHAR(30) | Status sebelum |
| `new_status` | NVARCHAR(30) | Status baru |
| `reason` | NVARCHAR(500) | Alasan koreksi |
| `corrected_by` | NVARCHAR(50) | Siapa yang koreksi |
| `created_at` | DATETIME2 | Timestamp insert |
