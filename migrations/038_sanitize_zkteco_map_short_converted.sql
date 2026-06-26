/*
 * Migration: 038_sanitize_zkteco_map_short_converted.sql
 * Date: 2026-06-22
 * Purpose: Fix zkteco_hr_employee_map entries with CONVERTED short IDs (likely garbage data)
 * Count: 452 records with match_confidence='CONVERTED' and short zkteco_user_id (<=5 chars)
 * These should be marked as UNMATCHED — short IDs cannot be reliably converted
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 038: Sanitize zkteco_hr_employee_map CONVERTED short IDs';
    PRINT '============================================================';

    DECLARE @before INT;
    SELECT @before = COUNT(*)
    FROM dbo.zkteco_hr_employee_map
    WHERE match_confidence = 'CONVERTED'
      AND LEN(zkteco_user_id) <= 5;
    PRINT CONCAT('CONVERTED short IDs in map before: ', @before);
    PRINT '';

    UPDATE m
    SET
        m.match_confidence = 'UNMATCHED',
        m.match_method = 'SHORT_ID_EXCLUDED',
        m.hr_employee_code = NULL,
        m.hr_employee_name = NULL,
        m.is_active = 0,
        m.updated_at = GETDATE()
    FROM dbo.zkteco_hr_employee_map m
    WHERE m.match_confidence = 'CONVERTED'
      AND LEN(m.zkteco_user_id) <= 5;

    DECLARE @updated INT = @@ROWCOUNT;
    PRINT CONCAT('Updated to UNMATCHED: ', @updated);
    PRINT '';

    DECLARE @after INT;
    SELECT @after = COUNT(*)
    FROM dbo.zkteco_hr_employee_map
    WHERE match_confidence = 'CONVERTED'
      AND LEN(zkteco_user_id) <= 5;
    PRINT CONCAT('CONVERTED short IDs after: ', @after);

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 038 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
