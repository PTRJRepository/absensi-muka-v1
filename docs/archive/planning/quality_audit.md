# Quality Routes Audit Report

**Generated:** June 19, 2026  
**Project:** D:/Gawean Rebinmas/Absensi_Muka  
**Database:** MSSQL 10.0.0.110 (rebinmas_absensi_monitoring)  
**Server Port:** 8004

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Working | 8 |
| ❌ Broken | 0 |

---

## Endpoint Test Results

### 1. `/api/quality/dashboard-summary` (quality.routes.ts)

**Status:** ✅ Working

**SQL Queries Verified:**
- `attendance_scan_logs` - columns: `scan_date`, `raw_device_user_id`, `mapping_status` ✅
- `attendance_imports` - column: `attendance_date` ✅
- `attendance_import_batches` - columns: `started_at`, `status` ✅

**Response:** Returns summary with 50,152 scan logs, 4,877 imports, 716 unmapped records, 78% mapped rate

---

### 2. `/api/quality/daily-trend` (quality.routes.ts)

**Status:** ✅ Working

**SQL Queries Verified:**
- `attendance_scan_logs` - columns: `scan_date`, `parsed_employee_code`, `parsed_division_code`, `mapping_status` ✅

**Response:** Returns 8 days of trend data with division breakdown

---

### 3. `/api/quality/unmapped` (quality.routes.ts)

**Status:** ✅ Working

**SQL Queries Verified:**
- `attendance_scan_logs` - columns: `raw_device_user_id`, `machine_code`, `scan_time`, `mapping_status`, `mapping_reason` ✅

**Response:** Returns 100 unmapped device users with breakdown (invalid_format, no_employee, pending_override)

---

### 4. `/api/quality/duplicates` (quality.routes.ts)

**Status:** ✅ Working

**SQL Queries Verified:**
- `attendance_scan_logs` - columns: `raw_device_user_id`, `machine_code`, `scan_date`, `scan_time` ✅

**Response:** Returns 100 duplicate groups with 3,948 extra records detected

---

### 5. `/api/quality/machine-drift` (quality.routes.ts)

**Status:** ✅ Working

**SQL Queries Verified:**
- `attendance_machines` - columns: `machine_code`, `location_name`, `ip_address`, `last_sync_at`, `access_status`, `is_active` ✅
- `attendance_sync_logs` - columns: `machine_code`, `started_at`, `duration_ms` ✅

**Response:** Returns 16 machines, all showing `NEVER_SYNCED` status

---

### 6. `/api/quality/report` (quality.routes.ts)

**Status:** ✅ Working

**SQL Queries Verified:**
- `attendance_scan_logs` - all mapping status queries ✅
- `attendance_imports` - attendance date filter ✅
- `attendance_import_batches` - batch statistics with `records_total`, `records_success`, `records_failed` ✅

**Response:** Returns comprehensive report with daily trend, division stats, unmapped codes, and batch summary

---

### 7. `/api/quality/summary` (quality.routes.ts)

**Status:** ✅ Working

**SQL Queries Verified:**
- `attendance_scan_logs` - mapped/unmapped employee counts ✅
- `attendance_import_batches` - FAILED/COMPLETED status counts ✅

**Response:** Returns quick stats with WARNING status (92 failed batches)

---

### 8. `/api/quality/daily-trend` (quality-dashboard.routes.ts)

**Status:** ✅ Working

**SQL Queries Verified:**
- `attendance_scan_logs` - columns: `scan_date`, `parsed_employee_code`, `machine_code`, `mapping_status` ✅

**Response:** Returns 30-day trend with mapped/unmapped breakdown per day

---

## Schema Verification

### Tables Used:
| Table | Columns Used | Status |
|-------|-------------|--------|
| `attendance_scan_logs` | machine_code, raw_device_user_id, parsed_employee_code, parsed_division_code, mapping_status, mapping_reason, scan_time, scan_date | ✅ Valid |
| `attendance_imports` | attendance_date | ✅ Valid |
| `attendance_import_batches` | status, started_at, records_total, records_success, records_failed | ✅ Valid |
| `attendance_machines` | machine_code, location_name, ip_address, is_active, last_sync_at, access_status | ✅ Valid |
| `attendance_sync_logs` | machine_code, started_at, duration_ms | ✅ Valid |

### No Wrong Table/Column Names Found ✅

All SQL queries reference existing tables and columns as defined in the migrations.

---

## Notes

1. **Machine Drift:** All 16 machines show `NEVER_SYNCED` status - `last_sync_at` is NULL for all machines
2. **Mapping Issues:** 716 unmapped device users detected, reason: "Raw device user id is not numeric"
3. **Duplicate Scans:** 100 duplicate groups with 3,948 extra records detected (device appears to scan multiple times)
4. **Failed Batches:** 92 failed batches in the last 7 days (WARNING status)
