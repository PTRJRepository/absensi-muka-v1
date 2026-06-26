# Machine Health Monitoring

## Overview

Machine health monitoring in the Absensi system tracks the operational status of all 16 ZKTeco attendance machines. Health data is derived from:

- **Connection tests**: Real-time TCP connectivity to each machine
- **Sync history**: Last successful sync timestamp per machine
- **Quality scores**: Mapped/unmapped ratio from scan logs
- **Incident classification**: Severity-ranked issues requiring action

Health monitoring is primarily implemented in `src/api/routes/ops.routes.ts` and `src/api/routes/machines.routes.ts`. The `data-quality.service.ts` provides additional quality checks.

---

## 1. Health Monitoring API Endpoints

### `GET /api/machines/:code/health`

**Status**: Not yet implemented as a dedicated endpoint.

Currently, health info for a single machine is available through:

- `GET /api/machines` — returns all machines with `quality_score`, `scan_count_today`, `user_count_today`, `unmapped_count_7d`
- `POST /api/machines/:machineCode/test-connection` — live connection test returning `{ success: bool, error?: string }`

**Intended shape** (to be implemented):
```json
{
  "machineCode": "P1A",
  "status": "WARNING",
  "severity": "MEDIUM",
  "qualityScore": 72,
  "lastSyncAt": "2026-06-22T08:00:00Z",
  "lastSyncAgeMinutes": 45,
  "syncStatus": "CURRENT",
  "scanCountToday": 148,
  "userCountToday": 74,
  "unmappedCount7d": 23,
  "isOnline": true,
  "ipAddress": "10.0.0.90",
  "port": 4100,
  "connectionErrors": []
}
```

---

### `GET /api/ops/summary`

**Status**: Implemented in `src/api/routes/ops.routes.ts:109`

Returns an aggregated health summary for all active machines.

**Response**:
```json
{
  "generated_at": "2026-06-22T10:00:00Z",
  "totalMachines": 16,
  "onlineMachines": 7,
  "warningMachines": 2,
  "blockedMachines": 0,
  "unreachableMachines": 6,
  "offlineMachines": 0,
  "staleMachines": 1,
  "disabledMachines": 0,
  "scanToday": 2847,
  "totalEmployees": 1653,
  "unmappedCount": 89,
  "qualityScore": 76,
  "lastSyncAt": "2026-06-22T08:00:00Z"
}
```

Quality score formula (weighted):
```
qualityScore = mappedRate * 0.5 + syncSuccessRate * 0.25 + 100 * 0.15 + 100 * 0.1
```
- `mappedRate`: % of scans with `mapping_status = 'MAPPED'` (last 7 days)
- `syncSuccessRate`: % of import batches that completed successfully (last 7 days)

---

### `GET /api/ops/incidents`

**Status**: Implemented in `src/api/routes/ops.routes.ts:145`

Returns active health incidents across all machines, filtered by severity.

**Query parameters**:
- `severity` (optional): `LOW | MEDIUM | HIGH | CRITICAL`

**Response**:
```json
[
  {
    "id": "machine-P2A_01-UNREACHABLE",
    "title": "P2A_01 UNREACHABLE",
    "message": "Connection failed - network unreachable",
    "severity": "CRITICAL",
    "category": "MACHINE",
    "machineCode": "P2A_01",
    "createdAt": "2026-06-22T10:00:00Z",
    "status": "OPEN"
  }
]
```

Severity filter is applied in-memory after deriving severity from machine status and quality score.

---

## 2. SLA Thresholds

Thresholds used by the ops routes for classification. These are currently hardcoded in `src/api/routes/ops.routes.ts` and should be extracted to `_dev_utils/src/machine-config.ts`.

| Metric | Threshold | Status | Source |
|--------|-----------|--------|--------|
| Quality Score | >= 80 | HEALTHY | `ops.routes.ts:19` |
| Quality Score | 50-79 | DEGRADED | `ops.routes.ts:19` (maps to WARNING) |
| Quality Score | < 50 | CRITICAL | `ops.routes.ts:25` |
| Last Sync Age | < 60 min | CURRENT | `ops.routes.ts:16` |
| Last Sync Age | > 60 min | STALE | `ops.routes.ts:16` |
| Last Sync Age | > 24 hours | SEVERELY_STALE | Not explicitly checked |

```typescript
// src/api/routes/ops.routes.ts - classification logic

function classifyMachine(machine: any): MachineStatus {
  if (machine.is_active === false) return 'DISABLED';
  if (access.includes('BLOCK')) return 'BLOCKED';
  if (access.includes('UNREACH') || access.includes('TIMEOUT')) return 'UNREACHABLE';
  if (access.includes('OFFLINE')) return 'OFFLINE';
  if (machine.last_sync_at && (Date.now() - new Date(machine.last_sync_at).getTime()) > 60 * 60 * 1000)
    return 'STALE';
  if (quality < 80) return 'WARNING';
  return 'ONLINE';
}

function severityFor(status: MachineStatus, qualityScore: number): Severity {
  if (status === 'BLOCKED' || status === 'UNREACHABLE' || qualityScore < 50) return 'CRITICAL';
  if (status === 'OFFLINE' || status === 'STALE') return 'HIGH';
  if (status === 'WARNING' || qualityScore < 80) return 'MEDIUM';
  return 'LOW';
}
```

---

## 3. Incident Severity Classification

| Severity | Trigger | Action Required | Current Implementation |
|----------|---------|-----------------|------------------------|
| CRITICAL | Machine `BLOCKED` or `UNREACHABLE` | Immediate response | `ops.routes.ts:25` |
| CRITICAL | Quality score < 50 | Within 1 hour | `ops.routes.ts:25` |
| HIGH | Machine `OFFLINE` or `STALE` (>60 min no sync) | Within 1 hour | `ops.routes.ts:26` |
| MEDIUM | Machine in `WARNING` status (quality 50-79) | Within 4 hours | `ops.routes.ts:27` |
| MEDIUM | Quality score 50-79 | Within 4 hours | `ops.routes.ts:27` |
| LOW | All other non-OK machines | Schedule fix | `ops.routes.ts:28` (filtered out from incidents) |

**Severity mapping table** (`src/api/routes/ops.routes.ts:24-28`):
```
BLOCKED/UNREACHABLE -> CRITICAL
OFFLINE/STALE       -> HIGH
WARNING             -> MEDIUM
DISABLED            -> (excluded)
```

**Gap**: The trigger table mentions "Machine unreachable > 4 hours" for CRITICAL, but the current implementation does not track incident duration. An incident becomes CRITICAL immediately upon reaching UNREACHABLE status, regardless of how long it has been down.

---

## 4. Connection Retry Policy

**Current implementation**: No exponential backoff retry is implemented in `ZktecoService` or `sync-orchestrator.service.ts`.

Connection is attempted once per sync cycle. On failure, the sync is marked as failed and logged.

The `zkteco.service.ts` uses a single TCP socket connection with configurable timeout:
```typescript
// src/modules/machines/zkteco.service.ts:37-43
this.client = new ZKLib(
  ip, port,
  timeoutMs ?? env.ZKTECO_TIMEOUT_MS,  // default: 30000ms
  4000,                                // always 4000ms
  password ?? env.ZKTECO_PASSWORD ?? '12345'
);
```

**Gap**: Retry with exponential backoff is not yet implemented. The task specifies:
- Initial retry: 3 seconds
- Max retries: 5
- Backoff: Exponential (3s, 9s, 27s, 81s, 243s)
- Total timeout: 5 minutes

This would need to be implemented in `sync-orchestrator.service.ts` around the ZKTeco connect call.

---

## 5. Incident Timeline Pattern

**Current implementation**: No structured incident timeline tracking exists.

The system captures:
- `machine_connection_logs.status` — per connection attempt (`SUCCESS`/`FAILED`)
- `attendance_import_batches` — per sync batch with `started_at`, `completed_at`, `status`
- `attendance_machines.last_sync_at` — last successful sync time
- `attendance_machines.last_error_message` — last error string

These can be combined to reconstruct a timeline:
```sql
-- Incident timeline query
SELECT
  machine_code,
  status,
  checked_at,
  error_message
FROM machine_connection_logs
WHERE machine_code = 'P2A_01'
  AND checked_at >= DATEADD(day, -3, GETDATE())
ORDER BY checked_at DESC;
```

**Gap**: No dedicated `machine_incidents` table with `start_time`, `first_retry`, `last_retry`, `resolution_time`, `root_cause` columns exists.

**Incident record shape** (as returned by `GET /api/ops/incidents`):
```json
{
  "id": "machine-{machineCode}-{status}",
  "title": "{machineCode} {status}",
  "message": "{last_error_message or default message}",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "category": "MACHINE",
  "machineCode": "{code}",
  "createdAt": "{current ISO timestamp}",
  "status": "OPEN"
}
```

---

## Data Quality Service

The `data-quality.service.ts` provides additional health-adjacent checks:

| Check | Severity Logic | Gap |
|-------|---------------|-----|
| UNMAPPED_EMPLOYEES | >100 unmapped scans = CRITICAL, >10 = HIGH | Overlaps with quality score |
| DUPLICATE_SCANS | >1000 duplicates = HIGH, >100 = MEDIUM | Not in health endpoints |
| MACHINE_TIME_DRIFT | >5 min drift = MEDIUM | Not surfaced in ops endpoints |
| UNPROCESSED_LOGS | >10000 or >50% unprocessed = HIGH | Separate from machine health |
| MACHINE_COVERAGE | Accessible but no recent data = MEDIUM | Mirrors STALE logic |

---

## Machine Accessibility Map (Reference)

| Machine | Accessible | IP | Port | Quality Score Basis |
|---------|-----------|-----|------|---------------------|
| OFFICE_PGE | YES | 223.25.98.220 | 4370 | Direct ZKTeco |
| OFFICE_APE | YES | 103.144.208.154 | 4370 | Direct ZKTeco |
| MILL | YES | 103.127.66.32 | 4370 | Direct ZKTeco |
| IJL | YES | 103.144.211.226 | 4370 | Direct ZKTeco |
| AB2 | YES | 103.144.208.154 | 4400 | Direct ZKTeco |
| P1A | YES | 10.0.0.90 | 4100 | Direct ZKTeco |
| P1B | YES | 10.0.0.91 | 4300 | Direct ZKTeco |
| DME_01 | NO | 103.144.228.42 | 4700 | Port unreachable |
| DME_02 | NO | 103.144.228.42 | 4701 | Port unreachable |
| ARC_01 | NO | 103.144.208.154 | 4200 | Port forwarding needed |
| ARC_02 | NO | 103.144.208.154 | 4201 | Port forwarding needed |
| ARA | NO | 103.144.208.154 | 4800 | Port forwarding needed |
| AB1 | NO | 103.144.208.154 | 4900 | Port forwarding needed |
| P2A_01 | NO | 10.0.0.92 | 4500 | Network unreachable |
| P2B | NO | 10.0.0.93 | 4600 | Network unreachable |
| P2A_02 | NO | 10.0.0.94 | 4501 | Network unreachable |

---

## Open Gaps vs. This Document's Spec

| Spec Item | Status | Location |
|-----------|--------|----------|
| `GET /api/machines/:code/health` | NOT IMPLEMENTED | Needs new route |
| Exponential retry (3s base, 5 retries) | NOT IMPLEMENTED | Needs `sync-orchestrator` update |
| Incident timeline table | NOT IMPLEMENTED | Needs `machine_incidents` table |
| SLA: SEVERELY_STALE (>24h) | NOT IMPLEMENTED | Needs explicit check |
| SLA: CRITICAL unreachable >4h | PARTIAL | Always CRITICAL on UNREACHABLE |
| Retry policy constants | Scattered | Needs centralizing in `machine-config.ts` |
