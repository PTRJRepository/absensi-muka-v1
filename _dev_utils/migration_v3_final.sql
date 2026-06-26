-- ============================================================
-- ATTENDANCE SYSTEM MIGRATION v3 FINAL
-- Target: extend_db_ptrj (via HTTP Gateway)
-- Each statement is independent — no GO, no PRINT
-- ============================================================

-- 1. mst_division
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

-- 2. Seed mst_division
INSERT INTO mst_division (division_code, division_name, loc_code, emp_code_prefix) VALUES
    ('PG1A', 'Parit Gunung Estate A',       'A', 'A'),
    ('PG1B', 'Parit Gunung Estate B',       'B', 'B'),
    ('PG2A', 'Parit Gunung Estate A (Luar)', 'C', 'C'),
    ('PG2B', 'Parit Gunung Estate B (Luar)', 'D', 'D'),
    ('DME',  'Darul Makmur Estate',         'E', 'E'),
    ('ARA',  'Aik Ruak Estate',             'F', 'F'),
    ('ARB1', 'Aik Ruak B1 Estate',          'G', 'G'),
    ('ARB2', 'Aik Ruak B2 Estate',          'H', 'H'),
    ('AREC', 'Aik Ruak Estate Center',      'J', 'J'),
    ('IJL',  'Impian Jaya Lestari',         'L', 'L'),
    ('INFRA','Infrastruktur',               'I', 'I'),
    ('STF',  'Staff / Kantor',              'S', 'S'),
    ('SEC',  'Security',                    'K', 'K'),
    ('MGM',  'Management',                  'M', 'M');

-- 3. mst_machine
CREATE TABLE mst_machine (
    machine_id INT IDENTITY(1,1) PRIMARY KEY,
    machine_code NVARCHAR(20) UNIQUE NOT NULL,
    machine_name NVARCHAR(100) NOT NULL,
    ip_address NVARCHAR(50),
    port INT DEFAULT 4370,
    location NVARCHAR(100),
    division_id INT,
    machine_type NVARCHAR(20) DEFAULT 'ZKTECO',
    is_active BIT DEFAULT 1,
    last_online_at DATETIME,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- 4. Seed mst_machine
INSERT INTO mst_machine (machine_code, machine_name, ip_address, port, location, division_id, machine_type) VALUES
    ('PGE',   'PGE - Parit Gunung Estate',              '10.0.0.232',      4370, 'PGE',   NULL, 'ZKTECO'),
    ('MILL',  'MILL - Mill',                           '103.127.66.32',   4370, 'MILL',  NULL, 'ZKTECO'),
    ('DME_01','DME_01 - Darul Makmur Estate 1',       '103.144.228.42',  4700, 'DME',   NULL, 'ZKTECO'),
    ('DME_02','DME_02 - Darul Makmur Estate 2',       '103.144.228.42',  4701, 'DME',   NULL, 'ZKTECO'),
    ('ARE',   'ARE - Aik Ruak Estate',                 '103.144.208.154', 4370, 'ARA',   NULL, 'ZKTECO'),
    ('IJL',   'IJL - Impian Jaya Lestari',             '103.144.211.226', 4370, 'IJL',   NULL, 'ZKTECO'),
    ('ARA',   'ARA - Aik Ruak Estate Main',            '103.144.208.154', 4800, 'ARA',   NULL, 'ZKTECO'),
    ('ARB2',  'ARB2 - Aik Ruak B2',                    '103.144.208.154', 4900, 'ARB2',  NULL, 'ZKTECO');

-- 5. mst_employee
CREATE TABLE mst_employee (
    employee_id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) UNIQUE NOT NULL,
    emp_name NVARCHAR(100),
    home_division_id INT,
    machine_user_id INT NULL,
    machine_id INT NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- 6. mst_employee_family
CREATE TABLE mst_employee_family (
    family_id INT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NOT NULL,
    family_name NVARCHAR(100) NOT NULL,
    relationship NVARCHAR(20),
    id_number NVARCHAR(50),
    phone NVARCHAR(20),
    is_dependent BIT DEFAULT 0,
    created_at DATETIME DEFAULT GETDATE()
);

-- 7. attendance_holiday
CREATE TABLE attendance_holiday (
    holiday_id INT IDENTITY(1,1) PRIMARY KEY,
    holiday_date DATE UNIQUE NOT NULL,
    holiday_name NVARCHAR(100) NOT NULL,
    is_national BIT DEFAULT 0,
    division_id INT NULL,
    created_at DATETIME DEFAULT GETDATE()
);

-- 8. attendance_work_config
CREATE TABLE attendance_work_config (
    config_id INT IDENTITY(1,1) PRIMARY KEY,
    day_of_week INT NOT NULL,
    standard_hours DECIMAL(4,2) NOT NULL,
    description NVARCHAR(100),
    is_active BIT DEFAULT 1,
    updated_at DATETIME DEFAULT GETDATE()
);

-- 9. Seed attendance_work_config
INSERT INTO attendance_work_config (day_of_week, standard_hours, description) VALUES
    (0, 0,    'Sunday — Libur'),
    (1, 7.00, 'Monday — 7 jam'),
    (2, 7.00, 'Tuesday — 7 jam'),
    (3, 7.00, 'Wednesday — 7 jam'),
    (4, 7.00, 'Thursday — 7 jam'),
    (5, 5.00, 'Friday — 5 jam'),
    (6, 0,    'Saturday — Libur');

-- 10. attendance_scan_log
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
    created_at DATETIME DEFAULT GETDATE()
);

-- 11. Index attendance_scan_log
CREATE INDEX IX_scan_log_emp_date ON attendance_scan_log(emp_code, work_date);

-- 12. Index attendance_scan_log date
CREATE INDEX IX_scan_log_date ON attendance_scan_log(work_date);

-- 13. employee_attendance_daily
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
    updated_at DATETIME DEFAULT GETDATE()
);

-- 14. Index employee_attendance_daily work_date
CREATE INDEX IX_daily_work_date ON employee_attendance_daily(work_date);

-- 15. Index employee_attendance_daily final_division
CREATE INDEX IX_daily_final_division ON employee_attendance_daily(final_division_id, work_date);

-- 16. attendance_sorting_result
CREATE TABLE attendance_sorting_result (
    sorting_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    process_id BIGINT NOT NULL,
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
    sorted_at DATETIME DEFAULT GETDATE()
);

-- 17. attendance_manual_input
CREATE TABLE attendance_manual_input (
    input_id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    work_date DATE NOT NULL,
    attendance_type NVARCHAR(20) NOT NULL,
    start_time DATETIME NULL,
    end_time DATETIME NULL,
    note NVARCHAR(500) NULL,
    approved_by NVARCHAR(100),
    created_by NVARCHAR(100),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    is_active BIT DEFAULT 1
);

PRINT 'ALL TABLES CREATED SUCCESSFULLY';