USE rebinmas_absensi_monitoring;
GO

-- =============================================================================
-- Create missing tables for machines monitoring
-- =============================================================================

-- Create attendance_sync_logs table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'attendance_sync_logs')
BEGIN
  CREATE TABLE attendance_sync_logs (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    sync_type NVARCHAR(40) NOT NULL,
    source NVARCHAR(40) NOT NULL,
    machine_id INT NULL,
    machine_code NVARCHAR(30) NULL,
    division_code NVARCHAR(20) NULL,
    status NVARCHAR(30) NOT NULL,
    failure_category NVARCHAR(50) NULL,
    started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    finished_at DATETIME2 NULL,
    duration_ms INT NULL,
    records_synced INT NOT NULL DEFAULT 0,
    error_message NVARCHAR(1000) NULL,
    is_dry_run BIT NOT NULL DEFAULT 0,
    triggered_by INT NULL
  );
  PRINT 'Created attendance_sync_logs table';
END
ELSE
  PRINT 'attendance_sync_logs already exists';

-- Create machine_connection_logs table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'machine_connection_logs')
BEGIN
  CREATE TABLE machine_connection_logs (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    machine_id INT NOT NULL,
    machine_code NVARCHAR(30) NOT NULL,
    status NVARCHAR(30) NOT NULL,
    failure_category NVARCHAR(50) NULL,
    error_message NVARCHAR(1000) NULL,
    response_time_ms INT NULL,
    checked_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    checked_by INT NULL
  );
  PRINT 'Created machine_connection_logs table';
END
ELSE
  PRINT 'machine_connection_logs already exists';

GO
