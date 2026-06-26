# Configuration Reference Documentation

> **Classification:** Internal Use Only  
> **Version:** 1.0.0  
> **Last Updated:** 2026-06-07

---

## Overview

This document provides a complete reference for all configuration values in the Absensi system.

---

## Configuration Files

### File Structure

```
_dev_utils/
├── src/
│   ├── config.ts           # Main configuration
│   ├── machine-config.ts   # Machine configurations
│   ├── sql-client.ts       # SQL Gateway client
│   ├── absensi-client.ts   # IT Solution API client
│   ├── database.ts        # Database schema
│   ├── absensi-service.ts # Business logic
│   ├── sync.ts           # Sync operations
│   └── scheduler.ts      # Auto-sync scheduler
└── package.json
```

---

## Main Configuration (config.ts)

### Configuration Object

```typescript
export const config = {
  // SQL Gateway Configuration
  sqlGateway: {
    baseUrl: "http://10.0.0.110:8001/v1/query",
    apiKey: "REDACTED",           // [REDACTED]
    server: "SERVER_PROFILE_1",
    database: "extend_db_ptrj",
  },

  // Absensi API Configuration
  absensiApi: {
    baseUrl: "http://10.0.0.110:5176",
    apiKey: "REDACTED",           // [REDACTED]
  },

  // Sync Configuration
  sync: {
    intervalMinutes: 15,          // Sync every 15 minutes
    batchSize: 100,               // Records per batch
    modes: ["hk", "ot"],          // Modes: hk (hari kerja), ot (lembur)
  },

  // Divisions to sync
  divisions: [
    "PG1A", "PG1B", "PG2A", "PG2B",
    "DME", "ARA", "ARB1", "ARB2",
    "INFRA", "AREC", "IJL",
    "STF-OFFICE", "SECURITY"
  ],
};
```

### Parameter Reference

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sqlGateway.baseUrl` | string | - | SQL Gateway HTTP endpoint |
| `sqlGateway.apiKey` | string | - | API key for SQL Gateway |
| `sqlGateway.server` | string | SERVER_PROFILE_1 | SQL Server profile name |
| `sqlGateway.database` | string | extend_db_ptrj | Target database name |
| `absensiApi.baseUrl` | string | - | IT Solution API base URL |
| `absensiApi.apiKey` | string | - | API key for IT Solution |
| `sync.intervalMinutes` | number | 15 | Sync interval in minutes |
| `sync.batchSize` | number | 100 | Records per batch insert |
| `sync.modes` | string[] | ["hk", "ot"] | Sync modes to execute |
| `divisions` | string[] | - | List of divisions to sync |

---

## Machine Configuration (machine-config.ts)

### Machine Servers

```typescript
export const machineServers: Record<string, {
  ip: string;
  port: number;
  ipLocal?: string;
  scannerCode?: number | null;
  locCode?: string | null;
  suffix: string;
  type: string;
}> = {
  "PGE":    { ip: "10.0.0.232",     port: 4370, scannerCode: null, locCode: null, suffix: "PGE",  type: "office" },
  "MILL":   { ip: "103.127.66.32",  port: 4370, scannerCode: null, locCode: null, suffix: "MILL", type: "office" },
  "DME_01": { ip: "103.144.228.42", port: 4700, scannerCode: 700,  locCode: "E",  suffix: "DME",  type: "absensi" },
  "ARE":    { ip: "103.144.208.154",port: 4370, scannerCode: null, locCode: null, suffix: "ARE",  type: "absensi" },
  "IJL":    { ip: "103.144.211.226",port: 4370, scannerCode: null, locCode: "L",  suffix: "IJL",  type: "absensi" },
  "ARA":    { ip: "103.144.208.154",port: 4800, scannerCode: 800,  locCode: "F",  suffix: "ARA",  type: "absensi" },
  "AB1":    { ip: "103.144.208.154",port: 4900, scannerCode: 900,  locCode: "G",  suffix: "AB1",  type: "absensi" },
  "AB2":    { ip: "103.144.208.154",port: 4400, scannerCode: 400,  locCode: "H",  suffix: "AB2",  type: "absensi" },
  "ARC_01": { ip: "103.144.208.154",port: 4200, scannerCode: 200,  locCode: "J",  suffix: "ARC",  type: "absensi" },
  "ARC_02": { ip: "103.144.208.154",port: 4201, scannerCode: 200,  locCode: "J",  suffix: "ARC",  type: "absensi" },
  "DME_02": { ip: "103.144.228.42", port: 4701, scannerCode: 700,  locCode: "E",  suffix: "DME",  type: "absensi" },
  "P1A":    { ip: "10.0.0.90",      port: 4100, scannerCode: 100,  locCode: "A",  suffix: "P1A",  type: "absensi" },
  "P1B":    { ip: "10.0.0.91",      port: 4300, scannerCode: 300,  locCode: "B",  suffix: "P1B",  type: "absensi" },
  "P2A":    { ip: "223.25.98.220",  port: 4500, scannerCode: 500,  locCode: "C",  suffix: "P2A",  type: "absensi" },
  "P2B":    { ip: "223.25.98.220",  port: 4600, scannerCode: 600,  locCode: "D",  suffix: "P2B",  type: "absensi" },
};
```

### Machine Fields

| Field | Type | Description |
|-------|------|-------------|
| `ip` | string | Public IP address |
| `port` | number | TCP port number |
| `ipLocal` | string? | Local network IP (if different) |
| `scannerCode` | number? | Scanner code prefix |
| `locCode` | string? | Location code for emp_code mapping |
| `suffix` | string | Machine identifier suffix |
| `type` | string | Machine type (office/absensi) |

### Scanner Code Map

```typescript
export const scannerCodeMap: Record<string, number> = {
  "P1A": 100, "ARC": 200, "P1B": 300, "AB2": 400,
  "P2A": 500, "P2B": 600, "DME": 700, "ARA": 800, "AB1": 900,
};
```

### Location Code Map

```typescript
export const locCodeMap: Record<string, string> = {
  "P1A": "A", "P1B": "B", "P2A": "C", "P2B": "D",
  "DME": "E", "ARA": "F", "AB1": "G", "AB2": "H",
  "ARC": "J", "IJL": "L", "PGE": "A",
};
```

---

## Database Schema (database.ts)

### Table Schemas

#### absen_import

```typescript
export const ABSEN_IMPORT_SCHEMA = `
  CREATE TABLE absen_import (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    emp_name NVARCHAR(255),
    gang_code NVARCHAR(50),
    division NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    day INT NOT NULL,
    has_work BIT DEFAULT 0,
    is_sunday BIT DEFAULT 0,
    is_holiday BIT DEFAULT 0,
    holiday_desc NVARCHAR(255),
    is_cuti BIT DEFAULT 0,
    is_sakit BIT DEFAULT 0,
    task_code NVARCHAR(50),
    ot_hours DECIMAL(5,2) DEFAULT 0,
    attendance_date DATE NOT NULL,
    import_batch_id NVARCHAR(100),
    imported_at DATETIME DEFAULT GETDATE(),
    source NVARCHAR(50) DEFAULT 'MACHINE',
    is_locked BIT DEFAULT 1,
    UNIQUE (emp_code, division, year, month, day, import_batch_id)
  );
`;
```

#### absen_machine_input

```typescript
export const ABSEN_MACHINE_INPUT_SCHEMA = `
  CREATE TABLE absen_machine_input (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    emp_name NVARCHAR(255),
    gang_code NVARCHAR(50),
    division NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    day INT NOT NULL,
    has_work BIT DEFAULT 0,
    is_sunday BIT DEFAULT 0,
    is_holiday BIT DEFAULT 0,
    holiday_desc NVARCHAR(255),
    is_cuti BIT DEFAULT 0,
    is_sakit BIT DEFAULT 0,
    task_code NVARCHAR(50),
    ot_hours DECIMAL(5,2) DEFAULT 0,
    attendance_date DATE NOT NULL,
    input_type NVARCHAR(20) DEFAULT 'MANUAL',
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    created_by NVARCHAR(100),
    notes NVARCHAR(500),
    UNIQUE (emp_code, division, year, month, day)
  );
`;
```

#### absen_change_log

```typescript
export const ABSEN_CHANGE_LOG_SCHEMA = `
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
`;
```

#### absen_import_batch

```typescript
export const ABSEN_IMPORT_BATCH_SCHEMA = `
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
`;
```

#### absen_config

```typescript
export const ABSEN_CONFIG_SCHEMA = `
  CREATE TABLE absen_config (
    id INT IDENTITY(1,1) PRIMARY KEY,
    config_key NVARCHAR(100) UNIQUE NOT NULL,
    config_value NVARCHAR(MAX),
    description NVARCHAR(500),
    updated_at DATETIME DEFAULT GETDATE()
  );
`;
```

#### absen_sync_log

```typescript
export const ABSEN_SYNC_LOG_SCHEMA = `
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
`;
```

---

## API Endpoints

### IT Solution API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/divisions` | GET | List all divisions |
| `/api/available-months-by-division` | GET | Get available months for division |
| `/api/attendance-by-division` | GET | Get attendance data |

### SQL Gateway

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/query` | POST | Execute SQL query |

---

## Environment Variables (Recommended)

```bash
# .env file
SQL_GATEWAY_URL=http://10.0.0.110:8001/v1/query
SQL_GATEWAY_API_KEY=REDACTED
SQL_SERVER_PROFILE=SERVER_PROFILE_1
SQL_DATABASE=extend_db_ptrj
ABSENSI_API_URL=http://10.0.0.110:5176
ABSENSI_API_KEY=REDACTED
SYNC_INTERVAL_MINUTES=15
SYNC_BATCH_SIZE=100
ZKTECO_PASSWORD=12345
```

---

## Default Values

| Parameter | Default Value | Notes |
|-----------|---------------|-------|
| Sync Interval | 15 minutes | Configurable |
| Batch Size | 100 records | For database inserts |
| Sync Modes | hk, ot | Hari kerja and overtime |
| Machine Password | 12345 | All machines |
| ZKTeco Timeout | 20000ms | 20 seconds |
| API Timeout | 30000ms | 30 seconds |

---

## Related Documentation

- [01_SECRETS_MANAGEMENT.md](./01_SECRETS_MANAGEMENT.md) - Secrets handling
- [02_NETWORK_TOPOLOGY.md](./02_NETWORK_TOPOLOGY.md) - Network configuration
- [08_ENVIRONMENT_SETUP.md](./08_ENVIRONMENT_SETUP.md) - Environment setup
- [09_DEPLOYMENT_STEPS.md](./09_DEPLOYMENT_STEPS.md) - Deployment guide