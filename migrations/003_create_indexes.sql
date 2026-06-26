USE rebinmas_absensi_monitoring;
GO
CREATE INDEX ix_employees_employee_code ON employees(employee_code);
CREATE INDEX ix_employees_division ON employees(division_id);
CREATE INDEX ix_divisions_code ON divisions(division_code);
CREATE INDEX ix_gangs_code ON gangs(gang_code);
CREATE INDEX ix_machines_code ON attendance_machines(machine_code);
CREATE INDEX ix_machines_status_source ON attendance_machines(access_status, data_source);
CREATE INDEX ix_import_batches_source ON attendance_import_batches(source, status);
CREATE INDEX ix_scan_logs_machine_date ON attendance_scan_logs(machine_code, scan_date);
CREATE INDEX ix_scan_logs_mapping_status ON attendance_scan_logs(mapping_status, scan_date);
CREATE INDEX ix_scan_logs_employee ON attendance_scan_logs(parsed_employee_code);
CREATE INDEX ix_imports_employee_code ON attendance_imports(employee_code);
CREATE INDEX ix_imports_division_code ON attendance_imports(division_code);
CREATE INDEX ix_imports_attendance_date ON attendance_imports(attendance_date);
CREATE INDEX ix_imports_year_month ON attendance_imports(attendance_year, attendance_month);
CREATE INDEX ix_imports_source ON attendance_imports(source);
CREATE INDEX ix_imports_batch_id ON attendance_imports(batch_id);
CREATE INDEX ix_corrections_employee_date ON attendance_manual_corrections(employee_code, attendance_date);
CREATE INDEX ix_sync_logs_machine ON attendance_sync_logs(machine_code, started_at DESC);
CREATE INDEX ix_sync_logs_division ON attendance_sync_logs(division_code, started_at DESC);
CREATE INDEX ix_connection_logs_machine ON machine_connection_logs(machine_code, checked_at DESC);
CREATE INDEX ix_change_logs_entity ON attendance_change_logs(entity_type, entity_id);
CREATE INDEX ix_change_logs_employee ON attendance_change_logs(employee_code, changed_at DESC);
GO
