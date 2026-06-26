-- Migration: 074_rescue_manual_review_orphans.sql
-- Date: 2026-06-26
-- Purpose:
--   Convert existing MANUAL_REVIEW attendance_imports to properly linked employee records.
--
-- Background:
--   PGE Office, MILL, OFFICE_APE machines produce pure numeric badge IDs (10129, 188, 34...)
--   that are ≤ 5 digits. The SSOT parser correctly excludes these as ambiguous.
--   However, employees.employee_code matches the raw badge ID directly.
--
--   The attendance-process-import.service.ts has been updated to include a
--   direct employee_code lookup fallback. This migration retroactively converts
--   existing MANUAL_REVIEW records.
--
-- What this does:
--   1. UPDATE: MANUAL_REVIEW rows → matched employee records
--   2. DELETE: Duplicate MANUAL_REVIEW rows that conflict with updated records
--
-- Validation after:
--   SELECT COUNT(*) FROM attendance_imports WHERE division_code = 'MANUAL_REVIEW';
--   -- Expected: ~7 genuine orphans
--   SELECT COUNT(*) FROM attendance_imports WHERE employee_id IS NOT NULL;
--   -- Expected: ~55,061 (was 45,043 before this migration)

PRINT '=== Migration 074: Rescue MANUAL_REVIEW orphans ===';

BEGIN TRY
    BEGIN TRANSACTION;

    -- STEP 1: Update MANUAL_REVIEW records that match an employee via raw_scan_log_id
    --
    -- Join: attendance_imports → attendance_scan_logs → employees → divisions
    -- Condition: employee exists AND no duplicate on (employee_id, date, source)

    UPDATE ai SET
        ai.employee_id         = e.id,
        ai.employee_code       = e.employee_code,
        ai.division_code       = d.division_code,
        ai.needs_manual_review = 0,
        -- Layer 1 enrichment from employees
        ai.employee_name       = e.employee_name,
        ai.hr_status          = e.hr_status,
        ai.hr_loc_code        = e.hr_loc_code,
        ai.nik                = e.nik,
        -- Layer 2 enrichment from hr_employee_current_snapshot via NIK
        ai.current_emp_name   = COALESCE(h.current_emp_name, e.employee_name),
        ai.current_hr_loc_code = h.current_loc_code,
        ai.current_hr_status   = h.current_status
    FROM attendance_imports ai
    INNER JOIN attendance_scan_logs sl ON sl.id = ai.raw_scan_log_id
    INNER JOIN employees e ON e.employee_code = sl.raw_device_user_id
    INNER JOIN divisions d ON d.id = e.division_id
    LEFT JOIN hr_employee_current_snapshot h ON h.nik = e.nik
    WHERE ai.division_code = 'MANUAL_REVIEW'
      AND ai.raw_scan_log_id IS NOT NULL
      -- Skip if target employee already has a record for this date+source
      AND NOT EXISTS (
          SELECT 1 FROM attendance_imports ai2
          WHERE ai2.employee_id = e.id
            AND ai2.attendance_date = ai.attendance_date
            AND ai2.source_reference = ai.source_reference
            AND ai2.id != ai.id
      );

    DECLARE @matched INT = @@ROWCOUNT;
    PRINT 'Step 1: Updated ' + CAST(@matched AS VARCHAR) + ' MANUAL_REVIEW records to employee records.';

    -- STEP 2: Delete duplicate MANUAL_REVIEW records that now conflict with Step 1 records.
    -- Example: Employee 10129 had TWO MANUAL_10129 rows for 2026-03-07 at OFFICE_PGE.
    -- Step 1 updates one to real employee. Step 2 deletes the other.

    DELETE ai FROM attendance_imports ai
    WHERE ai.division_code = 'MANUAL_REVIEW'
      AND ai.raw_scan_log_id IS NOT NULL
      AND EXISTS (
          SELECT 1 FROM attendance_imports ai2
          INNER JOIN attendance_scan_logs sl2 ON sl2.id = ai2.raw_scan_log_id
          INNER JOIN employees e ON e.employee_code = sl2.raw_device_user_id
          WHERE ai2.employee_id = e.id
            AND ai2.attendance_date = ai.attendance_date
            AND ai2.source_reference = ai.source_reference
            AND ai2.id != ai.id
      );

    DECLARE @deleted INT = @@ROWCOUNT;
    PRINT 'Step 2: Deleted ' + CAST(@deleted AS VARCHAR) + ' duplicate MANUAL_REVIEW records.';

    -- STEP 3: Report remaining orphans
    DECLARE @remaining INT;
    SELECT @remaining = COUNT(*) FROM attendance_imports WHERE division_code = 'MANUAL_REVIEW';
    PRINT 'Step 3: Remaining MANUAL_REVIEW records (genuine orphans): ' + CAST(@remaining AS VARCHAR);
    PRINT '  These have no employee match — require manual investigation.';

    COMMIT TRANSACTION;
    PRINT 'Migration 074 completed successfully.';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    PRINT 'ERROR in Migration 074: ' + ERROR_MESSAGE() + ' (Line: ' + CAST(ERROR_LINE() AS VARCHAR) + ')';
END CATCH;
GO
