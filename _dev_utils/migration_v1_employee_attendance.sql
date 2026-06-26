-- ================================================================
-- MIGRATION: Employee Attendance Daily System
-- Database: extend_db_ptrj (SERVER_PROFILE_1)
-- Created: 2026-05-30
-- ================================================================
-- Konsep:
--   - mesin absensi = lokasi scan (bukan divisi karyawan)
--   - 1 karyawan = 1 baris per hari (UNIQUE emp_code + work_date)
--   - final_division = home_division karyawan (bukan scan location)
--   - single scan → estimasi jam kerja default
--   - Jam kerja: Senin-Kamis=7 jam, Jumat=5 jam
--   - Lebih dari itu = overtime
-- ================================================================

PRINT '============================================';
PRINT 'STARTING MIGRATION: Employee Attendance Daily';
PRINT '============================================';

BEGIN TRY BEGIN TRANSACTION;

-- ================================================================
-- 1. mst_division — Master Divisi
-- ================================================================
IF OBJECT_ID('mst_division', 'U') IS NULL
BEGIN
    CREATE TABLE mst_division (
        division_id     INT IDENTITY(1,1) PRIMARY KEY,
        division_code    NVARCHAR(20) NOT NULL UNIQUE,  -- PG1A, DME, ARE, IJL, dll
        division_name    NVARCHAR(100) NOT NULL,
        emp_code_prefix  NVARCHAR(5) NOT NULL,           -- A, B, C, D, E, F, G, H, J, L
        is_active        BIT DEFAULT 1,
        created_at       DATETIME DEFAULT GETDATE(),
        updated_at       DATETIME DEFAULT GETDATE()
    );

    -- Seed data
    INSERT INTO mst_division (division_code, division_name, emp_code_prefix) VALUES
        ('PG1A',  'Plant Group 1A',          'A'),
        ('PG1B',  'Plant Group 1B',          'B'),
        ('PG2A',  'Plant Group 2A',          'C'),
        ('PG2B',  'Plant Group 2B',          'D'),
        ('DME',   'Divisi Mill Estate',       'E'),
        ('ARA',   'Ari Estate',              'F'),
        ('ARB1',  'Ar挺 Estate 1',            'G'),
        ('ARB2',  'Ari Estate 2',            'H'),
        ('AREC',  'Ari Estate Clinic',       'J'),
        ('IJL',   'Ijuk Estate',             'L'),
        ('PGE',   'Pabrik Head Office',      'A'),
        ('INFRA', 'Infrastructure',          'A'),
        ('STF',   'Staff/Office',           'A'),
        ('SEC',   'Security',               'A');

    PRINT 'Created: mst_division';
END
ELSE PRINT 'Exists: mst_division';

-- ================================================================
-- 2. mst_machine — Master Mesin Absensi
-- ================================================================
IF OBJECT_ID('mst_machine', 'U') IS NULL
BEGIN
    CREATE TABLE mst_machine (
        machine_id       INT IDENTITY(1,1) PRIMARY KEY,
        machine_code     NVARCHAR(20) NOT NULL UNIQUE,   -- PGE, DME_01, ARE, dll
        machine_name     NVARCHAR(100),
        machine_ip       NVARCHAR(50),
        machine_port     INT DEFAULT 4370,
        machine_type     NVARCHAR(20) DEFAULT 'ZKTECO',  -- ZKTECO, IT_SOLUTION_API
        division_id      INT NULL,                        -- mesin ini milik divisi mana
        scanner_code     INT NULL,                        -- suffix code di mesin
        loc_code         NVARCHAR(5) NULL,                -- A, B, C, D, E, F, G, H, J, L
        is_active        BIT DEFAULT 1,
        last_sync_at     DATETIME NULL,
        created_at       DATETIME DEFAULT GETDATE(),
        updated_at       DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_machine_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id)
    );

    -- Seed data dari machine-config.ts
    INSERT INTO mst_machine (machine_code, machine_name, machine_ip, machine_port, machine_type, scanner_code, loc_code, division_id)
    VALUES
        ('PGE',    'Pabrik Head Office',      '10.0.0.232',       4370, 'ZKTECO',     NULL,  'A', (SELECT division_id FROM mst_division WHERE division_code = 'PGE')),
        ('MILL',   'Mill Office',             '103.127.66.32',    4370, 'ZKTECO',     NULL,  'A', (SELECT division_id FROM mst_division WHERE division_code = 'PGE')),
        ('DME_01', 'Mill Estate 01',          '103.144.228.42',   4700, 'ZKTECO',     700,   'E', (SELECT division_id FROM mst_division WHERE division_code = 'DME')),
        ('DME_02', 'Mill Estate 02',          '103.144.228.42',   4701, 'ZKTECO',     700,   'E', (SELECT division_id FROM mst_division WHERE division_code = 'DME')),
        ('ARE',    'Ari Estate',              '103.144.208.154',  4370, 'ZKTECO',     NULL,  NULL,(SELECT division_id FROM mst_division WHERE division_code = 'ARE')),
        ('IJL',    'Ijuk Estate',             '103.144.211.226',  4370, 'ZKTECO',     NULL,  'L', (SELECT division_id FROM mst_division WHERE division_code = 'IJL')),
        ('ARA',    'Ari Estate Main',         '103.144.208.154',  4800, 'ZKTECO',     800,   'F', (SELECT division_id FROM mst_division WHERE division_code = 'ARA')),
        ('AB1',    'Ari Estate 1',            '103.144.208.154',  4900, 'ZKTECO',     900,   'G', (SELECT division_id FROM mst_division WHERE division_code = 'ARB1')),
        ('AB2',    'Ari Estate 2',            '103.144.208.154',  4400, 'ZKTECO',     400,   'H', (SELECT division_id FROM mst_division WHERE division_code = 'ARB2')),
        ('ARC_01', 'Ari Clinic 01',            '103.144.208.154',  4200, 'ZKTECO',     200,   'J', (SELECT division_id FROM mst_division WHERE division_code = 'AREC')),
        ('ARC_02', 'Ari Clinic 02',            '103.144.208.154',  4201, 'ZKTECO',     200,   'J', (SELECT division_id FROM mst_division WHERE division_code = 'AREC')),
        ('P1A',    'Plant Group 1A',          '223.25.98.220',    4100, 'ZKTECO',     100,   'A', (SELECT division_id FROM mst_division WHERE division_code = 'PG1A')),
        ('P1B',    'Plant Group 1B',          '223.25.98.220',    4300, 'ZKTECO',     300,   'B', (SELECT division_id FROM mst_division WHERE division_code = 'PG1B')),
        ('P2A',    'Plant Group 2A',          '223.25.98.220',    4500, 'ZKTECO',     500,   'C', (SELECT division_id FROM mst_division WHERE division_code = 'PG2A')),
        ('P2B',    'Plant Group 2B',          '223.25.98.220',    4600, 'ZKTECO',     600,   'D', (SELECT division_id FROM mst_division WHERE division_code = 'PG2B'));

    PRINT 'Created: mst_machine';
END
ELSE PRINT 'Exists: mst_machine';

-- ================================================================
-- 3. mst_employee — Master Karyawan
-- ================================================================
IF OBJECT_ID('mst_employee', 'U') IS NULL
BEGIN
    CREATE TABLE mst_employee (
        employee_id      INT IDENTITY(1,1) PRIMARY KEY,
        emp_code         NVARCHAR(50) NOT NULL UNIQUE,   -- A0039, B0012, E0120, dll
        emp_name         NVARCHAR(255) NOT NULL,
        division_id      INT NOT NULL,                    -- home division (divisi asli karyawan)
        emp_type         NVARCHAR(20) DEFAULT 'STAFF',     -- STAFF, HARVEST (pemanen), SECURITY, CONTRACT
        is_active        BIT DEFAULT 1,
        scanner_id      INT NULL,                          -- deviceUserId di mesin absensi
        created_at       DATETIME DEFAULT GETDATE(),
        updated_at       DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_employee_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id)
    );

    PRINT 'Created: mst_employee';
END
ELSE PRINT 'Exists: mst_employee';

-- ================================================================
-- 4. attendance_scan_log — Semua raw scan events
-- ================================================================
IF OBJECT_ID('attendance_scan_log', 'U') IS NULL
BEGIN
    CREATE TABLE attendance_scan_log (
        scan_id          BIGINT IDENTITY(1,1) PRIMARY KEY,
        emp_code         NVARCHAR(50) NOT NULL,
        machine_id       INT NULL,
        machine_code     NVARCHAR(20) NULL,
        scan_time        DATETIME NOT NULL,
        work_date        DATE NOT NULL,
        raw_source       NVARCHAR(20) NOT NULL,   -- ZKTECO, IT_SOLUTION_API
        raw_data         NVARCHAR(MAX) NULL,      -- JSON asli dari mesin/API
        created_at       DATETIME DEFAULT GETDATE(),
        CONSTRAINT FK_scan_machine FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id)
    );

    -- Index untuk performa agregasi
    CREATE INDEX IX_scan_log_emp_date ON attendance_scan_log(emp_code, work_date);
    CREATE INDEX IX_scan_log_work_date ON attendance_scan_log(work_date);
    CREATE INDEX IX_scan_log_machine ON attendance_scan_log(machine_code, work_date);

    PRINT 'Created: attendance_scan_log';
END
ELSE PRINT 'Exists: attendance_scan_log';

-- ================================================================
-- 5. employee_attendance_daily — 1 baris per karyawan per hari
-- ================================================================
IF OBJECT_ID('employee_attendance_daily', 'U') IS NULL
BEGIN
    CREATE TABLE employee_attendance_daily (
        attendance_id    BIGINT IDENTITY(1,1) PRIMARY KEY,
        emp_code         NVARCHAR(50) NOT NULL,
        work_date        DATE NOT NULL,

        -- Division tracking
        home_division_id INT NOT NULL,             -- dari mst_employee
        final_division_id INT NOT NULL,            -- hasil sortir (biasanya = home)
        scan_division_id  INT NULL,               -- divisi mesin tempat scan pertama

        -- Machine info
        first_machine_id  INT NULL,
        last_machine_id   INT NULL,

        -- Timestamps
        first_scan_time   DATETIME NULL,
        last_scan_time    DATETIME NULL,

        -- Scan count
        scan_count        INT DEFAULT 0,           -- total scan hari itu

        -- Work duration
        work_duration_minutes  INT NULL,           -- last_scan - first_scan (menit)
        standard_minutes       INT NULL,           -- jam kerja standar hari itu (420/300)
        is_estimated_duration  BIT DEFAULT 0,      -- 1 = single scan, durasi diestimasi

        -- Overtime
        overtime_minutes   INT DEFAULT 0,          -- MAX(0, work_duration - standard)
        is_overtime         BIT DEFAULT 0,

        -- Attendance status
        attendance_status  NVARCHAR(20) NOT NULL,   -- PRESENT / ABSENT / SINGLE_SCAN / MANUAL_INPUT
        sort_status        NVARCHAR(50) NOT NULL,   -- MATCH_HOME / CROSS_DIVISION / NO_HOME_DIVISION / UNMAPPED / MANUAL_OVERRIDE

        -- Flags
        is_cross_division_scan BIT DEFAULT 0,
        need_manual_review    BIT DEFAULT 0,

        -- Notes
        note               NVARCHAR(500) NULL,
        manual_input_id    BIGINT NULL,             -- kalau ada input manual

        -- Metadata
        processed_at       DATETIME DEFAULT GETDATE(),
        process_version    NVARCHAR(20) DEFAULT 'v1.0',

        -- Constraints
        CONSTRAINT UQ_emp_daily UNIQUE (emp_code, work_date),
        CONSTRAINT FK_emp_daily_home_div FOREIGN KEY (home_division_id) REFERENCES mst_division(division_id),
        CONSTRAINT FK_emp_daily_final_div FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id),
        CONSTRAINT FK_emp_daily_scan_div FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id),
        CONSTRAINT FK_emp_daily_first_machine FOREIGN KEY (first_machine_id) REFERENCES mst_machine(machine_id),
        CONSTRAINT FK_emp_daily_last_machine FOREIGN KEY (last_machine_id) REFERENCES mst_machine(machine_id)
    );

    CREATE INDEX IX_daily_final_div ON employee_attendance_daily(final_division_id, work_date);
    CREATE INDEX IX_daily_home_div ON employee_attendance_daily(home_division_id, work_date);
    CREATE INDEX IX_daily_work_date ON employee_attendance_daily(work_date);
    CREATE INDEX IX_daily_status ON employee_attendance_daily(attendance_status, work_date);
    CREATE INDEX IX_daily_overtime ON employee_attendance_daily(is_overtime, work_date);

    PRINT 'Created: employee_attendance_daily';
END
ELSE PRINT 'Exists: employee_attendance_daily';

-- ================================================================
-- 6. attendance_manual_input — Input manual (sakit, izin, tugas luar)
-- ================================================================
IF OBJECT_ID('attendance_manual_input', 'U') IS NULL
BEGIN
    CREATE TABLE attendance_manual_input (
        manual_id       BIGINT IDENTITY(1,1) PRIMARY KEY,
        emp_code        NVARCHAR(50) NOT NULL,
        work_date       DATE NOT NULL,

        -- Attendance type
        attendance_type NVARCHAR(30) NOT NULL,   -- SICK / PERMIT / ASSIGNMENT / HOLIDAY / OTHER / LATE / EARLY_OUT

        -- Time details (optional)
        check_in_time   DATETIME NULL,
        check_out_time  DATETIME NULL,
        duration_minutes INT NULL,

        -- Note & approval
        note            NVARCHAR(500) NULL,
        approved_by     NVARCHAR(100) NULL,
        is_approved     BIT DEFAULT 0,

        -- Who created
        created_by      NVARCHAR(100) NOT NULL,
        created_at      DATETIME DEFAULT GETDATE(),
        updated_at      DATETIME DEFAULT GETDATE(),

        -- Constraints
        CONSTRAINT UQ_manual_emp_date UNIQUE (emp_code, work_date)
    );

    CREATE INDEX IX_manual_emp_date ON attendance_manual_input(emp_code, work_date);
    CREATE INDEX IX_manual_work_date ON attendance_manual_input(work_date);
    CREATE INDEX IX_manual_type ON attendance_manual_input(attendance_type, work_date);

    PRINT 'Created: attendance_manual_input';
END
ELSE PRINT 'Exists: attendance_manual_input';

-- ================================================================
-- 7. attendance_work_config — Konfigurasi jam kerja & lembur
-- ================================================================
IF OBJECT_ID('attendance_work_config', 'U') IS NULL
BEGIN
    CREATE TABLE attendance_work_config (
        config_id       INT IDENTITY(1,1) PRIMARY KEY,
        day_of_week     INT NOT NULL,              -- 0=Sun, 1=Mon, ..., 6=Sat
        standard_minutes INT NOT NULL,             -- menit kerja standar (420 / 300 / 0)
        is_workday      BIT DEFAULT 1,             -- 0 = hari libur
        label           NVARCHAR(50) NULL,         -- 'Senin-Kamis', 'Jumat', 'Sabtu', 'Minggu'
        created_at      DATETIME DEFAULT GETDATE(),
        updated_at      DATETIME DEFAULT GETDATE()
    );

    -- Seed: Senin-Kamis=7 jam, Jumat=5 jam, default holiday=Minggu
    INSERT INTO attendance_work_config (day_of_week, standard_minutes, is_workday, label) VALUES
        (0, 0,   0, 'Minggu (Libur)'),       -- Minggu = libur
        (1, 420, 1, 'Senin (7 jam)'),
        (2, 420, 1, 'Selasa (7 jam)'),
        (3, 420, 1, 'Rabu (7 jam)'),
        (4, 420, 1, 'Kamis (7 jam)'),
        (5, 300, 1, 'Jumat (5 jam)'),
        (6, 0,   0, 'Sabtu (Libur)');

    PRINT 'Created: attendance_work_config';
END
ELSE PRINT 'Exists: attendance_work_config';

-- ================================================================
-- 8. attendance_sorting_result — Audit trail hasil sortir
-- ================================================================
IF OBJECT_ID('attendance_sorting_result', 'U') IS NULL
BEGIN
    CREATE TABLE attendance_sorting_result (
        sorting_id      BIGINT IDENTITY(1,1) PRIMARY KEY,
        emp_code        NVARCHAR(50) NOT NULL,
        work_date       DATE NOT NULL,

        -- Division info
        home_division_id  INT NULL,
        scan_division_id  INT NULL,
        final_division_id INT NOT NULL,

        -- Machine info
        machine_id        INT NULL,

        -- Sorting
        sort_status       NVARCHAR(50) NOT NULL,   -- MATCH_HOME / CROSS_DIVISION_MOVED / dll
        sort_rule         NVARCHAR(100) NOT NULL,   -- RULE_1_HOME_DIV / RULE_2_API_DIV / RULE_3_PREFIX / RULE_4_REVIEW
        is_cross_division  BIT DEFAULT 0,
        need_review        BIT DEFAULT 0,
        note               NVARCHAR(500) NULL,

        -- Metadata
        sorted_by         NVARCHAR(100) DEFAULT 'SYSTEM',
        sorted_at         DATETIME DEFAULT GETDATE(),

        -- Constraints
        CONSTRAINT UQ_sorting_emp_date UNIQUE (emp_code, work_date),
        CONSTRAINT FK_sorting_home_div FOREIGN KEY (home_division_id) REFERENCES mst_division(division_id),
        CONSTRAINT FK_sorting_scan_div FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id),
        CONSTRAINT FK_sorting_final_div FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id),
        CONSTRAINT FK_sorting_machine FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id)
    );

    CREATE INDEX IX_sorting_final ON attendance_sorting_result(final_division_id, work_date);
    CREATE INDEX IX_sorting_emp ON attendance_sorting_result(emp_code, work_date);
    CREATE INDEX IX_sorting_cross ON attendance_sorting_result(is_cross_division, work_date);

    PRINT 'Created: attendance_sorting_result';
END
ELSE PRINT 'Exists: attendance_sorting_result';

-- ================================================================
-- 9. attendance_holiday — Libur nasional / perusahaan
-- ================================================================
IF OBJECT_ID('attendance_holiday', 'U') IS NULL
BEGIN
    CREATE TABLE attendance_holiday (
        holiday_id      INT IDENTITY(1,1) PRIMARY KEY,
        holiday_date    DATE NOT NULL UNIQUE,
        holiday_name    NVARCHAR(255) NOT NULL,
        holiday_type    NVARCHAR(20) DEFAULT 'NATIONAL',  -- NATIONAL / COMPANY / REGIONAL
        is_annual       BIT DEFAULT 0,                    -- 1 = berulang tiap tahun
        created_at      DATETIME DEFAULT GETDATE()
    );

    PRINT 'Created: attendance_holiday';
END
ELSE PRINT 'Exists: attendance_holiday';

COMMIT;
PRINT '';
PRINT '============================================';
PRINT 'MIGRATION COMPLETE: All tables created';
PRINT '============================================';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'ERROR: ' + ERROR_MESSAGE();
    THROW;
END CATCH;