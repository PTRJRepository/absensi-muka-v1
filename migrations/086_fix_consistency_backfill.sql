-- Migration 086: Fix data consistency bugs found 2026-06-28 audit
-- B3: backfill imports.raw_scan_log_id (44 NULL rows)
-- B2: backfill scan_map.resolution_status NULL (359 rows)
-- B1: backfill scan_time_wib NULL (rows where sync-orchestrator skipped timezone)

-- === B3: backfill raw_scan_log_id via scan_map JOIN ===
-- imports.link to scan_map by (current_emp_code, attendance_date)
UPDATE ai
SET ai.raw_scan_log_id = sm.scan_log_id
FROM attendance_imports ai
INNER JOIN scan_map sm
  ON sm.current_emp_code = ai.employee_code
  AND CAST(sm.resolved_at AS DATE) = ai.attendance_date
WHERE ai.raw_scan_log_id IS NULL
  AND sm.current_emp_code IS NOT NULL;

-- === B2: backfill scan_map.resolution_status NULL ===
-- fallback: map_status -> resolution_status (359 NULL rows)
UPDATE scan_map
SET resolution_status = map_status,
    resolution_method = COALESCE(resolution_method, 'backfill_086')
WHERE resolution_status IS NULL
  AND map_status IS NOT NULL;

-- === B1: backfill scan_time_wib + scan_time for NULL rows ===
-- raw_record_time = UTC asli, scan_time_wib = +7h (WIB)
-- frontend pakai raw_record_time + toLocale, jadi ini konsistensi kolom only
UPDATE attendance_raw
SET scan_time_wib = DATEADD(hour, 7, raw_record_time),
    scan_date_wib = DATEADD(hour, 7, raw_record_time),
    scan_time = CASE WHEN DATEDIFF(minute, raw_record_time, scan_time) = 0
                     THEN DATEADD(hour, 7, raw_record_time)
                     ELSE scan_time END,
    time_correction_status = CASE WHEN time_correction_status IS NULL
                                  THEN 'BACKFILL_086_WIB'
                                  ELSE time_correction_status END,
    time_correction_offset_minutes = CASE WHEN time_correction_offset_minutes IS NULL
                                          THEN 420
                                          ELSE time_correction_offset_minutes END
WHERE raw_record_time IS NOT NULL
  AND scan_time_wib IS NULL;
