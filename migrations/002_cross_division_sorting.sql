-- Migration: Cross-Division Attendance Sorting
-- Adds scan/home division tracking and sorting fields for cross-division detection

-- 1. Add columns to attendance_daily_process
ALTER TABLE attendance_daily_process ADD
    scan_division_id INT NULL,
    home_division_id INT NULL,
    is_cross_division_scan BIT DEFAULT 0,
    cross_division_note NVARCHAR(500) NULL;

-- 2. Add FK constraints for attendance_daily_process
ALTER TABLE attendance_daily_process ADD
    CONSTRAINT FK_daily_scan_division FOREIGN KEY (scan_division_id) REFERENCES mst_division(division_id),
    CONSTRAINT FK_daily_home_division FOREIGN KEY (home_division_id) REFERENCES mst_division(division_id);

-- 3. Add columns to attendance_division_reconcile
ALTER TABLE attendance_division_reconcile ADD
    emp_code NVARCHAR(50) NULL,
    sorting_status NVARCHAR(50) NULL DEFAULT 'PENDING',
    sorting_rule NVARCHAR(100) NULL,
    is_cross_division_scan BIT DEFAULT 0,
    need_review BIT DEFAULT 0;

-- 4. Add indexes
CREATE INDEX IX_daily_cross_division ON attendance_daily_process (work_date, is_cross_division_scan);
CREATE INDEX IX_reconcile_sorting ON attendance_division_reconcile (sorting_status, work_date);
