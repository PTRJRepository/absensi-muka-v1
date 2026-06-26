/*
 * Migration: 041_sanitize_long_absensi_user_registry.sql
 * Date: 2026-06-23
 * Purpose:
 *   - Create dedicated long raw absensi user ID registry tables.
 *   - Deduplicate raw_device_user_id across machines.
 *   - Only parse raw IDs with length > 5.
 *   - Enrich parsed employee codes from DB_PTRJ.dbo.HR_EMPLOYEE.
 *   - Remove short raw ID rows that were already mapped to employee data.
 *
 * Safety:
 *   This script defaults to dry-run. The runner replaces @apply with 1 only
 *   when called with --apply.
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

DECLARE @apply BIT = 0;

BEGIN TRY
  BEGIN TRANSACTION;

  PRINT '============================================================';
  PRINT 'MIGRATION 041: Long raw absensi user registry and sanitization';
  PRINT CONCAT('Mode: ', CASE WHEN @apply = 1 THEN 'APPLY' ELSE 'DRY RUN - ROLLBACK' END);
  PRINT '============================================================';

  IF OBJECT_ID('dbo.zkteco_absensi_user_registry', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.zkteco_absensi_user_registry (
      id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      raw_device_user_id NVARCHAR(100) NOT NULL,
      raw_id_length INT NOT NULL,
      id_category NVARCHAR(30) NOT NULL,
      scanner_prefix NVARCHAR(3) NULL,
      parsed_employee_code NVARCHAR(30) NULL,
      parsed_division_code NVARCHAR(20) NULL,
      hr_employee_code NVARCHAR(30) NULL,
      hr_employee_name NVARCHAR(150) NULL,
      hr_loc_code NVARCHAR(20) NULL,
      hr_status NVARCHAR(20) NULL,
      mapping_status NVARCHAR(30) NOT NULL,
      mapping_reason NVARCHAR(500) NULL,
      machine_count INT NOT NULL DEFAULT 0,
      scan_count BIGINT NOT NULL DEFAULT 0,
      first_seen_at DATETIME2 NULL,
      last_seen_at DATETIME2 NULL,
      sample_zkteco_user_name NVARCHAR(200) NULL,
      is_active BIT NOT NULL DEFAULT 1,
      created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT uq_zkteco_absensi_user_registry_raw UNIQUE (raw_device_user_id)
    );
  END;

  IF OBJECT_ID('dbo.zkteco_absensi_user_machine', 'U') IS NULL
  BEGIN
    CREATE TABLE dbo.zkteco_absensi_user_machine (
      id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      registry_id BIGINT NOT NULL,
      machine_code NVARCHAR(30) NOT NULL,
      raw_device_user_id NVARCHAR(100) NOT NULL,
      zkteco_user_name NVARCHAR(200) NULL,
      scan_count BIGINT NOT NULL DEFAULT 0,
      first_seen_at DATETIME2 NULL,
      last_seen_at DATETIME2 NULL,
      is_active BIT NOT NULL DEFAULT 1,
      created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT fk_absensi_user_machine_registry
        FOREIGN KEY (registry_id) REFERENCES dbo.zkteco_absensi_user_registry(id),
      CONSTRAINT uq_absensi_user_machine UNIQUE (machine_code, raw_device_user_id)
    );
  END;

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_absensi_user_registry_hr_code' AND object_id = OBJECT_ID('dbo.zkteco_absensi_user_registry'))
    CREATE INDEX ix_absensi_user_registry_hr_code ON dbo.zkteco_absensi_user_registry(hr_employee_code);

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_absensi_user_registry_parsed_code' AND object_id = OBJECT_ID('dbo.zkteco_absensi_user_registry'))
    CREATE INDEX ix_absensi_user_registry_parsed_code ON dbo.zkteco_absensi_user_registry(parsed_employee_code);

  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_absensi_user_machine_registry' AND object_id = OBJECT_ID('dbo.zkteco_absensi_user_machine'))
    CREATE INDEX ix_absensi_user_machine_registry ON dbo.zkteco_absensi_user_machine(registry_id);

  PRINT '';
  PRINT '--- Step 1: Remove short raw IDs that were mapped to employees ---';

  IF OBJECT_ID('tempdb..#short_mapped_scan_logs') IS NOT NULL DROP TABLE #short_mapped_scan_logs;

  SELECT s.id
  INTO #short_mapped_scan_logs
  FROM dbo.attendance_scan_logs s
  WHERE LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))) BETWEEN 1 AND 5
    AND (
      NULLIF(s.parsed_employee_code, '') IS NOT NULL
      OR s.mapping_status = 'MAPPED'
      OR EXISTS (
        SELECT 1
        FROM dbo.attendance_imports ai
        WHERE ai.raw_scan_log_id = s.id
          AND ai.employee_code NOT LIKE 'MANUAL_%'
      )
    );

  DECLARE @short_mapped_scan_count INT = (SELECT COUNT(1) FROM #short_mapped_scan_logs);
  PRINT CONCAT('Short mapped scan logs selected for deletion: ', @short_mapped_scan_count);

  DELETE ai
  FROM dbo.attendance_imports ai
  INNER JOIN #short_mapped_scan_logs ss ON ss.id = ai.raw_scan_log_id;
  DECLARE @short_imports_deleted INT = @@ROWCOUNT;
  PRINT CONCAT('attendance_imports deleted for short mapped raw IDs: ', @short_imports_deleted);

  DELETE s
  FROM dbo.attendance_scan_logs s
  INNER JOIN #short_mapped_scan_logs ss ON ss.id = s.id;
  DECLARE @short_scan_deleted INT = @@ROWCOUNT;
  PRINT CONCAT('attendance_scan_logs deleted for short mapped raw IDs: ', @short_scan_deleted);

  UPDATE s
  SET
    parsed_employee_code = NULL,
    parsed_division_code = NULL,
    mapping_status = 'UNMAPPED',
    mapping_reason = 'SHORT_RAW_ID_EXCLUDED_BY_SANITIZE_041'
  FROM dbo.attendance_scan_logs s
  WHERE LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))) BETWEEN 1 AND 5;
  DECLARE @short_scan_neutralized INT = @@ROWCOUNT;
  PRINT CONCAT('Remaining short scan logs neutralized: ', @short_scan_neutralized);

  DELETE zm
  FROM dbo.zkteco_hr_employee_map zm
  WHERE LEN(LTRIM(RTRIM(CAST(zm.zkteco_user_id AS NVARCHAR(100))))) BETWEEN 1 AND 5;
  DECLARE @short_zkteco_map_deleted INT = @@ROWCOUNT;
  PRINT CONCAT('zkteco_hr_employee_map short rows deleted: ', @short_zkteco_map_deleted);

  IF OBJECT_ID('dbo.machine_user_map', 'U') IS NOT NULL
  BEGIN
    EXEC sp_executesql N'
      DELETE FROM dbo.machine_user_map
      WHERE LEN(LTRIM(RTRIM(CAST(machine_user_id AS NVARCHAR(100))))) BETWEEN 1 AND 5;
    ';
    PRINT CONCAT('machine_user_map short rows deleted: ', @@ROWCOUNT);
  END;

  IF OBJECT_ID('dbo.employee_mapping_overrides', 'U') IS NOT NULL
  BEGIN
    IF COL_LENGTH('dbo.employee_mapping_overrides', 'raw_device_id') IS NOT NULL
    BEGIN
      EXEC sp_executesql N'
        DELETE FROM dbo.employee_mapping_overrides
        WHERE LEN(LTRIM(RTRIM(CAST(raw_device_id AS NVARCHAR(100))))) BETWEEN 1 AND 5;
      ';
      PRINT CONCAT('employee_mapping_overrides short raw_device_id rows deleted: ', @@ROWCOUNT);
    END;

    IF COL_LENGTH('dbo.employee_mapping_overrides', 'zkteco_user_id') IS NOT NULL
    BEGIN
      EXEC sp_executesql N'
        DELETE FROM dbo.employee_mapping_overrides
        WHERE LEN(LTRIM(RTRIM(CAST(zkteco_user_id AS NVARCHAR(100))))) BETWEEN 1 AND 5;
      ';
      PRINT CONCAT('employee_mapping_overrides short zkteco_user_id rows deleted: ', @@ROWCOUNT);
    END;
  END;

  IF COL_LENGTH('dbo.employees', 'zkteco_user_id') IS NOT NULL
  BEGIN
    UPDATE dbo.employees
    SET zkteco_user_id = NULL,
        updated_at = SYSUTCDATETIME()
    WHERE zkteco_user_id IS NOT NULL
      AND LEN(LTRIM(RTRIM(CAST(zkteco_user_id AS NVARCHAR(100))))) BETWEEN 1 AND 5;
    DECLARE @employee_short_zkteco_cleared INT = @@ROWCOUNT;
    PRINT CONCAT('employees.zkteco_user_id short values cleared: ', @employee_short_zkteco_cleared);
  END;

  PRINT '';
  PRINT '--- Step 2: Build long raw ID per-machine source ---';

  IF OBJECT_ID('tempdb..#long_machine_source') IS NOT NULL DROP TABLE #long_machine_source;

  SELECT
    source_rows.machine_code,
    source_rows.raw_device_user_id,
    MAX(source_rows.zkteco_user_name) AS zkteco_user_name,
    SUM(source_rows.scan_count) AS scan_count,
    MIN(source_rows.first_seen_at) AS first_seen_at,
    MAX(source_rows.last_seen_at) AS last_seen_at
  INTO #long_machine_source
  FROM (
    SELECT
      s.machine_code,
      LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100)))) AS raw_device_user_id,
      MAX(NULLIF(zm.zkteco_user_name, '')) AS zkteco_user_name,
      COUNT_BIG(*) AS scan_count,
      MIN(s.scan_time) AS first_seen_at,
      MAX(s.scan_time) AS last_seen_at
    FROM dbo.attendance_scan_logs s
    LEFT JOIN dbo.zkteco_hr_employee_map zm
      ON zm.machine_code = s.machine_code
     AND zm.zkteco_user_id = s.raw_device_user_id
    WHERE LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))) > 5
    GROUP BY s.machine_code, LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))

    UNION ALL

    SELECT
      zm.machine_code,
      LTRIM(RTRIM(CAST(zm.zkteco_user_id AS NVARCHAR(100)))) AS raw_device_user_id,
      MAX(NULLIF(zm.zkteco_user_name, '')) AS zkteco_user_name,
      CAST(0 AS BIGINT) AS scan_count,
      CAST(NULL AS DATETIME2) AS first_seen_at,
      CAST(NULL AS DATETIME2) AS last_seen_at
    FROM dbo.zkteco_hr_employee_map zm
    WHERE LEN(LTRIM(RTRIM(CAST(zm.zkteco_user_id AS NVARCHAR(100))))) > 5
    GROUP BY zm.machine_code, LTRIM(RTRIM(CAST(zm.zkteco_user_id AS NVARCHAR(100))))
  ) source_rows
  GROUP BY source_rows.machine_code, source_rows.raw_device_user_id;

  DECLARE @long_machine_rows INT = (SELECT COUNT(1) FROM #long_machine_source);
  PRINT CONCAT('Long raw ID machine rows discovered: ', @long_machine_rows);

  PRINT '';
  PRINT '--- Step 3: Upsert deduplicated long raw ID registry with DB_PTRJ HR data ---';

  IF OBJECT_ID('tempdb..#registry_source') IS NOT NULL DROP TABLE #registry_source;

  WITH raw_registry AS (
    SELECT
      lms.raw_device_user_id,
      LEN(lms.raw_device_user_id) AS raw_id_length,
      CASE
        WHEN lms.raw_device_user_id NOT LIKE '%[^0-9]%' THEN LEFT(lms.raw_device_user_id, 3)
        ELSE NULL
      END AS scanner_prefix,
      COUNT(DISTINCT lms.machine_code) AS machine_count,
      SUM(lms.scan_count) AS scan_count,
      MIN(lms.first_seen_at) AS first_seen_at,
      MAX(lms.last_seen_at) AS last_seen_at,
      MAX(lms.zkteco_user_name) AS sample_zkteco_user_name
    FROM #long_machine_source lms
    GROUP BY lms.raw_device_user_id
  ),
  parsed_registry AS (
    SELECT
      rr.*,
      CASE rr.scanner_prefix
        WHEN '001' THEN 'L' + RIGHT(rr.raw_device_user_id, 4)
        WHEN '100' THEN 'A' + RIGHT(rr.raw_device_user_id, 4)
        WHEN '200' THEN 'J' + RIGHT(rr.raw_device_user_id, 4)
        WHEN '300' THEN 'B' + RIGHT(rr.raw_device_user_id, 4)
        WHEN '400' THEN 'H' + RIGHT(rr.raw_device_user_id, 4)
        WHEN '500' THEN 'C' + RIGHT(rr.raw_device_user_id, 4)
        WHEN '600' THEN 'D' + RIGHT(rr.raw_device_user_id, 4)
        WHEN '700' THEN 'E' + RIGHT(rr.raw_device_user_id, 4)
        WHEN '800' THEN 'F' + RIGHT(rr.raw_device_user_id, 4)
        WHEN '900' THEN 'G' + RIGHT(rr.raw_device_user_id, 4)
        ELSE NULL
      END AS parsed_employee_code
    FROM raw_registry rr
  )
  SELECT
    pr.raw_device_user_id,
    pr.raw_id_length,
    CAST('LONG' AS NVARCHAR(30)) AS id_category,
    pr.scanner_prefix,
    pr.parsed_employee_code,
    CASE WHEN pr.parsed_employee_code IS NOT NULL THEN LEFT(pr.parsed_employee_code, 1) ELSE NULL END AS parsed_division_code,
    RTRIM(hr.EmpCode) AS hr_employee_code,
    RTRIM(hr.EmpName) AS hr_employee_name,
    RTRIM(hr.LocCode) AS hr_loc_code,
    RTRIM(CAST(hr.Status AS NVARCHAR(20))) AS hr_status,
    CASE
      WHEN hr.EmpCode IS NOT NULL THEN CAST('MAPPED' AS NVARCHAR(30))
      WHEN pr.parsed_employee_code IS NOT NULL THEN CAST('NEED_REVIEW' AS NVARCHAR(30))
      ELSE CAST('UNMAPPED' AS NVARCHAR(30))
    END AS mapping_status,
    CASE
      WHEN hr.EmpCode IS NOT NULL THEN CAST('SANITIZE_041_LONG_RAW_ID_HR_MATCH' AS NVARCHAR(500))
      WHEN pr.parsed_employee_code IS NOT NULL THEN CAST('SANITIZE_041_PARSED_EMPLOYEE_NOT_FOUND_IN_HR' AS NVARCHAR(500))
      ELSE CAST('SANITIZE_041_LONG_RAW_ID_NO_VALID_SCANNER_PREFIX' AS NVARCHAR(500))
    END AS mapping_reason,
    pr.machine_count,
    pr.scan_count,
    pr.first_seen_at,
    pr.last_seen_at,
    pr.sample_zkteco_user_name
  INTO #registry_source
  FROM parsed_registry pr
  LEFT JOIN DB_PTRJ.dbo.HR_EMPLOYEE hr
    ON RTRIM(hr.EmpCode) = pr.parsed_employee_code
   AND RTRIM(CAST(hr.Status AS NVARCHAR(20))) IN ('1', '4');

  MERGE dbo.zkteco_absensi_user_registry AS target
  USING #registry_source AS source
    ON target.raw_device_user_id = source.raw_device_user_id
  WHEN MATCHED THEN UPDATE SET
    raw_id_length = source.raw_id_length,
    id_category = source.id_category,
    scanner_prefix = source.scanner_prefix,
    parsed_employee_code = source.parsed_employee_code,
    parsed_division_code = source.parsed_division_code,
    hr_employee_code = source.hr_employee_code,
    hr_employee_name = source.hr_employee_name,
    hr_loc_code = source.hr_loc_code,
    hr_status = source.hr_status,
    mapping_status = source.mapping_status,
    mapping_reason = source.mapping_reason,
    machine_count = source.machine_count,
    scan_count = source.scan_count,
    first_seen_at = source.first_seen_at,
    last_seen_at = source.last_seen_at,
    sample_zkteco_user_name = source.sample_zkteco_user_name,
    is_active = 1,
    updated_at = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN INSERT
    (raw_device_user_id, raw_id_length, id_category, scanner_prefix, parsed_employee_code, parsed_division_code,
     hr_employee_code, hr_employee_name, hr_loc_code, hr_status, mapping_status, mapping_reason,
     machine_count, scan_count, first_seen_at, last_seen_at, sample_zkteco_user_name, is_active)
    VALUES
    (source.raw_device_user_id, source.raw_id_length, source.id_category, source.scanner_prefix,
     source.parsed_employee_code, source.parsed_division_code, source.hr_employee_code, source.hr_employee_name,
     source.hr_loc_code, source.hr_status, source.mapping_status, source.mapping_reason,
     source.machine_count, source.scan_count, source.first_seen_at, source.last_seen_at,
     source.sample_zkteco_user_name, 1);

  DECLARE @registry_upserted INT = @@ROWCOUNT;
  PRINT CONCAT('Registry rows upserted: ', @registry_upserted);

  MERGE dbo.zkteco_absensi_user_machine AS target
  USING (
    SELECT
      r.id AS registry_id,
      lms.machine_code,
      lms.raw_device_user_id,
      lms.zkteco_user_name,
      lms.scan_count,
      lms.first_seen_at,
      lms.last_seen_at
    FROM #long_machine_source lms
    INNER JOIN dbo.zkteco_absensi_user_registry r
      ON r.raw_device_user_id = lms.raw_device_user_id
  ) AS source
    ON target.machine_code = source.machine_code
   AND target.raw_device_user_id = source.raw_device_user_id
  WHEN MATCHED THEN UPDATE SET
    registry_id = source.registry_id,
    zkteco_user_name = source.zkteco_user_name,
    scan_count = source.scan_count,
    first_seen_at = source.first_seen_at,
    last_seen_at = source.last_seen_at,
    is_active = 1,
    updated_at = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN INSERT
    (registry_id, machine_code, raw_device_user_id, zkteco_user_name, scan_count, first_seen_at, last_seen_at, is_active)
    VALUES
    (source.registry_id, source.machine_code, source.raw_device_user_id, source.zkteco_user_name,
     source.scan_count, source.first_seen_at, source.last_seen_at, 1);

  DECLARE @machine_upserted INT = @@ROWCOUNT;
  PRINT CONCAT('Per-machine long raw ID rows upserted: ', @machine_upserted);

  PRINT '';
  PRINT '--- Step 4: Apply canonical long raw ID mapping back to operational tables ---';

  UPDATE s
  SET
    parsed_employee_code = r.hr_employee_code,
    parsed_division_code = LEFT(r.hr_employee_code, 1),
    mapping_status = 'MAPPED',
    mapping_reason = r.mapping_reason
  FROM dbo.attendance_scan_logs s
  INNER JOIN dbo.zkteco_absensi_user_registry r
    ON r.raw_device_user_id = LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))
  WHERE LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))) > 5
    AND r.mapping_status = 'MAPPED'
    AND NULLIF(r.hr_employee_code, '') IS NOT NULL
    AND (
      s.parsed_employee_code IS NULL
      OR s.parsed_employee_code <> r.hr_employee_code
      OR s.mapping_status <> 'MAPPED'
      OR COALESCE(s.mapping_reason, '') <> r.mapping_reason
    );
  DECLARE @scan_long_mapped INT = @@ROWCOUNT;
  PRINT CONCAT('attendance_scan_logs long rows mapped via HR: ', @scan_long_mapped);

  UPDATE s
  SET
    parsed_employee_code = NULL,
    parsed_division_code = NULL,
    mapping_status = 'NEED_REVIEW',
    mapping_reason = r.mapping_reason
  FROM dbo.attendance_scan_logs s
  INNER JOIN dbo.zkteco_absensi_user_registry r
    ON r.raw_device_user_id = LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))
  WHERE LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))) > 5
    AND r.mapping_status <> 'MAPPED'
    AND (
      s.parsed_employee_code IS NOT NULL
      OR s.mapping_status <> 'NEED_REVIEW'
      OR COALESCE(s.mapping_reason, '') <> r.mapping_reason
    );
  DECLARE @scan_long_review INT = @@ROWCOUNT;
  PRINT CONCAT('attendance_scan_logs long rows set to review/unmapped: ', @scan_long_review);

  MERGE dbo.zkteco_hr_employee_map AS target
  USING (
    SELECT
      lms.machine_code,
      lms.raw_device_user_id AS zkteco_user_id,
      COALESCE(lms.zkteco_user_name, r.sample_zkteco_user_name, lms.raw_device_user_id) AS zkteco_user_name,
      r.hr_employee_code,
      r.hr_employee_name,
      CASE WHEN r.mapping_status = 'MAPPED' THEN 'EXACT' ELSE 'UNMATCHED' END AS match_confidence,
      r.mapping_reason AS match_method
    FROM #long_machine_source lms
    INNER JOIN dbo.zkteco_absensi_user_registry r
      ON r.raw_device_user_id = lms.raw_device_user_id
  ) AS source
    ON target.machine_code = source.machine_code
   AND target.zkteco_user_id = source.zkteco_user_id
  WHEN MATCHED THEN UPDATE SET
    zkteco_user_name = source.zkteco_user_name,
    hr_employee_code = source.hr_employee_code,
    hr_employee_name = source.hr_employee_name,
    match_confidence = source.match_confidence,
    match_method = source.match_method,
    is_active = 1,
    updated_at = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN INSERT
    (machine_code, zkteco_user_id, zkteco_user_name, hr_employee_code, hr_employee_name,
     match_confidence, match_method, is_active)
    VALUES
    (source.machine_code, source.zkteco_user_id, source.zkteco_user_name, source.hr_employee_code,
     source.hr_employee_name, source.match_confidence, source.match_method, 1);

  DECLARE @zkteco_map_long_upserted INT = @@ROWCOUNT;
  PRINT CONCAT('zkteco_hr_employee_map long rows upserted: ', @zkteco_map_long_upserted);

  IF COL_LENGTH('dbo.employees', 'zkteco_user_id') IS NOT NULL
  BEGIN
    WITH unique_employee_raw AS (
      SELECT hr_employee_code, MIN(raw_device_user_id) AS raw_device_user_id
      FROM dbo.zkteco_absensi_user_registry
      WHERE mapping_status = 'MAPPED'
        AND NULLIF(hr_employee_code, '') IS NOT NULL
      GROUP BY hr_employee_code
      HAVING COUNT(DISTINCT raw_device_user_id) = 1
    )
    UPDATE e
    SET zkteco_user_id = u.raw_device_user_id,
        updated_at = SYSUTCDATETIME()
    FROM dbo.employees e
    INNER JOIN unique_employee_raw u ON u.hr_employee_code = e.employee_code
    WHERE (e.zkteco_user_id IS NULL OR LEN(LTRIM(RTRIM(CAST(e.zkteco_user_id AS NVARCHAR(100))))) <= 5)
      AND COALESCE(e.is_active, 1) = 1;
    DECLARE @employees_long_zkteco_set INT = @@ROWCOUNT;
    PRINT CONCAT('employees.zkteco_user_id filled from unique long raw IDs: ', @employees_long_zkteco_set);
  END;

  DECLARE @imports_long_updated INT = 0;
  DECLARE @update_imports_sql NVARCHAR(MAX) = N'
    WITH update_candidates AS (
      SELECT
        ai.id,
        e.id AS target_employee_id,
        e.employee_code AS target_employee_code,
        COALESCE(d.division_code, LEFT(e.employee_code, 1)) AS target_division_code,
        g.gang_code AS target_gang_code,
        ai.attendance_date,
        ai.source,
        COALESCE(ai.source_reference, '''') AS source_reference_key,
        ROW_NUMBER() OVER (
          PARTITION BY e.employee_code, ai.attendance_date, ai.source, COALESCE(ai.source_reference, '''')
          ORDER BY CASE WHEN ai.employee_code LIKE ''MANUAL_%'' THEN 0 ELSE 1 END, ai.id
        ) AS target_rank
      FROM dbo.attendance_imports ai
      INNER JOIN dbo.attendance_scan_logs s ON s.id = ai.raw_scan_log_id
      INNER JOIN dbo.zkteco_absensi_user_registry r
        ON r.raw_device_user_id = LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))
       AND r.mapping_status = ''MAPPED''
      INNER JOIN dbo.employees e ON e.employee_code = r.hr_employee_code
      LEFT JOIN dbo.divisions d ON d.id = e.division_id
      LEFT JOIN dbo.gangs g ON g.id = e.gang_id
      WHERE (
        ai.employee_code <> e.employee_code
        OR ai.employee_id <> e.id{NEEDS_MANUAL_REVIEW_PREDICATE}
      )
    )
    UPDATE ai
    SET
      employee_id = c.target_employee_id,
      employee_code = c.target_employee_code,
      division_code = c.target_division_code,
      gang_code = c.target_gang_code{NEEDS_MANUAL_REVIEW_SET}
    FROM dbo.attendance_imports ai
    INNER JOIN update_candidates c ON c.id = ai.id
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.attendance_imports dup
        WHERE dup.id <> ai.id
          AND dup.employee_code = c.target_employee_code
          AND dup.attendance_date = c.attendance_date
          AND dup.source = c.source
          AND COALESCE(dup.source_reference, '''') = c.source_reference_key
      )
      AND c.target_rank = 1;

    SET @rows = @@ROWCOUNT;
  ';

  IF COL_LENGTH('dbo.attendance_imports', 'needs_manual_review') IS NOT NULL
  BEGIN
    SET @update_imports_sql = REPLACE(@update_imports_sql, '{NEEDS_MANUAL_REVIEW_SET}', ', needs_manual_review = 0');
    SET @update_imports_sql = REPLACE(@update_imports_sql, '{NEEDS_MANUAL_REVIEW_PREDICATE}', ' OR ai.needs_manual_review <> 0');
  END
  ELSE
  BEGIN
    SET @update_imports_sql = REPLACE(@update_imports_sql, '{NEEDS_MANUAL_REVIEW_SET}', '');
    SET @update_imports_sql = REPLACE(@update_imports_sql, '{NEEDS_MANUAL_REVIEW_PREDICATE}', '');
  END;

  EXEC sp_executesql @update_imports_sql, N'@rows INT OUTPUT', @rows = @imports_long_updated OUTPUT;
  PRINT CONCAT('attendance_imports long rows updated via HR: ', @imports_long_updated);

  PRINT '';
  PRINT '--- Verification ---';

  SELECT
    COUNT(1) AS registry_rows,
    SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) AS mapped_rows,
    SUM(CASE WHEN mapping_status <> 'MAPPED' THEN 1 ELSE 0 END) AS review_or_unmapped_rows,
    SUM(CASE WHEN machine_count > 1 THEN 1 ELSE 0 END) AS deduped_multi_machine_raw_ids
  FROM dbo.zkteco_absensi_user_registry;

  SELECT TOP 20
    raw_device_user_id,
    parsed_employee_code,
    hr_employee_code,
    hr_employee_name,
    machine_count,
    scan_count,
    mapping_status,
    mapping_reason
  FROM dbo.zkteco_absensi_user_registry
  ORDER BY machine_count DESC, scan_count DESC;

  SELECT
    COUNT(1) AS remaining_short_mapped_scan_logs
  FROM dbo.attendance_scan_logs
  WHERE LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(100))))) BETWEEN 1 AND 5
    AND (
      NULLIF(parsed_employee_code, '') IS NOT NULL
      OR mapping_status = 'MAPPED'
    );

  SELECT
    COUNT(1) AS remaining_short_zkteco_map_rows
  FROM dbo.zkteco_hr_employee_map
  WHERE LEN(LTRIM(RTRIM(CAST(zkteco_user_id AS NVARCHAR(100))))) BETWEEN 1 AND 5;

  IF @apply = 1
  BEGIN
    COMMIT TRANSACTION;
    PRINT '';
    PRINT 'MIGRATION 041 COMMITTED';
  END
  ELSE
  BEGIN
    ROLLBACK TRANSACTION;
    PRINT '';
    PRINT 'MIGRATION 041 DRY RUN COMPLETE - ROLLED BACK';
  END;

END TRY
BEGIN CATCH
  PRINT 'ERROR:';
  PRINT ERROR_MESSAGE();
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
