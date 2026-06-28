-- Migration 088: Add missing indexes (DB agent P2 finding)
-- Index hilang di kolom JOIN kritikal. Safe: CREATE INDEX IF NOT EXISTS-equivalent (CHECK first).

-- attendance_imports.raw_scan_log_id (FK traceability, JOIN vw_attendance_final)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_imports_raw_scan_log_id' AND object_id=OBJECT_ID('attendance_imports'))
  CREATE INDEX IX_imports_raw_scan_log_id ON attendance_imports(raw_scan_log_id) WHERE raw_scan_log_id IS NOT NULL;

-- attendance_raw.raw_device_user_id (JOIN scan_map, employee lookup)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_raw_raw_device_user_id' AND object_id=OBJECT_ID('attendance_raw'))
  CREATE INDEX IX_raw_raw_device_user_id ON attendance_raw(raw_device_user_id);

-- attendance_raw.machine_code, scan_date (matrix query filter)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_raw_machine_scan_date' AND object_id=OBJECT_ID('attendance_raw'))
  CREATE INDEX IX_raw_machine_scan_date ON attendance_raw(machine_code, scan_date);

-- employees.nik (HR resolution cascade JOIN)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_employees_nik' AND object_id=OBJECT_ID('employees'))
  CREATE INDEX IX_employees_nik ON employees(nik) WHERE nik IS NOT NULL;

-- employees.employee_code (JOIN scan_map, imports)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_employees_employee_code' AND object_id=OBJECT_ID('employees'))
  CREATE INDEX IX_employees_employee_code ON employees(employee_code);

-- hr_reference.nik (cascade lookup)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_hr_reference_nik' AND object_id=OBJECT_ID('hr_reference'))
  CREATE INDEX IX_hr_reference_nik ON hr_reference(nik) WHERE nik IS NOT NULL;

-- scan_map.current_emp_code (matrix/machine-employee JOIN after subquery removal)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_scan_map_current_emp_code' AND object_id=OBJECT_ID('scan_map'))
  CREATE INDEX IX_scan_map_current_emp_code ON scan_map(current_emp_code) WHERE current_emp_code IS NOT NULL;
