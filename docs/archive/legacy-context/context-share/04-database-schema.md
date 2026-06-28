# Database Schema

Database: `rebinmas_absensi_monitoring`

## ⚠️ ATTENTION: Dual Employee Code Format

Sistem ini memiliki **DUA format employee code** yang berbeda:

| Source | Format | Contoh | Count |
|--------|--------|--------|-------|
| IT Solution API | `0010001` (7 digit) | "0010001", "0010002" | ~4,182 employees |
| ZKTeco Machine | `A0044` (letter + 4 digits) | "A0044", "B0232" | device user IDs |

**Ini adalah root cause utama masalah mapping!**

- Employee codes di table `employees` → format API "0010001"
- Parsed codes dari ZKTeco → format "A0044", "H0029"
- **Tidak match!** → unmapped records

### Lokasi Employee Code dalam Database

```sql
-- employees table: format API
SELECT employee_code, employee_name, division_code FROM employees LIMIT 5;
-- Result: "0010001", "DIANA ( ROBIYAH )", "IJL"

-- attendance_scan_logs: format ZKTeco  
SELECT raw_device_user_id, parsed_employee_code, machine_code FROM attendance_scan_logs LIMIT 5;
-- Result: "10044", "A0044", "PGE"
```

## Key Views (Attendance Matrix)

### vw_attendance_final
View utama untuk attendance matrix per employee per tanggal.

```sql
SELECT employee_code, employee_name, division_code, attendance_date, 
       attendance_status, has_work, is_leave, is_sick, is_holiday
FROM vw_attendance_final
WHERE attendance_date = '2026-06-19'
ORDER BY employee_code
```

### vw_attendance_monthly_summary
Summary bulanan per employee.

```sql
SELECT employee_code, employee_name, division_code, 
       total_present, total_absent, total_leave, total_sick
FROM vw_attendance_monthly_summary
WHERE attendance_year = 2026 AND attendance_month = 6
```

## Main Tables

### employees
Master data employee (format IT Solution API).

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| employee_code | VARCHAR(50) | Unique code (e.g., "0010001") |
| employee_name | NVARCHAR(255) | Nama employee |
| division_id | INT | Foreign key ke divisions |
| division_code | VARCHAR(50) | Kode divisi (computed) |
| is_active | BIT | Status aktif |

### attendance_imports
Processed attendance records (schema terbaru).

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT | Primary key |
| employee_code | NVARCHAR(50) | Employee code (format API) |
| division_code | NVARCHAR(50) | Division code |
| attendance_date | DATE | Tanggal absensi |
| attendance_month | INT | Bulan (1-12) |
| attendance_year | INT | Tahun |
| attendance_status | NVARCHAR(20) | HADIR, TIDAK_HADIR |
| check_in_at | DATETIME2 | Waktu check in |
| check_out_at | DATETIME2 | Waktu check out |
| has_work | BIT | Punya kerja |
| is_sick | BIT | Sakit |
| is_leave | BIT | Cuti |
| is_holiday | BIT | Libur |
| overtime_hours | DECIMAL(8,2) | Jam lembur |
| source | NVARCHAR(50) | ZKTECO, API, MANUAL |

### attendance_scan_logs
Raw attendance scan records dari mesin ZKTeco.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT | Primary key |
| machine_code | NVARCHAR(50) | Kode mesin |
| raw_device_user_id | NVARCHAR(50) | User ID dari mesin ("10044") |
| parsed_employee_code | NVARCHAR(50) | Employee code hasil parsing ("A0044") |
| parsed_division_code | NVARCHAR(50) | Division code |
| mapping_status | NVARCHAR(20) | MAPPED, UNMAPPED, NEED_REVIEW |
| scan_time | DATETIME | Waktu scan |
| scan_date | DATE | Tanggal scan |
| sync_batch_id | BIGINT | Batch ID |

### attendance_import_batches
Tracking import batches.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT | Primary key |
| batch_code | NVARCHAR(100) | Unique batch code |
| machine_id | INT | FK ke machines |
| machine_code | NVARCHAR(50) | Kode mesin |
| status | NVARCHAR(20) | RUNNING, COMPLETED, FAILED |
| records_total | INT | Total records |
| records_success | INT | Records berhasil |
| records_failed | INT | Records gagal |
| started_at | DATETIME | Mulai import |
| finished_at | DATETIME | Selesai import |
| error_message | NVARCHAR(MAX) | Error message |

### attendance_machines
Machine inventory.

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Primary key |
| machine_code | NVARCHAR(50) | Kode mesin |
| location_name | NVARCHAR(255) | Nama lokasi |
| ip_address | NVARCHAR(50) | IP address |
| port | INT | Port |
| loc_code | NVARCHAR(10) | Location code |
| access_status | NVARCHAR(50) | ACCESSIBLE, BLOCKED |
| data_source | NVARCHAR(50) | DIRECT_ZKTECO, IT_SOLUTION_API |
| is_active | BIT | Status aktif |

---

## Attendance Status Values

| Status | Meaning |
|--------|---------|
| HADIR | Hadir / Present |
| TIDAK_HADIR | Tidak Hadir / Absent |
| NO_DATA | Tidak ada data |
| MANUAL_CORRECTION | Diubah manual |

---

## Predefined Divisions

| ID | Code | Name |
|----|------|------|
| 2 | PG1A | Kebun PG1A |
| 3 | PG1B | Kebun PG1B |
| 7 | ARA | Afdeling ARA |
| 9 | AB2 | Afdeling AB2 |
| 11 | ARA | Afdeling ARA (updated) |
| 13 | IJL | Ijuk Langsung |
| 14 | STF | Staff / Office |
| - | PGE | Office PGE |
| - | ARE | ARE Division |
