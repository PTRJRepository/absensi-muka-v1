# Implementation Plan — Emergency Recovery and Pipeline Rebuild

This plan outlines the step-by-step procedure to execute the emergency database recovery and pipeline rebuild according to the PRD.

## Phase 0: Emergency Freeze and Current State Backup
- [x] Confirm scheduler is disabled in `src/config/schedule.json` (currently set to `"enabled": false`).
- [ ] Stop any running backend processes.
- [ ] Create backup tables of current state (even if empty):
  - `attendance_scan_logs_state_before_recovery_20260625`
  - `attendance_imports_state_before_recovery_20260625`
  - `employees_state_before_recovery_20260625`
  - `attendance_machines_state_before_recovery_20260625`

## Phase 1: Database Restores
- [ ] Restore `attendance_machines` from `attendance_machines_backup_20260623` if any rows are missing, or verify current 16 rows.
- [ ] Restore `employees` from `employees_backup_20260623` (3,761 rows).
- [ ] Restore `attendance_scan_logs` from `attendance_scan_logs_backup_20260623_233022` (788,915 rows).
- [ ] Create or check table `machine_user_raw` (primary key: `machine_user_raw_id`). Add indexes if missing.
- [ ] Create `attendance_recovery_audit_log` table for logging recovery events.

## Phase 2: Backend Code Patches
- [ ] Patch `src/modules/import/sync-orchestrator.service.ts`:
  - Ensure correct sync order: `connect` -> `disableDevice` -> `getUsers` (to `machine_user_raw`) -> `getAttendances` (to `attendance_scan_logs`) -> `enrichAttendanceUserNames` -> `rebuildAttendanceImports` -> `enableDevice` -> `disconnect`.
  - Fix the bug where `@batchId` is used in SQL queries but not passed as an input parameter.
  - Fix column mapping errors (e.g. `r.id` vs `r.machine_user_raw_id` for `machine_user_raw` table).
- [ ] Patch timezone helper/code in backend to always store/process new scans as WIB instead of UTC.
- [ ] Patch attendance import rebuild logic to remove G-employee-only filters and process all divisions: A, B, C, D, E, F, G, H, J, L.

## Phase 3: Timezone Correction & Metadata Backfills (Database Operations)
- [ ] Apply metadata columns for name syncing: `zkteco_user_name`, `zkteco_user_name_source`, `zkteco_user_name_synced_at`, `zkteco_user_name_sync_status`.
- [ ] Backfill `zkteco_user_name` from `machine_user_raw` to `attendance_scan_logs`.
- [ ] Flag `NO_RAW_USER` or `CONFLICT` for name mismatch.
- [ ] Add timezone correction columns if missing.
- [ ] Run UTC -> WIB correction on restored historical `attendance_scan_logs` records (adjusting `scan_time` and `scan_date` by +7 hours).

## Phase 4: Rebuild Attendance Imports
- [ ] Delete existing records in `attendance_imports`.
- [ ] Rebuild `attendance_imports` from corrected `attendance_scan_logs` for all mapped employees across all divisions.
- [ ] Validate imported division distribution and row counts.

## Phase 5: Verification & Validation
- [ ] Validate sample B0193 timezone conversion and daily scans.
- [ ] Test monthly matrix and daily attendance API endpoints.
- [ ] Validate frontend page load and matrix displaying.
- [ ] Re-enable scheduler.
