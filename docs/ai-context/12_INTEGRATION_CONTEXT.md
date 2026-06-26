---
tags: [ai-context, integration]
created: 2026-06-07
---

# Integration Context

## External Integrations

### 1. IT Solution API

**Purpose:** Primary data source for 13 divisions (PG1A, PG1B, PG2A, PG2B, DME, ARA, ARB1, ARB2, INFRA, AREC, IJL, STF-OFFICE, SECURITY)

**Integration Type:** REST API (HTTP)

**Connection Details:**
```
Base URL: http://10.0.0.110:5176
Authentication: Header x-api-key
Protocol: HTTP GET
```

**Data Flow:**
```
IT Solution API → absensi-client.ts → absensi-import.ts → SQL Server
```

**Endpoints Used:**
- `GET /api/divisions` - List all divisions
- `GET /api/available-months-by-division` - Get available months
- `GET /api/attendance-by-division` - Fetch attendance data

**Status:** ✅ Active and tested

---

### 2. SQL Gateway

**Purpose:** Database access layer for SQL Server

**Integration Type:** HTTP REST (not native SQL)

**Connection Details:**
```
Base URL: http://10.0.0.110:8001/v1/query
Authentication: Header x-api-key
Protocol: HTTP POST
Server: SERVER_PROFILE_1
Database: extend_db_ptrj
```

**Data Flow:**
```
Application → sql-client.ts → SQL Gateway → SQL Server
```

**Operations:**
- `POST /v1/query` - Execute SQL queries
- Query type: SELECT (returns recordsets)
- Execute type: INSERT/UPDATE/DELETE (no return)

**Status:** ✅ Active and tested

---

### 3. ZKTeco Attendance Machines

**Purpose:** Direct data collection from 8 accessible machines

**Integration Type:** TCP/IP (node-zklib)

**Machines Connected:**
| Machine | IP:Port | Type |
|---------|---------|------|
| PGE | 10.0.0.232:4370 | Office |
| MILL | 103.127.66.32:4370 | Office |
| DME_01 | 103.144.228.42:4700 | Absensi |
| DME_02 | 103.144.228.42:4701 | Absensi |
| ARE | 103.144.208.154:4370 | Absensi |
| IJL | 103.144.211.226:4370 | Absensi |
| ARA | 103.144.208.154:4800 | Absensi |
| AB2 | 103.144.208.154:4400 | Absensi |

**Data Flow:**
```
ZKTeco Machine → node-zklib → machine-sync.ts → SQL Server
```

**Protocol:**
- Connection: TCP socket
- Library: node-zklib@1.3.0
- Authentication: Password "12345"
- Timeout: 10-20 seconds

**Status:** ⚠️ Partial (8 of 15 machines accessible)

---

## Internal Integrations

### Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    MODULE DEPENDENCIES                      │
└─────────────────────────────────────────────────────────────┘

config.ts ──────────────────────────────────────────────────────┐
  │ │
  ├──→ absensi-client.ts ←─────── absensi-import.ts             │
  │           │                                                    │
  │           └──→ sync.ts ───────────────→ scheduler.ts        │
  │                    │ │
  │                    └──→ absensi-service.ts                   │
  │                             │                                │
  │                             └──→ sql-client.ts │
  │                                        │                     │
  │                                        └──→ database.ts       │
  │                                                  │           │
  └──→ machine-config.ts ←─── machine-sync.ts ───┘             │
  │                                                               │
  └──→ machine-client.ts                                         │
```

---

## Data Format Mappings

### Machine ID to Employee Code

```typescript
// scannerCodeMap: Suffix → Division
{ 100: "P1A", 200: "ARC", 300: "P1B", 400: "AB2",
  500: "P2A", 600: "P2B", 700: "DME", 800: "ARA", 900: "AB1" }

// locCodeMap: Division → Employee Code Prefix
{ P1A: "A", P1B: "B", P2A: "C", P2B: "D",
  DME: "E", ARA: "F", AB1: "G", AB2: "H",
  ARC: "J", IJL: "L", PGE: "A" }

// Conversion: Machine ID "10129" → Employee Code "A0129"
```

### API Day Data to Database Record

```typescript
// API format (day_N object)
{
  date: "2026-05-01T00:00:00.000Z",
  hasWork: true,
  isSunday: false,
  isHoliday: true,
  holidayDesc: "Hari Buruh",
  isCuti: false,
  isSakit: false,
  otHours: "0.00",
  taskCode: "NORMAL"
}

// Database format (absen_import row)
{
  emp_code: "A0039",
  division: "PG1A",
  year: 2026,
  month: 5,
  day: 1,
  has_work: 1,
  is_sunday: 0,
  is_holiday: 1,
  holiday_desc: "Hari Buruh",
  is_cuti: 0,
  is_sakit: 0,
  ot_hours: 0.00,
  task_code: "NORMAL",
  attendance_date: "2026-05-01"
}
```

---

## Integration Points

| Source | Target | Protocol | Data |
|--------|--------|----------|------|
| ZKTeco Machines | node-zklib | TCP | Raw attendance logs |
| IT Solution API | absensi-client.ts | HTTP REST | Structured attendance |
| absensi-client.ts | absensi-import.ts | In-memory | Employee/day data |
| absensi-import.ts | SQL Gateway | HTTP POST | SQL INSERT |
| machine-sync.ts | sql-client.ts | In-memory | Transformed records |
| scheduler.ts | sync.ts | In-memory | Sync trigger |
| sync.ts | absen_sync_log | HTTP POST | Sync metadata |

---

## Error Handling Across Integrations

### Network Errors
- Connection timeout: Retry with exponential backoff
- Gateway unavailable: Log error, skip batch
- Machine unreachable: Mark as offline, continue others

### Data Errors
- Invalid API response: Log and skip record
- SQL constraint violation: Log and continue
- Duplicate record: Skip (UNIQUE constraint)

### Integration Monitoring
- Sync log table tracks all operations
- Error messages stored per batch
- Success/failure status per division
