# Database Schema — Database `absensi`

> Database baru untuk sistem absensi PT Rebinmas Jaya. Dipisahkan dari `extend_db_ptrj`.

---

## Overview

| # | Tabel | Fungsi | Kunci |
|---|-------|--------|-------|
| 1 | `mst_division` | Master divisi (14 seed) | `division_id` |
| 2 | `mst_machine` | Master mesin absensi (15 seed) | `machine_id` |
| 3 | `mst_employee` | Master karyawan | `employee_id` |
| 4 | `attendance_scan_log` | Semua event scan mentah (N baris/karyawan/hari) | `scan_id` |
| 5 | `employee_attendance_daily` | Agregasi harian per karyawan (1 baris/orang/hari) | `attendance_id` |
| 6 | `attendance_manual_input` | Input manual absensi (izin, sakit, dll) | `manual_id` |
| 7 | `attendance_work_config` | Config jam kerja per hari (7 hari) | `config_id` |
| 8 | `attendance_sorting_result` | Hasil sortir divisi per karyawan per hari | `sorting_id` |
| 9 | `attendance_holiday` | Daftar hari libur nasional | `holiday_id` |

---

## 1. `mst_division`

Master divisi. 14 divisi sudah di-seed.

```
division_id  INT PK IDENTITY
division_code NVARCHAR(20) UNIQUE  -- PG1A, DME, ARA, dll
division_name NVARCHAR(100)
emp_code_prefix NVARCHAR(5)       -- A, B, C, D, E, F, G, H, J, L
is_active BIT DEFAULT 1
created_at DATETIME
updated_at DATETIME
```

**Seed Data:**

| ID | Code | Name | Prefix |
|----|------|------|--------|
| 1 | PG1A | Plant Group 1A | A |
| 2 | PG1B | Plant Group 1B | B |
| 3 | PG2A | Plant Group 2A | C |
| 4 | PG2B | Plant Group 2B | D |
| 5 | DME | Mill Estate | E |
| 6 | ARA | Ari Estate | F |
| 7 | ARB1 | Ari Estate 1 | G |
| 8 | ARB2 | Ari Estate 2 | H |
| 9 | AREC | Ari Estate Clinic | J |
| 10 | IJL | Ijuk Estate | L |
| 11 | PGE | Pabrik Head Office | A |
| 12 | INFRA | Infrastructure | A |
| 13 | STF | Staff/Office | A |
| 14 | SEC | Security | A |

---

## 2. `mst_machine`

Master mesin absensi. 15 mesin di-seed. FK ke `mst_division`.

```
machine_id INT PK IDENTITY
machine_code NVARCHAR(20) UNIQUE   -- PGE, MILL, DME_01, ARA, AB2, dll
machine_name NVARCHAR(100)
machine_ip NVARCHAR(50)
machine_port INT DEFAULT 4370
machine_type NVARCHAR(20) DEFAULT 'ZKTECO'
division_id INT FK → mst_division(division_id)
scanner_code INT NULL              -- kode scanner (700=DME, 800=ARA, dll)
loc_code NVARCHAR(5) NULL          -- A, B, E, F, G, H, J, L
is_active BIT DEFAULT 1
last_sync_at DATETIME NULL
created_at DATETIME
updated_at DATETIME
```

---

## 3. `mst_employee`

Master karyawan. FK ke `mst_division`.

```
employee_id INT PK IDENTITY
emp_code NVARCHAR(50) UNIQUE   -- A0039, L10002, dll
emp_name NVARCHAR(255)
division_id INT FK → mst_division(division_id)  -- home division
emp_type NVARCHAR(20) DEFAULT 'STAFF'
is_active BIT DEFAULT 1
scanner_id INT NULL
created_at DATETIME
updated_at DATETIME
```

**Catatan:** `emp_code` → `division_id` lewat `mst_employee`, bukan dari mesin scan.

---

## 4. `attendance_scan_log`

Semua event scan mentah. N baris per karyawan per hari.

```
scan_id BIGINT PK IDENTITY
emp_code NVARCHAR(50)
machine_id INT FK → mst_machine(machine_id)
machine_code NVARCHAR(20)
scan_time DATETIME NOT NULL
work_date DATE NOT NULL           -- DATE(scan_time)
raw_source NVARCHAR(20)           -- ZKTECO / API
raw_data NVARCHAR(MAX) NULL
created_at DATETIME
```

**Indexes:** `(emp_code, work_date)`, `(work_date)`, `(machine_code, work_date)`

---

## 5. `employee_attendance_daily`

Agregasi harian: **1 baris per karyawan per hari**. UNIQUE `(emp_code, work_date)`.

```
attendance_id BIGINT PK IDENTITY
emp_code NVARCHAR(50)
work_date DATE

-- Konsep 3 divisi:
home_division_id INT FK NOT NULL     -- divisi asli karyawan dari mst_employee
final_division_id INT FK NOT NULL    -- divisi hasil sortir untuk monitoring
scan_division_id INT FK NULL         -- divisi tempat scan pertama terjadi

-- Scan info:
first_machine_id INT FK → mst_machine(machine_id)
last_machine_id INT FK → mst_machine(machine_id)
first_scan_time DATETIME NULL
last_scan_time DATETIME NULL
scan_count INT DEFAULT 0

-- Durasi:
work_duration_minutes INT NULL           -- last_scan - first_scan
standard_minutes INT NULL                -- dari work_config (420/300)
is_estimated_duration BIT DEFAULT 0     -- 1 jika single scan (estimasi)
overtime_minutes INT DEFAULT 0
is_overtime BIT DEFAULT 0

-- Status:
attendance_status NVARCHAR(20) NOT NULL  -- PRESENT / ABSENT / SINGLE_SCAN / HOLIDAY / MANUAL
sort_status NVARCHAR(50) NOT NULL        -- MATCH_HOME / CROSS_DIVISION_MOVED / dll
is_cross_division_scan BIT DEFAULT 0
need_manual_review BIT DEFAULT 0
note NVARCHAR(500) NULL
manual_input_id BIGINT NULL              -- FK ke attendance_manual_input
processed_at DATETIME
process_version NVARCHAR(20) DEFAULT 'v1.0'
```

**Indexes:** `(final_division_id, work_date)`, `(home_division_id, work_date)`, `(work_date)`, `(attendance_status, work_date)`, `(is_overtime, work_date)`

---

## 6. `attendance_manual_input`

Input absensi manual (sakit, izin, tugas luar, holiday, dll). UNIQUE `(emp_code, work_date)`.

```
manual_id BIGINT PK IDENTITY
emp_code NVARCHAR(50)
work_date DATE
attendance_type NVARCHAR(30) NOT NULL   -- SICK / PERMIT / ASSIGNMENT / HOLIDAY / OTHER
check_in_time DATETIME NULL
check_out_time DATETIME NULL
duration_minutes INT NULL
note NVARCHAR(500) NULL
approved_by NVARCHAR(100) NULL
is_approved BIT DEFAULT 0
created_by NVARCHAR(100) NOT NULL
created_at DATETIME
updated_at DATETIME
```

**Attendance Type Values:**
- `MASUK` — Hadir manually (override absen mesin)
- `SAKIT` — Sakit
- `IZIN` — Izin
- `TUGAS_LUAR` — Tugas luar
- `LIBUR` — Hari libur
- `LAINNYA` — Lainnya

**Indexes:** `(emp_code, work_date)`, `(work_date)`, `(attendance_type, work_date)`

---

## 7. `attendance_work_config`

Config jam kerja per hari. 7 baris di-seed.

```
config_id INT PK IDENTITY
day_of_week INT NOT NULL      -- 0=Minggu, 1=Senin, ..., 6=Sabtu
standard_minutes INT NOT NULL -- 420 (7 jam) / 300 (5 jam) / 0 (libur)
is_workday BIT DEFAULT 1
label NVARCHAR(50) NULL
created_at DATETIME
updated_at DATETIME
```

**Seed Data:**

| day_of_week | standard_minutes | is_workday | label |
|-------------|-----------------|------------|-------|
| 0 (Minggu) | 0 | 0 | Libur |
| 1 (Senin) | 420 | 1 | 7 jam |
| 2 (Selasa) | 420 | 1 | 7 jam |
| 3 (Rabu) | 420 | 1 | 7 jam |
| 4 (Kamis) | 420 | 1 | 7 jam |
| 5 (Jumat) | 300 | 1 | 5 jam |
| 6 (Sabtu) | 0 | 0 | Libur |

**Jam kerja lembur:** Karyawan bisa lebih dari standard. `overtime_minutes = MAX(0, work_duration_minutes - standard_minutes)`.

---

## 8. `attendance_sorting_result`

Hasil sortir divisi. **1 baris per karyawan per hari**. UNIQUE `(emp_code, work_date)`.

```
sorting_id BIGINT PK IDENTITY
emp_code NVARCHAR(50)
work_date DATE

home_division_id INT FK NULL     -- dari mst_employee
scan_division_id INT FK NULL     -- dari mesin scan pertama
final_division_id INT FK NOT NULL -- hasil sortir (untuk monitoring)

machine_id INT FK → mst_machine(machine_id)

sort_status NVARCHAR(50) NOT NULL
sort_rule NVARCHAR(100) NOT NULL
is_cross_division BIT DEFAULT 0
need_review BIT DEFAULT 0
note NVARCHAR(500) NULL
sorted_by NVARCHAR(100) DEFAULT 'SYSTEM'
sorted_at DATETIME DEFAULT GETDATE()
```

**Sort Status Values:**
- `MATCH_HOME_DIVISION` — Scan di divisi sendiri
- `CROSS_DIVISION_MOVED` — Scan di tempat lain, dipindah ke home division
- `NO_HOME_DIVISION` — Karyawan belum punya home division
- `UNMAPPED_EMPLOYEE` — Device user belum ketemu emp_code
- `NEED_MANUAL_REVIEW` — Sistem ragu, perlu dicek
- `MANUAL_OVERRIDE` — Admin ubah manual

**Sort Rules:**
- `RULE_HOME` — Emp_code punya home_division di mst_employee
- `RULE_API` — Pakai division dari API IT Solution
- `RULE_PREFIX` — Pakai emp_code prefix (A→PG1A, E→DME, dll)
- `RULE_SCAN` — Fallback ke scan_division
- `RULE_MANUAL` — Override manual

**Sorting Rule Chain (Priority):**
```
1. mst_employee.division_id → RULE_HOME
2. API division → RULE_API
3. emp_code prefix → RULE_PREFIX
4. scan_division → RULE_SCAN
5. need_review=1, status=NEED_MANUAL_REVIEW
```

**Indexes:** `(final_division_id, work_date)`, `(emp_code, work_date)`, `(is_cross_division, work_date)`

---

## 9. `attendance_holiday`

Daftar hari libur nasional.

```
holiday_id INT PK IDENTITY
holiday_date DATE UNIQUE
holiday_name NVARCHAR(255)
holiday_type NVARCHAR(20) DEFAULT 'NATIONAL'
is_annual BIT DEFAULT 0
created_at DATETIME
```

---

## Relasi Antar Tabel

```
mst_division (1)───(N) mst_machine
   │
   └───(N) mst_employee
              │
              │  (home_division → division_id)
              ↓
mst_employee ──┬──→ attendance_scan_log (N events/orang/hari)
                │
                └──→ employee_attendance_daily (1 baris/orang/hari)
                              │
                              ├──→ attendance_sorting_result (1 baris/orang/hari)
                              │
                              └──→ attendance_manual_input (override)
```

---

## Key Queries

### Dashboard Harian per Divisi
```sql
SELECT
    d.division_code,
    COUNT(*) AS total_present,
    SUM(CASE WHEN e.is_cross_division_scan = 1 THEN 1 ELSE 0 END) AS cross_division_visits,
    SUM(e.work_duration_minutes) AS total_work_minutes,
    SUM(e.overtime_minutes) AS total_overtime_minutes
FROM employee_attendance_daily e
JOIN mst_division d ON e.final_division_id = d.division_id
WHERE e.work_date = '2026-05-29'
  AND e.attendance_status IN ('PRESENT', 'SINGLE_SCAN')
GROUP BY d.division_code
ORDER BY d.division_code;
```

### Karyawan Absen Lintas Divisi
```sql
SELECT
    s.emp_code,
    e.emp_name,
    scan_div.division_code AS scan_division,
    home_div.division_code AS home_division,
    final_div.division_code AS final_division,
    s.sort_status,
    s.note
FROM attendance_sorting_result s
JOIN mst_employee e ON e.emp_code = s.emp_code
LEFT JOIN mst_division scan_div ON s.scan_division_id = scan_div.division_id
LEFT JOIN mst_division home_div ON s.home_division_id = home_div.division_id
LEFT JOIN mst_division final_div ON s.final_division_id = final_div.division_id
WHERE s.work_date = '2026-05-29'
  AND s.is_cross_division = 1
ORDER BY s.emp_code;
```

### Karyawan yang Butuh Review
```sql
SELECT
    s.emp_code,
    e.emp_name,
    s.sort_status,
    s.note,
    m.machine_code,
    s.sorted_at
FROM attendance_sorting_result s
JOIN mst_employee e ON e.emp_code = s.emp_code
LEFT JOIN mst_machine m ON s.machine_id = m.machine_id
WHERE s.work_date = '2026-05-29'
  AND s.need_review = 1
ORDER BY s.sort_status, s.emp_code;
```

### Overtime Report
```sql
SELECT
    e.emp_code,
    emp.emp_name,
    d.division_code,
    SUM(e.work_duration_minutes) AS total_minutes,
    SUM(e.standard_minutes) AS standard_minutes,
    SUM(e.overtime_minutes) AS total_overtime,
    SUM(CASE WHEN e.is_overtime = 1 THEN 1 ELSE 0 END) AS overtime_days
FROM employee_attendance_daily e
JOIN mst_employee emp ON e.emp_code = emp.emp_code
JOIN mst_division d ON e.final_division_id = d.division_id
WHERE e.work_date BETWEEN '2026-05-01' AND '2026-05-29'
GROUP BY e.emp_code, emp.emp_name, d.division_code
HAVING SUM(e.overtime_minutes) > 0
ORDER BY SUM(e.overtime_minutes) DESC;
```

### Scan Events untuk Audit (N baris)
```sql
SELECT
    s.emp_code,
    m.machine_code,
    s.scan_time,
    s.raw_source
FROM attendance_scan_log s
LEFT JOIN mst_machine m ON s.machine_id = m.machine_id
WHERE s.work_date = '2026-05-29'
  AND s.emp_code = 'A0039'
ORDER BY s.scan_time;
```
