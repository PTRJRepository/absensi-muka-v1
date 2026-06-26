/*
 * Migration: 027_fix_wrong_parsed_employee_codes.sql
 * Date: 2026-06-22
 * Purpose: Repair attendance_scan_logs with wrong parsed_employee_code
 *
 * ROOT CAUSE: Old parser used machineLocCode instead of scanner prefix.
 * Example: "50040" was mapped to "A0040" instead of "C0040"
 *
 * SSOT ALGORITHM:
 * 1. Scanner prefix at START of ID takes PRIORITY over machineLocCode
 *    Scanner Prefix Map: 100->A, 200->J, 300->B, 400->H, 500->C, 600->D, 700->E, 800->F, 900->G
 * 2. <5 digit IDs -> EXCLUDED
 * 3. 5-digit IDs with scanner prefix -> parse (e.g., 50040 -> C0040)
 * 4. >5-digit IDs with scanner prefix -> parse suffix (e.g., 5000669 -> C0669)
 * 5. >5-digit IDs without scanner prefix -> NEED_REVIEW
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 027: Fix Wrong Parsed Employee Codes';
    PRINT '============================================================';
    PRINT '';

    -- STEP 1: Show current state
    PRINT '=== STEP 1: Current records with 50040, 5000669, etc ===';

    SELECT TOP 20
        id,
        machine_code,
        raw_device_user_id,
        parsed_employee_code,
        mapping_status,
        scan_date
    FROM attendance_scan_logs
    WHERE raw_device_user_id IN ('50040', '5000669', '50001', '500001', '700040', '7000130', '10044')
    ORDER BY raw_device_user_id, scan_date DESC;
    PRINT '';

    -- STEP 2: Count affected records
    PRINT '=== STEP 2: Count affected records ===';

    DECLARE @scanner_records INT;
    SELECT @scanner_records = COUNT(*)
    FROM attendance_scan_logs
    WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) >= 5
      AND parsed_employee_code IS NOT NULL
      AND (
          raw_device_user_id LIKE '100%' OR raw_device_user_id LIKE '200%'
       OR raw_device_user_id LIKE '300%' OR raw_device_user_id LIKE '400%'
       OR raw_device_user_id LIKE '500%' OR raw_device_user_id LIKE '600%'
       OR raw_device_user_id LIKE '700%' OR raw_device_user_id LIKE '800%'
       OR raw_device_user_id LIKE '900%'
      );
    PRINT CONCAT('Scanner prefix records with parsed_employee_code: ', @scanner_records);
    PRINT '';

    -- STEP 3: Show wrong mappings
    PRINT '=== STEP 3: Sample wrong mappings ===';

    SELECT TOP 30
        raw_device_user_id,
        LEN(LTRIM(RTRIM(raw_device_user_id))) AS raw_len,
        LEFT(LTRIM(RTRIM(raw_device_user_id)), 3) AS prefix_3,
        parsed_employee_code,
        CASE
            WHEN raw_device_user_id LIKE '100%' THEN 'A' + RIGHT(raw_device_user_id, 4)
            WHEN raw_device_user_id LIKE '200%' THEN 'J' + RIGHT(raw_device_user_id, 4)
            WHEN raw_device_user_id LIKE '300%' THEN 'B' + RIGHT(raw_device_user_id, 4)
            WHEN raw_device_user_id LIKE '400%' THEN 'H' + RIGHT(raw_device_user_id, 4)
            WHEN raw_device_user_id LIKE '500%' THEN 'C' + RIGHT(raw_device_user_id, 4)
            WHEN raw_device_user_id LIKE '600%' THEN 'D' + RIGHT(raw_device_user_id, 4)
            WHEN raw_device_user_id LIKE '700%' THEN 'E' + RIGHT(raw_device_user_id, 4)
            WHEN raw_device_user_id LIKE '800%' THEN 'F' + RIGHT(raw_device_user_id, 4)
            WHEN raw_device_user_id LIKE '900%' THEN 'G' + RIGHT(raw_device_user_id, 4)
            ELSE NULL
        END AS should_be,
        CASE
            WHEN parsed_employee_code <>
                CASE
                    WHEN raw_device_user_id LIKE '100%' THEN 'A' + RIGHT(raw_device_user_id, 4)
                    WHEN raw_device_user_id LIKE '200%' THEN 'J' + RIGHT(raw_device_user_id, 4)
                    WHEN raw_device_user_id LIKE '300%' THEN 'B' + RIGHT(raw_device_user_id, 4)
                    WHEN raw_device_user_id LIKE '400%' THEN 'H' + RIGHT(raw_device_user_id, 4)
                    WHEN raw_device_user_id LIKE '500%' THEN 'C' + RIGHT(raw_device_user_id, 4)
                    WHEN raw_device_user_id LIKE '600%' THEN 'D' + RIGHT(raw_device_user_id, 4)
                    WHEN raw_device_user_id LIKE '700%' THEN 'E' + RIGHT(raw_device_user_id, 4)
                    WHEN raw_device_user_id LIKE '800%' THEN 'F' + RIGHT(raw_device_user_id, 4)
                    WHEN raw_device_user_id LIKE '900%' THEN 'G' + RIGHT(raw_device_user_id, 4)
                    ELSE NULL
                END
            THEN 'WRONG'
            ELSE 'OK'
        END AS status,
        COUNT(*) OVER () AS total_wrong
    FROM attendance_scan_logs
    WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) >= 5
      AND parsed_employee_code IS NOT NULL
      AND (
          raw_device_user_id LIKE '100%' OR raw_device_user_id LIKE '200%'
       OR raw_device_user_id LIKE '300%' OR raw_device_user_id LIKE '400%'
       OR raw_device_user_id LIKE '500%' OR raw_device_user_id LIKE '600%'
       OR raw_device_user_id LIKE '700%' OR raw_device_user_id LIKE '800%'
       OR raw_device_user_id LIKE '900%'
      )
    GROUP BY raw_device_user_id, parsed_employee_code
    ORDER BY status DESC, raw_device_user_id;
    PRINT '';

    -- STEP 4: Backup wrong records
    PRINT '=== STEP 4: Backup wrong records ===';

    IF OBJECT_ID('tempdb..#migrate_027_backup') IS NOT NULL
        DROP TABLE #migrate_027_backup;

    SELECT
        s.id,
        s.machine_code,
        s.raw_device_user_id,
        s.parsed_employee_code AS old_code,
        s.mapping_status AS old_status,
        s.mapping_reason AS old_reason,
        CASE
            WHEN s.raw_device_user_id LIKE '100%' THEN 'A' + RIGHT(s.raw_device_user_id, 4)
            WHEN s.raw_device_user_id LIKE '200%' THEN 'J' + RIGHT(s.raw_device_user_id, 4)
            WHEN s.raw_device_user_id LIKE '300%' THEN 'B' + RIGHT(s.raw_device_user_id, 4)
            WHEN s.raw_device_user_id LIKE '400%' THEN 'H' + RIGHT(s.raw_device_user_id, 4)
            WHEN s.raw_device_user_id LIKE '500%' THEN 'C' + RIGHT(s.raw_device_user_id, 4)
            WHEN s.raw_device_user_id LIKE '600%' THEN 'D' + RIGHT(s.raw_device_user_id, 4)
            WHEN s.raw_device_user_id LIKE '700%' THEN 'E' + RIGHT(s.raw_device_user_id, 4)
            WHEN s.raw_device_user_id LIKE '800%' THEN 'F' + RIGHT(s.raw_device_user_id, 4)
            WHEN s.raw_device_user_id LIKE '900%' THEN 'G' + RIGHT(s.raw_device_user_id, 4)
            ELSE NULL
        END AS new_code,
        CASE
            WHEN s.raw_device_user_id LIKE '100%' THEN 'A'
            WHEN s.raw_device_user_id LIKE '200%' THEN 'J'
            WHEN s.raw_device_user_id LIKE '300%' THEN 'B'
            WHEN s.raw_device_user_id LIKE '400%' THEN 'H'
            WHEN s.raw_device_user_id LIKE '500%' THEN 'C'
            WHEN s.raw_device_user_id LIKE '600%' THEN 'D'
            WHEN s.raw_device_user_id LIKE '700%' THEN 'E'
            WHEN s.raw_device_user_id LIKE '800%' THEN 'F'
            WHEN s.raw_device_user_id LIKE '900%' THEN 'G'
            ELSE NULL
        END AS new_div,
        GETDATE() AS backed_up_at
    INTO #migrate_027_backup
    FROM attendance_scan_logs s
    WHERE LEN(LTRIM(RTRIM(s.raw_device_user_id))) >= 5
      AND s.parsed_employee_code IS NOT NULL
      AND s.parsed_employee_code <>
          CASE
              WHEN s.raw_device_user_id LIKE '100%' THEN 'A' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '200%' THEN 'J' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '300%' THEN 'B' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '400%' THEN 'H' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '500%' THEN 'C' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '600%' THEN 'D' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '700%' THEN 'E' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '800%' THEN 'F' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '900%' THEN 'G' + RIGHT(s.raw_device_user_id, 4)
              ELSE NULL
          END
      AND (
          s.raw_device_user_id LIKE '100%' OR s.raw_device_user_id LIKE '200%'
       OR s.raw_device_user_id LIKE '300%' OR s.raw_device_user_id LIKE '400%'
       OR s.raw_device_user_id LIKE '500%' OR s.raw_device_user_id LIKE '600%'
       OR s.raw_device_user_id LIKE '700%' OR s.raw_device_user_id LIKE '800%'
       OR s.raw_device_user_id LIKE '900%'
      );

    DECLARE @backup_rows INT = @@ROWCOUNT;
    PRINT CONCAT('Backup rows: ', @backup_rows);
    PRINT '';

    -- STEP 5: Show backup sample
    PRINT '=== STEP 5: Backup sample ===';

    SELECT TOP 20 * FROM #migrate_027_backup ORDER BY old_code;
    PRINT '';

    -- STEP 6: Perform the fix
    PRINT '=== STEP 6: Fixing parsed_employee_code ===';

    UPDATE s
    SET
        parsed_employee_code =
            CASE
                WHEN s.raw_device_user_id LIKE '100%' THEN 'A' + RIGHT(s.raw_device_user_id, 4)
                WHEN s.raw_device_user_id LIKE '200%' THEN 'J' + RIGHT(s.raw_device_user_id, 4)
                WHEN s.raw_device_user_id LIKE '300%' THEN 'B' + RIGHT(s.raw_device_user_id, 4)
                WHEN s.raw_device_user_id LIKE '400%' THEN 'H' + RIGHT(s.raw_device_user_id, 4)
                WHEN s.raw_device_user_id LIKE '500%' THEN 'C' + RIGHT(s.raw_device_user_id, 4)
                WHEN s.raw_device_user_id LIKE '600%' THEN 'D' + RIGHT(s.raw_device_user_id, 4)
                WHEN s.raw_device_user_id LIKE '700%' THEN 'E' + RIGHT(s.raw_device_user_id, 4)
                WHEN s.raw_device_user_id LIKE '800%' THEN 'F' + RIGHT(s.raw_device_user_id, 4)
                WHEN s.raw_device_user_id LIKE '900%' THEN 'G' + RIGHT(s.raw_device_user_id, 4)
                ELSE s.parsed_employee_code
            END,
        parsed_division_code =
            CASE
                WHEN s.raw_device_user_id LIKE '100%' THEN 'A'
                WHEN s.raw_device_user_id LIKE '200%' THEN 'J'
                WHEN s.raw_device_user_id LIKE '300%' THEN 'B'
                WHEN s.raw_device_user_id LIKE '400%' THEN 'H'
                WHEN s.raw_device_user_id LIKE '500%' THEN 'C'
                WHEN s.raw_device_user_id LIKE '600%' THEN 'D'
                WHEN s.raw_device_user_id LIKE '700%' THEN 'E'
                WHEN s.raw_device_user_id LIKE '800%' THEN 'F'
                WHEN s.raw_device_user_id LIKE '900%' THEN 'G'
                ELSE s.parsed_division_code
            END,
        mapping_status = 'MAPPED',
        mapping_reason = 'SSOT_REPAIR_20260622'
    FROM attendance_scan_logs s
    WHERE LEN(LTRIM(RTRIM(s.raw_device_user_id))) >= 5
      AND s.parsed_employee_code IS NOT NULL
      AND s.parsed_employee_code <>
          CASE
              WHEN s.raw_device_user_id LIKE '100%' THEN 'A' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '200%' THEN 'J' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '300%' THEN 'B' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '400%' THEN 'H' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '500%' THEN 'C' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '600%' THEN 'D' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '700%' THEN 'E' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '800%' THEN 'F' + RIGHT(s.raw_device_user_id, 4)
              WHEN s.raw_device_user_id LIKE '900%' THEN 'G' + RIGHT(s.raw_device_user_id, 4)
              ELSE NULL
          END
      AND (
          s.raw_device_user_id LIKE '100%' OR s.raw_device_user_id LIKE '200%'
       OR s.raw_device_user_id LIKE '300%' OR s.raw_device_user_id LIKE '400%'
       OR s.raw_device_user_id LIKE '500%' OR s.raw_device_user_id LIKE '600%'
       OR s.raw_device_user_id LIKE '700%' OR s.raw_device_user_id LIKE '800%'
       OR s.raw_device_user_id LIKE '900%'
      );

    DECLARE @fixed_rows INT = @@ROWCOUNT;
    PRINT CONCAT('Rows fixed: ', @fixed_rows);
    PRINT '';

    -- STEP 7: Verify fix for 50040
    PRINT '=== STEP 7: Verify 50040 -> C0040 ===';

    SELECT id, machine_code, raw_device_user_id, parsed_employee_code, mapping_status, scan_date
    FROM attendance_scan_logs
    WHERE raw_device_user_id IN ('50040', '5000669', '700040', '10044', '50001')
    ORDER BY raw_device_user_id, scan_date DESC;
    PRINT '';

    -- STEP 8: Fix zkteco_hr_employee_map wrong mappings
    PRINT '=== STEP 8: Fix zkteco_hr_employee_map ===';

    DECLARE @hr_count INT;
    SELECT @hr_count = COUNT(*)
    FROM zkteco_hr_employee_map
    WHERE is_active = 1
      AND LEN(LTRIM(RTRIM(zkteco_user_id))) >= 5
      AND (
          zkteco_user_id LIKE '100%' OR zkteco_user_id LIKE '200%'
       OR zkteco_user_id LIKE '300%' OR zkteco_user_id LIKE '400%'
       OR zkteco_user_id LIKE '500%' OR zkteco_user_id LIKE '600%'
       OR zkteco_user_id LIKE '700%' OR zkteco_user_id LIKE '800%'
       OR zkteco_user_id LIKE '900%'
      );
    PRINT CONCAT('HR map scanner prefix records: ', @hr_count);

    IF @hr_count > 0
    BEGIN
        PRINT 'Deactivating scanner-prefix HR map records for review...';

        UPDATE m
        SET m.is_active = 0, m.updated_at = GETDATE()
        FROM zkteco_hr_employee_map m
        WHERE m.is_active = 1
          AND LEN(LTRIM(RTRIM(m.zkteco_user_id))) >= 5
          AND UPPER(COALESCE(m.match_method, '')) NOT IN ('MANUAL_OVERRIDE', 'MANUAL', 'EMPLOYEE_MAPPING_OVERRIDES')
          AND (
              m.zkteco_user_id LIKE '100%' OR m.zkteco_user_id LIKE '200%'
           OR m.zkteco_user_id LIKE '300%' OR m.zkteco_user_id LIKE '400%'
           OR m.zkteco_user_id LIKE '500%' OR m.zkteco_user_id LIKE '600%'
           OR m.zkteco_user_id LIKE '700%' OR m.zkteco_user_id LIKE '800%'
           OR m.zkteco_user_id LIKE '900%'
          );

        DECLARE @hr_deactivated INT = @@ROWCOUNT;
        PRINT CONCAT('HR map rows deactivated: ', @hr_deactivated);
    END
    PRINT '';

    -- STEP 9: Summary
    PRINT '============================================================';
    PRINT 'MIGRATION 027 COMPLETED';
    PRINT '============================================================';
    PRINT CONCAT('Backup rows: ', @backup_rows);
    PRINT CONCAT('Fixed scan_log rows: ', @fixed_rows);
    PRINT '';
    PRINT 'Verify: SELECT * FROM attendance_scan_logs WHERE raw_device_user_id = ''50040'' (should be C0040)';
    PRINT 'Run: npx ts-node src/scripts/run-migration-027.ts';
    PRINT '';

    COMMIT TRANSACTION;

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
