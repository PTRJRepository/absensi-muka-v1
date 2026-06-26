# 07_SERVICE_LAYER.md

# AbsensiService Methods - PT Rebinmas Jaya Absensi System

## Overview

The `AbsensiService` class in `_dev_utils/src/absensi-service.ts` provides the main business logic for attendance data operations.

---

## Class Definition

```typescript
export class AbsensiService {
  // Import methods (IMUTABLE)
  getImportData(division, year, month): Promise<AbsenRecord[]>
  getImportByEmployee(empCode, division, year, month): Promise<AbsenRecord[]>
  insertImportBatch(records, division, year, month, importedBy): Promise<number>

  // Machine Input methods (MUTABLE)
  getMachineInputData(division, year, month): Promise<AbsenRecord[]>
  upsertMachineInput(record, changedBy): Promise<number>
  deleteMachineInput(empCode, division, year, month, day, changedBy): Promise<boolean>

  // Verification methods (MERGED)
  getVerificationData(division, year, month): Promise<AbsenVerificationRecord[]>

  // Audit methods
  getChangeLog(empCode?, division?, year?, month?, limit?): Promise<ChangeLogEntry[]>

  // Helper methods
  getDivisions(): Promise<string[]>
  getAvailableMonths(division): Promise<{year, month}[]>
  getStats(division, year, month): Promise<Stats>

  // Private
  logChange(newRecord, oldRecord, changeType, sourceTable, changedBy): Promise<void>
}
```

---

## Data Types

### AbsenRecord

```typescript
export interface AbsenRecord {
  id?: number;
  emp_code: string;
  emp_name?: string;
  gang_code?: string;
  division: string;
  year: number;
  month: number;
  day: number;
  has_work: boolean;
  is_sunday: boolean;
  is_holiday: boolean;
  holiday_desc?: string;
  is_cuti: boolean;
  is_sakit: boolean;
  task_code?: string;
  ot_hours: number;
  attendance_date: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
}
```

### AbsenVerificationRecord

```typescript
export interface AbsenVerificationRecord extends AbsenRecord {
  import_id?: number;
  machine_input_id?: number;
  source: "IMPORT" | "MACHINE_INPUT" | "MERGED";
  import_value?: any;
  machine_input_value?: any;
  has_conflict?: boolean;
}
```

### ChangeLogEntry

```typescript
export interface ChangeLogEntry {
  id?: number;
  emp_code: string;
  division: string;
  year: number;
  month: number;
  day: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  change_type: "ADD" | "EDIT" | "DELETE";
  source_table: string;
  changed_by?: string;
  changed_at?: string;
}
```

---

## Method Details

### 1. getImportData()

Get raw import data for a division and period.

```typescript
async getImportData(
  division: string,
  year: number,
  month: number
): Promise<AbsenRecord[]>
```

**Parameters:**
- `division` - Division code (e.g., "PG1A", "DME")
- `year` - Year (e.g., 2026)
- `month` - Month (1-12)

**Returns:** Array of AbsenRecord from absen_import

**Example:**
```typescript
const records = await absensiService.getImportData("PG1A", 2026, 6);
console.log(`Found ${records.length} records`);
records.forEach(r => console.log(r.emp_code, r.has_work));
```

---

### 2. getImportByEmployee()

Get import data for a specific employee.

```typescript
async getImportByEmployee(
  empCode: string,
  division: string,
  year: number,
  month: number
): Promise<AbsenRecord[]>
```

**Parameters:**
- `empCode` - Employee code (e.g., "A0001")
- `division` - Division code
- `year` - Year
- `month` - Month

**Returns:** Array of AbsenRecord for that employee

**Example:**
```typescript
const records = await absensiService.getImportByEmployee("A0001", "PG1A", 2026, 6);
console.log(`${records.length} days worked`);
```

---

### 3. insertImportBatch()

Insert a batch of import records.

```typescript
async insertImportBatch(
  records: Omit<AbsenRecord, "id" | "created_at">[],
  division: string,
  year: number,
  month: number,
  importedBy: string = "SYSTEM"
): Promise<number>
```

**Parameters:**
- `records` - Array of records (without id/created_at)
- `division` - Division code
- `year` - Year
- `month` - Month
- `importedBy` - User who initiated import (default: "SYSTEM")

**Returns:** Number of successfully inserted records

**Process:**
1. Create batch record in absen_import_batch
2. Insert each record to absen_import
3. Update batch status (COMPLETED/COMPLETED_WITH_ERRORS)
4. Return count

**Example:**
```typescript
const records = [
  { emp_code: "A0001", division: "PG1A", year: 2026, month: 6, day: 7, has_work: true, ... },
  { emp_code: "A0002", division: "PG1A", year: 2026, month: 6, day: 7, has_work: true, ... },
];

const count = await absensiService.insertImportBatch(records, "PG1A", 2026, 6, "admin");
console.log(`Inserted ${count} records`);
```

---

### 4. getMachineInputData()

Get manual input data for a division and period.

```typescript
async getMachineInputData(
  division: string,
  year: number,
  month: number
): Promise<AbsenRecord[]>
```

**Parameters:** Same as getImportData

**Returns:** Array of AbsenRecord from absen_machine_input

**Example:**
```typescript
const corrections = await absensiService.getMachineInputData("PG1A", 2026, 6);
console.log(`${corrections.length} manual corrections`);
```

---

### 5. upsertMachineInput()

Insert or update a manual input record.

```typescript
async upsertMachineInput(
  record: Omit<AbsenRecord, "id" | "created_at" | "updated_at">,
  changedBy?: string
): Promise<number>
```

**Parameters:**
- `record` - Record to upsert
- `changedBy` - User making the change

**Returns:** ID of inserted/updated record

**Process:**
1. Check if record exists (by emp_code, division, year, month, day)
2. If exists: UPDATE + logChange(EDIT)
3. If not exists: INSERT + logChange(ADD)

**Example:**
```typescript
const record = {
  emp_code: "A0001",
  division: "PG1A",
  year: 2026,
  month: 6,
  day: 7,
  has_work: true,
  is_sakit: true,
  attendance_date: "2026-06-07"
};

const id = await absensiService.upsertMachineInput(record, "admin");
console.log(`Upserted record with ID: ${id}`);
```

---

### 6. deleteMachineInput()

Delete a manual input record.

```typescript
async deleteMachineInput(
  empCode: string,
  division: string,
  year: number,
  month: number,
  day: number,
  changedBy?: string
): Promise<boolean>
```

**Parameters:**
- `empCode` - Employee code
- `division` - Division code
- `year` - Year
- `month` - Month
- `day` - Day
- `changedBy` - User deleting

**Returns:** `true` if deleted, `false` if not found

**Process:**
1. Find existing record
2. LogChange(DELETE)
3. DELETE from absen_machine_input

**Example:**
```typescript
const deleted = await absensiService.deleteMachineInput(
  "A0001", "PG1A", 2026, 6, 7, "admin"
);
console.log(deleted ? "Deleted" : "Not found");
```

---

### 7. getVerificationData()

Get merged verification data (import + machine input).

```typescript
async getVerificationData(
  division: string,
  year: number,
  month: number
): Promise<AbsenVerificationRecord[]>
```

**Parameters:** Same as getImportData

**Returns:** Array of AbsenVerificationRecord with merged data

**Merge Logic:**
- FULL OUTER JOIN on (emp_code, division, year, month, day)
- Priority: machine_input > import
- COALESCE for all fields
- has_conflict flag if values differ

**Example:**
```typescript
const verification = await absensiService.getVerificationData("PG1A", 2026, 6);

verification.forEach(r => {
  console.log(`${r.emp_code} day ${r.day}:`);
  console.log(`  has_work: ${r.has_work} (source: ${r.source})`);
  if (r.has_conflict) {
    console.log(`  CONFLICT: import=${r.import_value}, machine=${r.machine_input_value}`);
  }
});
```

---

### 8. getChangeLog()

Get audit log entries.

```typescript
async getChangeLog(
  empCode?: string,
  division?: string,
  year?: number,
  month?: number,
  limit: number = 100
): Promise<ChangeLogEntry[]>
```

**Parameters:**
- `empCode` - Filter by employee (optional)
- `division` - Filter by division (optional)
- `year` - Filter by year (optional)
- `month` - Filter by month (optional)
- `limit` - Max records to return (default: 100)

**Returns:** Array of ChangeLogEntry

**Example:**
```typescript
// Get all changes for an employee
const changes = await absensiService.getChangeLog("A0001");
console.log(`${changes.length} changes found`);

// Get recent changes for a division
const recent = await absensiService.getChangeLog(undefined, "PG1A", 2026, 6, 50);
```

---

### 9. getDivisions()

Get all divisions with data.

```typescript
async getDivisions(): Promise<string[]>
```

**Returns:** Array of division codes

**Example:**
```typescript
const divisions = await absensiService.getDivisions();
console.log("Divisions:", divisions);
// ['PG1A', 'PG1B', 'DME', 'ARE', ...]
```

---

### 10. getAvailableMonths()

Get available months for a division.

```typescript
async getAvailableMonths(division: string): Promise<{ year: number; month: number }[]>
```

**Parameters:**
- `division` - Division code

**Returns:** Array of {year, month} objects, sorted DESC

**Example:**
```typescript
const months = await absensiService.getAvailableMonths("PG1A");
console.log("Available months:", months);
// [{year: 2026, month: 6}, {year: 2026, month: 5}, ...]
```

---

### 11. getStats()

Get statistics for a period.

```typescript
async getStats(division: string, year: number, month: number): Promise<any>
```

**Parameters:** Same as getImportData

**Returns:** Object with counts

**Example:**
```typescript
const stats = await absensiService.getStats("PG1A", 2026, 6);
console.log(stats);
// {
//   importCount: 1500,
//   machineInputCount: 25,
//   totalRecords: 1525
// }
```

---

## Private Methods

### logChange()

Internal method to log field changes.

```typescript
private async logChange(
  newRecord: any,
  oldRecord: any,
  changeType: "ADD" | "EDIT" | "DELETE",
  sourceTable: string,
  changedBy?: string
): Promise<void>
```

**Tracked Fields:**
- has_work
- is_sunday
- is_holiday
- holiday_desc
- is_cuti
- is_sakit
- task_code
- ot_hours

---

## Usage Example

```typescript
import { absensiService } from "./absensi-service.ts";

//1. Check available data
const divisions = await absensiService.getDivisions();
console.log("Available divisions:", divisions);

// 2. Get statistics
const stats = await absensiService.getStats("PG1A", 2026, 6);
console.log("June 2026 stats:", stats);

// 3. Get verification data
const verification = await absensiService.getVerificationData("PG1A", 2026, 6);

// 4. Find conflicts
const conflicts = verification.filter(r => r.has_conflict);
console.log(`${conflicts.length} conflicts found`);

// 5. Get audit log for conflicts
if (conflicts.length > 0) {
  const changes = await absensiService.getChangeLog(
    conflicts[0].emp_code,
    "PG1A",
    2026,
    6
  );
  console.log("Change history:", changes);
}
```

---

## Singleton Export

```typescript
export const absensiService = new AbsensiService();
```

The service is exported as a singleton instance for use throughout the application.
