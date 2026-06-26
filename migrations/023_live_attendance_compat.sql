USE rebinmas_absensi_monitoring;
GO

-- Compatibility hardening for live deployments where the processed import table
-- was preserved as attendance_imports_old during refactor.
IF OBJECT_ID('dbo.attendance_imports', 'U') IS NULL
   AND OBJECT_ID('dbo.attendance_imports', 'SN') IS NULL
   AND OBJECT_ID('dbo.attendance_imports_old', 'U') IS NOT NULL
BEGIN
  CREATE SYNONYM dbo.attendance_imports FOR dbo.attendance_imports_old;
  PRINT 'Created synonym dbo.attendance_imports -> dbo.attendance_imports_old';
END
ELSE
BEGIN
  PRINT 'dbo.attendance_imports already exists or no legacy table found';
END
GO

IF OBJECT_ID('dbo.attendance_manual_corrections', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.attendance_manual_corrections (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NOT NULL,
    employee_code NVARCHAR(30) NOT NULL,
    division_code NVARCHAR(20) NOT NULL,
    gang_code NVARCHAR(30) NULL,
    attendance_date DATE NOT NULL,
    attendance_status NVARCHAR(30) NOT NULL,
    check_in_at DATETIME2 NULL,
    check_out_at DATETIME2 NULL,
    has_work BIT NOT NULL DEFAULT 0,
    is_leave BIT NOT NULL DEFAULT 0,
    is_sick BIT NOT NULL DEFAULT 0,
    is_holiday BIT NOT NULL DEFAULT 0,
    overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
    reason NVARCHAR(500) NOT NULL,
    is_deleted BIT NOT NULL DEFAULT 0,
    created_by INT NULL,
    updated_by INT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NULL,
    CONSTRAINT uq_manual_correction UNIQUE (employee_code, attendance_date)
  );
  PRINT 'Created dbo.attendance_manual_corrections';
END
ELSE
BEGIN
  PRINT 'dbo.attendance_manual_corrections already exists';
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_attendance_manual_corrections_employee_date_active'
    AND object_id = OBJECT_ID('dbo.attendance_manual_corrections', 'U')
)
BEGIN
  CREATE INDEX IX_attendance_manual_corrections_employee_date_active
    ON dbo.attendance_manual_corrections(employee_code, attendance_date, is_deleted);
  PRINT 'Created IX_attendance_manual_corrections_employee_date_active';
END
GO

IF OBJECT_ID('dbo.attendance_sync_logs', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.attendance_sync_logs', 'machine_id') IS NULL
BEGIN
  ALTER TABLE dbo.attendance_sync_logs ADD machine_id INT NULL;
  PRINT 'Added attendance_sync_logs.machine_id';
END
GO

IF OBJECT_ID('dbo.attendance_sync_logs', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.attendance_sync_logs', 'machine_code') IS NULL
BEGIN
  ALTER TABLE dbo.attendance_sync_logs ADD machine_code NVARCHAR(30) NULL;
  PRINT 'Added attendance_sync_logs.machine_code';
END
GO

IF OBJECT_ID('dbo.attendance_sync_logs', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.attendance_sync_logs', 'division_code') IS NULL
BEGIN
  ALTER TABLE dbo.attendance_sync_logs ADD division_code NVARCHAR(20) NULL;
  PRINT 'Added attendance_sync_logs.division_code';
END
GO

IF OBJECT_ID('dbo.attendance_sync_logs', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.attendance_sync_logs', 'failure_category') IS NULL
BEGIN
  ALTER TABLE dbo.attendance_sync_logs ADD failure_category NVARCHAR(50) NULL;
  PRINT 'Added attendance_sync_logs.failure_category';
END
GO

IF OBJECT_ID('dbo.attendance_sync_logs', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.attendance_sync_logs', 'is_dry_run') IS NULL
BEGIN
  ALTER TABLE dbo.attendance_sync_logs
    ADD is_dry_run BIT NOT NULL
      CONSTRAINT DF_attendance_sync_logs_is_dry_run DEFAULT 0;
  PRINT 'Added attendance_sync_logs.is_dry_run';
END
GO

IF OBJECT_ID('dbo.attendance_sync_logs', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.attendance_sync_logs', 'triggered_by') IS NULL
BEGIN
  ALTER TABLE dbo.attendance_sync_logs ADD triggered_by INT NULL;
  PRINT 'Added attendance_sync_logs.triggered_by';
END
GO

CREATE OR ALTER VIEW dbo.vw_attendance_monthly_matrix AS
WITH calendar AS (
  SELECT DISTINCT CAST(attendance_date AS DATE) AS attendance_date
  FROM dbo.attendance_imports
  UNION
  SELECT DISTINCT CAST(scan_date AS DATE) AS attendance_date
  FROM dbo.attendance_scan_logs
  UNION
  SELECT DISTINCT CAST(attendance_date AS DATE) AS attendance_date
  FROM dbo.attendance_manual_corrections
  WHERE is_deleted = 0
),
raw_daily AS (
  SELECT
    COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')) AS employee_code,
    CAST(s.scan_date AS DATE) AS attendance_date,
    MIN(s.scan_time) AS zkteco_check_in,
    MAX(s.scan_time) AS zkteco_check_out,
    MIN(s.machine_code) AS zkteco_machine_code
  FROM dbo.attendance_scan_logs s
  LEFT JOIN dbo.zkteco_hr_employee_map zm
    ON zm.machine_code = s.machine_code
   AND zm.zkteco_user_id = s.raw_device_user_id
   AND zm.is_active = 1
  WHERE COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')) IS NOT NULL
  GROUP BY COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')), CAST(s.scan_date AS DATE)
),
import_daily AS (
  SELECT
    employee_code,
    attendance_date,
    MIN(check_in_at) AS db_check_in,
    MAX(check_out_at) AS db_check_out,
    MAX(attendance_status) AS db_status,
    MAX(CASE WHEN source IN ('ZKTECO', 'DIRECT_ZKTECO') THEN 'ZKTECO' ELSE source END) AS db_source,
    MAX(CAST(is_leave AS INT)) AS is_leave,
    MAX(CAST(is_sick AS INT)) AS is_sick,
    MAX(CAST(is_holiday AS INT)) AS is_holiday,
    MAX(overtime_hours) AS overtime_hours
  FROM dbo.attendance_imports
  GROUP BY employee_code, attendance_date
),
correction_daily AS (
  SELECT
    employee_code,
    attendance_date,
    check_in_at,
    check_out_at,
    attendance_status,
    CAST(is_leave AS INT) AS is_leave,
    CAST(is_sick AS INT) AS is_sick,
    CAST(is_holiday AS INT) AS is_holiday,
    overtime_hours
  FROM dbo.attendance_manual_corrections
  WHERE is_deleted = 0
)
SELECT
  YEAR(cal.attendance_date) AS attendance_year,
  MONTH(cal.attendance_date) AS attendance_month,
  cal.attendance_date,
  e.id AS employee_id,
  e.employee_code,
  e.employee_name,
  d.division_code,
  d.division_name,
  COALESCE(g.gang_code, 'N/A') AS gang_code,
  r.zkteco_check_in,
  r.zkteco_check_out,
  r.zkteco_machine_code,
  COALESCE(i.db_status, 'NO_DATA') AS db_status,
  i.db_check_in,
  i.db_check_out,
  COALESCE(i.db_source, 'NO_DATA') AS db_source,
  CASE
    WHEN c.employee_code IS NOT NULL THEN c.attendance_status
    WHEN i.employee_code IS NOT NULL THEN i.db_status
    WHEN r.employee_code IS NOT NULL THEN 'PRESENT'
    ELSE 'NO_DATA'
  END AS final_status,
  COALESCE(c.check_in_at, i.db_check_in, r.zkteco_check_in) AS final_check_in,
  COALESCE(c.check_out_at, i.db_check_out, r.zkteco_check_out) AS final_check_out,
  CASE
    WHEN c.employee_code IS NOT NULL THEN 'MANUAL_CORRECTION'
    WHEN i.employee_code IS NOT NULL THEN COALESCE(i.db_source, 'DATABASE')
    WHEN r.employee_code IS NOT NULL THEN 'ZKTECO'
    ELSE 'NO_DATA'
  END AS source,
  CAST(COALESCE(c.is_leave, i.is_leave, 0) AS BIT) AS is_leave,
  CAST(COALESCE(c.is_sick, i.is_sick, 0) AS BIT) AS is_sick,
  CAST(COALESCE(c.is_holiday, i.is_holiday, 0) AS BIT) AS is_holiday,
  COALESCE(c.overtime_hours, i.overtime_hours, 0) AS overtime_hours
FROM calendar cal
CROSS JOIN dbo.employees e
INNER JOIN dbo.divisions d ON d.id = e.division_id
LEFT JOIN dbo.gangs g ON g.id = e.gang_id
LEFT JOIN raw_daily r
  ON r.employee_code = e.employee_code
 AND r.attendance_date = cal.attendance_date
LEFT JOIN import_daily i
  ON i.employee_code = e.employee_code
 AND i.attendance_date = cal.attendance_date
LEFT JOIN correction_daily c
  ON c.employee_code = e.employee_code
 AND c.attendance_date = cal.attendance_date
WHERE e.is_active = 1;
GO

CREATE OR ALTER VIEW dbo.vw_attendance_monthly_summary_v2 AS
SELECT
  attendance_year,
  attendance_month,
  employee_id,
  employee_code,
  employee_name,
  division_code,
  division_name,
  gang_code,
  COUNT(*) AS total_days,
  SUM(CASE WHEN final_status IN ('PRESENT', 'HADIR') THEN 1 ELSE 0 END) AS total_present,
  SUM(CASE WHEN final_status IN ('ABSENT', 'ALPHA', 'TIDAK_HADIR') THEN 1 ELSE 0 END) AS total_absent,
  SUM(CASE WHEN final_status = 'NO_DATA' THEN 1 ELSE 0 END) AS total_no_data,
  SUM(CASE WHEN is_leave = 1 THEN 1 ELSE 0 END) AS total_leave,
  SUM(CASE WHEN is_sick = 1 THEN 1 ELSE 0 END) AS total_sick,
  SUM(CASE WHEN is_holiday = 1 THEN 1 ELSE 0 END) AS total_holiday,
  SUM(overtime_hours) AS total_overtime_hours,
  SUM(CASE WHEN source IN ('ZKTECO', 'DIRECT_ZKTECO') THEN 1 ELSE 0 END) AS days_from_zkteco,
  SUM(CASE WHEN source IN ('IT_SOLUTION_API', 'API') THEN 1 ELSE 0 END) AS days_from_api,
  SUM(CASE WHEN source = 'MANUAL_CORRECTION' THEN 1 ELSE 0 END) AS days_from_manual,
  SUM(CASE WHEN source = 'NO_DATA' THEN 1 ELSE 0 END) AS days_no_data
FROM dbo.vw_attendance_monthly_matrix
GROUP BY attendance_year, attendance_month, employee_id, employee_code, employee_name,
         division_code, division_name, gang_code;
GO
