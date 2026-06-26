---
tags: [ai-context, employee, mapping, post-recovery]
created: 2026-06-07
updated: 2026-06-26
---

# Employee Code Mapping

## Overview

ZKTeco machines store user IDs in various formats. This document explains the SSOT mapping system that converts raw machine IDs to canonical employee codes.

## Mapping Architecture

The system uses a **single source of truth (SSOT) parser** at:
`src/modules/mapping/zkteco-employee-code-parser.ts`

Format: `{locCode}{last 4 digits of raw_device_user_id}`

Example: `10044` → `A0044`
- Scanner suffix `100` → identifies P1A machine
- locCode for P1A = `A`
- Last 4 digits = `0044`
- Result: `A0044`

## Scanner Code to LocCode Mapping

| Scanner Suffix | Machine | Division | LocCode | EmpCode Prefix |
|---------------|---------|----------|---------|----------------|
| 100 | P1A | P1A | A | A |
| 200 | ARC_01, ARC_02 | ARC | J | J |
| 300 | P1B | P1B | B | B |
| 400 | AB2 | AB2 | H | H |
| 500 | P2A | P2A | C | C |
| 600 | P2B | P2B | D | D |
| 700 | DME_01, DME_02 | DME | E | E |
| 800 | ARA | ARA | F | F |
| 900 | AB1 | AB1 | G | G |
| — | IJL | IJL | L | L |

## SSOT Parser Logic

```typescript
// src/modules/mapping/zkteco-employee-code-parser.ts

interface ParseResult {
  locCode: string;           // A, B, C, D, E, F, G, H, J, L
  rawUserId: string;         // Original raw_device_user_id
  parsedEmployeeCode: string; // Canonical code e.g. A0044
  mappingStatus: 'MAPPED' | 'NEED_REVIEW';
  scannerCode?: number;       // Extracted suffix (100, 200, etc.)
}
```

### Parsing Algorithm

1. **IJL detection:** If raw ID matches pattern `^\d{7}$` and first digit is `0` → locCode = `L`
2. **Scanner suffix extraction:** Take last 3 digits as scanner suffix
3. **Lookup locCode:** scannerCodeMap[suffix] → locCode
4. **Construct:** `{locCode}{last4digits(rawId)}`
5. **Fallback:** If no scanner match → `NEED_REVIEW`

## Employee Code Authority Chain

There are **two levels** of employee codes in the system:

### Level 1: parsed_employee_code (SSOT Parser)
Created at scan log ingestion time from the raw machine ID.
- Source: `zkteco-employee-code-parser.ts`
- Authority: Low (machine-generated)
- Use: Initial grouping for attendance_imports

### Level 2: current_emp_code (DB_PTRJ HR — AUTHORITY)
Joined from `employees` table via NIK resolution.
- Source: DB_PTRJ.HR_EMPLOYEE.nik
- Authority: High (HR master data)
- Use: Final attendance_imports.employee_code

### Resolution Cascade

```
attendance_scan_logs.raw_device_user_id
  │
  ├─→ zkteco-employee-code-parser.ts
  │       └─→ parsed_employee_code (e.g., "A0044")
  │       └─→ mapping_status ('MAPPED' or 'NEED_REVIEW')
  │
  └─→ employees table (by employee_code)
          └─→ current_emp_code (e.g., "A-00044")
          └─→ nik → hr_employee_current_snapshot
                  └─→ employee_name, division_id
```

### Why Two Levels?

- `parsed_employee_code` is available immediately at scan time (before HR sync)
- `current_emp_code` is the HR-authoritative version (e.g., `A-00044` vs `A0044`)
- Some employees may have changed codes over time — `current_emp_code` tracks the latest
- Pipeline GROUP BY uses `COALESCE(current_emp_code, parsed_employee_code)`

## Division Resolution (CRITICAL FIX 2026-06-25)

**Root cause of historical bug:** `hr-employee-sync.service.ts` used `locCode` (A, B, C...) as the lookup key for `divisionCodeMap`, but HR data uses `hr_loc_code` (P1A, P2B, DME...).

**Fix applied:**
```typescript
// WRONG (old):
const divisionId = divisionCodeMap[locCode];  // locCode = "A" → undefined

// CORRECT (fixed):
const divisionId = divisionCodeMap[hr_loc_code];  // hr_loc_code = "P1A" → id 6
```

Division lookup now uses `hr_loc_code` (P1A, P2B, DME...) directly as key into `divisionCodeMap`.

## Database Tables

### employees (8,005 rows)
```
id, employee_code, employee_name, division_id (FK→divisions.id),
nik, current_emp_code, hr_loc_code, hr_status,
zkteco_user_id, data_quality_status
```

Key: `employee_code` (e.g., A-00044) and `current_emp_code` (same value, from NIK join)

### attendance_scan_logs (788,915 rows)
```
id, raw_device_user_id,
parsed_employee_code (SSOT result),
mapping_status ('MAPPED'|'NEED_REVIEW'),
current_emp_code (from employees join),
current_employee_id (FK→employees.id)
```

### attendance_imports (45,348 rows)
```
id, employee_id (FK→employees),
employee_code (COALESCE of above two),
division_code (from employees→divisions JOIN)
```

## Special Cases

### IJL Machine — No Scanner Code
IJL raw IDs are 7-digit numbers like `0010022`. SSOT parser detects pattern `^\d{7}$` with leading zero → locCode = `L`, result = `L0022`.

### PGE Office Machine — Same as P1A
OFFICE_PGE (10.0.0.232) has no scanner suffix. All users use locCode `A` (same as P1A). Resulting codes like `A0002`.

### ARE Machine — No Mapping
OFFICE_APE (ARE) has no scanner suffix and no locCode assignment. Raw IDs may need manual review or investigation.

### NEET_REVIEW Rows
Rows where scanner suffix doesn't match any known machine, or raw_device_user_id is empty, get `mapping_status = 'NEED_REVIEW'`. Currently: 22 rows from AB1 machine with empty raw IDs.

## Verification Query

```sql
-- Check mapping quality by division
SELECT
  LEFT(parsed_employee_code, 1) AS loc_code,
  mapping_status,
  COUNT(*) AS row_count
FROM attendance_scan_logs
WHERE scan_date_wib >= '2026-03-01'
GROUP BY LEFT(parsed_employee_code, 1), mapping_status
ORDER BY loc_code;

-- Check enrichment completeness
SELECT
  CASE
    WHEN current_emp_code IS NOT NULL THEN 'enriched'
    ELSE 'not_enriched'
  END AS enrichment_status,
  COUNT(*) AS records
FROM attendance_imports
GROUP BY CASE WHEN current_emp_code IS NOT NULL THEN 'enriched' ELSE 'not_enriched' END;
```
