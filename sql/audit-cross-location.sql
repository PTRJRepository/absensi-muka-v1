-- ============================================================================
-- CROSS-LOCATION ATTENDANCE AUDIT QUERIES
-- Run in SQL Server Management Studio (SSMS)
-- ============================================================================

-- ============================================================================
-- QUERY 1: Prefix Distribution by Machine (Last 7 Days)
-- ============================================================================
PRINT '═══════════════════════════════════════════════════════════════';
PRINT 'QUERY 1: Prefix Distribution by Machine';
PRINT '═══════════════════════════════════════════════════════════════';

SELECT
    s.machine_code,
    LEFT(s.parsed_employee_code, 1) AS emp_prefix,
    CASE LEFT(s.parsed_employee_code, 1)
        WHEN 'A' THEN 'P1A'
        WHEN 'B' THEN 'P1B'
        WHEN 'C' THEN 'P2A'
        WHEN 'D' THEN 'P2B'
        WHEN 'E' THEN 'DME'
        WHEN 'F' THEN 'ARA'
        WHEN 'G' THEN 'AB1'
        WHEN 'H' THEN 'AB2'
        WHEN 'J' THEN 'ARC'
        WHEN 'L' THEN 'IJL/PGE'
        ELSE 'Unknown'
    END AS home_division,
    COUNT(*) AS scan_count
FROM attendance_scan_logs s
WHERE s.parsed_employee_code IS NOT NULL
    AND LEFT(s.parsed_employee_code, 1) IN ('A','B','C','D','E','F','G','H','J','L')
    AND s.scan_date >= DATEADD(day, -7, GETDATE())
GROUP BY s.machine_code, LEFT(s.parsed_employee_code, 1)
ORDER BY s.machine_code, COUNT(*) DESC;

-- ============================================================================
-- QUERY 2: Cross-Location Employees (Who scanned at wrong machine)
-- ============================================================================
PRINT '';
PRINT '═══════════════════════════════════════════════════════════════';
PRINT 'QUERY 2: Cross-Location Employees';
PRINT '═══════════════════════════════════════════════════════════════';

SELECT
    s.machine_code AS [Wrong Machine],
    s.parsed_employee_code AS [Employee Code],
    e.emp_name AS [Employee Name],
    LEFT(s.parsed_employee_code, 1) AS [Emp Prefix],
    CASE LEFT(s.parsed_employee_code, 1)
        WHEN 'A' THEN 'P1A'
        WHEN 'B' THEN 'P1B'
        WHEN 'C' THEN 'P2A'
        WHEN 'D' THEN 'P2B'
        WHEN 'E' THEN 'DME'
        WHEN 'F' THEN 'ARA'
        WHEN 'G' THEN 'AB1'
        WHEN 'H' THEN 'AB2'
        WHEN 'J' THEN 'ARC'
        WHEN 'L' THEN 'IJL/PGE'
        ELSE 'Unknown'
    END AS [Home Division],
    COUNT(*) AS [Total Scans],
    MIN(s.scan_date) AS [First Scan],
    MAX(s.scan_date) AS [Last Scan]
FROM attendance_scan_logs s
LEFT JOIN mst_employee e ON e.emp_code = s.parsed_employee_code
WHERE s.parsed_employee_code IS NOT NULL
    -- Exclude correct combinations
    AND NOT (s.machine_code = 'P1A' AND LEFT(s.parsed_employee_code, 1) = 'A')
    AND NOT (s.machine_code = 'P1B' AND LEFT(s.parsed_employee_code, 1) = 'B')
    AND NOT (s.machine_code LIKE 'P2A%' AND LEFT(s.parsed_employee_code, 1) = 'C')
    AND NOT (s.machine_code = 'P2B' AND LEFT(s.parsed_employee_code, 1) = 'D')
    AND NOT (s.machine_code LIKE 'DME%' AND LEFT(s.parsed_employee_code, 1) = 'E')
    AND NOT (s.machine_code = 'ARA' AND LEFT(s.parsed_employee_code, 1) = 'F')
    AND NOT (s.machine_code = 'AB1' AND LEFT(s.parsed_employee_code, 1) = 'G')
    AND NOT (s.machine_code = 'AB2' AND LEFT(s.parsed_employee_code, 1) = 'H')
    AND NOT (s.machine_code LIKE 'ARC%' AND LEFT(s.parsed_employee_code, 1) = 'J')
    AND NOT (LEFT(s.parsed_employee_code, 1) IN ('A','B','C','D','E','F','G','H','J')
        AND s.machine_code IN ('IJL','OFFICE_PGE','OFFICE_APE','MILL'))
GROUP BY
    s.machine_code,
    s.parsed_employee_code,
    e.emp_name,
    LEFT(s.parsed_employee_code, 1)
ORDER BY s.machine_code, COUNT(*) DESC;

-- ============================================================================
-- QUERY 3: Summary by Machine (Quick Status Check)
-- ============================================================================
PRINT '';
PRINT '═══════════════════════════════════════════════════════════════';
PRINT 'QUERY 3: Machine Status Summary';
PRINT '═══════════════════════════════════════════════════════════════';

WITH PrefixCounts AS (
    SELECT
        s.machine_code,
        LEFT(s.parsed_employee_code, 1) AS emp_prefix,
        COUNT(*) AS scan_count
    FROM attendance_scan_logs s
    WHERE s.parsed_employee_code IS NOT NULL
        AND LEFT(s.parsed_employee_code, 1) IN ('A','B','C','D','E','F','G','H','J','L')
        AND s.scan_date >= DATEADD(day, -7, GETDATE())
    GROUP BY s.machine_code, LEFT(s.parsed_employee_code, 1)
),
MachineSummary AS (
    SELECT
        machine_code,
        COUNT(DISTINCT emp_prefix) AS prefix_count,
        SUM(scan_count) AS total_scans,
        STRING_AGG(emp_prefix + '(' + CAST(scan_count AS VARCHAR) + ')', ', ') AS prefix_details
    FROM PrefixCounts
    GROUP BY machine_code
)
SELECT
    m.machine_code AS [Machine],
    ISNULL(ms.prefix_count, 0) AS [Prefix Count],
    CASE
        WHEN m.scanner_code = 100 THEN 'A'
        WHEN m.scanner_code = 200 THEN 'J'
        WHEN m.scanner_code = 300 THEN 'B'
        WHEN m.scanner_code = 400 THEN 'H'
        WHEN m.scanner_code = 500 THEN 'C'
        WHEN m.scanner_code = 600 THEN 'D'
        WHEN m.scanner_code = 700 THEN 'E'
        WHEN m.scanner_code = 800 THEN 'F'
        WHEN m.scanner_code = 900 THEN 'G'
        ELSE 'N/A'
    END AS [Expected Prefix],
    ISNULL(ms.total_scans, 0) AS [Total Scans],
    ISNULL(ms.prefix_details, 'No data') AS [Prefix Distribution],
    CASE
        WHEN ISNULL(ms.prefix_count, 0) > 1 THEN '❌ MIXED'
        WHEN ISNULL(ms.prefix_count, 0) = 0 THEN '⚪ NO DATA'
        ELSE '✅ OK'
    END AS [Status]
FROM mst_machine m
LEFT JOIN MachineSummary ms ON ms.machine_code = m.machine_code
WHERE m.is_active = 1
ORDER BY m.machine_code;

-- ============================================================================
-- QUERY 4: Detailed employees at P1B (Specific Issue)
-- ============================================================================
PRINT '';
PRINT '═══════════════════════════════════════════════════════════════';
PRINT 'QUERY 4: P1B Machine - All Employee Prefixes';
PRINT '═══════════════════════════════════════════════════════════════';

SELECT
    LEFT(s.parsed_employee_code, 1) AS [Prefix],
    CASE LEFT(s.parsed_employee_code, 1)
        WHEN 'A' THEN 'P1A'
        WHEN 'B' THEN 'P1B'
        WHEN 'C' THEN 'P2A'
        WHEN 'D' THEN 'P2B'
        WHEN 'E' THEN 'DME'
        WHEN 'F' THEN 'ARA'
        WHEN 'G' THEN 'AB1'
        WHEN 'H' THEN 'AB2'
        WHEN 'J' THEN 'ARC'
        WHEN 'L' THEN 'IJL/PGE'
        ELSE 'Unknown'
    END AS [Home Division],
    COUNT(DISTINCT s.parsed_employee_code) AS [Unique Employees],
    COUNT(*) AS [Total Scans]
FROM attendance_scan_logs s
WHERE s.machine_code = 'P1B'
    AND s.parsed_employee_code IS NOT NULL
    AND LEFT(s.parsed_employee_code, 1) IN ('A','B','C','D','E','F','G','H','J','L')
GROUP BY LEFT(s.parsed_employee_code, 1)
ORDER BY COUNT(*) DESC;

-- ============================================================================
-- QUERY 5: Find specific employees at P1B (P2A employees C-prefix)
-- ============================================================================
PRINT '';
PRINT '═══════════════════════════════════════════════════════════════';
PRINT 'QUERY 5: C-Prefix (P2A) Employees at P1B';
PRINT '═══════════════════════════════════════════════════════════════';

SELECT TOP 20
    s.parsed_employee_code AS [Employee Code],
    e.emp_name AS [Employee Name],
    COUNT(*) AS [Total Scans],
    MIN(s.scan_date) AS [First Scan],
    MAX(s.scan_date) AS [Last Scan]
FROM attendance_scan_logs s
LEFT JOIN mst_employee e ON e.emp_code = s.parsed_employee_code
WHERE s.machine_code = 'P1B'
    AND LEFT(s.parsed_employee_code, 1) = 'C'  -- P2A prefix
GROUP BY s.parsed_employee_code, e.emp_name
ORDER BY COUNT(*) DESC;

-- ============================================================================
-- QUERY 6: A-Prefix (P1A) Employees at P1B
-- ============================================================================
PRINT '';
PRINT '═══════════════════════════════════════════════════════════════';
PRINT 'QUERY 6: A-Prefix (P1A) Employees at P1B';
PRINT '═══════════════════════════════════════════════════════════════';

SELECT TOP 20
    s.parsed_employee_code AS [Employee Code],
    e.emp_name AS [Employee Name],
    COUNT(*) AS [Total Scans],
    MIN(s.scan_date) AS [First Scan],
    MAX(s.scan_date) AS [Last Scan]
FROM attendance_scan_logs s
LEFT JOIN mst_employee e ON e.emp_code = s.parsed_employee_code
WHERE s.machine_code = 'P1B'
    AND LEFT(s.parsed_employee_code, 1) = 'A'  -- P1A prefix
GROUP BY s.parsed_employee_code, e.emp_name
ORDER BY COUNT(*) DESC;

PRINT '';
PRINT '═══════════════════════════════════════════════════════════════';
PRINT 'END OF AUDIT QUERIES';
PRINT '═══════════════════════════════════════════════════════════════';
