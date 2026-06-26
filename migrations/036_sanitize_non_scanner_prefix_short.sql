/*
 * Migration: 036_sanitize_non_scanner_prefix_short.sql
 * Date: 2026-06-22
 * Purpose: Mark NEED_REVIEW records with 5-digit IDs but NO valid scanner prefix as UNMAPPED
 * Count: ~170,666 records
 * Scanner prefixes: 100(A), 200(J), 300(B), 400(H), 500(C), 600(D), 700(E), 800(F), 900(G), 001(L)
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 036: Sanitize short 5-digit IDs without scanner prefix';
    PRINT '============================================================';

    DECLARE @before INT;
    SELECT @before = COUNT(*)
    FROM dbo.attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
      AND LEN(raw_device_user_id) = 5
      AND LEFT(raw_device_user_id, 3) NOT IN ('100','200','300','400','500','600','700','800','900','001');
    PRINT CONCAT('Non-prefix 5-digit NEED_REVIEW before: ', @before);
    PRINT '';

    UPDATE s
    SET
        s.mapping_status = 'UNMAPPED',
        s.mapping_reason = 'SHORT_ID_NO_SCANNER_PREFIX',
        s.parsed_employee_code = NULL
    FROM dbo.attendance_scan_logs s
    WHERE s.mapping_status = 'NEED_REVIEW'
      AND LEN(s.raw_device_user_id) = 5
      AND LEFT(s.raw_device_user_id, 3) NOT IN ('100','200','300','400','500','600','700','800','900','001');

    DECLARE @updated INT = @@ROWCOUNT;
    PRINT CONCAT('Updated to UNMAPPED: ', @updated);
    PRINT '';

    DECLARE @after INT;
    SELECT @after = COUNT(*)
    FROM dbo.attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
      AND LEN(raw_device_user_id) = 5
      AND LEFT(raw_device_user_id, 3) NOT IN ('100','200','300','400','500','600','700','800','900','001');
    PRINT CONCAT('Non-prefix 5-digit NEED_REVIEW after: ', @after);

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 036 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
