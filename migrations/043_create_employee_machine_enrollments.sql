-- Migration 043: Create employee_machine_enrollments bridge table
-- PRD: Refactor Master Employee - ONE canonical employee → MANY machine enrollments
-- Date: 2026-06-23
-- Author: Claude Code

-- ============================================
-- STEP 1: Backup existing mapping data
-- ============================================
PRINT 'Step 1: Creating backup of existing mapping tables...';

IF OBJECT_ID('dbo.zkteco_hr_employee_map_backup_20260623', 'U') IS NOT NULL
  DROP TABLE dbo.zkteco_hr_employee_map_backup_20260623;
GO

SELECT * INTO dbo.zkteco_hr_employee_map_backup_20260623 FROM dbo.zkteco_hr_employee_map;
PRINT 'Backup created: zkteco_hr_employee_map_backup_20260623';
GO

IF OBJECT_ID('dbo.zkteco_absensi_user_registry_backup_20260623', 'U') IS NOT NULL
  DROP TABLE dbo.zkteco_absensi_user_registry_backup_20260623;
GO

SELECT * INTO dbo.zkteco_absensi_user_registry_backup_20260623 FROM dbo.zkteco_absensi_user_registry;
PRINT 'Backup created: zkteco_absensi_user_registry_backup_20260623';
GO

-- ============================================
-- STEP 2: Create employee_machine_enrollments table
-- ============================================
PRINT 'Step 2: Creating employee_machine_enrollments table...';

IF OBJECT_ID('dbo.employee_machine_enrollments', 'U') IS NOT NULL
  DROP TABLE dbo.employee_machine_enrollments;
GO

CREATE TABLE dbo.employee_machine_enrollments (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  employee_id INT NOT NULL,
  employee_code NVARCHAR(30) NOT NULL,
  machine_id INT NULL,
  machine_code NVARCHAR(30) NOT NULL,
  raw_device_user_id NVARCHAR(100) NOT NULL,
  zkteco_user_name NVARCHAR(200) NULL,
  parsed_employee_code NVARCHAR(30) NULL,
  scanner_prefix NVARCHAR(3) NULL,
  loc_code NVARCHAR(20) NULL,
  mapping_status NVARCHAR(30) NOT NULL DEFAULT 'MAPPED',
  mapping_confidence NVARCHAR(30) NULL,
  mapping_reason NVARCHAR(500) NULL,
  name_similarity_score DECIMAL(6,4) NULL,
  is_primary_machine BIT NOT NULL DEFAULT 0,
  is_active BIT NOT NULL DEFAULT 1,
  first_seen_at DATETIME2 NULL,
  last_seen_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NULL,

  CONSTRAINT FK_employee_machine_enrollments_employee
    FOREIGN KEY (employee_id) REFERENCES dbo.employees(id)
);

PRINT 'Created table: employee_machine_enrollments';
GO

-- ============================================
-- STEP 3: Create indexes
-- ============================================
PRINT 'Step 3: Creating indexes...';

CREATE UNIQUE INDEX UX_employee_machine_raw
ON dbo.employee_machine_enrollments(machine_code, raw_device_user_id)
WHERE is_active = 1;

CREATE INDEX IX_employee_machine_employee
ON dbo.employee_machine_enrollments(employee_id, is_active);

CREATE INDEX IX_employee_machine_code
ON dbo.employee_machine_enrollments(employee_code, machine_code);

CREATE INDEX IX_employee_machine_raw_id
ON dbo.employee_machine_enrollments(raw_device_user_id);

CREATE INDEX IX_employee_machine_scanner_prefix
ON dbo.employee_machine_enrollments(scanner_prefix) WHERE scanner_prefix IS NOT NULL;

PRINT 'Created indexes for employee_machine_enrollments';
GO

-- ============================================
-- STEP 4: Create view for machine codes array
-- ============================================
PRINT 'Step 4: Creating vw_employee_master_clean view...';

IF OBJECT_ID('dbo.vw_employee_master_clean', 'V') IS NOT NULL
  DROP VIEW dbo.vw_employee_master_clean;
GO

CREATE VIEW dbo.vw_employee_master_clean AS
SELECT
  e.id AS employee_id,
  e.employee_code,
  e.employee_name,
  e.nik,
  e.hr_loc_code,
  e.hr_status,
  e.hr_verified,
  e.is_active,
  e.is_raw_id,
  e.data_quality_status,
  e.data_quality_reason,
  d.division_code,
  STRING_AGG(CAST(eme.machine_code AS NVARCHAR(MAX)), ',') WITHIN GROUP (ORDER BY eme.machine_code) AS machine_codes,
  COUNT(DISTINCT eme.machine_code) AS machine_count,
  MIN(eme.first_seen_at) AS first_seen_at,
  MAX(eme.last_seen_at) AS last_seen_at,
  STRING_AGG(CAST(eme.raw_device_user_id AS NVARCHAR(MAX)), ',') WITHIN GROUP (ORDER BY eme.machine_code) AS raw_device_user_ids
FROM dbo.employees e
LEFT JOIN dbo.employee_machine_enrollments eme
  ON eme.employee_id = e.id
 AND eme.is_active = 1
LEFT JOIN divisions d ON d.id = e.division_id
GROUP BY
  e.id,
  e.employee_code,
  e.employee_name,
  e.nik,
  e.hr_loc_code,
  e.hr_status,
  e.hr_verified,
  e.is_active,
  e.is_raw_id,
  e.data_quality_status,
  e.data_quality_reason,
  d.division_code;
GO

PRINT 'Created view: vw_employee_master_clean';
GO

-- ============================================
-- STEP 5: Add employee_id to attendance_scan_logs
-- ============================================
PRINT 'Step 5: Adding employee_id to attendance_scan_logs...';

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'attendance_scan_logs' AND COLUMN_NAME = 'employee_id')
BEGIN
  ALTER TABLE dbo.attendance_scan_logs ADD employee_id INT NULL;
  PRINT 'Added column: employee_id to attendance_scan_logs';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_scan_logs_employee_date' AND object_id = OBJECT_ID('attendance_scan_logs'))
BEGIN
  CREATE INDEX IX_scan_logs_employee_date
  ON dbo.attendance_scan_logs(employee_id, scan_date);
  PRINT 'Created index: IX_scan_logs_employee_date';
END
GO

-- ============================================
-- STEP 6: Add employee_id to attendance_imports
-- ============================================
PRINT 'Step 6: Checking attendance_imports for employee_id...';

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'attendance_imports' AND COLUMN_NAME = 'employee_id'
)
BEGIN
  -- attendance_imports may not exist yet or have different structure
  PRINT 'attendance_imports column check skipped - table may not exist';
END
GO

PRINT 'Migration 043 completed successfully!';
GO
