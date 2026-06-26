# Migration History

## All Migrations (001 — 041)

Migrations dijalankan via `npm run db:migrate` atau individual script.

---

## Migrations: Initial Setup (001-010)

| ID | File | Purpose | Notes |
|----|------|---------|-------|
| 001 | `001_create_database.sql` | Create rebinmas_absensi_monitoring DB | |
| 002 | `002_create_tables.sql` | Core tables | employees, divisions, gangs, machines |
| 003 | `003_create_indexes.sql` | Performance indexes | scan_logs, imports, mapping tables |
| 004 | `004_create_views.sql` | SQL views | vw_attendance_* views |
| 005 | `005_seed_dummy.sql` | Seed dummy data | Testing |
| 006 | `006_machine_health_and_errors.sql` | Machine health tracking | |
| 007 | `007_bulk_insert_attendance_imports.sql` | Bulk insert optimization | |
| 010 | `010_create_zkteco_attendance_view.sql` | ZKTeco attendance view | |

---

## Migrations: Attendance Processing (011-023)

| ID | File | Purpose |
|----|------|---------|
| 011 | `011_update_employees_to_zkteco_format.sql` | Convert employee codes to ZKTeco format |
| 012 | `012_fix_scan_log_mapping.sql` | Fix mapping in scan logs |
| 013 | `013_optimize_views.sql` | Optimize SQL views |
| 014 | `014_monthly_matrix_view.sql` | Monthly matrix view |
| 014b | `014_create_missing_tables.sql` | Create missing tables |
| 015 | `015_create_hr_mapping.sql` | HR mapping setup |
| 015 | `015_fix_ijl_unmapped.sql` | Fix IJL unmapped records |
| 016 | `016_update_view_multi_format.sql` | Multi-format view support |
| 017 | `017_create_zkteco_hr_mapping.sql` | Create zkteco_hr_employee_map |
| 018 | `018_sync_employees_from_hr.sql` | Sync employees from db_ptrj |
| 019 | `019_add_zkteco_user_id.sql` | Add zkteco_user_id column |
| 020 | `020_update_attendance_views.sql` | Update attendance views |
| 021 | `021_attendance_intelligence_indexes.sql` | Intelligence indexes |
| 022 | `022_quality_health_hardening.sql` | Quality hardening |
| 023 | `023_live_attendance_compat.sql` | Live attendance compatibility |

---

## Migrations: Sanitization (034-041)

### 034: Fix 001* (IJL) Scanner Prefix

**File**: `034_fix_001_ijl_need_review.sql`
**Date**: 2026-06-22
**Purpose**: Parse `001*` raw IDs dari IJL machine ke `L*` employee codes

```sql
-- Parse: 0010097 → L0097
UPDATE s SET
  parsed_employee_code = 'L' + RIGHT('0000' + SUBSTRING(raw_device_user_id, 4, LEN(raw_device_user_id)-3), 4),
  mapping_status = 'MAPPED',
  mapping_reason = 'PARSED_SCANNER_PREFIX_001_L'
FROM dbo.attendance_scan_logs s
WHERE LEFT(raw_device_user_id, 3) = '001'
  AND mapping_status = 'NEED_REVIEW'
  AND EXISTS (SELECT 1 FROM db_ptrj.dbo.HR_EMPLOYEE WHERE EmpCode = ...);
```

**Result**: 8,849 MAPPED, 90 UNMAPPED

---

### 035: Empty/Null raw_device_user_id → UNMAPPED

**File**: `035_sanitize_empty_null_need_review.sql`
**Date**: 2026-06-22
**Records**: 49,323

```sql
UPDATE attendance_scan_logs
SET mapping_status = 'UNMAPPED',
    mapping_reason = 'SANITIZE_EMPTY_NULL_RAW_ID_035'
WHERE (raw_device_user_id IS NULL
   OR LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(100))))) = 0)
  AND mapping_status = 'NEED_REVIEW';
```

---

### 036: Non-Scanner-Prefix Short (5-digit) → UNMAPPED

**File**: `036_sanitize_non_scanner_prefix_short.sql`
**Date**: 2026-06-22
**Records**: 170,666

Mengatasi 5-digit IDs yang tidak memiliki scanner prefix valid (100-900, 001). Tidak bisa di-parse karena hanya 2 digit sisanya.

```sql
-- 5-digit, tidak starts dengan 100/200/300/400/500/600/700/800/900/001
WHERE LEN(raw_device_user_id) = 5
  AND raw_device_user_id NOT LIKE '100%'
  AND raw_device_user_id NOT LIKE '200%'
  -- ... semua prefix ...
  AND raw_device_user_id NOT LIKE '001%';
```

---

### 037: Very Short IDs (1-4 char) → UNMAPPED

**File**: `037_sanitize_very_short_ids.sql`
**Date**: 2026-06-22
**Records**: 6,377

Short ID 1-4 karakter tidak bisa di-parse karena kurang dari 5 digit.

```sql
WHERE LEN(raw_device_user_id) BETWEEN 1 AND 4;
```

---

### 038: zkteco_hr_employee_map CONVERTED Short → UNMATCHED

**File**: `038_sanitize_zkteco_map_short_converted.sql`
**Date**: 2026-06-22
**Records**: 452

Mapping di zkteco_hr_employee_map yang menggunakan CONVERTED short IDs.

```sql
UPDATE zkteco_hr_employee_map
SET is_active = 0
WHERE match_confidence = 'CONVERTED'
  AND LEN(LTRIM(RTRIM(CAST(zkteco_user_id AS NVARCHAR(100))))) <= 5;
```

---

### 039: Medium 6-7 Char Valid → MAPPED

**File**: `039_sanitize_medium_6_7_valid.sql`
**Date**: 2026-06-22
**Records**: 69

Mengatasi 6-7 digit IDs yang memiliki scanner prefix valid.

```sql
-- 6-7 digit: strip prefix, pad last 4, concat with locCode
CASE
  WHEN LEFT(raw_device_user_id, 3) = '100' THEN 'A' + RIGHT('000' + SUBSTRING(raw_device_user_id, 4, 3), 4)
  WHEN LEFT(raw_device_user_id, 3) = '200' THEN 'J' + RIGHT('000' + SUBSTRING(raw_device_user_id, 4, 3), 4)
  -- ... etc
END
```

---

### 040: Cross-Location Contamination Fix

**File**: `040_fix_cross_location_contamination.sql`
**Date**: 2026-06-23
**Purpose**: Fix 1 card → multiple employees di mesin berbeda

**Step 1**: employees table — assign canonical employee_code berdasarkan division
**Step 2**: db_ptrj lookup — match berdasarkan nama
**Step 3**: Deactivate unresolved

**Records**: 146 fixed, 56 deactivated

**Root Cause**: Physical card di-enroll dengan employee code berbeda di setiap mesin.

---

### 041: Long Raw ID Registry + Canonical Mapping

**File**: `041_sanitize_long_absensi_user_registry.sql`
**Date**: 2026-06-23

Creates 2 new tables:
- `zkteco_absensi_user_registry` — canonical per raw_device_user_id
- `zkteco_absensi_user_machine` — per-machine breakdown

**Steps**:
1. Remove short raw IDs from all operational tables
2. Build long raw ID registry with DB_PTRJ lookup
3. Upsert registry + per-machine tables
4. Back-fill canonical mapping to attendance_scan_logs

**Result**:
- 1,827 registry entries
- 1,825 MAPPED (via HR lookup)
- 2 NEED_REVIEW (G0628, A0979 — left company)
- 1,614 cross-location cards deduplicated

---

### 041b: Clean Invalid Employee Codes

**File**: `041_clean_invalid_employee_codes.sql`
**Date**: 2026-06-23
**Purpose**: Deactivate employees dengan raw card number sebagai employee_code

```sql
-- Invalid: employee_code = '10001' instead of 'A0001'
UPDATE employees
SET is_active = 0
WHERE LEN(employee_code) <= 5
  AND employee_code NOT LIKE '[A-Z][0-9][0-9][0-9][0-9]'
  AND employee_code NOT LIKE 'CT%';  -- contractor codes excluded
```

**Records**: 650 inactive employees (already deactivated when migration ran)

---

## Legacy Migrations (avoid these)

| ID | File | Notes |
|----|------|-------|
| 001 | `001_create_schema.sql` | extend_db_ptrj legacy |
| 002 | `002_cross_division_sorting.sql` | extend_db_ptrj |
| 003 | `003_add_needs_manual_review.sql` | Rebinmas DB |
| 007a | `007a_need_review.sql` | Legacy need review |
| 007b | `007b_mapped_direct.sql` | Legacy mapping |
| 007c | `007c_mapped_fallback.sql` | Legacy fallback |
| 008 | `008_rescue_unmapped.sql` | Rescue unmapped |
| 009 | `009_insert_imports.sql` | Insert imports |
| 009b | `009_insert_imports_from_mapped.sql` | From mapped |

---

## How to Run Migrations

```bash
# Run all pending migrations
npm run db:migrate

# Run specific migration
npx ts-node src/scripts/run-migrations.ts

# Check database connection
npm run db:check
```

---

## Verification Queries

```sql
-- Check short IDs still mapped (should be 0)
SELECT COUNT(*) FROM attendance_scan_logs
WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) <= 5
  AND mapping_status = 'MAPPED';

-- Registry summary
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) as mapped,
  SUM(CASE WHEN mapping_status <> 'MAPPED' THEN 1 ELSE 0 END) as need_review
FROM zkteco_absensi_user_registry;

-- Cross-location count
SELECT COUNT(*) FROM zkteco_absensi_user_registry WHERE machine_count > 1;

-- Scan log status breakdown
SELECT mapping_status, COUNT(*) as cnt
FROM attendance_scan_logs
WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) > 5
GROUP BY mapping_status;
```
