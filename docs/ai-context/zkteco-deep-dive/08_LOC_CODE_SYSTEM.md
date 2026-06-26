# LocCode System

## Overview

The LocCode (Location Code) system maps machine divisions to employee code prefixes used in the database. Each location/division has a single-letter code that becomes the first character of every employee code from that location.

## LocCode Definition

### Source Definition

```typescript
export const locCodeMap: Record<string, string> = {
  "P1A": "A",   // Parit Gunung Estate 1A
  "P1B": "B",   // Parit Gunung Estate 1B
  "P2A": "C",   // Parit Gunung Estate 2A
  "P2B": "D",   // Parit Gunung Estate 2B
  "DME": "E",   // DME Estate
  "ARA": "F",   // ARA Estate
  "AB1": "G",   // Air Ruak Estate B1
  "AB2": "H",   // Air Ruak Estate B2
  "ARC": "J",   // Air Ruak Estate A/C
  "IJL": "L",   // IJL Estate
  "PGE": "A",   // PGE Office (same as P1A)
};
```

### Complete Mapping Table

| Division | LocCode | EmpCode Prefix | Estate Name | Example |
|----------|---------|----------------|-------------|---------|
| P1A | A | A | Parit Gunung Estate 1A | A0129 |
| P1B | B | B | Parit Gunung Estate 1B | B0156 |
| P2A | C | C | Parit Gunung Estate 2A | C0089 |
| P2B | D | D | Parit Gunung Estate 2B | D0045 |
| DME | E | E | DME Estate | E0234 |
| ARA | F | F | ARA Estate | F0567 |
| AB1 | G | G | Air Ruak Estate B1 | G0012 |
| AB2 | H | H | Air Ruak Estate B2 | H0345 |
| ARC | J | J | Air Ruak Estate A/C | J0789 |
| IJL | L | L | IJL Estate | L10002 |
| PGE | A | A | PGE Office (Parit Gunung) | A0002 |

## Employee Code Format

### Structure

```
{LocCode}{4-digit number}
```

Examples:
- `A0129` - Employee129 from P1A/PGE
- `E0234` - Employee 234 from DME
- `L10002` - Employee 10002 from IJL

### Padding Rules

- Numbers are zero-padded to 4 digits
- Small numbers: `1` → `0001`
- Medium numbers: `123` → `0123`
- Large numbers: `1234` → `1234`
- Very large numbers: `10002` → (stored as-is, exceeds 4 digits)

## LocCode in Machine Configuration

### Configuration Entry

```typescript
export const machineServers = {
  "DME_01": {
    ip: "103.144.228.42",
    port: 4700,
    locCode: "E",  // Maps to "E" prefix
    // ...
  },
  "ARA": {
    ip: "103.144.208.154",
    port: 4800,
    locCode: "F",  // Maps to "F" prefix
    // ...
  },
  // ...
};
```

### Default LocCode

For machines without explicit locCode, the system uses a default:

```typescript
function getLocCode(division: string): string {
  return locCodeMap[division] || "X"; // "X" for unknown
}
```

## Reverse Mapping

### EmpCode to Division

```typescript
export const empCodeToLocCode: Record<string, string> = {
  "A": "P1A/PGE (Parit Gunung Estate 1A)",
  "B": "P1B (Parit Gunung Estate 1B)",
  "C": "P2A (Parit Gunung Estate 2A)",
  "D": "P2B (Parit Gunung Estate 2B)",
  "E": "DME (DME Estate)",
  "F": "ARA (ARA Estate)",
  "G": "AB1 (Air Ruak Estate B1)",
  "H": "AB2 (Air Ruak Estate B2)",
  "J": "ARC (Air Ruak Estate A/C)",
  "L": "IJL (IJL Estate)",
};
```

## Special Cases

### PGE and P1A Share LocCode

Both PGE office and P1A plantation use prefix "A":

```typescript
locCodeMap["PGE"] = "A";
locCodeMap["P1A"] = "A";
```

This is because PGE employees are part of the P1A group.

### IJL Independent LocCode

IJL has its own unique prefix "L" (no overlap with others):

```typescript
locCodeMap["IJL"] = "L";
```

### Missing LocCode

ARE does not have a locCode in the mapping:

```typescript
machineServers["ARE"] = {
  // ...
  locCode: null,
  // ...
};
```

This needs to be resolved - either:
1. Add ARE to locCodeMap with a new code
2. Confirm ARE data should use existing code

## Implementation

### Get LocCode from Division

```typescript
function getLocCode(division: string): string {
  return locCodeMap[division] || "X";
}
```

### Generate EmpCode from Machine ID

```typescript
function generateEmpCode(machineId: string | number, division: string): string {
  const id = String(machineId);
  const locCode = getLocCode(division);

  // Extract last 4 digits
  const numPart = id.slice(-4).replace(/^0+/, "") || "0";

  return `${locCode}${numPart.padStart(4, "0")}`;
}
```

### Parse EmpCode

```typescript
interface ParsedEmpCode {
  locCode: string;
  number: number;
  division: string | null;
}

function parseEmpCode(empCode: string): ParsedEmpCode {
  const locCode = empCode.charAt(0);
  const number = parseInt(empCode.slice(1), 10);

  // Find division
  let division: string | null = null;
  for (const [div, code] of Object.entries(locCodeMap)) {
    if (code === locCode) {
      division = div;
      break;
    }
  }

  return { locCode, number, division };
}
```

## Database Schema

### absen_import Table

```sql
CREATE TABLE absen_import (
  id INT PRIMARY KEY IDENTITY,
  emp_code VARCHAR(10) NOT NULL,  -- e.g., "A0129"
  machine_user_id VARCHAR(20),
  division VARCHAR(20),          -- e.g., "PGE"
  attendance_date DATETIME,
  event_type INT,
  verify_type INT,
  work_code INT,
  import_batch_id INT,
  created_at DATETIME DEFAULT GETDATE()
);
```

### Query Examples

```sql
-- Get all employees from DME
SELECT DISTINCT emp_code
FROM absen_import
WHERE emp_code LIKE 'E%';

-- Get attendance count by location
SELECT
  LEFT(emp_code, 1) AS loc_code,
  COUNT(*) AS total_records
FROM absen_import
GROUP BY LEFT(emp_code, 1);

-- Get employee list by division
SELECT DISTINCT emp_code
FROM absen_import
WHERE division IN ('DME_01', 'DME_02');
```

## Verification

### Check LocCode Consistency

```typescript
async function verifyLocCodes() {
  console.log("LocCode Mapping Verification:");
  console.log("=".repeat(40));

  for (const [division, locCode] of Object.entries(locCodeMap)) {
    const config = machineServers[division];
    if (!config) {
      console.log(`${division}: NOT IN machineServers`);
      continue;
    }

    const expected = config.locCode;
    const actual = locCode;

    if (expected === actual) {
      console.log(`${division}: OK (${locCode})`);
    } else {
      console.log(`${division}: MISMATCH (config=${expected}, map=${actual})`);
    }
  }
}
```

### Sample Output

```
LocCode Mapping Verification:
========================================
P1A: OK (A)
P1B: OK (B)
P2A: OK (C)
P2B: OK (D)
DME: OK (E)
ARA: OK (F)
AB1: OK (G)
AB2: OK (H)
ARC: OK (J)
IJL: OK (L)
PGE: OK (A)
```

## Summary

| Aspect | Description |
|--------|-------------|
| Purpose | Map division to employee code prefix |
| Format | Single letter (A-L, skipping I, K, M) |
| Storage | locCodeMap in machine-config.ts |
| Database | First character of emp_code |
| Special | PGE uses "A" (same as P1A) |
| Missing | ARE has no locCode assigned |

## Estate Names Reference

| Code | Estate Name | LocCode |
|------|------------|---------|
| P1A | Parit Gunung Estate 1A | A |
| P1B | Parit Gunung Estate 1B | B |
| P2A | Parit Gunung Estate 2A | C |
| P2B | Parit Gunung Estate 2B | D |
| DME | DME Estate | E |
| ARA | ARA Estate | F |
| AB1 | Air Ruak Estate B1 | G |
| AB2 | Air Ruak Estate B2 | H |
| ARC | Air Ruak Estate A/C | J |
| IJL | IJL Estate | L |
| ARE | ARE Estate | (unassigned) |
| PGE | PGE Office | A |
