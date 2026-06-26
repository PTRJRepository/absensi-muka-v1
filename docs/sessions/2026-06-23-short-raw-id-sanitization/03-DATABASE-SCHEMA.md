# Database Schema

## Database Targets

| Database | Server | Connection | Status |
|----------|--------|-----------|--------|
| `rebinmas_absensi_monitoring` | 10.0.0.110 | Direct MSSQL (src/lib/db.ts) | **PRIMARY** |
| `db_ptrj` | DESKTOP-U5GUJPG | Linked Server | HR Source of Truth |
| `extend_db_ptrj` | 10.0.0.110:8001 | SqlClient HTTP | **LEGACY — jangan gunakan** |

---

## db_ptrj — HR Source of Truth

**Server**: DESKTOP-U5GUJPG
**Database**: DB_PTRJ

```
HR_EMPLOYEE (single source of truth for employee data)
├── EmpCode   NVARCHAR  — Canonical employee code (e.g., 'A0044')
├── EmpName   NVARCHAR  — Employee full name
├── LocCode   NVARCHAR  — Location code (e.g., 'A', 'C', 'L')
└── Status    NVARCHAR  — '1' = Active, '4' = Inactive/Other
```

**Penting**: Semua employee code di sistem harus ada di `db_ptrj.HR_EMPLOYEE` dengan `Status IN ('1', '4')`.

---

## rebinmas_absensi_monitoring — Primary DB

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `employees` | Employee master | id, employee_code, employee_name, division_id |
| `divisions` | Division master | id, division_code, division_name |
| `gangs` | Gang/team master | id, gang_code, gang_name, division_id |
| `roles` | User roles | id, name |
| `users` | User accounts | id, username, password_hash, email |

### Scanner & Location

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `attendance_machines` | Machine inventory | id, machine_code, machine_name, ip_address, port, is_active |
| `scanner_codes` | Scanner code mapping | id, scanner_code, loc_code, division_id |
| `loc_codes` | Location codes | id, loc_code, loc_name, division_id |

### Attendance Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `attendance_scan_logs` | **Raw scan logs** (entry point) | id, raw_device_user_id, machine_code, scan_time, mapping_status, parsed_employee_code |
| `attendance_imports` | **Processed attendance** | id, employee_code, attendance_date, attendance_status, source |
| `attendance_import_batches` | Batch tracking | id, batch_code, machine_code, status, started_at |
| `attendance_manual_corrections` | Admin overrides | id, employee_code, work_date, correction_type |

### Mapping Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `zkteco_absensi_user_registry` | **Canonical per raw ID** (NEW — migration 041) | raw_device_user_id, parsed_employee_code, hr_employee_code, mapping_status, machine_count |
| `zkteco_absensi_user_machine` | **Per-machine registry** (NEW — migration 041) | registry_id, machine_code, raw_device_user_id, scan_count |
| `zkteco_hr_employee_map` | ZKTeco to HR mapping | machine_code, zkteco_user_id, zkteco_user_name, hr_employee_code, hr_employee_name |
| `machine_user_map` | Device user to employee | machine_id, machine_user_id, emp_code, confidence_score |
| `employee_mapping_overrides` | Manual overrides | machine_code, zkteco_user_id, employee_code |

### Audit & Config

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `attendance_change_logs` | Audit trail | entity_type, action, old_value, new_value, changed_by |
| `attendance_sync_logs` | Sync history | machine_code, sync_type, status, records_count |
| `machine_connection_logs` | Machine health | machine_code, connection_status, error_message |
| `app_configs` | Configuration | config_key, config_value |
| `holidays` | Holiday calendar | holiday_date, holiday_name |
| `shifts` | Shift definitions | shift_name, start_time, end_time |
| `employee_schedules` | Employee schedules | employee_code, shift_id, effective_date |

---

## attendance_scan_logs Schema

**Entry point** — semua scan dari ZKTeco masuk di sini.

```sql
CREATE TABLE dbo.attendance_scan_logs (
  id                BIGINT IDENTITY(1,1) PRIMARY KEY,
  raw_device_user_id NVARCHAR(100) NOT NULL,  -- e.g., '5000040', '0010097'
  machine_code      NVARCHAR(30) NOT NULL,     -- e.g., 'P1A', 'IJL'
  scan_time         DATETIME2 NOT NULL,        -- UTC timestamp
  scan_date         AS (CAST(scan_time AS DATE)) PERSISTED,  -- computed
  parsed_employee_code NVARCHAR(30) NULL,      -- e.g., 'C0040', 'L0097'
  parsed_division_code NVARCHAR(20) NULL,      -- e.g., 'C', 'L'
  mapping_status    NVARCHAR(20) NOT NULL DEFAULT 'NEED_REVIEW',
  mapping_reason    NVARCHAR(500) NULL,
  created_at        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_scan_log_unique UNIQUE (machine_code, raw_device_user_id, scan_time)
);
```

### mapping_status Values

| Status | Arti |
|--------|------|
| `MAPPED` | Berhasil di-mapping ke employee code valid |
| `NEED_REVIEW` | Parsing berhasil tapi perlu review manual |
| `UNMAPPED` | Short ID, no prefix, atau tidak ditemukan di HR |
| `EXCLUDED` | Short ID yang dikecualikan |

### Important Indexes

```sql
CREATE INDEX idx_scan_logs_date ON attendance_scan_logs(scan_date, machine_code);
CREATE INDEX idx_scan_logs_device ON attendance_scan_logs(raw_device_user_id);
CREATE INDEX idx_scan_logs_parsed ON attendance_scan_logs(parsed_employee_code);
CREATE INDEX idx_scan_logs_status ON attendance_scan_logs(mapping_status);
```

---

## zkteco_absensi_user_registry Schema (NEW)

**Canonical deduplication** — 1 raw_device_user_id = 1 entry global (bukan per mesin).

```sql
CREATE TABLE dbo.zkteco_absensi_user_registry (
  id                      BIGINT IDENTITY(1,1) PRIMARY KEY,
  raw_device_user_id      NVARCHAR(100) NOT NULL,
  raw_id_length           INT NOT NULL,
  id_category             NVARCHAR(30) NOT NULL,  -- 'LONG' / 'SHORT'
  scanner_prefix          NVARCHAR(3) NULL,       -- '001', '100', '500', etc.
  parsed_employee_code    NVARCHAR(30) NULL,      -- e.g., 'C0040'
  parsed_division_code    NVARCHAR(20) NULL,       -- e.g., 'C'
  hr_employee_code        NVARCHAR(30) NULL,       -- from db_ptrj lookup
  hr_employee_name        NVARCHAR(150) NULL,
  hr_loc_code             NVARCHAR(20) NULL,
  hr_status               NVARCHAR(20) NULL,
  mapping_status          NVARCHAR(30) NOT NULL,   -- 'MAPPED' / 'NEED_REVIEW' / 'UNMAPPED'
  mapping_reason          NVARCHAR(500) NULL,
  machine_count           INT NOT NULL DEFAULT 0,  -- berapa mesin kartu ini terdaftar
  scan_count              BIGINT NOT NULL DEFAULT 0,
  first_seen_at           DATETIME2 NULL,
  last_seen_at            DATETIME2 NULL,
  sample_zkteco_user_name NVARCHAR(200) NULL,
  is_active               BIT NOT NULL DEFAULT 1,
  created_at              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at              DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_zkteco_absensi_user_registry_raw UNIQUE (raw_device_user_id)
);
```

**Indexes**:

```sql
CREATE INDEX ix_absensi_user_registry_hr_code ON dbo.zkteco_absensi_user_registry(hr_employee_code);
CREATE INDEX ix_absensi_user_registry_parsed_code ON dbo.zkteco_absensi_user_registry(parsed_employee_code);
```

---

## Views

| View | Purpose | Used By |
|------|---------|---------|
| `vw_attendance_monthly_matrix` | Monthly attendance grid | Daily endpoint, Summary |
| `vw_attendance_zkteco_final` | ZKTeco direct scans | Monthly matrix |
| `vw_attendance_monthly_summary_v2` | Aggregated summary | Monthly summary |
| `vw_attendance_final` | Final attendance | Reports |
| `vw_attendance_summary` | Summary stats | Dashboard |
| `vw_attendance_intelligence` | Intelligence layer | Analytics, anomaly detection |

---

## Data Flow Diagram

```
raw_device_user_id masuk
         │
    ┌────┴────┐
    │ length? │
    └────┬────┘
         │
    ┌────┴────┐
    │ ≤5      │ >5
    │ short   │ long
    └────┬────┘
         │
    ┌────┴────┐
    │EXCLUDED│ registry deduplicate
    │(no auto│         │
    │ mapping)│         ▼
    └─────────┘  ┌──────────────┐
                 │ parse prefix │
                 │ → locCode    │
                 │ → last 4     │
                 └──────┬───────┘
                        │
                        ▼
              ┌──────────────────┐
              │ db_ptrj.HR_EMPLOYEE│
              │ lookup by EmpCode  │
              └──────┬─────────────┘
                     │
              ┌──────┴──────┐
              │ found?      │
              └──────┬──────┘
                     │
              ┌──────┴──────┐
              │yes          │no
              │MAPPED       │NEED_REVIEW
              └─────────────┘
```

---

## Schema Differences

| Aspect | rebinmas_absensi_monitoring | extend_db_ptrj |
|--------|---------------------------|----------------|
| Employee Code | `employee_code NVARCHAR(30)` | `emp_code NVARCHAR(50)` |
| Employee ID | `id INT IDENTITY` | `employee_id INT` |
| Machine Code | `machine_code NVARCHAR(30)` | `machine_code NVARCHAR(20)` |
| Raw Scan ID | `id BIGINT` | `scan_id BIGINT` |
| Attendance Date | `attendance_date DATE` | `work_date DATE` |
