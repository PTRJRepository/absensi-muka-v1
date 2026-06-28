# Migration Script Fixes Applied

## Files Updated

### 064 (Phase 1 - Discovery)
- Changed: sys.tables query instead of INFORMATION_SCHEMA.TABLES (TABLE_ROWS column doesnt exist)
- Changed: JOIN machine_user_raw on machine_id not machine_code
- Changed: attendance_machines PK is id not machine_id
- Added: IF OBJECT_ID() guards + sp_executesql dynamic SQL for non-existent tables

### 066 (Phase 3 - Restore Scan Logs)
- Added: FK fix step -- insert dummy attendance_import_batches rows for missing sync_batch_id values BEFORE INSERT

### 067 (Phase 4 - Schema Setup)
- Changed: CREATE INDEX skips if machine_code column missing (COL_LENGTH() guard)
- Changed: attendance_machine_time_profile INSERT uses evidence_note not notes, profile_id not id

### 068 (Phase 5-8 - Enrich + Rebuild)
- Changed: r.id -> r.machine_user_raw_id in LEFT JOIN

### 069 (Phase 9 - Backend Hardening)
- Changed: attendance_machine_time_profile uses machine_code join not machine_id
- Changed: INSERT uses evidence_note not notes
- Changed: profile_id not id

## Key DB Schema Discoveries

1. machine_user_raw has NO machine_code column -- join via machine_id (INT) to attendance_machines.id
2. attendance_machine_time_profile has NO machine_id column -- join via machine_code (NVARCHAR) to attendance_machines.machine_code
3. attendance_machines PK is id (INT), not machine_id
4. attendance_scan_logs FK to attendance_import_batches can block INSERT if batch_id missing

## Migration Runners Created

- src/scripts/run-emergency-recovery.ts -- runs all 9 phases (063-071)
- src/scripts/run-emergency-recovery-phase4.ts -- runs Phase 4-11 only (for re-runs after Phase 3 completes)

## Runner Behavior

Both runners:
- Load .env for DB connection
- Split SQL by GO separator (SSMS batch syntax)
- Split CREATE VIEW/PROC/FUNCTION into separate batches
- Handle timeouts (10min per batch for long operations)
- Stop on first failure, safe to re-run (idempotent phases)
- Show progress + elapsed time per phase
