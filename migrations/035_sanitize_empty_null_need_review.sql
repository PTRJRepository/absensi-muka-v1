/*
 * Migration: 035_sanitize_empty_null_need_review.sql
 * Date: 2026-06-22
 * Purpose: Mark NEED_REVIEW records with empty/null raw_device_user_id as UNMAPPED
 * Count: 49,323 records
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 035: Sanitize empty/null NEED_REVIEW records';
    PRINT '============================================================';

    DECLARE @before INT;
    SELECT @before = COUNT(*)
    FROM dbo.attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
      AND (raw_device_user_id IS NULL OR LEN(raw_device_user_id) = 0);
    PRINT CONCAT('Empty/null NEED_REVIEW before: ', @before);
    PRINT '';

    UPDATE s
    SET
        s.mapping_status = 'UNMAPPED',
        s.mapping_reason = 'SHORT_ID_EMPTY_NULL',
        s.parsed_employee_code = NULL
    FROM dbo.attendance_scan_logs s
    WHERE s.mapping_status = 'NEED_REVIEW'
      AND (s.raw_device_user_id IS NULL OR LEN(s.raw_device_user_id) = 0);

    DECLARE @updated INT = @@ROWCOUNT;
    PRINT CONCAT('Updated to UNMAPPED: ', @updated);
    PRINT '';

    DECLARE @after INT;
    SELECT @after = COUNT(*)
    FROM dbo.attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
      AND (raw_device_user_id IS NULL OR LEN(raw_device_user_id) = 0);
    PRINT CONCAT('Empty/null NEED_REVIEW after: ', @after);

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 035 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
