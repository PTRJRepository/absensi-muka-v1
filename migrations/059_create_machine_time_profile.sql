CREATE TABLE attendance_machine_time_profile (
    profile_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    machine_code NVARCHAR(50) NOT NULL,
    timezone_mode NVARCHAR(30) NOT NULL,
    offset_minutes INT NOT NULL,
    valid_from DATETIME2 NOT NULL,
    valid_to DATETIME2 NULL,
    is_active BIT NOT NULL DEFAULT 1,
    evidence_note NVARCHAR(1000) NULL,
    verified_by NVARCHAR(100) NULL,
    verified_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
CREATE INDEX ix_time_profile_machine_active
    ON attendance_machine_time_profile(machine_code, is_active);
INSERT INTO attendance_machine_time_profile
    (machine_code, timezone_mode, offset_minutes, valid_from, is_active,
     evidence_note, verified_by, verified_at)
VALUES
    ('P1B', 'UTC_SOURCE', 420, '2026-06-01T00:00:00', 1,
     'scan_time jam 22-23 WIB saat operasional jam 05-06. Pattern konsisten menunjukkan UTC.',
     'SYSTEM_INVESTIGATION', SYSDATETIME());
INSERT INTO attendance_machine_time_profile
    (machine_code, timezone_mode, offset_minutes, valid_from, is_active,
     evidence_note, verified_by, verified_at)
SELECT machine_code, 'UNKNOWN', 0, '2026-06-01T00:00:00', 1,
       'Belum diinvestigasi timezone mode mesin ini', 'SYSTEM', SYSDATETIME()
FROM attendance_machines
WHERE machine_code != 'P1B'
  AND is_active = 1;
