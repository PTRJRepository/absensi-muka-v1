-- =============================================================
-- DIAGNOSTIC QUERIES: Intermittent Attendance Data Investigation
-- Date: 2026-06-22
-- Purpose: Identify root cause of data appearing/disappearing in
--          attendance matrix for the same employee
-- =============================================================

USE rebinmas_absensi_monitoring;
GO

PRINT '======================================================';
PRINT 'DIAGNOSTIC 1: Scan Logs Distribution per Employee per Day';
PRINT '   Check: Apakah ada karyawan yang punya scan di hari A tapi tidak di hari B?';
PRINT '======================================================';
-- Cari karyawan yang memiliki scan di beberapa hari tapi ada hari tanpa scan di tengah-tengahnya
WITH employee_days AS (
  SELECT
    COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')) AS employee_code,
    CAST(s.scan_date AS DATE) AS scan_date,
    COUNT(*) AS scan_count,
    MIN(s.raw_device_user_id) AS sample_raw_id,
    MAX(LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))) ) AS raw_id_length
  FROM attendance_scan_logs s
  LEFT JOIN zkteco_hr_employee_map zm
    ON zm.machine_code = s.machine_code
   AND zm.zkteco_user_id = s.raw_device_user_id
   AND zm.is_active = 1
  WHERE s.scan_date >= DATEADD(DAY, -30, GETDATE())
  GROUP BY
    COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')),
    CAST(s.scan_date AS DATE)
)
SELECT TOP 20
  employee_code,
  COUNT(DISTINCT scan_date) AS active_days,
  MIN(scan_date) AS first_scan_date,
  MAX(scan_date) AS last_scan_date,
  STRING_AGG(CONVERT(VARCHAR, scan_date, 23), ', ') WITHIN GROUP (ORDER BY scan_date) AS all_dates,
  SUM(scan_count) AS total_scans
FROM employee_days
WHERE employee_code IS NOT NULL
GROUP BY employee_code
HAVING COUNT(DISTINCT scan_date) BETWEEN 3 AND 20  -- Karyawan yang punya 3-20 hari scan (bukan full/bukan kosong)
ORDER BY active_days DESC;
GO

PRINT '';
PRINT '======================================================';
PRINT 'DIAGNOSTIC 2: Gap Analysis - Missing Days Between Scans';
PRINT '   Check: Berapa banyak gap (hari tanpa scan) antar scan?';
PRINT '======================================================';
WITH employee_days AS (
  SELECT DISTINCT
    COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')) AS employee_code,
    CAST(s.scan_date AS DATE) AS scan_date
  FROM attendance_scan_logs s
  LEFT JOIN zkteco_hr_employee_map zm
    ON zm.machine_code = s.machine_code
   AND zm.zkteco_user_id = s.raw_device_user_id
   AND zm.is_active = 1
  WHERE s.scan_date >= DATEADD(DAY, -30, GETDATE())
    AND COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')) IS NOT NULL
),
date_series AS (
  SELECT
    employee_code,
    scan_date,
    LAG(scan_date) OVER (PARTITION BY employee_code ORDER BY scan_date) AS prev_date
  FROM employee_days
)
SELECT TOP 30
  employee_code,
  scan_date,
  prev_date,
  DATEDIFF(DAY, prev_date, scan_date) - 1 AS gap_days
FROM date_series
WHERE prev_date IS NOT NULL
  AND DATEDIFF(DAY, prev_date, scan_date) > 1
ORDER BY gap_days DESC, employee_code;
GO

PRINT '';
PRINT '======================================================';
PRINT 'DIAGNOSTIC 3: Mapping Status Breakdown';
PRINT '   Check: Berapa % scan yang berhasil di-mapping vs yang NEED_REVIEW?';
PRINT '======================================================';
SELECT
  s.mapping_status,
  CASE
    WHEN LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))) > 5 THEN 'LONG_ID'
    WHEN LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))) < 5 THEN 'SHORT_ID'
    ELSE '5_DIGIT_ID'
  END AS id_category,
  s.machine_code,
  COUNT(*) AS total_records,
  COUNT(DISTINCT CAST(s.scan_date AS DATE)) AS distinct_days,
  MIN(s.scan_date) AS first_date,
  MAX(s.scan_date) AS last_date
FROM attendance_scan_logs s
WHERE s.scan_date >= DATEADD(DAY, -30, GETDATE())
GROUP BY
  s.mapping_status,
  CASE
    WHEN LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))) > 5 THEN 'LONG_ID'
    WHEN LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))) < 5 THEN 'SHORT_ID'
    ELSE '5_DIGIT_ID'
  END,
  s.machine_code
ORDER BY total_records DESC;
GO

PRINT '';
PRINT '======================================================';
PRINT 'DIAGNOSTIC 4: View Definition - Cross-Join Behavior';
PRINT '   Check: Apakah vw_attendance_monthly_matrix menggunakan cross-join dengan semua employees?';
PRINT '======================================================';
-- Cek calendar + employees cross-join: apakah ada rows untuk employee yang tidak ada scan?
SELECT
  'Total employees' AS metric,
  COUNT(*) AS value
FROM employees
WHERE is_active = 1
UNION ALL
SELECT
  'Total scan_logs (last 30 days)',
  COUNT(*)
FROM attendance_scan_logs
WHERE scan_date >= DATEADD(DAY, -30, GETDATE())
UNION ALL
SELECT
  'Distinct employee_code in scan_logs (30 days)',
  COUNT(DISTINCT COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')))
FROM attendance_scan_logs s
LEFT JOIN zkteco_hr_employee_map zm
  ON zm.machine_code = s.machine_code
 AND zm.zkteco_user_id = s.raw_device_user_id
 AND zm.is_active = 1
WHERE s.scan_date >= DATEADD(DAY, -30, GETDATE())
  AND COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')) IS NOT NULL
UNION ALL
SELECT
  'Distinct dates in scan_logs (30 days)',
  COUNT(DISTINCT CAST(scan_date AS DATE))
FROM attendance_scan_logs
WHERE scan_date >= DATEADD(DAY, -30, GETDATE());
GO

PRINT '';
PRINT '======================================================';
PRINT 'DIAGNOSTIC 5: Employees With Scan BUT Not Active';
PRINT '   Check: Apakah scan dari employee non-aktif masuk?';
PRINT '======================================================';
SELECT TOP 20
  s.raw_device_user_id,
  COALESCE(NULLIF(zm.hr_employee_code, ''), s.parsed_employee_code) AS mapped_emp_code,
  s.parsed_employee_code,
  zm.hr_employee_code,
  e.employee_code,
  e.employee_name,
  e.is_active AS employee_is_active,
  s.mapping_status,
  s.mapping_reason,
  COUNT(*) AS scan_count,
  MIN(s.scan_date) AS first_scan,
  MAX(s.scan_date) AS last_scan
FROM attendance_scan_logs s
LEFT JOIN zkteco_hr_employee_map zm
  ON zm.machine_code = s.machine_code
 AND zm.zkteco_user_id = s.raw_device_user_id
 AND zm.is_active = 1
LEFT JOIN employees e
  ON e.employee_code = COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, ''))
WHERE s.scan_date >= DATEADD(DAY, -30, GETDATE())
GROUP BY
  s.raw_device_user_id,
  COALESCE(NULLIF(zm.hr_employee_code, ''), s.parsed_employee_code),
  s.parsed_employee_code,
  zm.hr_employee_code,
  e.employee_code,
  e.employee_name,
  e.is_active,
  s.mapping_status,
  s.mapping_reason
HAVING e.is_active = 0 OR e.employee_code IS NULL
ORDER BY scan_count DESC;
GO

PRINT '';
PRINT '======================================================';
PRINT 'DIAGNOSTIC 6: Same Employee, Different Raw IDs Across Days';
PRINT '   Check: Apakah karyawan punya raw ID yang berbeda di hari yang berbeda?';
PRINT '======================================================';
SELECT TOP 30
  COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')) AS employee_code,
  COUNT(DISTINCT s.raw_device_user_id) AS distinct_raw_ids,
  STRING_AGG(DISTINCT s.raw_device_user_id, ', ') AS raw_id_list,
  STRING_AGG(DISTINCT CONVERT(VARCHAR, s.scan_date, 23), ', ') AS date_list,
  COUNT(*) AS total_scans
FROM attendance_scan_logs s
LEFT JOIN zkteco_hr_employee_map zm
  ON zm.machine_code = s.machine_code
 AND zm.zkteco_user_id = s.raw_device_user_id
 AND zm.is_active = 1
WHERE s.scan_date >= DATEADD(DAY, -30, GETDATE())
  AND COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')) IS NOT NULL
GROUP BY
  COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, ''))
HAVING COUNT(DISTINCT s.raw_device_user_id) > 1
ORDER BY distinct_raw_ids DESC;
GO

PRINT '';
PRINT '======================================================';
PRINT 'DIAGNOSTIC 7: Long Raw IDs Analysis (was thought to be the bug)';
PRINT '   Check: Apakah long ID menyebabkan data hilang?';
PRINT '======================================================';
SELECT
  s.raw_device_user_id,
  LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))) AS id_length,
  s.mapping_status,
  s.mapping_reason,
  COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')) AS mapped_emp_code,
  COUNT(*) AS scan_count,
  MIN(s.scan_date) AS first_scan,
  MAX(s.scan_date) AS last_scan,
  s.machine_code
FROM attendance_scan_logs s
LEFT JOIN zkteco_hr_employee_map zm
  ON zm.machine_code = s.machine_code
 AND zm.zkteco_user_id = s.raw_device_user_id
 AND zm.is_active = 1
WHERE s.scan_date >= DATEADD(DAY, -30, GETDATE())
  AND LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))) > 5
GROUP BY
  s.raw_device_user_id,
  LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))),
  s.mapping_status,
  s.mapping_reason,
  COALESCE(NULLIF(zm.hr_employee_code, ''), NULLIF(s.parsed_employee_code, '')),
  s.machine_code
ORDER BY scan_count DESC;
GO

PRINT '';
PRINT '======================================================';
PRINT 'DIAGNOSTIC 8: Sample Row from vw_attendance_monthly_matrix';
PRINT '   Check: Lihat sample data matrix untuk pola HADIR/NO_DATA';
PRINT '======================================================';
SELECT TOP 10
  employee_code,
  employee_name,
  attendance_date,
  final_status,
  source,
  final_check_in,
  final_check_out
FROM vw_attendance_monthly_matrix
WHERE attendance_date = CAST(GETDATE() AS DATE)
  AND employee_code IS NOT NULL
ORDER BY employee_code, attendance_date;
GO

PRINT '';
PRINT '======================================================';
PRINT 'SUMMARY: Scan Logs Counts by Mapping Status (last 30 days)';
PRINT '======================================================';
SELECT
  mapping_status,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT raw_device_user_id) AS distinct_raw_ids,
  COUNT(DISTINCT parsed_employee_code) AS distinct_parsed_codes
FROM attendance_scan_logs
WHERE scan_date >= DATEADD(DAY, -30, GETDATE())
GROUP BY mapping_status
ORDER BY total_rows DESC;
GO
