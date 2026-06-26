# Batch Processing System

## Overview

The system uses a batch-based processing approach to track and manage imports. Each import operation creates a unique batch ID, allowing for audit trails, error tracking, and selective re-processing.

---

## Batch ID Generation

```typescript
const batchId = `batch-${Date.now()}`;

// Example: "batch-1750000000000"
```

Format: `batch-{timestamp_in_milliseconds}`

---

## Batch Tracking Tables

### absen_import_batch

Tracks each import operation:

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

---

## Batch Status Flow

```
┌──────────┐
│ PENDING  │  ← Initial state when batch created
└────┬─────┘
     │
     ▼
┌─────────────────┐
│   IN_PROGRESS   │  ← During import execution
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌─────────────────────┐
│COMPLETED│ │ COMPLETED_WITH_ERRORS│
└────────┘ └─────────────────────┘
    │                    │
    └── No errors        └── Some records failed
```

---

## Batch Lifecycle

### 1. Create Batch Header

```typescript
await query(`
  INSERT INTO absen_import_batch (
    batch_id, division, year, month, total_records, status, imported_by
  ) VALUES (
    '${batchId}', '${division}', ${year}, ${month},
    ${records.length}, 'IN_PROGRESS', '${importedBy}'
  )
`);
```

### 2. Insert Records with batch_id

```typescript
for (const record of records) {
  await query(`
    INSERT INTO absen_import (
      emp_code, division, tanggal, jam_masuk, ...,
      import_batch_id, source
    ) VALUES (
      '${record.emp_code}', '${record.division}', ...,
      '${batchId}', 'API'
    )
  `);
}
```

### 3. Update Final Status

```typescript
await query(`
  UPDATE absen_import_batch
  SET status = '${errors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED"}',
      imported_records = ${inserted},
      import_completed_at = GETDATE()
  WHERE batch_id = '${batchId}'
`);
```

---

## Batch Query Examples

### Find latest batch for a division

```sql
SELECT TOP 1 *
FROM absen_import_batch
WHERE division = 'PG1A'
ORDER BY import_started_at DESC;
```

### Check batch completion status

```sql
SELECT
  batch_id,
  division,
  year,
  month,
  status,
  imported_records,
  total_records,
  import_completed_at
FROM absen_import_batch
WHERE status IN ('COMPLETED', 'COMPLETED_WITH_ERRORS')
ORDER BY import_completed_at DESC;
```

### Find batches with errors

```sql
SELECT *
FROM absen_import_batch
WHERE status = 'COMPLETED_WITH_ERRORS'
ORDER BY import_started_at DESC;
```

### Re-import from specific batch (example)

```sql
-- Get records from a specific batch
SELECT *
FROM absen_import
WHERE import_batch_id = 'batch-1750000000000';
```

---

## Record-Level Tracking

Each imported record references its batch:

```sql
INSERT INTO absen_import (
  emp_code, division, tanggal, jam_masuk, ...
  import_batch_id, source
) VALUES (
  'A0001', 'PG1A', '2026-06-15', '08:00:00', ...,
  'batch-1750000000000', 'API'
);
```

---

## Sync Batch System (sync.ts)

A similar batch approach exists for the sync system using MERGE operations:

```typescript
async function syncDivision(
  division: string,
  year: number,
  month: number,
  mode: "hk" | "ot" = "hk"
): Promise<number> {
  const startTime = Date.now();

  try {
    const attendanceData = await absensiApi.getAttendance(division, month, year, mode);
    let syncedCount = 0;

    for (const row of attendanceData) {
      // MERGE operation (upsert)
      const sql = `
        MERGE INTO absen_master AS target
        USING (SELECT ...) AS source
        ON target.emp_code = source.emp_code
          AND target.division = source.division
          AND target.year = source.year
          AND target.month = source.month
          AND target.day = source.day
        WHEN MATCHED THEN
          UPDATE SET ...
        WHEN NOT MATCHED THEN
          INSERT (...);
      `;

      await sqlClient.execute(sql);
      syncedCount++;
    }

    // Log sync result
    await logSync(division, year, month, mode, syncedCount, "SUCCESS", null, duration);

    return syncedCount;

  } catch (error: any) {
    await logSync(division, year, month, mode, 0, "FAILED", error.message, duration);
    throw error;
  }
}
```

---

## Sync Log Table

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

---

## Sync Logging Function

```typescript
async function logSync(
  division: string | null,
  year: number | null,
  month: number | null,
  mode: string | null,
  recordsSynced: number,
  status: string,
  errorMessage: string | null,
  durationMs: number
): Promise<void> {
  const sql = `
    INSERT INTO absen_sync_log (
      division, year, month, mode, records_synced,
      status, error_message, duration_ms
    ) VALUES (
      ${division ? `'${division}'` : 'NULL'},
      ${year || 'NULL'},
      ${month || 'NULL'},
      ${mode ? `'${mode}'` : 'NULL'},
      ${recordsSynced},
      '${status}',
      ${errorMessage ? `'${errorMessage.replace(/'/g, "''")}'` : 'NULL'},
      ${durationMs}
    )
  `;

  await sqlClient.execute(sql);
}
```

---

## Batch Size Configuration

From `config.ts`:

```typescript
sync: {
  batchSize: 100,  // Records per batch
}
```

Currently used for:
- Throttling during insert (delay every 20 records)
- Future: chunked processing for large datasets

---

## Query: Batch Statistics

```sql
-- Get import statistics by division
SELECT
  division,
  COUNT(*) as batch_count,
  SUM(imported_records) as total_records,
  SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'COMPLETED_WITH_ERRORS' THEN 1 ELSE 0 END) as partial
FROM absen_import_batch
GROUP BY division
ORDER BY division;
```

---

## Query: Recent Activity

```sql
-- Last 10 import operations
SELECT TOP 10
  batch_id,
  division,
  CONCAT(year, '-', RIGHT('0' + CAST(month AS VARCHAR), 2)) as period,
  status,
  imported_records,
  total_records,
  import_completed_at
FROM absen_import_batch
ORDER BY import_started_at DESC;
```

---

## Error Recovery Strategy

1. **Partial failures**: Continue processing, log errors
2. **Batch status**: Mark as COMPLETED_WITH_ERRORS
3. **Error details**: Store in error_message column
4. **Retry**: Re-run import for failed division/month

```typescript
// Error handling pattern
for (const division of divisions) {
  try {
    const count = await importFromApi(division, year, month);
    totalImported += count;
  } catch (e: any) {
    console.log(`  ❌ Error: ${e.message}`);
    // Continue with next division
  }
}
```

---

## Batch Processing Flow Diagram

```
Main Import Loop
      │
      ▼
┌─────────────────┐
│  Create Batch    │──── batchId = `batch-${Date.now()}`
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Fetch API Data  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Convert Format  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Insert Header   │──── absen_import_batch (IN_PROGRESS)
└────────┬────────┘
         │
         ▼
    ┌─────────────┐
    │  Loop Records │
    │  ────────────  │
    │  Insert each   │
    │  Track errors   │
    │  Throttle delay │
    └───────┬────────┘
            │
            ▼
┌─────────────────┐
│  Update Status   │──── COMPLETED or COMPLETED_WITH_ERRORS
└────────┬────────┘
         │
         ▼
    Next Division
```