-- ============================================================
-- MIGRATION V2: Employee Attendance System
-- Database: extend_db_ptrj | Server: SERVER_PROFILE_1
-- Created: 2026-05-30
-- ============================================================

PRINT '=== MIGRATION V2: Employee Attendance System ===';
PRINT '';

-- ============================================================
-- 1. mst_division — Master Divisi
-- ============================================================
PRINT 'Creating mst_division...';
CREATE TABLE mst_division (
    division_id INT IDENTITY(1,1) PRIMARY KEY,
    division_code NVARCHAR(20) NOT NULL UNIQUE,
    division_name NVARCHAR(100) NOT NULL,
    loc_code NVARCHAR(5) NULL,
    emp_code_prefix NVARCHAR(5) NULL,
    scanner_code INT NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

CREATE INDEX IX_mst_division_code ON mst_division(division_code);
CREATE INDEX IX_mst_division_loc_code ON mst_division(loc_code);

-- Insert 15 divisi
INSERT INTO mst_division (division_code, division_name, loc_code, emp_code_prefix, scanner_code) VALUES
    ('PG1A', 'Kebun Planta Utama A', 'A', 'A', 100),
    ('PG1B', 'Kebun Planta Utama B', 'B', 'B', 300),
    ('PG2A', 'Kebun Planta Utama A 2', 'C', 'C', 500),
    ('PG2B', 'Kebun Planta Utama B 2', 'D', 'D', 600),
    ('DME',  'Divisi Maintenance Engineering', 'E', 'E', 700),
    ('ARA',  'Afdeling Rumbai', 'F', 'F', 800),
    ('ARB1', 'Afdeling Rumbai 1', 'G', 'G', 900),
    ('ARB2', 'Afdeling Rumbai 2', 'H', 'H', 400),
    ('AREC', 'Area Control', 'J', 'J', 200),
    ('IJL',  'Inti Jaya Lestari', 'L', 'L', NULL),
    ('PGE',  'Pabrik kelapa Sawit', 'PGE', 'A', NULL),
    ('MILL', 'Mill / Pabrik', 'MILL', 'M', NULL),
    ('INFRA','Infrastruktur', NULL, NULL, NULL),
    ('STF',  'Staff / Kantor', NULL, NULL, NULL),
    ('SEC',  'Security', NULL, NULL, NULL);

PRINT '  -> mst_division: OK (15 divisions)';

-- ============================================================
-- 2. mst_machine — Master Mesin Absensi
-- ============================================================
PRINT 'Creating mst_machine...';
CREATE TABLE mst_machine (
    machine_id INT IDENTITY(1,1) PRIMARY KEY,
    machine_code NVARCHAR(30) NOT NULL UNIQUE,
    machine_name NVARCHAR(100) NOT NULL,
    ip_address NVARCHAR(50),
    port INT DEFAULT 4370,
    scanner_code INT NULL,
    loc_code NVARCHAR(5) NULL,
    division_id INT NULL,
    machine_type NVARCHAR(20) DEFAULT 'ZKTECO',
    is_online BIT DEFAULT 1,
    last_seen_at DATETIME NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_machine_division FOREIGN KEY (division_id)
        REFERENCES mst_division(division_id)
);

CREATE INDEX IX_mst_machine_code ON mst_machine(machine_code);
CREATE INDEX IX_mst_machine_division ON mst_machine(division_id);
CREATE INDEX IX_mst_machine_scanner ON mst_machine(scanner_code);

-- Insert 15 mesin
INSERT INTO mst_machine (machine_code, machine_name, ip_address, port, scanner_code, loc_code, division_id, machine_type) VALUES
    ('PGE',    'Mesin PGE / PKS',            '10.0.0.232',     4370, NULL,  'PGE',  (SELECT division_id FROM mst_division WHERE division_code='PGE'),  'ZKTECO'),
    ('MILL',   'Mesin Mill',                '103.127.66.32',  4370, NULL,  'MILL', (SELECT division_id FROM mst_division WHERE division_code='MILL'), 'ZKTECO'),
    ('DME_01', 'Mesin DME #1',              '103.144.228.42', 4700, 700,   'E',    (SELECT division_id FROM mst_division WHERE division_code='DME'), 'ZKTECO'),
    ('DME_02', 'Mesin DME #2',              '103.144.228.42', 4701, 700,   'E',    (SELECT division_id FROM mst_division WHERE division_code='DME'), 'ZKTECO'),
    ('ARE',    'Mesin ARE',                 '103.144.208.154',4370, NULL,  'ARE',  (SELECT division_id FROM mst_division WHERE division_code='PGE'), 'ZKTECO'),
    ('IJL',    'Mesin IJL',                 '103.144.211.226',4370, NULL,  'L',    (SELECT division_id FROM mst_division WHERE division_code='IJL'), 'ZKTECO'),
    ('ARA',    'Mesin ARA',                 '103.144.208.154',4800, 800,   'F',    (SELECT division_id FROM mst_division WHERE division_code='ARA'),'ZKTECO'),
    ('AB1',    'Mesin AB1',                 '103.144.208.154',4900, 900,   'G',    (SELECT division_id FROM mst_division WHERE division_code='ARB1'),'ZKTECO'),
    ('AB2',    'Mesin AB2',                 '103.144.208.154',4400, 400,   'H',    (SELECT division_id FROM mst_division WHERE division_code='ARB2'),'ZKTECO'),
    ('ARC_01', 'Mesin ARC #1',              '103.144.208.154',4200, 200,   'J',    (SELECT division_id FROM mst_division WHERE division_code='AREC'),'ZKTECO'),
    ('ARC_02', 'Mesin ARC #2',              '103.144.208.154',4201, 200,   'J',    (SELECT division_id FROM mst_division WHERE division_code='AREC'),'ZKTECO'),
    ('P1A',    'Mesin P1A (via API)',        '223.25.98.220',  4100, 100,   'A',    (SELECT division_id FROM mst_division WHERE division_code='PG1A'), 'ZKTECO'),
    ('P1B',    'Mesin P1B (via API)',        '223.25.98.220',  4300, 300,   'B',    (SELECT division_id FROM mst_division WHERE division_code='PG1B'), 'ZKTECO'),
    ('P2A',    'Mesin P2A (via API)',        '223.25.98.220',  4500, 500,   'C',    (SELECT division_id FROM mst_division WHERE division_code='PG2A'), 'ZKTECO'),
    ('P2B',    'Mesin P2B (via API)',        '223.25.98.220',  4600, 600,   'D',    (SELECT division_id FROM mst_division WHERE division_code='PG2B'), 'ZKTECO');

PRINT '  -> mst_machine: OK (15 machines)';

-- ============================================================
-- 3. mst_employee — Master Karyawan
-- ============================================================
PRINT 'Creating mst_employee...';
CREATE TABLE mst_employee (
    employee_id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL UNIQUE,
    emp_name NVARCHAR(255) NOT NULL,
    division_id INT NULL,
    home_division_id INT NULL,  -- divisi asli / hasil sortir final
    gang_code NVARCHAR(50) NULL,
    machine_user_id INT NULL,  -- deviceUserId dari mesin
    machine_id INT NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_employee_division FOREIGN KEY (division_id)
        REFERENCES mst_division(division_id),
    CONSTRAINT FK_employee_home_division FOREIGN KEY (home_division_id)
        REFERENCES mst_division(division_id)
);

CREATE INDEX IX_mst_employee_code ON mst_employee(emp_code);
CREATE INDEX IX_mst_employee_division ON mst_employee(division_id);
CREATE INDEX IX_mst_employee_home_div ON mst_employee(home_division_id);
CREATE INDEX IX_mst_employee_machine_uid ON mst_employee(machine_user_id);
CREATE INDEX IX_mst_employee_gang ON mst_employee(gang_code);

PRINT '  -> mst_employee: OK';

-- ============================================================
-- 4. attendance_scan_log — Semua raw scan events
-- ============================================================
PRINT 'Creating attendance_scan_log...';
CREATE TABLE attendance_scan_log (
    scan_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NULL,
    emp_code NVARCHAR(50) NOT NULL,
    work_date DATE NOT NULL,
    scan_time DATETIME NOT NULL,

    machine_id INT NULL,
    scan_division_id INT NULL,  -- divisi berdasarkan mesin scan

    raw_device_user_id INT NULL,
    source NVARCHAR(20) DEFAULT 'MACHINE',  -- MACHINE / API / MANUAL

    imported_at DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_scanlog_employee FOREIGN KEY (employee_id)
        REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_scanlog_machine FOREIGN KEY (machine_id)
        REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_scanlog_scan_div FOREIGN KEY (scan_division_id)
        REFERENCES mst_division(division_id)
);

CREATE INDEX IX_scanlog_emp_date ON attendance_scan_log(emp_code, work_date);
CREATE INDEX IX_scanlog_employee ON attendance_scan_log(employee_id);
CREATE INDEX IX_scanlog_date ON attendance_scan_log(work_date);
CREATE INDEX IX_scanlog_machine ON attendance_scan_log(machine_id);

PRINT '  -> attendance_scan_log: OK';

-- ============================================================
-- 5. employee_attendance_daily — 1 baris per karyawan per hari (FINAL)
-- ============================================================
PRINT 'Creating employee_attendance_daily...';
CREATE TABLE employee_attendance_daily (
    daily_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NOT NULL,
    emp_code NVARCHAR(50) NOT NULL,
    work_date DATE NOT NULL,

    -- Scan info (agregasi)
    scan_count INT DEFAULT 0,
    first_scan_time DATETIME NULL,
    last_scan_time DATETIME NULL,

    -- Durasi kerja
    work_duration_minutes INT NULL,     -- dari last - first scan
    standard_minutes INT NULL,          -- dari attendance_work_config
    overtime_minutes INT DEFAULT 0,
    is_estimated_duration BIT DEFAULT 0,

    -- Status
    attendance_status NVARCHAR(30) DEFAULT 'ABSENT',  -- PRESENT / ABSENT / SINGLE_SCAN
    status_note NVARCHAR(500) NULL,

    -- Division
    scan_division_id INT NULL,
    home_division_id INT NULL,
    final_division_id INT NULL,
    is_cross_division_scan BIT DEFAULT 0,

    -- Timestamps
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_daily_employee FOREIGN KEY (employee_id)
        REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_daily_scan_div FOREIGN KEY (scan_division_id)
        REFERENCES mst_division(division_id),
    CONSTRAINT FK_daily_home_div FOREIGN KEY (home_division_id)
        REFERENCES mst_division(division_id),
    CONSTRAINT FK_daily_final_div FOREIGN KEY (final_division_id)
        REFERENCES mst_division(division_id),
    CONSTRAINT UQ_daily_employee_date UNIQUE (employee_id, work_date)
);

CREATE INDEX IX_daily_emp_date ON employee_attendance_daily(emp_code, work_date);
CREATE INDEX IX_daily_employee ON employee_attendance_daily(employee_id);
CREATE INDEX IX_daily_date ON employee_attendance_daily(work_date);
CREATE INDEX IX_daily_final_div ON employee_attendance_daily(final_division_id);
CREATE INDEX IX_daily_status ON employee_attendance_daily(attendance_status);

PRINT '  -> employee_attendance_daily: OK';

-- ============================================================
-- 6. attendance_sorting_result — Hasil sortir divisi
-- ============================================================
PRINT 'Creating attendance_sorting_result...';
CREATE TABLE attendance_sorting_result (
    sorting_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    daily_id BIGINT NOT NULL,

    scan_division_id INT NULL,
    home_division_id INT NULL,
    final_division_id INT NOT NULL,

    sorting_status NVARCHAR(50) NOT NULL,
    sorting_rule NVARCHAR(100) NULL,

    is_cross_division_scan BIT DEFAULT 0,
    need_review BIT DEFAULT 0,

    note NVARCHAR(500) NULL,
    sorted_by NVARCHAR(100) DEFAULT 'SYSTEM',
    sorted_at DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_sort_daily FOREIGN KEY (daily_id)
        REFERENCES employee_attendance_daily(daily_id),
    CONSTRAINT FK_sort_scan_div FOREIGN KEY (scan_division_id)
        REFERENCES mst_division(division_id),
    CONSTRAINT FK_sort_home_div FOREIGN KEY (home_division_id)
        REFERENCES mst_division(division_id),
    CONSTRAINT FK_sort_final_div FOREIGN KEY (final_division_id)
        REFERENCES mst_division(division_id),
    CONSTRAINT UQ_sort_daily UNIQUE (daily_id)
);

CREATE INDEX IX_sort_daily ON attendance_sorting_result(daily_id);
CREATE INDEX IX_sort_status ON attendance_sorting_result(sorting_status);
CREATE INDEX IX_sort_final_div ON attendance_sorting_result(final_division_id);
CREATE INDEX IX_sort_cross ON attendance_sorting_result(is_cross_division_scan);
CREATE INDEX IX_sort_review ON attendance_sorting_result(need_review);

PRINT '  -> attendance_sorting_result: OK';

-- ============================================================
-- 7. attendance_manual_input — Input manual absensi
-- ============================================================
PRINT 'Creating attendance_manual_input...';
CREATE TABLE attendance_manual_input (
    input_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NULL,
    emp_code NVARCHAR(50) NOT NULL,
    work_date DATE NOT NULL,

    attendance_type NVARCHAR(30) NOT NULL,  -- SICK / PERMIT / ASSIGNMENT / HOLIDAY / OTHER

    -- Waktu input
    input_time DATETIME NULL,  -- jam absen manual
    input_duration_minutes INT NULL,

    -- Override division (optional)
    division_id INT NULL,

    note NVARCHAR(500) NULL,

    is_approved BIT DEFAULT 0,
    approved_by NVARCHAR(100) NULL,
    approved_at DATETIME NULL,

    created_by NVARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_manual_employee FOREIGN KEY (employee_id)
        REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_manual_division FOREIGN KEY (division_id)
        REFERENCES mst_division(division_id)
);

CREATE INDEX IX_manual_emp_date ON attendance_manual_input(emp_code, work_date);
CREATE INDEX IX_manual_date ON attendance_manual_input(work_date);
CREATE INDEX IX_manual_type ON attendance_manual_input(attendance_type);
CREATE INDEX IX_manual_approved ON attendance_manual_input(is_approved);

PRINT '  -> attendance_manual_input: OK';

-- ============================================================
-- 8. attendance_work_config — Konfigurasi jam kerja
-- ============================================================
PRINT 'Creating attendance_work_config...';
CREATE TABLE attendance_work_config (
    config_id INT IDENTITY(1,1) PRIMARY KEY,
    day_of_week INT NOT NULL,  -- 0=Minggu, 1=Senin ... 6=Sabtu
    day_name NVARCHAR(20) NOT NULL,
    standard_minutes INT NOT NULL,   -- 420 = 7 jam, 300 = 5 jam
    is_workday BIT DEFAULT 1,
    note NVARCHAR(255) NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT UQ_config_day UNIQUE (day_of_week)
);

CREATE INDEX IX_config_day ON attendance_work_config(day_of_week);
CREATE INDEX IX_config_workday ON attendance_work_config(is_workday);

-- Insert konfigurasi standar
INSERT INTO attendance_work_config (day_of_week, day_name, standard_minutes, is_workday, note) VALUES
    (0, 'Minggu',     0,   0, 'Hari Minggu — Libur'),
    (1, 'Senin',     420,  1, 'Senin — 7 jam kerja'),
    (2, 'Selasa',    420,  1, 'Selasa — 7 jam kerja'),
    (3, 'Rabu',      420,  1, 'Rabu — 7 jam kerja'),
    (4, 'Kamis',     420,  1, 'Kamis — 7 jam kerja'),
    (5, 'Jumat',     300,  1, 'Jumat — 5 jam kerja'),
    (6, 'Sabtu',     420,  1, 'Sabtu — 7 jam kerja');

PRINT '  -> attendance_work_config: OK (7 hari)';

-- ============================================================
-- 9. attendance_sorting_status — Reference table
-- ============================================================
PRINT 'Creating attendance_sorting_status (ref)...';
CREATE TABLE attendance_sorting_status (
    status_code NVARCHAR(50) PRIMARY KEY,
    status_name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500) NULL,
    is_active BIT DEFAULT 1
);

INSERT INTO attendance_sorting_status (status_code, status_name, description) VALUES
    ('MATCH_HOME_DIVISION',   'Match — Scan di divisi sendiri',     'Karyawan scan di home division-nya'),
    ('CROSS_DIVISION_MOVED',  'Lintas Divisi — Dipindahkan',        'Scan di luar divisi, dipindah ke home division'),
    ('NO_HOME_DIVISION',      'Tanpa Home Divisi',                  'Karyawan belum punya home division di master'),
    ('UNMAPPED_EMPLOYEE',     'Tidak Teremap',                      'deviceUserId belum bisa dipetakan ke emp_code'),
    ('NEED_MANUAL_REVIEW',    'Butuh Review Manual',                'Sistem ragu, perlu dicek admin'),
    ('MANUAL_OVERRIDE',       'Override Manual',                    'Admin ubah manual hasil sortir');

PRINT '  -> attendance_sorting_status: OK';

-- ============================================================
-- 10. attendance_attendance_type — Reference table
-- ============================================================
PRINT 'Creating attendance_attendance_type (ref)...';
CREATE TABLE attendance_attendance_type (
    type_code NVARCHAR(30) PRIMARY KEY,
    type_name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500) NULL,
    is_active BIT DEFAULT 1
);

INSERT INTO attendance_attendance_type (type_code, type_name, description) VALUES
    ('SICK',       'Sakit',       'Karyawan sakit'),
    ('PERMIT',     'Izin',        'Karyawan izin (keluarga, dll)'),
    ('ASSIGNMENT', 'Tugas Luar',  'Karyawan tugas di luar lokasi'),
    ('HOLIDAY',    'Cuti / Libur','Karyawan cuti atau libur'),
    ('OTHER',      'Lainnya',     'Alasan lain');

PRINT '  -> attendance_attendance_type: OK';

-- ============================================================
-- DONE
-- ============================================================
PRINT '';
PRINT '========================================';
PRINT 'MIGRATION V2 COMPLETE!';
PRINT '========================================';
PRINT '';
PRINT 'Tables created:';
PRINT '  1. mst_division              (15 divisi)';
PRINT '  2. mst_machine               (15 mesin)';
PRINT '  3. mst_employee              (master karyawan)';
PRINT '  4. attendance_scan_log        (N scan events per hari)';
PRINT '  5. employee_attendance_daily  (1 baris per karyawan per hari)';
PRINT '  6. attendance_sorting_result  (hasil sortir divisi)';
PRINT '  7. attendance_manual_input   (input manual sakit/izin/tugas)';
PRINT '  8. attendance_work_config    (7 jam / 5 jam / lembur)';
PRINT '  9. attendance_sorting_status  (reference)';
PRINT ' 10. attendance_attendance_type (reference)';
PRINT '';
PRINT 'Next step: Import data karyawan dari export JSON mesin';
PRINT 'Script: _dev_utils/src/import-employee-master.ts';