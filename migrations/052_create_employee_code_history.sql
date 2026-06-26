/*
 * Migration: 052_create_employee_code_history
 * Purpose: Create Employee Code History table
 * Date: 2026-06-23
 */

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'MIGRATION 052: Create employee_code_history';
PRINT '============================================================';
PRINT '';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'employee_code_history' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.employee_code_history (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    nik NVARCHAR(50) NOT NULL,
    emp_code NVARCHAR(30) NOT NULL,
    emp_name NVARCHAR(150) NULL,
    loc_code NVARCHAR(20) NULL,
    hr_status NVARCHAR(20) NULL,
    create_date DATETIME2 NULL,
    update_date DATETIME2 NULL,
    is_current BIT NOT NULL DEFAULT 0,
    source_table NVARCHAR(100) NOT NULL DEFAULT 'db_ptrj.dbo.HR_EMPLOYEE',
    synced_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  PRINT 'Created table: employee_code_history';
END
ELSE
BEGIN
  PRINT 'Table already exists: employee_code_history';
END

-- Create indexes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employee_code_history_nik' AND object_id = OBJECT_ID('dbo.employee_code_history'))
BEGIN
  CREATE INDEX IX_employee_code_history_nik ON dbo.employee_code_history(nik);
  PRINT 'Created index: IX_employee_code_history_nik';
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employee_code_history_emp_code' AND object_id = OBJECT_ID('dbo.employee_code_history'))
BEGIN
  CREATE INDEX IX_employee_code_history_emp_code ON dbo.employee_code_history(emp_code);
  PRINT 'Created index: IX_employee_code_history_emp_code';
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employee_code_history_current' AND object_id = OBJECT_ID('dbo.employee_code_history'))
BEGIN
  CREATE INDEX IX_employee_code_history_current ON dbo.employee_code_history(nik, is_current) WHERE is_current = 1;
  PRINT 'Created index: IX_employee_code_history_current';
END

PRINT '';
PRINT '============================================================';
PRINT 'MIGRATION 052 COMPLETED';
PRINT '============================================================';
