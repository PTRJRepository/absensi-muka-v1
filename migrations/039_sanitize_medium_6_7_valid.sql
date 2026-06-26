/*
 * Migration: 039_sanitize_medium_6_7_valid.sql
 * Date: 2026-06-22
 * Purpose: MAPPED medium (6-7 char) NEED_REVIEW records where parsing gives valid db_ptrj codes
 * Count: 69 records
 * Examples: 1000001→A0001, 2000004→J0004, 5000001→C0001
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 039: MAPPED valid medium (6-7 char) NEED_REVIEW records';
    PRINT '============================================================';

    DECLARE @before INT;
    SELECT @before = COUNT(*)
    FROM dbo.attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
      AND LEN(raw_device_user_id) > 5
      AND LEN(raw_device_user_id) <= 7;
    PRINT CONCAT('Medium (6-7) NEED_REVIEW before: ', @before);
    PRINT '';

    -- Parse: prefix 100→A, 200→J, 300→B, 400→H, 500→C, 600→D, 700→E, 800→F, 900→G, 001→L
    -- Take last 4 digits and pad
    UPDATE s
    SET
        s.parsed_employee_code =
            CASE LEFT(s.raw_device_user_id, 3)
                WHEN '100' THEN 'A' + RIGHT(s.raw_device_user_id, 4)
                WHEN '200' THEN 'J' + RIGHT(s.raw_device_user_id, 4)
                WHEN '300' THEN 'B' + RIGHT(s.raw_device_user_id, 4)
                WHEN '400' THEN 'H' + RIGHT(s.raw_device_user_id, 4)
                WHEN '500' THEN 'C' + RIGHT(s.raw_device_user_id, 4)
                WHEN '600' THEN 'D' + RIGHT(s.raw_device_user_id, 4)
                WHEN '700' THEN 'E' + RIGHT(s.raw_device_user_id, 4)
                WHEN '800' THEN 'F' + RIGHT(s.raw_device_user_id, 4)
                WHEN '900' THEN 'G' + RIGHT(s.raw_device_user_id, 4)
                WHEN '001' THEN 'L' + RIGHT(s.raw_device_user_id, 4)
                ELSE NULL
            END,
        s.mapping_status = 'MAPPED',
        s.mapping_reason = 'PARSED_MEDIUM_ID_VALIDATED',
        s.parsed_division_code =
            CASE LEFT(s.raw_device_user_id, 3)
                WHEN '100' THEN 'A'
                WHEN '200' THEN 'J'
                WHEN '300' THEN 'B'
                WHEN '400' THEN 'H'
                WHEN '500' THEN 'C'
                WHEN '600' THEN 'D'
                WHEN '700' THEN 'E'
                WHEN '800' THEN 'F'
                WHEN '900' THEN 'G'
                WHEN '001' THEN 'L'
                ELSE NULL
            END
    FROM dbo.attendance_scan_logs s
    WHERE s.mapping_status = 'NEED_REVIEW'
      AND LEN(s.raw_device_user_id) > 5
      AND LEN(s.raw_device_user_id) <= 7
      AND EXISTS (
          SELECT 1
          FROM db_ptrj.dbo.HR_EMPLOYEE hr
          WHERE RTRIM(hr.EmpCode) =
              CASE LEFT(s.raw_device_user_id, 3)
                  WHEN '100' THEN 'A' + RIGHT(s.raw_device_user_id, 4)
                  WHEN '200' THEN 'J' + RIGHT(s.raw_device_user_id, 4)
                  WHEN '300' THEN 'B' + RIGHT(s.raw_device_user_id, 4)
                  WHEN '400' THEN 'H' + RIGHT(s.raw_device_user_id, 4)
                  WHEN '500' THEN 'C' + RIGHT(s.raw_device_user_id, 4)
                  WHEN '600' THEN 'D' + RIGHT(s.raw_device_user_id, 4)
                  WHEN '700' THEN 'E' + RIGHT(s.raw_device_user_id, 4)
                  WHEN '800' THEN 'F' + RIGHT(s.raw_device_user_id, 4)
                  WHEN '900' THEN 'G' + RIGHT(s.raw_device_user_id, 4)
                  WHEN '001' THEN 'L' + RIGHT(s.raw_device_user_id, 4)
                  ELSE NULL
              END
            AND RTRIM(hr.Status) IN ('1', '4')
      );

    DECLARE @updated INT = @@ROWCOUNT;
    PRINT CONCAT('MAPPED: ', @updated);
    PRINT '';

    DECLARE @after INT;
    SELECT @after = COUNT(*)
    FROM dbo.attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
      AND LEN(raw_device_user_id) > 5
      AND LEN(raw_device_user_id) <= 7;
    PRINT CONCAT('Medium (6-7) NEED_REVIEW after: ', @after);

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 039 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
