/*
 * Migration: 053_create_attendance_imports
 * Purpose: Drop synonym, create attendance_imports table with currentEmpCode support
 * Date: 2026-06-23
 */

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'MIGRATION 053: Create attendance_imports table';
PRINT '============================================================';
PRINT '';

-- Step 1: Drop synonym if exists
PRINT 'Step 1: Dropping synonym...';
IF EXISTS (SELECT 1 FROM sys.synonyms WHERE name = 'attendance_imports')
BEGIN
  DROP SYNONYM dbo.attendance_imports;
  PRINT '  Dropped synonym: attendance_imports';
END
ELSE
BEGIN
  PRINT '  Synonym not found: attendance_imports';
END

-- Step 2: Create table if not exists
PRINT '';
PRINT 'Step 2: Creating table...';
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attendance_imports' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.attendance_imports (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NOT NULL,
    employee_code NVARCHAR(30) NOT NULL,
    division_code NVARCHAR(20) NOT NULL,
    gang_code NVARCHAR(30) NULL,
    attendance_date DATE NOT NULL,
    attendance_year INT NOT NULL,
    attendance_month INT NOT NULL,
    check_in_at DATETIME2 NULL,
    check_out_at DATETIME2 NULL,
    attendance_status NVARCHAR(30) NOT NULL DEFAULT 'NO_DATA',
    has_work BIT NOT NULL DEFAULT 0,
    is_leave BIT NOT NULL DEFAULT 0,
    is_sick BIT NOT NULL DEFAULT 0,
    is_holiday BIT NOT NULL DEFAULT 0,
    overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
    source NVARCHAR(40) NOT NULL,
    source_reference NVARCHAR(100) NULL,
    batch_id BIGINT NULL,
    raw_scan_log_id BIGINT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    -- NEW: currentEmpCode columns
    parsed_employee_code NVARCHAR(30) NULL,
    resolved_nik NVARCHAR(50) NULL,
    current_emp_code NVARCHAR(30) NULL,
    current_employee_id INT NULL,
    mapping_version NVARCHAR(50) NULL
  );
  PRINT '  Created table: attendance_imports';
END
ELSE
BEGIN
  PRINT '  Table already exists: attendance_imports';
END

-- Step 3: Add FK constraints (only if not exists)
PRINT '';
PRINT 'Step 3: Adding FK constraints...';

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_imp_employee')
BEGIN
  ALTER TABLE dbo.attendance_imports ADD CONSTRAINT fk_imp_employee FOREIGN KEY (employee_id) REFERENCES employees(id);
  PRINT '  Created FK: fk_imp_employee';
END
ELSE
BEGIN
  PRINT '  FK exists: fk_imp_employee';
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_imp_batch')
BEGIN
  ALTER TABLE dbo.attendance_imports ADD CONSTRAINT fk_imp_batch FOREIGN KEY (batch_id) REFERENCES attendance_import_batches(id);
  PRINT '  Created FK: fk_imp_batch';
END
ELSE
BEGIN
  PRINT '  FK exists: fk_imp_batch';
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_imp_scanlog')
BEGIN
  ALTER TABLE dbo.attendance_imports ADD CONSTRAINT fk_imp_scanlog FOREIGN KEY (raw_scan_log_id) REFERENCES attendance_scan_logs(id);
  PRINT '  Created FK: fk_imp_scanlog';
END
ELSE
BEGIN
  PRINT '  FK exists: fk_imp_scanlog';
END

-- Step 4: Add unique constraint
PRINT '';
PRINT 'Step 4: Adding unique constraint...';

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'uq_imp_emp_date')
BEGIN
  ALTER TABLE dbo.attendance_imports ADD CONSTRAINT uq_imp_emp_date UNIQUE (employee_code, attendance_date, source, source_reference);
  PRINT '  Created unique: uq_imp_emp_date';
END
ELSE
BEGIN
  PRINT '  Unique exists: uq_imp_emp_date';
END

-- Step 5: Create indexes
PRINT '';
PRINT 'Step 5: Creating indexes...';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_imp_employee_code' AND object_id = OBJECT_ID('dbo.attendance_imports'))
BEGIN
  CREATE INDEX IX_imp_employee_code ON dbo.attendance_imports(employee_code);
  PRINT '  Created: IX_imp_employee_code';
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_imp_attendance_date' AND object_id = OBJECT_ID('dbo.attendance_imports'))
BEGIN
  CREATE INDEX IX_imp_attendance_date ON dbo.attendance_imports(attendance_date);
  PRINT '  Created: IX_imp_attendance_date';
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_imp_current_emp_code' AND object_id = OBJECT_ID('dbo.attendance_imports'))
BEGIN
  CREATE INDEX IX_imp_current_emp_code ON dbo.attendance_imports(current_emp_code) WHERE current_emp_code IS NOT NULL;
  PRINT '  Created: IX_imp_current_emp_code';
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_imp_resolved_nik' AND object_id = OBJECT_ID('dbo.attendance_imports'))
BEGIN
  CREATE INDEX IX_imp_resolved_nik ON dbo.attendance_imports(resolved_nik) WHERE resolved_nik IS NOT NULL;
  PRINT '  Created: IX_imp_resolved_nik';
END

PRINT '';
PRINT '============================================================';
PRINT 'MIGRATION 053 COMPLETED';
PRINT '============================================================';
