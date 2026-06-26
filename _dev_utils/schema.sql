-- Schema untuk tabel-tabel absensi (extend_db_ptrj)
-- Aturan:
-- 1. absen_import: Data mentah dari mesin/API (IMUTABLE)
-- 2. absen_machine_input: Data input/edit manual (MUTABLE)
-- 3. absen_import_batch: Tracking log setiap kali import dilakukan

-- 1. Tabel Tracking Batch Import
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

-- 2. Tabel Data Import (Dari Mesin/API - Immutable)
CREATE TABLE absen_import (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    emp_name NVARCHAR(255),
    gang_code NVARCHAR(50),
    division NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    day INT NOT NULL,
    has_work BIT DEFAULT 0,
    is_sunday BIT DEFAULT 0,
    is_holiday BIT DEFAULT 0,
    holiday_desc NVARCHAR(255),
    is_cuti BIT DEFAULT 0,
    is_sakit BIT DEFAULT 0,
    task_code NVARCHAR(50),
    ot_hours DECIMAL(5,2) DEFAULT 0,
    attendance_date DATE NOT NULL,
    import_batch_id NVARCHAR(100),
    imported_at DATETIME DEFAULT GETDATE(),
    source NVARCHAR(50) DEFAULT 'MACHINE',
    is_locked BIT DEFAULT 1,
    UNIQUE (emp_code, division, year, month, day, import_batch_id)
);

-- 3. Tabel Data Input Manual (Mutable - Bisa di-edit)
CREATE TABLE absen_machine_input (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    emp_name NVARCHAR(255),
    gang_code NVARCHAR(50),
    division NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    day INT NOT NULL,
    has_work BIT DEFAULT 0,
    is_sunday BIT DEFAULT 0,
    is_holiday BIT DEFAULT 0,
    holiday_desc NVARCHAR(255),
    is_cuti BIT DEFAULT 0,
    is_sakit BIT DEFAULT 0,
    task_code NVARCHAR(50),
    ot_hours DECIMAL(5,2) DEFAULT 0,
    attendance_date DATE NOT NULL,
    input_type NVARCHAR(20) DEFAULT 'MANUAL',
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    created_by NVARCHAR(100),
    notes NVARCHAR(500),
    UNIQUE (emp_code, division, year, month, day)
);

-- 4. Tabel Log Perubahan
CREATE TABLE absen_change_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL,
    division NVARCHAR(50) NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    day INT NOT NULL,
    field_name NVARCHAR(50),
    old_value NVARCHAR(MAX),
    new_value NVARCHAR(MAX),
    change_type NVARCHAR(20) NOT NULL,
    source_table NVARCHAR(50),
    changed_by NVARCHAR(100),
    changed_at DATETIME DEFAULT GETDATE()
);

-- 5. Tabel Konfigurasi
CREATE TABLE absen_config (
    id INT IDENTITY(1,1) PRIMARY KEY,
    config_key NVARCHAR(100) UNIQUE NOT NULL,
    config_value NVARCHAR(MAX),
    description NVARCHAR(500),
    updated_at DATETIME DEFAULT GETDATE()
);

-- 6. Tabel Sync Log
CREATE TABLE absen_sync_log (
    id INT IDENTITY(1,1) PRIMARY KEY,
    sync_date DATETIME DEFAULT GETDATE(),
    division NVARCHAR(50),
    year INT,
    month INT,
    mode NVARCHAR(10),
    records_synced INT DEFAULT 0,
    status NVARCHAR(50) DEFAULT 'SUCCESS',
    error_message NVARCHAR(MAX),
    duration_ms INT DEFAULT 0
);

-- Insert Default Configs
INSERT INTO absen_config (config_key, config_value, description) VALUES
    ('sync_interval_minutes', '15', 'Interval sync dalam menit'),
    ('last_sync', NULL, 'Timestamp sync terakhir'),
    ('sync_enabled', 'true', 'Aktifkan auto sync'),
    ('api_base_url', 'http://10.0.0.110:5176', 'URL API Absensi');

PRINT 'All tables created successfully with standard schema!';
