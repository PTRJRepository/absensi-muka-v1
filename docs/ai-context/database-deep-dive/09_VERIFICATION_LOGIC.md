# 09_VERIFICATION_LOGIC.md

# Verification Logic - PT Rebinmas Jaya Absensi System

## Overview

The verification system merges raw import data with manual corrections to produce a single, authoritative view of attendance records.

---

## Concept

```
┌─────────────────────┐         ┌─────────────────────┐
│    absen_import     │         │ absen_machine_input │
│    (IMUTABLE)       │         │    (MUTABLE)        │
│                     │         │                     │
│  Raw from machines  │         │  Manual corrections │
│  or API             │         │                     │
└─────────┬───────────┘         └──────────┬──────────┘
          │                                  │
          │ │
          └──────────────┬───────────────────┘
                         │
                         │ FULL OUTER JOIN
                         ▼
          ┌─────────────────────────────┐
          │  getVerificationData()     │
          │ │
          │  Priority:                  │
          │  machine_input > import │
          │                             │
          │  COALESCE for all fields  │
          │                             │
          │  Conflict detection │
          └─────────────┬───────────────┘
                        │
                        ▼
          ┌─────────────────────────────┐
          │ AbsenVerificationRecord[]  │
          │                             │
          │  - Final values │
          │  - Source indicator │
          │  - Conflict flag │
          └─────────────────────────────┘
```

---

## The Merge Query

```typescript
async getVerificationData(
  division: string,
  year: number,
  month: number
): Promise<AbsenVerificationRecord[]> {
  const result = await sqlClient.query(`
    SELECT
      COALESCE(m.emp_code, i.emp_code) as emp_code,
      COALESCE(m.emp_name, i.emp_name) as emp_name,
      COALESCE(m.gang_code, i.gang_code) as gang_code,
      COALESCE(m.division, i.division) as division,
      COALESCE(m.year, i.year) as year,
      COALESCE(m.month, i.month) as month,
      COALESCE(m.day, i.day) as day,

      COALESCE(m.has_work, i.has_work) as has_work,
      COALESCE(m.is_sunday, i.is_sunday) as is_sunday,
      COALESCE(m.is_holiday, i.is_holiday) as is_holiday,
      COALESCE(m.holiday_desc, i.holiday_desc) as holiday_desc,
      COALESCE(m.is_cuti, i.is_cuti) as is_cuti,
      COALESCE(m.is_sakit, i.is_sakit) as is_sakit,
      COALESCE(m.task_code, i.task_code) as task_code,
      COALESCE(m.ot_hours, i.ot_hours) as ot_hours,
      COALESCE(m.attendance_date, i.attendance_date) as attendance_date,

      i.id as import_id,
      m.id as machine_input_id,

      CASE WHEN m.id IS NOT NULL THEN 'MACHINE_INPUT'
           WHEN i.id IS NOT NULL THEN 'IMPORT'
           ELSE 'NONE' END as source,

      i.has_work as import_has_work,
      m.has_work as machine_has_work,
      CASE WHEN m.id IS NOT NULL AND i.id IS NOT NULL
           AND m.has_work <> i.has_work THEN 1
           ELSE 0 END as has_conflict

    FROM absen_import i
    FULL OUTER JOIN absen_machine_input m
      ON i.emp_code = m.emp_code
      AND i.division = m.division
      AND i.year = m.year
      AND i.month = m.month
      AND i.day = m.day

    WHERE COALESCE(i.division, m.division) = '${division}'
      AND COALESCE(i.year, m.year) = ${year}
      AND COALESCE(i.month, m.month) = ${month}

    ORDER BY COALESCE(m.emp_code, i.emp_code), COALESCE(m.day, i.day)
  `);

  return result?.recordset || [];
}
```

---

## Key Concepts

### 1. FULL OUTER JOIN

Ensures all records from both tables are included:
- Records only in import
- Records only in machine_input
- Records in both

### 2. COALESCE Priority

```sql
COALESCE(machine_input_value, import_value)
```

If machine_input has a value, use it. Otherwise, fall back to import value.

### 3. Source Indicator

```sql
CASE WHEN m.id IS NOT NULL THEN 'MACHINE_INPUT'
     WHEN i.id IS NOT NULL THEN 'IMPORT'
     ELSE 'NONE' END as source
```

Tells you where the final value came from.

### 4. Conflict Detection

```sql
CASE WHEN m.id IS NOT NULL AND i.id IS NOT NULL
     AND m.has_work <> i.has_work THEN 1
     ELSE 0 END as has_conflict
```

Flags records where both tables have data but values differ.

---

## Merge Scenarios

### Scenario 1: Import Only (No Correction)

```
Input:
  absen_import:     { emp_code: "A0001", day: 7, has_work: 1, is_sakit: 0 }
  absen_machine_input: (empty)

Output:
  { emp_code: "A0001", day: 7, has_work: 1, is_sakit: 0,
    source: "IMPORT", import_id: 123, machine_input_id: NULL, has_conflict: 0 }
```

### Scenario 2: Correction Override

```
Input:
  absen_import:     { emp_code: "A0001", day: 7, has_work: 0, is_sakit: 0 }
  absen_machine_input: { emp_code: "A0001", day: 7, has_work: 1, is_sakit: 1 }

Output:
  { emp_code: "A0001", day: 7, has_work: 1, is_sakit: 1,
    source: "MACHINE_INPUT", import_id: 123, machine_input_id: 456, has_conflict: 1 }
```

### Scenario 3: New Manual Entry (No Import)

```
Input:
  absen_import:     (empty)
  absen_machine_input: { emp_code: "A0001", day: 7, has_work: 1, is_cuti: 1 }

Output:
  { emp_code: "A0001", day: 7, has_work: 1, is_cuti: 1,
    source: "MACHINE_INPUT", import_id: NULL, machine_input_id: 789, has_conflict: 0 }
```

### Scenario 4: Partial Correction

```
Input:
  absen_import:     { emp_code: "A0001", day: 7, has_work: 1, is_sakit: 0, ot_hours: 0 }
  absen_machine_input: { emp_code: "A0001", day: 7, has_work: 1, is_sakit: 0, ot_hours: 2 }

Output:
  { emp_code: "A0001", day: 7, has_work: 1, is_sakit: 0, ot_hours: 2,
    source: "MACHINE_INPUT", import_id: 123, machine_input_id: 456, has_conflict: 0 }
    Note: has_work and is_sakit match, only ot_hours differs
```

### Scenario 5: Multiple Field Conflicts

```
Input:
  absen_import:     { emp_code: "A0001", day: 7, has_work: 1, is_sakit: 0, is_cuti: 0 }
  absen_machine_input: { emp_code: "A0001", day: 7, has_work: 0, is_sakit: 1, is_cuti: 0 }

Output:
  { emp_code: "A0001", day: 7, has_work: 0, is_sakit: 1, is_cuti: 0,
    source: "MACHINE_INPUT", import_id: 123, machine_input_id: 456, has_conflict: 1 }
    Note: has_work and is_sakit both differ - all differences flagged
```

---

## AbsenVerificationRecord Structure

```typescript
export interface AbsenVerificationRecord extends AbsenRecord {
  // IDs from source tables
  import_id?: number;
  machine_input_id?: number;

  // Source indicator
  source: "IMPORT" | "MACHINE_INPUT" | "MERGED";

  // Conflict tracking
  import_value?: any;      // Value from import (if different)
  machine_input_value?: any; // Value from machine_input (if different)
  has_conflict?: boolean;  // True if both exist and differ
}
```

---

## Usage Examples

### Example 1: Basic Verification

```typescript
const data = await absensiService.getVerificationData("PG1A", 2026, 6);

console.log("Verification Results:");
data.forEach(record => {
  console.log(`${record.emp_code} day ${record.day}: ${record.has_work} (${record.source})`);
});
```

### Example 2: Find All Conflicts

```typescript
const data = await absensiService.getVerificationData("PG1A", 2026, 6);
const conflicts = data.filter(r => r.has_conflict);

console.log(`Found ${conflicts.length} conflicts:`);
conflicts.forEach(c => {
  console.log(`${c.emp_code} day ${c.day}:`);
  console.log(`  Import: has_work=${c.import_value?.has_work}`);
  console.log(`  Machine: has_work=${c.machine_input_value?.has_work}`);
});
```

### Example 3: Get Records by Source

```typescript
const data = await absensiService.getVerificationData("PG1A", 2026, 6);

const fromImport = data.filter(r => r.source === "IMPORT");
const fromCorrection = data.filter(r => r.source === "MACHINE_INPUT");

console.log(`From import: ${fromImport.length}`);
console.log(`From corrections: ${fromCorrection.length}`);
```

### Example 4: Generate Report

```typescript
const data = await absensiService.getVerificationData("PG1A", 2026, 6);

const report = {
  total: data.length,
  present: data.filter(r => r.has_work).length,
  absent: data.filter(r => !r.has_work).length,
  sick: data.filter(r => r.is_sakit).length,
  leave: data.filter(r => r.is_cuti).length,
  holiday: data.filter(r => r.is_holiday).length,
  conflicts: data.filter(r => r.has_conflict).length,
};

console.log("Attendance Report:", report);
```

---

## Conflict Resolution

### Step 1: Identify Conflicts

```typescript
const conflicts = data.filter(r => r.has_conflict);
```

### Step 2: Get Change History

```typescript
for (const conflict of conflicts) {
  const changes = await absensiService.getChangeLog(
    conflict.emp_code,
    conflict.division,
    conflict.year,
    conflict.month
  );

  console.log(`History for ${conflict.emp_code}:`);
  changes.forEach(c => {
    console.log(`  ${c.changed_at}: ${c.field_name} ${c.old_value} -> ${c.new_value}`);
  });
}
```

### Step 3: Verify Corrections

Review each conflict:
- Is the correction valid?
- Is there supporting documentation?
- Was it properly approved?

### Step 4: Report

```typescript
const conflictReport = conflicts.map(c => ({
  emp_code: c.emp_code,
  day: c.day,
  import_value: c.import_value,
  correction_value: c.machine_input_value,
  reason: "Manual correction"
}));

console.table(conflictReport);
```

---

## Performance Considerations

### Index Usage

The query relies on these indexes:
- absen_import: (division, year, month, emp_code)
- absen_machine_input: (division, year, month, emp_code)

### Large Datasets

For very large datasets, consider:
1. Filtering by specific emp_code ranges
2. Paginating results
3. Using TOP/LIMIT

### FULL OUTER JOIN Cost

FULL OUTER JOIN can be expensive on large tables. If performance is an issue:
1. Query each table separately
2. Merge in application code
3. Use EXISTS checks instead

---

## Testing Verification Logic

```typescript
// test-verification.ts
import { absensiService } from "./absensi-service.ts";

async function testVerification() {
  console.log("Testing verification logic...\n");

  // Test data
  const division = "PG1A";
  const year = 2026;
  const month = 6;

  // Get verification data
  const data = await absensiService.getVerificationData(division, year, month);
  console.log(`Total records: ${data.length}`);

  // Count by source
  const importOnly = data.filter(r => r.source === "IMPORT");
  const corrected = data.filter(r => r.source === "MACHINE_INPUT");
  const conflicts = data.filter(r => r.has_conflict);

  console.log(`From import only: ${importOnly.length}`);
  console.log(`From corrections: ${corrected.length}`);
  console.log(`Conflicts: ${conflicts.length}`);

  // List conflicts
  if (conflicts.length > 0) {
    console.log("\nConflicts found:");
    conflicts.forEach(c => {
      console.log(`  ${c.emp_code} day ${c.day}`);
    });
  }
}

testVerification();
```

---

## Summary

| Aspect | Description |
|--------|-------------|
| Join Type | FULL OUTER JOIN |
| Priority | machine_input > import |
| Null Handling | COALESCE |
| Conflict Detection | Field comparison when both exist |
| Source Tracking | CASE statement |
| Use Case | Final attendance view for reports |
