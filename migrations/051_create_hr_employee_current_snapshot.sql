/*
 * Migration: 051_create_hr_employee_current_snapshot
 * Purpose: Create HR Employee Current Snapshot table
 * Date: 2026-06-23
 */

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'MIGRATION 051: Create hr_employee_current_snapshot';
PRINT '============================================================';
PRINT '';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hr_employee_current_snapshot' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.hr_employee_current_snapshot (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    nik NVARCHAR(50) NOT NULL,
    current_emp_code NVARCHAR(30) NOT NULL,
    current_emp_name NVARCHAR(150) NULL,
    current_loc_code NVARCHAR(20) NULL,
    current_status NVARCHAR(20) NULL,
    current_create_date DATETIME2 NULL,
    current_update_date DATETIME2 NULL,
    active_count INT NOT NULL DEFAULT 0,
    row_count INT NOT NULL DEFAULT 0,
    is_ambiguous BIT NOT NULL DEFAULT 0,
    ambiguity_reason NVARCHAR(500) NULL,
    synced_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  PRINT 'Created table: hr_employee_current_snapshot';
END
ELSE
BEGIN
  PRINT 'Table already exists: hr_employee_current_snapshot';
END

-- Create indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_hr_current_snapshot_nik' AND object_id = OBJECT_ID('dbo.hr_employee_current_snapshot'))
BEGIN
  CREATE INDEX IX_hr_current_snapshot_nik ON dbo.hr_employee_current_snapshot(nik);
  PRINT 'Created index: IX_hr_current_snapshot_nik';
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_hr_current_snapshot_current_emp_code' AND object_id = OBJECT_ID('dbo.hr_employee_current_snapshot'))
BEGIN
  CREATE INDEX IX_hr_current_snapshot_current_emp_code ON dbo.hr_employee_current_snapshot(current_emp_code);
  PRINT 'Created index: IX_hr_current_snapshot_current_emp_code';
END

PRINT '';
PRINT '============================================================';
PRINT 'MIGRATION 051 COMPLETED';
PRINT '============================================================';
