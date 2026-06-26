CREATE TABLE attendance_time_correction_batch (
    batch_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    batch_code NVARCHAR(100) NOT NULL UNIQUE,
    correction_scope NVARCHAR(100) NOT NULL,
    machine_code NVARCHAR(50) NULL,
    date_from DATE NULL,
    date_to DATE NULL,
    offset_minutes INT NOT NULL,
    status NVARCHAR(30) NOT NULL DEFAULT 'PENDING',
    preview_count INT NOT NULL DEFAULT 0,
    applied_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    started_at DATETIME2 NULL,
    completed_at DATETIME2 NULL,
    executed_by NVARCHAR(100) NULL,
    notes NVARCHAR(1000) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
CREATE TABLE attendance_time_correction_detail (
    detail_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    scan_log_id BIGINT NOT NULL,
    machine_code NVARCHAR(50) NOT NULL,
    raw_device_user_id NVARCHAR(100) NULL,
    parsed_employee_code NVARCHAR(50) NULL,
    old_scan_time DATETIME2 NOT NULL,
    new_scan_time DATETIME2 NOT NULL,
    old_scan_date DATE NOT NULL,
    new_scan_date DATE NOT NULL,
    offset_minutes INT NOT NULL,
    correction_status NVARCHAR(30) NOT NULL,
    correction_reason NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
CREATE INDEX ix_correction_batch_status
    ON attendance_time_correction_batch(status, created_at);
CREATE INDEX ix_correction_detail_batch
    ON attendance_time_correction_detail(batch_id);
