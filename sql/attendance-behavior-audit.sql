-- ============================================================================
-- ATTENDANCE BEHAVIOR AUDIT QUERIES
-- Comprehensive queries to detect attendance data anomalies
-- Run in SQL Server Management Studio (SSMS)
-- ============================================================================

PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'ATTENDANCE DATA BEHAVIOR AUDIT';
PRINT 'Generated: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '═══════════════════════════════════════════════════════════════════════';

-- ============================================================================
-- SECTION 1: ENTRY TIME ANOMALIES
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 1: ENTRY TIME ANOMALIES';
PRINT '═══════════════════════════════════════════════════════════════════════';

-- 1.1 Very Early Check-in (< 05:00)
PRINT '';
PRINT '--- 1.1 Very Early Check-in (< 05:00) ---';

SELECT TOP 50
    s.raw_device_user_id AS device_id,
    s.parsed_employee_code AS emp_code,
    e.emp_name AS emp_name,
    m.machine_code,
    m.machine_name,
    s.scan_date,
    s.scan_time,
    DATEPART(HOUR, s.scan_time) AS hour,
    'VERY_EARLY_CHECKIN' AS anomaly_type
FROM attendance_scan_logs s
LEFT JOIN mst_employee e ON e.emp_code = s.parsed_employee_code
LEFT JOIN mst_machine m ON m.machine_code = s.machine_code
WHERE DATEPART(HOUR, s.scan_time) < 5
    AND s.scan_date >= DATEADD(day, -30, GETDATE())
ORDER BY s.scan_date DESC, s.scan_time DESC;

-- 1.2 Very Late Check-in (> 12:00)
PRINT '';
PRINT '--- 1.2 Very Late Check-in (> 12:00) ---';

SELECT TOP 50
    s.raw_device_user_id AS device_id,
    s.parsed_employee_code AS emp_code,
    e.emp_name AS emp_name,
    m.machine_code,
    s.scan_date,
    s.scan_time,
    DATEPART(HOUR, s.scan_time) AS hour,
    'VERY_LATE_CHECKIN' AS anomaly_type
FROM attendance_scan_logs s
LEFT JOIN mst_employee e ON e.emp_code = s.parsed_employee_code
LEFT JOIN mst_machine m ON m.machine_code = s.machine_code
WHERE DATEPART(HOUR, s.scan_time) > 12
    AND s.scan_date >= DATEADD(day, -30, GETDATE())
ORDER BY s.scan_date DESC, s.scan_time DESC;

-- 1.3 Late Arrival (08:00 - 12:00) - Summary
PRINT '';
PRINT '--- 1.3 Late Arrival Summary (08:00 - 12:00) ---';

SELECT
    DATEPART(HOUR, scan_time) AS hour,
    COUNT(*) AS scan_count,
    COUNT(DISTINCT parsed_employee_code) AS unique_employees
FROM attendance_scan_logs
WHERE DATEPART(HOUR, scan_time) BETWEEN 8 AND 12
    AND scan_date >= DATEADD(day, -30, GETDATE())
GROUP BY DATEPART(HOUR, scan_time)
ORDER BY DATEPART(HOUR, scan_time);

-- 1.4 Very Late Night Scans (> 22:00)
PRINT '';
PRINT '--- 1.4 Very Late Night Scans (> 22:00) ---';

SELECT TOP 50
    s.raw_device_user_id AS device_id,
    s.parsed_employee_code AS emp_code,
    e.emp_name AS emp_name,
    m.machine_code,
    s.scan_date,
    s.scan_time,
    DATEPART(HOUR, s.scan_time) AS hour,
    'LATE_NIGHT_SCAN' AS anomaly_type
FROM attendance_scan_logs s
LEFT JOIN mst_employee e ON e.emp_code = s.parsed_employee_code
LEFT JOIN mst_machine m ON m.machine_code = s.machine_code
WHERE DATEPART(HOUR, s.scan_time) >= 22
    AND s.scan_date >= DATEADD(day, -30, GETDATE())
ORDER BY s.scan_date DESC, s.scan_time DESC;

-- ============================================================================
-- SECTION 2: MISSING CHECK-OUT / SINGLE SCAN
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 2: MISSING CHECK-OUT / SINGLE SCAN';
PRINT '═══════════════════════════════════════════════════════════════════════';

-- 2.1 Single Scan Records (Missing Check-out)
PRINT '';
PRINT '--- 2.1 Single Scan Records (Missing Check-out) ---';

SELECT TOP 50
    i.employee_code,
    e.emp_name,
    i.attendance_date,
    i.scan_count,
    i.check_in_at,
    i.check_out_at,
    i.attendance_status,
    DATEDIFF(MINUTE, i.check_in_at, GETDATE()) AS minutes_since_checkin
FROM attendance_imports i
LEFT JOIN mst_employee e ON e.emp_code = i.employee_code
WHERE i.scan_count = 1
    AND i.attendance_date >= DATEADD(day, -30, GETDATE())
ORDER BY i.attendance_date DESC;

-- 2.2 Summary by Day
PRINT '';
PRINT '--- 2.2 Single Scan Summary by Day ---';

SELECT
    attendance_date,
    COUNT(*) AS total_single_scan,
    COUNT(DISTINCT employee_code) AS unique_employees
FROM attendance_imports
WHERE scan_count = 1
    AND attendance_date >= DATEADD(day, -30, GETDATE())
GROUP BY attendance_date
ORDER BY attendance_date DESC;

-- 2.3 Employees with Most Single Scans
PRINT '';
PRINT '--- 2.3 Employees with Most Single Scans (Top 20) ---';

SELECT TOP 20
    employee_code,
    emp_name,
    COUNT(*) AS single_scan_count,
    MIN(attendance_date) AS first_occurrence,
    MAX(attendance_date) AS last_occurrence
FROM (
    SELECT i.employee_code, e.emp_name, i.attendance_date
    FROM attendance_imports i
    LEFT JOIN mst_employee e ON e.emp_code = i.employee_code
    WHERE i.scan_count = 1
        AND i.attendance_date >= DATEADD(day, -90, GETDATE())
) t
GROUP BY employee_code, emp_name
ORDER BY COUNT(*) DESC;

-- ============================================================================
-- SECTION 3: MULTI-LOCATION ATTENDANCE
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 3: MULTI-LOCATION ATTENDANCE';
PRINT '═══════════════════════════════════════════════════════════════════════';

-- 3.1 Multi-Location Summary (>= 2 machines)
PRINT '';
PRINT '--- 3.1 Multi-Location Summary (>= 2 machines per day) ---';

SELECT TOP 50
    employee_code,
    e.emp_name,
    attendance_date,
    machine_count,
    machine_list,
    scan_count,
    'MULTI_LOCATION' AS anomaly_type
FROM (
    SELECT
        i.employee_code,
        i.attendance_date,
        COUNT(DISTINCT i.machine_code) AS machine_count,
        STRING_AGG(i.machine_code, ', ') AS machine_list,
        SUM(i.scan_count) AS scan_count
    FROM attendance_imports i
    WHERE i.attendance_date >= DATEADD(day, -30, GETDATE())
    GROUP BY i.employee_code, i.attendance_date
    HAVING COUNT(DISTINCT i.machine_code) >= 2
) t
LEFT JOIN mst_employee e ON e.emp_code = t.employee_code
ORDER BY t.attendance_date DESC;

-- 3.2 Suspicious Travel (Same employee, different machines, short time)
PRINT '';
PRINT '--- 3.2 Suspicious Travel Pattern ---';

WITH ScanPairs AS (
    SELECT
        s1.employee_code,
        s1.scan_date,
        s1.machine_code AS machine_a,
        s1.scan_time AS time_a,
        s2.machine_code AS machine_b,
        s2.scan_time AS time_b,
        DATEDIFF(MINUTE, s1.scan_time, s2.scan_time) AS minutes_diff
    FROM (
        SELECT employee_code, machine_code, scan_date, scan_time,
               ROW_NUMBER() OVER (PARTITION BY employee_code, scan_date ORDER BY scan_time) AS rn
        FROM attendance_imports
        WHERE attendance_date >= DATEADD(day, -30, GETDATE())
    ) s1
    JOIN (
        SELECT employee_code, machine_code, scan_date, scan_time,
               ROW_NUMBER() OVER (PARTITION BY employee_code, scan_date ORDER BY scan_time) AS rn
        FROM attendance_imports
        WHERE attendance_date >= DATEADD(day, -30, GETDATE())
    ) s2 ON s1.employee_code = s2.employee_code
        AND s1.scan_date = s2.scan_date
        AND s2.rn = s1.rn + 1
    WHERE s1.machine_code <> s2.machine_code
)
SELECT TOP 50
    employee_code,
    scan_date,
    machine_a,
    machine_b,
    time_a,
    time_b,
    minutes_diff,
    'SUSPICIOUS_TRAVEL' AS anomaly_type
FROM ScanPairs
WHERE minutes_diff < 15  -- Less than 15 minutes between different machines
ORDER BY scan_date DESC;

-- 3.3 Cross-Division Scan Detection
PRINT '';
PRINT '--- 3.3 Cross-Division Scans (By Employee Prefix) ---';

SELECT
    scan_machine AS [Scan Location],
    emp_prefix AS [Employee Home],
    CASE emp_prefix
        WHEN 'A' THEN 'P1A'
        WHEN 'B' THEN 'P1B'
        WHEN 'C' THEN 'P2A'
        WHEN 'D' THEN 'P2B'
        WHEN 'E' THEN 'DME'
        WHEN 'F' THEN 'ARA'
        WHEN 'G' THEN 'AB1'
        WHEN 'H' THEN 'AB2'
        WHEN 'J' THEN 'ARC'
    END AS [Home Division],
    COUNT(*) AS [Scan Count],
    COUNT(DISTINCT employee_code) AS [Unique Employees]
FROM (
    SELECT
        i.machine_code AS scan_machine,
        LEFT(i.employee_code, 1) AS emp_prefix,
        i.employee_code,
        i.attendance_date
    FROM attendance_imports i
    WHERE i.attendance_date >= DATEADD(day, -30, GETDATE())
        AND LEFT(i.employee_code, 1) IN ('A','B','C','D','E','F','G','H','J')
) t
GROUP BY scan_machine, emp_prefix
ORDER BY scan_machine, COUNT(*) DESC;

-- ============================================================================
-- SECTION 4: EXCESSIVE / UNUSUAL SCAN COUNTS
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 4: EXCESSIVE / UNUSUAL SCAN COUNTS';
PRINT '═══════════════════════════════════════════════════════════════════════';

-- 4.1 Excessive Scans (> 10 per day)
PRINT '';
PRINT '--- 4.1 Excessive Scans (> 10 per day) ---';

SELECT TOP 50
    i.employee_code,
    e.emp_name,
    i.attendance_date,
    i.machine_code,
    i.scan_count,
    'EXCESSIVE_SCANS' AS anomaly_type
FROM attendance_imports i
LEFT JOIN mst_employee e ON e.emp_code = i.employee_code
WHERE i.scan_count > 10
    AND i.attendance_date >= DATEADD(day, -30, GETDATE())
ORDER BY i.scan_count DESC, i.attendance_date DESC;

-- 4.2 Zero Scans (No attendance)
PRINT '';
PRINT '--- 4.2 Days with Zero Attendance ---';

SELECT TOP 50
    e.employee_code,
    e.emp_name,
    d.missing_date AS attendance_date,
    'NO_CHECKIN' AS anomaly_type
FROM mst_employee e
CROSS JOIN (
    SELECT DISTINCT attendance_date AS missing_date
    FROM attendance_imports
    WHERE attendance_date >= DATEADD(day, -30, GETDATE())
) d
WHERE NOT EXISTS (
    SELECT 1 FROM attendance_imports i
    WHERE i.employee_code = e.employee_code
        AND i.attendance_date = d.missing_date
)
ORDER BY d.missing_date DESC, e.employee_code;

-- ============================================================================
-- SECTION 5: WEEKEND / HOLIDAY ATTENDANCE
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 5: WEEKEND / HOLIDAY ATTENDANCE';
PRINT '═══════════════════════════════════════════════════════════════════════';

-- 5.1 Weekend Attendance
PRINT '';
PRINT '--- 5.1 Weekend Attendance (Saturday & Sunday) ---';

SELECT TOP 50
    i.employee_code,
    e.emp_name,
    i.attendance_date,
    DATENAME(WEEKDAY, i.attendance_date) AS day_name,
    i.machine_code,
    i.check_in_at,
    i.check_out_at,
    'WEEKEND_ATTENDANCE' AS anomaly_type
FROM attendance_imports i
LEFT JOIN mst_employee e ON e.emp_code = i.employee_code
WHERE DATEPART(WEEKDAY, i.attendance_date) IN (1, 7)  -- Sunday=1, Saturday=7
    AND i.is_holiday = 0
    AND i.attendance_date >= DATEADD(day, -30, GETDATE())
ORDER BY i.attendance_date DESC;

-- 5.2 Weekend vs Weekday Attendance Ratio
PRINT '';
PRINT '--- 5.2 Weekend vs Weekday Attendance Ratio (Last 30 days) ---';

WITH AttendanceType AS (
    SELECT
        CASE WHEN DATEPART(WEEKDAY, attendance_date) IN (1, 7) THEN 'Weekend' ELSE 'Weekday' END AS day_type,
        COUNT(DISTINCT employee_code) AS present_employees,
        COUNT(*) AS total_records
    FROM attendance_imports
    WHERE attendance_date >= DATEADD(day, -30, GETDATE())
    GROUP BY CASE WHEN DATEPART(WEEKDAY, attendance_date) IN (1, 7) THEN 'Weekend' ELSE 'Weekday' END
)
SELECT * FROM AttendanceType;

-- ============================================================================
-- SECTION 6: WORK HOURS ANALYSIS
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 6: WORK HOURS ANALYSIS';
PRINT '═══════════════════════════════════════════════════════════════════════';

-- 6.1 Very Short Work Days (< 4 hours)
PRINT '';
PRINT '--- 6.1 Very Short Work Days (< 4 hours) ---';

SELECT TOP 50
    i.employee_code,
    e.emp_name,
    i.attendance_date,
    i.check_in_at,
    i.check_out_at,
    CAST(i.check_out_at - i.check_in_at AS FLOAT) * 24 AS work_hours,
    'SHORT_WORKDAY' AS anomaly_type
FROM attendance_imports i
LEFT JOIN mst_employee e ON e.emp_code = i.employee_code
WHERE i.check_in_at IS NOT NULL
    AND i.check_out_at IS NOT NULL
    AND CAST(i.check_out_at - i.check_in_at AS FLOAT) * 24 < 4
    AND i.attendance_date >= DATEADD(day, -30, GETDATE())
ORDER BY work_hours ASC, i.attendance_date DESC;

-- 6.2 Very Long Work Days (> 12 hours)
PRINT '';
PRINT '--- 6.2 Very Long Work Days (> 12 hours) ---';

SELECT TOP 50
    i.employee_code,
    e.emp_name,
    i.attendance_date,
    i.check_in_at,
    i.check_out_at,
    CAST(i.check_out_at - i.check_in_at AS FLOAT) * 24 AS work_hours,
    'LONG_WORKDAY' AS anomaly_type
FROM attendance_imports i
LEFT JOIN mst_employee e ON e.emp_code = i.employee_code
WHERE i.check_in_at IS NOT NULL
    AND i.check_out_at IS NOT NULL
    AND CAST(i.check_out_at - i.check_in_at AS FLOAT) * 24 > 12
    AND i.attendance_date >= DATEADD(day, -30, GETDATE())
ORDER BY work_hours DESC, i.attendance_date DESC;

-- 6.3 Work Hours Distribution
PRINT '';
PRINT '--- 6.3 Work Hours Distribution ---';

SELECT
    CASE
        WHEN work_hours < 4 THEN '< 4 hours'
        WHEN work_hours BETWEEN 4 AND 6 THEN '4-6 hours'
        WHEN work_hours BETWEEN 6 AND 8 THEN '6-8 hours'
        WHEN work_hours BETWEEN 8 AND 10 THEN '8-10 hours'
        WHEN work_hours BETWEEN 10 AND 12 THEN '10-12 hours'
        ELSE '> 12 hours'
    END AS hours_range,
    COUNT(*) AS record_count
FROM (
    SELECT
        i.employee_code,
        i.attendance_date,
        CAST(i.check_out_at - i.check_in_at AS FLOAT) * 24 AS work_hours
    FROM attendance_imports i
    WHERE i.check_in_at IS NOT NULL
        AND i.check_out_at IS NOT NULL
        AND i.attendance_date >= DATEADD(day, -30, GETDATE())
) t
GROUP BY
    CASE
        WHEN work_hours < 4 THEN '< 4 hours'
        WHEN work_hours BETWEEN 4 AND 6 THEN '4-6 hours'
        WHEN work_hours BETWEEN 6 AND 8 THEN '6-8 hours'
        WHEN work_hours BETWEEN 8 AND 10 THEN '8-10 hours'
        WHEN work_hours BETWEEN 10 AND 12 THEN '10-12 hours'
        ELSE '> 12 hours'
    END
ORDER BY
    CASE
        WHEN work_hours_range LIKE '<%' THEN 1
        WHEN work_hours_range LIKE '4%' THEN 2
        WHEN work_hours_range LIKE '6%' THEN 3
        WHEN work_hours_range LIKE '8%' THEN 4
        WHEN work_hours_range LIKE '10%' THEN 5
        ELSE 6
    END;

-- ============================================================================
-- SECTION 7: DUPLICATE / SUSPICIOUS SCANS
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 7: DUPLICATE / SUSPICIOUS SCANS';
PRINT '═══════════════════════════════════════════════════════════════════════';

-- 7.1 Exact Duplicate Scans (same employee, same time, same machine)
PRINT '';
PRINT '--- 7.1 Exact Duplicate Scans ---';

SELECT TOP 50
    raw_device_user_id,
    machine_code,
    scan_date,
    scan_time,
    COUNT(*) AS duplicate_count,
    'EXACT_DUPLICATE' AS anomaly_type
FROM attendance_scan_logs
WHERE scan_date >= DATEADD(day, -30, GETDATE())
GROUP BY raw_device_user_id, machine_code, scan_date, scan_time
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, scan_date DESC;

-- 7.2 Rapid Successive Scans (< 1 minute apart)
PRINT '';
PRINT '--- 7.2 Rapid Successive Scans (< 1 minute) ---';

WITH RapidScans AS (
    SELECT
        raw_device_user_id,
        machine_code,
        scan_date,
        scan_time,
        LAG(scan_time) OVER (PARTITION BY raw_device_user_id, scan_date ORDER BY scan_time) AS prev_time,
        DATEDIFF(SECOND, LAG(scan_time) OVER (PARTITION BY raw_device_user_id, scan_date ORDER BY scan_time), scan_time) AS seconds_diff
    FROM attendance_scan_logs
    WHERE scan_date >= DATEADD(day, -30, GETDATE())
)
SELECT TOP 50
    raw_device_user_id,
    machine_code,
    scan_date,
    scan_time,
    prev_time,
    seconds_diff,
    'RAPID_SCAN' AS anomaly_type
FROM RapidScans
WHERE seconds_diff < 60
ORDER BY seconds_diff ASC, scan_date DESC;

-- ============================================================================
-- SECTION 8: SUMMARY DASHBOARD
-- ============================================================================

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'SECTION 8: SUMMARY DASHBOARD';
PRINT '═══════════════════════════════════════════════════════════════════════';

-- Summary Statistics
PRINT '';
PRINT '--- Anomaly Summary (Last 30 Days) ---';

SELECT
    'Total Attendance Records' AS metric,
    COUNT(*) AS value
FROM attendance_imports
WHERE attendance_date >= DATEADD(day, -30, GETDATE())
UNION ALL
SELECT
    'Employees with Single Scans',
    COUNT(DISTINCT employee_code)
FROM attendance_imports
WHERE scan_count = 1
    AND attendance_date >= DATEADD(day, -30, GETDATE())
UNION ALL
SELECT
    'Multi-Location Days',
    COUNT(*)
FROM (
    SELECT employee_code, attendance_date
    FROM attendance_imports
    WHERE attendance_date >= DATEADD(day, -30, GETDATE())
    GROUP BY employee_code, attendance_date
    HAVING COUNT(DISTINCT machine_code) >= 2
) t
UNION ALL
SELECT
    'Very Early Check-ins (< 5 AM)',
    COUNT(*)
FROM attendance_scan_logs
WHERE DATEPART(HOUR, scan_time) < 5
    AND scan_date >= DATEADD(day, -30, GETDATE())
UNION ALL
SELECT
    'Very Late Check-ins (> 12 PM)',
    COUNT(*)
FROM attendance_scan_logs
WHERE DATEPART(HOUR, scan_time) > 12
    AND scan_date >= DATEADD(day, -30, GETDATE());

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════════════';
PRINT 'END OF ATTENDANCE BEHAVIOR AUDIT';
PRINT '═══════════════════════════════════════════════════════════════════════';
