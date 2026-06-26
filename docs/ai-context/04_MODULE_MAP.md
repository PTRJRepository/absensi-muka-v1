---
tags: [ai-context, module-map]
created: 2026-06-07
---

# Module Map

## Core Modules

### 1. Configuration Module (`config.ts`)

**Location:** `_dev_utils/src/config.ts`

**Purpose:** Central configuration for API keys, SQL gateway, and sync settings.

**Exports:**
- `config` object with:
  - `sqlGateway`: SQL Gateway URL and API key
  - `absensiApi`: IT Solution API base URL and key
  - `sync`: Interval (15 min), batch size (100), modes (hk/ot)
  - `divisions`: Array of 13 division codes

**Status:** ✅ Complete

---

### 2. Machine Configuration Module (`machine-config.ts`)

**Location:** `_dev_utils/src/machine-config.ts`

**Purpose:** Defines 15 attendance machine configurations with IP, port, scanner codes, and location codes.

**Exports:**
- `machineServers`: Record of 15 machines with IP/port/config
- `scannerCodeMap`: Scanner code to division mapping
- `locCodeMap`: Location code to employee code prefix mapping
- `getAllMachines()`: Get all machine configs
- `getMachineByDivision(div)`: Get config by division
- `getDivisionFromMachineId(id)`: Extract division from machine ID
- `convertMachineIdToEmpCode(id, div)`: Convert machine ID to employee code

**Status:** ✅ Complete

---

### 3. IT Solution API Client (`absensi-client.ts`)

**Location:** `_dev_utils/src/absensi-client.ts`

**Purpose:** REST client for IT Solution attendance API.

**Exports:**
- `AbsensiApiClient` class with methods:
  - `getDivisions()`: Fetch all available divisions
  - `getAvailableMonths(division)`: Get available months for division
  - `getAttendance(division, month, year, mode)`: Fetch attendance data
  - `getLatestAttendance(mode)`: Fetch latest data for all divisions
- `absensiApi`: Singleton instance

**Status:** ✅ Complete

---

### 4. SQL Gateway Client (`sql-client.ts`)

**Location:** `_dev_utils/src/sql-client.ts`

**Purpose:** HTTP-based SQL Server client using SQL Gateway.

**Exports:**
- `SqlClient` class with methods:
  - `query(sql)`: Execute SELECT query
  - `execute(sql)`: Execute INSERT/UPDATE/DELETE
  - `getTables()`: List all tables
  - `tableExists(name)`: Check if table exists
  - `getTableSchema(name)`: Get column metadata
- `sqlClient`: Singleton instance

**Status:** ✅ Complete

---

### 5. Database Schema Module (`database.ts`)

**Location:** `_dev_utils/src/database.ts`

**Purpose:** SQL Server table definitions and initialization.

**Exports:**
- `ABSEN_IMPORT_SCHEMA`: Immutable attendance import table
- `ABSEN_MACHINE_INPUT_SCHEMA`: Mutable manual input table
- `ABSEN_CHANGE_LOG_SCHEMA`: Audit log table
- `ABSEN_IMPORT_BATCH_SCHEMA`: Batch tracking table
- `ABSEN_CONFIG_SCHEMA`: Configuration table
- `ABSEN_SYNC_LOG_SCHEMA`: Sync operation log table
- `createTables()`: Create all tables if not exist
- `initConfig()`: Initialize default configuration
- `resetTables()`: Drop and recreate tables

**Status:** ✅ Complete

---

### 6. Absensi Service (`absensi-service.ts`)

**Location:** `_dev_utils/src/absensi-service.ts`

**Purpose:** High-level service layer for attendance data operations.

**Exports:**
- `AbsensiService` class with methods:
  - `getImportData(div, year, month)`: Get import data
  - `getImportByEmployee(emp, div, year, month)`: Get employee import data
  - `insertImportBatch(records, div, year, month)`: Insert batch import
  - `getMachineInputData(div, year, month)`: Get manual input data
  - `upsertMachineInput(record)`: Insert/update manual input
  - `deleteMachineInput(emp, div, year, month, day)`: Delete manual input
  - `getVerificationData(div, year, month)`: Get merged import+machine data
  - `getChangeLog(...)`: Get audit log entries
  - `getDivisions()`: List available divisions
  - `getAvailableMonths(div)`: List available months
  - `getStats(div, year, month)`: Get statistics
- `absensiService`: Singleton instance

**Status:** ✅ Complete

---

### 7. Sync Module (`sync.ts`)

**Location:** `_dev_utils/src/sync.ts`

**Purpose:** Main synchronization logic from IT Solution API to database.

**Exports:**
- `runSync(options)`: Main sync function
- `syncDivision(div, year, month, mode)`: Sync single division
- `logSync(...)`: Log sync operation

**Features:**
- MERGE-based upsert (insert or update)
- Batch processing with error handling
- Sync logging to `absen_sync_log` table

**Status:** ✅ Complete

---

### 8. Scheduler Module (`scheduler.ts`)

**Location:** `_dev_utils/src/scheduler.ts`

**Purpose:** Auto-sync scheduler using setInterval.

**Exports:**
- Simple scheduler that runs `runSync()` every 15 minutes
- Prevents concurrent sync operations
- Logs sync start/end times

**Status:** ✅ Complete

---

### 9. Machine Sync Module (`machine-sync.ts`)

**Location:** `_dev_utils/src/machine-sync.ts`

**Purpose:** ZKTeco machine synchronization using node-zklib.

**Exports:**
- `connectToMachine(division)`: Connect and fetch from single machine
- `syncAllMachines()`: Sync all accessible machines

**Features:**
- TCP connection to ZKTeco devices
- User and attendance data extraction
- Machine ID to employee code conversion

**Status:** ✅ Complete

---

### 10. Import Module (`absensi-import.ts`)

**Location:** `_dev_utils/src/absensi-import.ts`

**Purpose:** Import pipeline from IT Solution API to database.

**Exports:**
- `runImport(options)`: Main import function
- `importFromApi(div, year, month, importedBy)`: Import single division

**Features:**
- Batch insertion with progress tracking
- Error collection and batch status update
- 20-record delay to prevent gateway overload

**Status:** ✅ Complete

---

## Module Dependencies

```
config.ts ─────────────┐
                       │
machine-config.ts ─────┼──→ absensi-client.ts
                       │          │
                       │          ↓
                       │    absensi-import.ts
                       │          │
sql-client.ts ─────────┴───→ sync.ts ──→ scheduler.ts
                       │
database.ts ───────────┴──→ absensi-service.ts
                       │
machine-sync.ts ───────┴──→ (outputs to DB via sql-client)
```

## Module Status Summary

| Module | Status | Purpose |
|--------|--------|---------|
| config.ts | ✅ Complete | Configuration management |
| machine-config.ts | ✅ Complete | Machine mappings |
| absensi-client.ts | ✅ Complete | API client |
| sql-client.ts | ✅ Complete | Database access |
| database.ts | ✅ Complete | Schema definitions |
| absensi-service.ts | ✅ Complete | Service layer |
| sync.ts | ✅ Complete | Sync logic |
| scheduler.ts | ✅ Complete | Auto-sync |
| machine-sync.ts | ✅ Complete | ZKTeco sync |
| absensi-import.ts | ✅ Complete | Import pipeline |
