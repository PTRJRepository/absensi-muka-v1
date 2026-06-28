# Cross-Location Attendance Issue

**Date:** 2026-06-21  
**Issue:** P1B machine has mixed employees from other divisions

---

## Root Cause

**Both P1A and P1B machines have 792 users enrolled** - the same users!

This causes:
- P2A employees (C-prefix: 50001-50009) appear at P1B
- Same person generates DIFFERENT employee codes depending on which machine they scan

---

## Expected vs Actual

| Employee | Scan at P1A | Scan at P1B |
|----------|-------------|-------------|
| HADI (P2A) | A50001 | B50001 |
| RUSDI (P2A) | A50002 | B50002 |
| SARIPUDDIN (P2A) | A50003 | B50003 |

**Result:** Same person = Two different records!

---

## How to Fix

### Step 1: Clean P1B Machine Enrollment

At ZKTeco P1B machine:
1. Go to User Management
2. Remove ALL C-prefix employees (50001-50009)
3. Keep only B-prefix employees

### Step 2: Verify with Query

```sql
-- Check what's actually at P1B
SELECT DISTINCT LEFT(parsed_employee_code, 1) AS prefix, COUNT(*) AS cnt
FROM attendance_scan_logs
WHERE machine_code = 'P1B'
GROUP BY LEFT(parsed_employee_code, 1);
```

Expected result: Only "B" prefix at P1B

---

## Prevention

- Each employee should be enrolled at ONE machine only
- Machine enrollment should match employee code prefix
- Add periodic audit query to detect mixing

---

## Related Docs

- [[docs/CROSS-LOCATION-AUDIT.md]]
- [[docs/BUGS-FIXES.md]]
