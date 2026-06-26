/*
 * Migration: 034_fix_001_ijl_need_review.sql
 * Date: 2026-06-22
 * Purpose: Re-process 001* raw IDs (IJL machine) — parse as L* and validate against db_ptrj.HR_EMPLOYEE
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 034: Fix 001* NEED_REVIEW records from IJL';
    PRINT '============================================================';
    PRINT '';

    -- Count before
    DECLARE @before INT;
    SELECT @before = COUNT(*)
    FROM dbo.attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
      AND LEFT(raw_device_user_id, 3) = '001';
    PRINT CONCAT('NEED_REVIEW 001* records before: ', @before);
    PRINT '';

    -- Re-process 001* records: strip prefix '001', pad last digits to 4 chars, prefix 'L'
    -- Example: 0010097 → L0097
    -- SUBSTRING(id, 4, LEN(id)-3) strips the '001' prefix cleanly
    UPDATE s
    SET
        s.parsed_employee_code = 'L' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 4, LEN(s.raw_device_user_id) - 3), 4),
        s.mapping_status = 'MAPPED',
        s.mapping_reason = 'PARSED_SCANNER_PREFIX_001_L_VALIDATED',
        s.parsed_division_code = 'IJL'
    FROM dbo.attendance_scan_logs s
    WHERE s.mapping_status = 'NEED_REVIEW'
      AND LEFT(s.raw_device_user_id, 3) = '001'
      AND EXISTS (
        SELECT 1
        FROM db_ptrj.dbo.HR_EMPLOYEE hr
        WHERE RTRIM(hr.EmpCode) = 'L' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 4, LEN(s.raw_device_user_id) - 3), 4)
          AND RTRIM(hr.Status) IN ('1', '4')
      );

    DECLARE @updated INT = @@ROWCOUNT;
    PRINT CONCAT('MAPPED via 001->L parser + db_ptrj validation: ', @updated);
    PRINT '';

    -- Mark as UNMAPPED those 001* records where parsed L* code does NOT exist in db_ptrj
    UPDATE s
    SET
        s.mapping_status = 'UNMAPPED',
        s.mapping_reason = 'PARSED_001_NOT_FOUND_IN_DB_PTRJ',
        s.parsed_employee_code = NULL
    FROM dbo.attendance_scan_logs s
    WHERE s.mapping_status = 'NEED_REVIEW'
      AND LEFT(s.raw_device_user_id, 3) = '001'
      AND NOT EXISTS (
        SELECT 1
        FROM db_ptrj.dbo.HR_EMPLOYEE hr
        WHERE RTRIM(hr.EmpCode) = 'L' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 4, LEN(s.raw_device_user_id) - 3), 4)
          AND RTRIM(hr.Status) IN ('1', '4')
      );

    DECLARE @unmapped INT = @@ROWCOUNT;
    PRINT CONCAT('UNMAPPED (L* not in db_ptrj): ', @unmapped);

    -- Count after
    DECLARE @after INT;
    SELECT @after = COUNT(*)
    FROM dbo.attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
      AND LEFT(raw_device_user_id, 3) = '001';
    PRINT '';
    PRINT CONCAT('NEED_REVIEW 001* records after: ', @after);
    PRINT '';

    -- Overall scan_logs summary
    PRINT '=== attendance_scan_logs final summary ===';
    SELECT
        SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) AS mapped,
        SUM(CASE WHEN mapping_status = 'NEED_REVIEW' THEN 1 ELSE 0 END) AS need_review,
        SUM(CASE WHEN mapping_status = 'UNMAPPED' THEN 1 ELSE 0 END) AS unmapped,
        COUNT(*) AS total
    FROM dbo.attendance_scan_logs;

    COMMIT TRANSACTION;
    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 034 COMPLETED';
    PRINT '============================================================';

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
