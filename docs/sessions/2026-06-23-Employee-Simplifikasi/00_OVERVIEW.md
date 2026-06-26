# Session: Simplifikasi Arsitektur Employee Tables
**Date:** 2026-06-23
**Duration:** Single session
**Result:** 35 → 12 tabel inti, arsitektur 3-layer baru

---

## Apa yang Diubah

### Masalah Lama
Sistem punya banyak tabel yang redundan/ambiggu untuk employee identity:
- `zkteco_absensi_user_registry` — duplicate employee data
- `employee_machine_enrollments` — sebagian sudah ada di `employees.machine_codes`
- `zkteco_absensi_user_machine` — orphan FK ke registry
- `zkteco_hr_employee_map` — tidak diperlukan lagi
- `attendance_imports_old`, `employee_hr_sync_audit` — archive lama

### Solusi: Arsitektur 3-Layer

```
Layer 1 — RAW (ASAL, TIDAK DIUBAH):
├── attendance_machines            → config mesin ZKTeco
├── attendance_scan_logs          → raw scan dari mesin ZKTeco
└── hr_employee_current_snapshot → snapshot HR dari db_ptrj

Layer 2 — MASTER (SATU TABEL SAJA):
└── employees                    → SSOT semua data employee identity

Layer 3 — PROCESSED (HASIL OLAHAN):
├── attendance_imports             → per-hari per employee
├── attendance_import_batches      → audit trail per batch
└── employee_code_history          → riwayat kode employee per NIK

REFERENCE:
├── divisions                     → lookup divisi
├── gangs                       → lookup gang
├── hr_employee_current_snapshot → HR snapshot (NIK → EmpCode)
├── employee_mapping_overrides    → manual override
├── attendance_holiday          → hari libur
└── attendance_work_config       → konfigurasi kerja
```

### Tabel di-DROP
- `zkteco_absensi_user_registry` → isi dipindahkan ke `employees`, tabel dihapus
- `employee_machine_enrollments` → data sudah di `employees.machine_codes`
- `zkteco_absensi_user_machine` → orphan FK ke registry
- `zkteco_hr_employee_map` → tidak diperlukan lagi
- `attendance_imports_old` → archive lama
- `employee_hr_sync_audit` → archive lama

### Tabel Backup Created
- `zkteco_absensi_user_registry_backup_current_empcode_YYYYMMDD`
- `employee_machine_enrollments_backup_20260623`
- `scan_logs_backup_current_empcode_YYYYMMDD`
- `zkteco_hr_employee_map_backup_20260623`

---

## Struktur Tabel `employees` (BARU — 44 kolom)

### Identity Columns
| Kolom | Type | Description |
|-------|------|-------------|
| `id` | INT PK | Auto-increment |
| `employee_code` | NVARCHAR(30) | Kode employee (parsed, historical) |
| `current_emp_code` | NVARCHAR(30) | Kode employee TERBARU dari HR (berbasis NIK) |
| `nik` | NVARCHAR(50) | NIK / NewICNo dari HR |
| `employee_name` | NVARCHAR(150) NULL | Nama employee |
| `parsed_employee_code` | NVARCHAR(30) NULL | Hasil parsing dari raw_device_user_id |
| `raw_device_user_id` | NVARCHAR(100) NULL | ID asli dari mesin ZKTeco |
| `zkteco_user_name` | NVARCHAR(150) NULL | Nama di mesin ZKTeco |
| `current_emp_name` | NVARCHAR(150) NULL | Nama terbaru dari HR |

### Machine Enrollment
| Kolom | Type | Description |
|-------|------|-------------|
| `machine_codes` | NVARCHAR(500) NULL | Comma-separated: "P1A,P1B,ARC_01" |
| `machine_count` | INT NULL | Jumlah mesin tempat employee terdaftar |
| `batch_import` | NVARCHAR(100) NULL | Batch terakhir yang mengimpor |

### HR Integration
| Kolom | Type | Description |
|-------|------|-------------|
| `resolved_nik` | NVARCHAR(50) NULL | NIK hasil lookup dari registry |
| `hr_employee_code` | NVARCHAR(30) NULL | EmpCode lama dari HR |
| `hr_loc_code` | NVARCHAR(20) NULL | Lokasi HR |
| `hr_status` | NVARCHAR(20) NULL | Status HR |
| `current_resolution_status` | NVARCHAR(30) NULL | Status mapping |
| `current_resolution_method` | NVARCHAR(50) NULL | Metode resolution |
| `current_resolution_reason` | NVARCHAR(500) NULL | Alasan resolution |
| `current_resolved_at` | DATETIME2 NULL | Waktu resolution |

### Identity Resolution
| Kolom | Type | Description |
|-------|------|-------------|
| `identity_source` | NVARCHAR(50) NULL | Sumber: HR_SNAPSHOT_NIK_LOOKUP, MANUAL_OVERRIDE, dll |
| `identity_resolution_reason` | NVARCHAR(500) NULL | Alasan final identity resolution |

### Legacy/Quality
| Kolom | Type | Description |
|-------|------|-------------|
| `division_id` | INT NULL FK | FK ke divisions |
| `gang_id` | INT NULL FK | FK ke gangs |
| `is_active` | BIT | Active flag |
| `is_raw_id` | ... | ... |
| `data_quality_status` | ... | ... |
| `data_quality_reason` | ... | ... |
| `hr_verified` | ... | ... |
| `hr_verified_at` | ... | ... |
| `employment_status` | ... | ... |
| `created_at` | ... | ... |
| `updated_at` | ... | ... |
| `raw_id_length` | INT NULL | Panjang raw_device_user_id |
| `id_category` | NVARCHAR(30) NULL | Kategori ID |
| `scan_count` | INT NULL | Jumlah scan |
| `first_seen_at` | DATETIME2 NULL | Pertama kali terlihat |
| `last_seen_at` | DATETIME2 NULL | Terakhir terlihat |
| `parsed_division_code` | NVARCHAR(10) NULL | Division code hasil parsing |
| `mapping_status` | NVARCHAR(30) NULL | Status mapping |
| `mapping_reason` | NVARCHAR(500) NULL | Alasan mapping |
| `current_hr_loc_code` | NVARCHAR(20) NULL | Lokasi HR saat ini |
| `current_hr_create_date` | DATETIME2 NULL | Tanggal dibuat di HR |
| `current_hr_update_date` | DATETIME2 NULL | Tanggal update di HR |

---

## Alur Data Baru

### 1. Sync dari Mesin ZKTeco
```
Mesin ZKTeco
  → getAttendances() → attendance_scan_logs (tanpa ubahan)
  → getUsers() → employees.raw_device_user_id + employees.zkteco_user_name
```

### 2. HR Sync (daily / on-demand)
```
db_ptrj.HR_EMPLOYEE
  → hr_employee_current_snapshot (NIK → EmpCode terbaru)
  → employees.nik, employees.current_emp_code (via NIK lookup)
```

### 3. Batch Import
```
attendance_scan_logs (raw_device_user_id + scan_date)
  → attendance_imports (check_in_at, check_out_at per employee per hari)
  → employees.batch_import (batch label terakhir)
```

---

## Identity Resolution Order (SSOT)

```
scan_log.raw_device_user_id
  │
  ├── parsed_employee_code (dari SSOT parser, di attendance_scan_logs)
  │
  └── parsed_employee_code → employees.employee_code (lookup)
         │
         ├── nik → hr_employee_current_snapshot.nik
         │
         └── nik → current_emp_code (dari HR snapshot)
```

**Priority:**
1. `employees.parsed_employee_code` — hasil SSOT parser
2. `employees.zkteco_user_id` — exact match untuk long raw ID
3. `employees.current_emp_code` — kode terbaru dari HR (berbasis NIK)

---

## Data Statistics (Post-Migration)

| Tabel | Total | with nik | with current_emp_code | with raw_device_user_id |
|-------|-------|-----------|----------------------|------------------------|
| employees | 1,866 | 1,850 | 1,774 | 90 |
| attendance_scan_logs | 788,915 | — | 788,441 | — |
| hr_employee_current_snapshot | 4,763 | 4,763 | 4,763 | — |

---

## Files yang Berubah

### Backend
- `src/modules/employees/employee-comprehensive.service.ts` — REWRITE: hapus semua JOIN ke tabel lama
- `src/api/routes/employees.routes.ts` — hapus fallback ke `employee_machine_enrollments` dan `zkteco_hr_employee_map`
- `src/api/routes/employees-comprehensive.routes.ts` — fix import types

### Database
- `migrations/056_merge_and_simplify_employee_tables.sql` — BACKUP + merge + DROP

### Frontend
- `EmployeeComprehensiveTable.tsx` — FIXED: tab indentation corruption, menambahkan `currentEmpCode` + `nik` di mode datamesin
- `EmployeeComprehensiveToolbar.tsx` — FIXED: mappingStatus type
- `EmployeeComprehensivePage.tsx` — FIXED: filters state type

---

## Build Status
- Backend: ✅ TypeScript clean
- Frontend: ✅ TypeScript clean + Vite build success (594KB)
- Database: ✅ 12 tabel inti, 1,866 employees
