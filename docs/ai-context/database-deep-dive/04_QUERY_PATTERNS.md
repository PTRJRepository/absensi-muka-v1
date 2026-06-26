# 04_QUERY_PATTERNS.md

# Common Query Patterns - PT Rebinmas Jaya Absensi System

## Overview

This document catalogs the SQL query patterns used throughout the codebase.

---

## Pattern 1: Basic Select by Period

```typescript
// Get all import data for a division and period
async getImportData(division: string, year: number, month: number): Promise<AbsenRecord[]> {
  const result = await sqlClient.query(`
    SELECT * FROM absen_import
    WHERE division = '${division}' AND year = ${year} AND month = ${month}
    ORDER BY emp_code, day
  `);
  return result?.recordset || [];
}
```

**Usage:** Fetch raw attendance data for reporting

---

## Pattern 2: Select by Employee and Period

```typescript
// Get import data for specific employee
async getImportByEmployee(
  empCode: string,
  division: string,
  year: number,
  month: number
): Promise<AbsenRecord[]> {
  const result = await sqlClient.query(`
    SELECT * FROM absen_import
    WHERE emp_code = '${empCode}'
      AND division = '${division}'
      AND year = ${year}
      AND month = ${month}
    ORDER BY day
  `);
  return result?.recordset || [];
}
```

**Usage:** Individual employee attendance report

---

## Pattern 3: Check if Record Exists (Upsert Pattern)

```typescript
// Check if machine input exists before upsert
const existing = await sqlClient.query(`
  SELECT id FROM absen_machine_input
  WHERE emp_code = '${record.emp_code}'
    AND division = '${record.division}'
    AND year = ${record.year}
    AND month = ${record.month}
    AND day = ${record.day}
`);

if (existing?.recordset?.length > 0) {
  // UPDATE existing record
} else {
  // INSERT new record
}
```

**Usage:** Upsert logic for mutable tables

---

## Pattern 4: MERGE Statement (Upsert)

```typescript
// Sync data using MERGE
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
      has_work = ${values.has_work},
      ...
 WHEN NOT MATCHED THEN
    INSERT (emp_code, emp_name, division, year, month, day, ...)
    VALUES ('${values.emp_code}', '${values.emp_name}', ...);
`;

await sqlClient.execute(sql);
```

**Usage:** Bulk sync from API

---

## Pattern 5: FULL OUTER JOIN (Verification Merge)

```typescript
// Merge import + machine input data
const result = await sqlClient.query(`
  SELECT
    COALESCE(m.emp_code, i.emp_code) as emp_code,
    COALESCE(m.emp_name, i.emp_name) as emp_name,
    COALESCE(m.has_work, i.has_work) as has_work,
    COALESCE(m.is_holiday, i.is_holiday) as is_holiday,
    COALESCE(m.is_cuti, i.is_cuti) as is_cuti,
    COALESCE(m.is_sakit, i.is_sakit) as is_sakit,
    COALESCE(m.ot_hours, i.ot_hours) as ot_hours,

    i.id as import_id,
    m.id as machine_input_id,

    CASE WHEN m.id IS NOT NULL THEN 'MACHINE_INPUT'
         WHEN i.id IS NOT NULL THEN 'IMPORT'
         ELSE 'NONE' END as source,

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
```

**Usage:** Get merged verification data with conflict detection

---

## Pattern 6: Change Log Insert

```typescript
// Log field changes
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

**Usage:** Audit trail for mutable table changes

---

## Pattern 7: Batch Insert with Status Tracking

```typescript
// Insert batch with status tracking
async insertImportBatch(
  records: Omit<AbsenRecord, "id" | "created_at">[],
  division: string,
  year: number,
  month: number,
  importedBy: string = "SYSTEM"
): Promise<number> {
  const batchId = uuidv4();

  // Insert batch record
  await sqlClient.execute(`
    INSERT INTO absen_import_batch (batch_id, division, year, month, total_records, status, imported_by)
    VALUES ('${batchId}', '${division}', ${year}, ${month}, ${records.length}, 'IN_PROGRESS', '${importedBy}')
  `);

  let insertedCount = 0;
  const errors: string[] = [];

  for (const record of records) {
    try {
      await sqlClient.execute(`INSERT INTO absen_import (...) VALUES (...)`);
      insertedCount++;
    } catch (e: any) {
      errors.push(`${record.emp_code} day ${record.day}: ${e.message}`);
    }
  }

  // Update batch status
  await sqlClient.execute(`
    UPDATE absen_import_batch
    SET status = '${errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'}',
        imported_records = ${insertedCount},
        import_completed_at = GETDATE(),
        error_message = ${errors.length > 0 ? `'${errors.join("; ")}'` : 'NULL'}
    WHERE batch_id = '${batchId}'
  `);

  return insertedCount;
}
```

**Usage:** Import with error tracking

---

## Pattern 8: Union for Available Data

```typescript
// Get available divisions
async getDivisions(): Promise<string[]> {
  const result = await sqlClient.query(`
    SELECT DISTINCT division FROM absen_import
    UNION
    SELECT DISTINCT division FROM absen_machine_input
    ORDER BY division
  `);
  return result?.recordset?.map((r: any) => r.division) || [];
}

// Get available months for division
async getAvailableMonths(division: string): Promise<{ year: number; month: number }[]> {
  const result = await sqlClient.query(`
    SELECT DISTINCT year, month FROM absen_import
    WHERE division = '${division}'
    UNION
    SELECT DISTINCT year, month FROM absen_machine_input
    WHERE division = '${division}'
    ORDER BY year DESC, month DESC
  `);
  return result?.recordset || [];
}
```

**Usage:** Populate dropdowns in UI

---

## Pattern 9: Conditional Where Clause

```typescript
// Get change log with optional filters
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

**Usage:** Filtered audit log queries

---

## Pattern 10: Stats/Aggregation Query

```typescript
// Get statistics for a period
async getStats(division: string, year: number, month: number): Promise<any> {
  const importCount = await sqlClient.query(`
    SELECT COUNT(*) as cnt FROM absen_import
    WHERE division = '${division}' AND year = ${year} AND month = ${month}
  `);

  const machineInputCount = await sqlClient.query(`
    SELECT COUNT(*) as cnt FROM absen_machine_input
    WHERE division = '${division}' AND year = ${year} AND month = ${month}
  `);

  const verificationCount = await sqlClient.query(`
    SELECT COUNT(*) as cnt FROM (
      SELECT 1 as cnt FROM absen_import
      WHERE division = '${division}' AND year = ${year} AND month = ${month}
      UNION ALL
      SELECT 1 as cnt FROM absen_machine_input
      WHERE division = '${division}' AND year = ${year} AND month = ${month}
    ) as combined
  `);

  return {
    importCount: importCount?.recordset?.[0]?.cnt || 0,
    machineInputCount: machineInputCount?.recordset?.[0]?.cnt || 0,
    totalRecords: verificationCount?.recordset?.length || 0,
  };
}
```

**Usage:** Dashboard statistics

---

## Pattern 11: Delete with Logging

```typescript
// Delete machine input with logging
async deleteMachineInput(
  empCode: string,
  division: string,
  year: number,
  month: number,
  day: number,
  changedBy?: string
): Promise<boolean> {
  const existing = await sqlClient.query(`
    SELECT * FROM absen_machine_input
    WHERE emp_code = '${empCode}'
      AND division = '${division}'
      AND year = ${year}
      AND month = ${month}
      AND day = ${day}
  `);

  if (existing?.recordset?.length > 0) {
    const record: any = { emp_code: empCode, division, year, month, day };
    await this.logChange(record, existing.recordset[0], "DELETE", "absen_machine_input", changedBy);

    await sqlClient.execute(`
      DELETE FROM absen_machine_input
      WHERE emp_code = '${empCode}'
        AND division = '${division}'
        AND year = ${year}
        AND month = ${month}
        AND day = ${day}
    `);
    return true;
  }
  return false;
}
```

**Usage:** Delete with audit trail

---

## Pattern 12: Information Schema Queries

```typescript
// Get all tables
async getTables(): Promise<string[]> {
  const result = await this.query(
    `SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema = 'dbo'`
  );
  return result?.recordset?.map((row: any) => row.table_name) || [];
}

// Check if table exists
async tableExists(tableName: string): Promise<boolean> {
  const result = await this.query(
    `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '${tableName}' AND table_schema = 'dbo'`
  );
  return result?.recordset?.[0]?.count > 0;
}

// Get table schema
async getTableSchema(tableName: string): Promise<any[]> {
  const result = await this.query(`
    SELECT
      COLUMN_NAME,
      DATA_TYPE,
      IS_NULLABLE,
      CHARACTER_MAXIMUM_LENGTH,
      COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '${tableName}'
    ORDER BY ORDINAL_POSITION
  `);
  return result?.recordset || [];
}
```

**Usage:** Database introspection

---

## Pattern 13: v3 Stored Procedure Call

```sql
-- Execute sync stored procedure
EXEC sp_sync_attendance_daily
 @work_date = '2026-06-07',
    @dry_run = 0;

-- Dashboard summary
EXEC sp_get_dashboard_attendance
    @start_date = '2026-06-01',
    @end_date = '2026-06-30',
    @division_id = NULL;

-- Cross-division report
EXEC sp_get_cross_division_scan
    @start_date = '2026-06-01',
    @end_date = '2026-06-30',
    @division_id = NULL;

-- Employee detail
EXEC sp_get_employee_attendance_detail
    @emp_code = 'A0001',
    @start_date = '2026-06-01',
    @end_date = '2026-06-30';
```

**Usage:** v3 aggregation and reporting

---

## Security Considerations

### Pattern 14: Parameterized Queries (Recommended)

```typescript
// Safe query pattern (when gateway supports parameters)
async safeQuery(empCode: string, division: string) {
  const result = await sqlClient.query(`
    SELECT * FROM absen_import
    WHERE emp_code = @empCode AND division = @division
  `, { empCode, division });
  return result?.recordset || [];
}
```

### Pattern15: String Interpolation (Current - Use with Caution)

```typescript
// Current pattern - manual escaping required
const result = await sqlClient.query(`
  SELECT * FROM absen_import
  WHERE division = '${division.replace(/'/g, "''")}'
 AND year = ${year}
`);
```

**Note:** Current implementation uses string interpolation. Always validate/sanitize inputs.

---

## Query Performance Tips

1. **Use indexes:** Always filter by indexed columns (emp_code, division, year, month, work_date)
2. **Limit results:** Use TOP/LIMIT for large datasets
3. **Avoid SELECT *** Specify needed columns
4. **Use COALESCE carefully:** FULL OUTER JOIN with COALESCE can be slow on large tables
5. **Batch operations:** Insert/update in batches of 100-500 records
