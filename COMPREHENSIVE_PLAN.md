# COMPREHENSIVE PLAN: Palm Oil Plantation Attendance Monitoring Dashboard

**Project:** PT Rebinmas Jaya - Sistem Absensi Monitoring
**Date:** 2026-06-18
**Database:** `rebinmas_absensi_monitoring` on `10.0.0.110:1433`

---

## EXECUTIVE SUMMARY

This plan outlines the development of a comprehensive real-time attendance monitoring dashboard for 16 ZKTeco fingerprint machines deployed across palm oil plantation estates. The system will provide real-time machine status monitoring, employee ID mapping, division attendance analysis, and data quality dashboards.

---

## PART 1: EXPLORATION FINDINGS

### 1.1 Database Schema (VERIFIED)

#### Core Tables

**attendance_machines** (16 machines)
```sql
- id: int (PK)
- machine_code: nvarchar (e.g., "AB1", "P1A", "DME_01")
- location_name: nvarchar (e.g., "AB1", "PG1A")
- ip_address: nvarchar (e.g., "103.144.208.154")
- port: int (e.g., 4370, 4400, 4900)
- access_status: nvarchar ("ACCESSIBLE", "BLOCKED")
- data_source: nvarchar ("DIRECT_ZKTECO", "API")
- loc_code: nvarchar (e.g., "A", "B", "H")
- scanner_code: int (100, 200, 300, 400, 500, 600, 700, 800, 900)
- last_sync_at: datetime2
- last_error_message: nvarchar
```

**attendance_scan_logs** (377,527+ records)
```sql
- id: bigint (PK)
- machine_code: nvarchar
- raw_device_user_id: nvarchar (e.g., "10140", "10125")
- raw_user_sn: nvarchar
- parsed_employee_code: nvarchar (e.g., "A0150", "B0232")
- parsed_division_code: nvarchar (e.g., "P1A", "AB1")
- mapping_status: nvarchar ("MAPPED", "UNMAPPED", "NEED_REVIEW")
- mapping_reason: nvarchar
- scan_time: datetime2
- scan_date: date
- event_type: nvarchar
- verify_type: nvarchar
- sync_batch_id: bigint
```

**employees**
```sql
- id: int (PK)
- employee_code: nvarchar (e.g., "A0150", "A0234")
- employee_name: nvarchar
- division_id: int (FK to divisions.id)
- is_active: bit
```

**divisions**
```sql
- id: int (PK)
- division_code: nvarchar (e.g., "AB1", "P1A", "PGE")
- division_name: nvarchar
```

**attendance_import_batches**
```sql
- id: bigint (PK)
- batch_code: nvarchar
- machine_id: int
- status: nvarchar ("RUNNING", "SUCCESS", "FAILED")
- records_total: int
- records_success: int
- records_failed: int
- started_at: datetime2
- finished_at: datetime2
- error_message: nvarchar
```

**attendance_sync_logs**
```sql
- id: bigint (PK)
- machine_code: nvarchar
- status: nvarchar
- failure_category: nvarchar
- started_at: datetime2
- finished_at: datetime2
- duration_ms: int
- records_synced: int
- error_message: nvarchar
```

**employee_mapping_overrides** (manual overrides)
```sql
- id: int (PK)
- raw_device_id: varchar
- machine_code: varchar
- employee_code: varchar
- mapped_by: varchar
- created_at: datetime
```

**scanner_codes** (mapping table)
| scanner_code | division_code | description |
|--------------|---------------|-------------|
| 100 | P1A | P1A scanner |
| 200 | ARC | ARC scanner |
| 300 | P1B | P1B scanner |
| 400 | AB2 | AB2 scanner |
| 500 | P2A | P2A scanner |
| 600 | P2B | P2B scanner |
| 700 | DME | DME scanner |
| 800 | ARA | ARA scanner |
| 900 | AB1 | AB1 scanner |

**loc_codes** (location to employee code prefix)
| loc_code | division_code | emp_code_prefix |
|----------|---------------|-----------------|
| A | P1A | A |
| B | P1B | B |
| C | P2A | C |
| D | P2B | D |
| E | DME | E |
| F | ARA | F |
| G | AB1 | G |
| H | AB2 | H |
| J | ARC | J |
| L | IJL | L |

### 1.2 Machine Inventory

**Accessible Machines (10 machines - TCP connection possible):**
| Machine Code | IP | Port | Type | Scanner | Loc |
|--------------|-----|------|------|---------|-----|
| P1A | 10.0.0.90 | 4100 | ZKTeco | 100 | A |
| P1B | 10.0.0.91 | 4300 | ZKTeco | 300 | B |
| AB2 | 103.144.208.154 | 4400 | ZKTeco | 400 | H |
| AB1 | 103.144.208.154 | 4900 | ZKTeco | 900 | G |
| ARA | 103.144.208.154 | 4800 | ZKTeco | 800 | F |
| ARC_01 | 103.144.208.154 | 4200 | ZKTeco | 200 | J |
| ARC_02 | 103.144.208.154 | 4201 | ZKTeco | 200 | J |
| DME_01 | 103.144.228.42 | 4700 | ZKTeco | 700 | E |
| DME_02 | 103.144.228.42 | 4701 | ZKTeco | 700 | E |
| MILL | 103.127.66.32 | 4370 | ZKTeco | - | - |
| OFFICE_APE | 103.144.208.154 | 4370 | ZKTeco | - | - |
| ARE | 103.144.208.154 | 4370 | ZKTeco | - | - |
| IJL | 103.144.211.226 | 4370 | ZKTeco | - | L |
| PGE | 223.25.98.220 | 4370 | ZKTeco | - | A |
| P2A | 10.0.0.92 | 4500 | ZKTeco | 500 | C |
| P2B | 10.0.0.93 | 4600 | ZKTeco | 600 | D |

### 1.3 Employee ID Mapping Rules

**Current Mapping Logic (from `src/modules/mapping/employee-code-mapper.ts`):**

```
Input: raw_device_user_id (e.g., "10140")
Scanner Code: 100 (for P1A)
Loc Code: "A"

Algorithm:
1. Take last 4 digits of raw ID: "0140" (pad if needed: "0140")
2. Prepend loc_code prefix: "A0140"
3. Set mapping_status based on machine:
   - PGE/IJL/OFFICE_APE/ARE: "NEED_REVIEW" (requires HR confirmation)
   - Others: "MAPPED"

Result: employee_code = "A0140"
```

**Mapping Status Distribution:**
- MAPPED: 36,672 records
- NEED_REVIEW: 133,560 records
- UNMAPPED: 177,295 records

### 1.4 ZKTeco Integration

**Protocol:** TCP socket on configurable port (default 4370)
**Library:** `node-zklib@1.3.0`
**Connection Flow:**
```typescript
1. new ZKLib(ip, port, timeout, 4000, password)
2. createSocket() - async connection
3. getUsers() - fetch enrolled users
4. getAttendances() - fetch attendance records
5. disconnect()
```

**Record Format:**
```typescript
{
  deviceUserId: string | number,
  userSn: string | number,
  recordTime: string | Date,
  ip?: string,
  type?: string | number,
  verifyType?: string | number,
  workCode?: string | number
}
```

### 1.5 Current API Endpoints

**Existing Routes (verified working):**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/machines` | GET | List all machines with sync status |
| `/api/machines/:code/test-connection` | POST | Test ZKTeco connection |
| `/api/monitoring/machines` | GET | Machine list with today stats |
| `/api/monitoring/machine/:code` | GET | Single machine detail |
| `/api/monitoring/batches` | GET | Import batch list (paginated) |
| `/api/monitoring/batch/:id` | GET | Single batch detail |
| `/api/monitoring/quality` | GET | Data quality metrics |
| `/api/monitoring/division-summary` | GET | Monthly division attendance |
| `/api/monitoring/machine-ping` | POST | Ping all/single machine |
| `/api/monitoring/sync/:machineCode` | POST | Trigger sync for one machine |
| `/api/monitoring/sync-all` | POST | Trigger sync for all machines |
| `/api/monitoring/sync-status/:id` | GET | Check batch status |
| `/api/monitoring/employees/:code/map` | POST | Manual employee mapping |
| `/api/realtime/sync-status` | GET | SSE for sync events |
| `/api/realtime/live-feed` | GET | SSE for attendance feed |
| `/api/realtime/latest-scans` | GET | Latest scans (polling) |

---

## PART 2: EMPLOYEE ID PARSING/MAPPING ALGORITHM

### 2.1 Exact Mapping Rules

**Scanner Code Suffix → Division Mapping:**
```
Scanner 100 (suffix xxx00-xxx99) → P1A → locCode "A"
Scanner 200 (suffix xxx00-xxx99) → ARC → locCode "J"
Scanner 300 (suffix xxx00-xxx99) → P1B → locCode "B"
Scanner 400 (suffix xxx00-xxx99) → AB2 → locCode "H"
Scanner 500 (suffix xxx00-xxx99) → P2A → locCode "C"
Scanner 600 (suffix xxx00-xxx99) → P2B → locCode "D"
Scanner 700 (suffix xxx00-xxx99) → DME → locCode "E"
Scanner 800 (suffix xxx00-xxx99) → ARA → locCode "F"
Scanner 900 (suffix xxx00-xxx99) → AB1 → locCode "G"
```

**Employee Code Format:** `{locCode}{last4digits}`
- Example: raw "10140" from P1A → "A0140"
- Example: raw "30232" from P1B → "B0232"
- Example: raw "90058" from AB1 → "G0058"

**Special Machines (NEED_REVIEW status):**
- PGE: Office machine - multiple divisions possible
- IJL: Office machine - multiple divisions possible
- OFFICE_APE: Office machine - multiple divisions possible
- ARE: Area office - multiple divisions possible

### 2.2 Manual Override Flow

```typescript
// When user manually maps raw_id to employee_code:
// 1. Insert into employee_mapping_overrides
INSERT INTO employee_mapping_overrides (raw_device_id, machine_code, employee_code, mapped_by)
VALUES (@rawId, @machineCode, @employeeCode, 'manual')

// 2. Update existing unmapped scan logs
UPDATE attendance_scan_logs
SET parsed_employee_code = @employeeCode,
    mapping_status = 'MAPPED',
    mapping_reason = 'manual_override'
WHERE machine_code = @machineCode
  AND raw_device_user_id = @rawId
  AND mapping_status != 'MAPPED'
```

---

## PART 3: NEW API ENDPOINTS REQUIRED

### 3.1 Machine Real-Time Status API

**New: `GET /api/machines/real-time-status`**
```typescript
// Response
{
  machines: [
    {
      machine_code: string,
      ip_address: string,
      port: number,
      access_status: "ACCESSIBLE" | "BLOCKED",
      data_source: "DIRECT_ZKTECO" | "API",
      loc_code: string | null,
      scanner_code: number | null,
      // Real-time ping results
      reachable: boolean,
      latency_ms: number | null,
      ping_status: "ONLINE" | "OFFLINE" | "TIMEOUT",
      // Stats
      records_today: number,
      employees_today: number,
      // Sync info
      last_sync_at: string | null,
      last_error: string | null
    }
  ],
  summary: {
    total: number,
    online: number,
    offline: number,
    total_scans_today: number
  }
}
```

### 3.2 Machine Employee Browser API

**Enhanced: `GET /api/machines/:code/employees`**
```typescript
// Response - ADD new fields
{
  machine: { machine_code, location_name, ip_address, port, ... },
  summary: {
    total_unique_ids: number,
    mapped_count: number,
    unmapped_count: number,
    db_employees_seen: number,
    // NEW: mapping ratio
    mapped_percentage: number
  },
  // Existing sections
  machine_raw: [...],           // All unique raw IDs from machine
  database_mapped: [...],        // IDs with mapped employee codes
  unmapped: [...],              // IDs needing review
  db_employees: [...],          // Employees in DB who have records

  // NEW: Raw device users table (from machine, not database)
  machine_device_users: [
    {
      raw_id: string,
      employee_name: string | null,
      employee_code: string | null,
      division_code: string | null,
      total_scans: number,
      last_scan: string,
      mapping_status: "MAPPED" | "UNMAPPED" | "NEED_REVIEW",
      mapping_reason: string,
      // Manual mapping info if exists
      has_override: boolean,
      override_employee_code: string | null
    }
  ]
}
```

**New: `POST /api/machines/:code/device-users`**
```typescript
// Get raw device users from machine (via ZKTeco)
// Request
{ action: "fetch" | "refresh" }

// Response
{
  success: boolean,
  machine_code: string,
  device_users: [
    {
      user_id: string,
      user_sn: string | null,
      name: string | null,
      privilege: string | null,
      password: string | null,
      card_number: string | null
    }
  ],
  total_count: number,
  fetched_at: string
}
```

### 3.3 Machine Sync Control API

**Enhanced: `POST /api/machines/:code/sync`**
```typescript
// Request (optional)
{
  options: {
    fetchUsers: boolean,     // Default: false
    fetchAttendance: boolean, // Default: true
    clearAfterFetch: boolean  // Default: false
  }
}

// Response
{
  success: boolean,
  batch_id: number,
  batch_code: string,
  machine_code: string,
  status: "RUNNING" | "TRIGGERED",
  estimated_duration_ms: number,
  options: { ... }
}
```

**New: `GET /api/machines/:code/sync/progress`**
```typescript
// Response
{
  batch_id: number,
  status: "RUNNING" | "SUCCESS" | "FAILED",
  progress_percentage: number,
  records_fetched: number,
  records_imported: number,
  records_failed: number,
  started_at: string,
  estimated_completion: string | null,
  current_phase: "CONNECTING" | "FETCHING_USERS" | "FETCHING_ATTENDANCE" | "IMPORTING" | "COMPLETED"
}
```

### 3.4 Data Quality Dashboard API

**New: `GET /api/quality/dashboard-summary`**
```typescript
// Response
{
  overall_health: {
    score: number,           // 0-100
    grade: "A" | "B" | "C" | "D" | "F",
    trend: "improving" | "stable" | "declining"
  },
  mapping: {
    total_records: number,
    mapped: number,
    unmapped: number,
    need_review: number,
    mapped_percentage: number
  },
  volume: {
    today_scans: number,
    week_avg_scans: number,
    month_total_scans: number,
    trend: number[]          // Last 30 days daily counts
  },
  top_unmapped: [
    {
      raw_id: string,
      occurrence_count: number,
      machines: string[],
      last_seen: string,
      suggested_mapping: string | null
    }
  ],
  issues: [
    {
      type: "duplicate" | "missing" | "drift" | "error",
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      description: string,
      affected_count: number
    }
  ]
}
```

**New: `GET /api/quality/daily-trend`**
```typescript
// Query params
{
  from: string,  // ISO date
  to: string,   // ISO date
  groupBy: "day" | "week" | "month"
}

// Response
{
  data: [
    {
      date: string,
      total_scans: number,
      unique_employees: number,
      mapped_count: number,
      unmapped_count: number,
      per_division: {
        [division_code]: {
          scans: number,
          employees: number,
          mapped: number,
          unmapped: number
        }
      }
    }
  ],
  summary: {
    avg_daily_scans: number,
    avg_daily_employees: number,
    total_missing_data_days: number
  }
}
```

### 3.5 Division Analysis API

**Enhanced: `GET /api/divisions/:code/attendance`**
```typescript
// Query params
{
  year: number,
  month: number
}

// Response
{
  division: {
    code: string,
    name: string,
    total_employees: number,
    active_employees: number
  },
  summary: {
    total_records: number,
    present: number,
    absent: number,
    sick: number,
    leave: number,
    holiday: number,
    attendance_rate: number
  },
  daily_breakdown: [
    {
      date: string,
      total: number,
      present: number,
      absent: number,
      sick: number,
      leave: number,
      attendance_rate: number
    }
  ],
  employee_details: [
    {
      employee_code: string,
      employee_name: string,
      present_days: number,
      absent_days: number,
      sick_days: number,
      leave_days: number,
      attendance_rate: number,
      first_scan: string,
      last_scan: string
    }
  ]
}
```

**New: `GET /api/divisions/compare`**
```typescript
// Query params
{
  divisions: string[],  // Comma-separated division codes
  year: number,
  month: number
}

// Response
{
  divisions: [
    {
      code: string,
      name: string,
      total_records: number,
      attendance_rate: number,
      avg_daily_scans: number,
      top_employee: { code: string, name: string, scans: number } | null,
      problem_employees: [
        { code: string, name: string, absent_days: number }
      ]
    }
  ],
  comparison_metrics: {
    best_attendance: string,
    worst_attendance: string,
    most_active: string,
    needs_attention: string[]
  }
}
```

---

## PART 4: DATABASE QUERIES (VERIFIED)

### 4.1 Machine Status Query

```sql
-- Get all machines with today's scan stats
SELECT
  m.id,
  m.machine_code,
  m.location_name,
  m.ip_address,
  m.port,
  m.access_status,
  m.data_source,
  m.loc_code,
  m.scanner_code,
  m.last_sync_at,
  m.last_error_message,
  COALESCE(today.scans, 0) AS records_today,
  COALESCE(today.employees, 0) AS employees_today
FROM attendance_machines m
LEFT JOIN (
  SELECT
    machine_code,
    COUNT(*) AS scans,
    COUNT(DISTINCT parsed_employee_code) AS employees
  FROM attendance_scan_logs
  WHERE scan_date = CAST(GETDATE() AS DATE)
  GROUP BY machine_code
) today ON m.machine_code = today.machine_code
WHERE m.is_active = 1
ORDER BY m.machine_code;
```

### 4.2 Employee Mapping Status Query

```sql
-- Get mapping status for a specific machine
SELECT
  raw_device_user_id,
  parsed_employee_code,
  e.employee_name,
  d.division_code,
  COUNT(*) AS occurrence_count,
  MAX(scan_time) AS last_scan,
  mapping_status,
  mapping_reason,
  CASE WHEN ov.id IS NOT NULL THEN 1 ELSE 0 END AS has_override
FROM attendance_scan_logs s
LEFT JOIN employees e ON e.employee_code = s.parsed_employee_code
LEFT JOIN divisions d ON d.id = e.division_id
LEFT JOIN employee_mapping_overrides ov
  ON ov.raw_device_id = s.raw_device_user_id
  AND ov.machine_code = s.machine_code
WHERE s.machine_code = @machineCode
GROUP BY
  raw_device_user_id,
  parsed_employee_code,
  e.employee_name,
  d.division_code,
  mapping_status,
  mapping_reason,
  CASE WHEN ov.id IS NOT NULL THEN 1 ELSE 0
ORDER BY occurrence_count DESC;
```

### 4.3 Division Attendance Summary Query

```sql
-- Monthly attendance by division
SELECT
  ai.division_code,
  COUNT(*) AS total_records,
  COUNT(DISTINCT ai.employee_code) AS unique_employees,
  SUM(CASE WHEN ai.attendance_status = 'HADIR' THEN 1 ELSE 0 END) AS hadir,
  SUM(CASE WHEN ai.attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END) AS tidak_hadir,
  SUM(CASE WHEN ai.is_sick = 1 THEN 1 ELSE 0 END) AS sick,
  SUM(CASE WHEN ai.is_leave = 1 THEN 1 ELSE 0 END) AS leave,
  SUM(CASE WHEN ai.is_holiday = 1 THEN 1 ELSE 0 END) AS holiday,
  CAST(SUM(CASE WHEN ai.attendance_status = 'HADIR' THEN 1 ELSE 0 END) AS FLOAT) /
    NULLIF(COUNT(*), 0) * 100 AS attendance_rate
FROM attendance_imports ai
WHERE ai.attendance_year = @year
  AND ai.attendance_month = @month
GROUP BY ai.division_code
ORDER BY total_records DESC;
```

### 4.4 Data Quality Summary Query

```sql
-- Overall data quality metrics
DECLARE @since DATE = DATEADD(DAY, -30, CAST(GETDATE() AS DATE));

SELECT
  (SELECT COUNT(*) FROM attendance_scan_logs WHERE scan_date >= @since) AS total_scans,
  (SELECT COUNT(*) FROM attendance_scan_logs WHERE scan_date >= @since AND mapping_status = 'MAPPED') AS mapped,
  (SELECT COUNT(*) FROM attendance_scan_logs WHERE scan_date >= @since AND mapping_status = 'UNMAPPED') AS unmapped,
  (SELECT COUNT(*) FROM attendance_scan_logs WHERE scan_date >= @since AND mapping_status = 'NEED_REVIEW') AS need_review,
  (SELECT COUNT(DISTINCT raw_device_user_id) FROM attendance_scan_logs WHERE scan_date >= @since AND mapping_status != 'MAPPED') AS unique_unmapped_ids;
```

### 4.5 Daily Trend Query

```sql
-- Daily scan trend
SELECT
  scan_date,
  COUNT(*) AS total_scans,
  COUNT(DISTINCT parsed_employee_code) AS unique_employees,
  COUNT(DISTINCT machine_code) AS machines_active,
  SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) AS mapped_scans,
  SUM(CASE WHEN mapping_status != 'MAPPED' THEN 1 ELSE 0 END) AS unmapped_scans
FROM attendance_scan_logs
WHERE scan_date >= @from AND scan_date <= @to
GROUP BY scan_date
ORDER BY scan_date DESC;
```

---

## PART 5: HTML PAGES TO BUILD

### 5.1 Page Structure

```
src/public/
├── index.html              # Redirect to dashboard
├── login.html              # Existing login page
├── dashboard.html          # Existing main dashboard
├── machines.html           # Existing machine list
├── machine-detail.html     # NEW: Single machine detail page
├── machine-employees.html  # NEW: Machine employee browser
├── data-quality.html       # Existing quality page
├── division-analysis.html  # Existing division page
├── import-history.html     # Existing import history
├── scheduler.html          # Existing scheduler
└── _layout.html            # Layout template
```

### 5.2 NEW: `machine-detail.html`

**Purpose:** Real-time monitoring of a single machine

**Features:**
1. Machine info card (IP, port, location, scanner code, loc code)
2. Real-time status indicator (online/offline with live ping)
3. Today's statistics (scans, employees, first/last scan)
4. Sync controls (sync now, schedule sync)
5. Recent sync history table (last 10 syncs)
6. Live scan feed (real-time updates via SSE)
7. Machine device users list (employees enrolled in this machine)
8. Charts:
   - Hourly scan distribution
   - Weekly trend

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Machines    P1A - PG1A    [Ping] [Sync] [Edit]   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│ │ ONLINE  │ │ 1,421   │ │ 142     │ │ 08:15   │            │
│ │ Status  │ │ Scans   │ │ Employees│ │ Last Sync│           │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
├─────────────────────────────────────────────────────────────┤
│ Machine Info                  │ Connection Test            │
│ IP: 10.0.0.90                │ Latency: 45ms              │
│ Port: 4100                    │ Status: ONLINE             │
│ Scanner: 100 (P1A)            │ [Test Connection]          │
│ Loc: A                        │                            │
├─────────────────────────────────────────────────────────────┤
│ Live Scan Feed (Real-time)                                   │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 10:42:15 │ A0140 │ EDI ISHAK │ P1A │ IN              │ │
│ │ 10:42:08 │ A0155 │ BUDI      │ P1A │ OUT             │ │
│ │ 10:41:55 │ A0142 │ ANTON     │ P1A │ IN              │ │
│ └────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Device Users in Machine        │ Sync History               │
│ ┌──────────────────────────┐   │ ┌──────────────────────┐ │
│ │ A0140 - EDI ISHAK        │   │ │ 10:30 - SUCCESS 245 │ │
│ │ A0155 - BUDI SANTOSO     │   │ │ 09:15 - SUCCESS 312 │ │
│ │ A0142 - ANTON WIJAYA     │   │ │ 08:00 - FAILED -    │ │
│ │ ...                      │   │ │ ...                 │ │
│ └──────────────────────────┘   │ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 NEW: `machine-employees.html`

**Purpose:** Browse and manage employee IDs for a specific machine

**Features:**
1. Machine selector dropdown
2. View toggle: "Machine View" vs "Database View"
3. Filter by: All / Mapped / Unmapped / Need Review
4. Search by raw ID or employee name
5. Employee table with:
   - Raw Device ID
   - Mapped Employee Code
   - Employee Name
   - Division
   - Total Scans
   - Last Scan Time
   - Mapping Status
   - Manual Mapping Action
6. Bulk mapping tool
7. Export to CSV

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│ Machine: [P1A ▼]   View: [Machine] [Database]               │
│ Filter: [All ▼]    Search: [____________]   [Export CSV]   │
├─────────────────────────────────────────────────────────────┤
│ Summary: 142 unique IDs | 120 mapped | 22 unmapped | 85%  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 85%  │
├─────────────────────────────────────────────────────────────┤
│ Raw ID    │ Emp Code │ Name          │ Div │ Scans │ Last │
├───────────┼──────────┼───────────────┼─────┼───────┼──────┤
│ 10140     │ A0140    │ EDI ISHAK     │ P1A │ 1,521 │ Now  │ [Map]
│ 10125     │ A0125    │ ROSADI        │ P1A │ 1,498 │ Now  │ [Map]
│ 10150     │ -        │ UNMAPPED      │ -   │ 245   │ 2h   │ [Assign]
│ ...       │          │               │     │       │      │
├─────────────────────────────────────────────────────────────┤
│ [Assign Selected to Employee: _______________] [Apply]     │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 ENHANCED: `division-analysis.html`

**Additional Features:**
1. Division comparison mode (compare 2+ divisions side by side)
2. Employee-level drill-down (click division to see employees)
3. Attendance calendar view (monthly calendar with daily status)
4. Export options (CSV, PDF)

### 5.5 NEW: `realtime-dashboard.html`

**Purpose:** Full-screen real-time monitoring dashboard

**Features:**
1. Live machine status grid (16 machines, auto-updating)
2. Real-time scan ticker (latest 50 scans, auto-scrolling)
3. Live statistics (scans per minute, active employees)
4. Alert panel (offline machines, sync errors)
5. Mini charts (hourly distribution)

---

## PART 6: CHART SPECIFICATIONS

### 6.1 Chart Library
- **Library:** Chart.js 4.4.0 (CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`)

### 6.2 Machine Status Chart (Doughnut)

```javascript
// Data
{
  labels: ['Online', 'Offline', 'Timeout'],
  datasets: [{
    data: [onlineCount, offlineCount, timeoutCount],
    backgroundColor: ['#219653', '#e53e3e', '#d69e2e'],
    borderWidth: 0
  }]
}
// Options
{
  responsive: true,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: '#e0e8f0', padding: 20 }
    }
  },
  cutout: '60%'
}
```

### 6.3 Scan Volume Trend (Line)

```javascript
// Data
{
  labels: ['Jun 1', 'Jun 2', ..., 'Jun 18'],
  datasets: [{
    label: 'Total Scans',
    data: [1250, 1340, ..., 1450],
    borderColor: '#167A3A',
    backgroundColor: 'rgba(22,122,58,0.1)',
    fill: true,
    tension: 0.4,
    pointRadius: 3,
    pointHoverRadius: 6
  }, {
    label: 'Unique Employees',
    data: [120, 125, ..., 142],
    borderColor: '#0ea5e9',
    backgroundColor: 'rgba(14,165,233,0.1)',
    fill: true,
    tension: 0.4
  }]
}
// Options
{
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' }
  },
  scales: {
    x: {
      ticks: { color: '#7a9bba' },
      grid: { color: '#1a3a5c' }
    },
    y: {
      beginAtZero: true,
      ticks: { color: '#7a9bba' },
      grid: { color: '#1a3a5c' }
    }
  }
}
```

### 6.4 Division Attendance (Bar)

```javascript
// Data
{
  labels: ['AB1', 'AB2', 'P1A', 'P1B', 'P2A', 'P2B', 'DME'],
  datasets: [
    {
      label: 'Hadir',
      data: [850, 780, 920, 890, 750, 720, 680],
      backgroundColor: '#219653'
    },
    {
      label: 'Tidak Hadir',
      data: [50, 70, 30, 45, 80, 95, 120],
      backgroundColor: '#e53e3e'
    },
    {
      label: 'Sakit',
      data: [10, 15, 8, 12, 20, 18, 25],
      backgroundColor: '#d69e2e'
    },
    {
      label: 'Cuti',
      data: [5, 8, 12, 10, 15, 12, 20],
      backgroundColor: '#9f7aea'
    }
  ]
}
```

### 6.5 Data Quality Gauge

```javascript
// Score calculation: mapped_percentage * weight + other_factors
// Grade: A (90-100), B (80-89), C (70-79), D (60-69), F (<60)

{
  type: 'doughnut',
  data: {
    labels: ['Mapped', 'Unmapped'],
    datasets: [{
      data: [mappedCount, unmappedCount],
      backgroundColor: ['#219653', '#e53e3e'],
      borderWidth: 0
    }]
  },
  options: {
    circumference: 180,
    rotation: 270,
    cutout: '80%',
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }
    }
  }
}
```

---

## PART 7: IMPLEMENTATION ORDER

### Phase 1: Foundation (Week 1)

**7.1.1 New API Endpoints**
- [ ] `GET /api/machines/real-time-status` - Aggregated machine status
- [ ] `POST /api/machines/:code/sync` - Enhanced sync with options
- [ ] `GET /api/quality/dashboard-summary` - Quality overview

**7.1.2 Enhanced Existing APIs**
- [ ] Update `GET /api/monitoring/machine/:code/employees` with device_users section
- [ ] Update `GET /api/monitoring/quality` with trend data

**7.1.3 New HTML Pages**
- [ ] Create `machine-detail.html` - Basic structure
- [ ] Create `machine-employees.html` - Basic structure

### Phase 2: Real-Time Features (Week 2)

**7.2.1 Real-Time Infrastructure**
- [ ] Implement SSE endpoint for machine ping results
- [ ] Implement WebSocket for live scan updates (optional, SSE is sufficient)
- [ ] Add auto-refresh JavaScript to machine pages

**7.2.2 Frontend Enhancements**
- [ ] Add live ping to `machines.html`
- [ ] Add real-time status to `machine-detail.html`
- [ ] Add live scan feed to `machine-detail.html`

### Phase 3: Employee Mapping (Week 3)

**7.3.1 Mapping APIs**
- [ ] `POST /api/machines/:code/device-users/fetch` - Fetch from ZKTeco
- [ ] `POST /api/machines/:code/employees/bulk-map` - Bulk mapping
- [ ] `GET /api/machines/:code/unmapped-suggestions` - AI suggestions

**7.3.2 Mapping UI**
- [ ] Complete `machine-employees.html` with all features
- [ ] Add manual mapping modal
- [ ] Add bulk mapping tool

### Phase 4: Division Analysis (Week 4)

**7.4.1 Division APIs**
- [ ] `GET /api/divisions/:code/attendance` - Detailed division view
- [ ] `GET /api/divisions/compare` - Multi-division comparison
- [ ] `GET /api/divisions/:code/employees` - Division employees

**7.4.2 Division UI**
- [ ] Enhance `division-analysis.html` with comparison mode
- [ ] Add employee drill-down
- [ ] Add attendance calendar view

### Phase 5: Data Quality Dashboard (Week 5)

**7.5.1 Quality APIs**
- [ ] `GET /api/quality/daily-trend` - Historical trend
- [ ] `GET /api/quality/issues` - Issue detection
- [ ] `POST /api/quality/auto-fix` - Auto-fix common issues

**7.5.2 Quality UI**
- [ ] Create `data-quality.html` (enhanced from existing)
- [ ] Add quality gauge chart
- [ ] Add issue list with actions

### Phase 6: Polish & Optimization (Week 6)

**7.6.1 Performance**
- [ ] Add database indexes for common queries
- [ ] Implement query caching for dashboards
- [ ] Optimize scan log inserts (batch inserts)

**7.6.2 User Experience**
- [ ] Add keyboard shortcuts
- [ ] Add notification sounds for alerts
- [ ] Add dark/light mode toggle

---

## PART 8: ZKTECO CONNECTION DETAILS

### 8.1 Connection Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Protocol | TCP | Direct socket connection |
| Default Port | 4370 | ZKTeco default |
| Timeout | 30,000ms | Connection timeout |
| Retry | 3 attempts | Before marking offline |
| Keep Alive | 4000ms | Socket keep-alive interval |

### 8.2 Ping Implementation (PowerShell)

```powershell
# TCP Ping Function
function Test-ZktecoMachine {
  param(
    [string]$IpAddress,
    [int]$Port,
    [int]$TimeoutMs = 3000
  )

  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $connect = $tcp.BeginConnect($IpAddress, $Port, $null, $null)
    $wait = $connect.AsyncWaitHandle.WaitOne($TimeoutMs)

    if ($wait -and $tcp.Connected) {
      $tcp.Close()
      return @{
        Status = "ONLINE"
        Reachable = $true
        LatencyMs = (Measure-Command {
          $t = New-Object System.Net.Sockets.TcpClient
          $t.Connect($IpAddress, $Port)
          $t.Close()
        }).TotalMilliseconds
      }
    }

    $tcp.Close()
    return @{ Status = "TIMEOUT"; Reachable = $false; LatencyMs = $null }
  }
  catch {
    return @{ Status = "ERROR"; Reachable = $false; Error = $_.Exception.Message }
  }
}
```

### 8.3 ZKTeco Record Fetch

```typescript
// Using node-zklib
import ZKLib from 'node-zklib';

async function fetchFromMachine(ip: string, port: number, password: string) {
  const zk = new ZKLib(ip, port, 30000, 4000, password);

  try {
    // Connect
    await new Promise<void>((resolve, reject) => {
      zk.createSocket(
        (err: any) => { if (err) reject(err); },
        () => {}
      );
      setTimeout(resolve, 1500);
    });

    // Get users
    const usersResponse = await zk.getUsers();
    const users = usersResponse?.data ?? usersResponse ?? [];

    // Get attendance
    const attendanceResponse = await zk.getAttendances();
    const records = attendanceResponse?.data ?? attendanceResponse ?? [];

    return { users, records, success: true };
  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    try { await zk.disconnect(); } catch {}
  }
}
```

---

## PART 9: SAMPLE DATA FLOW

### 9.1 Typical Scan Flow

```
User scans fingerprint
  ↓
ZKTeco records: { deviceUserId: "10140", recordTime: "2026-06-18 10:42:15" }
  ↓
Sync script fetches from machine
  ↓
Parse raw data:
  - raw_device_user_id: "10140"
  - scan_time: "2026-06-18 10:42:15"
  ↓
Apply mapping:
  - machine = P1A, scanner_code = 100, loc_code = "A"
  - last 4 digits: "0140"
  - employee_code: "A0140"
  - mapping_status: "MAPPED" (since not office machine)
  ↓
Insert into attendance_scan_logs:
  raw_device_user_id: "10140"
  parsed_employee_code: "A0140"
  parsed_division_code: "P1A"
  mapping_status: "MAPPED"
  scan_time: "2026-06-18 10:42:15"
  ↓
Dashboard shows:
  - Machine P1A: +1 scan
  - Employee A0140: check-in at 10:42
  - Division P1A: attendance updated
```

### 9.2 Manual Mapping Flow

```
Admin notices: raw_id "99999" appears 150 times but unmapped
  ↓
Open Machine Employees page for the machine
  ↓
Search for "99999"
  ↓
See: 150 scans, last seen 2 hours ago, UNMAPPED
  ↓
Click "Assign Employee"
  ↓
Search for employee name or code
  ↓
Select: A9999 - JOHN DOE
  ↓
System updates:
  1. INSERT INTO employee_mapping_overrides (...)
  2. UPDATE attendance_scan_logs SET parsed_employee_code = 'A9999', mapping_status = 'MAPPED', mapping_reason = 'manual_override'
  ↓
Now 150 historical records are mapped
Future scans with raw_id "99999" will be auto-mapped
```

---

## APPENDIX A: KEY FILES REFERENCE

| File | Purpose |
|------|---------|
| `src/api/routes/machines.routes.ts` | Machine API routes |
| `src/api/routes/machine-employee.routes.ts` | Employee mapping routes |
| `src/api/routes/monitoring.routes.ts` | Monitoring dashboard routes |
| `src/api/routes/sync.routes.ts` | Sync control routes |
| `src/api/routes/realtime.routes.ts` | SSE real-time endpoints |
| `src/modules/machines/zkteco.service.ts` | ZKTeco TCP client |
| `src/modules/mapping/employee-code-mapper.ts` | Employee ID mapping logic |
| `src/scripts/sync-machines.ts` | Sync script implementation |
| `src/public/machines.html` | Existing machine list page |
| `src/public/division-analysis.html` | Existing division analysis |
| `_dev_utils/src/machine-config.ts` | Machine configuration |

---

## APPENDIX B: COLOR SCHEME

| Purpose | Color | Hex |
|---------|-------|-----|
| Primary (Navy) | Dark navy | #071426 |
| Primary (Green) | PTRJ Green | #167A3A |
| Success | Green | #219653, #38a169 |
| Danger | Red | #e53e3e, #dc2626 |
| Warning | Yellow/Orange | #d69e2e, #d97706 |
| Background | Light gray | #F1F5F9 |
| Card | White | #ffffff |
| Text | Dark | #1e293b |
| Muted | Gray | #64748b |
| Border | Light border | #e2e8f0 |

---

*Document Version: 1.0*
*Created: 2026-06-18*
*Author: Claude Code*
