# PLAN: Fix Duplicate Key Error in attendance_imports

## Root Cause Analysis (Updated: 2026-06-19)

**Problem:** INSERT with GROUP BY fails on UNIQUE constraint `uq_attendance_import`

**Current State:**
- `attendance_imports`: 6,561 records with 285 duplicate groups (CORRUPTED)
- `attendance_scan_logs`:
  - MAPPED: 322,283 records
  - NEED_REVIEW: 214,450 records
  - UNMAPPED: 28,131 records
  - **Total: 564,864 records**

**Constraint Definition:**
```sql
UNIQUE (employee_code, attendance_date, source, source_reference)
-- source = 'ZKTECO' (constant)
-- source_reference = machine_code
```

**Grouping Logic (from 009_insert_imports_from_mapped.sql):**
```sql
GROUP BY s.parsed_employee_code, s.parsed_division_code,
         CAST(s.scan_date AS DATE), s.machine_code, s.sync_batch_id
```

**Root Cause:**
- GROUP BY includes `sync_batch_id` → creates one row per `(employee, date, machine, batch)`
- UNIQUE constraint only has `(employee, date, machine)` → doesn't include batch_id
- When same `(employee, date, machine)` exists in **multiple sync batches**, GROUP BY creates multiple rows with same unique key → **VIOLATION**

**Evidence:**
- 22,885 groups have same (employee, date, machine) across multiple sync_batch_id values
- Example: employee `0010106` on `2026-05-04` at `PGE` machine exists in **5 different batches**

## Fix Strategy

### Approach: Python Script with Proper Aggregation

1. **TRUNCATE TABLE** attendance_imports (clean slate)
2. **Process MAPPED records** (322,283 scan logs)
   - Group by: employee_code, scan_date, machine_code
   - Aggregate: first_scan (MIN), last_scan (MAX), scan_count (COUNT)
   - Join with employees table to get employee_id
   - Insert with: source='ZKTECO', source_reference=machine_code
3. **Process NEED_REVIEW records** (214,450 scan logs)
   - Group by: raw_device_user_id, scan_date, machine_code
   - employee_code = 'MANUAL_' + raw_device_user_id
   - employee_id = 0
   - needs_manual_review = 1
   - source='ZKTECO', source_reference=machine_code
4. **Skip UNMAPPED records** (28,131 - no valid employee code)

### Key Columns for attendance_imports
| Column | Source |
|--------|--------|
| employee_id | JOIN employees.employee_code |
| employee_code | scan_logs.parsed_employee_code |
| division_code | employees.division_id |
| attendance_date | CONVERT(date, scan_date) |
| check_in_at | MIN(scan_time) |
| check_out_at | MAX(scan_time) |
| scan_count | COUNT(*) |
| source | 'ZKTECO' |
| source_reference | machine_code |
| needs_manual_review | 0 for MAPPED, 1 for NEED_REVIEW |

## Implementation

### Python Script: fix_imports.py
- Uses pyodbc with ODBC Driver 17 for SQL Server
- Connection: `DRIVER={ODBC Driver 17 for SQL Server};SERVER=10.0.0.110;UID=sa;PWD=<DB_PASSWORD>;DATABASE=rebinmas_absensi_monitoring;TrustServerCertificate=yes`
- Progress logging every 5,000 records
- Final stats: total inserted, MAPPED count, NEED_REVIEW count

### Expected Output
- MAPPED records: ~25,000-30,000 unique groups
- NEED_REVIEW records: ~10,000-15,000 unique groups
- All unique by (employee_code, attendance_date, source, source_reference)

## Verification

After fix, run:
```sql
SELECT COUNT(*) FROM attendance_imports;
SELECT COUNT(*) as unique_count FROM (SELECT DISTINCT employee_code, attendance_date, source, source_reference FROM attendance_imports) u;
SELECT needs_manual_review, COUNT(*) FROM attendance_imports GROUP BY needs_manual_review;
```
