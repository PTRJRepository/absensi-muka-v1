# Division Mapping Reference

## Overview

This document explains how physical machines and API divisions relate to each other, and how employee codes are constructed from location codes.

---

## API Division Codes

The IT Solution API uses these 13 division codes:

| Code | Full Name | Machine Source | Data Source |
|------|-----------|---------------|-------------|
| PG1A | Plant Group 1A | P1A (10.0.0.90:4100) | API Only |
| PG1B | Plant Group 1B | P1B (10.0.0.91:4300) | API Only |
| PG2A | Plant Group 2A | P2A (223.25.98.220:4500) | API Only |
| PG2B | Plant Group 2B | P2B (223.25.98.220:4600) | API Only |
| DME | Division Mill Estate | DME_01, DME_02 | Direct + API |
| ARA | Area A | ARA (103.144.208.154:4800) | Direct + API |
| ARB1 | Annual Report Block 1 | AB1 | API Only |
| ARB2 | Annual Report Block 2 | AB2 | Direct + API |
| INFRA | Infrastructure | - | API Only |
| AREC | Area C | ARE (103.144.208.154:4370) | Direct + API |
| IJL | IJL Division | IJL (103.144.211.226:4370) | Direct + API |
| STF-OFFICE | Staff/Office | PGE, MILL | Direct + API |
| SECURITY | Security | - | API Only |

---

## Machine to Division Mapping

### Direct ZKTeco Machines (Accessible)

| Machine ID | IP:Port | LocCode | API Division | EmpCode Prefix |
|------------|---------|---------|--------------|----------------|
| PGE | 10.0.0.232:4370 | - | STF-OFFICE | A |
| MILL | 103.127.66.32:4370 | - | STF-OFFICE | A |
| DME_01 | 103.144.228.42:4700 | E | DME | E |
| DME_02 | 103.144.228.42:4701 | E | DME | E |
| ARE | 103.144.208.154:4370 | - | AREC | - |
| IJL | 103.144.211.226:4370 | L | IJL | L |
| ARA | 103.144.208.154:4800 | F | ARA | F |
| AB2 | 103.144.208.154:4400 | H | ARB2 | H |

### Machines NOT Accessible via ZKTeco

| Machine ID | Reason | API Division | Data Source |
|------------|--------|--------------|-------------|
| P1A | Not ZKTeco device | PG1A | IT Solution API |
| P1B | Not ZKTeco device | PG1B | IT Solution API |
| P2A | Port forwarding inactive | PG2A | IT Solution API |
| P2B | Port forwarding inactive | PG2B | IT Solution API |
| AB1 | Port forwarding inactive | ARB1 | IT Solution API |
| ARC_01 | Port forwarding inactive | - | Need setup |
| ARC_02 | Port forwarding inactive | - | Need setup |

---

## Employee Code Construction

Employee codes follow the format: `{LocCode}{4-digit-number}`

### LocCode to Prefix Mapping

From `machine-config.ts`:

```typescript
export const locCodeMap: Record<string, string> = {
  "P1A": "A",  // P1A employees → A0001, A0002, etc.
  "P1B": "B",  // P1B employees → B0001, B0002, etc.
  "P2A": "C",  // P2A employees → C0001, C0002, etc.
  "P2B": "D",  // P2A employees → D0001, D0002, etc.
  "DME": "E",  // DME employees → E0001, E0002, etc.
  "ARA": "F",  // ARA employees → F0001, F0002, etc.
  "AB1": "G",  // AB1 employees → G0001, G0002, etc.
  "AB2": "H",  // AB2 employees → H0001, H0002, etc.
  "ARC": "J",  // ARC employees → J0001, J0002, etc.
  "IJL": "L",  // IJL employees → L0001, L0002, etc.
  "PGE": "A",  // PGE employees → A0001, A0002, etc.
};
```

### Example Employee Codes

| Machine | API Division | Example EmpCode | Pattern |
|---------|--------------|-----------------|---------|
| P1A | PG1A | A0129 | A + 4-digit |
| DME_01 | DME | E0042 | E + 4-digit |
| IJL | IJL | L10002 | L + 5-digit |
| ARE | AREC | (varies) | (varies) |

---

## Scanner Code Mapping

Used for direct ZKTeco machine communication:

```typescript
export const scannerCodeMap: Record<string, number> = {
  "P1A": 100,
  "ARC": 200,
  "P1B": 300,
  "AB2": 400,
  "P2A": 500,
  "P2B": 600,
  "DME": 700,
  "ARA": 800,
  "AB1": 900,
};
```

---

## Division Data Availability

### Direct ZKTeco Access
- 8 machines accessible
- Real-time attendance logs
- Raw clock-in/out timestamps
- User data with fingerprints

### API Only (No Direct Access)
- PG1A, PG1B: Not ZKTeco devices
- PG2A, PG2B: Port forwarding inactive
- ARB1: Port forwarding inactive
- INFRA, SECURITY: API divisions only

### Dual Source
- DME, ARA, ARB2, AREC, IJL, STF-OFFICE
- Can use either direct ZKTeco or API
- API preferred for consistency

---

## Code Lookup Example

```typescript
import { locCodeMap } from './machine-config.ts';

function getEmpCodePrefix(division: string): string {
  // Map API division to machine suffix
  const divisionToMachine: Record<string, string> = {
    'PG1A': 'P1A',
    'PG1B': 'P1B',
    'PG2A': 'P2A',
    'PG2B': 'P2B',
    'DME': 'DME',
    'ARA': 'ARA',
    'ARB1': 'AB1',
    'ARB2': 'AB2',
    'AREC': 'ARE',
    'IJL': 'IJL',
  };
  
  const machine = divisionToMachine[division] || division;
  return locCodeMap[machine] || 'X';
}

// Usage
console.log(getEmpCodePrefix('DME'));  // Output: "E"
console.log(getEmpCodePrefix('PG1A')); // Output: "A"
```

---

## Sync Configuration

From `config.ts`:

```typescript
divisions: [
  "PG1A", "PG1B", "PG2A", "PG2A", "DME", "ARA", "ARB1", "ARB2",
  "INFRA", "AREC", "IJL", "STF-OFFICE", "SECURITY"
]
```

All 13 divisions are configured for API sync.