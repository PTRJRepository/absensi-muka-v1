# 03_DATA_FLOW_TABLES.md

# Data Flow Through Tables - PT Rebinmas Jaya Absensi System

## Overview

This document traces how attendance data flows from source systems through the database tables.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SOURCE SYSTEMS │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐           ┌─────────────────┐                         │
│  │   ZKTeco        │           │ IT Solution     │                         │
│  │   Machines │           │ API │                         │
│  │   (8 units)     │           │ (13 divisions)  │                         │
│  └────────┬────────┘           └────────┬────────┘                         │
│           │                             │                                   │
│           │ TCP (node-zklib)             │ REST API │
│           │                             │                                 │
│           │                             │                                 │
│           ▼                             ▼                                   │
│  ┌────────────────────────────────────────────────────────────────┐          │
│  │ absensi-import.ts                        │          │
│  │                    (Import Pipeline)                        │          │
│  │                                                          │          │
│  │  1. Fetch raw attendance from source                      │          │
│  │  2. Map deviceUserId -> emp_code                          │          │
│  │  3. Transform to AbsenRecord format                       │          │
│  │  4. Call AbsensiService.insertImportBatch()               │          │
│  └────────────────────────────┬───────────────────────────────┘          │
│                               │                                           │
│                               ▼ │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │ AbsensiService.insertImportBatch()          │      │
│  │                                                          │      │
│  │  1. Create batch record (absen_import_batch) │      │
│  │  2. Insert each record to absen_import                    │      │
│  │  3. Update batch status                                   │      │
│  │  4. Return inserted count                                │      │
│  └────────────────────────────┬───────────────────────────────┘      │
│                               │                                           │
│                               ▼                                           │
│ ┌────────────────────────────────────────────────────────────────┐      │
│  │                    absen_import (IMUTABLE)                     │      │
│  │                    Raw attendance data                         │      │
│  │                    (Cannot edit/delete)                        │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

 │
                                    │ If manual correction needed
                                    ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                      MANUAL CORRECTION FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────┐         │
│  │              AbsensiService.upsertMachineInput()                │         │
│  │                                                          │         │
│  │  1. Check if record exists in absen_machine_input           │         │
│  │  2. If exists: UPDATE + log change                          │         │
│  │  3. If not exists: INSERT + log change                       │         │
│  │  4. Log to absen_change_log                                  │         │
│  └────────────────────────────┬───────────────────────────────┘         │
│                               │                                          │
│                               ▼ │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │                  absen_machine_input (MUTABLE)                 │      │
│  │                  Manual corrections │      │
│  │                  (Can edit/delete)                             │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                                    │
                                    │ getVerificationData()
                                    ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                      VERIFICATION / QUERY FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────┐         │
│  │              AbsensiService.getVerificationData()              │         │
│  │                                                          │         │
│  │  FULL OUTER JOIN: absen_import + absen_machine_input        │         │
│  │  ON: emp_code, division, year, month, day                   │         │
│  │                                                          │         │
│  │  Priority: machine_input > import │         │
│  │  - If record exists in both, machine_input wins             │         │
│  │  - COALESCE() for all fields                                │         │
│  │  - has_conflict flag if values differ                       │         │
│  └────────────────────────────┬───────────────────────────────┘         │
│                               │                                          │
│                               ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │           AbsenVerificationRecord[]                            │      │
│  │           Merged view of import + machine input                 │      │
│  │                                                          │      │
│  │  { │      │
│  │    emp_code, division, year, month, day,                    │      │
│  │    has_work, is_sunday, is_holiday, is_cuti, is_sakit,     │      │
│  │    import_id, machine_input_id,                             │      │
│  │    source: "IMPORT" | "MACHINE_INPUT" | "MERGED",          │      │
│  │    has_conflict: boolean │      │
│  │  }                                                          │      │
│  └────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Data Flow by Source

### Flow 1: ZKTeco Machine -> Database

```
ZKTeco Machine (e.g., PGE: 10.0.0.232:4370)
    │
    │ TCP Connection (node-zklib)
    ▼
absensi-import.ts
    │
    │ zk.getAttendances()
    ▼
Raw Attendance Data
    {
 uid: 10001,
      id: "A0001",
      name: "JOHN DOE",
      timestamp: 2026-06-07T08:15:00Z,
      state: 1,
      verify: 1
    }
    │
    │ Map deviceUserId -> emp_code
    │ (via machine-config.ts scanner_code mapping)
    ▼
AbsenRecord
 {
      emp_code: "A0001",
      emp_name: "JOHN DOE",
      division: "PGE",
      year: 2026,
      month: 6,
      day: 7,
      has_work: 1,
      is_sunday: 0,
      is_holiday: 0,
      is_cuti: 0,
      is_sakit: 0,
      ot_hours: 0,
      attendance_date: "2026-06-07",
      source: "MACHINE"
    }
    │
    │ insertImportBatch()
    ▼
absen_import
    │
    │ + logChange(ADD)
    ▼
absen_change_log
```

### Flow 2: IT Solution API -> Database

```
IT Solution API (http://10.0.0.110:5176)
    │
    │ GET /attendance/{division}/{month}/{year}
    │ Header: x-api-key: REDACTED
    ▼
API Response
 [
      {
        empCode: "A0001",
        empName: "JOHN DOE",
        gangCode: "GANG-A",
        day_1: { hasWork: true, isSunday: false, ... },
        day_2: { hasWork: true, isSunday: false, ... },
        ...
      }
    ]
    │
    │ Transform each day to AbsenRecord
    ▼
AbsenRecord[]
    │
    │ insertImportBatch()
    ▼
absen_import
    │
    │ (Same as ZKTeco flow)
    ▼
absen_change_log
```

### Flow 3: Manual Correction

```
Admin/Correction Request
    │
    │ upsertMachineInput(record, changedBy)
    ▼
Check if exists in absen_machine_input
    │
    ├─ YES: UPDATE existing record
    │       │
    │       │ Compare old vs new values
    │       ▼
    │       logChange(EDIT) for each changed field
    │       │
    │       ▼
    │       absen_change_log
    │
    └─ NO: INSERT new record
            │
            │ logChange(ADD)
            ▼
            absen_change_log
```

### Flow 4: Cross-Division Scan Processing (v2/v3)

```
attendance_scan_log (raw scans)
    │
    │ Group by (emp_code, work_date)
    ▼
Aggregation (sp_sync_attendance_daily)
    │
    │ - first_scan_time = MIN(scan_time)
    │ - last_scan_time = MAX(scan_time)
    │ - scan_count = COUNT(*)
    │ - scan_machines = STRING_AGG(machine_code)
    │
    ▼
Calculate Duration
    │
    ├─ Single scan: use standard_minutes (420 or 300)
    │ is_duration_estimated = 1
    │
    └─ Multiple scans: DATEDIFF(last_scan, first_scan)
                        is_duration_estimated = 0
    │
    ▼
Determine Division
    │
    ├─ Priority 1: mst_employee.home_division_id
    ├─ Priority 2: scan_division_id (if cross-division)
    └─ Result: final_division_id
    │
    ▼
employee_attendance_daily
    │
    │ + sorting_result
    ▼
attendance_sorting_result
    │
    │ - sorting_status: MATCH_HOME / CROSS_DIVISION_MOVED / etc.
    │ - sorting_rule: RULE_HOME_DIVISION / RULE_MACHINE_DIVISION
    │ - need_review: 1 if unmapped or no home division
    ▼
Mark ABSENT for employees with no scans
```

---

## Table-to-Table Data Flow

### Input Tables (Sources)
| Table | Data Source | Flow To |
|-------|-------------|---------|
| absen_import | ZKTeco machines, IT Solution API | Verification queries |
| attendance_scan_log | ZKTeco machines, IT Solution API | employee_attendance_daily |

### Processing Tables (Transforms)
| Table | Input From | Output To |
|-------|-----------|----------|
| employee_attendance_daily | attendance_scan_log | Query/Reports |
| attendance_sorting_result | employee_attendance_daily | Query/Reports |

### Manual Override Tables
| Table | Affects | Flow To |
|-------|---------|---------|
| absen_machine_input | absen_import verification | absen_change_log |
| attendance_manual_input | employee_attendance_daily | absen_change_log |

### Audit Tables (Immutable)
| Table | Populated By | Purpose |
|-------|-------------|---------|
| absen_import_batch | insertImportBatch() | Track import batches |
| absen_change_log | logChange() | Audit trail |
| absen_sync_log | logSync() | Sync operation logs |

---

## Key Transformations

### Transformation 1: deviceUserId -> emp_code

```
Source: ZKTeco machine deviceUserId
Mapping: machine-config.ts scanner_code
Example:
 - deviceUserId: 10001 at machine PGE
  - Scanner suffix: P1A (scanner_code: 100)
  - Emp code prefix: A
  - Result: emp_code = "A0001"
```

### Transformation 2: Raw Scan -> Daily Aggregation

```
Input: N scan events for1 employee on 1 day
Output: 1 daily record with:
  - first_scan_time
  - last_scan_time
  - scan_count
  - work_duration_minutes
  - overtime_minutes
```

### Transformation 3: Verification Merge

```
Input:
  absen_import: { emp_code: "A0001", has_work: 0 }
  absen_machine_input: { emp_code: "A0001", has_work: 1 }

Output (AbsenVerificationRecord):
  { emp_code: "A0001", has_work: 1, source: "MACHINE_INPUT", has_conflict: true }
```

---

## Data Refresh Patterns

### Pattern 1: Full Refresh (Daily Import)
```
Day N+1: Import all data from Day N
  -> absen_import (INSERT new batch)
  -> absen_import_batch (new batch record)
```

### Pattern 2: Incremental Update (Manual Corrections)
```
Any time: Admin correction
  -> absen_machine_input (INSERT/UPDATE/DELETE)
  -> absen_change_log (new audit record)
```

### Pattern 3: Re-sync (v2/v3 Daily Processing)
```
Day N: Process previous day's data
  -> attendance_scan_log (N records)
  -> employee_attendance_daily (1 record per employee)
  -> attendance_sorting_result (1 record per employee)
```

---

## Data Retention

| Table | Retention | Notes |
|-------|-----------|-------|
| absen_import | Permanent | Immutable, never deleted |
| absen_machine_input | Permanent | Until deleted by admin |
| attendance_scan_log | 90 days | Raw scans, can be purged |
| employee_attendance_daily | Permanent | Aggregated data |
| attendance_sorting_result | Permanent | Audit trail |
| absen_change_log | Permanent | Audit trail |
| absen_import_batch | Permanent | Batch tracking |
| absen_sync_log | 180 days | Sync logs |
