# Machine Status Documentation

Comprehensive reference for all 16 ZKTeco attendance machines, network infrastructure, status classification, and operational APIs.

---

## Table of Contents

1. [Machine Status Types](#1-machine-status-types)
2. [Machine Accessibility Classifications](#2-machine-accessibility-classifications)
3. [Complete Machine Configuration (16 Machines)](#3-complete-machine-configuration-16-machines)
4. [Scanner Code Mapping](#4-scanner-code-mapping)
5. [Network Groups](#5-network-groups)
6. [API Endpoints](#6-api-endpoints)
7. [SLA Thresholds](#7-sla-thresholds)
8. [Troubleshooting Quick Reference](#8-troubleshooting-quick-reference)

---

## 1. Machine Status Types

The system classifies each machine into one of 7 operational statuses based on connection test results, sync freshness, and data quality.

### Status Definitions

| Status | Description | Severity | Action Required |
|--------|-------------|----------|-----------------|
| `ONLINE` | Machine accessible and functioning normally | LOW | None |
| `WARNING` | Machine accessible but degraded (quality score < 80) | MEDIUM | Investigate data quality |
| `BLOCKED` | Port forwarding not configured on router | CRITICAL | Configure firewall/router |
| `UNREACHABLE` | Network path issue or machine offline | CRITICAL | Check network connectivity |
| `OFFLINE` | Machine not responding to connection attempts | HIGH | Physical/device inspection |
| `DISABLED` | Machine deactivated in configuration | LOW | Reactivate if needed |
| `STALE` | No sync data in > 60 minutes | HIGH | Run manual sync |

### Classification Logic

Implemented in `src/api/routes/ops.routes.ts`:

```typescript
type MachineStatus = 'ONLINE' | 'WARNING' | 'BLOCKED' | 'UNREACHABLE' | 'OFFLINE' | 'DISABLED' | 'STALE';

function classifyMachine(machine: any): MachineStatus {
  // Step 1: Check if machine is deactivated
  if (machine.is_active === false || machine.is_active === 0) return 'DISABLED';

  // Step 2: Check access_status for blocking conditions
  const access = String(machine.access_status ?? '').toUpperCase();
  if (access.includes('BLOCK') || access.includes('PORT')) return 'BLOCKED';
  if (access.includes('UNREACH') || access.includes('TIMEOUT') || access.includes('NO_ROUTE')) return 'UNREACHABLE';
  if (access.includes('OFFLINE')) return 'OFFLINE';

  // Step 3: Check sync freshness (> 60 minutes = STALE)
  if (machine.last_sync_at) {
    const lastSync = new Date(machine.last_sync_at).getTime();
    if (Number.isFinite(lastSync) && Date.now() - lastSync > 60 * 60 * 1000) return 'STALE';
  }

  // Step 4: Quality score determines ONLINE vs WARNING
  const quality = Number(machine.quality_score ?? 100);
  if (quality < 80) return 'WARNING';
  if (access === 'ACCESSIBLE' || access === 'ONLINE') return 'ONLINE';

  // Step 5: Fallback
  return access ? 'WARNING' : 'OFFLINE';
}
```

### Severity Mapping

```typescript
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

function severityFor(status: MachineStatus, qualityScore: number): Severity {
  if (status === 'BLOCKED' || status === 'UNREACHABLE' || qualityScore < 50) return 'CRITICAL';
  if (status === 'OFFLINE' || status === 'STALE') return 'HIGH';
  if (status === 'WARNING' || qualityScore < 80) return 'MEDIUM';
  return 'LOW';
}
```

### Severity Summary

| Severity | Trigger Conditions |
|----------|-------------------|
| **CRITICAL** | BLOCKED, UNREACHABLE, or quality_score < 50 |
| **HIGH** | OFFLINE, STALE |
| **MEDIUM** | WARNING, or quality_score < 80 |
| **LOW** | ONLINE with quality_score >= 80 |

---

## 2. Machine Accessibility Classifications

### Classification Criteria

| Classification | Criteria | Description |
|---------------|----------|-------------|
| `ACCESSIBLE` | Direct ZKTeco TCP connection confirmed | Can sync data immediately |
| `PORT_BLOCKED` | Port forwarding not configured | Router firewall blocking |
| `NETWORK_UNREACHABLE` | Router/port forwarding inactive | No route to destination |

### Machine Breakdown

#### ACCESSIBLE Machines (7)

| Machine | IP Address | Port | Last Test | Users | Attendances |
|---------|-----------|------|-----------|-------|-------------|
| OFFICE_PGE | 223.25.98.220 | 4370 | 2026-06-15 | 1,653 | 6,547 |
| MILL | 103.127.66.32 | 4370 | 2026-06-15 | 569 | 3,273 |
| OFFICE_APE | 103.144.208.154 | 4370 | 2026-06-15 | 1,083 | 11,423 |
| IJL | 103.144.211.226 | 4370 | 2026-06-15 | 166 | 4,910 |
| AB2 | 103.144.208.154 | 4400 | 2026-06-15 | 233 | 3,944 |
| P1A | 10.0.0.90 | 4100 | 2026-06-15 | 792 | 2,681 |
| P1B | 10.0.0.91 | 4300 | 2026-06-15 | 792 | 2,675 |

#### PORT_BLOCKED Machines (6)

| Machine | IP Address | Port | Local IP | Error |
|---------|-----------|------|----------|-------|
| DME_01 | 103.144.228.42 | 4700 | 192.168.1.10 | Port not reachable |
| DME_02 | 103.144.228.42 | 4701 | 192.168.1.11 | Port not reachable |
| ARC_01 | 103.144.208.154 | 4200 | 192.168.1.235 | Port not reachable |
| ARC_02 | 103.144.208.154 | 4201 | 192.168.1.236 | Port not reachable |
| ARA | 103.144.208.154 | 4800 | 192.168.1.230 | Port not reachable |
| AB1 | 103.144.208.154 | 4900 | 192.168.1.231 | Port not reachable |

#### NETWORK_UNREACHABLE Machines (3)

| Machine | IP Address | Port | Local IP | Error |
|---------|-----------|------|----------|-------|
| P2A_01 | 10.0.0.92 | 4500 | 10.0.0.92 | Network unreachable |
| P2B | 10.0.0.93 | 4600 | 10.0.0.93 | Network unreachable |
| P2A_02 | 10.0.0.94 | 4501 | 10.0.0.94 | Network unreachable |

### Accessibility Summary

```
ACCESSIBLE: 7 machines (43.75%)
PORT_BLOCKED: 6 machines (37.50%)
UNREACHABLE: 3 machines (18.75%)
───────────────────────────────
TOTAL: 16 machines
```

---

## 3. Complete Machine Configuration (16 Machines)

Source: `_dev_utils/src/machine-config.ts` (Updated 2026-06-15)

| MachineCode | Public IP | Port | LocCode | ScannerCode | Division | Type | Accessibility | Status |
|------------|-----------|------|---------|-------------|----------|------|---------------|--------|
| OFFICE_PGE | 223.25.98.220 | 4370 | A | - | STF | office | ACCESSIBLE | ONLINE |
| MILL | 103.127.66.32 | 4370 | - | - | STF | office | ACCESSIBLE | ONLINE |
| OFFICE_APE | 103.144.208.154 | 4370 | F | - | ARA | office | ACCESSIBLE | ONLINE |
| IJL | 103.144.211.226 | 4370 | L | - | IJL | absensi | ACCESSIBLE | ONLINE |
| AB2 | 103.144.208.154 | 4400 | H | 400 | AB2 | absensi | ACCESSIBLE | ONLINE |
| P1A | 10.0.0.90 | 4100 | A | 100 | PG1A | absensi | ACCESSIBLE | ONLINE |
| P1B | 10.0.0.91 | 4300 | B | 300 | PG1B | absensi | ACCESSIBLE | ONLINE |
| DME_01 | 103.144.228.42 | 4700 | E | 700 | DME | absensi | PORT_BLOCKED | BLOCKED |
| DME_02 | 103.144.228.42 | 4701 | E | 700 | DME | absensi | PORT_BLOCKED | BLOCKED |
| ARC_01 | 103.144.208.154 | 4200 | J | 200 | ARC | absensi | PORT_BLOCKED | BLOCKED |
| ARC_02 | 103.144.208.154 | 4201 | J | 200 | ARC | absensi | PORT_BLOCKED | BLOCKED |
| ARA | 103.144.208.154 | 4800 | F | 800 | ARA | absensi | PORT_BLOCKED | BLOCKED |
| AB1 | 103.144.208.154 | 4900 | G | 900 | AB1 | absensi | PORT_BLOCKED | BLOCKED |
| P2A_01 | 10.0.0.92 | 4500 | C | 500 | PG2A | absensi | UNREACHABLE | OFFLINE |
| P2B | 10.0.0.93 | 4600 | D | 600 | PG2B | absensi | UNREACHABLE | OFFLINE |
| P2A_02 | 10.0.0.94 | 4501 | C | 500 | PG2A | absensi | UNREACHABLE | OFFLINE |

### Machine Code Reference

| Code | Description | Division |
|------|-------------|----------|
| OFFICE_PGE | Head Office PGE | Staff |
| OFFICE_APE | Head Office APE | ARA Division |
| MILL | Palm Oil Mill | Staff |
| IJL | Inti Jaya Lestari | IJL Division |
| AB2 | Afdeling Blok 2 | Kebun AB2 |
| AB1 | Afdeling Blok 1 | Kebun AB1 |
| P1A | Perkebunan 1A | Kebun P1A |
| P1B | Perkebunan 1B | Kebun P1B |
| P2A_01 | Perkebunan 2A (Primary) | Kebun P2A |
| P2A_02 | Perkebunan 2A (Secondary) | Kebun P2A |
| P2B | Perkebunan 2B | Kebun P2B |
| DME_01 | DME Machine 1 | DME Division |
| DME_02 | DME Machine 2 | DME Division |
| ARC | Archipelago Estate | ARC Division |
| ARA | Arara Partnership | ARA Division |

---

## 4. Scanner Code Mapping

Scanner codes are the 3-digit suffix entered by employees when clocking in (e.g., "100" for P1A, "300" for P1B).

### Scanner Code to Machine/Division Mapping

| ScannerCode | Machine | LocCode | EmpCode Prefix | Division | Machine Status |
|------------|---------|---------|----------------|----------|----------------|
| 100 | P1A | A | A | PG1A | ACCESSIBLE |
| 200 | ARC | J | J | ARC | PORT_BLOCKED |
| 300 | P1B | B | B | PG1B | ACCESSIBLE |
| 400 | AB2 | H | H | AB2 | ACCESSIBLE |
| 500 | P2A | C | C | PG2A | UNREACHABLE |
| 600 | P2B | D | D | PG2B | UNREACHABLE |
| 700 | DME | E | E | DME | PORT_BLOCKED |
| 800 | ARA | F | F | ARA | PORT_BLOCKED |
| 900 | AB1 | G | G | AB1 | PORT_BLOCKED |

### Employee Code Format

Format: `{locCode}{last 4 digits of userId}`

Example conversions:

| Scanner Input | Machine | locCode | Employee Code |
|--------------|---------|---------|---------------|
| "10044" | P1A | A | "A0044" |
| "30232" | P1B | B | "B0232" |
| "50001" | P2A | C | "C0001" |
| "L0015" | IJL | L | "L0015" |

### Code Maps (TypeScript)

Located in `_dev_utils/src/machine-config.ts`:

```typescript
// Scanner Code Suffix → Number Prefix
export const scannerCodeMap: Record<string, number> = {
  "P1A": 100, "ARC": 200, "P1B": 300, "AB2": 400,
  "P2A": 500, "P2B": 600, "DME": 700, "ARA": 800, "AB1": 900,
};

// locCode → Employee Code Prefix
export const locCodeMap: Record<string, string> = {
  "P1A": "A", "P1B": "B", "P2A": "C", "P2B": "D",
  "DME": "E", "ARA": "F", "AB1": "G", "AB2": "H",
  "ARC": "J", "IJL": "L", "PGE": "A", "APE": "F",
};
```

### Machine ID to Employee Code Conversion

```typescript
export function convertMachineIdToEmpCode(machineId: number | string, division?: string): string {
  const id = String(machineId);
  // Already formatted (e.g., "A0044")
  if (/^[A-Z]\d+$/.test(id)) return id;

  const div = division || getDivisionFromMachineId(id) || "P1A";
  const empPrefix = locCodeMap[div] || "X";
  const numPart = id.slice(-4).replace(/^0+/, "") || "0";
  return `${empPrefix}${numPart.padStart(4, "0")}`;
}
```

---

## 5. Network Groups

Machines are grouped by their public IP addresses, which correspond to different physical locations/routers.

### Network Group Overview

| Network Group | Public IP | Machines | Locations | Status |
|--------------|-----------|---------|-----------|--------|
| Group 1 - PGE | 223.25.98.220 | OFFICE_PGE, P1A, P1B, P2A_01, P2B, P2A_02 | PGE Estate | Mixed |
| Group 2 - DME | 103.144.228.42 | DME_01, DME_02 | DME Estate | PORT_BLOCKED |
| Group 3 - ARA/ARC/AB | 103.144.208.154 | ARA, AB1, AB2, OFFICE_APE, ARC_01, ARC_02 | ARA/ARC/AB Estates | Mixed |
| Group 4 - IJL | 103.144.211.226 | IJL | IJL Estate | ACCESSIBLE |
| Group 5 - MILL | 103.127.66.32 | MILL | Palm Oil Mill | ACCESSIBLE |

### Detailed Group Breakdown

#### Group 1 - PGE (223.25.98.220)

| Machine | Port | Local IP | Accessibility | Issue |
|---------|------|----------|---------------|-------|
| OFFICE_PGE | 4370 | 10.0.0.232 | ACCESSIBLE | - |
| P1A | 4100 | 10.0.0.90 | ACCESSIBLE | - |
| P1B | 4300 | 10.0.0.91 | ACCESSIBLE | - |
| P2A_01 | 4500 | 10.0.0.92 | UNREACHABLE | Network unreachable |
| P2B | 4600 | 10.0.0.93 | UNREACHABLE | Network unreachable |
| P2A_02 | 4501 | 10.0.0.94 | UNREACHABLE | Network unreachable |

**Issue:** 3 of 6 machines unreachable on local network (10.0.0.x). Router appears to be offline or misconfigured for these IPs.

#### Group 2 - DME (103.144.228.42)

| Machine | Port | Local IP | Accessibility | Issue |
|---------|------|----------|---------------|-------|
| DME_01 | 4700 | 192.168.1.10 | PORT_BLOCKED | Port forwarding not configured |
| DME_02 | 4701 | 192.168.1.11 | PORT_BLOCKED | Port forwarding not configured |

**Issue:** Router firewall blocking ports 4700-4701. Need to add port forwarding rules.

#### Group 3 - ARA/ARC/AB (103.144.208.154)

| Machine | Port | Local IP | Accessibility | Issue |
|---------|------|----------|---------------|-------|
| OFFICE_APE | 4370 | 192.168.1.233 | ACCESSIBLE | - |
| AB2 | 4400 | 192.168.1.232 | ACCESSIBLE | - |
| ARC_01 | 4200 | 192.168.1.235 | PORT_BLOCKED | Port forwarding not configured |
| ARC_02 | 4201 | 192.168.1.236 | PORT_BLOCKED | Port forwarding not configured |
| ARA | 4800 | 192.168.1.230 | PORT_BLOCKED | Port forwarding not configured |
| AB1 | 4900 | 192.168.1.231 | PORT_BLOCKED | Port forwarding not configured |

**Issue:** Only 2 of 6 machines accessible. Ports 4200-4201, 4800, 4900 blocked.

#### Group 4 - IJL (103.144.211.226)

| Machine | Port | Accessibility |
|---------|------|---------------|
| IJL | 4370 | ACCESSIBLE |

**Status:** Single machine, fully operational.

#### Group 5 - MILL (103.127.66.32)

| Machine | Port | Accessibility |
|---------|------|---------------|
| MILL | 4370 | ACCESSIBLE |

**Status:** Single machine, fully operational.

### Required Network Configuration

| Router IP | Ports Required | Machines | Action |
|-----------|----------------|----------|--------|
| 103.144.228.42 | 4700, 4701 | DME_01, DME_02 | Add port forwarding |
| 103.144.208.154 | 4200, 4201, 4800, 4900 | ARC_01, ARC_02, ARA, AB1 | Add port forwarding |
| Internal (PGE) | 4500, 4501, 4600 | P2A_01, P2A_02, P2B | Check router power/network |

---

## 6. API Endpoints

### Machine Management Endpoints

#### GET /api/machines

List all machines with current status.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "machine_code": "P1A",
      "location_name": "Perkebunan 1A",
      "ip_address": "10.0.0.90",
      "port": 4100,
      "access_status": "ACCESSIBLE",
      "loc_code": "A",
      "machine_type": "absensi",
      "is_active": true,
      "last_sync_at": "2026-06-22T08:00:00Z",
      "scan_today": 245,
      "user_count": 792
    }
  ],
  "meta": { "total": 16, "source": "DIRECT_MSSQL" }
}
```

#### GET /api/machines/failures

Get list of machines with connection failures.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "machine_code": "DME_01",
      "access_status": "PORT_FORWARDING_REQUIRED",
      "last_error_message": "Connection failed - port not reachable",
      "last_attempt": "2026-06-22T07:30:00Z"
    }
  ],
  "meta": { "total": 9, "source": "DIRECT_MSSQL" }
}
```

#### POST /api/machines/:code/test-connection

Test connection to a specific machine.

**Parameters:**
- `code` (path): Machine code (e.g., "P1A", "DME_01")

**Response:**
```json
{
  "success": true,
  "data": {
    "machine_code": "P1A",
    "reachable": true,
    "response_time_ms": 45,
    "users": 792,
    "attendances": 2681,
    "firmware_version": "v6.80",
    "tested_at": "2026-06-22T08:05:00Z"
  }
}
```

#### GET /api/machines/real-time-status

Get real-time status of all machines (from live ZKTeco connections).

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-06-22T08:10:00Z",
    "machines": [
      {
        "code": "P1A",
        "connected": true,
        "users_online": 792,
        "last_activity": "2026-06-22T08:09:55Z"
      }
    ],
    "summary": {
      "total": 16,
      "connected": 7,
      "disconnected": 9
    }
  }
}
```

### Operations Endpoints

#### GET /api/ops/summary

Get aggregated operations summary including machine status counts and quality metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "generated_at": "2026-06-22T08:15:00Z",
    "totalMachines": 16,
    "onlineMachines": 7,
    "warningMachines": 0,
    "blockedMachines": 6,
    "unreachableMachines": 3,
    "offlineMachines": 0,
    "staleMachines": 0,
    "disabledMachines": 0,
    "scanToday": 4521,
    "totalEmployees": 5288,
    "unmappedCount": 127,
    "qualityScore": 87,
    "lastSyncAt": "2026-06-22T08:10:00Z"
  },
  "meta": {
    "source": "DIRECT_MSSQL",
    "quality_score": 87
  }
}
```

#### GET /api/ops/incidents

Get active incidents with severity filtering.

**Query Parameters:**
- `severity` (optional): Filter by severity (LOW, MEDIUM, HIGH, CRITICAL)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "machine-DME_01-BLOCKED",
      "title": "DME_01 BLOCKED",
      "message": "Connection failed - port not reachable",
      "severity": "CRITICAL",
      "category": "MACHINE",
      "machineCode": "DME_01",
      "createdAt": "2026-06-22T08:15:00Z",
      "status": "OPEN"
    }
  ],
  "meta": { "total": 9, "source": "DIRECT_MSSQL" }
}
```

#### GET /api/ops/recommendations

Get actionable recommendations based on current system state.

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      "Periksa firewall/router untuk 6 mesin dengan port blocked.",
      "Cek konektivitas jaringan untuk 3 mesin unreachable.",
      "Review 127 device user id yang belum mapped."
    ]
  },
  "meta": { "source": "DIRECT_MSSQL", "quality_score": 87 }
}
```

### Endpoint Summary Table

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| GET | /api/machines | List all machines | No |
| GET | /api/machines/failures | Failed connections | No |
| POST | /api/machines/:code/test-connection | Test connection | No |
| GET | /api/machines/real-time-status | Real-time status | No |
| GET | /api/ops/summary | Aggregated summary | No |
| GET | /api/ops/incidents | Active incidents | No |
| GET | /api/ops/recommendations | Recommendations | No |

---

## 7. SLA Thresholds

### Quality Score Calculation

Quality score is computed as a weighted combination:

```sql
qualityScore = mappedRate * 0.5
            + syncSuccessRate * 0.25
            + 100 * 0.15
            + 100 * 0.1
```

Where:
- `mappedRate` = % of attendance records successfully mapped to employee codes
- `syncSuccessRate` = % of import batches completed successfully (last 7 days)

### SLA Levels

| Quality Score | Status | SLA Tier | Action |
|---------------|--------|----------|--------|
| >= 95 | ONLINE | Gold | Healthy - monitor only |
| 80 - 94 | ONLINE | Silver | Acceptable - investigate minor issues |
| 70 - 79 | WARNING | Bronze | Address data quality issues |
| 50 - 69 | WARNING | At Risk | Urgent attention required |
| < 50 | CRITICAL | Out of SLA | Immediate action required |

### Sync Freshness Thresholds

| Condition | Status | Threshold |
|-----------|--------|-----------|
| Fresh | ONLINE | Last sync < 30 minutes |
| Acceptable | ONLINE | Last sync < 60 minutes |
| Stale | STALE | Last sync > 60 minutes |
| Critical | STALE | Last sync > 4 hours |

### Machine Availability Targets

| Tier | Machines | Target Availability |
|------|----------|---------------------|
| Accessible | 7 | 99.5% |
| Port Blocked | 6 | N/A (blocked) |
| Unreachable | 3 | N/A (network issue) |

**Overall System Target:** 43.75% of machines (7/16) fully operational

---

## 8. Troubleshooting Quick Reference

### Issue: Machine Shows BLOCKED

**Symptoms:**
- Machine status is `BLOCKED` or `PORT_FORWARDING_REQUIRED`
- Connection test fails with "Connection refused" or timeout

**Causes:**
1. Router firewall blocking the port
2. Port forwarding not configured
3. Machine IP changed

**Resolution Steps:**
1. Log into router at the machine's public IP
2. Navigate to Port Forwarding / Virtual Server settings
3. Add rule: Protocol=TCP, External Port=Machine Port, Internal IP=Local IP
4. Test connection again

**Affected Machines:** DME_01, DME_02, ARC_01, ARC_02, ARA, AB1

---

### Issue: Machine Shows UNREACHABLE

**Symptoms:**
- Machine status is `UNREACHABLE` or `OFFLINE`
- Connection times out or "No route to host"

**Causes:**
1. Router at machine location is offline
2. Machine is powered off
3. Network cable disconnected
4. Local network down

**Resolution Steps:**
1. Verify router power and network connectivity at site
2. Check if machine is powered on
3. Verify local network cables
4. Ping local IP (e.g., `ping 10.0.0.92`)
5. Escalate to local IT for on-site inspection

**Affected Machines:** P2A_01, P2B, P2A_02 (Group 1 - PGE local network)

---

### Issue: Machine Shows STALE

**Symptoms:**
- Machine shows `STALE` status
- Last sync timestamp > 60 minutes ago

**Causes:**
1. Sync job not running
2. Sync completed but failed to update `last_sync_at`
3. Machine temporarily unreachable

**Resolution Steps:**
1. Check if sync job is running: `npm run sync:machines`
2. Verify database connectivity
3. Run manual sync for specific machine
4. Check sync logs for errors

---

### Issue: Low Quality Score (< 80)

**Symptoms:**
- Machine shows `WARNING` status
- Quality score between 70-79

**Causes:**
1. High number of unmapped employee codes
2. Failed import batches
3. Low scan count today

**Resolution Steps:**
1. Review unmapped codes: `GET /api/ops/incidents?severity=MEDIUM`
2. Check failed batches in `attendance_import_batches` table
3. Verify employee enrollment on machine
4. Run employee mapping sync

---

### Issue: Scanner Not Working

**Symptoms:**
- Employees cannot clock in
- Machine shows activity but no scans in database

**Causes:**
1. Employee not enrolled in machine
2. Wrong scanner code entered
3. Employee code not in employee table

**Resolution Steps:**
1. Verify employee is enrolled in machine
2. Check scanner code matches machine location
3. Run employee sync: `npm run seed:machines`
4. Verify employee exists in `employees` table

---

### Quick Diagnostic Commands

```bash
# Test machine connectivity
npm run sync:machines

# Check sync status
npm run db:check

# View recent imports
npm run seed:dummy

# Test specific machine
curl -X POST http://localhost:3000/api/machines/P1A/test-connection

# Get operations summary
curl http://localhost:3000/api/ops/summary

# Get active incidents
curl http://localhost:3000/api/ops/incidents

# Get recommendations
curl http://localhost:3000/api/ops/recommendations
```

---

## Appendix: Access Status Values

Stored in `attendance_machines.access_status` column.

| Value | Meaning | Resulting Machine Status |
|-------|---------|-------------------------|
| `ACCESSIBLE` | Direct ZKTeco connection confirmed | ONLINE |
| `PORT_FORWARDING_REQUIRED` | Port forwarding not configured | BLOCKED |
| `UNREACHABLE` | Network path issue | UNREACHABLE |
| `TIMEOUT` | Connection timeout | UNREACHABLE |
| `NO_ROUTE` | No route to host | UNREACHABLE |
| `OFFLINE` | Machine offline | OFFLINE |
| `DISABLED` | Machine deactivated | DISABLED |
| `UNKNOWN` | Not yet tested | WARNING |

---

*Last Updated: 2026-06-22*
*Source: `_dev_utils/src/machine-config.ts`, `src/api/routes/ops.routes.ts`*
