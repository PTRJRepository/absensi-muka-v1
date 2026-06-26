/*
 * Migration: 054_add_employees_batch_import_and_machine_codes
 * Purpose: Add batch_import and machine_codes columns to employees table
 * Date: 2026-06-23
 */

SET NOCOUNT ON;

PRINT '============================================================';
PRINT 'MIGRATION 054: Add batch_import and machine_codes to employees';
PRINT '============================================================';
PRINT '';

-- Step 1: Add batch_import column (last batch that imported this employee)
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'batch_import'
)
BEGIN
  ALTER TABLE dbo.employees ADD batch_import NVARCHAR(100) NULL;
  PRINT '  Added column: batch_import';
END
ELSE
BEGIN
  PRINT '  Column already exists: batch_import';
END

-- Step 2: Add machine_codes column (comma-separated list of enrolled machine codes)
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'machine_codes'
)
BEGIN
  ALTER TABLE dbo.employees ADD machine_codes NVARCHAR(500) NULL;
  PRINT '  Added column: machine_codes';
END
ELSE
BEGIN
  PRINT '  Column already exists: machine_codes';
END

-- Step 3: Backfill machine_codes from employee_machine_enrollments
PRINT '';
PRINT 'Step 3: Backfilling machine_codes...';

BEGIN TRY
  -- Build comma-separated machine_codes per employee
  -- Build comma-separated machine_codes per employee (SQL Server 2016 compatible)
  UPDATE e
  SET e.machine_codes = sub.machine_codes
  FROM dbo.employees e
  INNER JOIN (
    SELECT
      eme1.employee_id,
      STUFF((
        SELECT ',' + eme2.machine_code
        FROM dbo.employee_machine_enrollments eme2
        WHERE eme2.employee_id = eme1.employee_id
          AND eme2.is_active = 1
        ORDER BY eme2.machine_code
        FOR XML PATH(''), TYPE
      ).value('.', 'NVARCHAR(MAX)'), 1, 1, '') AS machine_codes
    FROM dbo.employee_machine_enrollments eme1
    WHERE eme1.is_active = 1
    GROUP BY eme1.employee_id
  ) sub ON sub.employee_id = e.id
  WHERE e.machine_codes IS NULL OR e.machine_codes <> sub.machine_codes;

  PRINT '  Backfilled machine_codes from employee_machine_enrollments';
END TRY
BEGIN CATCH
  PRINT '  WARNING: Failed to backfill machine_codes: ' + ERROR_MESSAGE();
END CATCH

-- Step 4: Backfill batch_import from latest attendance_import_batches
PRINT '';
PRINT 'Step 4: Backfilling batch_import...';

BEGIN TRY
  -- Backfill batch_import = latest batch label per employee from attendance_imports
  ;WITH LatestBatch AS (
    SELECT
      ai.employee_id,
      ai.batch_id,
      ab.batch_label,
      ROW_NUMBER() OVER (PARTITION BY ai.employee_id ORDER BY ab.created_at DESC) AS rn
    FROM dbo.attendance_imports ai
    INNER JOIN dbo.attendance_import_batches ab ON ab.id = ai.batch_id
    WHERE ai.employee_id IS NOT NULL
  )
  UPDATE e
  SET e.batch_import = lb.batch_label
  FROM dbo.employees e
  INNER JOIN LatestBatch lb ON lb.employee_id = e.id AND lb.rn = 1
  WHERE e.batch_import IS NULL;

  PRINT '  Backfilled batch_import from attendance_imports';
END TRY
BEGIN CATCH
  PRINT '  WARNING: Failed to backfill batch_import: ' + ERROR_MESSAGE();
END CATCH

-- Step 5: Also add machine_count computed column for convenience
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = 'machine_count'
)
BEGIN
  ALTER TABLE dbo.employees ADD machine_count INT NULL;
  PRINT '  Added column: machine_count';
END
ELSE
BEGIN
  PRINT '  Column already exists: machine_count';
END

BEGIN TRY
  UPDATE e
  SET e.machine_count = sub.cnt
  FROM dbo.employees e
  INNER JOIN (
    SELECT employee_id, COUNT(*) AS cnt
    FROM dbo.employee_machine_enrollments
    WHERE is_active = 1
    GROUP BY employee_id
  ) sub ON sub.employee_id = e.id
  WHERE e.machine_count IS NULL OR e.machine_count <> sub.cnt;

  PRINT '  Backfilled machine_count';
END TRY
BEGIN CATCH
  PRINT '  WARNING: Failed to backfill machine_count: ' + ERROR_MESSAGE();
END CATCH

PRINT '';
PRINT '============================================================';
PRINT 'MIGRATION 054 COMPLETED';
PRINT '============================================================';
