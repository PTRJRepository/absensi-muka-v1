USE rebinmas_absensi_monitoring;
GO

-- Drop existing table if needs to be recreated
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'zkteco_hr_employee_map')
BEGIN
  DROP TABLE zkteco_hr_employee_map;
  PRINT 'Dropped existing zkteco_hr_employee_map table';
END

-- Recreate with NULL allowed for hr_employee_code
CREATE TABLE zkteco_hr_employee_map (
  id INT IDENTITY(1,1) PRIMARY KEY,
  machine_code NVARCHAR(30) NOT NULL,
  zkteco_user_id NVARCHAR(100) NOT NULL,
  zkteco_user_name NVARCHAR(200) NOT NULL,
  hr_employee_code NVARCHAR(30) NULL,  -- Allow NULL for unmatched
  hr_employee_name NVARCHAR(150) NULL,
  match_confidence NVARCHAR(20) NOT NULL DEFAULT 'UNMATCHED',
  match_method NVARCHAR(50) NOT NULL DEFAULT 'ID_CONVERSION',
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  is_active BIT NOT NULL DEFAULT 1,
  CONSTRAINT uq_zkteco_user UNIQUE (machine_code, zkteco_user_id)
);

CREATE INDEX IX_zkteco_hr_map_hr_code ON zkteco_hr_employee_map(hr_employee_code);
CREATE INDEX IX_zkteco_hr_map_zkteco_name ON zkteco_hr_employee_map(zkteco_user_name);

PRINT 'Created zkteco_hr_employee_map table with NULL allowed for hr_employee_code';
GO
