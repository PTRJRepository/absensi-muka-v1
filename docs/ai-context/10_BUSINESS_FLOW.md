---
tags: [ai-context, business-flow]
created: 2026-06-07
---

# Business Flow

## Overview

The Sistem Absensi PT Rebinmas Jaya implements a data collection and synchronization flow for attendance tracking across 13 plantation divisions.

## Data Collection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ATTENDANCE DATA FLOW                             │
└─────────────────────────────────────────────────────────────────────────┘

SOURCE LAYER                    TRANSFORM LAYER                  STORAGE LAYER
─────────────────────────────────────────────────────────────────────────

┌──────────────┐               ┌──────────────┐                ┌──────────────┐
│ ZKTeco       │──TCP/IP──────→│ node-zklib   │──Transform────→│ absen_import │
│ 8 Machines   │               │ getAttendances│              │ (Immutable)  │
└──────────────┘               └──────────────┘                └──────────────┘

┌──────────────┐               ┌──────────────┐                ┌──────────────┐
│ IT Solution  │──HTTP/REST──→│ API Client   │──Transform────→│ absen_import │
│ API          │               │ getAttendance│              │ (Immutable)  │
└──────────────┘               └──────────────┘                └──────────────┘
                                                                       │
                                                                       ↓
                                                            ┌──────────────────┐
                                                            │ absen_machine_   │
                                                            │ input (Mutable)  │
                                                            └──────────────────┘
```

## Sync Process Flow

### 1. Scheduled Sync (Every 15 Minutes)

```
scheduler.ts (setInterval 15min)
    │
    ↓
sync.ts.runSync()
    │
    ├──→ createTables()     # Ensure DB schema exists
    ├──→ initConfig()        # Ensure configs exist
    │
    ├──→ For each division:
    │       │
    │       ├──→ absensiApi.getAvailableMonths(div)
    │       │
    │       ├──→ For each month:
    │       │       │
    │       │       ├──→ absensiApi.getAttendance(div, month, year, mode)
    │       │       │
    │       │       ├──→ For each employee:
    │       │       │       │
    │       │       │       ├──→ Parse day_1 to day_31
    │       │       │       │
    │       │       │       └──→ MERGE INTO absen_master
    │       │       │
    │       │       └──→ logSync() # Record in absen_sync_log
    │       │
    │       └──→ Next division
    │
    └──→ Complete
```

### 2. Data Transformation

**From ZKTeco (Raw Logs):**
```json
{
  "userSn": 50989,
  "deviceUserId": "10129",
  "recordTime": "2026-03-07T02:13:10.000Z"
}
```

**To Database (Structured):**
```sql
INSERT INTO absen_import (
  emp_code, division, year, month, day,
  has_work, is_sunday, is_holiday, is_cuti, is_sakit,
  ot_hours, attendance_date, import_batch_id, source
) VALUES (
  'A0129', 'PG1A', 2026, 3, 7,
  1, 0, 0, 0, 0,
  0.00, '2026-03-07', 'batch-xxx', 'MACHINE'
);
```

**From IT Solution API (Structured):**
```json
{
  "empCode": "A0039",
  "day_1": {
    "hasWork": true,
    "isSunday": false,
    "isHoliday": true,
    "holidayDesc": "Hari Buruh",
    "otHours": "0.00"
  }
}
```

**To Database (Same Structured):**
```sql
INSERT INTO absen_import (
  emp_code, division, year, month, day,
  has_work, is_sunday, is_holiday, holiday_desc,
  is_cuti, is_sakit, ot_hours, attendance_date,
  import_batch_id, source
) VALUES (
  'A0039', 'PG1A', 2026, 5, 1,
  1, 0, 1, 'Hari Buruh',
  0, 0, 0.00, '2026-05-01',
  'batch-xxx', 'API'
);
```

## Manual Correction Flow

When HR needs to correct attendance data:

```
User Request (HR)
    │
    ↓
absensiService.upsertMachineInput({
  emp_code: 'A0039',
  division: 'PG1A',
  year: 2026, month: 5, day: 1,
  has_work: 1,
  notes: 'Approved by manager'
})
    │
    ├──→ Check if exists in absen_machine_input
    │
    ├──→ If exists: UPDATE + logChange(EDIT)
    │
    └──→ If not exists: INSERT + logChange(ADD)
```

## Verification Flow

When querying attendance for reporting:

```
absensiService.getVerificationData('PG1A', 2026, 6)
    │
    ↓
SELECT
  COALESCE(m.has_work, i.has_work) as has_work,
  CASE WHEN m.id IS NOT NULL THEN 'MACHINE_INPUT'
       WHEN i.id IS NOT NULL THEN 'IMPORT'
       ELSE 'NONE' END as source
FROM absen_import i
FULL OUTER JOIN absen_machine_input m
  ON i.emp_code = m.emp_code
  AND i.division = m.division
  AND i.year = m.year
  AND i.month = m.month
  AND i.day = m.day
```

**Rule:** Machine input takes priority over import data.

## Error Handling Flow

```
Sync Operation
    │
    ├──→ Success: Log to absen_sync_log, status='SUCCESS'
    │
    ├──→ Partial Failure:
    │       ├──→ Continue processing remaining records
    │       ├──→ Collect errors
    │       ├──→ Update batch status='COMPLETED_WITH_ERRORS'
    │       └──→ Store error messages
    │
    └──→ Critical Failure:
            ├──→ Log to absen_sync_log, status='FAILED'
            └──→ Store error message
```

## Batch Processing Flow

```
runImport({ division: 'PG1A', year: 2026, month: 6 })
    │
    ├──→ Create batch_id = 'batch-{timestamp}'
    │
    ├──→ INSERT absen_import_batch (status='IN_PROGRESS')
    │
    ├──→ Fetch from API
    │
    ├──→ For each record (with 200ms delay every 20 records):
    │       │
    │       └──→ INSERT INTO absen_import
    │
    ├──→ UPDATE absen_import_batch
    │       └──→ status='COMPLETED' or 'COMPLETED_WITH_ERRORS'
    │
    └──→ Return count
```

## Division Sync Priority

1. **PG1A, PG1B** - Primary plantation groups (API only)
2. **PG2A, PG2B** - Secondary plantation groups (API only)
3. **DME** - Mill Estate (Direct ZKTeco + API)
4. **ARA, ARB1, ARB2** - Ari Estates (Direct ZKTeco + API)
5. **IJL** - Ijuk Estate (Direct ZKTeco + API)
6. **ARE, AREC** - Ari Estate Clinic (Direct ZKTeco)
7. **STF-OFFICE, SECURITY** - Office staff (API only)
8. **PGE** - Head Office (Direct ZKTeco)
9. **MILL** - Mill (Direct ZKTeco)
