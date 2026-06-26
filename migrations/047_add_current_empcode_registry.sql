/*
 * Migration: 047_add_current_empcode_registry.sql
 * Purpose: Add currentEmpCode resolution columns to zkteco_absensi_user_registry
 * Date: 2026-06-23
 * Author: Claude Code
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  PRINT '============================================================';
  PRINT 'MIGRATION 047: Add currentEmpCode resolution columns';
  PRINT '============================================================';
  PRINT '';

  -- ============================================
  -- STEP 1: Create backup table
  -- ============================================
  PRINT 'Step 1: Creating backup table...';

  DECLARE @backup_suffix NVARCHAR(20) = FORMAT(GETDATE(), 'yyyyMMdd');
  DECLARE @backup_table_name NVARCHAR(150) = 'zkteco_absensi_user_registry_backup_current_empcode_' + @backup_suffix;
  DECLARE @row_count INT = (SELECT COUNT(*) FROM dbo.zkteco_absensi_user_registry);

  -- Drop backup if exists
  DECLARE @drop_sql NVARCHAR(MAX) = N'IF OBJECT_ID(''dbo.' + @backup_table_name + ''', ''U'') IS NOT NULL DROP TABLE dbo.' + @backup_table_name;
  EXEC sp_executesql @drop_sql;

  -- Create backup
  DECLARE @backup_sql NVARCHAR(MAX) = N'SELECT * INTO dbo.' + @backup_table_name + N' FROM dbo.zkteco_absensi_user_registry';
  EXEC sp_executesql @backup_sql;

  PRINT 'Backup created: ' + @backup_table_name + ' (' + CAST(@row_count AS VARCHAR) + ' rows)';
  PRINT '';

  -- ============================================
  -- STEP 2-12: Add columns
  -- ============================================
  PRINT 'Step 2-12: Adding columns...';

  -- Column definitions
  DECLARE @columns TABLE (
    col_name NVARCHAR(50),
    col_type NVARCHAR(50)
  );

  INSERT INTO @columns VALUES ('resolved_nik', 'NVARCHAR(50)');
  INSERT INTO @columns VALUES ('current_emp_code', 'NVARCHAR(30)');
  INSERT INTO @columns VALUES ('current_emp_name', 'NVARCHAR(150)');
  INSERT INTO @columns VALUES ('current_hr_status', 'NVARCHAR(20)');
  INSERT INTO @columns VALUES ('current_hr_loc_code', 'NVARCHAR(20)');
  INSERT INTO @columns VALUES ('current_hr_create_date', 'DATETIME2');
  INSERT INTO @columns VALUES ('current_hr_update_date', 'DATETIME2');
  INSERT INTO @columns VALUES ('current_resolution_status', 'NVARCHAR(30)');
  INSERT INTO @columns VALUES ('current_resolution_method', 'NVARCHAR(50)');
  INSERT INTO @columns VALUES ('current_resolution_reason', 'NVARCHAR(500)');
  INSERT INTO @columns VALUES ('current_resolved_at', 'DATETIME2');

  DECLARE @col_name NVARCHAR(50);
  DECLARE @col_type NVARCHAR(50);
  DECLARE @alter_sql NVARCHAR(MAX);

  DECLARE col_cursor CURSOR FOR SELECT col_name, col_type FROM @columns;
  OPEN col_cursor;
  FETCH NEXT FROM col_cursor INTO @col_name, @col_type;

  WHILE @@FETCH_STATUS = 0
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'zkteco_absensi_user_registry' AND COLUMN_NAME = @col_name)
    BEGIN
      SET @alter_sql = N'ALTER TABLE dbo.zkteco_absensi_user_registry ADD ' + @col_name + N' ' + @col_type + N' NULL';
      EXEC sp_executesql @alter_sql;
      PRINT 'Added column: ' + @col_name;
    END
    ELSE
    BEGIN
      PRINT 'Column ' + @col_name + ' already exists, skipping...';
    END
    FETCH NEXT FROM col_cursor INTO @col_name, @col_type;
  END

  CLOSE col_cursor;
  DEALLOCATE col_cursor;
  PRINT '';

  -- ============================================
  -- STEP 13: Create indexes (using dynamic SQL)
  -- ============================================
  PRINT 'Step 13: Creating indexes...';

  -- Index 1: resolved_nik
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_registry_resolved_nik' AND object_id = OBJECT_ID('dbo.zkteco_absensi_user_registry'))
  BEGIN
    EXEC sp_executesql N'CREATE INDEX ix_registry_resolved_nik ON dbo.zkteco_absensi_user_registry(resolved_nik) WHERE resolved_nik IS NOT NULL';
    PRINT 'Created index: ix_registry_resolved_nik';
  END
  ELSE
  BEGIN
    PRINT 'Index ix_registry_resolved_nik already exists, skipping...';
  END

  -- Index 2: current_emp_code
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_registry_current_emp_code' AND object_id = OBJECT_ID('dbo.zkteco_absensi_user_registry'))
  BEGIN
    EXEC sp_executesql N'CREATE INDEX ix_registry_current_emp_code ON dbo.zkteco_absensi_user_registry(current_emp_code) WHERE current_emp_code IS NOT NULL';
    PRINT 'Created index: ix_registry_current_emp_code';
  END
  ELSE
  BEGIN
    PRINT 'Index ix_registry_current_emp_code already exists, skipping...';
  END

  -- Index 3: current_resolution_status
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_registry_current_resolution_status' AND object_id = OBJECT_ID('dbo.zkteco_absensi_user_registry'))
  BEGIN
    EXEC sp_executesql N'CREATE INDEX ix_registry_current_resolution_status ON dbo.zkteco_absensi_user_registry(current_resolution_status) WHERE current_resolution_status IS NOT NULL';
    PRINT 'Created index: ix_registry_current_resolution_status';
  END
  ELSE
  BEGIN
    PRINT 'Index ix_registry_current_resolution_status already exists, skipping...';
  END
  PRINT '';

  -- ============================================
  -- STEP 14: Verification
  -- ============================================
  PRINT 'Step 14: Verification...';
  PRINT '';

  PRINT '--- New columns summary ---';
  SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'zkteco_absensi_user_registry'
    AND COLUMN_NAME IN (
      'resolved_nik', 'current_emp_code', 'current_emp_name',
      'current_hr_status', 'current_hr_loc_code',
      'current_hr_create_date', 'current_hr_update_date',
      'current_resolution_status', 'current_resolution_method',
      'current_resolution_reason', 'current_resolved_at'
    )
  ORDER BY COLUMN_NAME;

  PRINT '';
  PRINT '--- Registry row count ---';
  SELECT @row_count AS total_registry_rows;

  COMMIT TRANSACTION;
  PRINT '';
  PRINT '============================================================';
  PRINT 'MIGRATION 047 COMPLETED SUCCESSFULLY';
  PRINT '============================================================';

END TRY
BEGIN CATCH
  PRINT 'ERROR:';
  PRINT ERROR_MESSAGE();
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
