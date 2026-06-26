# Database Redesign

## Purpose
New database stores monitoring source of truth without SQL Gateway and without `extend_db_ptrj`.

## Core model
- Identity: `roles`, `users`, `user_roles`.
- Organization: `divisions`, `gangs`, `employees`, `shifts`, `employee_schedules`, `holidays`.
- Machine knowledge: `attendance_machines`, `scanner_codes`, `loc_codes`, `machine_connection_logs`.
- Raw data: `attendance_scan_logs` preserves raw ZKTeco/API scan evidence.
- Imports: `attendance_import_batches`, `attendance_imports` are immutable imported attendance.
- Corrections: `attendance_manual_corrections` are mutable HR/admin overrides with mandatory reason.
- Audit: `attendance_change_logs` records corrections, sync, config, login, machine updates.
- Monitoring: `attendance_sync_logs`, views, and dashboard endpoints expose status.

## Final attendance rule
```txt
Manual Correction > Imported Attendance > No Data
```

## Machine rules preserved
- Inventory supports 15 real machines later.
- `attendance_machines` tracks machine code, location, IP/port, local IP, machine type, scanner code, loc code, access status, data source, notes, and active flag.
- `scanner_codes` and `loc_codes` preserve device-user to employee-code mapping context.
- Failed machine sync writes both `attendance_sync_logs` and `machine_connection_logs`.

## Safety rules
- Parameterized query required for all user input.
- `attendance_imports` is never edited by UI.
- Raw scan logs are retained even when mapping fails.
- Unmapped scans use status `NEED_REVIEW`.
