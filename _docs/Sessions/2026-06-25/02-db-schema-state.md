# DB Schema State After Recovery

## Row Counts

| Table | Rows | Notes |
|-------|------|-------|
| attendance_scan_logs | 789,314 | Restored + timezone-corrected |
| attendance_imports | 38,604 | Rebuilt, all 10 divisions |
| employees | 8,005 | Restored + enriched |
| attendance_machines | 16 | Restored |
| machine_user_raw | 1,228 | Pre-existing |
| attendance_import_batches | 257 | Restored + dummy FK rows |
| attendance_scan_logs_backup_20260623_233022 | 788,915 | Source of truth |

## attendance_scan_logs Schema (live)

All 34 columns:
id, machine_id, machine_code, raw_device_user_id, raw_user_sn, raw_record_time, raw_ip,
parsed_employee_code, parsed_division_code, mapping_status, mapping_reason,
scan_time (WIB-corrected), scan_date (WIB-corrected),
event_type, verify_type, work_code, sync_batch_id, created_at,
scan_time_original, scan_date_original, scan_time_wib, scan_date_wib,
time_correction_status (CORRECTED_UTC_TO_WIB), time_correction_offset_minutes (420), time_corrected_at,
current_emp_code, current_employee_id, current_mapping_status, current_resolved_at,
zkteco_user_name, zkteco_user_name_source (MACHINE_USER_RAW / ATTENDANCE_RECORD),
zkteco_user_name_sync_status (FILLED / NO_RAW_USER), zkteco_user_name_synced_at

## machine_user_raw Schema (live)

Columns: machine_user_raw_id (bigint PK), import_batch_id, machine_id (int FK), machine_uid, machine_user_id, user_name, role, card_no, password_exists, raw_payload, imported_at, first_seen_at, last_seen_at, machine_raw_user_name

CRITICAL: NO machine_code column. Join via machine_id (INT) to attendance_machines.id.

## attendance_machine_time_profile Schema (live)

Columns: profile_id (bigint PK), machine_code (nvarchar), timezone_mode (UTC_SOURCE / WIB_SOURCE), offset_minutes (420 for UTC_SOURCE), valid_from, valid_to, is_active, evidence_note (NOT notes), verified_by, verified_at, created_at

CRITICAL: NO machine_id column. Join via machine_code to attendance_machines.machine_code.

## attendance_import_batches Schema (live)

Dummy rows were inserted for all missing batch IDs during Phase 3 fix. These have batch_code = RECOVERY_BATCH_{id}, source = RECOVERY, status = RECOVERED.

## employees Schema (live)

9 base columns: id, employee_code, employee_name, division_id, gang_id, employment_status, is_active, created_at, updated_at

Plus enriched columns from backup: nik, current_emp_code, current_emp_name, hr_employee_code, hr_loc_code, hr_status, raw_device_user_id, zkteco_user_name, parsed_division_code, mapping_status, mapping_reason, current_resolution_status, current_resolution_method, current_resolution_reason, current_hr_loc_code, current_hr_create_date, current_hr_update_date, current_resolved_at, resolved_nik, scan_count, first_seen_at, last_seen_at, raw_id_length, id_category, hr_verified, hr_verified_at, data_quality_status, data_quality_reason
