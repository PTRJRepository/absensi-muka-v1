---
tags: [ai-context, database]
created: 2026-06-07
updated: 2026-06-25
---

# Database Context

## Post-Recovery State (2026-06-25)

| Property | Value |
|----------|-------|
| Server | 10.0.0.110 |
| Database | rebinmas_absensi_monitoring |
| Access | Direct mssql connection |
| attendance_scan_logs | 789,314 rows |
| attendance_imports | 38,604 rows |
| employees | 8,005 rows |

## Core Tables (Post-Recovery)

### attendance_scan_logs

Raw attendance events from ZKTeco machines.

| Column | Type | Notes |
|--------|------|-------|
| id | bigint PK | Identity |
| machine_id | int FK | FK to attendance_machines.id (not machine_code |
| machine_code | nvarchar | Machine identifier (P1A, B0193, etc.) |
| raw_device_user_id | nvarchar | Raw ID from machine |
| parsed_employee_code | nvarchar | SSOT parser result |
| current_emp_code | nvarchar | DB_PTRJ HR authoritative code |
| scan_time | datetime2 | WIB-corrected (UTC+7h from 2026-06-25 |
| scan_date | date | WIB date |
| scan_time_wib | datetime2 | Explicit WIB value |
| scan_date_wib | date | Explicit WIB date |
| time_correction_status | nvarchar | CORRECTED_UTC_TO_WIB |
| zkteco_user_name | nvarchar | Name from machine_user_raw (authority) |
| zkteco_user_name_source | nvarchar | MACHINE_USER_RAW or ATTENDANCE_RECORD |
| zkteco_user_name_sync_status | nvarchar | FILLED or NO_RAW_USER |
| sync_batch_id | bigint FK | FK to attendance_import_batches.id |

Key: machine_id (INT) + raw_device_user_id + raw_record_time (UTC)

### attendance_imports

Daily attendance per employee per day.

Authority: COALESCE(current_emp_code, parsed_employee_code) grouped by attendance_date. INNER JOIN to employees table.

Key: employee_id + attendance_date

### machine_user_raw

ZKTeco user enrollment data (from getUsers() sync).

| Column | Type | Notes |
|--------|------|-------|
| machine_user_raw_id | bigint PK | NOT "id" |
| machine_id | int | FK to attendance_machines.id |
| machine_user_id | nvarchar | Raw ID on machine |
| user_name | nvarchar | Employee name (authority for enrichment |

CRITICAL: No machine_code column. Join via machine_id (INT) to attendance_machines.id.

### attendance_machine_time_profile

Timezone config per machine.

| Column | Type | Notes |
|--------|------|-------|
| profile_id | bigint PK | NOT "id" |
| machine_code | nvarchar | Join to attendance_machines.machine_code |
| timezone_mode | nvarchar | UTC_SOURCE or WIB_SOURCE |
| offset_minutes | int | 420 for UTC_SOURCE (WIB = UTC+7) |
| evidence_note | nvarchar | NOT "notes" |

CRITICAL: No machine_id column. Join via machine_code (NVARCHAR) to attendance_machines.machine_code.

## Employee Code Mapping Priority

1. current_emp_code (DB_PTRJ HR authoritative) -- BEST
2. parsed_employee_code (SSOT parser result)
3. raw_device_user_id (fallback only)

## Timezone

All machines configured as UTC_SOURCE +420 minutes (UTC+7 = WIB). Historical data corrected 2026-06-25.

## Access Method

Direct mssql connection (NOT HTTP Gateway). Connection: 10.0.0.110:1433, database: rebinmas_absensi_monitoring.
