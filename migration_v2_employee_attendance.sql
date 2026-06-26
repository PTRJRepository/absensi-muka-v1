-- ================================================================
-- MIGRATION: v2_employee_attendance
-- Sistem Absensi PT Rebinmas Jaya
-- Date: 2026-05-30
-- ================================================================
-- Tables: 9
--   1. mst_division          - Master divisi
--   2. mst_machine           - Master mesin absensi
--   3. mst_employee          - Master karyawan + home division
--   4. attendance_work_config - Konfigurasi jam kerja per day-of-week
--   5. attendance_holiday   - Daftar hari libur
--   6. attendance_scan_log   - Semua raw scan events (N baris per karyawan per hari)
--   7. employee_attendance_daily - 1 baris per karyawan per hari (final result)
--   8. attendance_sorting_result - Hasil sortir divisi per karyawan per hari
--   9. attendance_manual_input  - Input manual: sakit, izin, tugas luar, dll
-- ================================================================

PRINT '========================================';
PRINT 'START: v2_employee_attendance migration';
PRINT '========================================';
GO

-- ================================================================
-- 1. mst_division
-- ================================================================
CREATE TABLE mst_division (
    division_id   INT IDENTITY(1,1) PRIMARY KEY,
    division_code  NVARCHAR(20)  NOT NULL UNIQUE,
    division_name  NVARCHAR(100) NOT NULL,
    loc_code       NVARCHAR(5)   NULL,
    emp_code_prefix CHAR(1)      NULL,
    is_active      BIT DEFAULT 1,
    created_at     DATETIME DEFAULT GETDATE()
);
GO

PRINT 'Created: mst_division';
GO

INSERT INTO mst_division (division_code, division_name, loc_code, emp_code_prefix) VALUES
    ('PG1A', 'Plantation Group 1A',  'A', 'A'),
    ('PG1B', 'Plantation Group 1B',  'B', 'B'),
    ('PG2A', 'Plantation Group 2A',  'C', 'C'),
    ('PG2B', 'Plantation Group 2B',  'D', 'D'),
    ('DME',  'Divisi Mill Estate',   'E', 'E'),
    ('ARA',  'Admin & Residential A','F', 'F'),
    ('ARB1', 'Admin & Residential B1','G', 'G'),
    ('ARB2', 'Admin & Residential B2','H', 'H'),
    ('AREC', 'Admin & Residential EC','J', 'J'),
    ('IJL',  'Industrial Jorong L',  'L', 'L'),
    ('INFRA','Infrastructure',        'N', NULL),
    ('OFFICE','Head Office',          'O', NULL),
    ('SECURITY','Security',           'S', NULL);
GO

PRINT 'Seeded: mst_division (13 rows)';
GO

-- ================================================================
-- 2. mst_machine
-- ================================================================
CREATE TABLE mst_machine (
    machine_id     INT IDENTITY(1,1) PRIMARY KEY,
    machine_code   NVARCHAR(30)  NOT NULL UNIQUE,
    machine_name   NVARCHAR(100) NOT NULL,
    ip_address     NVARCHAR(45)  NULL,
    port           INT DEFAULT 4370,
    location       NVARCHAR(100) NULL,
    division_id    INT NULL,
    machine_type   NVARCHAR(20)  DEFAULT 'ZKTECO',
    is_active      BIT DEFAULT 1,
    last_ping_at   DATETIME NULL,
    created_at     DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_machine_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id)
);
GO

PRINT 'Created: mst_machine';
GO

INSERT INTO mst_machine (machine_code, machine_name, ip_address, port, location, division_id, machine_type) VALUES
    ('PGE',    'PGE ZKTeco',             '10.0.0.232',       4370, 'PGE',       1,  'ZKTECO'),
    ('MILL',   'Mill ZKTeco',            '103.127.66.32',    4370, 'Mill',      5,  'ZKTECO'),
    ('DME_01', 'DME ZKTeco 01',         '103.144.228.42',   4700, 'DME',       5,  'ZKTECO'),
    ('DME_02', 'DME ZKTeco 02',         '103.144.228.42',   4701, 'DME',       5,  'ZKTECO'),
    ('ARE',    'ARE ZKTeco',             '103.144.208.154',  4370, 'ARE',       9,  'ZKTECO'),
    ('IJL',    'IJL ZKTeco',            '103.144.211.226',  4370, 'IJL',       10, 'ZKTECO'),
    ('ARA',    'ARA ZKTeco',            '103.144.208.154',  4800, 'ARA',       6,  'ZKTECO');
GO

PRINT 'Seeded: mst_machine (7 rows)';
GO

-- ================================================================
-- 3. mst_employee
-- ================================================================
CREATE TABLE mst_employee (
    employee_id    INT IDENTITY(1,1) PRIMARY KEY,
    emp_code       NVARCHAR(50)  NOT NULL UNIQUE,
    emp_name       NVARCHAR(255) NOT NULL,
    device_user_id NVARCHAR(50)  NULL,
    home_division_id INT NULL,
    is_active      BIT DEFAULT 1,
    created_at     DATETIME DEFAULT GETDATE(),
    updated_at     DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_employee_division FOREIGN KEY (home_division_id) REFERENCES mst_division(division_id)
);
GO

PRINT 'Created: mst_employee';
GO

CREATE INDEX IX_employee_device_user ON mst_employee(device_user_id);
CREATE INDEX IX_employee_emp_code ON mst_employee(emp_code);
GO

-- ================================================================
-- 4. attendance_work_config
-- ================================================================
CREATE TABLE attendance_work_config (
    config_id      INT IDENTITY(1,1) PRIMARY KEY,
    day_of_week    INT NOT NULL,  -- 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
    day_label      NVARCHAR(20) NOT NULL,
    standard_hours DECIMAL(4,2) NOT NULL,
    is_workday     BIT DEFAULT 1,
    updated_at     DATETIME DEFAULT GETDATE(),
    CONSTRAINT UQ_work_config_dow UNIQUE (day_of_week)
);
GO

PRINT 'Created: attendance_work_config';
GO

INSERT INTO attendance_work_config (day_of_week, day_label, standard_hours, is_workday) VALUES
    (0, 'Sunday',     0,    0),
    (1, 'Monday',    7.00, 1),
    (2, 'Tuesday',   7.00, 1),
    (3, 'Wednesday', 7.00, 1),
    (4, 'Thursday',  7.00, 1),
    (5, 'Friday',    5.00, 1),
    (6, 'Saturday',  7.00, 1);
GO

PRINT 'Seeded: attendance_work_config (7 rows)';
GO

-- ================================================================
-- 5. attendance_holiday
-- ================================================================
CREATE TABLE attendance_holiday (
    holiday_id   INT IDENTITY(1,1) PRIMARY KEY,
    holiday_date DATE NOT NULL UNIQUE,
    holiday_name NVARCHAR(255) NOT NULL,
    is_annual   BIT DEFAULT 0,
    created_at  DATETIME DEFAULT GETDATE()
);
GO

PRINT 'Created: attendance_holiday';
GO

-- Seed nasional Indonesia 2026
INSERT INTO attendance_holiday (holiday_date, holiday_name, is_annual) VALUES
    ('2026-01-01', 'Tahun Baru 2026', 1),
    ('2026-01-29', 'Isra Mikraj Nabi Muhammad SAW', 1),
    ('2026-02-18', 'Hari Raya Nyepi', 1),
    ('2026-03-20', 'Jumat Agung', 1),
    ('2026-03-29', 'Idul-Fitri 1448 H', 0),
    ('2026-03-30', 'Idul-Fitri 1448 H (Libur)', 0),
    ('2026-03-31', 'Idul-Fitri 1448 H (Cuti Bersama)', 0),
    ('2026-04-01', 'Idul-Fitri 1448 H (Cuti Bersama)', 0),
    ('2026-05-01', 'Hari Buruh Internasional', 1),
    ('2026-05-14', 'Hari Raya Waisak', 1),
    ('2026-05-25', 'Kenaikan Isa Almasih', 1),
    ('2026-06-01', 'Hari Lahir Pancasila', 1),
    ('2026-06-06', 'Idul-Adha 1448 H', 1),
    ('2026-08-17', 'Hari Ulang Tahun Kemerdekaan RI', 1),
    ('2026-09-06', 'Tahun Baru Islam 1448 H', 1),
    ('2026-11-09', 'Maulid Nabi Muhammad SAW', 1),
    ('2026-12-25', 'Hari Raya Natal', 1);
GO

PRINT 'Seeded: attendance_holiday (17 rows)';
GO

-- ================================================================
-- 6. attendance_scan_log
-- N baris per karyawan per hari (semua raw scan events)
-- ================================================================
CREATE TABLE attendance_scan_log (
    scan_id         BIGINT IDENTITY(1,1) PRIMARY KEY,
    emp_code        NVARCHAR(50) NOT NULL,
    employee_id     INT NULL,
    work_date       DATE NOT NULL,
    scan_time       DATETIME NOT NULL,
    machine_id      INT NULL,
    machine_code    NVARCHAR(30) NULL,
    scan_division_id INT NULL,
    raw_device_user_id NVARCHAR(50) NULL,
    raw_source      NVARCHAR(20) NOT NULL,  -- ZKTECO, API, MANUAL
    record_type     NVARCHAR(10) NULL,       -- IN, OUT, UNKNOWN
    imported_at     DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_scan_machine   FOREIGN KEY (machine_id)      REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_scan_division  FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_scan_employee  FOREIGN KEY (employee_id)     REFERENCES mst_employee(employee_id)
);
GO

PRINT 'Created: attendance_scan_log';
GO

CREATE INDEX IX_scan_log_emp_date ON attendance_scan_log(emp_code, work_date);
CREATE INDEX IX_scan_log_scan_time ON attendance_scan_log(scan_time);
GO

-- ================================================================
-- 7. employee_attendance_daily
-- 1 baris per karyawan per hari (final result setelah agregasi)
-- ================================================================
CREATE TABLE employee_attendance_daily (
    attendance_id   BIGINT IDENTITY(1,1) PRIMARY KEY,

    emp_code        NVARCHAR(50) NOT NULL,
    employee_id     INT NULL,
    work_date       DATE NOT NULL,

    home_division_id  INT NULL,
    scan_division_id  INT NULL,
    final_division_id INT NULL,
    is_cross_division_scan BIT DEFAULT 0,

    first_scan_time  DATETIME NULL,
    last_scan_time   DATETIME NULL,
    scan_count       INT DEFAULT 0,

    work_duration_minutes  INT NULL,     -- hitung dari first-last scan
    estimated_duration_minutes INT NULL,  -- pakai jam default jika single scan
    standard_minutes       INT NULL,      -- jam kerja standar hari itu
    overtime_minutes       INT DEFAULT 0,
    is_estimated_duration  BIT DEFAULT 0, -- 1 = pakai estimasi, bukan hitungan

    attendance_status NVARCHAR(20) NOT NULL,  -- PRESENT, ABSENT, SINGLE_SCAN, MANUAL_OVERRIDE
    note              NVARCHAR(500) NULL,

    created_at  DATETIME DEFAULT GETDATE(),
    updated_at  DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_attend_employee FOREIGN KEY (employee_id)      REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_attend_home_div  FOREIGN KEY (home_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_attend_scan_div  FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_attend_final_div FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT UQ_attendance_daily UNIQUE (emp_code, work_date)
);
GO

PRINT 'Created: employee_attendance_daily';
GO

CREATE INDEX IX_attend_emp_code ON employee_attendance_daily(emp_code);
CREATE INDEX IX_attend_work_date ON employee_attendance_daily(work_date);
CREATE INDEX IX_attend_final_div ON employee_attendance_daily(final_division_id);
GO

-- ================================================================
-- 8. attendance_sorting_result
-- Hasil sortir divisi per karyawan per hari
-- ================================================================
CREATE TABLE attendance_sorting_result (
    sorting_id       BIGINT IDENTITY(1,1) PRIMARY KEY,

    emp_code         NVARCHAR(50) NOT NULL,
    employee_id      INT NULL,
    work_date        DATE NOT NULL,

    machine_id       INT NULL,

    scan_division_id  INT NULL,
    home_division_id  INT NULL,
    final_division_id INT NULL,

    sorting_status   NVARCHAR(50) NOT NULL,  -- MATCH_HOME_DIVISION, CROSS_DIVISION_MOVED, NO_HOME_DIVISION, UNMAPPED_EMPLOYEE, NEED_MANUAL_REVIEW, MANUAL_OVERRIDE
    sorting_rule     NVARCHAR(100) NOT NULL,  -- RULE_1_HOME, RULE_2_API, RULE_3_PREFIX, RULE_4_FALLBACK

    is_cross_division_scan BIT DEFAULT 0,
    need_review       BIT DEFAULT 0,

    scan_machines     NVARCHAR(500) NULL,  -- comma-separated: DME_01,DME_02
    scan_count        INT DEFAULT 0,

    note              NVARCHAR(500) NULL,
    sorted_by         NVARCHAR(100) DEFAULT 'SYSTEM',
    sorted_at         DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_sort_employee  FOREIGN KEY (employee_id)      REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_sort_machine   FOREIGN KEY (machine_id)        REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_sort_scan_div  FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_sort_home_div   FOREIGN KEY (home_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_sort_final_div  FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT UQ_sorting_result UNIQUE (emp_code, work_date)
);
GO

PRINT 'Created: attendance_sorting_result';
GO

CREATE INDEX IX_sort_emp_code ON attendance_sorting_result(emp_code);
CREATE INDEX IX_sort_work_date ON attendance_sorting_result(work_date);
CREATE INDEX IX_sort_final_div ON attendance_sorting_result(final_division_id);
CREATE INDEX IX_sort_need_review ON attendance_sorting_result(need_review) WHERE need_review = 1;
GO

-- ================================================================
-- 9. attendance_manual_input
-- Input manual untuk absensi di luar mesin
-- ================================================================
CREATE TABLE attendance_manual_input (
    input_id       BIGINT IDENTITY(1,1) PRIMARY KEY,

    emp_code       NVARCHAR(50) NOT NULL,
    employee_id    INT NULL,
    work_date      DATE NOT NULL,

    attendance_type NVARCHAR(20) NOT NULL,  -- SICK, PERMIT, ASSIGNMENT, HOLIDAY, LATE, EARLY_OUT, OTHER
    notes          NVARCHAR(500) NULL,
    work_hours     DECIMAL(4,2) NULL,        -- jam kerja manual (override durasi)
    approved_by    NVARCHAR(100) NULL,

    created_by     NVARCHAR(100) DEFAULT 'SYSTEM',
    created_at     DATETIME DEFAULT GETDATE(),
    updated_at     DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_manual_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
    CONSTRAINT UQ_manual_input UNIQUE (emp_code, work_date, attendance_type)
);
GO

PRINT 'Created: attendance_manual_input';
GO

CREATE INDEX IX_manual_emp_code ON attendance_manual_input(emp_code);
CREATE INDEX IX_manual_work_date ON attendance_manual_input(work_date);
GO

-- ================================================================
-- View: Dashboard ringkasan per divisi per hari
-- ================================================================
CREATE OR ALTER VIEW v_dashboard_daily AS
SELECT
    d.division_id,
    d.division_code,
    d.division_name,
    a.work_date,

    COUNT(DISTINCT a.employee_id)                                    AS total_employees,
    SUM(CASE WHEN a.attendance_status IN ('PRESENT','SINGLE_SCAN','MANUAL_OVERRIDE') THEN 1 ELSE 0 END) AS total_present,
    SUM(CASE WHEN a.attendance_status = 'ABSENT' THEN 1 ELSE 0 END)  AS total_absent,
    SUM(CASE WHEN a.is_cross_division_scan = 1 THEN 1 ELSE 0 END)   AS total_cross_division,

    SUM(a.work_duration_minutes) / 60.0                              AS total_work_hours,
    SUM(a.overtime_minutes) / 60.0                                  AS total_overtime_hours
FROM employee_attendance_daily a
JOIN mst_division d ON a.final_division_id = d.division_id
GROUP BY d.division_id, d.division_code, d.division_name, a.work_date;
GO

PRINT 'Created: v_dashboard_daily';
GO

-- ================================================================
-- View: Laporan karyawan absen lintas divisi
-- ================================================================
CREATE OR ALTER VIEW v_cross_division_scan AS
SELECT
    s.work_date,
    s.emp_code,
    e.emp_name,
    scan_div.division_code  AS scan_division,
    home_div.division_code AS home_division,
    final_div.division_code AS final_division,
    m.machine_code,
    s.sorting_status,
    s.scan_count,
    s.note
FROM attendance_sorting_result s
JOIN mst_employee e ON s.employee_id = e.employee_id
LEFT JOIN mst_machine m ON s.machine_id = m.machine_id
LEFT JOIN mst_division scan_div ON s.scan_division_id = scan_div.division_id
LEFT JOIN mst_division home_div ON s.home_division_id = home_div.division_id
LEFT JOIN mst_division final_div ON s.final_division_id = final_div.division_id
WHERE s.is_cross_division_scan = 1;
GO

PRINT 'Created: v_cross_division_scan';
GO

-- ================================================================
-- View: Karyawan yang perlu review manual
-- ================================================================
CREATE OR ALTER VIEW v_attendance_needs_review AS
SELECT
    s.work_date,
    s.emp_code,
    e.emp_name,
    s.sorting_status,
    s.sorting_rule,
    s.need_review,
    s.note,
    s.sorted_by,
    s.sorted_at
FROM attendance_sorting_result s
JOIN mst_employee e ON s.employee_id = e.employee_id
WHERE s.need_review = 1;
GO

PRINT 'Created: v_attendance_needs_review';
GO

-- ================================================================
-- View: Rekap bulanan per divisi
-- ================================================================
CREATE OR ALTER VIEW v_monthly_summary AS
SELECT
    d.division_code,
    d.division_name,
    YEAR(a.work_date) AS year,
    MONTH(a.work_date) AS month,
    COUNT(DISTINCT a.employee_id)                                    AS total_employees,
    SUM(CASE WHEN a.attendance_status IN ('PRESENT','SINGLE_SCAN','MANUAL_OVERRIDE') THEN 1 ELSE 0 END) AS total_present,
    SUM(CASE WHEN a.attendance_status = 'ABSENT' THEN 1 ELSE 0 END)  AS total_absent,
    SUM(CASE WHEN a.is_cross_division_scan = 1 THEN 1 ELSE 0 END)   AS total_cross_division,
    SUM(a.overtime_minutes) / 60.0                                  AS total_overtime_hours
FROM employee_attendance_daily a
JOIN mst_division d ON a.final_division_id = d.division_id
GROUP BY d.division_code, d.division_name, YEAR(a.work_date), MONTH(a.work_date);
GO

PRINT 'Created: v_monthly_summary';
GO

PRINT '';
PRINT '========================================';
PRINT 'DONE: v2_employee_attendance migration';
PRINT 'Tables created: 9';
PRINT 'Views created: 4';
PRINT '========================================';
GO
