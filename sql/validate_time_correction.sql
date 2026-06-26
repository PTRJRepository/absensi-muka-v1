-- Machine Clock Correction - Acceptance Criteria Validation Queries
-- Run after applying time corrections to validate correctness

-- AC-001: Data Original Aman (must return 0)
SELECT COUNT(*) AS violation_count,
       'AC-001: CORRECTED records missing scan_time_original' AS check_name
FROM attendance_scan_logs
WHERE time_correction_status = 'CORRECTED'
  AND scan_time_original IS NULL;

-- AC-002: Offset verification for P1B (should show +420 min offset)
SELECT TOP 5
    id, machine_code, raw_device_user_id,
    scan_time_original AS old_scan_time,
    scan_time AS new_scan_time,
    DATEDIFF(MINUTE, scan_time_original, scan_time) AS offset_applied_min,
    'AC-002: Offset verification' AS check_name
FROM attendance_scan_logs
WHERE machine_code = 'P1B'
  AND time_correction_status = 'CORRECTED'
  AND scan_time_original IS NOT NULL
ORDER BY id;

-- AC-003: scan_date must match scan_time after correction (must return 0)
SELECT COUNT(*) AS violation_count,
       'AC-003: scan_date/scan_time mismatch' AS check_name
FROM attendance_scan_logs
WHERE time_correction_status = 'CORRECTED'
  AND CAST(scan_time AS DATE) <> scan_date;

-- AC-004: attendance_imports shows correct WIB times
SELECT TOP 10
    employee_code, attendance_date,
    FORMAT(check_in_at, 'HH:mm:ss') AS check_in_time,
    FORMAT(check_out_at, 'HH:mm:ss') AS check_out_time,
    attendance_status, scan_count,
    'AC-004: attendance_imports time check' AS check_name
FROM attendance_imports
WHERE machine_code = 'P1B'
  AND attendance_date BETWEEN '2026-06-01' AND '2026-06-30'
  AND source = 'ZKTECO'
ORDER BY employee_code, attendance_date;

-- AC-005: No duplicate collisions after correction (must return 0 rows)
SELECT
    machine_code, raw_device_user_id,
    FORMAT(scan_time, 'yyyy-MM-dd HH:mm:ss') AS scan_time,
    COUNT(*) AS duplicate_count,
    'AC-005: Duplicate collision check' AS check_name
FROM attendance_scan_logs
WHERE time_correction_status = 'CORRECTED'
GROUP BY machine_code, raw_device_user_id, scan_time
HAVING COUNT(*) > 1;

-- AC-006: Batch audit trail
SELECT
    COUNT(*) AS total_batches,
    SUM(applied_count) AS total_corrected,
    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_batches,
    'AC-006: Batch audit trail' AS check_name
FROM attendance_time_correction_batch;

-- AC-007: Future sync status distribution
SELECT
    time_correction_status, COUNT(*) AS cnt,
    'AC-007: Future sync status' AS check_name
FROM attendance_scan_logs
WHERE time_correction_status IS NOT NULL
GROUP BY time_correction_status
ORDER BY cnt DESC;
