-- Migration 083: Remove short id (<=5 digit) from attendance_imports (mode database = processed only)
-- Per user: short id = mode mesin (raw only), NOT mode database (processed).
-- SSOT parser rule: id <=5 digit EXCLUDED. But rebuild-attendance-imports NEED_REVIEW path
-- inserted MANUAL_<raw_id> for these — should not be in imports.
-- Affected: 5 rows (raw len 2 & 5: MANUAL_10, MANUAL_50127, MANUAL_50145)

DELETE FROM attendance_imports
WHERE employee_code LIKE 'MANUAL_%'
  AND raw_scan_log_id IN (
    SELECT id FROM attendance_raw
    WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) <= 5
  );
GO

-- Verify
SELECT COUNT(*) AS remaining_manual_short FROM attendance_imports ai
JOIN attendance_raw r ON r.id = ai.raw_scan_log_id
WHERE ai.employee_code LIKE 'MANUAL_%' AND LEN(LTRIM(RTRIM(r.raw_device_user_id))) <= 5;
GO
-- should be 0
