ALTER TABLE attendance_scan_logs ADD
    scan_time_original DATETIME2 NULL,
    scan_date_original DATE NULL,
    scan_time_wib DATETIME2 NULL,
    scan_date_wib DATE NULL,
    time_correction_status NVARCHAR(30) NULL,
    time_correction_offset_minutes INT NULL,
    time_correction_reason NVARCHAR(500) NULL,
    time_corrected_at DATETIME2 NULL,
    time_corrected_by NVARCHAR(100) NULL,
    time_correction_batch_id BIGINT NULL;
GO
UPDATE attendance_scan_logs
SET time_correction_status = 'NOT_CHECKED'
WHERE time_correction_status IS NULL;
