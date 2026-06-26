# PRD: Perbaikan Status Mesin pada Halaman Mesin NOC

## 1. Judul

**PRD Perbaikan Machine Status Classification untuk Mesin NOC**

## 2. Konteks

Halaman **Mesin NOC** saat ini menampilkan status mesin absensi ZKTeco, tetapi status yang muncul belum akurat.

### Current UI Problem:
```
Online: 1 / 16
Critical: 5
User Mesin: 60
Scan Hari Ini: 67
```

### Expected Baseline:
```
ACCESSIBLE: 7 mesin
PORT_BLOCKED: 6 mesin
NETWORK_UNREACHABLE: 3 mesin
TOTAL: 16 mesin
```

## 3. Machine Classification Baseline

### ACCESSIBLE Machines (7)
- OFFICE_PGE, MILL, OFFICE_APE, IJL, AB2, P1A, P1B

### PORT_BLOCKED Machines (6)
- DME_01, DME_02, ARC_01, ARC_02, ARA, AB1

### NETWORK_UNREACHABLE Machines (3)
- P2A_01, P2B, P2A_02

## 4. Status Type Definitions

### AccessibilityStatus
- ACCESSIBLE, PORT_BLOCKED, NETWORK_UNREACHABLE, OFFLINE, DISABLED, UNKNOWN

### LiveConnectionStatus  
- ONLINE, OFFLINE, TIMEOUT, FAILED, UNKNOWN

### SyncFreshnessStatus
- FRESH (<= 60 min), STALE (> 60 min), NEVER_SYNCED, SYNC_FAILED

### MachineDisplayStatus (Final)
- ONLINE, WARNING, BLOCKED, UNREACHABLE, OFFLINE, DISABLED, STALE

## 5. Classification Logic

```typescript
function classifyMachineStatus(machine) {
  if (!machine.is_active) return 'DISABLED';
  
  const access = normalizeAccessStatus(machine.access_status);
  
  if (access === 'PORT_BLOCKED') return 'BLOCKED';
  if (access === 'NETWORK_UNREACHABLE') return 'UNREACHABLE';
  if (access === 'OFFLINE') return 'OFFLINE';
  
  if (access === 'ACCESSIBLE') {
    if (machine.live_connected === true) return 'ONLINE';
    if (machine.last_sync_at) {
      const ageMinutes = minutesSince(machine.last_sync_at);
      if (ageMinutes > 60) return 'STALE';
      if (machine.quality_score < 80) return 'WARNING';
      return 'ONLINE';
    }
    return 'STALE';
  }
  
  return 'WARNING';
}
```

## 6. API Response Requirements

### GET /api/machines
```json
{
  "machine_code": "P1A",
  "access_status": "ACCESSIBLE",
  "display_status": "STALE",
  "sync_status": "STALE",
  "live_status": "UNKNOWN",
  "severity": "HIGH",
  "reason": "Machine accessible but sync is stale"
}
```

### GET /api/ops/summary
```json
{
  "accessibleMachines": 7,
  "liveOnlineMachines": 0,
  "blockedMachines": 6,
  "unreachableMachines": 3,
  "offlineMachines": 0,
  "staleMachines": 7,
  "disabledMachines": 0,
  "warningMachines": 0
}
```

## 7. Summary Cards Required

1. Accessible (7/16)
2. Live Online
3. Port Blocked (6)
4. Network Unreachable (3)
5. Stale Sync
6. Scan Hari Ini
7. User Mesin
8. Quality Average

## 8. Database Update SQL

```sql
-- Set ACCESSIBLE for 7 machines
UPDATE attendance_machines SET access_status = 'ACCESSIBLE' 
WHERE machine_code IN ('OFFICE_PGE','MILL','OFFICE_APE','IJL','AB2','P1A','P1B');

-- Set PORT_BLOCKED for 6 machines
UPDATE attendance_machines SET access_status = 'PORT_BLOCKED' 
WHERE machine_code IN ('DME_01','DME_02','ARC_01','ARC_02','ARA','AB1');

-- Set NETWORK_UNREACHABLE for 3 machines
UPDATE attendance_machines SET access_status = 'NETWORK_UNREACHABLE' 
WHERE machine_code IN ('P2A_01','P2B','P2A_02');
```

## 9. Acceptance Criteria

- Accessible = 7
- Port Blocked = 6
- Network Unreachable = 3
- Total = 16
- P1A/P1B/OFFICE_PGE/OFFICE_APE/MILL/IJL/AB2 tidak boleh tampil BLOCKED
- AB1/ARA/ARC_01/ARC_02/DME_01/DME_02 tampil BLOCKED
- P2A_01/P2A_02/P2B tampil UNREACHABLE
- npm run build && npm run frontend:build berhasil
