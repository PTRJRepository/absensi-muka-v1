-- ============================================================
-- Step 1: Insert NEED_REVIEW → MANUAL_REVIEW (simple, works)
-- ============================================================

SET NOCOUNT ON;

PRINT 'Inserting NEED_REVIEW records...';

INSERT INTO attendance_imports (
  employee_id, employee_code, division_code,
  attendance_date, attendance_year, attendance_month,
  check_in_at, check_out_at,
  attendance_status, has_work,
  source, source_reference, batch_id, needs_manual_review, raw_scan_log_id
)
SELECT TOP 200
  0,
  'MANUAL_' + s.raw_device_user_id,
  'MANUAL_REVIEW',
  s.scan_date,
  YEAR(s.scan_date),
  MONTH(s.scan_date),
  MIN(s.scan_time),
  MAX(s.scan_time),
  CASE WHEN COUNT(*) >= 2 THEN 'HADIR' ELSE 'TIDAK_HADIR' END,
  CASE WHEN COUNT(*) >= 2 THEN 1 ELSE 0 END,
  'ZKTECO',
  s.machine_code,
  s.sync_batch_id,
  1,
  MIN(s.id)
FROM attendance_scan_logs s
WHERE s.mapping_status = 'NEED_REVIEW'
  AND NOT EXISTS (
    SELECT 1 FROM attendance_imports ai
    WHERE ai.employee_code = 'MANUAL_' + s.raw_device_user_id
      AND ai.attendance_date = s.scan_date
      AND ai.source_reference = s.machine_code
  )
GROUP BY s.raw_device_user_id, s.scan_date, s.machine_code, s.sync_batch_id;

PRINT 'NEED_REVIEW inserted: ' + CAST(@@ROWCOUNT AS VARCHAR);
GO
