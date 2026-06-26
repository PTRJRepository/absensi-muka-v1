USE rebinmas_absensi_monitoring;
GO

-- =============================================================================
-- User requirement: Map ZKTeco codes to HR_EMPLOYEE in DB_PTRJ (server 1)
-- NOT using IT API format or local employees table
-- =============================================================================

-- Step 1: Check if we can connect to DB_PTRJ (HR database)
-- This requires a linked server or direct connection

PRINT '=== Checking DB_PTRJ connection ===';

-- Check if HR_EMPLOYEE table exists in DB_PTRJ
-- For now, we'll create a local mapping table that syncs from DB_PTRJ

-- Create mapping table to link ZKTeco codes to HR_EMPLOYEE
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'hr_employee_mapping')
BEGIN
  CREATE TABLE hr_employee_mapping (
    id INT IDENTITY(1,1) PRIMARY KEY,
    zkteco_employee_code NVARCHAR(30) NOT NULL,
    hr_employee_id NVARCHAR(30) NOT NULL,
    hr_employee_name NVARCHAR(150) NOT NULL,
    hr_division_code NVARCHAR(20) NULL,
    hr_gang_code NVARCHAR(30) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_zkteco_code UNIQUE (zkteco_employee_code)
  );
  PRINT 'Created hr_employee_mapping table';
END
ELSE
  PRINT 'hr_employee_mapping table already exists';

-- Check if there are records
SELECT COUNT(*) as cnt FROM hr_employee_mapping;

GO
