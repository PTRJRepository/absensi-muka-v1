# Mode System: hk vs ot

## Overview

The IT Solution API supports two attendance modes that return different types of attendance data. Understanding the difference is crucial for proper data synchronization.

---

## Mode Definitions

| Mode | Full Name | Indonesian | Purpose |
|------|-----------|------------|---------|
| `hk` | Hari Kerja | Working Day | Normal attendance records |
| `ot` | Lembur | Overtime | Overtime/extra work records |

---

## Hari Kerja (hk) Mode

### Purpose
Returns standard attendance data for regular working days.

### Data Characteristics
- All employees with work records
- Regular work hours (not overtime)
- Includes weekends and holidays
- Task codes: "NORMAL" or similar

### Typical Use Case
```typescript
// Fetch regular attendance for June 2026
const hkData = await absensiApi.getAttendance('PG1A', 6, 2026, 'hk');

// Result: Regular work day records
// - Monday-Friday work
// - Sunday marked with isSunday: true
// - Holidays marked with isHoliday: true
```

### Response Example

```json
{
  "empCode": "A0001",
  "empName": "John Doe",
  "day_1": {
    "hasWork": true,
    "isSunday": false,
    "isHoliday": false,
    "isCuti": false,
    "isSakit": false,
    "otHours": 0,
    "taskCode": "NORMAL",
    "date": "2026-06-01T08:15:00.000Z"
  }
}
```

---

## Lembur (ot) Mode

### Purpose
Returns overtime/extra work attendance records.

### Data Characteristics
- Employees with overtime assignments
- `otHours > 0`
- Special task codes for overtime work
- Often after normal hours or weekend work

### Typical Use Case
```typescript
// Fetch overtime records for June 2026
const otData = await absensiApi.getAttendance('PG1A', 6, 2026, 'ot');

// Result: Overtime records
// - Extra work beyond normal hours
// - otHours shows hours worked
// - May include weekend overtime
```

### Response Example

```json
{
  "empCode": "A0001",
  "empName": "John Doe",
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

---

## Key Differences

| Aspect | hk (Hari Kerja) | ot (Lembur) |
|--------|-----------------|-------------|
| Primary use | Regular attendance | Overtime tracking |
| otHours value | Usually 0 | > 0 |
| Task codes | "NORMAL" | "OT-*", special codes |
| Frequency | Daily | As needed |
| Holiday treatment | Marked, counted | Special overtime rates |

---

## Usage in Sync Pipeline

### From sync.ts

```typescript
interface SyncOptions {
  division?: string;
  year?: number;
  month?: number;
  mode?: "hk" | "ot";  // Mode selection
}

async function syncDivision(
  division: string,
  year: number,
  month: number,
  mode: "hk" | "ot" = "hk"  // Default to hk
): Promise<number> {
  // Fetch based on mode
  const attendanceData = await absensiApi.getAttendance(
    division, month, year, mode
  );
  // Process and store...
}
```

### From scheduler.ts

```typescript
// Sync both modes for complete coverage
for (const mode of config.sync.modes) {  // ["hk", "ot"]
  console.log(`\n📊 Syncing mode: ${mode}`);
  await runSync({ mode: mode as "hk" | "ot" });
}
```

---

## Data Storage

Both modes store to the same `absen_import` table with `source` indicating origin:

```sql
INSERT INTO absen_import (
  emp_code, division, tanggal, jam_masuk, jam_keluar, record_type,
  has_work, is_sunday, is_holiday, is_cuti, is_sakit,
  ot_hours, task_code, attendance_date, import_batch_id, source
) VALUES (
  'A0001', 'PG1A', '2026-06-15', '09:00:00', NULL, 0,
  1, 1, 0, 0, 0,
  4.5, 'OT-WEEKEND', '2026-06-15T09:00:00.000Z', 'batch-123', 'API'
);
```

---

## Sync Log Tracking

Each sync operation is logged with the mode:

```typescript
await logSync(
  division, year, month, mode,  // mode included in log
  syncedCount, "SUCCESS", null, duration
);
```

Resulting log entry:

| Field | Value |
|-------|-------|
| division | PG1A |
| year | 2026 |
| month | 6 |
| mode | ot |
| records_synced | 42 |
| status | SUCCESS |

---

## When to Use Each Mode

| Scenario | Mode |
|----------|------|
| Daily attendance tracking | `hk` |
| Regular work hours | `hk` |
| Overtime calculations | `ot` |
| Weekend work | `ot` |
| Holiday overtime | `ot` |
| Full monthly sync | Both (`hk` + `ot`) |

---

## Complete Sync Strategy

```typescript
async function fullMonthlySync(division: string, year: number, month: number) {
  // 1. Sync regular attendance
  await syncDivision(division, year, month, 'hk');
  
  // 2. Sync overtime records
  await syncDivision(division, year, month, 'ot');
  
  // Result: Complete attendance picture
}
```

---

## Configuration

From `config.ts`:

```typescript
sync: {
  modes: ["hk", "ot"],  // Both modes synced
}
```

The scheduler automatically syncs both modes on each interval.