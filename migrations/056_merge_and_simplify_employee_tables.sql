/*
 * Migration: 056_merge_and_simplify_employee_tables
 * Purpose: Merge zkteco_absensi_user_registry INTO employees, drop redundant tables
 *          Create clean 3-layer architecture:
 *            Layer 1 (RAW): attendance_machines, attendance_scan_logs
 *            Layer 2 (MASTER): employees (ONE TABLE)
 *            Layer 3 (PROCESSED): attendance_imports, attendance_import_batches
 * Date: 2026-06-23
 *
 * TABLES DROPPED: zkteco_absensi_user_registry, employee_machine_enrollments
 * TABLES KEPT: employees, attendance_machines, attendance_scan_logs,
 *              attendance_imports, attendance_import_batches, hr_employee_current_snapshot
 */

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'MIGRATION 056: Merge & Simplify Employee Tables';
PRINT '============================================================';
PRINT '';

-- ============================================================
-- STEP 0: BACKUP (always first)
-- ============================================================
PRINT 'Step 0: Creating backups...';

BEGIN TRY
  EXEC('
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = ''zkteco_absensi_user_registry_backup_20260623'')
    BEGIN
      SELECT * INTO dbo.zkteco_absensi_user_registry_backup_20260623
      FROM dbo.zkteco_absensi_user_registry;
      PRINT ''  Backup: zkteco_absensi_user_registry_backup_20260623'';
    END
  ');
END TRY BEGIN CATCH
  PRINT '  WARNING backup registry: ' + ERROR_MESSAGE();
END CATCH

BEGIN TRY
  EXEC('
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = ''employee_machine_enrollments_backup_20260623'')
    BEGIN
      SELECT * INTO dbo.employee_machine_enrollments_backup_20260623
      FROM dbo.employee_machine_enrollments;
      PRINT ''  Backup: employee_machine_enrollments_backup_20260623'';
    END
  ');
END TRY BEGIN CATCH
  PRINT '  WARNING backup enrollments: ' + ERROR_MESSAGE();
END CATCH

-- ============================================================
-- STEP 1: Add missing columns to employees
-- ============================================================
PRINT '';
PRINT 'Step 1: Adding missing columns to employees...';

DECLARE @col_checks TABLE(col_name NVARCHAR(100));
DECLARE @sql NVARCHAR(MAX);

DECLARE cols_cursor CURSOR FOR
  SELECT 'ALTER TABLE dbo.employees ADD ' + col_name + ' ' + col_def + ';'
  FROM (VALUES
    ('raw_device_user_id',     'NVARCHAR(100) NULL'),
    ('zkteco_user_name',       'NVARCHAR(150) NULL'),
    ('raw_id_length',          'INT NULL'),
    ('id_category',           'NVARCHAR(30) NULL'),
    ('scan_count',             'INT NULL DEFAULT 0'),
    ('first_seen_at',          'DATETIME2 NULL'),
    ('last_seen_at',           'DATETIME2 NULL'),
    ('parsed_division_code',   'NVARCHAR(10) NULL'),
    ('hr_employee_code',        'NVARCHAR(30) NULL'),
    ('hr_loc_code',            'NVARCHAR(20) NULL'),
    ('hr_status',              'NVARCHAR(20) NULL'),
    ('mapping_status',         'NVARCHAR(30) NULL'),
    ('mapping_reason',         'NVARCHAR(500) NULL'),
    ('resolved_nik',           'NVARCHAR(50) NULL'),
    ('current_resolution_status',  'NVARCHAR(30) NULL'),
    ('current_resolution_method',   'NVARCHAR(50) NULL'),
    ('current_resolution_reason',  'NVARCHAR(500) NULL'),
    ('current_resolved_at',     'DATETIME2 NULL'),
    ('current_hr_loc_code',    'NVARCHAR(20) NULL'),
    ('current_hr_create_date',  'DATETIME2 NULL'),
    ('current_hr_update_date',  'DATETIME2 NULL')
  ) AS new_cols(col_name, col_def)
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = new_cols.col_name
  );

OPEN cols_cursor;
FETCH NEXT FROM cols_cursor INTO @sql;
WHILE @@FETCH_STATUS = 0
BEGIN
  BEGIN TRY
    EXEC(@sql);
    PRINT '  Added: ' + @sql;
  END TRY BEGIN CATCH
    PRINT '  Warning: ' + ERROR_MESSAGE();
  END CATCH
  FETCH NEXT FROM cols_cursor INTO @sql;
END
CLOSE cols_cursor;
DEALLOCATE cols_cursor;

-- ============================================================
-- STEP 2: Merge zkteco_absensi_user_registry INTO employees
-- Strategy:
--   - MATCHED rows (1739): parsed_employee_code = employee_code → UPDATE
--   - UNMATCHED rows (88): → INSERT as new employees
-- ============================================================
PRINT '';
PRINT 'Step 2: Merging zkteco_absensi_user_registry into employees...';

-- 2a: Update matched rows (employees that exist)
BEGIN TRY
  UPDATE e SET
    e.raw_device_user_id        = r.raw_device_user_id,
    e.zkteco_user_name          = r.sample_zkteco_user_name,
    e.raw_id_length             = r.raw_id_length,
    e.id_category               = r.id_category,
    e.scan_count                 = r.scan_count,
    e.first_seen_at             = r.first_seen_at,
    e.last_seen_at              = r.last_seen_at,
    e.parsed_division_code       = r.parsed_division_code,
    e.hr_employee_code           = r.hr_employee_code,
    e.hr_loc_code               = r.hr_loc_code,
    e.hr_status                 = r.hr_status,
    e.mapping_status             = r.mapping_status,
    e.mapping_reason            = r.mapping_reason,
    e.resolved_nik              = r.resolved_nik,
    e.current_resolution_status  = r.current_resolution_status,
    e.current_resolution_method  = r.current_resolution_method,
    e.current_resolution_reason  = r.current_resolution_reason,
    e.current_resolved_at        = r.current_resolved_at,
    e.current_hr_loc_code        = r.current_hr_loc_code,
    e.current_hr_create_date     = r.current_hr_create_date,
    e.current_hr_update_date    = r.current_hr_update_date
  FROM dbo.employees e
  INNER JOIN dbo.zkteco_absensi_user_registry r
    ON r.parsed_employee_code = e.employee_code
  WHERE e.nik IS NULL OR e.nik <> r.resolved_nik;

  PRINT '  Updated matched registry rows in employees';
END TRY BEGIN CATCH
  PRINT '  WARNING updating matched: ' + ERROR_MESSAGE();
END CATCH

-- 2b: Also update nik and current_emp_code for matched rows where they differ
BEGIN TRY
  UPDATE e SET
    e.nik               = r.resolved_nik,
    e.current_emp_code   = r.current_emp_code,
    e.current_emp_name   = r.current_emp_name
  FROM dbo.employees e
  INNER JOIN dbo.zkteco_absensi_user_registry r
    ON r.parsed_employee_code = e.employee_code
  WHERE r.resolved_nik IS NOT NULL
    AND (e.nik IS NULL OR e.current_emp_code IS NULL);
  PRINT '  Updated nik/current_emp_code for matched rows';
END TRY BEGIN CATCH
  PRINT '  WARNING updating nik: ' + ERROR_MESSAGE();
END CATCH

-- 2c: Insert unmatched registry rows (88 rows with no matching employee_code)
BEGIN TRY
  INSERT INTO dbo.employees (
    employee_code, employee_name, nik,
    raw_device_user_id, zkteco_user_name, raw_id_length, id_category,
    parsed_employee_code, parsed_division_code,
    scan_count, first_seen_at, last_seen_at,
    hr_employee_code, hr_loc_code, hr_status,
    mapping_status, mapping_reason,
    resolved_nik, current_emp_code, current_emp_name,
    current_resolution_status, current_resolution_method, current_resolution_reason,
    current_resolved_at, current_hr_loc_code,
    current_hr_create_date, current_hr_update_date,
    is_active, employment_status, machine_count,
    machine_codes, batch_import,
    identity_source, identity_resolution_reason
  )
  SELECT
    r.current_emp_code,
    r.current_emp_name,
    r.resolved_nik,
    r.raw_device_user_id,
    r.sample_zkteco_user_name,
    r.raw_id_length,
    r.id_category,
    r.parsed_employee_code,
    r.parsed_division_code,
    r.scan_count,
    r.first_seen_at,
    r.last_seen_at,
    r.hr_employee_code,
    r.hr_loc_code,
    r.hr_status,
    r.mapping_status,
    r.mapping_reason,
    r.resolved_nik,
    r.current_emp_code,
    r.current_emp_name,
    r.current_resolution_status,
    r.current_resolution_method,
    r.current_resolution_reason,
    r.current_resolved_at,
    r.current_hr_loc_code,
    r.current_hr_create_date,
    r.current_hr_update_date,
    1,
    'ACTIVE',
    r.machine_count,
    NULL,
    NULL,
    r.current_resolution_status,
    'Created from zkteco_absensi_user_registry during migration 056'
  FROM dbo.zkteco_absensi_user_registry r
  LEFT JOIN dbo.employees e ON e.employee_code = r.parsed_employee_code
  WHERE e.id IS NULL
    AND r.parsed_employee_code IS NOT NULL;

  PRINT '  Inserted unmatched registry rows into employees';
END TRY BEGIN CATCH
  PRINT '  WARNING inserting unmatched: ' + ERROR_MESSAGE();
END CATCH

-- ============================================================
-- STEP 3: Update attendance_scan_logs to use employees.id
-- (ensure employee_id FK is set from raw_device_user_id lookup)
-- ============================================================
PRINT '';
PRINT 'Step 3: Updating attendance_scan_logs employee_id FK...';

BEGIN TRY
  UPDATE sl SET
    sl.employee_id = e.id,
    sl.current_employee_id = e.id
  FROM dbo.attendance_scan_logs sl
  INNER JOIN dbo.employees e
    ON e.parsed_employee_code = sl.parsed_employee_code
  WHERE sl.employee_id IS NULL AND e.id IS NOT NULL;

  PRINT '  Updated attendance_scan_logs employee_id FK';
END TRY BEGIN CATCH
  PRINT '  WARNING updating scan_logs: ' + ERROR_MESSAGE();
END CATCH

-- ============================================================
-- STEP 4: Update attendance_imports to use employees.id
-- ============================================================
PRINT '';
PRINT 'Step 4: Updating attendance_imports employee_id FK...';

BEGIN TRY
  -- attendance_imports.employee_code → employees.employee_code → employees.id
  UPDATE ai SET
    ai.employee_id = e.id,
    ai.current_employee_id = e.id
  FROM dbo.attendance_imports ai
  INNER JOIN dbo.employees e ON e.employee_code = ai.employee_code
  WHERE ai.employee_id IS NULL AND e.id IS NOT NULL;
  PRINT '  Updated attendance_imports employee_id FK';
END TRY BEGIN CATCH
  PRINT '  WARNING updating imports: ' + ERROR_MESSAGE();
END CATCH

-- ============================================================
-- STEP 5: Summary stats
-- ============================================================
PRINT '';
PRINT 'Step 5: Summary...';

DECLARE @emp_total INT, @emp_with_nik INT, @emp_with_raw INT, @emp_with_curr INT;
SELECT @emp_total = COUNT(*) FROM dbo.employees;
SELECT @emp_with_nik = COUNT(*) FROM dbo.employees WHERE nik IS NOT NULL;
SELECT @emp_with_raw = COUNT(*) FROM dbo.employees WHERE raw_device_user_id IS NOT NULL;
SELECT @emp_with_curr = COUNT(*) FROM dbo.employees WHERE current_emp_code IS NOT NULL;

PRINT '  employees.total:              ' + CAST(@emp_total AS NVARCHAR(20));
PRINT '  employees.with nik:          ' + CAST(@emp_with_nik AS NVARCHAR(20));
PRINT '  employees.with raw_id:       ' + CAST(@emp_with_raw AS NVARCHAR(20));
PRINT '  employees.with current_emp:  ' + CAST(@emp_with_curr AS NVARCHAR(20));

-- ============================================================
-- STEP 6: DROP tables (after all data merged)
-- ============================================================
PRINT '';
PRINT 'Step 6: Dropping redundant tables...';

BEGIN TRY
  IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'zkteco_absensi_user_registry')
  BEGIN
    DROP TABLE dbo.zkteco_absensi_user_registry;
    PRINT '  Dropped: zkteco_absensi_user_registry';
  END
END TRY BEGIN CATCH
  PRINT '  WARNING drop registry: ' + ERROR_MESSAGE();
END CATCH

BEGIN TRY
  IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'employee_machine_enrollments')
  BEGIN
    DROP TABLE dbo.employee_machine_enrollments;
    PRINT '  Dropped: employee_machine_enrollments';
  END
END TRY BEGIN CATCH
  PRINT '  WARNING drop enrollments: ' + ERROR_MESSAGE();
END CATCH

-- ============================================================
-- STEP 7: Create clean indexes on employees
-- ============================================================
PRINT '';
PRINT 'Step 7: Creating indexes on employees...';

BEGIN TRY
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employees_nik' AND object_id = OBJECT_ID('dbo.employees'))
  BEGIN
    CREATE INDEX IX_employees_nik ON dbo.employees(nik) WHERE nik IS NOT NULL;
    PRINT '  Created: IX_employees_nik';
  END
END TRY BEGIN CATCH
  PRINT '  WARNING create IX_employees_nik: ' + ERROR_MESSAGE();
END CATCH

BEGIN TRY
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employees_current_emp_code' AND object_id = OBJECT_ID('dbo.employees'))
  BEGIN
    CREATE INDEX IX_employees_current_emp_code ON dbo.employees(current_emp_code) WHERE current_emp_code IS NOT NULL;
    PRINT '  Created: IX_employees_current_emp_code';
  END
END TRY BEGIN CATCH
  PRINT '  WARNING create IX_employees_current_emp_code: ' + ERROR_MESSAGE();
END CATCH

BEGIN TRY
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employees_raw_device_user_id' AND object_id = OBJECT_ID('dbo.employees'))
  BEGIN
    CREATE INDEX IX_employees_raw_device_user_id ON dbo.employees(raw_device_user_id) WHERE raw_device_user_id IS NOT NULL;
    PRINT '  Created: IX_employees_raw_device_user_id';
  END
END TRY BEGIN CATCH
  PRINT '  WARNING create IX_employees_raw_device_user_id: ' + ERROR_MESSAGE();
END CATCH

BEGIN TRY
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_employees_employee_code' AND object_id = OBJECT_ID('dbo.employees'))
  BEGIN
    CREATE INDEX IX_employees_employee_code ON dbo.employees(employee_code) WHERE employee_code IS NOT NULL;
    PRINT '  Created: IX_employees_employee_code';
  END
END TRY BEGIN CATCH
  PRINT '  WARNING create IX_employees_employee_code: ' + ERROR_MESSAGE();
END CATCH

PRINT '';
PRINT '============================================================';
PRINT 'MIGRATION 056 COMPLETED';
PRINT '============================================================';
