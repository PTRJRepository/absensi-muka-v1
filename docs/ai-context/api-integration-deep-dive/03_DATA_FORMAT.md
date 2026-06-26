# Data Format Specification

## Overview

The IT Solution API uses a consistent JSON format for both requests and responses. This document details the complete data structures used.

---

## Response Wrapper Format

All API responses follow this wrapper format:

```typescript
{
  success: boolean;
  data: T;  // Actual data payload
  error?: string;  // Present only on failure
}
```

---

## Division List Response

**Endpoint:** `GET /api/divisions`

```typescript
// Response structure
{
  success: true,
  data: string[]
}

// Example
{
  "success": true,
  "data": ["PG1A", "PG1B", "PG2A", "DME", "ARA"]
}
```

---

## Available Months Response

**Endpoint:** `GET /api/available-months-by-division`

```typescript
// Response structure
{
  success: true,
  data: Array<{
    year: number;
    month: number;
  }>
}

// Example
{
  "success": true,
  "data": [
    { "year": 2026, "month": 6 },
    { "year": 2026, "month": 5 }
  ]
}
```

---

## Attendance Data Response

**Endpoint:** `GET /api/attendance-by-division`

### Complete Response Structure

```typescript
{
  success: true,
  data: Array<EmployeeDayData>
}
```

### Employee Record Format

```typescript
interface EmployeeDayData {
  empCode: string;       // Employee code (e.g., "A0001")
  empName: string;       // Employee name
  gangCode: string;      // Gang/work group code
  day_1: DayData | null;
  day_2: DayData | null;
  // ... day_3 through day_31
  day_31: DayData | null;
}

interface DayData {
  hasWork: boolean;     // Did employee work this day?
  isSunday: boolean;    // Is this a Sunday?
  isHoliday: boolean;   // Is this a holiday?
  isCuti: boolean;      // Is this a leave (cuti)?
  isSakit: boolean;     // Is this sick leave?
  otHours: number;       // Overtime hours (decimal)
  taskCode: string | null;  // Task/assignment code
  date: string | null;   // ISO timestamp of clock-in
  holidayDesc?: string; // Holiday description (if isHoliday)
}
```

### Complete Example

```json
{
  "success": true,
  "data": [
    {
      "empCode": "A0001",
      "empName": "John Doe",
      "gangCode": "G01",
      "day_1": {
        "hasWork": true,
        "isSunday": false,
        "isHoliday": false,
        "isCuti": false,
        "isSakit": false,
        "otHours": 0,
        "taskCode": "NORMAL",
        "date": "2026-06-01T08:15:00.000Z"
      },
      "day_2": {
        "hasWork": true,
        "isSunday": false,
        "isHoliday": false,
        "isCuti": false,
        "isSakit": false,
        "otHours": 0,
        "taskCode": "NORMAL",
        "date": "2026-06-02T08:30:00.000Z"
      },
      "day_3": null,
      "day_4": {
        "hasWork": false,
        "isSunday": true,
        "isHoliday": false,
        "isCuti": false,
        "isSakit": false,
        "otHours": 0,
        "taskCode": null,
        "date": null
      }
    }
  ]
}
```

---

## Field Definitions

### Employee Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `empCode` | string | Unique employee identifier | "A0001", "L10042" |
| `empName` | string | Employee full name | "John Doe" |
| `gangCode` | string | Work group/gang assignment | "G01", "TEAM-A" |

### Day Data Fields

| Field | Type | Description | Notes |
|-------|------|-------------|-------|
| `hasWork` | boolean | Employee worked this day | Required for import |
| `isSunday` | boolean | Day is Sunday | System flag |
| `isHoliday` | boolean | Day is public holiday | Triggers special rates |
| `isCuti` | boolean | Leave (cuti/s Holiday) | Annual leave |
| `isSakit` | boolean | Sick leave | Medical leave |
| `otHours` | number | Overtime hours | Decimal (e.g., 2.5) |
| `taskCode` | string\|null | Work assignment code | "NORMAL", "SPECIAL" |
| `date` | string\|null | Clock-in timestamp | ISO 8601 format |
| `holidayDesc` | string | Holiday name | Only if `isHoliday` |

---

## Null Day Handling

Days with no data (e.g., day_31 in a 30-day month, or no attendance) are returned as `null`:

```json
{
  "day_29": { ... },
  "day_30": { ... },
  "day_31": null
}
```

The import pipeline handles `null` by skipping those days:

```typescript
for (let day = 1; day <= 31; day++) {
  const dayKey = `day_${day}`;
  const dayData = emp[dayKey];
  
  if (!dayData) continue;  // Skip null days
  // Process valid day data
}
```

---

## Mode Variations

### Hari Kerja (hk) Mode

Returns normal working day attendance data:
- Regular work days
- Sundays marked with `isSunday: true`
- Holidays marked with `isHoliday: true`

### Lembur (ot) Mode

Returns overtime/lembur attendance data:
- Records where `otHours > 0`
- Special overtime assignments

---

## Data Type Summary

| Type | Format | Example |
|------|--------|---------|
| Date | ISO 8601 | "2026-06-01T08:15:00.000Z" |
| Boolean | JSON boolean | true, false |
| Number | JSON number | 0, 2.5, 8 |
| String | JSON string | "A0001", "NORMAL" |
| Null | JSON null | null |

---

## Validation Rules

The import pipeline validates:

1. **Day validity**: Check if day exists in target month
2. **Date parsing**: Convert ISO string to time components
3. **Numeric fields**: Ensure otHours is numeric

```typescript
// Validation example
const date = new Date(year, month - 1, day);
if (date.getMonth() !== month - 1) continue;  // Invalid day for month
```