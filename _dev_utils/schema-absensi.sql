-- Schema: absen_import
-- Data dari mesin absensi (IMUTABLE - tidak bisa di-edit)
CREATE TABLE absen_import (
    id INT IDENTITY(1,1) PRIMARY KEY,
    machine_user_id INT,              -- ID asli dari mesin
    emp_code NVARCHAR(50) NOT NULL,   -- Kode employee (A0001)
    division NVARCHAR(50) NOT NULL,   -- Divisi (P1A, DME, etc)
    tanggal DATE NOT NULL,             -- Tanggal absensi
    jam_masuk TIME,                    -- Jam masuk (bisa NULL)
    jam_keluar TIME,                   -- Jam keluar (bisa NULL)
    record_type INT DEFAULT 0,        -- 0=masuk, 1=pulang
    device_sn NVARCHAR(100),           -- Serial number mesin
    attendance_date DATETIME,          -- Timestamp lengkap
    has_work BIT DEFAULT 0,           -- Apakah bekerja
    is_sunday BIT DEFAULT 0,           -- Apakah minggu
    is_holiday BIT DEFAULT 0,          -- Apakah hari libur
    is_cuti BIT DEFAULT 0,            -- Apakah cuti
    is_sakit BIT DEFAULT 0,           -- Apakah sakit
    ot_hours DECIMAL(5,2) DEFAULT 0,  -- Jam lembur
    task_code NVARCHAR(50),           -- Kode tugas
    import_batch_id NVARCHAR(100),    -- ID batch import
    imported_at DATETIME DEFAULT GETDATE(),
    source NVARCHAR(50) DEFAULT 'MACHINE',
    is_locked BIT DEFAULT 1,
    UNIQUE (emp_code, division, tanggal, record_type, import_batch_id)
);

-- Schema: absen_machine_input
-- Data input manual (BISA di-edit)
CREATE TABLE absen_machine_input (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    division NVARCHAR(50) NOT NULL,
    tanggal DATE NOT NULL,
    jam_masuk TIME,
    jam_keluar TIME,
    record_type INT DEFAULT 0,
    has_work BIT DEFAULT 0,
    is_sunday BIT DEFAULT 0,
    is_holiday BIT DEFAULT 0,
    is_cuti BIT DEFAULT 0,
    is_sakit BIT DEFAULT 0,
    ot_hours DECIMAL(5,2) DEFAULT 0,
    task_code NVARCHAR(50),
    input_type NVARCHAR(20) DEFAULT 'MANUAL',
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    created_by NVARCHAR(100),
    notes NVARCHAR(500),
    UNIQUE (emp_code, division, tanggal, record_type)
);

-- Schema: absen_change_log
-- Log perubahan untuk tracking
CREATE TABLE absen_change_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    division NVARCHAR(50) NOT NULL,
    tanggal DATE NOT NULL,
    field_name NVARCHAR(50),
    old_value NVARCHAR(MAX),
    new_value NVARCHAR(MAX),
    change_type NVARCHAR(20) NOT NULL,
    source_table NVARCHAR(50),
    changed_by NVARCHAR(100),
    changed_at DATETIME DEFAULT GETDATE()
);

-- Schema: absen_import_batch
-- Tracking batch import
CREATE TABLE absen_import_batch (
    id INT IDENTITY(1,1) PRIMARY KEY,
    batch_id NVARCHAR(100) UNIQUE NOT NULL,
    division NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    total_records INT DEFAULT 0,
    imported_records INT DEFAULT 0,
    status NVARCHAR(50) DEFAULT 'PENDING',
    import_started_at DATETIME DEFAULT GETDATE(),
    import_completed_at DATETIME,
    error_message NVARCHAR(MAX),
    imported_by NVARCHAR(100) DEFAULT 'SYSTEM'
);

-- Schema: absen_config
-- Konfigurasi sistem
CREATE TABLE absen_config (
    id INT IDENTITY(1,1) PRIMARY KEY,
    config_key NVARCHAR(100) UNIQUE NOT NULL,
    config_value NVARCHAR(MAX),
    description NVARCHAR(500),
    updated_at DATETIME DEFAULT GETDATE()
);

PRINT 'All tables created successfully!';
