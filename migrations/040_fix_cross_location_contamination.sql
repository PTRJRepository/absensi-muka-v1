/*
 * Migration: 040_fix_cross_location_contamination.sql
 * Date: 2026-06-23
 * Purpose: Fix cross-location contamination in zkteco_hr_employee_map
 *
 * Problem: 39 zkteco_user_ids mapped to multiple hr_employee_codes across machines
 * Example: card 10100 (SUBHANA NUGRAHA) → E0100, J0100, H0100, D0100 across 8 machines
 *
 * Strategy:
 *   1. Fix 31 rows via employees table (zkteco_user_id exists → correct employee_code)
 *   2. Fix 115 rows via db_ptrj name match
 *   3. Deactivate ~73 unresolved rows
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    PRINT '============================================================';
    PRINT 'MIGRATION 040: Fix Cross-Location Contamination';
    PRINT '============================================================';

    -- Step 1: Fix via employees table (31 rows)
    PRINT '';
    PRINT '--- Step 1: Fix via employees table ---';

    DECLARE @step1_before INT;
    SELECT @step1_before = COUNT(*)
    FROM dbo.zkteco_hr_employee_map m
    JOIN dbo.employees e ON e.zkteco_user_id = m.zkteco_user_id
    WHERE m.is_active = 1
      AND m.hr_employee_code <> e.employee_code
      AND m.zkteco_user_id IN (
          SELECT zkteco_user_id
          FROM dbo.zkteco_hr_employee_map
          WHERE is_active = 1
          GROUP BY zkteco_user_id
          HAVING COUNT(DISTINCT hr_employee_code) > 1
      );
    PRINT CONCAT('Step 1 rows to fix (employees table): ', @step1_before);

    UPDATE m
    SET
        m.hr_employee_code = e.employee_code,
        m.hr_employee_name = e.employee_name,
        m.match_confidence = 'EXACT',
        m.match_method = 'EMPLOYEES_TABLE_LOOKUP',
        m.updated_at = GETDATE()
    FROM dbo.zkteco_hr_employee_map m
    JOIN dbo.employees e ON e.zkteco_user_id = m.zkteco_user_id
    WHERE m.is_active = 1
      AND m.hr_employee_code <> e.employee_code
      AND m.zkteco_user_id IN (
          SELECT zkteco_user_id
          FROM dbo.zkteco_hr_employee_map
          WHERE is_active = 1
          GROUP BY zkteco_user_id
          HAVING COUNT(DISTINCT hr_employee_code) > 1
      )
      AND EXISTS (
          SELECT 1
          FROM db_ptrj.dbo.HR_EMPLOYEE hr
          WHERE RTRIM(hr.EmpCode) = e.employee_code
            AND RTRIM(hr.Status) IN ('1', '4')
      );

    DECLARE @step1_updated INT = @@ROWCOUNT;
    PRINT CONCAT('Step 1 updated: ', @step1_updated);

    -- Step 2: Fix via db_ptrj name match
    PRINT '';
    PRINT '--- Step 2: Fix via db_ptrj name match ---';

    DECLARE @step2_before INT;
    SELECT @step2_before = COUNT(*)
    FROM dbo.zkteco_hr_employee_map m
    WHERE m.is_active = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.employees e WHERE e.zkteco_user_id = m.zkteco_user_id)
      AND m.zkteco_user_id IN (
          SELECT zkteco_user_id
          FROM dbo.zkteco_hr_employee_map
          WHERE is_active = 1
          GROUP BY zkteco_user_id
          HAVING COUNT(DISTINCT hr_employee_code) > 1
      );
    PRINT CONCAT('Step 2 rows to fix (db_ptrj name match): ', @step2_before);

    UPDATE m
    SET
        m.hr_employee_code = hr.EmpCode,
        m.hr_employee_name = hr.EmpName,
        m.match_confidence = 'STRONG',
        m.match_method = 'DB_PTRJ_NAME_MATCH',
        m.updated_at = GETDATE()
    FROM dbo.zkteco_hr_employee_map m
    CROSS APPLY (
        SELECT TOP 1 EmpCode, EmpName
        FROM db_ptrj.dbo.HR_EMPLOYEE hr
        WHERE RTRIM(hr.EmpName) LIKE '%' + RTRIM(m.zkteco_user_name) + '%'
          AND RTRIM(hr.Status) IN ('1', '4')
        ORDER BY LEN(RTRIM(hr.EmpName)) ASC
    ) hr
    WHERE m.is_active = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.employees e WHERE e.zkteco_user_id = m.zkteco_user_id)
      AND m.hr_employee_code <> hr.EmpCode
      AND m.zkteco_user_id IN (
          SELECT zkteco_user_id
          FROM dbo.zkteco_hr_employee_map
          WHERE is_active = 1
          GROUP BY zkteco_user_id
          HAVING COUNT(DISTINCT hr_employee_code) > 1
      );

    DECLARE @step2_updated INT = @@ROWCOUNT;
    PRINT CONCAT('Step 2 updated: ', @step2_updated);

    -- Step 3: Deactivate remaining contaminated rows
    PRINT '';
    PRINT '--- Step 3: Deactivate unresolved ---';

    DECLARE @step3_before INT;
    SELECT @step3_before = COUNT(*)
    FROM dbo.zkteco_hr_employee_map m
    WHERE m.is_active = 1
      AND m.zkteco_user_id IN (
          SELECT zkteco_user_id
          FROM dbo.zkteco_hr_employee_map
          WHERE is_active = 1
          GROUP BY zkteco_user_id
          HAVING COUNT(DISTINCT hr_employee_code) > 1
      );
    PRINT CONCAT('Step 3 rows remaining in contaminated group: ', @step3_before);

    UPDATE m
    SET
        m.is_active = 0,
        m.match_confidence = 'UNMATCHED',
        m.updated_at = GETDATE()
    FROM dbo.zkteco_hr_employee_map m
    WHERE m.is_active = 1
      AND m.hr_employee_code IS NOT NULL
      AND m.zkteco_user_id IN (
          SELECT zkteco_user_id
          FROM dbo.zkteco_hr_employee_map
          WHERE is_active = 1
          GROUP BY zkteco_user_id
          HAVING COUNT(DISTINCT hr_employee_code) > 1
      );

    DECLARE @step3_updated INT = @@ROWCOUNT;
    PRINT CONCAT('Step 3 deactivated: ', @step3_updated);

    -- Verify: remaining contaminated IDs
    PRINT '';
    PRINT '--- Verification ---';

    DECLARE @remaining INT;
    SELECT @remaining = COUNT(DISTINCT zkteco_user_id)
    FROM dbo.zkteco_hr_employee_map
    WHERE is_active = 1
    GROUP BY zkteco_user_id
    HAVING COUNT(DISTINCT hr_employee_code) > 1;
    PRINT CONCAT('Remaining contaminated IDs (should be 0): ', ISNULL(@remaining, 0));

    PRINT '';
    PRINT '============================================================';
    PRINT 'MIGRATION 040 COMPLETED';
    PRINT CONCAT('Total rows fixed: ', @step1_updated + @step2_updated);
    PRINT CONCAT('Total rows deactivated: ', @step3_updated);
    PRINT '============================================================';

    COMMIT TRANSACTION;

END TRY
BEGIN CATCH
    PRINT 'ERROR:';
    PRINT ERROR_MESSAGE();
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    RAISERROR('Migration failed', 16, 1);
END CATCH;
