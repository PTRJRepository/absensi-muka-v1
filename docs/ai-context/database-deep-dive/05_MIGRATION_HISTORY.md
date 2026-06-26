# 05_MIGRATION_HISTORY.md

# Migration History - PT Rebinmas Jaya Absensi System

## Overview

The database schema evolved through multiple migration phases, from simple attendance records to a comprehensive employee attendance system.

---

## Migration Timeline

| Version | Date | Purpose | Database |
|---------|------|---------|----------|
| v1 | 2026-05-29 | Initial schema | extend_db_ptrj |
| v2 | 2026-05-30 | Employee attendance | extend_db_ptrj |
| v3 | 2026-05-30 | Final tables + SPs | db_faceattn_ptrj |
| v3_final | 2026-05-30 | Final tables | extend_db_ptrj |
| batch1 | 2026-05-30 | Master tables | extend_db_ptrj |
| v3_seed | 2026-05-30 | Seed data | extend_db_ptrj |
| faceattn_v1 | 2026-05-30 | Alternative schema | db_faceattn_ptrj |

---

## Migration v1: Initial Schema (2026-05-29)

**File:** `migration_v1_employee_attendance.sql`  
**Purpose:** Basic attendance tables with division and machine mapping

### Tables Created

1. **mst_division** - 14 divisions
2. **mst_machine** - 15 machines
3. **mst_employee** - Employee master
4. **attendance_scan_log** - Raw scan events
5. **employee_attendance_daily** - Daily aggregation
6. **attendance_manual_input** - Manual entries
7. **attendance_work_config** - Work hours config
8. **attendance_sorting_result** - Division sorting
9. **attendance_holiday** - Holiday schedule

### Key Features
- Division-based organization
- Machine IP/port configuration
- Employee-scanner mapping
- Basic work hour config (420 min / 300 min)

---

## Migration v2: Employee Attendance System (2026-05-30)

**File:** `migration_v2_employee_attendance.sql`  
**Purpose:** Enhanced employee attendance with sorting rules

### New/Modified Tables

1. **mst_division** - Added scanner_code, loc_code
2. **mst_machine** - Added loc_code, scanner_code, FK to division
3. **mst_employee** - Added gang_code, machine_user_id, home_division_id
4. **attendance_scan_log** - Added scan_division_id, employee_id FK
5. **employee_attendance_daily** - Added sorting_status, is_cross_division_scan
6. **attendance_sorting_result** - Enhanced with sorting rules
7. **attendance_work_config** - Added day_name column
8. **attendance_sorting_status** - NEW reference table
9. **attendance_attendance_type** - NEW reference table

### New Reference Tables

```sql
-- attendance_sorting_status
('MATCH_HOME_DIVISION',   'Match - Scan di divisi sendiri')
('CROSS_DIVISION_MOVED',  'Lintas Divisi - Dipindahkan')
('NO_HOME_DIVISION',       'Tanpa Home Divisi')
('UNMAPPED_EMPLOYEE',     'Tidak Teremap')
('NEED_MANUAL_REVIEW',    'Butuh Review Manual')
('MANUAL_OVERRIDE',       'Override Manual')

-- attendance_attendance_type
('SICK',       'Sakit')
('PERMIT',     'Izin')
('ASSIGNMENT', 'Tugas Luar')
('HOLIDAY',    'Cuti / Libur')
('OTHER',      'Lainnya')
```

### Sorting Rules Added
- RULE_1_HOME_DIV - Employee scans at home division
- RULE_2_API_DIV - Employee assigned via API
- RULE_3_PREFIX - Division determined by emp_code prefix
- RULE_4_REVIEW - Need manual review

---

## Migration v3: Final Tables + Stored Procedures (2026-05-30)

**File:** `migration_v3_final_tables.sql`  
**Purpose:** Final production schema with stored procedures

### Tables Created/Modified

1. **attendance_scan_log** - Enhanced with raw_device_* columns
2. **attendance_manual_input** - Added type constraint
3. **attendance_manual_type** - NEW lookup table

### New Lookup Table

```sql
CREATE TABLE attendance_manual_type (
    type_code     NVARCHAR(30) PRIMARY KEY,
    type_name     NVARCHAR(100) NOT NULL,
    color_hex     NVARCHAR(7) NULL,
    is_paid       BIT DEFAULT 1,
    is_counted    BIT DEFAULT 1,
    display_order INT DEFAULT 0
);

-- Seeded values
('SICK',       'Sakit',            '#FF9800', 1, 1, 1)
('PERMIT',     'Izin',             '#2196F3', 1, 1, 2)
('ASSIGNMENT', 'Tugas Luar',       '#9C27B0', 0, 1, 3)
('HOLIDAY',    'Libur/Cuti',       '#4CAF50', 0, 0, 4)
('OTHER',      'Lainnya',          '#9E9E9E', 0, 0, 5)
('IN',         'Absen Masuk',      '#4CAF50', 1, 1, 6)
('OUT',        'Absen Pulang',     '#F44336', 1, 1, 7)
('CORRECTION', 'Koreksi Absensi',  '#FF5722', 1, 1, 8)
```

### Stored Procedures Added

1. **sp_sync_attendance_daily** - Daily aggregation
2. **sp_get_dashboard_attendance** - Dashboard summary
3. **sp_get_cross_division_scan** - Cross-division report
4. **sp_get_employee_attendance_detail** - Employee detail
5. **sp_insert_manual_input** - Manual input entry
6. **sp_approve_manual_input** - Approve manual input
7. **sp_insert_scan_log** - Bulk scan log insert

---

## Migration batch1_master: Master Tables (2026-05-30)

**File:** `migration_batch1_master.sql`  
**Purpose:** First batch of master tables (run before batch2)

### Tables Created

1. **mst_division** - 14 divisions with loc_code, emp_code_prefix
2. **mst_machine** - 15 machines (division_id nullable)
3. **mst_employee** - Employee master
4. **mst_employee_family** - Employee family members
5. **attendance_holiday** - Holiday schedule
6. **attendance_work_config** - Work hours config
7. **attendance_scan_log** - Raw scan events
8. **employee_attendance_daily** - Daily aggregation
9. **attendance_sorting_result** - Division sorting
10. **attendance_manual_input** - Manual entries

### Key Differences from v2
- Uses CHAR(1) for loc_code and emp_code_prefix
- Machine division_id set in batch 2
- Simplified column names

---

## Migration v3_seed: Seed Master Data (2026-05-30)

**File:** `migration_v3_seed_master.sql`  
**Purpose:** Seed data for master tables

### Seed Operations

1. **mst_division** - 14 divisions
2. **mst_machine** - 15 machines with IP/port
3. **attendance_work_config** - 7 days
4. **attendance_holiday** - 2026 Indonesian holidays
5. **mst_employee** - From absen_import

### Holiday Seeds (2026)

```sql
('2026-01-01', 'Tahun Baru 2026',                  1)
('2026-01-29', 'Isra Mikraj Nabi Muhammad SAW',    1)
('2026-02-18', 'Imlek 2617',                       1)
('2026-03-20', 'Nyepi Tahun Baru Saka 1948',       0)
('2026-03-29', 'Maulid Nabi Muhammad SAW',         1)
('2026-04-03', 'Wafat Isa Al-Masih',               1)
('2026-05-01', 'Hari Buruh Internasional',          1)
('2026-05-14', 'Kenaikan Isa Al-Masih',            1)
('2026-06-01', 'Pancasila',1)
('2026-08-17', 'Hari Ulang Tahun Kemerdekaan RI',  1)
('2026-12-25', 'Hari Raya Natal',                   0)
```

---

## Migration faceattn_v1: Alternative Schema (2026-05-30)

**File:** `migration_faceattn_v1.sql`  
**Purpose:** Alternative database (db_faceattn_ptrj) schema

### Tables

1. **mst_division** - 14 divisions
2. **mst_machine** - 15 machines with FK to division
3. **mst_employee** - Employee master with needs_review flag
4. **attendance_work_config** - Work hours
5. **attendance_holiday** - Holidays
6. **attendance_scan_log** - Raw scans
7. **employee_attendance_daily** - Daily aggregation
8. **attendance_sorting_result** - Division sorting
9. **attendance_manual_input** - Manual entries

### Key Features
- Unique index on employee_attendance_daily(emp_code, work_date)
- Unique index on attendance_sorting_result(emp_code, work_date)
- Unique constraint on attendance_manual_input(emp_code, work_date, attendance_type)

---

## Migration execute: Initial Data Load (2026-05-29)

**File:** `migration_execute.sql`  
**Purpose:** Initial data population after schema creation

### Data Loaded

1. **mst_division** - 14 divisions
2. **mst_machine** - 15 machines
3. **mst_employee** - Hundreds of employees from PGE

### Employee Data Format

```sql
INSERT INTO mst_employee (employee_id, emp_code, emp_name, home_division_id, ...) VALUES
  (1, 'A0001', 'LIM YIN SEN', 1, 'A', '10001', 1, 0, '2026-05-29T18:56:05.235Z'),
  (2, 'A0012', 'MUJI WIDODO', 1, 'A', '10012', 1, 0, '2026-05-29T18:56:05.235Z'),
  ...
```

---

## Migration v3_final: Final Production Schema (2026-05-30)

**File:** `migration_v3_final.sql`  
**Purpose:** Final production schema for extend_db_ptrj

### Tables Created

1. **mst_division** -14 divisions
2. **mst_machine** - 8 accessible machines
3. **mst_employee** - Employee master
4. **mst_employee_family** - Family members
5. **attendance_holiday** - Holidays
6. **attendance_work_config** - Work hours
7. **attendance_scan_log** - Raw scans with indexes
8. **employee_attendance_daily** - Daily aggregation
9. **attendance_sorting_result** - Division sorting
10. **attendance_manual_input** - Manual entries

### Indexes Created

```sql
-- attendance_scan_log
CREATE INDEX IX_scan_log_emp_date ON attendance_scan_log(emp_code, work_date);
CREATE INDEX IX_scan_log_date ON attendance_scan_log(work_date);

-- employee_attendance_daily
CREATE INDEX IX_daily_work_date ON employee_attendance_daily(work_date);
CREATE INDEX IX_daily_final_division ON employee_attendance_daily(final_division_id, work_date);
```

---

## Schema Evolution Summary

### Phase 1: Basic Attendance (v1)
- Simple import tables
- Basic division mapping
- Machine configuration

### Phase 2: Employee Focus (v2)
- Employee master with home division
- Division sorting rules
- Cross-division scan detection
- Manual input types

### Phase 3: Production Ready (v3)
- Stored procedures for aggregation
- Audit trail improvements
- Performance indexes
- Lookup tables for types

---

## Current State (2026-05-29)

### Primary Database
- **extend_db_ptrj** on **SERVER_PROFILE_1**

### Active Tables
- absen_import (immutable)
- absen_machine_input (mutable)
- absen_import_batch
- absen_change_log
- absen_config
- absen_sync_log
- mst_division
- mst_machine
- mst_employee
- attendance_scan_log
- employee_attendance_daily
- attendance_sorting_result
- attendance_manual_input
- attendance_work_config
- attendance_holiday

### Reference Tables
- attendance_sorting_status
- attendance_attendance_type
- attendance_manual_type

---

## Running Migrations

### Recommended Order

```bash
# 1. Run schema.sql first
# 2. Then run v3_final for production tables
# 3. Then run v3_seed for seed data
# 4. Finally run migration_execute for initial data
```

### Verification

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables WHERE table_schema = 'dbo';

-- Check row counts
SELECT 'mst_division' AS tbl, COUNT(*) AS cnt FROM mst_division
UNION ALL SELECT 'mst_machine', COUNT(*) FROM mst_machine
UNION ALL SELECT 'mst_employee', COUNT(*) FROM mst_employee
UNION ALL SELECT 'attendance_work_config', COUNT(*) FROM attendance_work_config
UNION ALL SELECT 'attendance_holiday', COUNT(*) FROM attendance_holiday;
```
