USE rebinmas_absensi_monitoring;
GO

IF OBJECT_ID('user_roles','U') IS NOT NULL DROP TABLE user_roles;
IF OBJECT_ID('employee_schedules','U') IS NOT NULL DROP TABLE employee_schedules;
IF OBJECT_ID('attendance_change_logs','U') IS NOT NULL DROP TABLE attendance_change_logs;
IF OBJECT_ID('attendance_manual_corrections','U') IS NOT NULL DROP TABLE attendance_manual_corrections;
IF OBJECT_ID('attendance_imports','U') IS NOT NULL DROP TABLE attendance_imports;
IF OBJECT_ID('attendance_scan_logs','U') IS NOT NULL DROP TABLE attendance_scan_logs;
IF OBJECT_ID('machine_connection_logs','U') IS NOT NULL DROP TABLE machine_connection_logs;
IF OBJECT_ID('attendance_sync_logs','U') IS NOT NULL DROP TABLE attendance_sync_logs;
IF OBJECT_ID('attendance_import_batches','U') IS NOT NULL DROP TABLE attendance_import_batches;
IF OBJECT_ID('attendance_machines','U') IS NOT NULL DROP TABLE attendance_machines;
IF OBJECT_ID('scanner_codes','U') IS NOT NULL DROP TABLE scanner_codes;
IF OBJECT_ID('loc_codes','U') IS NOT NULL DROP TABLE loc_codes;
IF OBJECT_ID('employees','U') IS NOT NULL DROP TABLE employees;
IF OBJECT_ID('gangs','U') IS NOT NULL DROP TABLE gangs;
IF OBJECT_ID('divisions','U') IS NOT NULL DROP TABLE divisions;
IF OBJECT_ID('holidays','U') IS NOT NULL DROP TABLE holidays;
IF OBJECT_ID('shifts','U') IS NOT NULL DROP TABLE shifts;
IF OBJECT_ID('app_configs','U') IS NOT NULL DROP TABLE app_configs;
IF OBJECT_ID('users','U') IS NOT NULL DROP TABLE users;
IF OBJECT_ID('roles','U') IS NOT NULL DROP TABLE roles;
GO

CREATE TABLE roles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  code NVARCHAR(50) NOT NULL UNIQUE,
  name NVARCHAR(100) NOT NULL,
  description NVARCHAR(255) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  username NVARCHAR(100) NOT NULL UNIQUE,
  display_name NVARCHAR(150) NOT NULL,
  email NVARCHAR(150) NULL UNIQUE,
  password_hash NVARCHAR(255) NOT NULL,
  is_active BIT NOT NULL DEFAULT 1,
  last_login_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NULL
);

CREATE TABLE user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE divisions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  division_code NVARCHAR(20) NOT NULL UNIQUE,
  division_name NVARCHAR(100) NOT NULL,
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE gangs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  gang_code NVARCHAR(30) NOT NULL UNIQUE,
  gang_name NVARCHAR(100) NOT NULL,
  division_id INT NOT NULL,
  is_active BIT NOT NULL DEFAULT 1,
  CONSTRAINT fk_gangs_division FOREIGN KEY (division_id) REFERENCES divisions(id)
);

CREATE TABLE employees (
  id INT IDENTITY(1,1) PRIMARY KEY,
  employee_code NVARCHAR(30) NOT NULL UNIQUE,
  employee_name NVARCHAR(150) NOT NULL,
  division_id INT NOT NULL,
  gang_id INT NULL,
  employment_status NVARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  is_active BIT NOT NULL DEFAULT 1,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NULL,
  CONSTRAINT fk_employees_division FOREIGN KEY (division_id) REFERENCES divisions(id),
  CONSTRAINT fk_employees_gang FOREIGN KEY (gang_id) REFERENCES gangs(id)
);

CREATE TABLE scanner_codes (
  id INT IDENTITY(1,1) PRIMARY KEY,
  division_code NVARCHAR(20) NOT NULL,
  scanner_code INT NOT NULL UNIQUE,
  description NVARCHAR(255) NULL,
  is_active BIT NOT NULL DEFAULT 1
);

CREATE TABLE loc_codes (
  id INT IDENTITY(1,1) PRIMARY KEY,
  division_code NVARCHAR(20) NOT NULL,
  loc_code NVARCHAR(10) NOT NULL,
  emp_code_prefix NVARCHAR(10) NOT NULL,
  description NVARCHAR(255) NULL,
  is_active BIT NOT NULL DEFAULT 1,
  CONSTRAINT uq_loc_codes_division UNIQUE (division_code, loc_code)
);

CREATE TABLE attendance_machines (
  id INT IDENTITY(1,1) PRIMARY KEY,
  machine_code NVARCHAR(30) NOT NULL UNIQUE,
  location_name NVARCHAR(150) NOT NULL,
  ip_address NVARCHAR(64) NULL,
  port INT NULL,
  local_ip NVARCHAR(64) NULL,
  machine_type NVARCHAR(50) NOT NULL DEFAULT 'ZKTECO',
  scanner_code INT NULL,
  loc_code NVARCHAR(10) NULL,
  access_status NVARCHAR(40) NOT NULL CHECK (access_status IN ('ACCESSIBLE','PORT_FORWARDING_NEEDED','NOT_ZKTECO','NETWORK_UNREACHABLE','API_ONLY','DISABLED')),
  data_source NVARCHAR(40) NOT NULL CHECK (data_source IN ('DIRECT_ZKTECO','IT_SOLUTION_API','MANUAL_IMPORT','UNKNOWN')),
  notes NVARCHAR(1000) NULL,
  is_active BIT NOT NULL DEFAULT 1,
  last_sync_at DATETIME2 NULL,
  last_error_message NVARCHAR(1000) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NULL
);

CREATE TABLE attendance_import_batches (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  batch_code NVARCHAR(60) NOT NULL UNIQUE,
  source NVARCHAR(40) NOT NULL,
  machine_id INT NULL,
  division_code NVARCHAR(20) NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  status NVARCHAR(30) NOT NULL DEFAULT 'RUNNING',
  started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  finished_at DATETIME2 NULL,
  records_total INT NOT NULL DEFAULT 0,
  records_success INT NOT NULL DEFAULT 0,
  records_failed INT NOT NULL DEFAULT 0,
  error_message NVARCHAR(1000) NULL,
  CONSTRAINT fk_import_batches_machine FOREIGN KEY (machine_id) REFERENCES attendance_machines(id)
);

CREATE TABLE attendance_scan_logs (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  machine_id INT NULL,
  machine_code NVARCHAR(30) NOT NULL,
  raw_device_user_id NVARCHAR(100) NOT NULL,
  raw_user_sn NVARCHAR(100) NULL,
  raw_record_time DATETIME2 NOT NULL,
  raw_ip NVARCHAR(64) NULL,
  parsed_employee_code NVARCHAR(30) NULL,
  parsed_division_code NVARCHAR(20) NULL,
  mapping_status NVARCHAR(30) NOT NULL DEFAULT 'NEED_REVIEW',
  mapping_reason NVARCHAR(500) NULL,
  scan_time DATETIME2 NOT NULL,
  scan_date DATE NOT NULL,
  event_type NVARCHAR(50) NULL,
  verify_type NVARCHAR(50) NULL,
  work_code NVARCHAR(50) NULL,
  sync_batch_id BIGINT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_scan_logs_machine FOREIGN KEY (machine_id) REFERENCES attendance_machines(id),
  CONSTRAINT fk_scan_logs_batch FOREIGN KEY (sync_batch_id) REFERENCES attendance_import_batches(id)
);

CREATE TABLE attendance_imports (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  employee_id INT NOT NULL,
  employee_code NVARCHAR(30) NOT NULL,
  division_code NVARCHAR(20) NOT NULL,
  gang_code NVARCHAR(30) NULL,
  attendance_date DATE NOT NULL,
  attendance_year INT NOT NULL,
  attendance_month INT NOT NULL,
  check_in_at DATETIME2 NULL,
  check_out_at DATETIME2 NULL,
  attendance_status NVARCHAR(30) NOT NULL DEFAULT 'NO_DATA',
  has_work BIT NOT NULL DEFAULT 0,
  is_leave BIT NOT NULL DEFAULT 0,
  is_sick BIT NOT NULL DEFAULT 0,
  is_holiday BIT NOT NULL DEFAULT 0,
  overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  source NVARCHAR(40) NOT NULL,
  source_reference NVARCHAR(100) NULL,
  batch_id BIGINT NULL,
  raw_scan_log_id BIGINT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_imports_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_imports_batch FOREIGN KEY (batch_id) REFERENCES attendance_import_batches(id),
  CONSTRAINT fk_imports_scan_log FOREIGN KEY (raw_scan_log_id) REFERENCES attendance_scan_logs(id),
  CONSTRAINT uq_attendance_import UNIQUE (employee_code, attendance_date, source, source_reference)
);

CREATE TABLE attendance_manual_corrections (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  employee_id INT NOT NULL,
  employee_code NVARCHAR(30) NOT NULL,
  division_code NVARCHAR(20) NOT NULL,
  gang_code NVARCHAR(30) NULL,
  attendance_date DATE NOT NULL,
  attendance_status NVARCHAR(30) NOT NULL,
  check_in_at DATETIME2 NULL,
  check_out_at DATETIME2 NULL,
  has_work BIT NOT NULL DEFAULT 0,
  is_leave BIT NOT NULL DEFAULT 0,
  is_sick BIT NOT NULL DEFAULT 0,
  is_holiday BIT NOT NULL DEFAULT 0,
  overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  reason NVARCHAR(500) NOT NULL,
  is_deleted BIT NOT NULL DEFAULT 0,
  created_by INT NULL,
  updated_by INT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NULL,
  CONSTRAINT fk_corrections_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_corrections_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT uq_manual_correction UNIQUE (employee_code, attendance_date)
);

CREATE TABLE attendance_change_logs (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  entity_type NVARCHAR(60) NOT NULL,
  entity_id NVARCHAR(60) NULL,
  employee_code NVARCHAR(30) NULL,
  division_code NVARCHAR(20) NULL,
  field_name NVARCHAR(100) NULL,
  old_value NVARCHAR(MAX) NULL,
  new_value NVARCHAR(MAX) NULL,
  action_type NVARCHAR(60) NOT NULL,
  reason NVARCHAR(500) NULL,
  changed_by INT NULL,
  changed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  ip_address NVARCHAR(64) NULL,
  user_agent NVARCHAR(500) NULL,
  CONSTRAINT fk_change_logs_user FOREIGN KEY (changed_by) REFERENCES users(id)
);

CREATE TABLE attendance_sync_logs (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  sync_type NVARCHAR(40) NOT NULL,
  source NVARCHAR(40) NOT NULL,
  machine_id INT NULL,
  machine_code NVARCHAR(30) NULL,
  division_code NVARCHAR(20) NULL,
  status NVARCHAR(30) NOT NULL,
  failure_category NVARCHAR(50) NULL,
  started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  finished_at DATETIME2 NULL,
  duration_ms INT NULL,
  records_synced INT NOT NULL DEFAULT 0,
  error_message NVARCHAR(1000) NULL,
  is_dry_run BIT NOT NULL DEFAULT 0,
  triggered_by INT NULL,
  CONSTRAINT fk_sync_logs_machine FOREIGN KEY (machine_id) REFERENCES attendance_machines(id),
  CONSTRAINT fk_sync_logs_user FOREIGN KEY (triggered_by) REFERENCES users(id)
);

CREATE TABLE machine_connection_logs (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  machine_id INT NOT NULL,
  machine_code NVARCHAR(30) NOT NULL,
  status NVARCHAR(30) NOT NULL,
  failure_category NVARCHAR(50) NULL,
  error_message NVARCHAR(1000) NULL,
  response_time_ms INT NULL,
  checked_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  checked_by INT NULL,
  CONSTRAINT fk_connection_logs_machine FOREIGN KEY (machine_id) REFERENCES attendance_machines(id),
  CONSTRAINT fk_connection_logs_user FOREIGN KEY (checked_by) REFERENCES users(id)
);

CREATE TABLE app_configs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  config_key NVARCHAR(100) NOT NULL UNIQUE,
  config_value NVARCHAR(MAX) NULL,
  is_sensitive BIT NOT NULL DEFAULT 0,
  description NVARCHAR(255) NULL,
  updated_by INT NULL,
  updated_at DATETIME2 NULL
);

CREATE TABLE holidays (
  id INT IDENTITY(1,1) PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  holiday_name NVARCHAR(150) NOT NULL,
  is_active BIT NOT NULL DEFAULT 1
);

CREATE TABLE shifts (
  id INT IDENTITY(1,1) PRIMARY KEY,
  shift_code NVARCHAR(30) NOT NULL UNIQUE,
  shift_name NVARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BIT NOT NULL DEFAULT 1
);

CREATE TABLE employee_schedules (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  employee_id INT NOT NULL,
  shift_id INT NOT NULL,
  schedule_date DATE NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_schedules_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_schedules_shift FOREIGN KEY (shift_id) REFERENCES shifts(id),
  CONSTRAINT uq_employee_schedule UNIQUE (employee_id, schedule_date)
);
GO
