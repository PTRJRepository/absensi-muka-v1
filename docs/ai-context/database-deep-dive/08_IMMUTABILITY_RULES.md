# 08_IMMUTABILITY_RULES.md

# Immutability Rules - PT Rebinmas Jaya Absensi System

## Core Principle

The system enforces a strict separation between **immutable raw data** and **mutable correction data**.

---

## The Two-Table Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌─────────────────────────────┐     ┌──────────────────────────────┐   │
│  │      absen_import │     │   absen_machine_input         │   │
│  │      (IMUTABLE)             │     │   (MUTABLE)                  │   │
│  │                             │     │                              │   │
│  │  Source of Truth │     │  Corrections/Overrides       │   │
│  │  from machines/API         │     │  manual edits                │   │
│  │                             │     │                              │   │
│  │  NEVER edit or delete      │     │  Can INSERT, UPDATE, DELETE  │   │
│  │                             │     │                              │   │
│  └─────────────────────────────┘     └──────────────────────────────┘   │
│                                                                          │
│                              │ │
│                              │ FULL OUTER JOIN                          │
│                              ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    getVerificationData()                         │   │
│  │                                                                  │   │
│  │  Priority: absen_machine_input > absen_import                    │   │
│  │  - If record exists in both: machine_input wins                 │   │
│  │  - If record only in import: use import value                   │   │
│  │  - If record only in machine_input: use machine_input value     │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## absen_import Rules (IMUTABLE)

### What You CAN Do

1. **INSERT** new records
   - Only from machine exports or API imports
   - Must include import_batch_id for tracking
   - Cannot insert duplicate (emp_code, division, year, month, day, import_batch_id)

2. **SELECT** data
   - Read for reports and verification
   - Use for historical analysis

3. **Query** with filters
   - Filter by division, year, month, emp_code
   - Aggregate for statistics

### What You CANNOT Do

1. **UPDATE** existing records
   - Even if data is wrong
   - Even if requested by management
   - Use absen_machine_input instead

2. **DELETE** records
   - Never delete from this table
   - If an employee left, ignore their future records

3. **ALTER** the table structure
   - Don't add/drop columns
   - Don't change data types
   - Don't remove constraints

### Why This Matters

1. **Audit Trail**
   - Original data is preserved
   - Can always see what machine/API reported

2. **Compliance**
   - Raw data cannot be manipulated
   - Corrections are separate and tracked

3. **Data Integrity**
   - Machine errors are documented
   - Corrections are visible

---

## absen_machine_input Rules (MUTABLE)

### What You CAN Do

1. **INSERT** new correction records
   - Override import data
   - Add missing records
   - Record manual entries

2. **UPDATE** existing corrections
   - Fix errors
   - Adjust values
   - Update notes

3. **DELETE** corrections
   - Remove wrong corrections
   - Revert to import-only data

4. **Track** who made changes
   - created_by field
   - updated_at timestamp
   - All changes logged to absen_change_log

### What You Should Do

1. **Always log changes**
   - Use logChange() method
   - Track old and new values
   - Record who made the change

2. **Add notes**
   - Explain why correction was made
   - Reference supporting documents
   - Include approval if required

3. **Use input_type appropriately**
   - MANUAL - Regular manual entry
   - CORRECTION - Error correction
   - OVERRIDE - Management override

---

## Verification Logic

### Merge Priority

```
Priority 1: absen_machine_input (if exists)
Priority 2: absen_import (fallback)
```

### Example Scenarios

#### Scenario 1: Import Only
```
absen_import: { emp_code: "A0001", day: 7, has_work: 1 }
absen_machine_input: (no record)

Verification Result:
  has_work: 1
  source: "IMPORT"
```

#### Scenario 2: Machine Input Override
```
absen_import: { emp_code: "A0001", day: 7, has_work: 0 }
absen_machine_input: { emp_code: "A0001", day: 7, has_work: 1 }

Verification Result:
  has_work: 1
  source: "MACHINE_INPUT"
  has_conflict: true
```

#### Scenario 3: Machine Input Only
```
absen_import: (no record)
absen_machine_input: { emp_code: "A0001", day: 7, has_work: 1 }

Verification Result:
  has_work: 1
  source: "MACHINE_INPUT"
```

#### Scenario 4: No Data
```
absen_import: (no record)
absen_machine_input: (no record)

Verification Result:
  (no record returned)
```

---

## Conflict Detection

### What Creates a Conflict?

A conflict occurs when:
1. Record exists in BOTH tables
2. At least one field value differs

### Conflict Fields

The system tracks conflicts for these fields:
- has_work
- is_sunday
- is_holiday
- holiday_desc
- is_cuti
- is_sakit
- task_code
- ot_hours

### How Conflicts Are Flagged

```typescript
CASE WHEN m.id IS NOT NULL AND i.id IS NOT NULL
     AND m.has_work <> i.has_work THEN 1
     ELSE 0 END as has_conflict
```

### Handling Conflicts

1. **Review conflicts regularly**
   - Query for has_conflict =1
   - Investigate discrepancies

2. **Document resolution**
   - Use notes field
   - Reference approval

3. **Keep both records**
   - Never delete import data
   - Machine input is the final answer

---

## Change Logging

### Why Log Changes?

1. **Accountability**
   - Who made the change?
   - When was it made?

2. **Audit Trail**
   - What was the old value?
   - What is the new value?

3. **Troubleshooting**
   - Track correction patterns
   - Identify data quality issues

### What Gets Logged?

Every change to absen_machine_input:
- ADD: New record inserted
- EDIT: Existing record modified
- DELETE: Record deleted

### Logged Fields

For each field that changes:
- field_name
- old_value
- new_value

### Example Log Entry

```sql
-- Employee A0001 had their work status corrected
INSERT INTO absen_change_log (
  emp_code, division, year, month, day,
  field_name, old_value, new_value,
  change_type, source_table, changed_by
) VALUES (
  'A0001', 'PG1A', 2026, 6, 7,
  'has_work', '0', '1',
  'EDIT', 'absen_machine_input', 'admin'
);
```

---

## Best Practices

### Do

1. **Use absen_machine_input for corrections**
   - Don't modify absen_import directly
   - Create new record in machine_input

2. **Log all changes**
   - Use the logChange() method
   - Include meaningful notes

3. **Document reasons**
   - Add notes explaining corrections
   - Reference supporting documents

4. **Review conflicts**
   - Check has_conflict flag regularly
   - Verify corrections are valid

5. **Keep import data intact**
   - Never delete from absen_import
   - Preserve original machine data

### Don't

1. **Don't update absen_import directly**
   - Even if data looks wrong
   - Even for one-time fixes

2. **Don't delete import records**
   - Use machine_input to override
   - Keep original data

3. **Don't skip logging**
   - All changes must be logged
   - Track old and new values

4. **Don't hide conflicts**
   - Report conflicts to management
   - Document resolution

5. **Don't bulk delete machine_input**
   - Delete records individually
   - Log each deletion

---

## Code Enforcement

### Service Layer

```typescript
// insertImportBatch - only inserts, never updates
async insertImportBatch(records, ...) {
  // INSERT only - no UPDATE logic
}

// upsertMachineInput - allows updates
async upsertMachineInput(record, ...) {
  // Can INSERT or UPDATE
}

// deleteMachineInput - allows deletes
async deleteMachineInput(empCode, ...) {
  // Can DELETE
}
```

### Database Constraints

```sql
-- absen_import: is_locked = 1 (immutable flag)
is_locked BIT DEFAULT 1

-- absen_machine_input: no lock flag (mutable)
-- (no constraint preventing edits)
```

---

## Verification Query

### Check Immutability

```sql
-- Verify no updates to absen_import
SELECT COUNT(*) as update_count
FROM absen_change_log
WHERE source_table = 'absen_import'
  AND change_type = 'EDIT';

-- Should return 0
```

### Check Change Activity

```sql
-- Recent changes to machine_input
SELECT TOP 20
  emp_code,
  field_name,
  old_value,
  new_value,
  changed_by,
  changed_at
FROM absen_change_log
WHERE source_table = 'absen_machine_input'
ORDER BY changed_at DESC;
```

### Check Conflicts

```sql
-- Records with conflicts
SELECT
  i.emp_code,
  i.division,
  i.year,
  i.month,
  i.day,
  i.has_work as import_has_work,
  m.has_work as machine_has_work
FROM absen_import i
JOIN absen_machine_input m
  ON i.emp_code = m.emp_code
  AND i.division = m.division
  AND i.year = m.year
  AND i.month = m.month
  AND i.day = m.day
WHERE i.has_work <> m.has_work;
```
