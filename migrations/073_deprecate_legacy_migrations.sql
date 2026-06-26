USE rebinmas_absensi_monitoring;
GO

-- =============================================================================
-- Migration 073: Deprecate Legacy Migrations (zkteco_hr_employee_map references)
-- Created: 2026-06-25
--
-- Legacy migrations that reference zkteco_hr_employee_map (DROPPED 2026-06-24):
--   - migrations/020_update_attendance_views.sql — references zkteco_hr_employee_map
--   - migrations/023_live_attendance_compat.sql — references zkteco_hr_employee_map
--
-- ACTION: Mark these as historical only — DO NOT re-run.
-- Use migration 072 (vw_attendance_monthly_matrix SSOT fix) instead.
-- =============================================================================

PRINT 'Migration 073: Deprecating legacy migrations that reference zkteco_hr_employee_map';
PRINT '';
PRINT 'WARNING: The following migrations are DEPRECATED (reference dropped table zkteco_hr_employee_map):';
PRINT '  - migrations/020_update_attendance_views.sql';
PRINT '  - migrations/023_live_attendance_compat.sql';
PRINT '';
PRINT 'ACTION: Use migration 072 (072_fix_matrix_view_SSOT.sql) for view rebuild.';
PRINT '';

-- Add deprecation marker to a dedicated notes table if it exists
IF OBJECT_ID('dbo.migration_notes', 'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.migration_notes WHERE migration_name = '020_update_attendance_views')
    INSERT INTO dbo.migration_notes (migration_name, status, notes, applied_at)
    VALUES ('020_update_attendance_views', 'DEPRECATED', 'References zkteco_hr_employee_map (DROPPED 2026-06-24). Use 072 instead.', GETDATE());

  IF NOT EXISTS (SELECT 1 FROM dbo.migration_notes WHERE migration_name = '023_live_attendance_compat')
    INSERT INTO dbo.migration_notes (migration_name, status, notes, applied_at)
    VALUES ('023_live_attendance_compat', 'DEPRECATED', 'References zkteco_hr_employee_map (DROPPED 2026-06-24). Use 072 instead.', GETDATE());

  PRINT 'Migration deprecation notes recorded in migration_notes table.';
END
ELSE
BEGIN
  PRINT 'migration_notes table not found — deprecation logged in migration output only.';
END

PRINT '';
PRINT 'Migration 073 complete.';
GO
