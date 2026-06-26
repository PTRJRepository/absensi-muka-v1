# Import Pipeline: API to Database

## Overview

The import pipeline is the core mechanism for transferring attendance data from the IT Solution API to the SQL Server database. This document provides a complete walkthrough of the process.

---

## Pipeline Architecture

```
┌─────────────────┐
│   IT Solution   │
│      API        │
│  (10.0.0.110)   │
└────────┬────────┘
         │
         │ getAttendance(division, month, year, mode)
         ▼
┌─────────────────┐
│  AbsensiApiClient │──────── fetch() with x-api-key
│                  │
└────────┬────────┘
         │
         │ Raw JSON data
         ▼
┌─────────────────┐
│   API Response   │
│   { success,    │
│     data: [...] } │
└────────┬────────┘
         │
         │ Extract data array
         ▼
┌─────────────────┐
│ convertApiToDb  │──────── Transform each record
│    Format       │
└────────┬────────┘
         │
         │ DB-ready records
         ▼
┌─────────────────┐
│   Batch Insert   │
│   (absen_import) │
└────────┬────────┘
         │
         │ Update batch status
         ▼
┌─────────────────┐
│ absen_import_batch │────── Track batch completion
│                  │
└─────────────────┘
```

---

## Step-by-Step Flow

### Step 1: Fetch from API

```typescript
async function importFromApi(
  division: string,
  year: number,
  month: number,
  importedBy: string = "SYSTEM"
): Promise<number> {
  console.log(`\n📥 Importing: ${division} - ${month}/${year}`);

  const batchId = `batch-${Date.now()}`;

  try {
    // Get data from API
    console.log("  📡 Fetching from API...");
    const apiData = await absensiApi.getAttendance(division, month, year, "hk");

    if (!apiData || apiData.length === 0) {
      console.log("  ⚠️ No data from API");
      return 0;
    }

    console.log(`  ✅ Got ${apiData.length} employees`);
```

### Step 2: Convert to DB Format

```typescript
    // Convert to DB format
    const records = convertApiToDbFormat(apiData, division, year, month, batchId);
    console.log(`  📊 Parsed ${records.length} records`);
```

### Step 3: Create Batch Header

```typescript
    // Insert batch header
    await query(`
      INSERT INTO absen_import_batch (
        batch_id, division, year, month, total_records, status, imported_by
      ) VALUES (
        '${batchId}', '${division}', ${year}, ${month},
        ${records.length}, 'IN_PROGRESS', '${importedBy}'
      )
    `);
```

### Step 4: Insert Records

```typescript
    // Insert records with small delay
    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];

      const sql = `
        INSERT INTO absen_import (
          emp_code, division, tanggal, jam_masuk, jam_keluar, record_type,
          has_work, is_sunday, is_holiday, is_cuti, is_sakit,
          ot_hours, task_code, attendance_date, import_batch_id, source
        ) VALUES (
          '${r.emp_code}', '${r.division}', '${r.tanggal}',
          ${r.jam_masuk ? `'${r.jam_masuk}'` : 'NULL'},
          ${r.jam_keluar ? `'${r.jam_keluar}'` : 'NULL'},
          ${r.record_type}, ${r.has_work}, ${r.is_sunday}, ${r.is_holiday},
          ${r.is_cuti}, ${r.is_sakit}, ${r.ot_hours},
          ${r.task_code ? `'${r.task_code}'` : 'NULL'},
          ${r.attendance_date ? `'${r.attendance_date}'` : 'NULL'},
          '${r.import_batch_id}', '${r.source}'
        )
      `;

      try {
        await query(sql);
        inserted++;

        // Small delay every 20 records
        if (i > 0 && i % 20 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (e: any) {
        errors.push(`${r.emp_code} day ${r.hari}: ${e.message}`);
      }
    }
```

### Step 5: Update Batch Status

```typescript
    // Update batch status
    await query(`
      UPDATE absen_import_batch
      SET status = '${errors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED"}',
          imported_records = ${inserted},
          import_completed_at = GETDATE()
      WHERE batch_id = '${batchId}'
    `);

    console.log(`  ✅ Imported ${inserted}/${records.length} records`);
    return inserted;
```

---

## Data Transformation

### convertApiToDbFormat Function

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
    const empCode = emp.empCode;
    const empName = emp.empName;
    const gangCode = emp.gangCode;

    // Process each day
    for (let day = 1; day <= 31; day++) {
      const dayKey = `day_${day}`;
      const dayData = emp[dayKey];

      if (!dayData) continue;

      // Validate date - check if day is valid for the month
      const date = new Date(year, month - 1, day);
      if (date.getMonth() !== month - 1) continue;

      // Format tanggal: YYYY-MM-DD
      const tanggal = date.toISOString().split("T")[0];

      // If has work, create record
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
          jam_keluar: null,  // API does not provide jam keluar
          record_type: 0,    // masuk
          has_work: dayData.hasWork ? 1 : 0,
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

## Field Mapping Table

| API Field | DB Field | Transformation |
|-----------|----------|----------------|
| `emp.empCode` | `emp_code` | Direct copy |
| `emp.empName` | `emp_name` | Direct copy |
| `emp.gangCode` | `gang_code` | Direct copy |
| - | `division` | From parameter |
| - | `tahun` | From parameter |
| - | `bulan` | From parameter |
| - | `hari` | Loop counter (1-31) |
| `Date(year, month-1, day)` | `tanggal` | Format to YYYY-MM-DD |
| `dayData.date` | `jam_masuk` | Parse to HH:MM:SS |
| - | `jam_keluar` | Always null (API doesn't provide) |
| - | `record_type` | Always 0 (masuk) |
| `dayData.hasWork` | `has_work` | Convert to 1/0 |
| `dayData.isSunday` | `is_sunday` | Convert to 1/0 |
| `dayData.isHoliday` | `is_holiday` | Convert to 1/0 |
| `dayData.isCuti` | `is_cuti` | Convert to 1/0 |
| `dayData.isSakit` | `is_sakit` | Convert to 1/0 |
| `dayData.otHours` | `ot_hours` | ParseFloat or 0 |
| `dayData.taskCode` | `task_code` | Direct or null |
| `dayData.date` | `attendance_date` | Direct or null |
| - | `import_batch_id` | From batchId parameter |
| - | `source` | Always "API" |

---

## Main Import Function

```typescript
async function runImport(options: {
  division?: string;
  year?: number;
  month?: number;
} = {}) {
  console.log("=".repeat(50));
  console.log("🚀 Starting Absensi Import");
  console.log("=".repeat(50));

  const divisions = options.division ? [options.division] : config.divisions;
  let year = options.year;
  let month = options.month;

  // Get latest month if not specified
  if (!year || !month) {
    const firstDivision = divisions[0];
    const months = await absensiApi.getAvailableMonths(firstDivision);
    if (months.length > 0) {
      year = months[0].year;
      month = months[0].month;
    }
  }

  if (!year || !month) {
    throw new Error("Cannot determine year/month");
  }

  console.log(`\n📅 Target: ${year}-${String(month).padStart(2, "0")}`);
  console.log(`📂 Divisions: ${divisions.join(", ")}\n`);

  let totalImported = 0;

  for (const division of divisions) {
    try {
      const count = await importFromApi(division, year, month);
      totalImported += count;
    } catch (e: any) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`✅ Total imported: ${totalImported} records`);
  console.log("=".repeat(50));

  return totalImported;
}
```

---

## Usage Examples

### Import all divisions for current month

```typescript
// Auto-detect latest month
await runImport();
```

### Import specific division

```typescript
await runImport({ division: 'PG1A' });
```

### Import specific month

```typescript
await runImport({ year: 2026, month: 5 });
```

### Import specific division and month

```typescript
await runImport({ division: 'DME', year: 2026, month: 5 });
```

### CLI Usage

```bash
# Import all
bun run absensi-import.ts

# Specific division
bun run absensi-import.ts --division PG1A

# Specific month
bun run absensi-import.ts --year 2026 --month 5

# Full specification
bun run absensi-import.ts --division DME --year 2026 --month 5
```

---

## Error Handling

### API Errors

```typescript
try {
  const apiData = await absensiApi.getAttendance(division, month, year, "hk");
} catch (error: any) {
  console.error(`  ❌ Error: ${error.message}`);
  throw error;
}
```

### DB Insert Errors

```typescript
try {
  await query(sql);
  inserted++;
} catch (e: any) {
  errors.push(`${r.emp_code} day ${r.hari}: ${e.message}`);
  // Continue with next record
}
```

### Batch Status on Errors

```typescript
status: errors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED"
```

---

## Logging Output

```
==================================================
🚀 Starting Absensi Import
==================================================

📅 Target: 2026-06
📂 Divisions: PG1A, PG1B, PG2A, DME, ARA...

📥 Importing: PG1A - 6/2026
  📡 Fetching from API...
  ✅ Got 150 employees
  📊 Parsed 450 records
  ✅ Imported 448/450 records

📥 Importing: PG1B - 6/2026
  ...

==================================================
✅ Total imported: 5200 records
==================================================
```