# Employee Code Mapping Analysis

## How It Works

Raw ZKTeco ID from machine -> parsed_employee_code (SSOT parser) -> join DB_PTRJ.HR_EMPLOYEE -> current_emp_code (authoritative HR code) -> employees table

## Pipeline Result Stats

- 788,441 / 788,915 (99.9%) -- current_emp_code successfully resolved via DB_PTRJ
- 7 -- G0628 rows fixed (MAPPED but NULL current_emp_code, set = parsed_employee_code)
- 22 -- NEED_REVIEW rows (raw_device_user_id empty, cannot auto-map)

## Null current_emp_code Breakdown

| Machine | Division | Status | Count |
|---------|----------|---------|-------|
| AB1 | G | MAPPED_FIXED | 7 |
| AB1 | null | NEED_REVIEW | 22 |

All 7 G0628 rows were fixed by setting current_emp_code = parsed_employee_code.

The 22 NEED_REVIEW rows have empty raw_device_user_id -- cannot auto-map at all.

## Attendance Imports Rebuild Logic

Used COALESCE(current_emp_code, parsed_employee_code) grouped by employee_code + scan_date.

Only joined to employees table where employee exists -- unmappable rows excluded.

## Why current_emp_code Authority

Backup data shows: parsed_employee_code was the SSOT parser result (e.g. G0582 from raw 9000582), but current_emp_code was the result of a DB_PTRJ lookup that corrected wrong parsings (e.g. long raw ID 3000654 parsed to B0654 but HR said F0365).

The 338 MISMATCH rows (backup vs live) were all from long raw IDs where the old parser produced wrong codes. The new pipeline (migration 041+) correctly parses them.

## Division Coverage After Fix

All 10 divisions A-L covered. Low counts on C/D/F are due to inaccessible machines (P2A, P2B, ARA).
