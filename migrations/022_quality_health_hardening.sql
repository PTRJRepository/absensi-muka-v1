USE rebinmas_absensi_monitoring;
GO

PRINT 'Applying quality and health hardening structures...';
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'machine_health_snapshots')
BEGIN
  CREATE TABLE machine_health_snapshots (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    machine_id INT NULL,
    machine_code NVARCHAR(30) NOT NULL,
    snapshot_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    operational_status NVARCHAR(30) NOT NULL,
    access_status NVARCHAR(40) NULL,
    scan_count_1h INT NOT NULL DEFAULT 0,
    scan_count_today INT NOT NULL DEFAULT 0,
    mapped_count_7d INT NOT NULL DEFAULT 0,
    unmapped_count_7d INT NOT NULL DEFAULT 0,
    duplicate_count_7d INT NOT NULL DEFAULT 0,
    failed_batch_count_7d INT NOT NULL DEFAULT 0,
    quality_score INT NOT NULL DEFAULT 0,
    notes NVARCHAR(1000) NULL,
    CONSTRAINT FK_machine_health_snapshots_machine
      FOREIGN KEY (machine_id) REFERENCES attendance_machines(id)
  );
  PRINT 'Created machine_health_snapshots';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_machine_health_snapshots_machine_time'
    AND object_id = OBJECT_ID('machine_health_snapshots')
)
BEGIN
  CREATE INDEX IX_machine_health_snapshots_machine_time
    ON machine_health_snapshots(machine_code, snapshot_at DESC)
    INCLUDE (operational_status, quality_score, scan_count_today);
  PRINT 'Created IX_machine_health_snapshots_machine_time';
END
GO

IF OBJECT_ID('zkteco_hr_employee_map', 'U') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_zkteco_hr_map_machine_status'
    AND object_id = OBJECT_ID('zkteco_hr_employee_map')
)
BEGIN
  CREATE INDEX IX_zkteco_hr_map_machine_status
    ON zkteco_hr_employee_map(machine_code, is_active, match_confidence)
    INCLUDE (zkteco_user_id, hr_employee_code, hr_employee_name);
  PRINT 'Created IX_zkteco_hr_map_machine_status';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_import_batches_status_started'
    AND object_id = OBJECT_ID('attendance_import_batches')
)
BEGIN
  CREATE INDEX IX_import_batches_status_started
    ON attendance_import_batches(status, started_at DESC)
    INCLUDE (machine_id, records_total, records_success, records_failed);
  PRINT 'Created IX_import_batches_status_started';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_change_logs_action_time'
    AND object_id = OBJECT_ID('attendance_change_logs')
)
BEGIN
  CREATE INDEX IX_change_logs_action_time
    ON attendance_change_logs(action_type, changed_at DESC)
    INCLUDE (entity_type, entity_id, employee_code, changed_by);
  PRINT 'Created IX_change_logs_action_time';
END
GO

PRINT 'Quality score formula: mapped_rate*0.50 + sync_success_rate*0.25 + online_rate*0.15 + non_duplicate_rate*0.10.';
PRINT 'Quality and health hardening structures ready.';
GO
