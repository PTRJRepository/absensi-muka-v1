-- ============================================================
-- [PHASE 2] RESTORE MASTER TABLES
-- attendance_machines + employees
-- ============================================================
-- Prerequisites: Phase 0 & Phase 1 complete
-- Duration: ~30 seconds
-- ============================================================

PRINT '=== [PHASE 2] RESTORE MASTER TABLES ===';

-- ============================================================
-- 2A: Restore attendance_machines
-- ============================================================
PRINT '';
PRINT '  [2A] Restoring attendance_machines...';

-- Check if backup exists
IF OBJECT_ID('attendance_machines_backup_20260623', 'U') IS NULL
BEGIN
    PRINT '  ERROR: attendance_machines_backup_20260623 NOT FOUND';
    PRINT '  Attempting manual seed from documentation...';

    -- Manual seed if backup not available
    IF NOT EXISTS (SELECT 1 FROM attendance_machines)
    BEGIN
        SET IDENTITY_INSERT attendance_machines ON;

        INSERT INTO attendance_machines (id, machine_code, location_name, ip_address, port, machine_type, scanner_code, loc_code, access_status, data_source, is_active, created_at, updated_at)
        VALUES
        (1, 'P1A', 'P1A Estate Office', '10.0.0.11', 4370, 'inBio', 100, 'A', 'ACCESSIBLE', 'DIRECT_ZKTECO', 1, GETDATE(), GETDATE()),
        (2, 'P1B', 'P1B Estate Office', '10.0.0.12', 4370, 'inBio', 300, 'B', 'ACCESSIBLE', 'DIRECT_ZKTECO', 1, GETDATE(), GETDATE()),
        (3, 'OFFICE_PGE', 'PGE Office', '10.0.0.10', 4370, 'inBio', NULL, NULL, 'ACCESSIBLE', 'DIRECT_ZKTECO', 1, GETDATE(), GETDATE()),
        (4, 'OFFICE_APE', 'APE Estate Office', '103.144.208.154', 4370, 'inBio', NULL, NULL, 'ACCESSIBLE', 'DIRECT_ZKTECO', 1, GETDATE(), GETDATE()),
        (5, 'MILL', 'Mill Office', '103.127.66.32', 4370, 'inBio', NULL, NULL, 'ACCESSIBLE', 'DIRECT_ZKTECO', 1, GETDATE(), GETDATE()),
        (6, 'IJL', 'IJL Estate Office', '103.144.211.226', 4370, 'inBio', NULL, NULL, 'ACCESSIBLE', 'DIRECT_ZKTECO', 1, GETDATE(), GETDATE()),
        (7, 'AB2', 'AB2 Estate Office', '10.0.0.10', 4370, 'inBio', 400, 'H', 'ACCESSIBLE', 'DIRECT_ZKTECO', 1, GETDATE(), GETDATE());

        SET IDENTITY_INSERT attendance_machines OFF;
        PRINT '  Seeded 7 machines manually from documentation';
    END
    ELSE
    BEGIN
        PRINT '  attendance_machines already has data, skipping seed';
    END
END
ELSE
BEGIN
    -- Restore from backup
    DECLARE @machines_restored INT = 0;
    SET IDENTITY_INSERT attendance_machines ON;

    INSERT INTO attendance_machines (
        id, machine_code, location_name, ip_address, port, local_ip, machine_type,
        scanner_code, loc_code, access_status, data_source, notes,
        is_active, last_sync_at, last_error_message, created_at, updated_at
    )
    SELECT
        b.id, b.machine_code, b.location_name, b.ip_address, b.port, b.local_ip, b.machine_type,
        b.scanner_code, b.loc_code, b.access_status, b.data_source, b.notes,
        b.is_active, b.last_sync_at, b.last_error_message, b.created_at, b.updated_at
    FROM attendance_machines_backup_20260623 b
    WHERE NOT EXISTS (
        SELECT 1 FROM attendance_machines m WHERE m.id = b.id
    );

    SET @machines_restored = @@ROWCOUNT;
    SET IDENTITY_INSERT attendance_machines OFF;

    PRINT '  Restored ' + CAST(@machines_restored AS VARCHAR) + ' machines from backup';
END

-- Verify
DECLARE @machines_total INT = (SELECT COUNT(*) FROM attendance_machines);
PRINT '  Total machines in attendance_machines: ' + CAST(@machines_total AS VARCHAR);
IF @machines_total = 0
BEGIN
    PRINT '  CRITICAL: No machines restored! Sync will fail.';
END

-- ============================================================
-- 2B: Restore employees
-- ============================================================
PRINT '';
PRINT '  [2B] Restoring employees...';

IF OBJECT_ID('employees_backup_20260623', 'U') IS NULL
BEGIN
    PRINT '  employees_backup_20260623 NOT FOUND';

    -- Check for alternative backup
    IF OBJECT_ID('zkteco_absensi_user_registry_backup_current_empcode_20260623', 'U') IS NOT NULL
    BEGIN
        PRINT '  Found: zkteco_absensi_user_registry_backup_current_empcode_20260623 - will use as source';
        -- This is a registry table, not employees table - skip
    END

    -- Try rebuilding from HR source DB_PTRJ
    PRINT '  Attempting rebuild from HR source (DB_PTRJ.dbo.HR_EMPLOYEE)...';

    BEGIN TRY
        INSERT INTO employees (
            employee_code, employee_name, division_id, gang_id,
            employment_status, is_active, created_at, updated_at
        )
        SELECT TOP 5000
            h.EmpCode,
            h.EmpName,
            COALESCE(d.id, 1) AS division_id,
            NULL AS gang_id,
            CASE WHEN h.Status = '1' THEN 'ACTIVE' ELSE 'INACTIVE' END,
            CASE WHEN h.Status = '1' THEN 1 ELSE 0 END,
            GETDATE(),
            GETDATE()
        FROM DB_PTRJ.dbo.HR_EMPLOYEE h
        LEFT JOIN divisions d ON d.division_code = LEFT(h.EmpCode, 1)
        WHERE h.EmpCode IS NOT NULL
          AND LEN(LTRIM(RTRIM(h.EmpCode))) >= 4
          AND NOT EXISTS (
              SELECT 1 FROM employees e WHERE e.employee_code = h.EmpCode
          );

        PRINT '  Inserted ' + CAST(@@ROWCOUNT AS VARCHAR) + ' employees from DB_PTRJ.HR_EMPLOYEE';
    END TRY BEGIN CATCH
        PRINT '  ERROR rebuilding from HR: ' + ERROR_MESSAGE();
        PRINT '  employees table may remain empty - manual intervention required';
    END CATCH
END
ELSE
BEGIN
    -- Restore from backup
    DECLARE @employees_restored INT = 0;
    SET IDENTITY_INSERT employees ON;

    INSERT INTO employees (
        id, employee_code, employee_name, division_id, gang_id,
        employment_status, is_active, created_at, updated_at
    )
    SELECT
        b.id, b.employee_code, b.employee_name, b.division_id, b.gang_id,
        b.employment_status, b.is_active, b.created_at, b.updated_at
    FROM employees_backup_20260623 b
    WHERE NOT EXISTS (
        SELECT 1 FROM employees e WHERE e.id = b.id
    );

    SET @employees_restored = @@ROWCOUNT;
    SET IDENTITY_INSERT employees OFF;

    PRINT '  Restored ' + CAST(@employees_restored AS VARCHAR) + ' employees from backup';
END

-- Verify
DECLARE @employees_total INT = (SELECT COUNT(*) FROM employees);
PRINT '  Total employees in employees table: ' + CAST(@employees_total AS VARCHAR);

IF @employees_total > 0
BEGIN
    PRINT '';
    PRINT '  [2B.1] Division distribution:';
    SELECT
        LEFT(employee_code, 1) AS division_code,
        COUNT(*) AS total,
        COUNT(CASE WHEN employment_status = 'ACTIVE' THEN 1 END) AS active
    FROM employees
    GROUP BY LEFT(employee_code, 1)
    ORDER BY division_code;

    -- Check if we have non-G employees
    DECLARE @non_g_count INT = (SELECT COUNT(*) FROM employees WHERE LEFT(employee_code, 1) <> 'G');
    IF @non_g_count = 0
    BEGIN
        PRINT '';
        PRINT '  WARNING: Only G-employees found. This was the root cause of the G-only issue.';
        PRINT '  Investigate: Did employees_backup_20260623 contain all divisions?';
    END
    ELSE
    BEGIN
        PRINT '';
        PRINT '  SUCCESS: Non-G employees found (' + CAST(@non_g_count AS VARCHAR) + '). This will enable full-division processing.';
    END
END
ELSE
BEGIN
    PRINT '';
    PRINT '  CRITICAL: employees table is EMPTY. attendance_imports rebuild will FAIL.';
    PRINT '  ACTION REQUIRED: Restore employees_backup_20260623 or rebuild from HR source manually.';
END

PRINT '';
PRINT '[PHASE 2] COMPLETE. Verify attendance_machines > 0 AND employees > 0 before proceeding.';
PRINT 'GO';

