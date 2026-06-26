---
tags: [ai-context, testing]
created: 2026-06-07
---

# Testing Context

## Overview

The Sistem Absensi project has limited formal testing. Current testing is primarily exploratory/manual through test scripts.

## Test Scripts

### Machine Connection Tests

| File | Purpose |
|------|---------|
| `test-machine.ts` | Test single machine connection |
| `machine-test.ts` | Alternative machine test |
| `machine-await.ts` | Async/await machine test |
| `test-zklib-methods.ts` | ZKTeco library methods test |
| `test-socket.ts` | Socket connection test |

**Usage:**
```bash
bun run _dev_utils/src/test-machine.ts
```

---

### API Tests

| File | Purpose |
|------|---------|
| `test-config.ts` | Test configuration loading |
| `test-config2.ts` | Alternative config test |
| `test-config3.ts` | Config variation test |
| `test-config4.ts` | Config variation test |

**Usage:**
```bash
bun run _dev_utils/src/test-config.ts
```

---

### Database Tests

| File | Purpose |
|------|---------|
| `test-sqlclient.ts` | SQL Gateway client test |
| `test-service-sql.ts` | Service layer test |
| `test-tables.ts` | Table existence test |
| `test-seed-check.ts` | Seed data verification |
| `test-direct.ts` | Direct SQL test |
| `test-exact.ts` | Exact match test |
| `test-prefix.ts` | Prefix matching test |
| `test-sequence.ts` | Sequence test |
| `test-single.ts` | Single record test |
| `test-fresh.ts` | Fresh data test |
| `test-writes.ts` | Write operations test |
| `test-delay.ts` | Delay handling test |
| `test-batch.ts` | Batch operations test |
| `test-api-insert.ts` | API to DB insert test |

---

### Import Tests

| File | Purpose |
|------|---------|
| `test-import.ts` | Import pipeline test |
| `import-data.ts` | Data import script |
| `import-slow.ts` | Slow import test |
| `import-fixed.ts` | Fixed import script |

---

## Manual Testing Checklist

###1. Machine Connection

- [ ] Connect to PGE (10.0.0.232:4370)
- [ ] Connect to MILL (103.127.66.32:4370)
- [ ] Connect to DME_01 (103.144.228.42:4700)
- [ ] Connect to DME_02 (103.144.228.42:4701)
- [ ] Connect to ARE (103.144.208.154:4370)
- [ ] Connect to IJL (103.144.211.226:4370)
- [ ] Connect to ARA (103.144.208.154:4800)
- [ ] Connect to AB2 (103.144.208.154:4400)

###2. API Connection

- [ ] Fetch divisions list
- [ ] Fetch available months for PG1A
- [ ] Fetch attendance for PG1A (May 2026)
- [ ] Verify data structure

### 3. Database Operations

- [ ] Create tables
- [ ] Insert single record
- [ ] Insert batch records
- [ ] Query with filters
- [ ] Update record
- [ ] Delete record
- [ ] Verify change log

### 4. Sync Operations

- [ ] Run manual sync
- [ ] Run scheduled sync
- [ ] Verify sync log entries
- [ ] Check for duplicates
- [ ] Verify data accuracy

---

## Test Data

### Sample Employee Data

```json
{
  "empCode": "A0039",
  "empName": "NANO ( SUTIYEM )",
  "gangCode": "A1"
}
```

### Sample Attendance Data

```json
{
  "day_1": {
    "date": "2026-05-01T00:00:00.000Z",
    "hasWork": true,
    "isSunday": false,
    "isHoliday": true,
    "holidayDesc": "Hari Buruh",
    "isCuti": false,
    "isSakit": false,
    "otHours": "0.00",
    "taskCode": ""
  }
}
```

---

## Exported Test Data

### Attendance Files

| File | Records | Machine |
|------|---------|---------|
| `attendance-PGE.json` | 20,849 | PGE |
| `attendance-MILL.json` | 8,183 | MILL |
| `attendance-DME_01.json` | 8,183 | DME_01 |
| `attendance-ARE.json` | 8,520 | ARE |
| `attendance-IJL.json` | 6,547 | IJL |
| `attendance-ARA.json` | 31 | ARA |
| `attendance-DME_02.json` | 1,797 | DME_02 |

### User Files

| File | Users | Machine |
|------|-------|---------|
| `users-PGE.json` | 1,528 | PGE |
| `users-MILL.json` | 565 | MILL |
| `users-DME_01.json` | 542 | DME_01 |
| `users-ARE.json` | 1,091 | ARE |
| `users-IJL.json` | 162 | IJL |
| `users-ARA.json` | 554 | ARA |
| `users-DME_02.json` | 227 | DME_02 |

---

## Future Testing Recommendations

### 1. Unit Tests

```typescript
// Example test for machine-config.ts
import { describe, it, expect } from 'bun:test';
import { convertMachineIdToEmpCode } from './machine-config';

describe('machine-config', () => {
  it('should convert machine ID to employee code', () => {
    expect(convertMachineIdToEmpCode('10129', 'P1A')).toBe('A0129');
    expect(convertMachineIdToEmpCode('10002', 'IJL')).toBe('L10002');
  });
});
```

### 2. Integration Tests

```typescript
// Test full sync pipeline
import { runSync } from './sync';

it('should sync PG1A data to database', async () => {
  const result = await runSync({ division: 'PG1A' });
  expect(result.recordsSynced).toBeGreaterThan(0);
});
```

### 3. API Mock Tests

```typescript
// Mock IT Solution API
const mockApi = {
  getDivisions: () => ['PG1A', 'PG1B'],
  getAttendance: () => [/* sample data */],
};
```

---

## Test Execution

```bash
# Run all tests
bun test

# Run specific test file
bun test _dev_utils/src/test-config.ts

# Run with coverage
bun test --coverage

# Run specific category
bun test _dev_utils/src/test-*.ts
```

---

## Related Files

- `_dev_utils/src/test-*.ts` - Test scripts
- `_dev_utils/attendance-*.json` - Test data
- `_dev_utils/users-*.json` - User test data
- `package.json` - Test scripts
