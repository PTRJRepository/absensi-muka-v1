-- Migration 082: Drop redundant columns from attendance_imports
-- gang_code: 100% NULL (gangs dropped Phase B), view provides 'N/A'
-- parsed_employee_code: 100% == employee_code (pure duplicate), 0 writer INSERT
-- Verified: 0 constraints, 0 indexes on these cols
-- Safe: no writer lists these in INSERT, view vw_attendance_final provides gang_code='N/A'

ALTER TABLE dbo.attendance_imports
  DROP COLUMN IF EXISTS gang_code, parsed_employee_code;
GO

-- Verify
SELECT COUNT(*) AS imports_cols FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='attendance_imports';
GO
-- should be 28 (was 30)
