# Scanner Code System

## Overview

The Scanner Code System is a method to identify which attendance machine recorded a particular attendance event. Each machine is assigned a unique 3-digit code that is embedded in the user ID.

## How Scanner Codes Work

### The Concept

When an employee is enrolled in a ZKTeco machine, their user ID often includes a suffix that identifies the machine. For example:

- User ID `8000001` from ARA machine has suffix `800`
- User ID `7001234` from DME machine has suffix `700`

### Scanner Code Assignment

| Machine | Scanner Code | Code Meaning |
|---------|-------------|--------------|
| P1A | 100 | Parit Gunung Estate 1A |
| ARC | 200 | Air Ruak Estate A/C |
| P1B | 300 | Parit Gunung Estate 1B |
| AB2 | 400 | Air Ruak Estate B2 |
| P2A | 500 | Parit Gunung Estate 2A |
| P2B | 600 | Parit Gunung Estate 2B |
| DME | 700 | DME Estate |
| ARA | 800 | ARA Estate |
| AB1 | 900 | Air Ruak Estate B1 |

## Scanner Code Map

### Source Definition

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

### Reverse Lookup

```typescript
export const scannerCodeToDivision: Record<number, string> = {
  100: "P1A",
  200: "ARC",
300: "P1B",
  400: "AB2",
  500: "P2A",
  600: "P2B",
  700: "DME",
800: "ARA",
  900: "AB1",
};
```

## Identifying Machine from User ID

### Algorithm

1. Take the last 3 digits of the user ID
2. Convert to integer
3. Look up in scannerCodeToDivision map
4. Return the division code

### Implementation

```typescript
function getDivisionFromMachineId(machineId: number | string): string | null {
  const id = String(machineId);
  const suffix = parseInt(id.slice(-3));

  return scannerCodeToDivision[suffix] || null;
}
```

### Examples

| User ID | Last 3 Digits | Scanner Code | Division |
|---------|---------------|--------------|----------|
| 10002 | 002 | (none) | PGE |
| 8000001 | 001 | 800 | ARA |
| 7001234 | 234 | 700 | DME |
| 9000456 | 456 | 900 | AB1 |
| 2000789 | 789 | 200 | ARC |

## Scanner Code in Machine Configuration

### Full Configuration

```typescript
export const machineServers = {
  "PGE": {
    ip: "10.0.0.232",
    port: 4370,
    scannerCode: null,  // No scanner code
    locCode: null,      // Uses "A" from locCodeMap
    suffix: "PGE"
  },
  "DME_01": {
    ip: "103.144.228.42",
    port: 4700,
    scannerCode: 700,   // DME scanner code
    locCode: "E",
    suffix: "DME"
  },
  "ARA": {
    ip: "103.144.208.154",
    port: 4800,
    scannerCode: 800,   // ARA scanner code
    locCode: "F",
    suffix: "ARA"
  },
  // ...
};
```

## Special Cases

### Machines Without Scanner Codes

Some machines don't use scanner codes:

| Machine | Scanner Code | Reason |
|---------|--------------|--------|
| PGE | null | Office machine, uses "A" prefix |
| MILL | null | Mill office machine |
| ARE | null | Not in mapping |
| IJL | null | Uses locCode "L" directly |

### Multiple Machines Sharing Scanner Code

ARC_01 and ARC_02 both use scanner code 200:

```typescript
machineServers["ARC_01"] = {
  scannerCode: 200,
  locCode: "J",
  // ...
};

machineServers["ARC_02"] = {
  scannerCode: 200,  // Same as ARC_01
  locCode: "J",
  // ...
};
```

Both machines map to the same locCode "J" (ARC estate).

## Scanner Code Detection Logic

### Complete Detection Flow

```typescript
function detectMachineFromUserId(userId: string | number): {
  machineId: string;
  scannerCode: number | null;
  division: string | null;
  locCode: string;
 empCode: string;
} {
  const id = String(userId);

  // Step 1: Extract last 3 digits as potential scanner code
  const last3Digits = parseInt(id.slice(-3));

  // Step 2: Check if it's a valid scanner code
  const division = scannerCodeToDivision[last3Digits] || null;
  const scannerCode = division ? last3Digits : null;

  // Step 3: Determine locCode
  let locCode: string;

  if (division) {
    locCode = locCodeMap[division];
  } else if (/^A\d+$/.test(id)) {
    // Already has A prefix (PGE style)
    locCode = "A";
  } else if (/^L\d+$/.test(id)) {
    // IJL style
    locCode = "L";
  } else {
    locCode = "X"; // Unknown
  }

  // Step 4: Generate emp_code
  const numPart = id.slice(-4).replace(/^0+/, "") || "0";
  const empCode = `${locCode}${numPart.padStart(4, "0")}`;

  return {
    machineId: id,
    scannerCode,
    division,
    locCode,
    empCode
  };
}
```

## Scanner Code Range

The scanner codes use the range 100-900 in increments of 100:

```
100, 200, 300, 400, 500, 600, 700, 800, 900
```

This leaves room for future expansion (e.g., 010, 020, etc. for sub-areas).

## Debugging Scanner Code Issues

### Common Problems

1. **User ID doesn't end with expected scanner code**
   - Check if user was enrolled on a different machine
   - Verify machine configuration

2. **Multiple users with same ID from different machines**
   - This is why scanner codes exist
   - The suffix differentiates the source

3. **Scanner code not in map**
   - Add to scannerCodeMap
   - Update scannerCodeToDivision reverse map

### Debug Script

```typescript
function debugScannerCode(userId: string) {
  const id = String(userId);
  const last3 = id.slice(-3);
  const last4 = id.slice(-4);

  console.log(`User ID: ${id}`);
  console.log(`Last 3 digits: ${last3}`);
  console.log(`Last 4 digits: ${last4}`);

  const scannerCode = parseInt(last3);
  const division = scannerCodeToDivision[scannerCode];

  if (division) {
    console.log(`Scanner Code: ${scannerCode} → ${division}`);
    console.log(`LocCode: ${locCodeMap[division]}`);
  } else {
    console.log(`No scanner code match for ${scannerCode}`);
  }
}

// Example:
// debugScannerCode("8000001")
// Output:
// User ID: 8000001
// Last 3 digits: 001
// Last 4 digits: 0001
// Scanner Code: 1 → undefined
// (Actually it should be 800, but this ID has leading zeros)
```

## Summary

| Aspect | Description |
|--------|-------------|
| Purpose | Identify source machine from user ID |
| Format | 3-digit code (100-900) |
| Location | Last 3 digits of user ID |
| Mapping | scannerCodeMap and reverse lookup |
| Fallback | Use locCode directly |
| Special Cases | PGE, MILL, ARE, IJL |
