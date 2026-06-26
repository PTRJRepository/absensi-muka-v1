USE rebinmas_absensi_monitoring;
GO

PRINT 'Creating Attendance Intelligence matrix indexes...';
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_attendance_scan_logs_date_employee_machine'
    AND object_id = OBJECT_ID('attendance_scan_logs')
)
BEGIN
  CREATE INDEX IX_attendance_scan_logs_date_employee_machine
    ON attendance_scan_logs(scan_date, parsed_employee_code, machine_code)
    INCLUDE (raw_device_user_id, scan_time, mapping_status);
  PRINT 'Created IX_attendance_scan_logs_date_employee_machine';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_attendance_imports_employee_date_status'
    AND object_id = OBJECT_ID('attendance_imports')
)
BEGIN
  CREATE INDEX IX_attendance_imports_employee_date_status
    ON attendance_imports(employee_code, attendance_date)
    INCLUDE (attendance_status, check_in_at, check_out_at, source, is_leave, is_sick, is_holiday);
  PRINT 'Created IX_attendance_imports_employee_date_status';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_attendance_manual_corrections_employee_date_active'
    AND object_id = OBJECT_ID('attendance_manual_corrections')
)
BEGIN
  CREATE INDEX IX_attendance_manual_corrections_employee_date_active
    ON attendance_manual_corrections(employee_code, attendance_date, is_deleted)
    INCLUDE (attendance_status, check_in_at, check_out_at, is_leave, is_sick, is_holiday);
  PRINT 'Created IX_attendance_manual_corrections_employee_date_active';
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_employees_division_active'
    AND object_id = OBJECT_ID('employees')
)
BEGIN
  CREATE INDEX IX_employees_division_active
    ON employees(division_id, is_active)
    INCLUDE (employee_code, employee_name, gang_id);
  PRINT 'Created IX_employees_division_active';
END
GO

PRINT 'Attendance Intelligence matrix indexes ready.';
GO
