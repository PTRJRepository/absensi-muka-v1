# CROSS-LOCATION ATTENDANCE - Audit Report

**Generated:** 2026-06-21  
**Issue:** P1B machine has mixed employees from other divisions

---

## ⚠️ ROOT CAUSE: Identified

Both P1A and P1B machines have **792 users enrolled** - the SAME users in both machines!

This is NOT a bug in the system - it's a **ZKTeco enrollment issue** at the machine level.

---

## Machine Configuration Analysis

| Property | P1A | P1B |
|----------|------|-----|
| **Machine Code** | P1A | P1B |
| **IP Address** | 10.0.0.90 | 10.0.0.91 |
| **Scanner Code** | 100 | 300 |
| **Expected Prefix** | A | B |
| **Users Enrolled** | 792 | 792 |
| **Attendance Records** | 2,681 | 2,675 |

---

## How the System Maps Employee Codes

### Logic Flow

```
Employee scans at machine → System uses machine's SCANNER CODE to determine prefix

Scanner Code 100 (P1A) → Prefix "A" → Employee code: A0044
Scanner Code 300 (P1B) → Prefix "B" → Employee code: B0232
```

### Problem Example

```
Employee "HADI" (actual P2A employee, code should be C0001):
  ├── Enrolled at P1A (scanner 100) → System generates: A0001
  ├── Enrolled at P1B (scanner 300) → System generates: B0001
  └── Result: Same person appears as TWO different employees!
```

---

## Data Evidence

From `_dev_utils/attendance-p1a-*.json` and `attendance-p1b-*.json`:

| Name | P1A userId | P1B userId | Expected Division |
|------|------------|------------|------------------|
| GIURI DUMITA | 10044 | 10044 | P1A (A) |
| RADEN MUHAMMAD WAHYU JU | 10045 | 10045 | P1A (A) |
| HADI | 50001 | 50001 | P2A (C) |
| RUSDI | 50002 | 50002 | P2A (C) |
| SARIPUDDIN | 50003 | 50003 | P2A (C) |
| WAHYU | 50005 | 50005 | P2A (C) |
| RISKI HUDA | 50006 | 50006 | P2A (C) |
| ALI | 50007 | 50007 | P2A (C) |
| ERWANSYAH | 50008 | 50008 | P2A (C) |

**Findings:**
- P1A employees (A-prefix) are correctly at P1A
- P1B machine has P2A employees (C-prefix: 50001-50009) - THIS IS THE MIXING!

---

## Scanner Code Mapping

```typescript
Scanner 100 → locCode "A" → P1A Division
Scanner 300 → locCode "B" → P1B Division
Scanner 500 → locCode "C" → P2A Division
Scanner 600 → locCode "D" → P2B Division
Scanner 700 → locCode "E" → DME Division
Scanner 800 → locCode "F" → ARA Division
Scanner 900 → locCode "G" → AB1 Division
Scanner 400 → locCode "H" → AB2 Division
Scanner 200 → locCode "J" → ARC Division
```

---

## How to Detect Cross-Location Scans

### SQL Query 1: Find Non-B Employees at P1B

```sql
-- Find employees at P1B who DON'T have B-prefix
SELECT 
    s.parsed_employee_code AS scanned_code,
    LEFT(s.parsed_employee_code, 1) AS code_prefix,
    CASE LEFT(s.parsed_employee_code, 1)
        WHEN 'A' THEN 'P1A Division'
        WHEN 'B' THEN 'P1B Division'
        WHEN 'C' THEN 'P2A Division'
        WHEN 'D' THEN 'P2B Division'
        WHEN 'E' THEN 'DME Division'
        WHEN 'F' THEN 'ARA Division'
        WHEN 'G' THEN 'AB1 Division'
        WHEN 'H' THEN 'AB2 Division'
        WHEN 'J' THEN 'ARC Division'
        WHEN 'L' THEN 'IJL/PGE'
        ELSE 'Unknown'
    END AS home_division,
    s.scan_date,
    s.scan_time
FROM attendance_scan_logs s
WHERE s.machine_code = 'P1B'
  AND LEFT(s.parsed_employee_code, 1) != 'B'
  AND s.parsed_employee_code IS NOT NULL
ORDER BY s.scan_date DESC, s.scan_time DESC;
```

### SQL Query 2: Cross-Division Summary by Machine

```sql
-- Summary of which divisions' employees scan at which machines
SELECT 
    m.machine_code AS scan_location,
    LEFT(s.parsed_employee_code, 1) AS emp_prefix,
    COUNT(*) AS scan_count,
    CASE LEFT(s.parsed_employee_code, 1)
        WHEN 'A' THEN 'P1A'
        WHEN 'B' THEN 'P1B'
        WHEN 'C' THEN 'P2A'
        WHEN 'D' THEN 'P2B'
        WHEN 'E' THEN 'DME'
        WHEN 'F' THEN 'ARA'
        WHEN 'G' THEN 'AB1'
        WHEN 'H' THEN 'AB2'
        WHEN 'J' THEN 'ARC'
        WHEN 'L' THEN 'IJL/PGE'
    END AS home_division,
    CASE 
        WHEN m.machine_code = 'P1A' AND LEFT(s.parsed_employee_code, 1) != 'A' THEN 'CROSS-LOCATION'
        WHEN m.machine_code = 'P1B' AND LEFT(s.parsed_employee_code, 1) != 'B' THEN 'CROSS-LOCATION'
        WHEN m.machine_code = 'P2A' AND LEFT(s.parsed_employee_code, 1) != 'C' THEN 'CROSS-LOCATION'
        WHEN m.machine_code = 'P2B' AND LEFT(s.parsed_employee_code, 1) != 'D' THEN 'CROSS-LOCATION'
        WHEN m.machine_code = 'DME' AND LEFT(s.parsed_employee_code, 1) != 'E' THEN 'CROSS-LOCATION'
        ELSE 'CORRECT'
    END AS status
FROM attendance_scan_logs s
JOIN mst_machine m ON m.machine_code = s.machine_code
WHERE s.parsed_employee_code IS NOT NULL
GROUP BY m.machine_code, LEFT(s.parsed_employee_code, 1)
ORDER BY m.machine_code, scan_count DESC;
```

### SQL Query 3: Use Existing Stored Procedure

```sql
-- Uses the existing sp_get_cross_division_scan procedure
EXEC sp_get_cross_division_scan
    @start_date = '2026-06-01',
    @end_date = '2026-06-30',
    @division_id = NULL;
```

---

## System Detection: CROSS_DIVISION_SCAN Anomaly

The system DOES detect cross-division scans via `anomaly.service.ts`:

```typescript
// Anomaly types detected:
if (process.reconcile_status === 'MISMATCH' || process.is_cross_division_scan) {
  anomalies.push({
    anomaly_type: 'CROSS_DIVISION_SCAN',
    severity: 'MEDIUM',
    // ...
  });
}
```

And via `attendance-reconcile.service.ts`:
- Sets `is_cross_division_scan = 1` flag
- Records `detected_division_id` vs `expected_division_id`

---

## Reconciliation Priority

When an employee scans:

```
1. Expected Division (from emp_code prefix)     → Use this first
2. IT Solution API (if configured)              → Fallback
3. Detected Division (from machine locCode)     → Use if API fails
4. Current Division (from previous record)       → Last resort
```

---

## Recommendations

### Immediate Actions

1. **Verify P1B Enrollment at ZKTeco Machine**
   - Go to P1B machine directly
   - Check user enrollment list
   - Remove C-prefix employees (50001-50009) from P1B
   - Keep only B-prefix employees

2. **Run Detection Query**
   ```bash
   # Run Query 1 above to see actual cross-location scans
   ```

3. **Check Employee Master Data**
   ```sql
   -- Verify employees have correct home division
   SELECT employee_code, division_code 
   FROM employees 
   WHERE employee_code LIKE 'B%' 
   AND division_code != 'P1B';
   ```

### Long-Term Fixes

1. **Clean Machine Enrollment**
   - P1A: Only A-prefix employees
   - P1B: Only B-prefix employees
   - Each employee enrolled at ONE machine only

2. **Add Real-Time Alert**
   Create alert when `is_cross_division_scan = 1`

3. **Add Dashboard Widget**
   Show cross-location scan count per day

---

## Expected Employee Codes by Division

| Division | Machine | Scanner Code | Employee Code Prefix |
|----------|---------|--------------|---------------------|
| P1A | P1A | 100 | A |
| P1B | P1B | 300 | B |
| P2A | P2A_01, P2A_02 | 500 | C |
| P2B | P2B | 600 | D |
| DME | DME_01, DME_02 | 700 | E |
| ARA | ARA | 800 | F |
| AB1 | AB1 | 900 | G |
| AB2 | AB2 | 400 | H |
| ARC | ARC_01, ARC_02 | 200 | J |
| IJL/PGE | IJL, PGE | - | L or A |

---

## Key Files

- `_dev_utils/src/machine-config.ts` - Machine configuration
- `src/modules/employees/employee-mapping.service.ts` - Mapping logic
- `src/modules/attendance/attendance-reconcile.service.ts` - Cross-division detection
- `src/modules/monitoring/anomaly.service.ts` - Anomaly detection
