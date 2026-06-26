# Month Data Structure: day_1 through day_31

## Overview

Each employee record in the API response contains 31 day fields (`day_1` through `day_31`), representing the entire month regardless of actual month length. This document explains how this structure works and how to handle it properly.

---

## Day Field Structure

### Basic Pattern

```typescript
interface EmployeeDayData {
  empCode: string;
  empName: string;
  gangCode: string;
  day_1: DayData | null;
  day_2: DayData | null;
  day_3: DayData | null;
  // ... day_4 through day_30
  day_31: DayData | null;
}
```

### DayData Type

```typescript
interface DayData {
  hasWork: boolean;      // Did employee work?
  isSunday: boolean;      // Is Sunday?
  isHoliday: boolean;    // Is public holiday?
  isCuti: boolean;       // Leave (cuti)?
  isSakit: boolean;      // Sick leave?
  otHours: number;       // Overtime hours
  taskCode: string | null;  // Work assignment
  date: string | null;   // Clock-in time (ISO)
  holidayDesc?: string;  // Holiday name (optional)
}
```

---

## Data Pattern Examples

### Complete Month (31 days)

```json
{
  "empCode": "A0001",
  "day_1": { "hasWork": true, ... },
  "day_2": { "hasWork": true, ... },
  "day_3": { "hasWork": true, ... },
  // ... days 4-28
  "day_29": { "hasWork": true, ... },
  "day_30": { "hasWork": true, ... },
  "day_31": { "hasWork": true, ... }
}
```

### 30-Day Month (April, June, September, November)

```json
{
  "day_28": { "hasWork": true, ... },
  "day_29": { "hasWork": true, ... },
  "day_30": { "hasWork": true, ... },
  "day_31": null  // Does not exist
}
```

### February (28 days, 29 in leap year)

```json
{
  "day_26": { "hasWork": true, ... },
  "day_27": { "hasWork": true, ... },
  "day_28": { "hasWork": true, ... },
  "day_29": null,  // Feb 29 - only exists in leap year
  "day_30": null,
  "day_31": null
}
```

---

## Processing Logic

### Day Validation (from absensi-import.ts)

```typescript
function processMonthData(
  apiData: any[],
  division: string,
  year: number,
  month: number,
  batchId: string
): any[] {
  const records: any[] = [];

  for (const emp of apiData) {
    // Process each day field
    for (let day = 1; day <= 31; day++) {
      const dayKey = `day_${day}`;
      const dayData = emp[dayKey];

      // Skip if no data for this day
      if (!dayData) continue;

      // Validate: Check if day is valid for the month
      const date = new Date(year, month - 1, day);
      if (date.getMonth() !== month - 1) {
        continue;  // Skip days outside the month
      }

      // Process valid day...
      records.push(transformDayData(emp, dayData, day));
    }
  }

  return records;
}
```

### Validation Flow

```
For each day (1-31):
  │
  ├─ Check if dayData exists?
  │   └─ No → continue (skip)
  │
  └─ Yes → Validate date
      │
      └─ Create Date object: new Date(year, month - 1, day)
          │
          ├─ getMonth() === month - 1?
          │   └─ Yes → Valid day, process
          │
          └─ No → Skip (day outside month)
```

### Date Validation Examples

| Requested | Date Object | getMonth() | Valid? |
|-----------|-------------|------------|--------|
| June 30, day_30 | June 30 | 5 | Yes |
| June 30, day_31 | July 1 | 6 | No (skip) |
| Feb 28, day_28 | Feb 28 | 1 | Yes |
| Feb 28, day_29 | Mar 1 | 2 | No (skip) |

---

## Common Scenarios

### Scenario 1: Work Day

```json
"day_15": {
  "hasWork": true,
  "isSunday": false,
  "isHoliday": false,
  "isCuti": false,
  "isSakit": false,
  "otHours": 0,
  "taskCode": "NORMAL",
  "date": "2026-06-15T08:00:00.000Z"
}
```

**Processing:**
- `hasWork: true` → Create attendance record
- `date` → Parse for `jam_masuk` (08:00:00)

### Scenario 2: Sunday (No Work)

```json
"day_7": {
  "hasWork": false,
  "isSunday": true,
  "isHoliday": false,
  "isCuti": false,
  "isSakit": false,
  "otHours": 0,
  "taskCode": null,
  "date": null
}
```

**Processing:**
- `hasWork: false` → Skip (no record created)
- Sunday marked for reference

### Scenario 3: Holiday

```json
"day_1": {
  "hasWork": true,
  "isSunday": false,
  "isHoliday": true,
  "holidayDesc": "Hari Raya Nyepi",
  "isCuti": false,
  "isSakit": false,
  "otHours": 0,
  "taskCode": "HOLIDAY-WORK",
  "date": "2026-06-01T09:00:00.000Z"
}
```

**Processing:**
- `hasWork: true` → Create record
- `isHoliday: true` → Mark in DB
- `holidayDesc` → Store holiday name

### Scenario 4: Leave (Cuti)

```json
"day_10": {
  "hasWork": false,
  "isSunday": false,
  "isHoliday": false,
  "isCuti": true,
  "isSakit": false,
  "otHours": 0,
  "taskCode": null,
  "date": null
}
```

**Processing:**
- `hasWork: false` → No work record
- `isCuti: true` → Mark leave status

### Scenario 5: Sick Leave

```json
"day_11": {
  "hasWork": false,
  "isSunday": false,
  "isHoliday": false,
  "isCuti": false,
  "isSakit": true,
  "otHours": 0,
  "taskCode": null,
  "date": null
}
```

**Processing:**
- `hasWork: false` → No work record
- `isSakit: true` → Mark sick leave

---

## Loop Implementation

### Standard Loop

```typescript
for (let day = 1; day <= 31; day++) {
  const dayKey = `day_${day}`;
  const dayData = emp[dayKey];

  if (!dayData) continue;

  // Check if day exists in month
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1) continue;

  // Process day...
}
```

### Alternative: Explicit Month Days

```typescript
const daysInMonth = new Date(year, month, 0).getDate();

for (let day = 1; day <= daysInMonth; day++) {
  const dayKey = `day_${day}`;
  const dayData = emp[dayKey];

  if (!dayData || !dayData.hasWork) continue;

  // Process only valid days
  records.push(processDay(emp, dayData, day, year, month));
}
```

---

## Edge Cases

### 1. Null Day Field

```typescript
// Day field is null - skip
if (!dayData) continue;
```

### 2. Day Outside Month

```typescript
// day_31 in June (30 days) - skip
const date = new Date(2026, 5, 31);  // June 31 = July 1
if (date.getMonth() !== 5) continue;  // 5 = June, skip
```

### 3. Leap Year February

```typescript
// Feb 29 exists only in leap years
const date = new Date(2024, 1, 29);  // Feb 29, 2024
// getMonth() === 1 (February) → Valid

const date = new Date(2025, 1, 29);  // Feb 29, 2025
// getMonth() === 2 (March) → Invalid, skip
```

### 4. Empty Employee Record

```json
{
  "empCode": "A0099",
  "empName": "New Employee",
  "day_1": null,
  "day_2": null
  // ... all null
}
```

**Processing:** All days null → Employee skipped for this month

---

## Summary Table

| Day Field | June (30 days) | February (28 days) | February (2024, leap) |
|-----------|----------------|-------------------|----------------------|
| day_28 | Valid | Valid | Valid |
| day_29 | Invalid | Invalid | Valid |
| day_30 | Valid | Invalid | Invalid |
| day_31 | Invalid | Invalid | Invalid |