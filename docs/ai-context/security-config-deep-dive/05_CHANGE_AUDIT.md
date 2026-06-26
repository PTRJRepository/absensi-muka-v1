# Change Audit Documentation

> **Classification:** Internal Use Only  
> **Version:** 1.0.0  
> **Last Updated:** 2026-06-07

---

## Overview

This document describes the change audit and logging mechanism implemented in the Absensi system for tracking all data modifications.

---

## Audit Architecture

### Two-Layer Audit System

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA MODIFICATION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────┐          │
│  │ absen_import       │    │ absen_machine_input  │          │
│  │   (IMUTABLE)         │    │   (MUTABLE)          │          │
│  │ │    │                      │          │
│  │ - No direct edits   │    │  - Can be modified   │          │
│  │  - Batch inserts only│    │  - Full CRUD ops     │          │
│  │  - Locked records    │    │  - Manual override │          │
│  └──────────────────────┘    └──────────────────────┘          │
│ │                          │                         │
│            └──────────┬───────────────┘ │
│                       ▼ │
│              ┌──────────────────┐                               │
│              │ absen_change_log │ │
│              │                  │                               │
│              │ Audit Trail      │                               │
│              │ Field-level │                               │
│              │ Tracking         │                               │
│              └──────────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Change Log Schema

### absen_change_log Table

```sql
CREATE TABLE absen_change_log (
  id INT IDENTITY(1,1) PRIMARY KEY,
  emp_code NVARCHAR(50) NOT NULL,
  division NVARCHAR(50) NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  day INT NOT NULL,
  field_name NVARCHAR(50),
  old_value NVARCHAR(MAX),
  new_value NVARCHAR(MAX),
  change_type NVARCHAR(20) NOT NULL,
  source_table NVARCHAR(50),
  changed_by NVARCHAR(100),
  changed_at DATETIME DEFAULT GETDATE()
);
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | INT | Auto-increment primary key |
| `emp_code` | NVARCHAR(50) | Employee code affected |
| `division` | NVARCHAR(50) | Division of the record |
| `year` | INT | Year of attendance |
| `month` | INT | Month of attendance |
| `day` | INT | Day of attendance |
| `field_name` | NVARCHAR(50) | Field that changed |
| `old_value` | NVARCHAR(MAX) | Previous value |
| `new_value` | NVARCHAR(MAX) | New value |
| `change_type` | NVARCHAR(20) | ADD, EDIT, or DELETE |
| `source_table` | NVARCHAR(50) | Table where change occurred |
| `changed_by` | NVARCHAR(100) | User who made change |
| `changed_at` | DATETIME | Timestamp of change |

---

## Change Types

### Supported Operations

| Change Type | Source Table | Description |
|-------------|--------------|-------------|
| `ADD` | absen_machine_input | New record inserted |
| `EDIT` | absen_machine_input | Existing record modified |
| `DELETE` | absen_machine_input | Record deleted |

### Tracked Fields

The following fields are tracked for changes:

```typescript
const TRACKED_FIELDS = [
  "has_work",
  "is_sunday",
  "is_holiday",
  "holiday_desc",
  "is_cuti",
  "is_sakit",
  "task_code",
  "ot_hours"
];
```

---

## Change Logging Implementation

### Service Method: logChange

```typescript
// From absensi-service.ts
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

### Automatic Logging on Operations

#### Insert (ADD)

```typescript
async upsertMachineInput(
  record: Omit<AbsenRecord, "id" | "created_at" | "updated_at">,
  changedBy?: string
): Promise<number> {
  // ... existing record check ...

  if (existing?.recordset?.length > 0) {
    // UPDATE operation - log changes
    const oldRecord = await sqlClient.query(`SELECT * FROM absen_machine_input WHERE id = ${existing.recordset[0].id}`);
    await this.logChange(record, oldRecord?.recordset?.[0], "EDIT", "absen_machine_input", changedBy);
    // ... perform update ...
  } else {
    // INSERT operation - log ADD
    await this.logChange(record, null, "ADD", "absen_machine_input", changedBy);
    // ... perform insert ...
  }
}
```

#### Delete (DELETE)

```typescript
async deleteMachineInput(
  empCode: string,
  division: string,
  year: number,
  month: number,
  day: number,
  changedBy?: string
): Promise<boolean> {
  const existing = await sqlClient.query(`SELECT * FROM absen_machine_input WHERE ...`);

  if (existing?.recordset?.length > 0) {
    const record = { emp_code: empCode, division, year, month, day };
    await this.logChange(record, existing.recordset[0], "DELETE", "absen_machine_input", changedBy);
    // ... perform delete ...
  }
}
```

---

## Querying Change Log

### Get All Changes for Employee

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

### Common Audit Queries

#### Recent Changes (Last 24 Hours)

```sql
SELECT TOP 100
    changed_at,
    emp_code,
    field_name,
    old_value,
    new_value,
    change_type,
    changed_by
FROM absen_change_log
WHERE changed_at >= DATEADD(HOUR, -24, GETDATE())
ORDER BY changed_at DESC;
```

#### Changes by User

```sql
SELECT
    changed_by,
    COUNT(*) as change_count,
    MAX(changed_at) as last_change
FROM absen_change_log
WHERE changed_by IS NOT NULL
GROUP BY changed_by
ORDER BY change_count DESC;
```

#### Field-Level Changes

```sql
SELECT
    field_name,
    COUNT(*) as change_count
FROM absen_change_log
WHERE changed_at >= DATEADD(DAY, -30, GETDATE())
GROUP BY field_name
ORDER BY change_count DESC;
```

#### Conflict Resolution History

```sql
SELECT
    emp_code,
    division,
    year,
    month,
    day,
    COUNT(*) as edit_count,
    STRING_AGG(field_name, ', ') as changed_fields
FROM absen_change_log
WHERE change_type = 'EDIT'
GROUP BY emp_code, division, year, month, day
HAVING COUNT(*) > 1
ORDER BY edit_count DESC;
```

---

## Batch Import Tracking

### absen_import_batch Table

```sql
CREATE TABLE absen_import_batch (
  id INT IDENTITY(1,1) PRIMARY KEY,
  batch_id NVARCHAR(100) UNIQUE NOT NULL,
  division NVARCHAR(50) NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  total_records INT DEFAULT 0,
  imported_records INT DEFAULT 0,
  status NVARCHAR(50) DEFAULT 'PENDING',
  import_started_at DATETIME DEFAULT GETDATE(),
  import_completed_at DATETIME,
  error_message NVARCHAR(MAX),
  imported_by NVARCHAR(100) DEFAULT 'SYSTEM'
);
```

### Batch Status Values

| Status | Description |
|--------|-------------|
| `PENDING` | Batch created, not started |
| `IN_PROGRESS` | Import in progress |
| `COMPLETED` | All records imported successfully |
| `COMPLETED_WITH_ERRORS` | Some records failed |
| `FAILED` | Import failed completely |

---

## Sync Log Tracking

### absen_sync_log Table

```sql
CREATE TABLE absen_sync_log (
  id INT IDENTITY(1,1) PRIMARY KEY,
  sync_date DATETIME DEFAULT GETDATE(),
  division NVARCHAR(50),
  year INT,
  month INT,
  mode NVARCHAR(10),
  records_synced INT DEFAULT 0,
  status NVARCHAR(50) DEFAULT 'SUCCESS',
  error_message NVARCHAR(MAX),
  duration_ms INT DEFAULT 0
);
```

### Sync Status Values

| Status | Description |
|--------|-------------|
| `SUCCESS` | Sync completed successfully |
| `FAILED` | Sync failed with error |
| `PARTIAL` | Some divisions failed |

---

## Audit Report Generation

### Daily Change Summary

```typescript
async function generateDailyAuditReport(date: Date): Promise<string> {
  const startOfDay = new Date(date.setHours(0, 0, 0, 0));
  const endOfDay = new Date(date.setHours(23, 59, 59, 999));

  const result = await sqlClient.query(`
    SELECT
      COUNT(*) as total_changes,
      SUM(CASE WHEN change_type = 'ADD' THEN 1 ELSE 0 END) as adds,
      SUM(CASE WHEN change_type = 'EDIT' THEN 1 ELSE 0 END) as edits,
      SUM(CASE WHEN change_type = 'DELETE' THEN 1 ELSE 0 END) as deletes,
      COUNT(DISTINCT changed_by) as unique_users
    FROM absen_change_log
    WHERE changed_at BETWEEN '${startOfDay.toISOString()}' AND '${endOfDay.toISOString()}'
  `);

  return `Daily Audit Report - ${date.toDateString()}
========================================
Total Changes: ${result.recordset[0].total_changes}
  - ADD: ${result.recordset[0].adds}
  - EDIT: ${result.recordset[0].edits}
  - DELETE: ${result.recordset[0].deletes}
Unique Users: ${result.recordset[0].unique_users}
`;
}
```

---

## Retention Policy

### Recommended Retention

| Data Type | Retention Period | Archive Strategy |
|-----------|-----------------|------------------|
| Change Log | 2 years | Move to archive table after 6 months |
| Import Batch | 1 year | Keep batch headers indefinitely |
| Sync Log | 1 year | Keep summary, archive details |

### Archive Procedure

```sql
-- Archive old change logs
INSERT INTO absen_change_log_archive
SELECT * FROM absen_change_log
WHERE changed_at < DATEADD(MONTH, -6, GETDATE());

DELETE FROM absen_change_log
WHERE changed_at < DATEADD(MONTH, -6, GETDATE());
```

---

## Related Documentation

- [06_DATA_PRIVACY.md](./06_DATA_PRIVACY.md) - Data handling policies
- [07_CONFIGURATION_REFERENCE.md](./07_CONFIGURATION_REFERENCE.md) - Full config reference
- [10_MONITORING_OBSERVABILITY.md](./10_MONITORING_OBSERVABILITY.md) - Monitoring setup