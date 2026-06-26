-- Migration 042: Add NIK and HR fields to employees table
-- PRD: Refactor Master Employee - Canonical Employee Master
-- Date: 2026-06-23
-- Author: Claude Code

-- ============================================
-- STEP 1: Backup existing data
-- ============================================
PRINT 'Step 1: Creating backup...';

IF OBJECT_ID('dbo.employees_backup_20260623', 'U') IS NOT NULL
  DROP TABLE dbo.employees_backup_20260623;
GO

SELECT * INTO dbo.employees_backup_20260623 FROM dbo.employees;
PRINT 'Backup created: employees_backup_20260623 (' + CAST((SELECT COUNT(*) FROM dbo.employees_backup_20260623) AS VARCHAR) + ' rows)';
GO

-- ============================================
-- STEP 2: Add new columns
-- ============================================
PRINT 'Step 2: Adding new columns to employees...';

-- NIK from db_ptrj.HR_EMPLOYEE.NewICNo
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'nik')
BEGIN
  ALTER TABLE dbo.employees ADD nik NVARCHAR(30) NULL;
  PRINT 'Added column: nik';
END

-- HR source reference
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'hr_employee_code')
BEGIN
  ALTER TABLE dbo.employees ADD hr_employee_code NVARCHAR(50) NULL;
  PRINT 'Added column: hr_employee_code';
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'hr_loc_code')
BEGIN
  ALTER TABLE dbo.employees ADD hr_loc_code NVARCHAR(20) NULL;
  PRINT 'Added column: hr_loc_code';
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'hr_status')
BEGIN
  ALTER TABLE dbo.employees ADD hr_status NVARCHAR(20) NULL;
  PRINT 'Added column: hr_status';
END

-- HR verification flag
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'hr_verified')
BEGIN
  ALTER TABLE dbo.employees ADD hr_verified BIT NOT NULL DEFAULT 0;
  PRINT 'Added column: hr_verified';
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'hr_verified_at')
BEGIN
  ALTER TABLE dbo.employees ADD hr_verified_at DATETIME2 NULL;
  PRINT 'Added column: hr_verified_at';
END

-- Data quality tracking
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'data_quality_status')
BEGIN
  ALTER TABLE dbo.employees ADD data_quality_status NVARCHAR(30) NULL;
  PRINT 'Added column: data_quality_status';
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'data_quality_reason')
BEGIN
  ALTER TABLE dbo.employees ADD data_quality_reason NVARCHAR(500) NULL;
  PRINT 'Added column: data_quality_reason';
END

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'is_raw_id')
BEGIN
  ALTER TABLE dbo.employees ADD is_raw_id BIT NOT NULL DEFAULT 0;
  PRINT 'Added column: is_raw_id';
END

GO

-- ============================================
-- STEP 3: Sync NIK from db_ptrj
-- ============================================
PRINT 'Step 3: Syncing NIK from db_ptrj...';

UPDATE e
SET
  e.nik = LTRIM(RTRIM(REPLACE(hr.NewICNo, ' ', ''))),
  e.hr_employee_code = LTRIM(RTRIM(hr.EmpCode)),
  e.hr_loc_code = LTRIM(RTRIM(hr.LocCode)),
  e.hr_status = LTRIM(RTRIM(hr.Status)),
  e.hr_verified = 1,
  e.hr_verified_at = SYSUTCDATETIME()
FROM dbo.employees e
INNER JOIN [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE hr
  ON LTRIM(RTRIM(e.employee_code)) = LTRIM(RTRIM(hr.EmpCode));

PRINT 'Updated ' + CAST(@@ROWCOUNT AS VARCHAR) + ' employees with NIK from db_ptrj';
GO

-- ============================================
-- STEP 4: Mark raw ID employees
-- ============================================
PRINT 'Step 4: Marking raw ID employees...';

-- Mark short raw IDs (5 digits numeric only) - should be EXCLUDED
UPDATE e
SET
  e.is_raw_id = 1,
  e.data_quality_status = 'RAW_ID_SHORT',
  e.data_quality_reason = 'Short raw ID (5 digits) - should be EXCLUDED from auto-mapping per SSOT rules'
FROM dbo.employees e
WHERE e.employee_code LIKE '%[0-9]%'
  AND LEN(e.employee_code) = 5
  AND e.employee_code NOT LIKE '%[A-Z]%';

PRINT 'Marked ' + CAST(@@ROWCOUNT AS VARCHAR) + ' short raw ID employees';
GO

-- Mark long raw IDs (6+ digits) - need special handling
UPDATE e
SET
  e.is_raw_id = 1,
  e.data_quality_status = 'RAW_ID_LONG',
  e.data_quality_reason = 'Long raw ID (6+ digits) - needs direct lookup or parsing'
FROM dbo.employees e
WHERE e.employee_code LIKE '%[0-9]%'
  AND LEN(e.employee_code) >= 6
  AND e.employee_code NOT LIKE '%[A-Z]%';

PRINT 'Marked ' + CAST(@@ROWCOUNT AS VARCHAR) + ' long raw ID employees';
GO

-- ============================================
-- STEP 5: Create indexes
-- ============================================
PRINT 'Step 5: Creating indexes...';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employees_nik' AND object_id = OBJECT_ID('employees'))
BEGIN
  CREATE INDEX IX_employees_nik ON dbo.employees(nik) WHERE nik IS NOT NULL;
  PRINT 'Created index: IX_employees_nik';
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employees_hr_verified' AND object_id = OBJECT_ID('employees'))
BEGIN
  CREATE INDEX IX_employees_hr_verified ON dbo.employees(hr_verified, is_active);
  PRINT 'Created index: IX_employees_hr_verified';
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employees_is_raw_id' AND object_id = OBJECT_ID('employees'))
BEGIN
  CREATE INDEX IX_employees_is_raw_id ON dbo.employees(is_raw_id) WHERE is_raw_id = 1;
  PRINT 'Created index: IX_employees_is_raw_id';
END

GO

-- ============================================
-- STEP 6: Create employee_hr_sync_audit table
-- ============================================
PRINT 'Step 6: Creating audit table...';

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'employee_hr_sync_audit')
BEGIN
  CREATE TABLE dbo.employee_hr_sync_audit (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    sync_batch_id NVARCHAR(100) NOT NULL,
    employee_code NVARCHAR(30) NOT NULL,
    action_type NVARCHAR(30) NOT NULL,
    old_value NVARCHAR(MAX) NULL,
    new_value NVARCHAR(MAX) NULL,
    sync_status NVARCHAR(30) NOT NULL,
    sync_reason NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_employee_hr_sync_audit_batch ON dbo.employee_hr_sync_audit(sync_batch_id);
  CREATE INDEX IX_employee_hr_sync_audit_code ON dbo.employee_hr_sync_audit(employee_code);

  PRINT 'Created table: employee_hr_sync_audit';
END

GO

PRINT 'Migration 042 completed successfully!';
GO
