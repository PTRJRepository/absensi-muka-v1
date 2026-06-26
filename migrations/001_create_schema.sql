-- Migration: 001_create_schema.sql
-- Database: extend_db_ptrj (SERVER_PROFILE_1)
-- Description: ERD + Backend Database untuk Monitoring Absensi Muka PT Rebinmas Jaya
-- Created: 2026-05-29

-- ============================================================================
-- MASTER TABLES
-- ============================================================================

-- 4.1 mst_estate
CREATE TABLE mst_estate (
    estate_id INT IDENTITY(1,1) PRIMARY KEY,
    estate_code NVARCHAR(30) NOT NULL UNIQUE,
    estate_name NVARCHAR(150) NOT NULL,
    company_code NVARCHAR(50) DEFAULT 'PTRJ',
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);

-- 4.2 mst_division
CREATE TABLE mst_division (
    division_id INT IDENTITY(1,1) PRIMARY KEY,
    estate_id INT NULL,
    division_code NVARCHAR(50) NOT NULL UNIQUE,
    division_name NVARCHAR(150) NOT NULL,
    source_division_code NVARCHAR(50) NULL,
    loc_code NVARCHAR(10) NULL,
    scanner_code INT NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_mst_division_estate FOREIGN KEY (estate_id) REFERENCES mst_estate(estate_id)
);

-- 4.3 mst_gang
CREATE TABLE mst_gang (
    gang_id INT IDENTITY(1,1) PRIMARY KEY,
    division_id INT NOT NULL,
    gang_code NVARCHAR(50) NOT NULL,
    gang_name NVARCHAR(150) NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_mst_gang_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id),
    CONSTRAINT UQ_mst_gang UNIQUE (division_id, gang_code)
);

-- 4.4 mst_machine
CREATE TABLE mst_machine (
    machine_id INT IDENTITY(1,1) PRIMARY KEY,
    machine_code NVARCHAR(50) NOT NULL UNIQUE,
    machine_name NVARCHAR(150) NOT NULL,
    estate_id INT NULL,
    default_division_id INT NULL,
    ip_local NVARCHAR(50) NULL,
    ip_public NVARCHAR(50) NULL,
    port INT NOT NULL DEFAULT 4370,
    scanner_code INT NULL,
    loc_code NVARCHAR(10) NULL,
    machine_type NVARCHAR(50) DEFAULT 'ZKTECO',
    source_type NVARCHAR(50) DEFAULT 'DIRECT',
    access_status NVARCHAR(50) DEFAULT 'UNKNOWN',
    access_note NVARCHAR(500) NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_mst_machine_estate FOREIGN KEY (estate_id) REFERENCES mst_estate(estate_id),
    CONSTRAINT FK_mst_machine_division FOREIGN KEY (default_division_id) REFERENCES mst_division(division_id)
);

-- 4.5 mst_employee
CREATE TABLE mst_employee (
    employee_id INT IDENTITY(1,1) PRIMARY KEY,
    emp_code NVARCHAR(50) NOT NULL UNIQUE,
    emp_name NVARCHAR(200) NOT NULL,
    employee_number NVARCHAR(50) NULL,
    card_no NVARCHAR(100) NULL,
    current_division_id INT NULL,
    current_gang_id INT NULL,
    employment_status NVARCHAR(50) DEFAULT 'ACTIVE',
    is_active BIT DEFAULT 1,
    first_seen_at DATETIME NULL,
    last_seen_at DATETIME NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_mst_employee_division FOREIGN KEY (current_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_mst_employee_gang FOREIGN KEY (current_gang_id) REFERENCES mst_gang(gang_id)
);

-- ============================================================================
-- EMPLOYEE MOVEMENT TRACKING
-- ============================================================================

-- 5.1 employee_division_history
CREATE TABLE employee_division_history (
    history_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NOT NULL,
    division_id INT NOT NULL,
    gang_id INT NULL,
    estate_id INT NULL,
    effective_start DATE NOT NULL,
    effective_end DATE NULL,
    assignment_source NVARCHAR(50) DEFAULT 'SYSTEM_DETECTED',
    confidence_score DECIMAL(5,2) DEFAULT 100.00,
    reason NVARCHAR(300) NULL,
    created_by NVARCHAR(100) DEFAULT 'SYSTEM',
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_emp_div_hist_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_emp_div_hist_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_emp_div_hist_gang FOREIGN KEY (gang_id) REFERENCES mst_gang(gang_id),
    CONSTRAINT FK_emp_div_hist_estate FOREIGN KEY (estate_id) REFERENCES mst_estate(estate_id)
);

-- 5.2 employee_daily_assignment
CREATE TABLE employee_daily_assignment (
    assignment_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NOT NULL,
    work_date DATE NOT NULL,
    detected_division_id INT NULL,
    final_division_id INT NOT NULL,
    detected_gang_id INT NULL,
    final_gang_id INT NULL,
    source NVARCHAR(50) DEFAULT 'SYSTEM',
    confidence_score DECIMAL(5,2) DEFAULT 100.00,
    is_manual_override BIT DEFAULT 0,
    override_reason NVARCHAR(500) NULL,
    updated_by NVARCHAR(100) NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_emp_daily_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_emp_daily_detected_division FOREIGN KEY (detected_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_emp_daily_final_division FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT UQ_emp_daily_assignment UNIQUE (employee_id, work_date)
);

-- ============================================================================
-- IMPORT LAYER
-- ============================================================================

-- 6.1 sync_job
CREATE TABLE sync_job (
    sync_job_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    job_code NVARCHAR(100) NOT NULL UNIQUE,
    sync_type NVARCHAR(50) NOT NULL,
    trigger_type NVARCHAR(50) DEFAULT 'MANUAL',
    period_start DATE NULL,
    period_end DATE NULL,
    status NVARCHAR(50) DEFAULT 'PENDING',
    started_at DATETIME DEFAULT GETDATE(),
    completed_at DATETIME NULL,
    total_batch INT DEFAULT 0,
    success_batch INT DEFAULT 0,
    failed_batch INT DEFAULT 0,
    error_message NVARCHAR(MAX) NULL,
    created_by NVARCHAR(100) DEFAULT 'SYSTEM'
);

-- 6.2 import_batch
CREATE TABLE import_batch (
    import_batch_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    batch_code NVARCHAR(120) NOT NULL UNIQUE,
    sync_job_id BIGINT NULL,
    source_type NVARCHAR(50) NOT NULL,
    machine_id INT NULL,
    division_id INT NULL,
    source_name NVARCHAR(150) NULL,
    year INT NULL,
    month INT NULL,
    date_from DATE NULL,
    date_to DATE NULL,
    total_records INT DEFAULT 0,
    inserted_records INT DEFAULT 0,
    duplicate_records INT DEFAULT 0,
    error_records INT DEFAULT 0,
    status NVARCHAR(50) DEFAULT 'PENDING',
    started_at DATETIME DEFAULT GETDATE(),
    completed_at DATETIME NULL,
    raw_payload_path NVARCHAR(500) NULL,
    error_message NVARCHAR(MAX) NULL,
    imported_by NVARCHAR(100) DEFAULT 'SYSTEM',
    CONSTRAINT FK_import_batch_sync_job FOREIGN KEY (sync_job_id) REFERENCES sync_job(sync_job_id),
    CONSTRAINT FK_import_batch_machine FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_import_batch_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id)
);

-- ============================================================================
-- RAW DATA LAYER (IMMUTABLE)
-- ============================================================================

-- 7.1 attendance_raw_log
CREATE TABLE attendance_raw_log (
    raw_log_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    import_batch_id BIGINT NOT NULL,
    machine_id INT NOT NULL,
    machine_user_id NVARCHAR(100) NOT NULL,
    machine_uid INT NULL,
    user_sn BIGINT NULL,
    record_time DATETIME NOT NULL,
    record_date AS CAST(record_time AS DATE) PERSISTED,
    verify_mode NVARCHAR(50) NULL,
    in_out_mode NVARCHAR(50) NULL,
    device_ip NVARCHAR(50) NULL,
    device_sn NVARCHAR(100) NULL,
    raw_payload NVARCHAR(MAX) NULL,
    is_processed BIT DEFAULT 0,
    processed_at DATETIME NULL,
    imported_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_raw_log_batch FOREIGN KEY (import_batch_id) REFERENCES import_batch(import_batch_id),
    CONSTRAINT FK_raw_log_machine FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id),
    CONSTRAINT UQ_attendance_raw_log UNIQUE (machine_id, machine_user_id, record_time)
);

-- 7.2 machine_user_raw
CREATE TABLE machine_user_raw (
    machine_user_raw_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    import_batch_id BIGINT NULL,
    machine_id INT NOT NULL,
    machine_uid INT NULL,
    machine_user_id NVARCHAR(100) NOT NULL,
    user_name NVARCHAR(200) NULL,
    role INT NULL,
    card_no NVARCHAR(100) NULL,
    password_exists BIT DEFAULT 0,
    raw_payload NVARCHAR(MAX) NULL,
    imported_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_machine_user_raw_machine FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_machine_user_raw_batch FOREIGN KEY (import_batch_id) REFERENCES import_batch(import_batch_id),
    CONSTRAINT UQ_machine_user_raw UNIQUE (machine_id, machine_user_id)
);

-- 7.3 api_attendance_raw
CREATE TABLE api_attendance_raw (
    api_raw_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    import_batch_id BIGINT NOT NULL,
    division_id INT NULL,
    emp_code NVARCHAR(50) NOT NULL,
    emp_name NVARCHAR(200) NULL,
    gang_code NVARCHAR(50) NULL,
    work_date DATE NOT NULL,
    has_work BIT DEFAULT 0,
    is_sunday BIT DEFAULT 0,
    is_holiday BIT DEFAULT 0,
    holiday_desc NVARCHAR(200) NULL,
    is_cuti BIT DEFAULT 0,
    is_sakit BIT DEFAULT 0,
    ot_hours DECIMAL(8,2) DEFAULT 0,
    task_code NVARCHAR(50) NULL,
    mode NVARCHAR(10) DEFAULT 'hk',
    raw_payload NVARCHAR(MAX) NULL,
    imported_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_api_raw_batch FOREIGN KEY (import_batch_id) REFERENCES import_batch(import_batch_id),
    CONSTRAINT FK_api_raw_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id),
    CONSTRAINT UQ_api_attendance_raw UNIQUE (division_id, emp_code, work_date, mode, import_batch_id)
);

-- ============================================================================
-- MAPPING LAYER
-- ============================================================================

-- 8.1 machine_user_map
CREATE TABLE machine_user_map (
    map_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    machine_id INT NOT NULL,
    machine_user_id NVARCHAR(100) NOT NULL,
    employee_id INT NULL,
    emp_code NVARCHAR(50) NULL,
    mapped_by_rule NVARCHAR(100) NULL,
    mapped_source NVARCHAR(50) DEFAULT 'SYSTEM',
    loc_code NVARCHAR(10) NULL,
    scanner_code INT NULL,
    confidence_score DECIMAL(5,2) DEFAULT 100.00,
    is_active BIT DEFAULT 1,
    first_seen_at DATETIME NULL,
    last_seen_at DATETIME NULL,
    verified_by NVARCHAR(100) NULL,
    verified_at DATETIME NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_machine_user_map_machine FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_machine_user_map_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
    CONSTRAINT UQ_machine_user_map UNIQUE (machine_id, machine_user_id)
);

-- ============================================================================
-- PROCESS LAYER
-- ============================================================================

-- 9.1 attendance_daily_process
CREATE TABLE attendance_daily_process (
    process_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    employee_id INT NOT NULL,
    emp_code NVARCHAR(50) NOT NULL,
    emp_name NVARCHAR(200) NULL,
    work_date DATE NOT NULL,
    final_division_id INT NULL,
    final_gang_id INT NULL,
    source_priority NVARCHAR(50) DEFAULT 'MIXED',
    first_scan_time DATETIME NULL,
    last_scan_time DATETIME NULL,
    jam_masuk TIME NULL,
    jam_keluar TIME NULL,
    scan_count INT DEFAULT 0,
    machine_count INT DEFAULT 0,
    has_machine_log BIT DEFAULT 0,
    has_api_data BIT DEFAULT 0,
    has_manual_adjustment BIT DEFAULT 0,
    has_work BIT DEFAULT 0,
    is_sunday BIT DEFAULT 0,
    is_holiday BIT DEFAULT 0,
    holiday_desc NVARCHAR(200) NULL,
    is_cuti BIT DEFAULT 0,
    is_sakit BIT DEFAULT 0,
    ot_hours DECIMAL(8,2) DEFAULT 0,
    task_code NVARCHAR(50) NULL,
    attendance_status NVARCHAR(50) DEFAULT 'UNKNOWN',
    reconcile_status NVARCHAR(50) DEFAULT 'PENDING',
    is_locked BIT DEFAULT 0,
    processed_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_daily_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_daily_division FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_daily_gang FOREIGN KEY (final_gang_id) REFERENCES mst_gang(gang_id),
    CONSTRAINT UQ_attendance_daily_process UNIQUE (employee_id, work_date)
);

-- 9.2 attendance_process_detail
CREATE TABLE attendance_process_detail (
    detail_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    process_id BIGINT NOT NULL,
    raw_log_id BIGINT NULL,
    machine_id INT NULL,
    scan_time DATETIME NOT NULL,
    scan_type NVARCHAR(50) NULL,
    detected_division_id INT NULL,
    detected_emp_code NVARCHAR(50) NULL,
    is_used_for_in BIT DEFAULT 0,
    is_used_for_out BIT DEFAULT 0,
    is_duplicate BIT DEFAULT 0,
    is_cross_division BIT DEFAULT 0,
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_process_detail_process FOREIGN KEY (process_id) REFERENCES attendance_daily_process(process_id),
    CONSTRAINT FK_process_detail_raw FOREIGN KEY (raw_log_id) REFERENCES attendance_raw_log(raw_log_id),
    CONSTRAINT FK_process_detail_machine FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_process_detail_division FOREIGN KEY (detected_division_id) REFERENCES mst_division(division_id)
);

-- ============================================================================
-- RECONCILIATION LAYER
-- ============================================================================

-- 10.1 attendance_division_reconcile
CREATE TABLE attendance_division_reconcile (
    reconcile_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    process_id BIGINT NOT NULL,
    employee_id INT NOT NULL,
    work_date DATE NOT NULL,
    expected_division_id INT NULL,
    detected_division_id INT NULL,
    api_division_id INT NULL,
    final_division_id INT NULL,
    expected_gang_id INT NULL,
    api_gang_code NVARCHAR(50) NULL,
    source_machine_id INT NULL,
    match_status NVARCHAR(50) NOT NULL DEFAULT 'PENDING',
    mismatch_reason NVARCHAR(500) NULL,
    confidence_score DECIMAL(5,2) DEFAULT 100.00,
    resolved_by NVARCHAR(100) NULL,
    resolved_at DATETIME NULL,
    resolution_note NVARCHAR(500) NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_reconcile_process FOREIGN KEY (process_id) REFERENCES attendance_daily_process(process_id),
    CONSTRAINT FK_reconcile_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_reconcile_expected_division FOREIGN KEY (expected_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_reconcile_detected_division FOREIGN KEY (detected_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_reconcile_api_division FOREIGN KEY (api_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_reconcile_final_division FOREIGN KEY (final_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_reconcile_machine FOREIGN KEY (source_machine_id) REFERENCES mst_machine(machine_id),
    CONSTRAINT UQ_attendance_division_reconcile UNIQUE (employee_id, work_date)
);

-- ============================================================================
-- MANUAL CORRECTION LAYER
-- ============================================================================

-- 11.1 attendance_manual_adjustment
CREATE TABLE attendance_manual_adjustment (
    adjustment_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    process_id BIGINT NULL,
    employee_id INT NOT NULL,
    work_date DATE NOT NULL,
    adjustment_type NVARCHAR(50) NOT NULL,
    old_jam_masuk TIME NULL,
    new_jam_masuk TIME NULL,
    old_jam_keluar TIME NULL,
    new_jam_keluar TIME NULL,
    old_status NVARCHAR(50) NULL,
    new_status NVARCHAR(50) NULL,
    old_division_id INT NULL,
    new_division_id INT NULL,
    reason NVARCHAR(500) NOT NULL,
    requested_by NVARCHAR(100) NULL,
    approved_by NVARCHAR(100) NULL,
    approved_at DATETIME NULL,
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_manual_process FOREIGN KEY (process_id) REFERENCES attendance_daily_process(process_id),
    CONSTRAINT FK_manual_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id)
);

-- ============================================================================
-- MONITORING LAYER
-- ============================================================================

-- 12.1 attendance_anomaly
CREATE TABLE attendance_anomaly (
    anomaly_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    process_id BIGINT NULL,
    employee_id INT NULL,
    work_date DATE NULL,
    anomaly_type NVARCHAR(80) NOT NULL,
    severity NVARCHAR(30) DEFAULT 'MEDIUM',
    title NVARCHAR(200) NOT NULL,
    description NVARCHAR(MAX) NULL,
    machine_id INT NULL,
    division_id INT NULL,
    status NVARCHAR(50) DEFAULT 'OPEN',
    detected_at DATETIME DEFAULT GETDATE(),
    resolved_by NVARCHAR(100) NULL,
    resolved_at DATETIME NULL,
    resolution_note NVARCHAR(500) NULL,
    CONSTRAINT FK_anomaly_process FOREIGN KEY (process_id) REFERENCES attendance_daily_process(process_id),
    CONSTRAINT FK_anomaly_employee FOREIGN KEY (employee_id) REFERENCES mst_employee(employee_id),
    CONSTRAINT FK_anomaly_machine FOREIGN KEY (machine_id) REFERENCES mst_machine(machine_id),
    CONSTRAINT FK_anomaly_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id)
);

-- 12.2 monitoring_daily_summary
CREATE TABLE monitoring_daily_summary (
    summary_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    summary_date DATE NOT NULL,
    division_id INT NULL,
    estate_id INT NULL,
    total_employee INT DEFAULT 0,
    total_present INT DEFAULT 0,
    total_absent INT DEFAULT 0,
    total_cuti INT DEFAULT 0,
    total_sakit INT DEFAULT 0,
    total_holiday INT DEFAULT 0,
    total_no_checkin INT DEFAULT 0,
    total_no_checkout INT DEFAULT 0,
    total_cross_division INT DEFAULT 0,
    total_unmapped INT DEFAULT 0,
    total_anomaly INT DEFAULT 0,
    machine_log_count INT DEFAULT 0,
    api_record_count INT DEFAULT 0,
    generated_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_summary_division FOREIGN KEY (division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_summary_estate FOREIGN KEY (estate_id) REFERENCES mst_estate(estate_id),
    CONSTRAINT UQ_monitoring_daily_summary UNIQUE (summary_date, division_id)
);

-- ============================================================================
-- AUDIT & CONFIG
-- ============================================================================

-- 13.1 audit_log
CREATE TABLE audit_log (
    audit_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    entity_name NVARCHAR(100) NOT NULL,
    entity_id NVARCHAR(100) NULL,
    action_type NVARCHAR(50) NOT NULL,
    old_value NVARCHAR(MAX) NULL,
    new_value NVARCHAR(MAX) NULL,
    changed_by NVARCHAR(100) DEFAULT 'SYSTEM',
    changed_at DATETIME DEFAULT GETDATE(),
    ip_address NVARCHAR(50) NULL,
    user_agent NVARCHAR(500) NULL
);

-- 13.2 app_config
CREATE TABLE app_config (
    config_id INT IDENTITY(1,1) PRIMARY KEY,
    config_key NVARCHAR(100) NOT NULL UNIQUE,
    config_value NVARCHAR(MAX) NULL,
    config_type NVARCHAR(50) DEFAULT 'STRING',
    description NVARCHAR(500) NULL,
    updated_at DATETIME DEFAULT GETDATE(),
    updated_by NVARCHAR(100) DEFAULT 'SYSTEM'
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Raw log indexes
CREATE INDEX IX_raw_log_record_date ON attendance_raw_log (record_date, machine_id);
CREATE INDEX IX_raw_log_machine_user ON attendance_raw_log (machine_user_id, record_time);

-- API raw indexes
CREATE INDEX IX_api_raw_emp_date ON api_attendance_raw (emp_code, work_date);

-- Daily process indexes
CREATE INDEX IX_daily_process_date_division ON attendance_daily_process (work_date, final_division_id);
CREATE INDEX IX_daily_process_emp_date ON attendance_daily_process (emp_code, work_date);

-- Reconcile indexes
CREATE INDEX IX_reconcile_status_date ON attendance_division_reconcile (work_date, match_status);

-- Anomaly indexes
CREATE INDEX IX_anomaly_status_date ON attendance_anomaly (detected_at, status, anomaly_type);

-- Employee history indexes
CREATE INDEX IX_employee_history_effective ON employee_division_history (employee_id, effective_start, effective_end);

-- ============================================================================
-- VIEWS FOR DASHBOARD
-- ============================================================================

-- 15.1 vw_attendance_monitoring_daily
CREATE VIEW vw_attendance_monitoring_daily AS
SELECT
    p.work_date,
    e.emp_code,
    e.emp_name,
    d.division_code,
    d.division_name,
    g.gang_code,
    p.jam_masuk,
    p.jam_keluar,
    p.scan_count,
    p.has_machine_log,
    p.has_api_data,
    p.has_manual_adjustment,
    p.has_work,
    p.is_cuti,
    p.is_sakit,
    p.is_holiday,
    p.ot_hours,
    p.task_code,
    p.attendance_status,
    p.reconcile_status,
    r.match_status,
    r.mismatch_reason,
    p.processed_at
FROM attendance_daily_process p
JOIN mst_employee e ON p.employee_id = e.employee_id
LEFT JOIN mst_division d ON p.final_division_id = d.division_id
LEFT JOIN mst_gang g ON p.final_gang_id = g.gang_id
LEFT JOIN attendance_division_reconcile r ON p.process_id = r.process_id;
GO

-- 15.2 vw_attendance_anomaly_open
CREATE VIEW vw_attendance_anomaly_open AS
SELECT
    a.anomaly_id,
    a.detected_at,
    a.work_date,
    e.emp_code,
    e.emp_name,
    d.division_code,
    m.machine_code,
    a.anomaly_type,
    a.severity,
    a.title,
    a.description,
    a.status
FROM attendance_anomaly a
LEFT JOIN mst_employee e ON a.employee_id = e.employee_id
LEFT JOIN mst_division d ON a.division_id = d.division_id
LEFT JOIN mst_machine m ON a.machine_id = m.machine_id
WHERE a.status = 'OPEN';
GO

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Seed: mst_estate
INSERT INTO mst_estate (estate_code, estate_name) VALUES
('PGE', 'Estate PGE'),
('DME', 'Estate DME'),
('ARA', 'Estate ARA'),
('AB', 'Estate AB'),
('ARC', 'Estate ARC'),
('IJL', 'Estate IJL'),
('MILL', 'Mill'),
('ARE', 'Estate ARE');

-- Seed: mst_division
INSERT INTO mst_division (division_code, division_name, loc_code, scanner_code) VALUES
('PG1A', 'Divisi PG1A', 'A', 100),
('PG1B', 'Divisi PG1B', 'B', 300),
('PG2A', 'Divisi PG2A', 'C', 500),
('PG2B', 'Divisi PG2B', 'D', 600),
('DME', 'Divisi DME', 'E', 700),
('ARA', 'Divisi ARA', 'F', 800),
('ARB1', 'Divisi ARB1', 'G', 900),
('ARB2', 'Divisi ARB2', 'H', 400),
('AREC', 'Divisi AREC', 'J', 200),
('IJL', 'Divisi IJL', 'L', NULL),
('INFRA', 'Infrastructure', NULL, NULL),
('STF-OFFICE', 'Staff Office', NULL, NULL),
('SECURITY', 'Security', NULL, NULL);

-- Seed: mst_machine (15 machines)
INSERT INTO mst_machine (machine_code, machine_name, ip_local, ip_public, port, scanner_code, loc_code, source_type, access_status, access_note) VALUES
('PGE', 'Office PGE', '10.0.0.232', '223.25.98.220', 4370, NULL, NULL, 'DIRECT', 'ACCESSIBLE', 'Local network'),
('MILL', 'Mill', NULL, '103.127.66.32', 4370, NULL, NULL, 'DIRECT', 'ACCESSIBLE', ''),
('DME_01', 'Absensi DME 01', '192.168.1.10', '103.144.228.42', 4700, 700, 'E', 'DIRECT', 'ACCESSIBLE', ''),
('DME_02', 'Absensi DME 02', '192.168.1.11', '103.144.228.42', 4701, 700, 'E', 'DIRECT', 'ACCESSIBLE', ''),
('ARE', 'Office ARE', '192.168.1.233', '103.144.208.154', 4370, NULL, NULL, 'DIRECT', 'ACCESSIBLE', ''),
('IJL', 'IJL', NULL, '103.144.211.226', 4370, NULL, 'L', 'DIRECT', 'ACCESSIBLE', ''),
('ARA', 'Absensi ARA', '192.168.1.230', '103.144.208.154', 4800, 800, 'F', 'DIRECT', 'ACCESSIBLE', ''),
('AB2', 'Absensi AB2', '192.168.1.232', '103.144.208.154', 4400, 400, 'H', 'DIRECT', 'ACCESSIBLE', ''),
('P1A', 'Absensi P1A', '10.0.0.90', '223.25.98.220', 4100, 100, 'A', 'API_ONLY', 'NON_ZKTECO', 'Not ZKTeco device'),
('P1B', 'Absensi P1B', '10.0.0.91', '223.25.98.220', 4300, 300, 'B', 'API_ONLY', 'NON_ZKTECO', 'Not ZKTeco device'),
('P2A', 'Absensi P2A', '10.0.0.92', '223.25.98.220', 4500, 500, 'C', 'API_ONLY', 'UNREACHABLE', 'Port forwarding needed'),
('P2B', 'Absensi P2B', '10.0.0.93', '223.25.98.220', 4600, 600, 'D', 'API_ONLY', 'UNREACHABLE', 'Port forwarding needed'),
('AB1', 'Absensi AB1', '192.168.1.231', '103.144.208.154', 4900, 900, 'G', 'DIRECT', 'PORT_FORWARDING_REQUIRED', 'Port forwarding needed'),
('ARC_01', 'Absensi ARC 01', '192.168.1.235', '103.144.208.154', 4200, 200, 'J', 'DIRECT', 'PORT_FORWARDING_REQUIRED', 'Port forwarding needed'),
('ARC_02', 'Absensi ARC 02', '192.168.1.236', '103.144.208.154', 4201, 200, 'J', 'DIRECT', 'PORT_FORWARDING_REQUIRED', 'Port forwarding needed');

-- Seed: app_config
INSERT INTO app_config (config_key, config_value, description) VALUES
('sync_interval_minutes', '15', 'Interval auto sync absensi'),
('machine_timeout_ms', '30000', 'Timeout koneksi mesin'),
('default_source_priority', 'MACHINE,API,MANUAL', 'Urutan prioritas sumber data'),
('auto_detect_employee_movement', 'true', 'Aktifkan deteksi pindah divisi otomatis'),
('cross_division_threshold_days', '3', 'Minimal hari berturut-turut untuk dianggap pindah divisi');

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
