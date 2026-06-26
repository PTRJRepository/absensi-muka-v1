# currentEmpCode Implementation - Acceptance Criteria

## Overview

This document provides a comprehensive checklist for validating the `currentEmpCode` implementation. The `currentEmpCode` feature resolves attendance records to the current/active employee code based on HR database information, replacing the historical `parsed_employee_code` which may be outdated.

## PRD Reference

**Example from PRD**: NIK `1906041207910002` should resolve to `currentEmpCode: A0966`

---

## Schema (Pre-flight)

### Database Migration

- [ ] Migration 047 (`047_add_current_empcode_registry.sql`) applied successfully
  - Added columns to `zkteco_absensi_user_registry`:
    - `resolved_nik`
    - `current_emp_code`
    - `current_emp_name`
    - `current_hr_status`
    - `current_hr_loc_code`
    - `current_hr_create_date`
    - `current_hr_update_date`
    - `current_resolution_status`
    - `current_resolution_method`
    - `current_resolution_reason`
    - `current_resolved_at`

- [ ] Migration 048 (`048_add_current_empcode_scan_logs.sql`) applied successfully
  - Added columns to `attendance_scan_logs`:
    - `resolved_nik`
    - `current_emp_code`

- [ ] Migration 049 (`049_add_current_empcode_imports.sql`) applied successfully
  - Added column to `attendance_imports`:
    - `current_emp_code`

- [ ] Migration 050 (`050_add_current_empcode_employees.sql`) applied successfully
  - Added columns to `employees` table

- [ ] Migration 051 (`051_create_hr_employee_current_snapshot.sql`) applied successfully
  - Created `hr_employee_current_snapshot` table
  - Created indexes:
    - `IX_hr_current_snapshot_nik`
    - `IX_hr_current_snapshot_current_emp_code`

- [ ] Migration 052 (`052_create_employee_code_history.sql`) applied successfully
  - Created `employee_code_history` table
  - Created indexes:
    - `IX_employee_code_history_nik`
    - `IX_employee_code_history_emp_code`
    - `IX_employee_code_history_current`

### Schema Verification

```sql
-- Run this to verify all columns exist:
SELECT TABLE_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME IN (
  'resolved_nik', 'current_emp_code', 'current_mapping_status',
  'current_resolution_status', 'current_resolution_method',
  'parsed_employee_code'
)
ORDER BY TABLE_NAME, COLUMN_NAME;
```

---

## HR Snapshot Sync

### Initial Sync

- [ ] `sync-hr-current-snapshot.ts` script runs successfully
- [ ] HR employee data fetched from `HR_DB_SERVER.DB_PTRJ.dbo.HR_EMPLOYEE`
- [ ] `hr_employee_current_snapshot` table populated
- [ ] `employee_code_history` table populated

### Example NIK Verification

- [ ] Example NIK `1906041207910002` resolves to `currentEmpCode: A0966`
  - Query:
    ```sql
    SELECT nik, current_emp_code, current_emp_name, current_loc_code
    FROM dbo.hr_employee_current_snapshot
    WHERE nik = '1906041207910002';
    ```
  - Expected: `current_emp_code = 'A0966'`

### Snapshot Quality

- [ ] All distinct NIKs from HR_EMPLOYEE are represented
- [ ] Active employees (Status = '1') ranked higher than inactive
- [ ] Tiebreaker rules applied correctly: `UpdateDate DESC, CreateDate DESC, EmpCode DESC`
- [ ] Ambiguous NIKs (multiple active rows) are marked with `is_ambiguous = 1`
- [ ] `ambiguity_reason` field populated for ambiguous cases

### History Tracking

- [ ] `employee_code_history` contains all historical employee code assignments
- [ ] `is_current = 1` flag correctly identifies current assignments
- [ ] `source_table` field indicates source (e.g., `db_ptrj.dbo.HR_EMPLOYEE`)

---

## Resolution Cascade

### Status Types

The resolution cascade assigns one of these statuses:

| Status | Description | Validation |
|--------|-------------|------------|
| `MAPPED_CURRENT` | Code found, NIK found, current found | [ ] Correctly assigned |
| `PARSED_CODE_NOT_FOUND_IN_HR` | Parsed code not in HR_EMPLOYEE | [ ] Correctly assigned |
| `NIK_NOT_FOUND` | Parsed code found but no NewICNo | [ ] Correctly assigned |
| `NIK_DUPLICATE_AMBIGUOUS` | Multiple active rows for NIK | [ ] Correctly assigned |
| `CURRENT_EMP_NOT_FOUND` | NIK not in snapshot | [ ] Correctly assigned |

### Resolution Method

- [ ] `current_resolution_method` shows how resolution was performed
- [ ] `current_resolution_reason` explains the resolution logic

### Cascade Test Queries

```sql
-- Check resolution status distribution
SELECT current_resolution_status, COUNT(*) AS total
FROM dbo.zkteco_absensi_user_registry
WHERE current_resolution_status IS NOT NULL
GROUP BY current_resolution_status;
```

---

## Backfill

### Registry Backfill

- [ ] `backfill-current-empcode-registry.ts` script runs successfully
- [ ] All `zkteco_absensi_user_registry` records with `parsed_employee_code` are resolved
- [ ] `current_resolution_status` populated for all records
- [ ] `current_resolved_at` timestamp set

### Scan Logs Backfill

- [ ] `backfill-current-empcode-scan-logs.ts` script runs successfully
- [ ] `attendance_scan_logs` joined with registry for `current_emp_code`
- [ ] `resolved_nik` populated from registry join

### Imports Backfill

- [ ] `backfill-current-empcode-imports.ts` script runs successfully
- [ ] `attendance_imports.current_emp_code` populated from scan logs or registry

### Backfill Verification

```sql
-- Check backfill completeness
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN current_resolution_status IS NOT NULL THEN 1 ELSE 0 END) AS resolved
FROM dbo.zkteco_absensi_user_registry;
```

---

## API Endpoints

### Quality Dashboard Endpoints

- [ ] `GET /api/quality/current-empcode/summary`
  - Returns registry quality breakdown
  - Returns parsedCode -> currentEmpCode changes
  - Returns snapshot health stats

- [ ] `GET /api/quality/current-empcode/ambiguous`
  - Returns list of ambiguous NIKs
  - Includes active_count and ambiguity_reason

- [ ] `GET /api/quality/current-empcode/snapshot-status`
  - Returns snapshot count
  - Returns last sync timestamp
  - Calculates if stale (>24 hours by default)

- [ ] `GET /api/quality/current-empcode/changes`
  - Returns paginated list of code changes
  - Supports `limit` and `offset` parameters

### API Response Format

```json
{
  "success": true,
  "data": {
    "registryQuality": {
      "totalRegistry": 1234,
      "mappedCurrent": 1000,
      "parsedOnly": 200,
      "parsedCodeNotFound": 30,
      "nikNotFound": 4,
      "ambiguousNik": 0
    },
    "parsedCodeChanges": {
      "total": 50,
      "changes": [...]
    },
    "snapshotHealth": {
      "totalSnapshots": 1500,
      "ambiguousNik": 0,
      "lastSyncAt": "2026-06-23T10:00:00Z"
    }
  }
}
```

---

## Scheduler Integration

### Scheduled Jobs

- [ ] `sync-hr-current-snapshot` job configured in `schedule.json`
- [ ] Job runs on configured schedule (e.g., daily at 6 AM)
- [ ] Job logs show successful execution
- [ ] Job handles errors gracefully with retry logic

### Monitoring

- [ ] `GET /api/quality/current-empcode/snapshot-status?staleThreshold=24` returns correct stale status
- [ ] Alerts configured for stale snapshot (>24 hours without sync)

---

## Frontend Integration

### Attendance Display

- [ ] Attendance page shows both `parsedCode` and `currentEmpCode`
- [ ] Visual indicator when `parsedCode !== currentEmpCode`
- [ ] Tooltip explains the difference

### Employee Detail

- [ ] Employee detail shows code history timeline
- [ ] Current active code highlighted
- [ ] Historical codes with date ranges shown

### Quality Dashboard

- [ ] Quality dashboard shows currentEmpCode metrics
- [ ] Ambiguous NIK warnings displayed
- [ ] Resolution status breakdown chart

---

## Data Integrity

### Referential Integrity

- [ ] `hr_employee_current_snapshot.nik` matches `HR_EMPLOYEE.NewICNo`
- [ ] `zkteco_absensi_user_registry.resolved_nik` links to snapshot
- [ ] `attendance_imports.current_emp_code` links to `employees.employee_code`

### Consistency Checks

```sql
-- Verify parsedCode -> currentEmpCode relationship
SELECT TOP 10
  parsed_employee_code,
  current_emp_code,
  current_resolution_status
FROM dbo.zkteco_absensi_user_registry
WHERE parsed_employee_code <> current_emp_code
ORDER BY current_resolved_at DESC;

-- Check for orphaned resolved_nik (not in snapshot)
SELECT COUNT(*) AS orphaned_count
FROM dbo.zkteco_absensi_user_registry r
WHERE r.resolved_nik IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM dbo.hr_employee_current_snapshot s
    WHERE s.nik = r.resolved_nik
  );
```

---

## Performance

### Index Usage

- [ ] `IX_hr_current_snapshot_nik` used for NIK lookups
- [ ] `IX_hr_current_snapshot_current_emp_code` used for employee code lookups
- [ ] Query execution plans show index seeks, not scans

### Sync Performance

- [ ] Full HR sync completes within 5 minutes (for 5000+ employees)
- [ ] Incremental sync completes within 30 seconds
- [ ] Batch backfill processes 1000 records per batch

---

## Rollback Plan

### Manual Rollback Steps

If rollback is needed, run `sql/rollback-current-empcode.sql`:

1. [ ] Backup current data (automatic in rollback script)
2. [ ] Drop backfill data from all tables
3. [ ] Drop new tables (optional, may lose historical data)
4. [ ] Drop columns (optional, may break FK constraints)

### Verification

```sql
-- Verify rollback completed
SELECT TABLE_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME IN ('current_emp_code', 'resolved_nik');
-- Should show 0 rows for new columns
```

---

## Sign-off Checklist

### Developer

- [ ] All migrations applied successfully
- [ ] All backfill scripts completed
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code reviewed and approved

### QA

- [ ] Manual testing completed for all acceptance criteria
- [ ] Example NIK verification passed
- [ ] API endpoints tested
- [ ] Performance benchmarks met
- [ ] Bug reports filed (if any)

### Operations

- [ ] Scheduler configured and tested
- [ ] Monitoring alerts configured
- [ ] Rollback plan documented
- [ ] Production deployment planned

---

## Notes

- The `currentEmpCode` feature is backward-compatible - existing `parsed_employee_code` fields remain populated
- The system prioritizes `current_emp_code` when both are available
- Ambiguous NIKs are flagged but still resolved using tiebreaker rules
- HR sync should run at least daily to keep snapshot current
