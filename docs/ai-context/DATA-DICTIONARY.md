# Data Dictionary: Absensi Monitoring System PT Rebinmas Jaya

> **Last Updated**: 2026-06-23
>
> **Simplifikasi Tabel (2026-06-23)**: tabel `zkteco_absensi_user_registry`, `employee_machine_enrollments`, `zkteco_hr_employee_map` di-DROP. SEMUA data employee identity sekarang di SATU tabel: `employees`. Lihat `docs/sessions/2026-06-23-Employee-Simplifikasi/` untuk detail lengkap.
>
> **IMPORTANT**: Sistem menggunakan **DUAL DATABASE**:
> - `db_ptrj` (HR): sumber data employee master, NIK/NewICNo, EmpCode history
> - `rebinmas_absensi_monitoring` (Lokal): semua tabel aplikasi
>
> **Referensi ID Parsing & Short/Long ID**: Lihat `docs/EMPLOYEE-ID-MAPPING.md` dan `docs/sessions/2026-06-23-short-raw-id-sanitization/`.

## Core Terms

| Term | Definition | Format | Example |
|------|------------|--------|---------|
| **loc_code** | Single letter representing division location | [A-Z] | A, B, C, D, E, F, G, H, J, L |
| **scanner_code** | Machine identifier used in emp_code conversion | Number | 100, 200, 300, ... |
| **emp_code** | Employee identifier - format varies by source | varies | "A0001" or "0010001" |
| **raw_device_user_id** | Original user ID from ZKTeco machine | varies | "10044", "A0044" |
| **parsed_employee_code** | Employee code after parsing logic | Letter+4digits | "A0044" |
| **machine_code** | Unique identifier for each ZKTeco machine | String | "PGE", "IJL", "AB2" |

## Employee Code Types (3-Level)

### 1. `employee_code` (Historical / Parsed)
```
Format: Letter + 4 digits
Source: hasil SSOT parser dari raw_device_user_id
Stored in: employees.employee_code, attendance_scan_logs.parsed_employee_code
Example: "A0044", "J0786"
Note: bisa berbeda dari current_emp_code jika employee pindah divisi
```

### 2. `current_emp_code` (Latest from HR)
```
Format: Letter + 4 digits
Source: db_ptrj.HR_EMPLOYEE (berbasis NIK/NewICNo terbaru)
Stored in: employees.current_emp_code
Example: "A0966"
Note: kode employee TERBARU dari HR. Lihat NIK lookup flow di bawah.
```

### 3. `nik` / NewICNo (Identity Key Stabil)
```
Format: Numeric string
Source: db_ptrj.HR_EMPLOYEE.NewICNo
Stored in: employees.nik
Example: "1906041207910002"
Note: Kunci identitas STABIL. Satu NIK bisa punya banyak EmpCode history.
```

### Short ID vs Long ID Rules (BR-003)

| Length | Example | Status | Action |
|--------|---------|--------|--------|
| 5 digits (dengan prefix) | `10044` | LONG | Parse: prefix `100`→`A`, suffix `0044`→`A0044` |
| 5 digits (tanpa prefix) | `00044` | SHORT | EXCLUDED — tidak bisa diparse otomatis |
| >5 digits | `100123456` | LONG | Parse: strip scanner prefix → lookup |
| <5 digits | `44` | SHORT | EXCLUDED — manual mapping needed |

## LocCode Mapping

| LocCode | Division | Machine(s) |
|---------|----------|-------------|
| A | PG1A / STF | P1A, PGE |
| B | PG1B | P1B |
| C | PG2A | P2A_01, P2A_02 |
| D | PG2B | P2B |
| E | DME | DME_01, DME_02, ARE |
| F | ARA | ARA |
| G | AB1 | AB1 |
| H | AB2 | AB2 |
| J | ARC | ARC_01, ARC_02 |
| L | IJL | IJL |
| M | MILL | MILL |

## Attendance Status Values

| Status | Description | Color Code |
|--------|-------------|------------|
| HADIR | Hadir / Present | Green |
| TIDAK_HADIR | Tidak Hadir / Absent | Red |
| NO_DATA | Tidak ada data | Gray |
| MANUAL_CORRECTION | Diubah manual | Blue |
| SICK | Sakit | Orange |
| LEAVE | Cuti | Blue |
| HOLIDAY | Libur | Gray |

## Mapping Status Values

| Status | Description |
|--------|-------------|
| MAPPED | Device user ID berhasil cocok ke employee |
| UNMAPPED | Tidak ditemukan employee |
| NEED_REVIEW | Ada kandidat tapi belum pasti |
| DUPLICATE | Mapping berpotensi duplikat |
| IGNORED | Diabaikan admin |

## Batch Status Values

| Status | Description | Duration |
|--------|-------------|----------|
| RUNNING | Sedang berjalan | < 30 min normal |
| COMPLETED | Selesai sukses | - |
| FAILED | Gagal | - |
| PARTIAL_SUCCESS | Sebagian berhasil | - |
| STUCK | Terlalu lama RUNNING | > 30 min |

## Machine Status Values

| Status | Description | Action |
|--------|-------------|--------|
| ACCESSIBLE | Bisa dikoneksi | Ready to sync |
| ONLINE | Berhasil konek | Syncing |
| OFFLINE | Tidak merespons | Check network |
| PORT_BLOCKED | Port tidak terbuka | Check port forwarding |
| NETWORK_UNREACHABLE | IP tidak bisa dijangkau | Check routing |
| AUTH_FAILED | Password salah | Check ZKTeco password |
| TIMEOUT | Lambat merespons | Increase timeout |

## Data Source Values

| Source | Description |
|--------|-------------|
| DIRECT_ZKTECO | Dari scan mesin langsung |
| IT_SOLUTION_API | Dari API fallback |
| MANUAL | Input manual/correction |

## Quality Score Formula

```
quality_score = (
  (mapped_records / total_records * 0.50) +
  (successful_batches / total_batches * 0.25) +
  (online_machines / total_machines * 0.15) +
  (non_duplicate_records / total_records * 0.10)
) * 100
```

## Quality Score Thresholds

| Score Range | Status | Color |
|-------------|--------|-------|
| 90-100% | Sehat | Green |
| 70-89% | Baik | Blue |
| 50-69% | Perlu Perhatian | Orange |
| <50% | Kritis | Red |

## Database Tables (Arsitektur 3-Layer, post-2026-06-23)

> **Database**: `rebinmas_absensi_monitoring` (lokal, MSSQL)

### Layer 1 — RAW (ASAL, TIDAK PERNAH DIUBAH)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `attendance_machines` | Konfigurasi mesin ZKTeco | machine_code, ip, loc_code, scanner_code |
| `attendance_scan_logs` | Raw scan log dari mesin (immutable) | raw_device_user_id, machine_code, scan_time |
| `hr_employee_current_snapshot` | Snapshot NIK→EmpCode terbaru dari db_ptrj | nik, current_emp_code, current_emp_name |

### Layer 2 — MASTER (SATU TABEL SAJA)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `employees` | **SSOT** — semua data employee identity | employee_code, current_emp_code, nik, machine_codes, batch_import |

### Layer 3 — PROCESSED (HASIL OLAHAN)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `attendance_imports` | Attendance per employee per hari | employee_id, attendance_date, status |
| `attendance_import_batches` | Audit trail per batch sync | batch_code, status, records_total |
| `employee_code_history` | Riwayat kode employee per NIK | nik, emp_code, is_current |

### Reference Tables

| Table | Purpose |
|-------|---------|
| `divisions` | Lookup division |
| `gangs` | Lookup gang/team |
| `employee_mapping_overrides` | Manual override mapping |
| `attendance_holiday` | Daftar hari libur |
| `attendance_work_config` | Konfigurasi jam kerja |

### DEPRECATED / DROPPED (2026-06-23)

| Table | Status | Notes |
|-------|--------|-------|
| `zkteco_absensi_user_registry` | **DROPPED** | Data dipindahkan ke `employees`, tabel dihapus |
| `employee_machine_enrollments` | **DROPPED** | Data sudah di `employees.machine_codes` |
| `zkteco_absensi_user_machine` | **DROPPED** | Orphan FK ke registry |
| `zkteco_hr_employee_map` | **DROPPED** | Tidak diperlukan lagi |
| `machine_user_map` | Deprecated | - |
| `attendance_imports_old` | **DROPPED** | Archive lama |
| `employee_hr_sync_audit` | **DROPPED** | Archive lama |

### employees Table (SSOT — 44 kolom)

```sql
-- Database: rebinmas_absensi_monitoring
-- Purpose: SATU TABEL MASTER employee (SSOT)
-- 1,866 rows (2026-06-23)
-- 1,850 with nik, 1,774 with current_emp_code, 90 with raw_device_user_id

CREATE TABLE employees (
  -- Identity (PK & canonical
  id                  INT IDENTITY(1,1) PRIMARY KEY,
  employee_code       NVARCHAR(30) NOT NULL UNIQUE,  -- kode hasil parsing (historical)

  -- NEW: current identity dari HR (berbasis NIK)
  current_emp_code   NVARCHAR(30) NULL,  -- kode terbaru dari HR snapshot
  current_emp_name   NVARCHAR(150) NULL,
  nik               NVARCHAR(50) NULL,    -- NIK/NewICNo dari HR (identity key stabil)

  -- Machine enrollment
  machine_codes      NVARCHAR(500) NULL,  -- "P1A,P1B,ARC_01" (comma-separated)
  machine_count      INT NULL,

  -- Batch import
  batch_import      NVARCHAR(100) NULL,  -- batch terakhir yang importer

  -- Machine identity dari ZKTeco
  raw_device_user_id  NVARCHAR(100) NULL,  -- ID asli dari mesin
  zkteco_user_name   NVARCHAR(150) NULL,  -- Nama di mesin
  parsed_employee_code NVARCHAR(30) NULL, -- hasil SSOT parser
  raw_id_length      INT NULL,
  id_category       NVARCHAR(30) NULL,

  -- HR data
  hr_employee_code  NVARCHAR(30) NULL,
  hr_loc_code       NVARCHAR(20) NULL,
  hr_status         NVARCHAR(20) NULL,
  hr_verified       BIT NOT NULL DEFAULT 0,
  hr_verified_at    DATETIME2 NULL,

  -- Current resolution (dari hr_employee_current_snapshot)
  resolved_nik               NVARCHAR(50) NULL,
  current_resolution_status   NVARCHAR(30) NULL,
  current_resolution_method   NVARCHAR(50) NULL,
  current_resolution_reason   NVARCHAR(500) NULL,
  current_resolved_at         DATETIME2 NULL,
  current_hr_loc_code        NVARCHAR(20) NULL,
  current_hr_create_date     DATETIME2 NULL,
  current_hr_update_date     DATETIME2 NULL,

  -- Name & division
  employee_name     NVARCHAR(150) NULL,  -- Nama employee
  division_id       INT NULL,              -- FK ke divisions (nullable: beberapa row baru tidak punya)
  gang_id          INT NULL,              -- FK ke gangs
  division_code    NVARCHAR(10) NULL,     -- Denormalized division_code
  gang_code        NVARCHAR(20) NULL,    -- Denormalized gang_code

  -- Quality
  scan_count       INT NULL DEFAULT 0,
  first_seen_at   DATETIME2 NULL,
  last_seen_at    DATETIME2 NULL,
  mapping_status  NVARCHAR(30) NULL,
  mapping_reason  NVARCHAR(500) NULL,
  parsed_division_code NVARCHAR(10) NULL,

  -- Identity resolution (final)
  identity_source              NVARCHAR(50) NULL,
  identity_resolution_reason  NVARCHAR(500) NULL,

  -- Legacy / status
  is_raw_id          BIT NOT NULL DEFAULT 0,
  is_active          BIT NOT NULL DEFAULT 1,
  employment_status  NVARCHAR(30) NULL,
  data_quality_status  NVARCHAR(50) NULL,
  data_quality_reason NVARCHAR(500) NULL,

  -- Timestamps
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NULL,

  -- Indexes (created by migration 056)
  -- IX_employees_nik
  -- IX_employees_current_emp_code
  -- IX_employees_raw_device_user_id
  -- IX_employees_parsed_employee_code
  -- IX_employees_mapping_status
);
```

### attendance_scan_logs Table

```sql
-- Database: rebinmas_absensi_monitoring
-- Purpose: Immutable raw attendance scan records
CREATE TABLE attendance_scan_logs (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  machine_id INT NULL,
  machine_code NVARCHAR(30) NOT NULL,
  raw_device_user_id NVARCHAR(100) NOT NULL,   -- Raw ID from machine
  raw_user_sn NVARCHAR(100) NULL,
  raw_record_time DATETIME2 NOT NULL,
  raw_ip NVARCHAR(64) NULL,
  parsed_employee_code NVARCHAR(30) NULL,      -- Result of parsing (e.g., 'C0040')
  parsed_division_code NVARCHAR(20) NULL,
  mapping_status NVARCHAR(30) NOT NULL DEFAULT 'NEED_REVIEW',
  mapping_reason NVARCHAR(500) NULL,
  scan_time DATETIME2 NOT NULL,
  scan_date DATE NOT NULL,
  event_type NVARCHAR(50) NULL,
  verify_type NVARCHAR(50) NULL,
  work_code NVARCHAR(50) NULL,
  sync_batch_id BIGINT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_scan_logs_machine FOREIGN KEY (machine_id) REFERENCES attendance_machines(id)
);
```

## Views

| View | Purpose |
|------|---------|
| vw_attendance_final | Final attendance per employee per date |
| vw_attendance_monthly_summary | Monthly summary per employee |
| vw_attendance_daily_summary | Daily summary per division |

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## Time Formats

| Format | Example | Usage |
|--------|---------|--------|
| ISO 8601 | 2026-06-20T07:30:00.000Z | API responses |
| Date only | 2026-06-20 | scan_date field |
| Time only | 07:30:00 | jam_masuk, jam_keluar |

## Common SQL Queries

### Count employees by division
```sql
SELECT d.division_code, COUNT(e.id) as emp_count
FROM divisions d
LEFT JOIN employees e ON e.division_id = d.id
WHERE e.is_active = 1
GROUP BY d.division_code
```

### Scan logs with mapping status
```sql
SELECT mapping_status, COUNT(*) as cnt
FROM attendance_scan_logs
WHERE scan_date >= '2026-06-01'
GROUP BY mapping_status
```

### Machines with sync status
```sql
SELECT m.machine_code, m.access_status, m.last_sync_at,
       COALESCE(b.status, 'NEVER') as last_batch_status
FROM attendance_machines m
LEFT JOIN attendance_import_batches b ON b.machine_id = m.id
ORDER BY m.machine_code
```

### HR Verification - Find unmatched employee codes
```sql
-- Find employee codes in attendance that are NOT in HR_EMPLOYEE
SELECT DISTINCT parsed_employee_code
FROM attendance_scan_logs
WHERE parsed_employee_code IS NOT NULL
  AND parsed_employee_code NOT IN (
    SELECT RTRIM(EmpCode) FROM [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE WHERE Status = '1'
  )
```

### Cross-machine employee check (deduplication)
```sql
-- Find employees enrolled in multiple machines
SELECT
  e.employee_code,
  e.employee_name,
  COUNT(DISTINCT m.machine_id) as machine_count,
  STRING_AGG(m.machine_code, ', ') as machines
FROM employees e
JOIN machine_user_map m ON e.id = m.employee_id
GROUP BY e.employee_code, e.employee_name
HAVING COUNT(DISTINCT m.machine_id) > 1
ORDER BY machine_count DESC
```
