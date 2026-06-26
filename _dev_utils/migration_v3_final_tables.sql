-- ============================================================
-- MIGRATION v3: Final Tables + Stored Procedures
-- Database: db_faceattn_ptrj
-- Tanggal: 2026-05-30
-- ============================================================

-- ============================================================
-- 1. attendance_scan_log
--    Menyimpan SEMUA scan event per karyawan per hari
--    1 karyawan bisa punya N baris scan dalam 1 hari
-- ============================================================
IF OBJECT_ID('dbo.attendance_scan_log', 'U') IS NOT NULL
    DROP TABLE dbo.attendance_scan_log;
GO

CREATE TABLE attendance_scan_log (
    scan_log_id       BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id       INT          NULL,   -- NULL = belum ter-mapping ke mst_employee
    emp_code          NVARCHAR(50) NOT NULL,

    machine_id        INT          NULL,
    scan_division_id  INT          NULL,   -- division dari mesin scan

    scan_time         DATETIME     NOT NULL,
    work_date         DATE         NOT NULL,

    scan_type         NVARCHAR(20) NULL,   -- IN / OUT / UNKNOWN (dari ZKTeco)
    raw_source        NVARCHAR(20) NOT NULL, -- ZKTECO / API / MANUAL

    -- Data mentah dari mesin (untuk audit)
    raw_device_id     NVARCHAR(50) NULL,
    raw_timestamp     BIGINT       NULL,
    raw_verified      INT          NULL,
    raw_status        INT          NULL,

    created_at        DATETIME     DEFAULT GETDATE(),

    CONSTRAINT FK_scanlog_employee FOREIGN KEY (employee_id)      REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_scanlog_machine  FOREIGN KEY (machine_id)       REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_scanlog_division FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id),

    INDEX IX_scanlog_work_date    (work_date),
    INDEX IX_scanlog_employee_date (employee_id, work_date),
    INDEX IX_scanlog_emp_code_date (emp_code, work_date),
    INDEX IX_scanlog_machine_date (machine_id, work_date),
    INDEX IX_scanlog_scan_time    (scan_time)
);
GO

PRINT '[OK] attendance_scan_log';

-- ============================================================
-- 2. attendance_manual_input
--    Input absensi manual: sakit, izin, tugas luar, holiday
--    Override / tambahkan data ke employee_attendance_daily
-- ============================================================
IF OBJECT_ID('dbo.attendance_manual_input', 'U') IS NOT NULL
    DROP TABLE dbo.attendance_manual_input;
GO

CREATE TABLE attendance_manual_input (
    manual_id         BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id       INT          NOT NULL,
    emp_code          NVARCHAR(50) NOT NULL,
    work_date         DATE         NOT NULL,

    -- Jenis manual input
    attendance_type   NVARCHAR(30) NOT NULL,  -- SICK / PERMIT / ASSIGNMENT / HOLIDAY / OTHER / IN / OUT
    hours_override    INT          NULL,       -- Override jam kerja (menit), NULL = pakai standard

    -- Info
    note              NVARCHAR(500) NULL,
    attachment_path   NVARCHAR(255) NULL,

    -- Approval
    approved_by       NVARCHAR(100) NULL,
    approved_at       DATETIME     NULL,
    is_approved       BIT          DEFAULT 0,

    -- Metadata
    created_by        NVARCHAR(100) NOT NULL,
    created_at        DATETIME     DEFAULT GETDATE(),
    updated_at        DATETIME     DEFAULT GETDATE(),

    CONSTRAINT FK_manual_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),

    -- 1 karyawan max 1 manual input per hari per type
    CONSTRAINT UQ_manual_employee_date_type
        UNIQUE (employee_id, work_date, attendance_type)
);
GO

PRINT '[OK] attendance_manual_input';

-- ============================================================
-- 3. Seed attendance_manual_type_reference (lookup table)
-- ============================================================
IF OBJECT_ID('dbo.attendance_manual_type', 'U') IS NOT NULL
    DROP TABLE dbo.attendance_manual_type;
GO

CREATE TABLE attendance_manual_type (
    type_code     NVARCHAR(30) PRIMARY KEY,
    type_name     NVARCHAR(100) NOT NULL,
    color_hex     NVARCHAR(7) NULL,
    is_paid       BIT DEFAULT 1,
    is_counted    BIT DEFAULT 1,  -- dihitung sebagai kehadiran
    display_order INT DEFAULT 0,
    created_at    DATETIME DEFAULT GETDATE()
);
GO

INSERT INTO attendance_manual_type (type_code, type_name, color_hex, is_paid, is_counted, display_order) VALUES
    ('SICK',       'Sakit',            '#FF9800', 1, 1, 1),
    ('PERMIT',     'Izin',             '#2196F3', 1, 1, 2),
    ('ASSIGNMENT', 'Tugas Luar',       '#9C27B0', 0, 1, 3),
    ('HOLIDAY',    'Libur/Cuti',       '#4CAF50', 0, 0, 4),
    ('OTHER',      'Lainnya',          '#9E9E9E', 0, 0, 5),
    ('IN',         'Absen Masuk',      '#4CAF50', 1, 1, 6),
    ('OUT',        'Absen Pulang',     '#F44336', 1, 1, 7),
    ('CORRECTION', 'Koreksi Absensi',  '#FF5722', 1, 1, 8);
GO

PRINT '[OK] attendance_manual_type (seeded)';

-- ============================================================
-- 4. sp_sync_attendance_daily
--    Agregasi attendance_scan_log -> employee_attendance_daily
--    + attendance_sorting_result per work_date
--    Includes manual_input integration
-- ============================================================
IF OBJECT_ID('dbo.sp_sync_attendance_daily', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_sync_attendance_daily;
GO

CREATE PROCEDURE sp_sync_attendance_daily
    @work_date DATE = NULL,
    @dry_run   BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @p_date DATE = ISNULL(@work_date, CAST(GETDATE() AS DATE));

    -- Ambil standard jam kerja
    DECLARE @std_min INT = ISNULL(
        (SELECT standard_minutes FROM attendance_work_config WHERE day_of_week = DATEPART(WEEKDAY, @p_date)),
        420
    );

    -- ============================================================
    -- TEMP: Agregasi scan dari scan_log
    -- ============================================================
    IF OBJECT_ID('tempdb..#scan_agg') IS NOT NULL DROP TABLE #scan_agg;

    SELECT
        sl.emp_code,
        sl.employee_id,

        MIN(sl.scan_time)                              AS first_scan,
        MAX(sl.scan_time)                              AS last_scan,
        COUNT(*)                                       AS scan_count,

        STRING_AGG(sl.machine_id,  ',')                AS scan_machine_ids,
        STRING_AGG(m.machine_code, ', ')                AS scan_machines,
        STRING_AGG(DISTINCT CAST(sl.scan_division_id AS NVARCHAR(10)), ', ') AS scan_division_ids,
        STRING_AGG(DISTINCT d.division_code, ', ')     AS scan_divisions,

        -- Division logic:
        -- Priority 1: mst_employee.division_id (home division dari master)
        -- Priority 2: mesin scan division (cross-division scan)
        e.division_id                                  AS home_division_id,
        ed.division_code                               AS home_division_code,

        -- Final = home division (Rule 1)
        e.division_id                                  AS final_division_id,

        CASE
            WHEN e.division_id IS NOT NULL AND d.division_id <> e.division_id THEN 1
            ELSE 0
        END                                            AS is_cross_division_scan

    INTO #scan_agg
    FROM attendance_scan_log sl
    LEFT JOIN mst_employee e  ON sl.employee_id = e.employee_id
    LEFT JOIN mst_division ed ON e.division_id   = ed.division_id
    LEFT JOIN mst_machine m   ON sl.machine_id   = m.machine_id
    LEFT JOIN mst_division d  ON sl.scan_division_id = d.division_id
    WHERE CAST(sl.scan_time AS DATE) = @p_date
    GROUP BY sl.emp_code, sl.employee_id,
             e.division_id, ed.division_code,
             d.division_id;

    -- ============================================================
    -- TEMP: Ambil manual input untuk hari ini
    -- ============================================================
    IF OBJECT_ID('tempdb..#manual') IS NOT NULL DROP TABLE #manual;

    SELECT
        employee_id, emp_code, work_date, attendance_type, hours_override, note,
        approved_by, approved_at, is_approved, created_by
    INTO #manual
    FROM attendance_manual_input
    WHERE work_date = @p_date AND is_approved = 1;

    -- ============================================================
    -- TEMP: Combine scan + manual untuk final result
    -- ============================================================
    IF OBJECT_ID('tempdb..#final') IS NOT NULL DROP TABLE #final;

    -- Karyawan yang ADA scan_log
    SELECT
        sa.emp_code,
        sa.employee_id,
        sa.first_scan,
        sa.last_scan,
        sa.scan_count,
        sa.scan_machines,
        sa.scan_divisions,

        -- first machine = mesin scan pertama
        CAST(LEFT(sa.scan_machine_ids, CHARINDEX(',', sa.scan_machine_ids + ',') - 1) AS INT) AS first_machine_id,
        -- last machine = mesin scan terakhir
        CAST(REVERSE(LEFT(REVERSE(sa.scan_machine_ids), CHARINDEX(',', REVERSE(sa.scan_machine_ids) + ',') - 1)) AS INT) AS last_machine_id,

        -- Division
        sa.home_division_id,
        sa.final_division_id,
        -- first scan division
        CAST(LEFT(sa.scan_division_ids, CHARINDEX(',', sa.scan_division_ids + ',') - 1) AS INT) AS scan_division_id,

        -- Durasi
        CASE
            WHEN sa.scan_count = 1 THEN @std_min                      -- Single scan: estimasi
            ELSE DATEDIFF(MINUTE, sa.first_scan, sa.last_scan)       -- Normal: hitung real
        END AS work_duration_minutes,

        CASE
            WHEN sa.scan_count = 1 THEN 1
            ELSE 0
        END AS is_estimated_duration,

        -- Overtime
        CASE
            WHEN sa.scan_count = 1 THEN GREATEST(@std_min - @std_min, 0)  -- Single scan: no overtime
            ELSE GREATEST(DATEDIFF(MINUTE, sa.first_scan, sa.last_scan) - @std_min, 0)
        END AS overtime_minutes,

        CASE
            WHEN sa.scan_count = 1 THEN 0
            WHEN DATEDIFF(MINUTE, sa.first_scan, sa.last_scan) > @std_min THEN 1
            ELSE 0
        END AS is_overtime,

        -- Status
        CASE
            WHEN sa.scan_count = 0 THEN 'ABSENT'
            WHEN sa.scan_count = 1 THEN 'SINGLE_SCAN'
            ELSE 'PRESENT'
        END AS attendance_status,

        -- Sorting
        CASE
            WHEN sa.home_division_id IS NOT NULL
                 AND sa.is_cross_division_scan = 0 THEN 'MATCH_HOME_DIVISION'
            WHEN sa.home_division_id IS NOT NULL
                 AND sa.is_cross_division_scan = 1 THEN 'CROSS_DIVISION_MOVED'
            WHEN sa.home_division_id IS NULL
                 AND sa.scan_division_id IS NOT NULL THEN 'NO_HOME_DIVISION'
            ELSE 'UNMAPPED_EMPLOYEE'
        END AS sort_status,

        sa.is_cross_division_scan,

        -- Note
        CASE
            WHEN sa.scan_count = 1 THEN 'Single scan - durasi estimasi ' + CAST(@std_min/60 AS NVARCHAR(10)) + ' jam'
            ELSE NULL
        END AS note,

        NULL AS manual_input_id,
        'SYSTEM' AS created_by

    INTO #final
    FROM #scan_agg sa;

    -- Karyawan dengan manual input tapi TIDAK ada scan_log
    INSERT INTO #final (
        emp_code, employee_id, first_scan, last_scan, scan_count,
        scan_machines, scan_divisions, first_machine_id, last_machine_id,
        scan_division_id, home_division_id, final_division_id,
        work_duration_minutes, is_estimated_duration, overtime_minutes, is_overtime,
        attendance_status, sort_status, is_cross_division_scan, note,
        manual_input_id, created_by
    )
    SELECT
        m.emp_code, m.employee_id,
        NULL, NULL, 0,
        NULL, NULL, NULL, NULL,
        NULL, e.division_id, e.division_id,
        ISNULL(m.hours_override, @std_min), 1 AS is_estimated_duration,
        GREATEST(ISNULL(m.hours_override, @std_min) - @std_min, 0) AS overtime_minutes,
        CASE WHEN ISNULL(m.hours_override, @std_min) > @std_min THEN 1 ELSE 0 END AS is_overtime,
        CASE WHEN m.attendance_type IN ('SICK','PERMIT','ASSIGNMENT') THEN 'PRESENT' ELSE 'ABSENT' END AS attendance_status,
        'MANUAL_INPUT',
        0 AS is_cross_division_scan,
        m.note,
        m.manual_id, m.created_by
    FROM #manual m
    JOIN mst_employee e ON m.employee_id = e.employee_id
    WHERE NOT EXISTS (
        SELECT 1 FROM #scan_agg sa WHERE sa.employee_id = m.employee_id
    );

    -- ============================================================
    -- MERGE ke employee_attendance_daily
    -- ============================================================
    IF @dry_run = 0
    BEGIN
        MERGE employee_attendance_daily AS target
        USING #final AS source
        ON target.employee_id = source.employee_id AND target.work_date = @p_date
        WHEN MATCHED THEN UPDATE SET
            home_division_id        = source.home_division_id,
            final_division_id       = source.final_division_id,
            scan_division_id        = source.scan_division_id,
            first_machine_id        = source.first_machine_id,
            last_machine_id         = source.last_machine_id,
            first_scan_time         = source.first_scan,
            last_scan_time          = source.last_scan,
            scan_count              = source.scan_count,
            work_duration_minutes   = source.work_duration_minutes,
            standard_minutes        = @std_min,
            is_estimated_duration   = source.is_estimated_duration,
            overtime_minutes        = source.overtime_minutes,
            is_overtime             = source.is_overtime,
            attendance_status       = source.attendance_status,
            sort_status             = source.sort_status,
            is_cross_division_scan  = source.is_cross_division_scan,
            need_manual_review      = CASE WHEN source.sort_status IN ('NO_HOME_DIVISION','UNMAPPED_EMPLOYEE') THEN 1 ELSE 0 END,
            note                    = source.note,
            manual_input_id         = source.manual_input_id,
            processed_at            = GETDATE(),
            process_version         = 'v3',
            updated_at              = GETDATE()
        WHEN NOT MATCHED THEN INSERT (
            emp_code, employee_id, work_date,
            home_division_id, final_division_id, scan_division_id,
            first_machine_id, last_machine_id,
            first_scan_time, last_scan_time,
            scan_count, work_duration_minutes, standard_minutes,
            is_estimated_duration, overtime_minutes, is_overtime,
            attendance_status, sort_status,
            is_cross_division_scan, need_manual_review,
            note, manual_input_id,
            processed_at, process_version,
            created_at
        ) VALUES (
            source.emp_code, source.employee_id, @p_date,
            source.home_division_id, source.final_division_id, source.scan_division_id,
            source.first_machine_id, source.last_machine_id,
            source.first_scan, source.last_scan,
            source.scan_count, source.work_duration_minutes, @std_min,
            source.is_estimated_duration, source.overtime_minutes, source.is_overtime,
            source.attendance_status, source.sort_status,
            source.is_cross_division_scan,
            CASE WHEN source.sort_status IN ('NO_HOME_DIVISION','UNMAPPED_EMPLOYEE') THEN 1 ELSE 0 END,
            source.note, source.manual_input_id,
            GETDATE(), 'v3',
            GETDATE()
        );

        -- ============================================================
        -- MERGE ke attendance_sorting_result
        -- ============================================================
        MERGE attendance_sorting_result AS target
        USING #final AS source
        ON target.employee_id = source.employee_id AND target.work_date = @p_date
        WHEN MATCHED THEN UPDATE SET
            home_division_id        = source.home_division_id,
            scan_division_id        = source.scan_division_id,
            final_division_id       = source.final_division_id,
            machine_id              = source.first_machine_id,
            sort_status             = source.sort_status,
            sort_rule               = CASE
                WHEN source.sort_status = 'MATCH_HOME_DIVISION' THEN 'RULE_HOME_DIVISION'
                WHEN source.sort_status = 'CROSS_DIVISION_MOVED' THEN 'RULE_HOME_DIVISION'
                WHEN source.sort_status = 'NO_HOME_DIVISION' THEN 'RULE_MACHINE_DIVISION'
                WHEN source.sort_status = 'MANUAL_INPUT' THEN 'RULE_MANUAL_INPUT'
                ELSE 'RULE_UNKNOWN'
            END,
            is_cross_division       = source.is_cross_division_scan,
            note                    = source.note,
            sorted_by               = source.created_by,
            sorted_at               = GETDATE()
        WHEN NOT MATCHED THEN INSERT (
            emp_code, employee_id, work_date,
            machine_id, scan_division_id, home_division_id, final_division_id,
            sort_status, sort_rule, is_cross_division,
            need_review, note, sorted_by, sorted_at
        ) VALUES (
            source.emp_code, source.employee_id, @p_date,
            source.first_machine_id, source.scan_division_id,
            source.home_division_id, source.final_division_id,
            source.sort_status,
            CASE
                WHEN source.sort_status = 'MATCH_HOME_DIVISION' THEN 'RULE_HOME_DIVISION'
                WHEN source.sort_status = 'CROSS_DIVISION_MOVED' THEN 'RULE_HOME_DIVISION'
                WHEN source.sort_status = 'NO_HOME_DIVISION' THEN 'RULE_MACHINE_DIVISION'
                WHEN source.sort_status = 'MANUAL_INPUT' THEN 'RULE_MANUAL_INPUT'
                ELSE 'RULE_UNKNOWN'
            END,
            source.is_cross_division_scan,
            CASE WHEN source.sort_status IN ('NO_HOME_DIVISION','UNMAPPED_EMPLOYEE') THEN 1 ELSE 0 END,
            source.note,
            source.created_by,
            GETDATE()
        );

        -- ============================================================
        -- Tandai ABSENT untuk karyawan yang tidak ada scan & manual
        -- ============================================================
        UPDATE ad SET
            ad.attendance_status = 'ABSENT',
            ad.updated_at = GETDATE()
        FROM employee_attendance_daily ad
        JOIN mst_employee e ON ad.employee_id = e.employee_id
        WHERE ad.work_date = @p_date
          AND ad.scan_count = 0
          AND ad.manual_input_id IS NULL;
    END

    -- ============================================================
    -- Output result
    -- ============================================================
    IF @dry_run = 1
    BEGIN
        SELECT 'DRY RUN - no changes committed' AS status, @p_date AS work_date, @std_min AS standard_minutes;
        SELECT * FROM #final ORDER BY emp_code;
    END
    ELSE
    BEGIN
        SELECT
            'SYNCED'                    AS status,
            @p_date                      AS work_date,
            COUNT(DISTINCT emp_code)     AS total_employees,
            SUM(CASE WHEN attendance_status = 'PRESENT'     THEN 1 ELSE 0 END) AS total_present,
            SUM(CASE WHEN attendance_status = 'ABSENT'      THEN 1 ELSE 0 END) AS total_absent,
            SUM(CASE WHEN attendance_status = 'SINGLE_SCAN' THEN 1 ELSE 0 END) AS total_single_scan,
            SUM(CASE WHEN is_cross_division_scan = 1        THEN 1 ELSE 0 END) AS total_cross_division,
            SUM(overtime_minutes)        AS total_overtime_minutes
        FROM #final;
    END

    DROP TABLE IF EXISTS #scan_agg;
    DROP TABLE IF EXISTS #manual;
    DROP TABLE IF EXISTS #final;
END
GO

PRINT '[OK] sp_sync_attendance_daily';

-- ============================================================
-- 5. sp_get_dashboard_attendance
--    Dashboard ringkasan absensi per divisi
-- ============================================================
IF OBJECT_ID('dbo.sp_get_dashboard_attendance', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_get_dashboard_attendance;
GO

CREATE PROCEDURE sp_get_dashboard_attendance
    @start_date   DATE = NULL,
    @end_date     DATE = NULL,
    @division_id  INT  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @s DATE = ISNULL(@start_date, CAST(DATEADD(DAY, -29, GETDATE()) AS DATE));
    DECLARE @e DATE = ISNULL(@end_date,   CAST(GETDATE() AS DATE));

    SELECT
        d.division_id,
        d.division_code,
        d.division_name,
        COUNT(DISTINCT e.employee_id)                                   AS total_employee,
        SUM(CASE WHEN ad.attendance_status = 'PRESENT'      THEN 1 ELSE 0 END) AS total_present,
        SUM(CASE WHEN ad.attendance_status = 'ABSENT'       THEN 1 ELSE 0 END) AS total_absent,
        SUM(CASE WHEN ad.attendance_status = 'SINGLE_SCAN'  THEN 1 ELSE 0 END) AS total_single_scan,
        SUM(CASE WHEN ad.is_cross_division_scan = 1          THEN 1 ELSE 0 END) AS total_cross_division,
        SUM(CASE WHEN ad.is_estimated_duration = 1           THEN 1 ELSE 0 END) AS total_estimated,
        SUM(ad.overtime_minutes)                                       AS total_overtime_minutes,
        ROUND(AVG(CAST(ad.work_duration_minutes AS FLOAT)), 1)         AS avg_work_minutes
    FROM mst_division d
    LEFT JOIN mst_employee e  ON d.division_id = e.division_id
    LEFT JOIN employee_attendance_daily ad
           ON e.employee_id = ad.employee_id
          AND ad.work_date BETWEEN @s AND @e
    WHERE (@division_id IS NULL OR d.division_id = @division_id)
      AND d.is_active = 1
    GROUP BY d.division_id, d.division_code, d.division_name
    ORDER BY d.division_code;
END
GO

PRINT '[OK] sp_get_dashboard_attendance';

-- ============================================================
-- 6. sp_get_cross_division_scan
--    Laporan karyawan yang scan di luar divisi sendiri
-- ============================================================
IF OBJECT_ID('dbo.sp_get_cross_division_scan', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_get_cross_division_scan;
GO

CREATE PROCEDURE sp_get_cross_division_scan
    @start_date   DATE = NULL,
    @end_date     DATE = NULL,
    @division_id  INT  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @s DATE = ISNULL(@start_date, CAST(DATEADD(DAY, -29, GETDATE()) AS DATE));
    DECLARE @e DATE = ISNULL(@end_date,   CAST(GETDATE() AS DATE));

    SELECT
        s.emp_code,
        e.emp_name,
        s.work_date,
        m.machine_code,
        sd.division_code AS scan_division,
        hd.division_code AS home_division,
        fd.division_code AS final_division,
        ad.scan_count,
        ad.work_duration_minutes,
        ad.overtime_minutes,
        s.sort_status,
        s.note,
        s.sorted_at
    FROM attendance_sorting_result s
    JOIN mst_employee e       ON s.employee_id = e.employee_id
    LEFT JOIN mst_machine m   ON s.machine_id   = m.machine_id
    LEFT JOIN mst_division sd ON s.scan_division_id  = sd.division_id
    LEFT JOIN mst_division hd ON s.home_division_id  = hd.division_id
    LEFT JOIN mst_division fd ON s.final_division_id = fd.division_id
    LEFT JOIN employee_attendance_daily ad
           ON s.employee_id = ad.employee_id
          AND s.work_date = ad.work_date
    WHERE s.is_cross_division = 1
      AND s.work_date BETWEEN @s AND @e
      AND (@division_id IS NULL OR s.home_division_id = @division_id OR s.final_division_id = @division_id)
    ORDER BY s.work_date DESC, s.emp_code;
END
GO

PRINT '[OK] sp_get_cross_division_scan';

-- ============================================================
-- 7. sp_get_employee_attendance_detail
--    Detail absensi 1 karyawan
-- ============================================================
IF OBJECT_ID('dbo.sp_get_employee_attendance_detail', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_get_employee_attendance_detail;
GO

CREATE PROCEDURE sp_get_employee_attendance_detail
    @employee_id INT  = NULL,
    @emp_code   NVARCHAR(50) = NULL,
    @start_date DATE = NULL,
    @end_date   DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @s DATE = ISNULL(@start_date, CAST(DATEADD(DAY, -29, GETDATE()) AS DATE));
    DECLARE @e DATE = ISNULL(@end_date,   CAST(GETDATE() AS DATE));

    -- Get employee
    DECLARE @eid INT = ISNULL(@employee_id,
        (SELECT employee_id FROM mst_employee WHERE emp_code = @emp_code)
    );

    -- Daily summary
    SELECT
        ad.work_date,
        ad.attendance_status,
        ad.scan_count,
        ad.first_scan_time,
        ad.last_scan_time,
        ad.work_duration_minutes,
        ad.standard_minutes,
        ad.is_estimated_duration,
        ad.overtime_minutes,
        ad.is_overtime,
        ad.is_cross_division_scan,
        hd.division_code  AS home_division,
        fd.division_code AS final_division,
        sd.division_code AS scan_division,
        m.machine_code    AS first_machine,
        ad.note
    FROM employee_attendance_daily ad
    LEFT JOIN mst_division hd ON ad.home_division_id  = hd.division_id
    LEFT JOIN mst_division fd ON ad.final_division_id = fd.division_id
    LEFT JOIN mst_division sd ON ad.scan_division_id  = sd.division_id
    LEFT JOIN mst_machine m   ON ad.first_machine_id = m.machine_id
    WHERE ad.employee_id = @eid
      AND ad.work_date BETWEEN @s AND @e
    ORDER BY ad.work_date;

    -- Scan events
    SELECT
        sl.scan_time,
        sl.scan_type,
        sl.raw_source,
        m.machine_code,
        d.division_code AS scan_division
    FROM attendance_scan_log sl
    LEFT JOIN mst_machine m ON sl.machine_id = m.machine_id
    LEFT JOIN mst_division d ON sl.scan_division_id = d.division_id
    WHERE sl.employee_id = @eid
      AND sl.work_date BETWEEN @s AND @e
    ORDER BY sl.scan_time;
END
GO

PRINT '[OK] sp_get_employee_attendance_detail';

-- ============================================================
-- 8. sp_insert_manual_input
--    Input absensi manual
-- ============================================================
IF OBJECT_ID('dbo.sp_insert_manual_input', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_insert_manual_input;
GO

CREATE PROCEDURE sp_insert_manual_input
    @employee_id     INT,
    @emp_code       NVARCHAR(50),
    @work_date      DATE,
    @attendance_type NVARCHAR(30),
    @hours_override INT = NULL,
    @note           NVARCHAR(500) = NULL,
    @created_by     NVARCHAR(100),
    @approved_by    NVARCHAR(100) = NULL,
    @auto_approve   BIT = 0,
    @new_id         BIGINT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Validasi type
    IF NOT EXISTS (SELECT 1 FROM attendance_manual_type WHERE type_code = @attendance_type)
    BEGIN
        SELECT 'ERROR' AS status, 'Invalid attendance_type: ' + @attendance_type AS message;
        RETURN;
    END

    -- Validasi employee
    IF NOT EXISTS (SELECT 1 FROM mst_employee WHERE employee_id = @employee_id)
    BEGIN
        SELECT 'ERROR' AS status, 'Employee not found: ' + CAST(@employee_id AS NVARCHAR(10)) AS message;
        RETURN;
    END

    -- Check duplicate
    IF EXISTS (
        SELECT 1 FROM attendance_manual_input
        WHERE employee_id = @employee_id
          AND work_date = @work_date
          AND attendance_type = @attendance_type
    )
    BEGIN
        SELECT 'ERROR' AS status, 'Duplicate: this manual input already exists' AS message;
        RETURN;
    END

    INSERT INTO attendance_manual_input (
        employee_id, emp_code, work_date, attendance_type,
        hours_override, note,
        approved_by, approved_at, is_approved,
        created_by
    ) VALUES (
        @employee_id, @emp_code, @work_date, @attendance_type,
        @hours_override, @note,
        CASE WHEN @auto_approve = 1 THEN @approved_by ELSE NULL END,
        CASE WHEN @auto_approve = 1 THEN GETDATE() ELSE NULL END,
        CASE WHEN @auto_approve = 1 THEN 1 ELSE 0 END,
        @created_by
    );

    SET @new_id = SCOPE_IDENTITY();

    -- Auto-sync jika sudah di-approve
    IF @auto_approve = 1
    BEGIN
        DECLARE @p_date DATE = @work_date;
        EXEC sp_sync_attendance_daily @work_date = @p_date;
    END

    SELECT 'OK' AS status, 'Manual input created' AS message, @new_id AS new_id;
END
GO

PRINT '[OK] sp_insert_manual_input';

-- ============================================================
-- 9. sp_approve_manual_input
--    Approve manual input + re-sync attendance
-- ============================================================
IF OBJECT_ID('dbo.sp_approve_manual_input', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_approve_manual_input;
GO

CREATE PROCEDURE sp_approve_manual_input
    @manual_id    BIGINT,
    @approved_by  NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @emp_id INT, @work_dt DATE;

    UPDATE attendance_manual_input SET
        is_approved = 1,
        approved_by = @approved_by,
        approved_at = GETDATE(),
        updated_at  = GETDATE()
    WHERE manual_id = @manual_id AND is_approved = 0;

    IF @@ROWCOUNT = 0
    BEGIN
        SELECT 'ERROR' AS status, 'Manual input not found or already approved' AS message;
        RETURN;
    END

    SELECT @emp_id = employee_id, @work_dt = work_date
    FROM attendance_manual_input WHERE manual_id = @manual_id;

    SELECT 'OK' AS status, 'Manual input approved' AS message;

    EXEC sp_sync_attendance_daily @work_date = @work_dt;
END
GO

PRINT '[OK] sp_approve_manual_input';

-- ============================================================
-- 10. sp_insert_scan_log
--    Bulk insert scan events dari ZKTeco / API
--    Akan auto-create employee record jika employee_id NULL
-- ============================================================
IF OBJECT_ID('dbo.sp_insert_scan_log', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_insert_scan_log;
GO

CREATE PROCEDURE sp_insert_scan_log
    @data NVARCHAR(MAX)  -- JSON array of scan events
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @json TABLE (
        emp_code         NVARCHAR(50),
        machine_id       INT,
        scan_time        DATETIME,
        scan_type        NVARCHAR(20),
        raw_source       NVARCHAR(20),
        raw_device_id    NVARCHAR(50),
        raw_timestamp    BIGINT,
        raw_verified     INT,
        raw_status       INT
    );

    BEGIN TRY
        INSERT INTO @json
        SELECT
            emp_code, machine_id, scan_time, scan_type, raw_source,
            raw_device_id, raw_timestamp, raw_verified, raw_status
        FROM OPENJSON(@data)
        WITH (
            emp_code       NVARCHAR(50) '$.emp_code',
            machine_id     INT          '$.machine_id',
            scan_time      DATETIME     '$.scan_time',
            scan_type      NVARCHAR(20) '$.scan_type',
            raw_source     NVARCHAR(20) '$.raw_source',
            raw_device_id  NVARCHAR(50) '$.raw_device_id',
            raw_timestamp  BIGINT       '$.raw_timestamp',
            raw_verified   INT          '$.raw_verified',
            raw_status     INT          '$.raw_status'
        );

        -- Insert scan log
        INSERT INTO attendance_scan_log (
            emp_code, machine_id, scan_time, work_date,
            scan_type, raw_source,
            raw_device_id, raw_timestamp, raw_verified, raw_status,
            scan_division_id
        )
        SELECT
            j.emp_code,
            j.machine_id,
            j.scan_time,
            CAST(j.scan_time AS DATE) AS work_date,
            j.scan_type,
            j.raw_source,
            j.raw_device_id,
            j.raw_timestamp,
            j.raw_verified,
            j.raw_status,
            m.default_division_id
        FROM @json j
        LEFT JOIN mst_machine m ON j.machine_id = m.machine_id;

        SELECT 'OK' AS status,
               @@ROWCOUNT AS rows_inserted,
               (SELECT COUNT(*) FROM @json) AS total_submitted;
    END TRY
    BEGIN CATCH
        SELECT 'ERROR' AS status, ERROR_MESSAGE() AS message;
    END CATCH
END
GO

PRINT '[OK] sp_insert_scan_log';

PRINT '';
PRINT '=== MIGRATION v3 COMPLETE ===';
PRINT 'Created:';
PRINT '  - attendance_scan_log';
PRINT '  - attendance_manual_input';
PRINT '  - attendance_manual_type';
PRINT '  - 7 stored procedures';
GO
