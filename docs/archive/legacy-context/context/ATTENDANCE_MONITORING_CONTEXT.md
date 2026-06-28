# Attendance Monitoring System - Technical Context

> **Purpose**: Deep dive into attendance monitoring, anomaly detection, and data quality systems.
> **Last Updated**: 2026-06-19

---

## 1. Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ZKTeco Machines ──────TCP────────► ZktecoService                          │
│                                                │                           │
│  IT Solution API ──────REST───────► ApiAttendanceImportService            │
│                                                │                           │
│                                                ▼                           │
│                                      ImportOrchestrator                     │
│                                      (tries ZKTeco first,                  │
│                                       falls back to API)                   │
│                                                │                           │
│                                                ▼                           │
│                                   attendance-process.service.ts             │
│                                   (raw → daily attendance)                 │
│                                                │                           │
│                           ┌────────────────────┼────────────────────┐      │
│                           ▼                    ▼                    ▼      │
│                   anomaly.service.ts   data-quality.service.ts  live-feed  │
│                   (detect issues)      (check mapping rates)    (SSE)       │
│                           │                    │                    │      │
│                           ▼                    ▼                    ▼      │
│                      AlertService         Dashboard APIs          Frontend  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Import Services

### 2.1 ZKTeco Direct Import (`direct-zkteco-import.service.ts`)

**Purpose**: Fetch attendance data directly from ZKTeco biometric machines via TCP.

**Process**:
1. Connect to machine using `node-zklib`
2. Fetch users: `zk.getUsers()`
3. Fetch attendance: `zk.getAttendances()`
4. Parse user IDs to employee codes
5. Store in `attendance_raw_log`
6. Mark as processed

**Key Functions**:
```typescript
class DirectZktecoImportService {
  async syncMachine(machineCode: string): Promise<SyncResult>
  async fetchFromMachine(ip: string, port: number): Promise<RawData>
  parseUserIdToEmployeeCode(userId: string, locCode: string): string
}
```

### 2.2 API Fallback Import (`api-attendance-import.service.ts`)

**Purpose**: Fetch attendance from IT Solution API when ZKTeco machine is blocked/inaccessible.

**API Endpoints Used**:
```
GET /api/divisions
GET /api/available-months-by-division?division={code}
GET /api/attendance-by-division?division={code}&month={m}&year={y}&mode=hk
```

**Headers Required**:
```
x-api-key: {configured_key}
```

### 2.3 Sync Orchestrator (`sync-orchestrator.service.ts`)

**Purpose**: Coordinate sync attempts with fallback logic.

**Logic**:
```
For each machine:
  1. If machine is_accessible:
     - Try ZKTeco direct sync
     - If fails, log error but don't fallback (blocked machines handled differently)
  2. If machine is NOT accessible:
     - Use IT Solution API sync
```

---

## 3. Attendance Processing

### 3.1 Daily Processing (`attendance-process.service.ts`)

**Process**:
1. Load raw logs for date range
2. Group by employee code and date
3. Identify check-in (first scan) and check-out (last scan)
4. Calculate work hours
5. Detect anomalies
6. Store in `attendance_daily_process`

**Work Hours Calculation**:
```typescript
work_hours = calculateHours(check_in, check_out)
// Default: full day = 8 hours
// Late arrival/early departure tracked via anomaly flags
```

### 3.2 Cross-Division Detection (`attendance-reconcile.service.ts`)

**Purpose**: Detect when employees scan at machines outside their assigned division.

**Detection Logic**:
```sql
-- An employee has cross-division scans if:
-- They scan at machine X (division A) AND
-- They also scan at machine Y (division B) on same day
-- AND division A != division B
```

**Resolution Priority**:
1. Home division (from `mst_employee`)
2. API division (from IT Solution import)
3. Machine scan location (fallback)

---

## 4. Anomaly Detection Rules

### 4.1 Anomaly Types (`anomaly.service.ts`)

| Anomaly Type | Severity | Detection Logic | Action |
|--------------|----------|-----------------|--------|
| `NO_CHECKIN` | HIGH | No scans on work date | Alert HR |
| `NO_CHECKOUT` | MEDIUM | Checked in but no check-out | Flag for review |
| `INCOMPLETE_SCAN` | MEDIUM | Less than 2 scans recorded | Flag for review |
| `MULTIPLE_LOCATION` | LOW | Scanned at >2 machines same day | Log only |
| `CROSS_DIVISION` | MEDIUM | Scan location != home division | Track |
| `LATE_ARRIVAL` | MEDIUM | Check-in after threshold (not implemented) | Planned |
| `EARLY_DEPARTURE` | LOW | Check-out before threshold (not implemented) | Planned |

### 4.2 Anomaly Storage

```typescript
interface Anomaly {
  id: string;
  emp_code: string;
  work_date: string;
  anomaly_type: AnomalyType;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  details: Record<string, any>;
  detected_at: Date;
  resolved: boolean;
  resolved_at?: Date;
  resolved_by?: string;
}
```

---

## 5. Data Quality Monitoring

### 5.1 Quality Checks (`data-quality.service.ts`)

| Check | SQL Logic | Threshold |
|-------|-----------|-----------|
| **Unmapped Employees** | `COUNT(*) WHERE mapping_status != 'MAPPED'` | Alert if >50 |
| **Duplicate Scans** | `GROUP BY emp_code, scan_time HAVING COUNT(*) > 1` | Auto-clean |
| **Machine Time Drift** | `ABS(machine_time - server_time) > 5 minutes` | Alert if detected |
| **Unprocessed Logs** | `COUNT(*) WHERE processed = 0` | Alert if growing |
| **Machine Coverage** | `machines without data in 24h` | Alert if >2 |

### 5.2 Quality Metrics

```typescript
interface QualityMetrics {
  totalScans: number;
  mappedScans: number;
  unmappedScans: number;
  duplicateScans: number;
  mappingRate: number;        // (mapped / total) * 100
  duplicateRate: number;      // (duplicates / total) * 100
  machinesOnline: number;
  machinesOffline: number;
  lastSyncTime: Date;
}
```

---

## 6. Real-Time Monitoring

### 6.1 SSE Endpoints (`realtime.routes.ts`)

**Connection Flow**:
```
Client connects to /api/realtime/live-feed
    │
    ├── Initial snapshot (stats, machineStatus, recentBatches)
    │
    └── Subscribe to events:
        - attendance.new
        - machine.online
        - machine.offline
        - sync.completed
        - sync.failed
```

**Event Format**:
```typescript
// Server sends:
event: {event_type}
data: {JSON.stringify(event_data)}

// Example:
event: attendance.new
data: {"emp_code":"A0044","machine":"P1A","time":"2026-06-19T08:15:00Z"}
```

### 6.2 Real-time Emitter (`lib/realtime-emitter.ts`)

**Pattern**: Observer pattern with typed events.

```typescript
// Emit an event
emitter.emit('sync.completed', { machine: 'P1A', records: 150 });

// Subscribe
emitter.on('sync.completed', (data) => {
  console.log('Sync done:', data);
});
```

---

## 7. Alert System

### 7.1 Default Alert Rules

```typescript
const DEFAULT_ALERT_RULES = [
  {
    name: 'high_unmapped',
    condition: 'unmapped_count > 50',
    severity: 'WARNING',
    action: 'dashboard'
  },
  {
    name: 'critical_unmapped',
    condition: 'unmapped_count > 200',
    severity: 'CRITICAL',
    action: 'email'
  },
  {
    name: 'machine_offline',
    condition: 'machine_status == "offline"',
    severity: 'HIGH',
    action: 'dashboard'
  },
  {
    name: 'sync_failed',
    condition: 'sync_status == "failed"',
    severity: 'HIGH',
    action: 'dashboard'
  }
];
```

### 7.2 Alert Channels

| Channel | Status | Implementation |
|---------|--------|---------------|
| DASHBOARD | Implemented | Shows in alerts panel |
| EMAIL | Placeholder | Requires SMTP config |
| SMS | Placeholder | Requires SMS provider |
| WEBHOOK | Placeholder | Requires endpoint URL |

---

## 8. Dashboard APIs

### 8.1 Monitoring Dashboard (`/api/monitoring/dashboard`)

**Response**:
```typescript
{
  success: true,
  data: {
    totalMachines: number,
    onlineMachines: number,
    offlineMachines: number,
    todayScans: number,
    pendingBatches: number,
    failedBatches: number,
    lastSyncTime: string
  }
}
```

### 8.2 Quality Summary (`/api/quality/summary`)

**Response**:
```typescript
{
  success: true,
  data: {
    totalEmployees: number,
    mappedEmployees: number,
    unmappedCodes: number,
    mappingRate: number,
    todayScans: number,
    duplicateCount: number,
    machinesWithDrift: number
  }
}
```

---

## 9. Scheduler

### 9.1 In-Memory Scheduler (`scheduler.service.ts`)

**Features**:
- Cron-like job scheduling
- JSON config persistence
- Manual run trigger
- Job status tracking

**Predefined Jobs**:
```json
{
  "sync_all_machines": "0 */6 * * *",
  "process_daily": "0 1 * * *",
  "quality_check": "0 */4 * * *",
  "alert_check": "0 */2 * * *"
}
```

---

## 10. Missing Features (Roadmap)

### Priority 1 - Critical
- [ ] Late arrival detection (check-in after 08:00)
- [ ] Early departure detection (check-out before 17:00)
- [ ] Working hours calculation (actual vs expected)

### Priority 2 - Important
- [ ] Overtime approval workflow
- [ ] Leave balance tracking
- [ ] Weekly off/holiday handling
- [ ] Role-based access control

### Priority 3 - Nice to Have
- [ ] Predictive analytics (absent likelihood)
- [ ] Machine failure prediction
- [ ] Mobile app
- [ ] Self-service employee portal

---

## 11. Database Views (Required)

```sql
-- Attendance final view
CREATE VIEW vw_attendance_final AS
SELECT
  a.emp_code,
  a.work_date,
  a.check_in,
  a.check_out,
  a.work_hours,
  a.status,
  e.emp_name,
  e.division_code,
  r.reconciled_division,
  CASE
    WHEN r.reconciled_division IS NOT NULL THEN r.reconciled_division
    ELSE e.division_code
  END as assigned_division
FROM attendance_daily_process a
LEFT JOIN mst_employee e ON a.emp_code = e.emp_code
LEFT JOIN attendance_division_reconcile r ON a.emp_code = r.emp_code AND a.work_date = r.work_date;

-- Monthly summary view
CREATE VIEW vw_attendance_monthly_summary AS
SELECT
  emp_code,
  YEAR(work_date) as year,
  MONTH(work_date) as month,
  COUNT(*) as total_days,
  SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) as present_days,
  SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) as absent_days,
  SUM(CASE WHEN status = 'LEAVE' THEN 1 ELSE 0 END) as leave_days,
  SUM(work_hours) as total_hours
FROM attendance_daily_process
GROUP BY emp_code, YEAR(work_date), MONTH(work_date);

-- Sync status view
CREATE VIEW vw_sync_latest_status AS
SELECT
  m.machine_code,
  m.machine_name,
  m.ip_address,
  m.is_accessible,
  MAX(b.started_at) as last_sync_at,
  b.status as last_sync_status,
  b.records_success as last_sync_records
FROM mst_machine m
LEFT JOIN import_batch b ON m.machine_code = b.machine_code
GROUP BY m.machine_code, m.machine_name, m.ip_address, m.is_accessible, b.status, b.records_success;
```

---

## 12. Key Files Reference

| File | Purpose |
|------|---------|
| `src/modules/import/direct-zkteco-import.service.ts` | ZKTeco direct sync |
| `src/modules/import/api-attendance-import.service.ts` | API fallback sync |
| `src/modules/import/sync-orchestrator.service.ts` | Sync coordination |
| `src/modules/attendance/attendance-process.service.ts` | Daily processing |
| `src/modules/attendance/attendance-reconcile.service.ts` | Division reconciliation |
| `src/modules/monitoring/anomaly.service.ts` | Anomaly detection |
| `src/modules/monitoring/data-quality.service.ts` | Quality checks |
| `src/modules/monitoring/live-feed.service.ts` | Real-time feed |
| `src/modules/monitoring/alert.service.ts` | Alert management |
| `src/lib/realtime-emitter.ts` | SSE event system |
