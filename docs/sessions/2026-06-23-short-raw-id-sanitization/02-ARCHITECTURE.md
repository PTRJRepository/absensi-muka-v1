# Arsitektur Sistem Absensi

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        16 Mesin ZKTeco                              │
│  P1A  P1B  IJL  MILL  AB2  DME  DME  ARC  ARC  ARA  AB1  P2A  ... │
│  P2B  P2A  OFFICE_PGE  OFFICE_APE                                  │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ TCP (node-zklib@1.3.0)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Node.js Backend (port 8004)                     │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │  Machines Module │───▶│ Import Module   │───▶│ Attendance      │ │
│  │  (ZKTeco TCP)   │    │ (Sync Orch.)    │    │ Processing      │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│          │                      │                       │            │
│          ▼                      ▼                       ▼            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │  Machine Config  │    │  SSOT Parser    │    │  SSE Emitter    │ │
│  │  (16 machines)   │    │  (Code Parsing)│    │  (Real-time)   │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────────┐
│ rebinmas_absensi │  │ db_ptrj      │  │ React Frontend       │
│ _monitoring      │  │ (HR Master)  │  │ (port 5173)          │
│ (SQL Server)     │  │              │  │                      │
│ Direct MSSQL     │  │ EmpCode      │  │ Dashboard            │
└──────────────────┘  │ EmpName      │  │ Machines             │
                      │ Status       │  │ Attendance Matrix     │
                      │ LocCode      │  │ Quality              │
                      └──────────────┘  └──────────────────────┘
```

---

## DUAL MODE: Data Mesin vs Database

**KONSEP KRUSIAL** — Selalu pahami perbedaan ini:

| Mode | Sumber | Data | Use Case |
|------|--------|------|---------|
| **Data Mesin** | Real-time ZKTeco | Raw `device_uid` ("10044") | Lihat siapa yang scan |
| **Database** | Synced + processed | `employee_code` ("A0044") | Lihat absensi dengan nama |

**Mapping**: `device_uid` → `employee_code` via registry + SSOT parser

---

## Alur Data Lengkap

### Step 1: Sync dari Mesin ZKTeco

```
ZKTeco Machine (e.g., P1A)
    ↓ TCP connect + authenticate
node-zklib.getUsers()     → daftar user enrolled
node-zklib.getAttendances() → semua scan record
    ↓
sync-orchestrator.service.ts
    ↓
attendance_scan_logs (raw_device_user_id, scan_time, machine_code)
```

### Step 2: Canonical Mapping (SSOT)

```
attendance_scan_logs.raw_device_user_id
    ↓
zkteco-employee-code-parser.ts (parseZktecoUserIdToEmployeeCode)
    ↓
zkteco_absensi_user_registry (DEDUPLICATED — 1 ID = 1 entry)
    ↓
db_ptrj.dbo.HR_EMPLOYEE (lookup by EmpCode)
    ↓
attendance_imports (employee_code, attendance_date, status)
```

### Step 3: Real-time Updates

```
attendance_imports INSERT
    ↓
realtime-emitter.ts (SSE broadcast)
    ↓
Frontend LiveFeed (React)
```

---

## Module Structure

```
src/
├── modules/
│   ├── machines/          # ZKTeco device communication
│   ├── employees/         # Employee CRUD + mapping
│   ├── mapping/           # SSOT parser (zkteco-employee-code-parser.ts)
│   ├── import/            # ZKTeco sync orchestration
│   ├── attendance/         # Raw log processing
│   ├── monitoring/         # Dashboard, anomaly, alerts
│   ├── audit/             # Audit logging
│   └── scheduler/         # Scheduled sync jobs
├── api/
│   └── routes/            # 22 route files (123 endpoints)
├── lib/
│   └── db.ts             # Direct MSSQL (primary)
└── shared/
    └── database/
        └── sql-client.ts  # HTTP Gateway (LEGACY)
```

### Machines Module
- `machine.repository.ts` — CRUD for attendance_machines
- `machine.service.ts` — Business logic
- `zkteco.service.ts` — TCP client wrapper

### Employees Module
- `employee.repository.ts` — Employee CRUD
- `employee-mapping.service.ts` — Scanner → emp_code mapping (with name validation)
- `employee-movement.service.ts` — Division history

### Mapping Module (SSOT)
- `zkteco-employee-code-parser.ts` — **SATU-SATUNYA** tempat parsing employee code

### Import Module
- `direct-zkteco-import.service.ts` — ZKTeco → DB import
- `sync-orchestrator.service.ts` — Sync coordination
- `manual-import.service.ts` — CSV/DAT file import

### Attendance Module
**⚠️ WARNING: Duplicate Implementation**
- `attendance-process-import.service.ts` — NEW (uses direct MSSQL)
- `attendance-process.service.ts` — LEGACY (uses SqlClient)

### Monitoring Module
- `anomaly.service.ts` — Anomaly detection
- `dashboard.service.ts` — Dashboard aggregation
- `data-quality.service.ts` — Quality checks
- `alert.service.ts` — **⚠️ ALERT NOTIFICATIONS ARE PLACEHOLDERS**

---

## Real-time Event System (SSE)

**File**: `src/lib/realtime-emitter.ts`

### Event Types

| Event | Keterangan | Payload |
|-------|-----------|---------|
| `sync.started` | Sync batch mulai | machineCode, batchId |
| `sync.completed` | Sync batch selesai | machineCode, batchId, duration |
| `sync.failed` | Sync batch gagal | machineCode, error |
| `machine.online` | Mesin online | machineCode |
| `machine.offline` | Mesin offline | machineCode |
| `attendance.new` | Scan baru | machineCode, employeeCode, scanTime |
| `quality.alert` | Quality alert | checkName, severity |
| `heartbeat` | Keep-alive | clientCount |

### Usage

```typescript
// Backend: publish events
import { publishSyncStarted, publishQualityAlert } from '../lib/realtime-emitter';
publishSyncStarted('P1A', batchId);
publishQualityAlert('mapping_rate', 'HIGH', 'Unmapped rate > 10%');

// Frontend: subscribe
const eventSource = new EventSource('/api/realtime/live-feed');
eventSource.addEventListener('sync.completed', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Sync done: ${data.machineCode}`);
});
```

---

## Database Connection

### Primary (Direct MSSQL)
```typescript
// src/lib/db.ts
import { query, execute, withTransaction } from '../lib/db';
const results = await query<RowType>(`SELECT * FROM table WHERE id = @id`, params);
```

### Legacy (HTTP Gateway — AVOID)
```typescript
// src/shared/database/sql-client.ts
// Connects to: http://10.0.0.110:8001/v1/query
// Target: extend_db_ptrj (LEGACY)
```

---

## Machine Configuration

**Config**: `_dev_utils/src/machine-config.ts`

### Accessible (7):
- OFFICE_PGE, OFFICE_APE, MILL, IJL, AB2, P1A, P1B

### Inaccessible (9):
- DME_01, DME_02, ARC_01, ARC_02, ARA, AB1, P2A_01, P2B, P2A_02

### Machine → locCode mapping

```typescript
const machineCodeLocMap = {
  P1A: 'A',    OFFICE_PGE: 'A',  PGE: 'A',
  P1B: 'B',
  P2A: 'C',    P2A_01: 'C',     P2A_02: 'C',
  P2B: 'D',
  DME: 'E',    DME_01: 'E',     DME_02: 'E',
  ARA: 'F',    OFFICE_APE: 'F',
  AB1: 'G',
  AB2: 'H',    MILL: 'H',
  IJL: 'L',
  ARC: 'J',    ARC_01: 'J',     ARC_02: 'J',
};
```

---

## ZKTeco Integration Pattern

```typescript
import ZKLib from 'node-zklib';

const zk = new ZKLib(ip, port, 30000, 4000, '12345');
await zk.createSocket();
await zk.disableDevice();

const users = await zk.getUsers();       // { data: [...], err: ... }
const attendances = await zk.getAttendances();

await zk.enableDevice();
await zk.disconnect();
```

---

## Custom Router Pattern

**BUKAN Express atau Fastify** — custom lightweight router:

```typescript
// Route registration
route('GET', '/api/attendance/monthly-matrix', async (ctx) => {
  const { year, month } = ctx.query;
  const rows = await query<any>(`SELECT * FROM attendance WHERE ...`);
  sendJson(ctx.res, 200, { data: rows });
});

// Context object
ctx.params    // URL params (:param syntax)
ctx.query     // URLSearchParams
ctx.body      // Parsed JSON body
ctx.user      // Authenticated user
ctx.req       // Raw IncomingMessage
ctx.res       // Raw ServerResponse
```
