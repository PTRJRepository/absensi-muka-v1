# Master Employee Table Planning Document

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Current Architecture](#current-architecture)
4. [Proposed Solution](#proposed-solution)
5. [Deduplication Strategy](#deduplication-strategy)
6. [Table Design](#table-design)
7. [Migration Plan](#migration-plan)
8. [Impact Analysis](#impact-analysis)
9. [Implementation Steps](#implementation-steps)

---

## Executive Summary

**Objective**: Membangun unified employee master table yang bersih dengan deduplication untuk employee yang enroll di multiple machines.

**Problem**: Employee yang sama (misalnya supervisor) bisa enroll di beberapa mesin berbeda (contoh: scan di P1A dan OFFICE_PGE), menghasilkan multiple `raw_device_user_id` yang seharusnya map ke employee_code yang sama.

**Solution**: Canonical employee_id dengan `machine_user_map` sebagai bridge table, menggunakan **db_ptrj.HR_EMPLOYEE** sebagai single source of truth.

---

## Problem Statement

### Current State

1. **Multi-machine enrollment**: Employee bisa enroll di multiple ZKTeco machines
2. **Different raw IDs per machine**: Satu employee punya `raw_device_user_id` berbeda di setiap mesin
   - Di P1A: `1000044`
   - Di OFFICE_PGE: `44` atau `A0044`
3. **No unified view**: Tidak ada single canonical employee_id yang menghubungkan semua machine enrollment
4. **Data inconsistency**: Employee yang sama muncul sebagai record berbeda di `machine_user_map`

### Example Scenario

```
Employee: JOHN DOE (Employee Code: A0044)

Machine P1A:
  - raw_device_user_id: "1000044"
  - machine_user_map: (machine_id=1, machine_user_id="1000044", employee_id=NULL)

Machine OFFICE_PGE:
  - raw_device_user_id: "A0044"
  - machine_user_map: (machine_id=7, machine_user_id="A0044", employee_id=NULL)

Expected: Satu canonical employee dengan multiple machine_user_map entries
Current: Multiple orphan entries di machine_user_map
```

### Root Cause

- `machine_user_map` map per `(machine_id, machine_user_id)` → `employee_id`
- Employee tidak selalu di-link ke canonical `employee_id`
- `employees` table tidak punya `zkteco_user_id` sebagai canonical identifier

---

## Current Architecture

### Existing Tables

```
┌─────────────────────────────────────────────────────────────────┐
│                      CURRENT ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐       ┌─────────────────────────┐
│    employees    │       │   attendance_machines   │
├─────────────────┤       ├─────────────────────────┤
│ id (PK)         │       │ id (PK)                │
│ employee_code   │◄──────│ machine_id              │
│ employee_name   │       │ machine_code            │
│ division_id (FK)│       │ scanner_code           │
│ is_active       │       │ loc_code               │
│ zkteco_user_id  │       └─────────────────────────┘
└─────────────────┘                    │
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────┐
│              machine_user_map (BRIDGE)                   │
├─────────────────────────────────────────────────────────┤
│ map_id (PK)                                             │
│ machine_id (FK) ────────────────────────────────────┐   │
│ machine_user_id ── Raw device ID dari mesin         │   │
│ employee_id (FK) ───┐                              │   │
│ emp_code ────────────┼─── Canonical employee code   │   │
│ loc_code            │                              │   │
│ scanner_code        │                              │   │
│ confidence_score    │                              │   │
│ mapped_by_rule ─────┘                              │   │
│ UQ: (machine_id, machine_user_id)                   │   │
└──────────────────────────────────────────────────────┘
                        │
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│            attendance_scan_logs (RAW RECORDS)           │
├─────────────────────────────────────────────────────────┤
│ id (PK)                                               │
│ machine_id (FK)                                       │
│ raw_device_user_id ── Raw ID                          │
│ parsed_employee_code ── Mapped employee_code          │
│ mapping_status ──── MAPPED, NEED_REVIEW, UNMAPPED     │
└─────────────────────────────────────────────────────────┘
```

### Current Issues

1. **`employees.zkteco_user_id`**: Nullable, tidak enforced sebagai unique
2. **`machine_user_map.employee_id`**: Nullable, banyak orphan entries
3. **No cross-machine deduplication**: Tidak ada logic untuk detect employee yang sama di mesin berbeda

---

## Proposed Solution

### Approach: Canonical Employee with Machine Bridge

**Design Principle**: ONE employee, MANY machine enrollments

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PROPOSED ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐
│           employees                 │
├─────────────────────────────────────┤
│ id (PK) ◄─── Canonical identifier   │
│ employee_code (UNIQUE) ◄── From HR  │
│ employee_name ◄── From HR          │
│ division_id (FK)                    │
│ is_active                           │
│ first_seen_at                      │
│ last_seen_at                       │
│ hr_verified (BIT) ◄── New: HR confirmed
│ hr_employee_id (NVARCHAR) ◄── New: Ref to db_ptrj
└─────────────────────────────────────┘
            │
            │ 1:N (one employee, many machine enrollments)
            ▼
┌─────────────────────────────────────────────────────────────┐
│                    machine_user_map                          │
├─────────────────────────────────────────────────────────────┤
│ map_id (PK)                                                 │
│ machine_id (FK) ──────────────────────────────────────┐     │
│ machine_user_id ── Raw device ID from machine         │     │
│ employee_id (FK) ◄── New: REQUIRED, not nullable      │     │
│ emp_code ── Denormalized for query speed              │     │
│ raw_device_user_id (NVARCHAR) ◄── New: explicit link  │     │
│ scanner_code                                            │     │
│ loc_code                                                │     │
│ first_seen_at (DATE) ◄── New: First time at machine   │     │
│ last_seen_at (DATE) ◄── New: Last time at machine     │     │
│ is_primary_location (BIT) ◄── New: Primary machine     │     │
│ UQ: (machine_id, machine_user_id)                     │     │
└─────────────────────────────────────────────────────────┘
                        │
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              attendance_scan_logs                         │
├─────────────────────────────────────────────────────────┤
│ id (PK)                                                 │
│ machine_id (FK)                                         │
│ raw_device_user_id ── Raw ID                           │
│ employee_id (FK) ◄── New: Link to canonical employee  │
│ parsed_employee_code ── Denormalized                   │
│ mapping_status                                         │
│ scan_time                                              │
│ scan_date                                              │
└─────────────────────────────────────────────────────────┘
```

### Key Changes

1. **`employees.hr_verified`**: BIT flag untuk确认 employee ada di db_ptrj
2. **`employees.hr_employee_id`**: Reference ke db_ptrj.HR_EMPLOYEE
3. **`machine_user_map.employee_id`**: REQUIRED (NOT NULL) untuk enforce integrity
4. **`machine_user_map.raw_device_user_id`**: Explicit link ke raw ID
5. **`machine_user_map.is_primary_location`**: Flag untuk machine utama employee
6. **`attendance_scan_logs.employee_id`**: FK ke canonical employee

---

## Deduplication Strategy

### The Challenge

Employee yang sama enroll di multiple machines:
- Supervisor yang rotate antar divisi
- Manager yang visit ke site berbeda
- Karyawan yang dipindahkan antar lokasi

### Deduplication Algorithm

```
┌─────────────────────────────────────────────────────────────────────┐
│                 DEDUPLICATION ALGORITHM                              │
└─────────────────────────────────────────────────────────────────────┘

STEP 1: PARSE RAW ID
─────────────────────
raw_device_user_id
        │
        ├── Short ID (≤5) → SKIP auto-mapping, mark NEED_REVIEW
        │
        └── Long ID (>5)
                │
                ├── Has scanner prefix → Parse to {locCode}{4digits}
                │
                └── No scanner prefix → Exact lookup in employees.zkteco_user_id
                        │
                        └── Found → Canonical employee
                        └── Not found → Need manual override

STEP 2: VERIFY IN db_ptrj
─────────────────────────
parsed_employee_code
        │
        └── Lookup in db_ptrj.HR_EMPLOYEE
                │
                ├── FOUND (Status='1') → CANONICAL CONFIRMED
                │
                ├── FOUND (Status≠'1') → INACTIVE, don't map
                │
                └── NOT FOUND → NEED_REVIEW / MANUAL OVERRIDE

STEP 3: CROSS-REFERENCE MACHINE ENROLLMENTS
───────────────────────────────────────────
For each employee_code found in db_ptrj:
        │
        └── Check all machines where this employee_code appears
                │
                ├── Single machine → is_primary_location = 1
                │
                └── Multiple machines → Assign primary based on:
                        ├── Most frequent scans
                        ├── Official assignment (from HR.LocCode)
                        └── Or user-defined
```

### Implementation Code

```typescript
// Deduplication service

async deduplicateAndMap(
  rawUserId: string,
  machineId: number,
  machineLocCode?: string,
  scannerCode?: number
): Promise<DeduplicationResult> {

  // Step 1: Parse raw ID
  const parseResult = parseZktecoUserIdToEmployeeCode({
    zktecoUserId: rawUserId,
    machineLocCode,
    scannerCode,
  });

  if (!parseResult.allowAutoMap) {
    return {
      status: 'EXCLUDED',
      reason: parseResult.rule,
    };
  }

  // Step 2: Verify in HR master
  const employeeCode = parseResult.employeeCode!;
  const hrEmployee = await this.findHrEmployee(employeeCode);

  if (!hrEmployee) {
    return {
      status: 'NEED_REVIEW',
      reason: 'NOT_FOUND_IN_HR',
      candidateCode: employeeCode,
    };
  }

  // Step 3: Find or create canonical employee
  let canonicalEmployee = await this.findEmployeeByCode(employeeCode);

  if (!canonicalEmployee) {
    // Create new canonical employee from HR data
    canonicalEmployee = await this.createFromHr(hrEmployee);
  }

  // Step 4: Create/update machine enrollment
  const enrollment = await this.createMachineEnrollment({
    machineId,
    rawUserId,
    employeeId: canonicalEmployee.id,
    employeeCode: canonicalEmployee.employee_code,
    locCode: parseResult.locCode,
    scannerCode,
  });

  return {
    status: 'MAPPED',
    employee: canonicalEmployee,
    enrollment,
    isNewEnrollment: enrollment.isNew,
    isPrimaryLocation: enrollment.isPrimary,
  };
}

async findHrEmployee(empCode: string): Promise<HrEmployee | null> {
  // Direct query to db_ptrj (or use synced data)
  const result = await query<HrEmployee>(`
    SELECT EmpCode, EmpName, LocCode, Status
    FROM [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE
    WHERE RTRIM(EmpCode) = @code AND Status = '1'
  `, [{ name: 'code', type: sql.NVarChar, value: empCode }]);

  return result[0] || null;
}

async createMachineEnrollment(params: {
  machineId: number;
  rawUserId: string;
  employeeId: number;
  employeeCode: string;
  locCode?: string;
  scannerCode?: number;
}): Promise<EnrollmentResult> {

  // Check if enrollment exists
  const existing = await query(`
    SELECT map_id, is_primary_location
    FROM machine_user_map
    WHERE machine_id = @machineId AND machine_user_id = @rawUserId
  `, [
    { name: 'machineId', type: sql.Int, value: params.machineId },
    { name: 'rawUserId', type: sql.NVarChar, value: params.rawUserId },
  ]);

  if (existing.length > 0) {
    // Update existing enrollment
    await execute(`
      UPDATE machine_user_map
      SET employee_id = @employeeId,
          emp_code = @employeeCode,
          last_seen_at = GETDATE()
      WHERE map_id = @mapId
    `, [
      { name: 'employeeId', type: sql.Int, value: params.employeeId },
      { name: 'employeeCode', type: sql.NVarChar, value: params.employeeCode },
      { name: 'mapId', type: sql.BigInt, value: existing[0].map_id },
    ]);

    return { isNew: false, isPrimary: existing[0].is_primary_location };
  }

  // Check if employee already enrolled at THIS machine with different raw ID
  const otherEnrollments = await query(`
    SELECT COUNT(*) as cnt FROM machine_user_map
    WHERE machine_id = @machineId AND employee_id = @employeeId
  `, [
    { name: 'machineId', type: sql.Int, value: params.machineId },
    { name: 'employeeId', type: sql.Int, value: params.employeeId },
  ]);

  const isPrimary = otherEnrollments[0].cnt === 0;

  // Create new enrollment
  await execute(`
    INSERT INTO machine_user_map (
      machine_id, machine_user_id, employee_id, emp_code,
      loc_code, scanner_code, is_primary_location, first_seen_at, last_seen_at,
      mapped_by_rule, mapped_source, confidence_score, is_active
    ) VALUES (
      @machineId, @rawUserId, @employeeId, @employeeCode,
      @locCode, @scannerCode, @isPrimary, GETDATE(), GETDATE(),
      'HR_VERIFIED', 'SYSTEM', 100.0, 1
    )
  `, [
    { name: 'machineId', type: sql.Int, value: params.machineId },
    { name: 'rawUserId', type: sql.NVarChar, value: params.rawUserId },
    { name: 'employeeId', type: sql.Int, value: params.employeeId },
    { name: 'employeeCode', type: sql.NVarChar, value: params.employeeCode },
    { name: 'locCode', type: sql.NVarChar, value: params.locCode || null },
    { name: 'scannerCode', type: sql.Int, value: params.scannerCode || null },
    { name: 'isPrimary', type: sql.Bit, value: isPrimary ? 1 : 0 },
  ]);

  return { isNew: true, isPrimary };
}
```

---

## Table Design

### employees Table (Enhanced)

```sql
-- Enhanced employees table
ALTER TABLE employees ADD COLUMN hr_employee_id NVARCHAR(30) NULL;
ALTER TABLE employees ADD COLUMN hr_verified BIT NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN hr_verified_at DATETIME2 NULL;

-- Add unique constraint on zkteco_user_id (optional, for direct lookup)
-- Only if we want strict 1:1 mapping
ALTER TABLE employees ADD CONSTRAINT UQ_employees_zkteco_user_id
  UNIQUE (zkteco_user_id) WHERE zkteco_user_id IS NOT NULL;

-- Index for HR verification
CREATE INDEX IX_employees_hr_verified ON employees(hr_verified, is_active);
CREATE INDEX IX_employees_hr_employee_id ON employees(hr_employee_id);
```

### machine_user_map Table (Enhanced)

```sql
-- Enhanced machine_user_map
ALTER TABLE machine_user_map ADD COLUMN raw_device_user_id NVARCHAR(100) NULL;
ALTER TABLE machine_user_map ADD COLUMN is_primary_location BIT NOT NULL DEFAULT 0;
ALTER TABLE machine_user_map ADD COLUMN first_seen_at DATE NULL;
ALTER TABLE machine_user_map ADD COLUMN last_seen_at DATE NULL;

-- Make employee_id required (NOT NULL) for new entries
-- Note: This requires migration of existing NULL values first

-- Index for cross-machine query
CREATE INDEX IX_machine_user_map_employee_id ON machine_user_map(employee_id);
CREATE INDEX IX_machine_user_map_employee_primary
  ON machine_user_map(employee_id, is_primary_location) WHERE is_primary_location = 1;
```

### New Table: employee_hr_history (Optional)

```sql
-- Track employee HR data changes over time
CREATE TABLE employee_hr_history (
  id INT IDENTITY(1,1) PRIMARY KEY,
  employee_id INT NOT NULL,
  hr_employee_id NVARCHAR(30) NOT NULL,
  hr_name NVARCHAR(150) NOT NULL,
  hr_loc_code NVARCHAR(20) NULL,
  hr_status NVARCHAR(10) NOT NULL,
  sync_date DATE NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_hr_history_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE INDEX IX_hr_history_employee_date ON employee_hr_history(employee_id, sync_date DESC);
```

---

## Migration Plan

### Phase 1: Prepare (No downtime)

```sql
-- 1. Add new columns (nullable first)
ALTER TABLE employees ADD hr_verified BIT NOT NULL DEFAULT 0;
ALTER TABLE employees ADD hr_employee_id NVARCHAR(30) NULL;

ALTER TABLE machine_user_map ADD is_primary_location BIT NOT NULL DEFAULT 0;

-- 2. Create temp table for deduplication
CREATE TABLE #employee_raw_mapping (
  raw_employee_code NVARCHAR(30),
  employee_id INT,
  machine_count INT,
  primary_machine_id INT
);

-- 3. Populate from existing data
INSERT INTO #employee_raw_mapping
SELECT
  employee_code,
  id AS employee_id,
  COUNT(DISTINCT m.machine_id) AS machine_count,
  -- Primary = machine with most enrollments
  (SELECT TOP 1 machine_id FROM machine_user_map
   WHERE employee_id = e.id
   GROUP BY machine_id ORDER BY COUNT(*) DESC) AS primary_machine_id
FROM employees e
LEFT JOIN machine_user_map m ON e.id = m.employee_id
GROUP BY employee_code, e.id;
```

### Phase 2: Clean Data

```sql
-- 1. Mark HR verified employees
UPDATE employees
SET hr_verified = 1,
    hr_employee_id = employee_code,
    hr_verified_at = GETDATE()
WHERE employee_code IN (
  SELECT DISTINCT RTRIM(EmpCode)
  FROM [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE
  WHERE Status = '1'
);

-- 2. Set primary location
UPDATE machine_user_map
SET is_primary_location = 1
WHERE map_id IN (
  SELECT m.map_id
  FROM machine_user_map m
  JOIN #employee_raw_mapping r ON m.employee_id = r.employee_id
  WHERE m.machine_id = r.primary_machine_id
);
```

### Phase 3: Enforce Constraints (Optional downtime)

```sql
-- Only if all NULL employee_id entries are cleaned up
-- ALTER TABLE machine_user_map
-- ALTER COLUMN employee_id INT NOT NULL;
```

---

## Impact Analysis

### Affected Components

| Component | Impact | Mitigation |
|-----------|--------|------------|
| Sync Orchestrator | Medium | Update mapping logic |
| Manual Import | Medium | Update mapping logic |
| Attendance Processing | Low | FK will work with new design |
| API Endpoints | Low | Mostly read operations |
| Frontend | Low | Display changes only |

### Breaking Changes

1. **`machine_user_map.employee_id`**: Will become required
2. **Existing orphan entries**: Need to be cleaned or linked

### Rollback Plan

1. Keep backup of current `employees` and `machine_user_map` tables
2. Migration scripts should be idempotent (can run multiple times)
3. Test in development first

---

## Implementation Steps

### Step 1: Database Migration

```
migrations/
├── 041_enhance_employees_for_dedup.sql
│   └── Add hr_verified, hr_employee_id columns
│
├── 042_enhance_machine_user_map_for_dedup.sql
│   └── Add is_primary_location, raw_device_user_id columns
│
└── 043_backfill_dedup_data.sql
    └── Populate new columns, set primary locations
```

### Step 2: Code Updates

```
src/
├── modules/
│   ├── employees/
│   │   ├── employee-dedup.service.ts  (NEW)
│   │   └── employee-mapping.service.ts (UPDATE)
│   │
│   └── import/
│       └── sync-orchestrator.service.ts (UPDATE)
│
└── shared/
    └── employee-hr-client.ts (NEW - direct db_ptrj access)
```

### Step 3: Testing

1. Unit tests for deduplication logic
2. Integration tests for sync flow
3. Manual testing with sample data
4. Performance testing with full dataset

### Step 4: Deployment

1. Deploy migrations (no downtime)
2. Deploy code changes
3. Run backfill script
4. Monitor for errors

---

## Verification Checklist

- [ ] All employees from HR are marked `hr_verified = 1`
- [ ] All `machine_user_map` entries have `employee_id` set
- [ ] Each employee has exactly ONE `is_primary_location = 1`
- [ ] Sync process correctly creates new enrollments
- [ ] Cross-machine attendance shows correct employee_id
- [ ] No orphan entries in `machine_user_map`

---

## Future Considerations

### Optional Enhancements

1. **Automatic primary location reassignment**: When employee stops scanning at primary machine
2. **Multi-location alerts**: Notify when employee scans at unexpected location
3. **Employee movement history**: Track all machine enrollments over time
4. **HR sync improvements**: Real-time sync instead of batch

### Monitoring

```sql
-- Check for orphan entries
SELECT COUNT(*) FROM machine_user_map WHERE employee_id IS NULL;

-- Check for unverified employees
SELECT COUNT(*) FROM employees WHERE hr_verified = 0 AND is_active = 1;

-- Check for employees without primary location
SELECT e.employee_code, COUNT(m.map_id) AS enrollments
FROM employees e
LEFT JOIN machine_user_map m ON e.id = m.employee_id
GROUP BY e.employee_code
HAVING SUM(CAST(m.is_primary_location AS INT)) = 0;
```

---

*Document Version: 1.0*
*Last Updated: 2026-06-22*
*Status: PLANNING*
