ALTER TABLE attendance_machines ADD
    timezone_mode NVARCHAR(30) NULL,
    timezone_offset_minutes INT NULL,
    clock_status NVARCHAR(30) NULL,
    clock_drift_minutes INT NULL,
    last_clock_checked_at DATETIME2 NULL,
    clock_note NVARCHAR(500) NULL;
GO
UPDATE m
SET
    m.timezone_mode = p.timezone_mode,
    m.timezone_offset_minutes = p.offset_minutes,
    m.clock_status = CASE p.timezone_mode
        WHEN 'UTC_SOURCE' THEN 'UTC_MODE'
        WHEN 'WIB_SOURCE' THEN 'OK'
        WHEN 'UNKNOWN' THEN 'UNKNOWN'
        ELSE 'NEEDS_MANUAL_CHECK'
    END,
    m.last_clock_checked_at = p.verified_at,
    m.clock_note = p.evidence_note
FROM attendance_machines m
JOIN attendance_machine_time_profile p ON p.machine_code = m.machine_code
WHERE p.is_active = 1;
