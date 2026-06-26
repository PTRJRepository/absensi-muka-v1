# ARCHITECTURE - Arsitektur Sistem Absensi

## Gambaran Arsitektur

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ZKTeco Machines                              │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                │
│   │  P1A    │  │  P1B    │  │  IJL    │  │  MILL   │  ... 16 total │
│   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘                │
└────────┼───────────┼───────────┼───────────┼────────────────────────┘
         │           │           │           │
         └───────────┴─────┬─────┴───────────┘
                           │ TCP (node-zklib)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Node.js Backend                                   │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │   Machines   │   │   Import     │   │  Attendance  │            │
│  │   Module     │──▶│   Module     │──▶│  Processing  │            │
│  └──────────────┘   └──────────────┘   └──────────────┘            │
│         │                                        │                   │
│         ▼                                        ▼                   │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │  ZKTeco      │   │  Ops Module  │   │  SQL Server  │            │
│  │  Service     │   │  (API-only)  │   │  (MSSQL)      │            │
│  └──────────────┘   └──────────────┘   └──────────────┘            │
│                                              │                        │
│                                              ▼                        │
│                                   ┌──────────────────────┐           │
│                                   │  realtime-emitter   │           │
│                                   │  (SSE broadcast)     │           │
│                                   └──────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    React Frontend                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │Dashboard │  │Machines  │  │Attendance│  │ Monitoring│          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
ZKTeco Machines ──TCP──→ node-zklib ──→ direct-zkteco-import.service.ts
                                                    │
                                                    ▼
                                            SQL Server
                                            (attendance_scan_logs,
                                             attendance_imports,
                                             machine_user_raw)
                                                    │
                                                    ▼
                                      attendance-process-import.service.ts
                                      (daily reconciliation)
                                                    │
                                                    ▼
                                      realtime-emitter.ts (SSE broadcast)
                                                    │
                                                    ▼
                                            LiveFeed frontend
```

### API Route Registration (22 routes)
```
src/api/routes/index.ts loads:
auth, dashboard, employees, attendance, sync, machines, mapping,
audit, reports, quality, division, realtime, realtime-status, scheduler,
import, alert, ops, monitoring, machine-employee, import-control,
attendance-process, cross-location
```

---

## Module Architecture

### 1. Machines Module
```
src/modules/machines/
├── machine.repository.ts    # CRUD for mst_machine/attendance_machines
├── machine.service.ts       # Business logic
└── zkteco.service.ts        # ZKTeco TCP client wrapper
```

**Responsibilities:**
- Machine inventory management
- ZKTeco device communication
- Connection health monitoring

### 2. Employees Module
```
src/modules/employees/
├── employee.repository.ts           # Employee CRUD
├── employee-mapping.service.ts      # Scanner code → emp_code mapping
├── employee-movement.service.ts    # Division history tracking
├── employee-comprehensive.service.ts  # Dual-mode employee queries (SSOT)
├── current-employee-resolution.service.ts  # NIK → currentEmpCode resolution
├── hr-current-snapshot.service.ts  # HR snapshot sync dari db_ptrj
└── hr-employee-sync.service.ts     # HR employee data sync
```

**Responsibilities:**
- Employee master data (SSOT — single `employees` table)
- Device user ID → Employee code mapping
- NIK → currentEmpCode resolution
- Division/gang assignments

### 3. Import Module
```
src/modules/import/
├── direct-zkteco-import.service.ts  # ZKTeco → DB import
├── manual-import.service.ts          # CSV/DAT file import
├── import-job.service.ts             # Job management
└── sync-orchestrator.service.ts       # Sync coordination
```

**Responsibilities:**
- Data import from ZKTeco machines
- Manual file import
- Batch job tracking

### 4. Attendance Module
```
src/modules/attendance/
├── attendance-raw.repository.ts          # attendance_scan_logs queries
├── attendance-process-import.service.ts  # Scan log → attendance processing
├── attendance-process.service.ts         # Legacy processing (DEPRECATED)
└── attendance-reconcile.service.ts       # Division reconciliation
```

**⚠️ WARNING: Duplicate Implementation**
Two separate processing systems exist - see Known Issues.

### 5. Monitoring Module
```
src/modules/monitoring/
├── anomaly.service.ts       # Anomaly detection
├── dashboard.service.ts     # Dashboard aggregation
├── summary.service.ts       # Summary metrics service
└── data-quality.service.ts  # Quality checks

src/api/routes/monitoring.routes.ts
src/api/routes/alert.routes.ts       # Alert configuration API
src/api/routes/realtime.routes.ts    # SSE endpoint
```

**Exports:** `AnomalyService`, `DashboardService`, `SummaryService`

### 6. Ops Module (API-only)
```
src/api/routes/ops.routes.ts
```

**Endpoints:** `/api/ops/summary`, `/api/ops/incidents`, `/api/ops/recommendations`

**Responsibilities:**
- Machine status classification (ONLINE, WARNING, BLOCKED, UNREACHABLE, OFFLINE, DISABLED, STALE)
- Quality score calculation (mapped rate + sync success rate)
- Incident detection and severity mapping
- Automated recommendations

---

## DUAL MODE: Data Mesin vs Database

**CRITICAL CONCEPT** - Always understand this distinction:

| Mode | Source | Data Type | Use Case |
|------|--------|----------|----------|
| **Data Mesin** | Real-time from ZKTeco | Raw `device_uid` (e.g., "10044") | See who scanned |
| **Database** | Synced & processed | Mapped `employee_code` (e.g., "A0044") | See attendance with names |

**Mapping:** `raw_device_user_id` → `parsed_employee_code` via SSOT parser → `employees` table (SSOT). Resolution order:
1. `employees.parsed_employee_code` (from scanner prefix parser)
2. `employees.raw_device_user_id` (exact match)
3. `employees.current_emp_code` (from HR snapshot via NIK)

---

## Employee Code Format (3-Level)

### 1. `employee_code` — Historical / Parsed
```
Format: {locCode}{4digits}
Example: "A0044" from raw_id "10044"
Source: SSOT parser dari raw_device_user_id
```
### 2. `current_emp_code` — Latest from HR
```
Format: {locCode}{4digits}
Example: "A0966" (from NIK lookup)
Source: db_ptrj.HR_EMPLOYEE via NIK → latest EmpCode
```
### 3. `nik` / NewICNo — Identity Key
```
Format: Numeric string
Example: "1906041207910002"
Source: db_ptrj.HR_EMPLOYEE.NewICNo
Purpose: Stable key to track employee across code changes
```

| Machine | locCode | userId Input | parsed emp_code | current_emp_code (may differ) |
|---------|---------|--------------|-----------------|-------------------------------|
| P1A | A | "10044" | "A0044" | Could be different if employee moved |

---

## Scanner Code → Division Mapping

| Scanner Code | Suffix | Division | locCode |
|-------------|--------|----------|---------|
| 100 | 100-199 | P1A | A |
| 200 | 200-299 | ARC | J |
| 300 | 300-399 | P1B | B |
| 400 | 400-499 | AB2 | H |
| 500 | 500-599 | P2A | C |
| 600 | 600-699 | P2B | D |
| 700 | 700-799 | DME | E |
| 800 | 800-899 | ARA | F |
| 900 | 900-999 | AB1 | G |

---

## ZKTeco Integration Pattern

```typescript
import ZKLib from 'node-zklib';

const zk = new ZKLib(ip, port, 30000, 4000, '12345');
await zk.createSocket();
await zk.disableDevice();

const users = await zk.getUsers();     // Returns { data: [...], err: ... }
const attendances = await zk.getAttendances();

await zk.enableDevice();
await zk.disconnect();
```

---

## Real-time Event System (SSE)

**File:** `src/lib/realtime-emitter.ts`

The system uses Server-Sent Events (SSE) for real-time push updates to the frontend.

### Architecture
```
Client connects to /api/realtime/live-feed
         │
         ▼
realtime-emitter.ts (in-memory client registry)
         │
         ├─ Heartbeat every 30s
         ├─ Event history buffer (100 events)
         └─ Wildcard subscriptions (e.g. "machine.*", "sync.*")
```

### Event Types
| Event | Description | Payload |
|-------|-------------|---------|
| `sync.started` | Sync batch began | machineCode, batchId |
| `sync.completed` | Sync batch finished | machineCode, batchId, users, attendance, duration |
| `sync.failed` | Sync batch failed | machineCode, error, batchId |
| `machine.online` | Machine came online | machineCode |
| `machine.offline` | Machine went offline | machineCode, reason |
| `machine.error` | Machine error detected | machineCode, errorCode, errorMessage |
| `attendance.new` | New scan recorded | machineCode, employeeCode, scanTime |
| `quality.alert` | Data quality alert | checkName, severity, message, details |
| `heartbeat` | Client keep-alive | clientCount, timestamp |

### Usage
```typescript
// Backend: publish events
import { publishSyncStarted, publishQualityAlert } from '../lib/realtime-emitter';
publishSyncStarted('P1A', batchId);
publishQualityAlert('mapping_rate', 'HIGH', 'Unmapped rate > 10%', { rate: 0.12 });

// Frontend: subscribe
const eventSource = new EventSource('/api/realtime/live-feed');
eventSource.addEventListener('sync.completed', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Sync done: ${data.machineCode}`);
});
```

### Client Registry
- Clients stored in-memory (Map)
- Wildcard subscriptions supported (`machine.*`, `sync.*`)
- Stale client cleanup after 5 minutes of no ping
- Late subscribers receive buffered event history

---

## Database Connection Approaches

**⚠️ KNOWN ISSUE: Two different connection approaches exist**

### 1. SqlClient (HTTP Gateway) - LEGACY
```typescript
// src/shared/database/sql-client.ts
// Connects to: http://10.0.0.110:8001/v1/query
// Target DB: extend_db_ptrj (LEGACY)
```

### 2. Direct MSSQL - NEW
```typescript
// src/lib/db.ts
// Uses: mssql ConnectionPool
// Target DB: rebinmas_absensi_monitoring
```

See [DATABASE.md](DATABASE.md) for full details.
