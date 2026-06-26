/*
 * Migration: 037_sanitize_very_short_ids.sql
 * Date: 2026-06-22
 * Purpose: Mark NEED_REVIEW records with very short IDs (1-4 chars) as UNMAPPED
 * Count: ~6,377 records
 * Rule: Only IDs >5 chars should be auto-mapped; everything else is UNMAPPED
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 037: Sanitize very short (1-4 chars) NEED_REVIEW records';
    PRINT '============================================================';

    DECLARE @before INT;
    SELECT @before = COUNT(*)
    FROM dbo.attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
      AND LEN(raw_device_user_id) BETWEEN 1 AND 4;
    PRINT CONCAT('Very short (1-4 chars) NEED_REVIEW before: ', @before);
    PRINT '';

    UPDATE s
    SET
        s.mapping_status = 'UNMAPPED',
        s.mapping_reason = 'SHORT_ID_TOO_SHORT_1_TO_4',
        s.parsed_employee_code = NULL
    FROM dbo.attendance_scan_logs s
    WHERE s.mapping_status = 'NEED_REVIEW'
      AND LEN(s.raw_device_user_id) BETWEEN 1 AND 4;

    DECLARE @updated INT = @@ROWCOUNT;
    PRINT CONCAT('Updated to UNMAPPED: ', @updated);
    PRINT '';

    DECLARE @after INT;
    SELECT @after = COUNT(*)
    FROM dbo.attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
      AND LEN(raw_device_user_id) BETWEEN 1 AND 4;
    PRINT CONCAT('Very short NEED_REVIEW after: ', @after);

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 037 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
