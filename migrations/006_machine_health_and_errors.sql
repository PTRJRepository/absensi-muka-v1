-- Migration 006: Machine Health Checks, Import Errors, and Deduplication
-- Created: 2026-06-15
-- Purpose: Add tables for machine health monitoring and import error tracking

USE rebinmas_absensi_monitoring;
GO

-- ============================================
-- Table 1: machine_health_checks
-- Tracks health check results for each machine
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'machine_health_checks')
BEGIN
    CREATE TABLE machine_health_checks (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        machine_id INT NOT NULL,
        machine_code NVARCHAR(50) NOT NULL,
        checked_at DATETIME NOT NULL DEFAULT GETDATE(),
        ping_ok BIT NULL,
        tcp_ok BIT NULL,
        zk_ok BIT NULL,
        latency_ms INT NULL,
        error_code NVARCHAR(100) NULL,
        error_message NVARCHAR(1000) NULL,
        CONSTRAINT FK_machine_health_checks_machine
            FOREIGN KEY (machine_id) REFERENCES attendance_machines(machine_id)
    );

    PRINT 'Created table: machine_health_checks';
END
ELSE
BEGIN
    PRINT 'Table already exists: machine_health_checks';
END
GO

-- ============================================
-- Table 2: attendance_import_errors
-- Tracks errors during import process
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'attendance_import_errors')
BEGIN
    CREATE TABLE attendance_import_errors (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        batch_id BIGINT NOT NULL,
        raw_data NVARCHAR(MAX) NULL,
        error_type NVARCHAR(50) NOT NULL,
        error_message NVARCHAR(MAX) NULL,
        created_at DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_attendance_import_errors_batch
            FOREIGN KEY (batch_id) REFERENCES attendance_import_batches(batch_id)
    );

    PRINT 'Created table: attendance_import_errors';
END
ELSE
BEGIN
    PRINT 'Table already exists: attendance_import_errors';
END
GO

-- ============================================
-- Table 3: machine_connection_logs
-- Logs connection attempts for troubleshooting
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'machine_connection_logs')
BEGIN
    CREATE TABLE machine_connection_logs (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        machine_id INT NOT NULL,
        machine_code NVARCHAR(50) NOT NULL,
        attempted_at DATETIME NOT NULL DEFAULT GETDATE(),
        success BIT NOT NULL,
        error_code NVARCHAR(100) NULL,
        error_message NVARCHAR(1000) NULL,
        duration_ms INT NULL,
        CONSTRAINT FK_machine_connection_logs_machine
            FOREIGN KEY (machine_id) REFERENCES attendance_machines(machine_id)
    );

    PRINT 'Created table: machine_connection_logs';
END
ELSE
BEGIN
    PRINT 'Table already exists: machine_connection_logs';
END
GO

-- ============================================
-- Index 1: Deduplication index for attendance_scan_logs
-- Prevents duplicate attendance records
-- ============================================
IF NOT EXISTS (
    SELECT * FROM sys.indexes
    WHERE name = 'UX_attendance_scan_logs_dedupe'
    AND object_id = OBJECT_ID('attendance_scan_logs')
)
BEGIN
    -- First, clean up existing duplicates if any
    -- This is commented out for safety - uncomment if needed
    /*
    ;WITH DuplicateRecords AS (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY machine_code, raw_device_user_id, raw_record_time
                ORDER BY id
            ) AS RowNum
        FROM attendance_scan_logs
    )
    DELETE FROM DuplicateRecords WHERE RowNum > 1;
    */

    -- Create unique index
    CREATE UNIQUE INDEX UX_attendance_scan_logs_dedupe
    ON attendance_scan_logs(machine_code, raw_device_user_id, raw_record_time)
    WHERE machine_code IS NOT NULL
      AND raw_device_user_id IS NOT NULL
      AND raw_record_time IS NOT NULL;

    PRINT 'Created index: UX_attendance_scan_logs_dedupe';
END
ELSE
BEGIN
    PRINT 'Index already exists: UX_attendance_scan_logs_dedupe';
END
GO

-- ============================================
-- Index 2: Performance index for health checks
-- ============================================
IF NOT EXISTS (
    SELECT * FROM sys.indexes
    WHERE name = 'IX_machine_health_checks_machine_checked'
    AND object_id = OBJECT_ID('machine_health_checks')
)
BEGIN
    CREATE INDEX IX_machine_health_checks_machine_checked
    ON machine_health_checks(machine_id, checked_at DESC);

    PRINT 'Created index: IX_machine_health_checks_machine_checked';
END
ELSE
BEGIN
    PRINT 'Index already exists: IX_machine_health_checks_machine_checked';
END
GO

-- ============================================
-- Index 3: Performance index for import errors
-- ============================================
IF NOT EXISTS (
    SELECT * FROM sys.indexes
    WHERE name = 'IX_attendance_import_errors_batch'
    AND object_id = OBJECT_ID('attendance_import_errors')
)
BEGIN
    CREATE INDEX IX_attendance_import_errors_batch
    ON attendance_import_errors(batch_id);

    PRINT 'Created index: IX_attendance_import_errors_batch';
END
ELSE
BEGIN
    PRINT 'Index already exists: IX_attendance_import_errors_batch';
END
GO

-- ============================================
-- Index 4: Performance index for connection logs
-- ============================================
IF NOT EXISTS (
    SELECT * FROM sys.indexes
    WHERE name = 'IX_machine_connection_logs_machine_attempted'
    AND object_id = OBJECT_ID('machine_connection_logs')
)
BEGIN
    CREATE INDEX IX_machine_connection_logs_machine_attempted
    ON machine_connection_logs(machine_id, attempted_at DESC);

    PRINT 'Created index: IX_machine_connection_logs_machine_attempted';
END
ELSE
BEGIN
    PRINT 'Index already exists: IX_machine_connection_logs_machine_attempted';
END
GO

PRINT '';
PRINT '============================================';
PRINT 'Migration 006 completed successfully';
PRINT 'Tables created: machine_health_checks, attendance_import_errors, machine_connection_logs';
PRINT 'Indexes created: deduplication and performance indexes';
PRINT '============================================';
GO
