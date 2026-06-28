# Absensi Muka - Full API Audit Plan
# Date: 2026-06-19 | DB: rebinmas_absensi_monitoring | Port: 8004

## STATUS: 86 Working, 6 Broken, 2 Duplicate Routes

## BROKEN ENDPOINTS

# BUG-001: GET /api/import/batch/:id/status
# File: src/api/routes/import-control.routes.ts Line: 271
# Error: Invalid column name 'machine_name'
# Fix: Change am.machine_name to am.location_name

# BUG-002: Alert rules - 4 broken endpoints
# File: src/api/routes/alert.routes.ts
# Error: Invalid column name 'config_type' and 'is_active'
# Schema: app_configs has id, config_key, config_value, is_sensitive, description, updated_by, updated_at
# NOT: config_type, is_active
# Fix: GET (line 24-26): Remove WHERE config_type='ALERT_RULE', is_active->is_sensitive
# Fix: POST (line 54-61): Remove config_type from INSERT, is_active->is_sensitive
# Fix: PUT (line 80): Remove config_type filter, is_active->is_sensitive
# Fix: DELETE (line 102): Remove config_type filter, is_active->is_sensitive

# BUG-003: POST /api/import/preview and /api/import/upload
# File: src/api/routes/import.routes.ts
# Error: SQL Error: Missing API key. Include x-api-key header.
# Root cause: GATEWAY_API_KEY env var is empty string, SqlClient defaults to wrong DB (extend_db_ptrj)
# Fix: Refactor import.routes.ts to use direct MSSQL from src/lib/db
# Known API key for HTTP gateway: <API_KEY>

# BUG-004: Duplicate route registration
# Files: quality.routes.ts + quality-dashboard.routes.ts
# Both register GET /api/quality/dashboard-summary and GET /api/quality/daily-trend
# quality-dashboard.routes.ts wins (imported last). Remove duplicates from quality-dashboard.routes.ts

## NON-BREAKING FINDINGS

# FINDING-001: SQL injection in MachineRepository and EmployeeMappingService (string interpolation)
# FINDING-002: FK constraint on anonymous attendance corrections (user ID 0 -> use NULL)
# FINDING-003: Duplicate sync.routes import in index.ts (lines 5 and 18)

## DATABASE SCHEMA

# Confirmed tables: attendance_change_logs, attendance_import_batches, attendance_imports,
# attendance_imports_old, attendance_machines, attendance_manual_corrections, attendance_scan_logs,
# attendance_sync_logs, divisions, employee_mapping_overrides, employee_schedules, employees,
# gangs, holidays, loc_codes, machine_connection_logs, roles, scanner_codes, shifts,
# user_roles, users, app_configs

# Confirmed views: vw_attendance_final, vw_attendance_daily_summary,
# vw_attendance_monthly_summary, vw_sync_latest_status

# app_configs columns: id, config_key, config_value, is_sensitive, description, updated_by, updated_at
# (NOT config_type, is_active)

# attendance_machines columns: id, machine_code, location_name, ip_address, port, local_ip,
# machine_type, scanner_code, loc_code, access_status, data_source, notes, is_active,
# last_sync_at, last_error_message, created_at, updated_at (NOT machine_name)

## FIX PRIORITY

# P0 CRITICAL: BUG-001 - 1 line: am.machine_name -> am.location_name
# P1 HIGH: BUG-002 (4 alert endpoints) - Replace config_type/is_active
# P1 HIGH: BUG-003 (2 import endpoints) - Refactor to direct MSSQL
# P2 MEDIUM: BUG-004 - Remove duplicate route registrations
# P3 LOW: FINDING-001 - Parameterized queries
# P3 LOW: FINDING-002 - NULL for anonymous user ID
