-- ============================================================
-- ATTENDANCE SYSTEM MIGRATION
-- Database: db_faceattn_ptrj (BARU - dedicated untuk absensi)
-- Target: SQL Server via direct connection
-- Generated: 2026-05-30
-- ============================================================

-- ============================================================
-- 1. mst_division — Master Divisi (14 divisi)
-- ============================================================
CREATE TABLE mst_division (
    division_id INT IDENTITY(1,1) PRIMARY KEY,
    division_code NVARCHAR(20) UNIQUE NOT NULL,
    division_name NVARCHAR(100) NOT NULL,
    loc_code CHAR(1) NOT NULL,
    emp_code_prefix CHAR(1) NOT NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- Seed mst_division
INSERT INTO mst_division (division_code, division_name, loc_code, emp_code_prefix) VALUES
    ('PG1A', 'Parit Gunung Estate A',       'A', 'A'),
    ('PG1B', 'Parit Gunung Estate B',       'B', 'B'),
    ('PG2A', 'Parit Gunung Estate A (Luar)','C', 'C'),
    ('PG2B', 'Parit Gunung Estate B (Luar)','D', 'D'),
    ('DME',  'Darul Makmur Estate',         'E', 'E'),
    ('ARA',  'Aik Ruak Estate',             'F', 'F'),
    ('ARB1', 'Aik Ruak B1 Estate',          'G', 'G'),
    ('ARB2', 'Aik Ruak B2 Estate',          'H', 'H'),
    ('AREC', 'Aik Ruak Estate Center',      'J', 'J'),
    ('IJL',  'Impian Jaya Lestari',         'L', 'L'),
    ('INFRA','Infrastruktur',               'I', 'I'),
    ('STF',  'Staff / Kantor',             'S', 'S'),
    ('SEC',  'Security',                    'K', 'K'),
    ('MGM',  'Management',                  'M', 'M');

-- ============================================================
-- 2. mst_machine — Master Mesin Absensi (15 mesin)
-- ============================================================
CREATE TABLE mst_machine (
    machine_id INT IDENTITY(1,1) PRIMARY KEY,
    machine_code NVARCHAR(20) UNIQUE NOT NULL,
    machine_name NVARCHAR(100) NOT NULL,
    ip_address NVARCHAR(50),
    port INT DEFAULT 4370,
    location NVARCHAR(100),
    division_id INT,
    machine_type NVARCHAR(20) DEFAULT 'ZKTECO',
    scanner_code INT NULL,
    is_active BIT DEFAULT 1,
    last_online_at DATETIME,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_machine_division
        FOREIGN KEY (division_id) REFERENCES mst_division(division_id)
);

-- Seed mst_machine
INSERT INTO mst_machine (machine_code, machine_name, ip_address, port, location, division_id, machine_type, scanner_code) VALUES
    ('PGE',   'PGE - Parit Gunung Estate',              '10.0.0.232',      4370, 'PGE',   NULL, 'ZKTECO', NULL),
    ('MILL',  'MILL - Mill',                           '103.127.66.32',   4370, 'MILL',  NULL, 'ZKTECO', NULL),
    ('DME_01','DME_01 - Darul Makmur Estate 1',       '103.144.228.42',  4700, 'DME',   NULL, 'ZKTECO', 700),
    ('DME_02','DME_02 - Darul Makmur Estate 2',       '103.144.228.42',  4701, 'DME',   NULL, 'ZKTECO', 700),
    ('ARE',   'ARE - Aik Ruak Estate',                 '103.144.208.154', 4370, 'ARE',   NULL, 'ZKTECO', NULL),
    ('IJL',   'IJL - Impian Jaya Lestari',             '103.144.211.226', 4370, 'IJL',   NULL, 'ZKTECO', NULL),
    ('ARA',   'ARA - Aik Ruak Estate Main',            '103.144.208.154', 4800, 'ARA',   NULL, 'ZKTECO', 800),
    ('AB1',   'AB1 - Aik Ruak B1',                    '103.144.208.154', 4900, 'ARB1',  NULL, 'ZKTECO', 900),
    ('AB2',   'AB2 - Aik Ruak B2',                    '103.144.208.154', 4400, 'ARB2',  NULL, 'ZKTECO', 400),
    ('ARC_01','ARC_01 - Aik Ruak Center 1',            '103.144.208.154', 4200, 'AREC',  NULL, 'ZKTECO', 200),
    ('ARC_02','ARC_02 - Aik Ruak Center 2',            '103.144.208.154', 4201, 'AREC',  NULL, 'ZKTECO', 200),
    ('P1A',   'P1A - Parit Gunung A',                  '223.25.98.220',   4100, 'PG1A',  NULL, 'ZKTECO', 100),
    ('P1B',   'P1B - Parit Gunung B',                  '223.25.98.220',   4300, 'PG1B',  NULL, 'ZKTECO', 300),
    ('P2A',   'P2A - Parit Gunung A Luar',             '223.25.98.220',   4500, 'PG2A',  NULL, 'ZKTECO', 500),
    ('P2B',   'P2B - Parit Gunung B Luar',             '223.25.98.220',   4600, 'PG2B',  NULL, 'ZKTECO', 600);

-- ============================================================
-- 3. mst_employee — Master Karyawan
-- ============================================================
CREATE TABLE mst_employee (
    employee_id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) UNIQUE NOT NULL,
    emp_name NVARCHAR(100),
    home_division_id INT,
    machine_user_id INT NULL,
    machine_id INT NULL,
    is_active BIT DEFAULT 1,
    needs_review BIT DEFAULT 0,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_employee_division
        FOREIGN KEY (home_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_employee_machine
        FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id)
);

-- ============================================================
-- 4. attendance_work_config — Konfigurasi Jam Kerja
-- ============================================================
CREATE TABLE attendance_work_config (
    config_id INT IDENTITY(1,1) PRIMARY KEY,
    day_of_week INT NOT NULL,
    standard_hours DECIMAL(4,2) NOT NULL,
    description NVARCHAR(100),
    is_active BIT DEFAULT 1,
    updated_at DATETIME DEFAULT GETDATE()
);

-- Seed attendance_work_config
INSERT INTO attendance_work_config (day_of_week, standard_hours, description) VALUES
    (0, 0.00, 'Minggu — Libur'),
    (1, 7.00, 'Senin — 7 jam'),
    (2, 7.00, 'Selasa — 7 jam'),
    (3, 7.00, 'Rabu — 7 jam'),
    (4, 7.00, 'Kamis — 7 jam'),
    (5, 5.00, 'Jumat — 5 jam'),
    (6, 0.00, 'Sabtu — Libur');

-- ============================================================
-- 5. attendance_holiday — Hari Libur
-- ============================================================
CREATE TABLE attendance_holiday (
    holiday_id INT IDENTITY(1,1) PRIMARY KEY,
    holiday_date DATE UNIQUE NOT NULL,
    holiday_name NVARCHAR(100) NOT NULL,
    is_national BIT DEFAULT 0,
    division_id INT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_holiday_division
        FOREIGN KEY (division_id) REFERENCES mst_division(division_id)
);

-- ============================================================
-- 6. attendance_scan_log — Semua Raw Scan Events
-- ============================================================
CREATE TABLE attendance_scan_log (
    scan_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    work_date DATE NOT NULL,
    scan_time DATETIME NOT NULL,
    machine_id INT NULL,
    scan_division_id INT NULL,
    raw_source NVARCHAR(20) DEFAULT 'ZKTECO',
    raw_device_user_id INT NULL,
    raw_device_sn NVARCHAR(100) NULL,
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_scan_machine
        FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_scan_division
        FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id)
);

CREATE INDEX IX_scan_log_emp_date ON attendance_scan_log(emp_code, work_date);
CREATE INDEX IX_scan_log_date ON attendance_scan_log(work_date);
CREATE INDEX IX_scan_log_machine ON attendance_scan_log(machine_id);

-- ============================================================
-- 7. employee_attendance_daily — 1 Baris per Karyawan per Hari
-- ============================================================
CREATE TABLE employee_attendance_daily (
    daily_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NOT NULL,
    emp_code NVARCHAR(50) NOT NULL,
    work_date DATE NOT NULL,
    first_scan_time DATETIME NULL,
    last_scan_time DATETIME NULL,
    scan_count INT DEFAULT 0,
    scan_machines NVARCHAR(500) NULL,
    work_duration_minutes INT NULL,
    estimated_duration_minutes INT NULL,
    is_duration_estimated BIT DEFAULT 0,
    overtime_minutes INT DEFAULT 0,
    is_overtime BIT DEFAULT 0,
    home_division_id INT NULL,
    final_division_id INT NOT NULL,
    scan_division_id INT NULL,
    is_cross_division_scan BIT DEFAULT 0,
    cross_division_note NVARCHAR(500) NULL,
    attendance_status NVARCHAR(20) NOT NULL,
    note NVARCHAR(500) NULL,
    source NVARCHAR(20) DEFAULT 'MACHINE',
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_daily_employee
        FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_daily_final_division
        FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_daily_home_division
        FOREIGN KEY (home_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_daily_scan_division
        FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id)
);

CREATE INDEX IX_daily_work_date ON employee_attendance_daily(work_date);
CREATE INDEX IX_daily_final_division ON employee_attendance_daily(final_division_id, work_date);
CREATE INDEX IX_daily_emp ON employee_attendance_daily(emp_code, work_date);
CREATE UNIQUE INDEX IX_daily_emp_date ON employee_attendance_daily(emp_code, work_date);

-- ============================================================
-- 8. attendance_sorting_result — Hasil Sortir Divisi
-- ============================================================
CREATE TABLE attendance_sorting_result (
    sorting_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    daily_id BIGINT NOT NULL,
    employee_id INT NOT NULL,
    emp_code NVARCHAR(50) NOT NULL,
    work_date DATE NOT NULL,
    machine_id INT NULL,
    scan_division_id INT NULL,
    home_division_id INT NULL,
    final_division_id INT NOT NULL,
    sorting_status NVARCHAR(50) NOT NULL,
    sorting_rule NVARCHAR(100) NOT NULL,
    is_cross_division_scan BIT DEFAULT 0,
    need_review BIT DEFAULT 0,
    note NVARCHAR(500) NULL,
    sorted_by NVARCHAR(100) DEFAULT 'SYSTEM',
    sorted_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_sorting_daily
        FOREIGN KEY (daily_id) REFERENCES employee_attendance_daily(daily_id),
    CONSTRAINT FK_sorting_employee
        FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_sorting_machine
        FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_sorting_scan_div
        FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_sorting_home_div
        FOREIGN KEY (home_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_sorting_final_div
        FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id)
);

CREATE INDEX IX_sorting_emp_date ON attendance_sorting_result(emp_code, work_date);
CREATE INDEX IX_sorting_final ON attendance_sorting_result(final_division_id, work_date);
CREATE UNIQUE INDEX IX_sorting_emp_date_unique ON attendance_sorting_result(emp_code, work_date);

-- ============================================================
-- 9. attendance_manual_input — Input Manual
-- ============================================================
CREATE TABLE attendance_manual_input (
    input_id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    work_date DATE NOT NULL,
    attendance_type NVARCHAR(20) NOT NULL,
    start_time DATETIME NULL,
    end_time DATETIME NULL,
    duration_minutes INT NULL,
    note NVARCHAR(500) NULL,
    approved_by NVARCHAR(100),
    created_by NVARCHAR(100),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    is_active BIT DEFAULT 1,
    CONSTRAINT FK_manual_emp
        FOREIGN KEY (emp_code) REFERENCES mst_employee(emp_code)
);

CREATE INDEX IX_manual_emp_date ON attendance_manual_input(emp_code, work_date);
CREATE UNIQUE INDEX IX_manual_emp_date_type ON attendance_manual_input(emp_code, work_date, attendance_type);