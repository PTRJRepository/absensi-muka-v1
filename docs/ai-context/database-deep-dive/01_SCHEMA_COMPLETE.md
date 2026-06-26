# 01_SCHEMA_COMPLETE.md

# Complete Database Schema - PT Rebinmas Jaya Absensi System

## Overview

Database: `extend_db_ptrj` via SQL Server HTTP Gateway  
Server: `SERVER_PROFILE_1`  
Gateway URL: `http://10.0.0.110:8001/v1/query`

---

## Core Tables

### 1. absen_import (IMUTABLE - Data dari Mesin/API)

Raw attendance data from ZKTeco machines and IT Solution API. **Cannot be edited or deleted.**

```sql
CREATE TABLE absen_import (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    emp_code            NVARCHAR(50) NOT NULL,
    emp_name            NVARCHAR(255),
    gang_code           NVARCHAR(50),
    division            NVARCHAR(50) NOT NULL,
    year                INT NOT NULL,
    month               INT NOT NULL,
    day INT NOT NULL,
    has_work            BIT DEFAULT 0,
    is_sunday           BIT DEFAULT 0,
    is_holiday          BIT DEFAULT 0,
    holiday_desc        NVARCHAR(255),
    is_cuti             BIT DEFAULT 0,
    is_sakit BIT DEFAULT 0,
    task_code           NVARCHAR(50),
    ot_hours            DECIMAL(5,2) DEFAULT 0,
    attendance_date     DATE NOT NULL,
    import_batch_id     NVARCHAR(100),
    imported_at         DATETIME DEFAULT GETDATE(),
    source NVARCHAR(50) DEFAULT 'MACHINE',
    is_locked           BIT DEFAULT 1,
    UNIQUE (emp_code, division, year, month, day, import_batch_id)
);
```

**Columns:**
| Column | Type | Description |
|--------|------|-------------|
| id | INT | Auto-increment primary key |
| emp_code | NVARCHAR(50) | Employee code (e.g., A0129, L10002) |
| emp_name | NVARCHAR(255) | Employee name |
| gang_code | NVARCHAR(50) | Gang/work group code |
| division | NVARCHAR(50) | Division code (PG1A, DME, ARE, etc.) |
| year, month, day | INT | Date components |
| has_work | BIT | 1 = worked that day |
| is_sunday | BIT | 1 = Sunday |
| is_holiday | BIT | 1 = holiday |
| holiday_desc | NVARCHAR(255) | Holiday description |
| is_cuti | BIT | 1 = on leave |
| is_sakit | BIT | 1 = sick |
| task_code | NVARCHAR(50) | Task assignment code |
| ot_hours | DECIMAL(5,2) | Overtime hours |
| attendance_date | DATE | Full date |
| import_batch_id | NVARCHAR(100) | Links to batch import |
| imported_at | DATETIME | Import timestamp |
| source | NVARCHAR(50) | MACHINE or API |
| is_locked | BIT | Always 1 (immutable flag) |

---

### 2. absen_machine_input (MUTABLE - Koreksi Manual)

Manual corrections and overrides. **Can be inserted, updated, or deleted.**

```sql
CREATE TABLE absen_machine_input (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code            NVARCHAR(50) NOT NULL,
    emp_name            NVARCHAR(255),
    gang_code           NVARCHAR(50),
    division            NVARCHAR(50) NOT NULL,
    year                INT NOT NULL,
    month               INT NOT NULL,
    day INT NOT NULL,
    has_work            BIT DEFAULT 0,
    is_sunday           BIT DEFAULT 0,
    is_holiday          BIT DEFAULT 0,
    holiday_desc        NVARCHAR(255),
    is_cuti             BIT DEFAULT 0,
    is_sakit            BIT DEFAULT 0,
    task_code           NVARCHAR(50),
    ot_hours            DECIMAL(5,2) DEFAULT 0,
    attendance_date     DATE NOT NULL,
    input_type          NVARCHAR(20) DEFAULT 'MANUAL',
    created_at          DATETIME DEFAULT GETDATE(),
    updated_at          DATETIME DEFAULT GETDATE(),
    created_by          NVARCHAR(100),
    notes               NVARCHAR(500),
    UNIQUE (emp_code, division, year, month, day)
);
```

**Columns:**
| Column | Type | Description |
|--------|------|-------------|
| id | INT | Auto-increment primary key |
| emp_code | NVARCHAR(50) | Employee code |
| input_type | NVARCHAR(20) | MANUAL, CORRECTION, etc. |
| created_at | DATETIME | Record creation time |
| updated_at | DATETIME | Last modification time |
| created_by | NVARCHAR(100) | User who created |
| notes | NVARCHAR(500) | Optional notes |

---

### 3. absen_import_batch

Tracks each import batch operation.

```sql
CREATE TABLE absen_import_batch (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    batch_id            NVARCHAR(100) UNIQUE NOT NULL,
    division            NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month               INT NOT NULL,
    total_records       INT DEFAULT 0,
    imported_records    INT DEFAULT 0,
    status              NVARCHAR(50) DEFAULT 'PENDING',
    import_started_at   DATETIME DEFAULT GETDATE(),
    import_completed_at DATETIME,
    error_message       NVARCHAR(MAX),
    imported_by         NVARCHAR(100) DEFAULT 'SYSTEM'
);
```

**Status Values:**
- `PENDING` - Batch created, not started
- `IN_PROGRESS` - Currently importing
- `COMPLETED` - Successfully completed
- `COMPLETED_WITH_ERRORS` - Completed with some errors
- `FAILED` - Import failed

---

### 4. absen_change_log

Audit trail for all changes to mutable tables.

```sql
CREATE TABLE absen_change_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code            NVARCHAR(50) NOT NULL,
    division            NVARCHAR(50) NOT NULL,
    year                INT NOT NULL,
    month               INT NOT NULL,
    day                 INT NOT NULL,
    field_name          NVARCHAR(50),
    old_value           NVARCHAR(MAX),
    new_value           NVARCHAR(MAX),
    change_type         NVARCHAR(20) NOT NULL,
    source_table        NVARCHAR(50),
    changed_by          NVARCHAR(100),
    changed_at          DATETIME DEFAULT GETDATE()
);
```

**change_type Values:**
- `ADD` - New record inserted
- `EDIT` - Existing record modified
- `DELETE` - Record deleted

---

### 5. absen_config

System configuration key-value store.

```sql
CREATE TABLE absen_config (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    config_key          NVARCHAR(100) UNIQUE NOT NULL,
    config_value        NVARCHAR(MAX),
    description         NVARCHAR(500),
    updated_at          DATETIME DEFAULT GETDATE()
);
```

**Default Configs:**
| Key | Value | Description |
|-----|-------|-------------|
| sync_interval_minutes | 15 | Sync interval in minutes |
| last_sync | NULL | Last sync timestamp |
| sync_enabled | true | Enable auto sync |
| api_base_url | http://10.0.0.110:5176 | IT Solution API URL |

---

### 6. absen_sync_log

Logs each sync operation.

```sql
CREATE TABLE absen_sync_log (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    sync_date           DATETIME DEFAULT GETDATE(),
    division            NVARCHAR(50),
    year                INT,
    month               INT,
    mode                NVARCHAR(10),
    records_synced      INT DEFAULT 0,
    status              NVARCHAR(50) DEFAULT 'SUCCESS',
    error_message       NVARCHAR(MAX),
    duration_ms         INT DEFAULT 0
);
```

---

## Master Tables (v2/v3 Schema)

### 7. mst_division

```sql
CREATE TABLE mst_division (
    division_id         INT IDENTITY(1,1) PRIMARY KEY,
    division_code       NVARCHAR(20) UNIQUE NOT NULL,
    division_name       NVARCHAR(100) NOT NULL,
    loc_code            CHAR(1) NOT NULL,
    emp_code_prefix     CHAR(1) NOT NULL,
    is_active           BIT DEFAULT 1,
    created_at          DATETIME DEFAULT GETDATE(),
    updated_at          DATETIME DEFAULT GETDATE()
);
```

**14 Divisions:**
| Code | Name | Loc | Prefix |
|------|------|-----|--------|
| PG1A | Parit Gunung Estate 1A | A | A |
| PG1B | Parit Gunung Estate 1B | B | B |
| PG2A | Parit Gunung Estate 2A | C | C |
| PG2B | Parit Gunung Estate 2B | D | D |
| DME | Darul Makmur Estate | E | E |
| ARA | ARA Estate | F | F |
| ARB1 | Air Ruak Estate B1 | G | G |
| ARB2 | Air Ruak Estate B2 | H | H |
| AREC | Air Ruak Estate A/C | J | J |
| IJL | Impian Jaya Lestari | L | L |
| INFRA | Infrastruktur | I | I |
| STF | Staff / Kantor | S | S |
| SEC | Security | K | K |
| MGM | Management | M | M |

---

### 8. mst_machine

```sql
CREATE TABLE mst_machine (
    machine_id          INT IDENTITY(1,1) PRIMARY KEY,
    machine_code        NVARCHAR(20) UNIQUE NOT NULL,
    machine_name        NVARCHAR(100) NOT NULL,
    ip_address          NVARCHAR(50),
    port                INT DEFAULT 4370,
    location            NVARCHAR(100),
    division_id         INT,
    machine_type        NVARCHAR(20) DEFAULT 'ZKTECO',
    is_active           BIT DEFAULT 1,
    last_online_at      DATETIME,
    created_at          DATETIME DEFAULT GETDATE(),
    updated_at          DATETIME DEFAULT GETDATE()
);
```

**machine_type Values:**
- `ZKTECO` - Direct ZKTeco connection
- `API` - IT Solution API only

---

### 9. mst_employee

```sql
CREATE TABLE mst_employee (
    employee_id         INT IDENTITY(1,1) PRIMARY KEY,
    emp_code            NVARCHAR(50) UNIQUE NOT NULL,
    emp_name            NVARCHAR(100),
    home_division_id    INT,
    machine_user_id     INT NULL,
    machine_id          INT NULL,
    is_active           BIT DEFAULT 1,
    created_at          DATETIME DEFAULT GETDATE(),
    updated_at          DATETIME DEFAULT GETDATE()
);
```

---

### 10. attendance_scan_log

Raw scan events from machines.

```sql
CREATE TABLE attendance_scan_log (
    scan_id             BIGINT IDENTITY(1,1) PRIMARY KEY,
    emp_code            NVARCHAR(50) NOT NULL,
    work_date           DATE NOT NULL,
    scan_time           DATETIME NOT NULL,
    machine_id          INT NULL,
    scan_division_id    INT NULL,
    raw_source          NVARCHAR(20) DEFAULT 'ZKTECO',
    raw_device_user_id  INT NULL,
    raw_device_sn       NVARCHAR(100) NULL,
    created_at          DATETIME DEFAULT GETDATE()
);
```

**Indexes:**
```sql
CREATE INDEX IX_scan_log_emp_date ON attendance_scan_log(emp_code, work_date);
CREATE INDEX IX_scan_log_date ON attendance_scan_log(work_date);
CREATE INDEX IX_scan_log_machine ON attendance_scan_log(machine_id);
```

---

### 11. employee_attendance_daily

1 row per employee per day (aggregated).

```sql
CREATE TABLE employee_attendance_daily (
    daily_id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id         INT NOT NULL,
    emp_code            NVARCHAR(50) NOT NULL,
    work_date           DATE NOT NULL,
    first_scan_time     DATETIME NULL,
    last_scan_time      DATETIME NULL,
    scan_count          INT DEFAULT 0,
    scan_machines       NVARCHAR(500) NULL,
    work_duration_minutes INT NULL,
    estimated_duration_minutes INT NULL,
    is_duration_estimated BIT DEFAULT 0,
    overtime_minutes    INT DEFAULT 0,
    is_overtime         BIT DEFAULT 0,
    home_division_id    INT NULL,
    final_division_id   INT NOT NULL,
    scan_division_id    INT NULL,
    is_cross_division_scan BIT DEFAULT 0,
    cross_division_note NVARCHAR(500) NULL,
    attendance_status  NVARCHAR(20) NOT NULL,
    note                NVARCHAR(500) NULL,
    source              NVARCHAR(20) DEFAULT 'MACHINE',
    created_at          DATETIME DEFAULT GETDATE(),
    updated_at          DATETIME DEFAULT GETDATE()
);
```

**attendance_status Values:**
- `PRESENT` - Normal attendance
- `ABSENT` - No attendance
- `SINGLE_SCAN` - Only one scan (duration estimated)
- `MANUAL_INPUT` - Manual input override

**Indexes:**
```sql
CREATE INDEX IX_daily_work_date ON employee_attendance_daily(work_date);
CREATE INDEX IX_daily_final_division ON employee_attendance_daily(final_division_id, work_date);
```

---

### 12. attendance_sorting_result

Division sorting audit trail.

```sql
CREATE TABLE attendance_sorting_result (
    sorting_id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    process_id          BIGINT NOT NULL,
    employee_id         INT NOT NULL,
    emp_code            NVARCHAR(50) NOT NULL,
    work_date           DATE NOT NULL,
    machine_id          INT NULL,
    scan_division_id    INT NULL,
    home_division_id    INT NULL,
    final_division_id   INT NOT NULL,
    sorting_status      NVARCHAR(50) NOT NULL,
    sorting_rule        NVARCHAR(100) NOT NULL,
    is_cross_division_scan BIT DEFAULT 0,
    need_review         BIT DEFAULT 0,
    note NVARCHAR(500) NULL,
    sorted_by           NVARCHAR(100) DEFAULT 'SYSTEM',
    sorted_at           DATETIME DEFAULT GETDATE()
);
```

**sorting_status Values:**
- `MATCH_HOME_DIVISION` - Scan matches home division
- `CROSS_DIVISION_MOVED` - Cross-division scan, moved to home
- `NO_HOME_DIVISION` - Employee has no home division
- `UNMAPPED_EMPLOYEE` - Cannot map to employee
- `MANUAL_OVERRIDE` - Manual override by admin

---

### 13. attendance_manual_input

Manual attendance entries (sick, permit, assignment).

```sql
CREATE TABLE attendance_manual_input (
    input_id            INT IDENTITY(1,1) PRIMARY KEY,
    emp_code            NVARCHAR(50) NOT NULL,
    work_date           DATE NOT NULL,
    attendance_type    NVARCHAR(20) NOT NULL,
    start_time          DATETIME NULL,
    end_time            DATETIME NULL,
    duration_minutes    INT NULL,
    note                NVARCHAR(500) NULL,
    approved_by         NVARCHAR(100),
    created_by          NVARCHAR(100),
    created_at          DATETIME DEFAULT GETDATE(),
    updated_at          DATETIME DEFAULT GETDATE(),
    is_active           BIT DEFAULT 1
);
```

**attendance_type Values:**
- `SICK` - Sick leave
- `PERMIT` - Permit/leave
- `ASSIGNMENT` - Out-of-location assignment
- `HOLIDAY` - Holiday/cuti
- `OTHER` - Other
- `IN` - Check-in only
- `OUT` - Check-out only
- `CORRECTION` - Attendance correction

---

### 14. attendance_work_config

Standard work hours configuration.

```sql
CREATE TABLE attendance_work_config (
    config_id           INT IDENTITY(1,1) PRIMARY KEY,
    day_of_week          INT NOT NULL,
    standard_hours       DECIMAL(4,2) NOT NULL,
    description NVARCHAR(100),
    is_active            BIT DEFAULT 1,
    updated_at           DATETIME DEFAULT GETDATE()
);
```

**Default Configuration:**
| day_of_week | standard_hours | description |
|-------------|----------------|-------------|
| 0 (Sunday) | 0 | Sunday - Libur |
| 1 (Monday) | 7.00 | Monday - 7 jam |
| 2 (Tuesday) | 7.00 | Tuesday - 7 jam |
| 3 (Wednesday) | 7.00 | Wednesday - 7 jam |
| 4 (Thursday) | 7.00 | Thursday - 7 jam |
| 5 (Friday) | 5.00 | Friday - 5 jam |
| 6 (Saturday) | 0 | Saturday - Libur |

---

### 15. attendance_holiday

Holiday schedule.

```sql
CREATE TABLE attendance_holiday (
    holiday_id          INT IDENTITY(1,1) PRIMARY KEY,
    holiday_date       DATE UNIQUE NOT NULL,
    holiday_name       NVARCHAR(100) NOT NULL,
    is_national        BIT DEFAULT 0,
    division_id        INT NULL,
    created_at         DATETIME DEFAULT GETDATE()
);
```

---

###16. mst_employee_family

Employee family members for benefits.

```sql
CREATE TABLE mst_employee_family (
    family_id          INT IDENTITY(1,1) PRIMARY KEY,
    employee_id         INT NOT NULL,
    family_name         NVARCHAR(100) NOT NULL,
    relationship        NVARCHAR(20),
    id_number           NVARCHAR(50),
    phone               NVARCHAR(20),
    is_dependent        BIT DEFAULT 0,
    created_at          DATETIME DEFAULT GETDATE()
);
```

---

## Constraints Summary

### Unique Constraints
- `absen_import`: (emp_code, division, year, month, day, import_batch_id)
- `absen_machine_input`: (emp_code, division, year, month, day)
- `mst_division`: division_code
- `mst_machine`: machine_code
- `mst_employee`: emp_code
- `attendance_holiday`: holiday_date
- `attendance_work_config`: day_of_week
- `employee_attendance_daily`: (emp_code, work_date)

### Foreign Keys
- `mst_machine.division_id` -> `mst_division.division_id`
- `mst_employee.home_division_id` -> `mst_division.division_id`
- `mst_employee.machine_id` -> `mst_machine.machine_id`
- `attendance_scan_log.machine_id` -> `mst_machine.machine_id`
- `attendance_scan_log.scan_division_id` -> `mst_division.division_id`
- `employee_attendance_daily.employee_id` -> `mst_employee.employee_id`
- `employee_attendance_daily.final_division_id` -> `mst_division.division_id`
- `attendance_sorting_result.daily_id` -> `employee_attendance_daily.daily_id`
