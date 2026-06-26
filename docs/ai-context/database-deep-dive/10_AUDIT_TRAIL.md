# 10_AUDIT_TRAIL.md

# Audit Trail - PT Rebinmas Jaya Absensi System

## Overview

The system maintains a comprehensive audit trail through the `absen_change_log` table, tracking all modifications to mutable attendance data.

---

## Audit Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│ ┌─────────────────────────────┐                                        │
│  │  User Action               │                                        │
│  │  (Admin Correction)        │                                        │
│  └──────────────┬──────────────┘                                        │
│                 │                                                       │
│                 ▼                                                       │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │  AbsensiService.upsertMachineInput()                          │     │
│  │                                                              │     │
│  │  1. Check if record exists                                  │     │
│  │  2. If exists: UPDATE + logChange(EDIT)                     │     │
│  │  3. If not exists: INSERT + logChange(ADD)                  │     │
│  │                                                              │     │
│  └────────────────────────────┬─────────────────────────────────┘     │
│                               │                                          │
│                               ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │  absen_machine_input                                       │     │
│  │  (Record is updated/inserted)                             │     │
│  └────────────────────────────┬─────────────────────────────────┘     │
│                               │                                          │
│                               ▼                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │  absen_change_log                                          │     │
│  │  (Audit entry created)                                     │     │
│  │                                                              │     │
│  │  - Who made the change?                                    │     │
│  │  - What was changed?                                       │     │
│  │  - When did it happen?                                     │     │
│  │  - Why was it changed?                                     │     │
│  │                                                              │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## absen_change_log Table

```sql
CREATE TABLE absen_change_log (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    emp_code            NVARCHAR(50) NOT NULL,
    division NVARCHAR(50) NOT NULL,
    year                INT NOT NULL,
    month               INT NOT NULL,
    day INT NOT NULL,
    field_name          NVARCHAR(50),
    old_value           NVARCHAR(MAX),
    new_value           NVARCHAR(MAX),
    change_type         NVARCHAR(20) NOT NULL,
    source_table        NVARCHAR(50),
    changed_by          NVARCHAR(100),
    changed_at          DATETIME DEFAULT GETDATE()
);
```

### Columns

| Column | Type | Description |
|--------|------|-------------|
| id | INT | Auto-increment primary key |
| emp_code | NVARCHAR(50) | Employee code |
| division | NVARCHAR(50) | Division code |
| year, month, day | INT | Date of the record |
| field_name | NVARCHAR(50) | Field that changed |
| old_value | NVARCHAR(MAX) | Previous value |
| new_value | NVARCHAR(MAX) | New value |
| change_type | NVARCHAR(20) | ADD, EDIT, or DELETE |
| source_table | NVARCHAR(50) | Table that was modified |
| changed_by | NVARCHAR(100) | User who made the change |
| changed_at | DATETIME | When the change occurred |

---

## Change Types

### ADD

New record inserted into absen_machine_input.

```typescript
// When inserting a new correction
await this.logChange(newRecord, null, "ADD", "absen_machine_input", changedBy);
```

**Example Log Entry:**
```
emp_code: A0001
division: PG1A
year: 2026
month: 6
day: 7
field_name: has_work
old_value: NULL
new_value: 1
change_type: ADD
source_table: absen_machine_input
changed_by: admin
changed_at: 2026-06-07 10:30:00
```

### EDIT

Existing record modified.

```typescript
// When updating a correction
await this.logChange(newRecord, oldRecord, "EDIT", "absen_machine_input", changedBy);
```

**Example Log Entry:**
```
emp_code: A0001
division: PG1A
year: 2026
month: 6
day: 7
field_name: is_sakit
old_value: 0
new_value: 1
change_type: EDIT
source_table: absen_machine_input
changed_by: supervisor
changed_at: 2026-06-07 14:45:00
```

### DELETE

Record deleted from absen_machine_input.

```typescript
// When deleting a correction
await this.logChange(record, oldRecord, "DELETE", "absen_machine_input", changedBy);
```

**Example Log Entry:**
```
emp_code: A0001
division: PG1A
year: 2026
month: 6
day: 7
field_name: has_work
old_value: 1
new_value: NULL
change_type: DELETE
source_table: absen_machine_input
changed_by: admin
changed_at: 2026-06-07 16:00:00
```

---

## Tracked Fields

The system tracks changes for these attendance fields:

| Field | Type | Description |
|-------|------|-------------|
| has_work | BIT | Employee worked that day |
| is_sunday | BIT | Day is Sunday |
| is_holiday | BIT | Day is holiday |
| holiday_desc | NVARCHAR(255) | Holiday description |
| is_cuti | BIT | On leave |
| is_sakit | BIT | Sick |
| task_code | NVARCHAR(50) | Task assignment |
| ot_hours | DECIMAL(5,2) | Overtime hours |

---

## The logChange() Method

```typescript
private async logChange(
  newRecord: any,
  oldRecord: any,
  changeType: "ADD" | "EDIT" | "DELETE",
  sourceTable: string,
  changedBy?: string
): Promise<void> {
  const fields = [
    "has_work", "is_sunday", "is_holiday", "holiday_desc",
    "is_cuti", "is_sakit", "task_code", "ot_hours"
  ];

  for (const field of fields) {
    const oldValue = oldRecord?.[field];
    const newValue = newRecord[field];

    if (oldValue !== newValue) {
      await sqlClient.execute(`
        INSERT INTO absen_change_log (
          emp_code, division, year, month, day,
          field_name, old_value, new_value,
          change_type, source_table, changed_by
        ) VALUES (
          '${newRecord.emp_code}',
          '${newRecord.division}',
          ${newRecord.year},
          ${newRecord.month},
          ${newRecord.day},
          '${field}',
          ${oldValue !== undefined ? `'${oldValue}'` : 'NULL'},
          ${newValue !== undefined ? `'${newValue}'` : 'NULL'},
          '${changeType}',
          '${sourceTable}',
          ${changedBy ? `'${changedBy}'` : 'NULL'}
        )
      `);
    }
  }
}
```

### Key Features

1. **Field-by-Field Tracking**
   - Each field change creates a separate log entry
   - No need to track entire record changes

2. **Value Comparison**
   - Only logs when values actually differ
   - Ignores unchanged fields

3. **Null Handling**
   - Properly handles NULL values
   - Tracks transitions to/from NULL

4. **Optional User Tracking**
   - changedBy can be NULL for system changes
   - Usually populated for manual changes

---

## Querying the Audit Log

### Get All Changes for an Employee

```typescript
async getChangeLog(
  empCode?: string,
  division?: string,
  year?: number,
  month?: number,
  limit: number = 100
): Promise<ChangeLogEntry[]> {
  let whereClause = "1=1";
  if (empCode) whereClause += ` AND emp_code = '${empCode}'`;
  if (division) whereClause += ` AND division = '${division}'`;
  if (year) whereClause += ` AND year = ${year}`;
  if (month) whereClause += ` AND month = ${month}`;

  const result = await sqlClient.query(`
    SELECT TOP ${limit} * FROM absen_change_log
    WHERE ${whereClause}
    ORDER BY changed_at DESC
  `);

  return result?.recordset || [];
}
```

### Get Recent Changes

```sql
SELECT TOP 50
  emp_code,
  division,
  field_name,
  old_value,
  new_value,
  change_type,
  changed_by,
  changed_at
FROM absen_change_log
ORDER BY changed_at DESC;
```

### Get Changes by User

```sql
SELECT
  changed_by,
  COUNT(*) as change_count,
  MIN(changed_at) as first_change,
  MAX(changed_at) as last_change
FROM absen_change_log
WHERE changed_by IS NOT NULL
GROUP BY changed_by
ORDER BY change_count DESC;
```

### Get Changes by Field

```sql
SELECT
  field_name,
  COUNT(*) as change_count
FROM absen_change_log
GROUP BY field_name
ORDER BY change_count DESC;
```

### Get Changes for a Specific Date

```sql
SELECT
  emp_code,
  division,
  day,
  field_name,
  old_value,
  new_value,
  change_type,
  changed_by
FROM absen_change_log
WHERE year = 2026 AND month = 6 AND day = 7
ORDER BY emp_code, field_name;
```

### Get DELETE Operations

```sql
SELECT
  emp_code,
  division,
  year,
  month,
  day,
  field_name,
  old_value,
  changed_by,
  changed_at
FROM absen_change_log
WHERE change_type = 'DELETE'
ORDER BY changed_at DESC;
```

---

## Change Log Service Methods

### upsertMachineInput()

Called before and after modifying absen_machine_input.

```typescript
async upsertMachineInput(record, changedBy) {
  // Check if exists
  const existing = await sqlClient.query(`SELECT * FROM absen_machine_input WHERE ...`);

  if (existing?.recordset?.length > 0) {
    // UPDATE case
    const oldRecord = await sqlClient.query(`SELECT * FROM absen_machine_input WHERE id = ...`);
    await this.logChange(record, oldRecord?.recordset?.[0], "EDIT", "absen_machine_input", changedBy);
    await sqlClient.execute(`UPDATE absen_machine_input SET ...`);
  } else {
    // INSERT case
    await sqlClient.execute(`INSERT INTO absen_machine_input ...`);
    await this.logChange(record, null, "ADD", "absen_machine_input", changedBy);
  }
}
```

### deleteMachineInput()

Called before deleting from absen_machine_input.

```typescript
async deleteMachineInput(empCode, division, year, month, day, changedBy) {
  const existing = await sqlClient.query(`SELECT * FROM absen_machine_input WHERE ...`);

  if (existing?.recordset?.length > 0) {
    const record = { emp_code: empCode, division, year, month, day };
    await this.logChange(record, existing.recordset[0], "DELETE", "absen_machine_input", changedBy);
    await sqlClient.execute(`DELETE FROM absen_machine_input WHERE ...`);
    return true;
  }
  return false;
}
```

---

## Audit Report Example

```typescript
async function generateAuditReport(division: string, year: number, month: number) {
  const changes = await absensiService.getChangeLog(undefined, division, year, month, 1000);

  // Group by employee
  const byEmployee = new Map();
  changes.forEach(c => {
    if (!byEmployee.has(c.emp_code)) {
      byEmployee.set(c.emp_code, []);
    }
    byEmployee.get(c.emp_code).push(c);
  });

  // Generate report
  console.log(`Audit Report: ${division} - ${month}/${year}`);
  console.log("=".repeat(60));

  for (const [empCode, empChanges] of byEmployee) {
    console.log(`\nEmployee: ${empCode}`);
    console.log(` Total changes: ${empChanges.length}`);

    const byType = {
      ADD: empChanges.filter(c => c.change_type === 'ADD').length,
      EDIT: empChanges.filter(c => c.change_type === 'EDIT').length,
      DELETE: empChanges.filter(c => c.change_type === 'DELETE').length,
    };
    console.log(`  ADD: ${byType.ADD}, EDIT: ${byType.EDIT}, DELETE: ${byType.DELETE}`);

    empChanges.forEach(c => {
      console.log(`    ${c.changed_at}: ${c.field_name} ${c.old_value} -> ${c.new_value} (${c.change_type})`);
    });
  }
}
```

---

## Retention Policy

| Data | Retention | Notes |
|------|-----------|-------|
| absen_change_log | Permanent | Keep all audit data |
| absen_import_batch | Permanent | Track import history |
| absen_sync_log | 180 days | Can purge old sync logs |

---

## Security Considerations

### Who Can View Audit Logs?

- All users with access to the system can view
- Consider role-based access for sensitive corrections

### Who Can Modify Audit Logs?

- NO ONE should modify the audit log
- absen_change_log should be append-only
- No UPDATE or DELETE on this table

### Recommendations

1. **Create a view for audit data**
   ```sql
   CREATE VIEW v_change_log_no_delete AS
   SELECT * FROM absen_change_log; -- Read-only access
   ```

2. **Restrict direct table access**
   - Only service accounts can INSERT
   - No direct UPDATE/DELETE permissions

3. **Monitor for tampering**
   - Alert on unexpected changes to audit records
   - Regular audit of audit log itself

---

## Summary

| Aspect | Description |
|--------|-------------|
| Table | absen_change_log |
| Purpose | Track all modifications to mutable data |
| Change Types | ADD, EDIT, DELETE |
| Tracked Fields | has_work, is_sunday, is_holiday, is_cuti, is_sakit, task_code, ot_hours |
| User Tracking | changed_by field |
| Timestamp | changed_at field |
| Retention | Permanent |
