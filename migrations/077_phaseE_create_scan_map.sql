-- =============================================================================
-- Phase E: Create scan_map staging table (separate enrichment from raw)
-- =============================================================================
-- Goal: Raw scan_logs stays immutable (machine data only).
-- scan_map holds: parse results + current_emp_code resolution (derived, re-runnable).
-- =============================================================================

-- 1. Create scan_map table
CREATE TABLE dbo.scan_map (
  scan_log_id        bigint       NOT NULL,
  parsed_emp_code   nvarchar(20) NULL,
  scanner_prefix     nvarchar(3)  NULL,
  loc_code           nvarchar(5)  NULL,
  map_status         nvarchar(20) NULL,
  map_reason         nvarchar(200) NULL,
  current_emp_code   nvarchar(20) NULL,
  current_emp_name   nvarchar(200) NULL,
  resolved_nik       nvarchar(20) NULL,
  resolution_status  nvarchar(20) NULL,
  resolution_method  nvarchar(30) NULL,
  resolved_at        datetime2    NULL,
  CONSTRAINT PK_scan_map PRIMARY KEY CLUSTERED (scan_log_id),
  CONSTRAINT FK_scan_map_scan_logs FOREIGN KEY (scan_log_id) REFERENCES dbo.attendance_scan_logs(id)
);

-- 2. Create indexes for common query patterns
CREATE NONCLUSTERED INDEX IX_scan_map_parsed_emp_code ON dbo.scan_map (parsed_emp_code);
CREATE NONCLUSTERED INDEX IX_scan_map_current_emp_code ON dbo.scan_map (current_emp_code);
CREATE NONCLUSTERED INDEX IX_scan_map_map_status ON dbo.scan_map (map_status);

-- 3. Backfill from scan_logs (copy enrichment columns)
INSERT INTO dbo.scan_map (
  scan_log_id,
  parsed_emp_code,
  map_status,
  map_reason,
  current_emp_code,
  resolved_nik,
  resolution_status,
  resolution_method,
  resolved_at
)
SELECT
  sl.id,
  sl.parsed_employee_code,
  sl.mapping_status,
  sl.mapping_reason,
  sl.current_emp_code,
  NULL, -- resolved_nik (not in scan_logs currently, will be populated by resolution service)
  sl.current_mapping_status,
  NULL, -- resolution_method (not in scan_logs currently)
  sl.current_resolved_at
FROM dbo.attendance_scan_logs sl;

-- 4. Verify row count matches
SELECT
  (SELECT COUNT(*) FROM dbo.attendance_scan_logs) AS scan_logs_count,
  (SELECT COUNT(*) FROM dbo.scan_map) AS scan_map_count;
