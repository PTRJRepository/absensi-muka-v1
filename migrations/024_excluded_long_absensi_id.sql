/*
 * Migration: 024_excluded_long_absensi_id.sql
 * Date: 2026-06-22
 * Purpose: Fix raw_device_user_id with length > 5 that were incorrectly mapped
 * Source: PRD - Rule Exclude Mapping untuk ID Panjang
 *
 * BR-003: raw_device_user_id numerik dengan panjang > 5 digit TIDAK boleh
 * di-auto mapping menjadi parsed_employee_code.
 *
 * Before this migration:
 *   raw_device_user_id = '100123456' -> parsed_employee_code = 'A3456' (SALAH)
 *
 * After this migration:
 *   raw_device_user_id = '100123456' -> parsed_employee_code = NULL
 *   mapping_status = 'NEED_REVIEW'
 *   mapping_reason = 'EXCLUDED_LONG_ABSENSI_ID_LENGTH_9'
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '=== MIGRATION 024: Exclude Long Absensi IDs ===';
    PRINT '';

    -- Count before update
    DECLARE @before_count INT;
    SELECT @before_count = COUNT(*)
    FROM [rebinmas_absensi_monitoring].[dbo].[attendance_scan_logs]
    WHERE raw_device_user_id LIKE '100%'
      AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 5;

    PRINT CONCAT('Records to update (ID panjang > 5): ', @before_count);
    PRINT '';

    -- Count how many still have parsed_employee_code set (these need fixing)
    DECLARE @with_invalid_mapping INT;
    SELECT @with_invalid_mapping = COUNT(*)
    FROM [rebinmas_absensi_monitoring].[dbo].[attendance_scan_logs]
    WHERE raw_device_user_id LIKE '100%'
      AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 5
      AND parsed_employee_code IS NOT NULL;

    PRINT CONCAT('Records WITH invalid parsed_employee_code: ', @with_invalid_mapping);
    PRINT '';

    IF @with_invalid_mapping > 0
    BEGIN
        PRINT '=== UPDATE INVALID MAPPINGS ===';

        -- Show sample before
        PRINT 'Sample records BEFORE update:';
        SELECT TOP 10
            id,
            machine_code,
            raw_device_user_id,
            LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) AS raw_id_length,
            parsed_employee_code,
            mapping_status,
            mapping_reason,
            scan_date
        FROM [rebinmas_absensi_monitoring].[dbo].[attendance_scan_logs]
        WHERE raw_device_user_id LIKE '100%'
          AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 5
          AND parsed_employee_code IS NOT NULL
        ORDER BY scan_date DESC;
    END

    -- Perform the update
    UPDATE s
    SET
        parsed_employee_code = NULL,
        parsed_division_code = NULL,
        mapping_status = 'NEED_REVIEW',
        mapping_reason = CONCAT(
            'EXCLUDED_LONG_ABSENSI_ID_LENGTH_',
            LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50)))))
        )
    FROM [rebinmas_absensi_monitoring].[dbo].[attendance_scan_logs] s
    WHERE s.raw_device_user_id LIKE '100%'
      AND LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))) > 5;

    DECLARE @affected_rows INT = @@ROWCOUNT;
    PRINT CONCAT('Rows affected by UPDATE: ', @affected_rows);
    PRINT '';

    -- Validation 1: Should return 0 rows
    PRINT '=== VALIDATION 1: No long IDs should have parsed_employee_code ===';
    DECLARE @invalid_mappings INT;
    SELECT @invalid_mappings = COUNT(*)
    FROM [rebinmas_absensi_monitoring].[dbo].[attendance_scan_logs]
    WHERE raw_device_user_id LIKE '100%'
      AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 5
      AND parsed_employee_code IS NOT NULL;

    PRINT CONCAT('Invalid mappings remaining: ', @invalid_mappings);

    IF @invalid_mappings > 0
    BEGIN
        PRINT 'ERROR: Validation failed! There are still long IDs with parsed_employee_code.';
        ROLLBACK TRANSACTION;
        RETURN;
    END
    ELSE
    BEGIN
        PRINT 'PASS: All long IDs now have parsed_employee_code = NULL';
    END
    PRINT '';

    -- Validation 2: Show summary of updated records
    PRINT '=== VALIDATION 2: Summary of excluded long IDs ===';
    SELECT
        machine_code,
        LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) AS raw_id_length,
        COUNT(*) AS record_count,
        MIN(scan_date) AS first_scan,
        MAX(scan_date) AS last_scan,
        MAX(mapping_reason) AS new_mapping_reason
    FROM [rebinmas_absensi_monitoring].[dbo].[attendance_scan_logs]
    WHERE raw_device_user_id LIKE '100%'
      AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 5
    GROUP BY
        machine_code,
        LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50)))))
    ORDER BY record_count DESC;
    PRINT '';

    -- Validation 3: Show sample after
    PRINT '=== VALIDATION 3: Sample records AFTER update ===';
    SELECT TOP 10
        id,
        machine_code,
        raw_device_user_id,
        LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) AS raw_id_length,
        parsed_employee_code,
        mapping_status,
        mapping_reason,
        scan_date
    FROM [rebinmas_absensi_monitoring].[dbo].[attendance_scan_logs]
    WHERE raw_device_user_id LIKE '100%'
      AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 5
    ORDER BY scan_date DESC;
    PRINT '';

    -- Also update zkteco_hr_employee_map for consistency
    PRINT '=== ALSO UPDATE zkteco_hr_employee_map ===';

    DECLARE @hr_map_before INT;
    SELECT @hr_map_before = COUNT(*)
    FROM [rebinmas_absensi_monitoring].[dbo].[zkteco_hr_employee_map]
    WHERE zkteco_user_id LIKE '100%'
      AND LEN(LTRIM(RTRIM(CAST(zkteco_user_id AS NVARCHAR(50))))) > 5;

    PRINT CONCAT('HR map records with long IDs before: ', @hr_map_before);

    IF @hr_map_before > 0
    BEGIN
        PRINT 'Note: HR mapping records with long IDs are preserved for reference.';
        PRINT 'These should be reviewed manually if needed.';
    END
    PRINT '';

    PRINT '=== MIGRATION 024 COMPLETED SUCCESSFULLY ===';
    PRINT '';
    PRINT 'Run the following query to verify:';
    PRINT '  SELECT COUNT(*) FROM attendance_scan_logs';
    PRINT '  WHERE raw_device_user_id LIKE ''100%''';
    PRINT '    AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 5';
    PRINT '    AND parsed_employee_code IS NOT NULL;';
    PRINT 'Expected result: 0';

    COMMIT TRANSACTION;

END TRY
BEGIN CATCH
    PRINT '=== ERROR DURING MIGRATION ===';
    PRINT CONCAT('Error Number: ', ERROR_NUMBER());
    PRINT CONCAT('Error Message: ', ERROR_MESSAGE());
    PRINT CONCAT('Error Line: ', ERROR_LINE());

    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    RAISERROR('Migration failed. Transaction rolled back.', 16, 1);
END CATCH;
