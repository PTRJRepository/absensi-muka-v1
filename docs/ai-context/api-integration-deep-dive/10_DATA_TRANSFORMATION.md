# Data Transformation: API to Database

## Overview

This document details how raw API data is transformed into database-ready records. The transformation handles date parsing, field mapping, type conversion, and validation.

---

## Transformation Pipeline

```
API Response Data
       │
       ▼
┌─────────────────┐
│ Extract Employee │──── Get empCode, empName, gangCode
│     Fields       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Iterate Days    │──── Loop day_1 through day_31
│  (1 to 31)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Skip Null Days  │──── Continue if dayData is null
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Validate Date   │──── Check if day exists in month
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Check hasWork   │──── Only create record if true
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Transform Fields│──── Map and convert each field
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Add Metadata    │──── batch_id, source, timestamps
└────────┬────────┘
         │
         ▼
  Database Record
```

---

## Core Transformation Function

### From absensi-import.ts

```typescript
function convertApiToDbFormat(
  apiData: any[],
  division: string,
  year: number,
  month: number,
  batchId: string
): any[] {
  const records: any[] = [];

  for (const emp of apiData) {
    // Extract employee fields
    const empCode = emp.empCode;
    const empName = emp.empName;
    const gangCode = emp.gangCode;

    // Process each day
    for (let day = 1; day <= 31; day++) {
      const dayKey = `day_${day}`;
      const dayData = emp[dayKey];

      // Skip if no data
      if (!dayData) continue;

      // Validate date
      const date = new Date(year, month - 1, day);
      if (date.getMonth() !== month - 1) continue;

      // Only process if has work
      if (dayData.hasWork) {
        const jamMasuk = dayData.date ? parseJam(dayData.date) : null;

        records.push({
          emp_code: empCode,
          emp_name: empName,
          gang_code: gangCode,
          division: division,
          tahun: year,
          bulan: month,
          hari: day,
          tanggal: tanggal,
          jam_masuk: jamMasuk,
          jam_keluar: null,
          record_type: 0,
          has_work: 1,
          is_sunday: dayData.isSunday ? 1 : 0,
          is_holiday: dayData.isHoliday ? 1 : 0,
          is_cuti: dayData.isCuti ? 1 : 0,
          is_sakit: dayData.isSakit ? 1 : 0,
          ot_hours: parseFloat(dayData.otHours) || 0,
          task_code: dayData.taskCode || null,
          attendance_date: dayData.date || null,
          import_batch_id: batchId,
          source: "API",
        });
      }
    }
  }

  return records;
}
```

---

## Field Transformations

### Employee Fields (Direct Copy)

| API Field | DB Field | Transform |
|-----------|----------|-----------|
| `emp.empCode` | `emp_code` | Direct |
| `emp.empName` | `emp_name` | Direct |
| `emp.gangCode` | `gang_code` | Direct |

### Date Fields

| API Field | DB Field | Transform |
|-----------|----------|-----------|
| - | `division` | From parameter |
| - | `tahun` | From parameter |
| - | `bulan` | From parameter |
| - | `hari` | Loop counter |
| `Date object` | `tanggal` | `toISOString().split('T')[0]` |

#### Date Transformation Example

```typescript
const date = new Date(year, month - 1, day);
// date = June 15, 2026

const tanggal = date.toISOString().split("T")[0];
// tanggal = "2026-06-15"
```

### Time Fields

| API Field | DB Field | Transform |
|-----------|----------|-----------|
| `dayData.date` | `jam_masuk` | `parseJam()` |
| - | `jam_keluar` | Always null |

#### parseJam Function

```typescript
function parseJam(dateStr: string | null): string | null {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  // Format: HH:MM:SS
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

// Example:
// Input: "2026-06-15T08:15:30.000Z"
// Output: "08:15:30"
```

### Boolean Fields (1/0 Conversion)

| API Field | DB Field | Transform |
|-----------|----------|-----------|
| `dayData.hasWork` | `has_work` | `? 1 : 0` |
| `dayData.isSunday` | `is_sunday` | `? 1 : 0` |
| `dayData.isHoliday` | `is_holiday` | `? 1 : 0` |
| `dayData.isCuti` | `is_cuti` | `? 1 : 0` |
| `dayData.isSakit` | `is_sakit` | `? 1 : 0` |

```typescript
// Boolean to integer conversion
has_work: dayData.hasWork ? 1 : 0,
is_sunday: dayData.isSunday ? 1 : 0,
is_holiday: dayData.isHoliday ? 1 : 0,
is_cuti: dayData.isCuti ? 1 : 0,
is_sakit: dayData.isSakit ? 1 : 0,
```

### Numeric Fields

| API Field | DB Field | Transform |
|-----------|----------|-----------|
| `dayData.otHours` | `ot_hours` | `parseFloat() or 0` |

```typescript
ot_hours: parseFloat(dayData.otHours) || 0,
```

### String Fields

| API Field | DB Field | Transform |
|-----------|----------|-----------|
| `dayData.taskCode` | `task_code` | Direct or null |

```typescript
task_code: dayData.taskCode || null,
```

### Metadata Fields

| API Field | DB Field | Transform |
|-----------|----------|-----------|
| - | `record_type` | Always 0 (masuk) |
| - | `attendance_date` | From dayData.date |
| - | `import_batch_id` | From parameter |
| - | `source` | Always "API" |

---

## Transformation Example

### Input: API Response

```json
{
  "empCode": "A0001",
  "empName": "John Doe",
  "gangCode": "G01",
  "day_15": {
    "hasWork": true,
    "isSunday": true,
    "isHoliday": false,
    "isCuti": false,
    "isSakit": false,
    "otHours": 4.5,
    "taskCode": "OT-WEEKEND",
    "date": "2026-06-15T09:00:00.000Z"
  }
}
```

### Output: Database Record

```typescript
{
  emp_code: "A0001",
  emp_name: "John Doe",
  gang_code: "G01",
  division: "PG1A",
  tahun: 2026,
  bulan: 6,
  hari: 15,
  tanggal: "2026-06-15",
  jam_masuk: "09:00:00",
  jam_keluar: null,
  record_type: 0,
  has_work: 1,
  is_sunday: 1,
  is_holiday: 0,
  is_cuti: 0,
  is_sakit: 0,
  ot_hours: 4.5,
  task_code: "OT-WEEKEND",
  attendance_date: "2026-06-15T09:00:00.000Z",
  import_batch_id: "batch-1750000000000",
  source: "API"
}
```

---

## SQL Generation

```typescript
const sql = `
  INSERT INTO absen_import (
    emp_code, division, tanggal, jam_masuk, jam_keluar, record_type,
    has_work, is_sunday, is_holiday, is_cuti, is_sakit,
    ot_hours, task_code, attendance_date, import_batch_id, source
  ) VALUES (
    '${r.emp_code}',
    '${r.division}',
    '${r.tanggal}',
    ${r.jam_masuk ? `'${r.jam_masuk}'` : 'NULL'},
    ${r.jam_keluar ? `'${r.jam_keluar}'` : 'NULL'},
    ${r.record_type},
    ${r.has_work},
    ${r.is_sunday},
    ${r.is_holiday},
    ${r.is_cuti},
    ${r.is_sakit},
    ${r.ot_hours},
    ${r.task_code ? `'${r.task_code}'` : 'NULL'},
    ${r.attendance_date ? `'${r.attendance_date}'` : 'NULL'},
    '${r.import_batch_id}',
    '${r.source}'
  )
`;
```

### Generated SQL

```sql
INSERT INTO absen_import (
  emp_code, division, tanggal, jam_masuk, jam_keluar, record_type,
  has_work, is_sunday, is_holiday, is_cuti, is_sakit,
  ot_hours, task_code, attendance_date, import_batch_id, source
) VALUES (
  'A0001',
  'PG1A',
  '2026-06-15',
  '09:00:00',
  NULL,
  0,
  1,
  1,
  0,
  0,
  0,
  4.5,
  'OT-WEEKEND',
  '2026-06-15T09:00:00.000Z',
  'batch-1750000000000',
  'API'
)
```

---

## Sync Transformation (sync.ts)

Uses MERGE for upsert operations:

```typescript
// Build values for upsert
const values = {
  emp_code: empCode,
  emp_name: empName,
  gang_code: gangCode,
  division: division,
  year: year,
  month: month,
  day: day,
  has_work: dayData.hasWork ? 1 : 0,
  is_sunday: dayData.isSunday ? 1 : 0,
  is_holiday: dayData.isHoliday ? 1 : 0,
  holiday_desc: dayData.holidayDesc || null,
  is_cuti: dayData.isCuti ? 1 : 0,
  is_sakit: dayData.isSakit ? 1 : 0,
  task_code: dayData.taskCode || null,
  ot_hours: dayData.otHours || 0,
  attendance_date: attendanceDate,
};

// MERGE SQL
const sql = `
  MERGE INTO absen_master AS target
  USING (SELECT
    '${values.emp_code}' AS emp_code,
    '${values.division}' AS division,
    ${values.year} AS year,
    ${values.month} AS month,
    ${values.day} AS day
  ) AS source
  ON target.emp_code = source.emp_code
    AND target.division = source.division
    AND target.year = source.year
    AND target.month = source.month
    AND target.day = source.day
  WHEN MATCHED THEN
    UPDATE SET
      emp_name = '${values.emp_name}',
      gang_code = '${values.gang_code}',
      has_work = ${values.has_work},
      ...
  WHEN NOT MATCHED THEN
    INSERT (...);
`;
```

---

## Data Type Summary

| DB Field | Type | Source |
|----------|------|--------|
| `emp_code` | NVARCHAR(50) | API empCode |
| `emp_name` | NVARCHAR(255) | API empName |
| `gang_code` | NVARCHAR(50) | API gangCode |
| `division` | NVARCHAR(50) | Parameter |
| `tahun` | INT | Parameter |
| `bulan` | INT | Parameter |
| `hari` | INT | Loop counter |
| `tanggal` | DATE | Constructed |
| `jam_masuk` | TIME/NVARCHAR | Parsed from date |
| `jam_keluar` | TIME/NVARCHAR | Always NULL |
| `record_type` | INT | Always 0 |
| `has_work` | BIT/INT | Boolean conversion |
| `is_sunday` | BIT/INT | Boolean conversion |
| `is_holiday` | BIT/INT | Boolean conversion |
| `is_cuti` | BIT/INT | Boolean conversion |
| `is_sakit` | BIT/INT | Boolean conversion |
| `ot_hours` | DECIMAL(5,2) | ParseFloat |
| `task_code` | NVARCHAR(50) | Direct or null |
| `attendance_date` | DATE | API date |
| `import_batch_id` | NVARCHAR(100) | Generated |
| `source` | NVARCHAR(50) | Constant "API" |

---

## Transformation Checklist

- [ ] Extract employee fields (empCode, empName, gangCode)
- [ ] Iterate day_1 through day_31
- [ ] Skip null dayData
- [ ] Validate day exists in month
- [ ] Only process if hasWork === true
- [ ] Parse jam from ISO date string
- [ ] Convert booleans to 1/0
- [ ] Parse otHours as float
- [ ] Add batch_id and source metadata
- [ ] Generate SQL with proper NULL handling