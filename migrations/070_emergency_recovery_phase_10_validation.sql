-- ============================================================
-- [PHASE 10] API & FRONTEND VALIDATION
-- ============================================================
-- Prerequisites: Phase 9 complete, backend rebuilt
-- ============================================================

PRINT '=== [PHASE 10] API & FRONTEND VALIDATION ===';

-- ============================================================
-- 10A: Backend built?
-- ============================================================
PRINT '';
PRINT '  [10A] Verify backend build...';
-- Run: npm run build
-- Expected: No TypeScript errors
-- If error: Check sync-orchestrator.service.ts COALESCE fix

-- ============================================================
-- 10B: Test API endpoints
-- ============================================================
PRINT '';
PRINT '  [10B] API Tests (run via curl or browser):';
PRINT '';
PRINT '  TEST 1: Monthly Matrix API';
PRINT '    GET http://localhost:3000/api/attendance/monthly-matrix?year=2026&month=6';
PRINT '    Expected: 200 OK, data array with rows > 0';
PRINT '    Expected: Each row has employee_code, attendance cells, statuses';
PRINT '';

-- Show current matrix readiness
DECLARE @import_count BIGINT = (SELECT COUNT(*) FROM attendance_imports);
DECLARE @employee_count INT = (SELECT COUNT(DISTINCT employee_code) FROM attendance_imports);
PRINT '    Database readiness: ' + CAST(@import_count AS VARCHAR) + ' imports for ' + CAST(@employee_count AS VARCHAR) + ' employees';

IF @import_count = 0
BEGIN
    PRINT '    WARNING: No attendance_imports. Rebuild may have failed.';
    PRINT '    Check: Did employees table get populated in Phase 2?';
    SELECT TOP 5 employee_code FROM employees ORDER BY employee_code;
END

PRINT '';
PRINT '  TEST 2: Cell Detail API';
PRINT '    GET http://localhost:3000/api/attendance/monthly-matrix/cell?employeeCode=B0193&date=2026-06-03';
PRINT '    Expected: response includes zkteco_user_name, time_correction_status, source = ZKTECO';
PRINT '';

-- Show B0193 status
IF OBJECT_ID('tempdb..#b0193') IS NOT NULL DROP TABLE #b0193;
SELECT TOP 5
    ai.employee_code,
    ai.attendance_date,
    ai.check_in_at,
    ai.check_out_at,
    ai.attendance_status,
    sl.scan_time AS earliest_scan,
    sl.scan_time_wib
INTO #b0193
FROM attendance_imports ai
LEFT JOIN attendance_scan_logs sl ON sl.id = ai.raw_scan_log_id
WHERE ai.employee_code = 'B0193'
ORDER BY ai.attendance_date DESC;

DECLARE @b0193_count INT = (SELECT COUNT(*) FROM #b0193);
IF @b0193_count > 0
BEGIN
    PRINT '    B0193 found: ' + CAST(@b0193_count AS VARCHAR) + ' attendance records';
    SELECT * FROM #b0193;
END
ELSE
    PRINT '    B0193 NOT FOUND in attendance_imports';

DROP TABLE #b0193;

PRINT '';
PRINT '  TEST 3: Employee API';
PRINT '    GET http://localhost:3000/api/employees';
PRINT '    Expected: 200 OK, employees array with names';
PRINT '';
PRINT '    Current employees: ' + CAST(@employee_count AS VARCHAR);
SELECT TOP 5 LEFT(employee_code, 1) AS division, COUNT(*) AS total
FROM employees
GROUP BY LEFT(employee_code, 1)
ORDER BY division;

PRINT '';
PRINT '  TEST 4: Machine Status API';
PRINT '    GET http://localhost:3000/api/machines';
PRINT '    Expected: 200 OK, machines array';
PRINT '    Current machines: ' + CAST((SELECT COUNT(*) FROM attendance_machines) AS VARCHAR);

-- ============================================================
-- 10C: Frontend validation
-- ============================================================
PRINT '';
PRINT '  [10C] Frontend Validation Checklist:';
PRINT '';
PRINT '  Open: http://localhost:5173 (or production URL)';
PRINT '';
PRINT '  Step 1: Navigate to Attendance Matrix';
PRINT '    - Select Year: 2026, Month: 6';
PRINT '    - Select Division: (All or specific)';
PRINT '    - Check: Does the matrix show data rows?';
PRINT '    - Check: Do employee names display correctly?';
PRINT '    - Check: Are there null/undefined/NaN values?';
PRINT '';
PRINT '  Step 2: Click a cell with attendance';
PRINT '    - Check: Cell detail drawer shows:';
PRINT '      - Employee name (HR name or ZKTeco name)';
PRINT '      - Check-in / Check-out times in WIB';
PRINT '      - Source: ZKTECO';
PRINT '      - scan_count > 0';
PRINT '';
PRINT '  Step 3: Check different divisions';
PRINT '    - Try: A, B, C, D, E, F, G, H, J, L';
PRINT '    - All divisions should appear in the employee list';
PRINT '';

-- Division check in imports
PRINT '  Division distribution in attendance_imports:';
SELECT
    LEFT(employee_code, 1) AS division,
    COUNT(*) AS total_records,
    COUNT(DISTINCT employee_code) AS unique_employees
FROM attendance_imports
GROUP BY LEFT(employee_code, 1)
ORDER BY division;

-- ============================================================
-- 10D: Quick API test via SQL
-- ============================================================
PRINT '';
PRINT '  [10D] Simulated API check (from DB):';
PRINT '';

-- Simulate what the monthly matrix API would return
PRINT '    Sample matrix rows (what API would return):';
SELECT TOP 20
    ai.employee_code,
    e.employee_name,
    LEFT(ai.employee_code, 1) AS division,
    COUNT(*) AS days_present,
    SUM(CASE WHEN ai.attendance_status = 'HADIR' THEN 1 ELSE 0 END) AS hadir,
    SUM(CASE WHEN ai.attendance_status = 'INCOMPLETE_SCAN' THEN 1 ELSE 0 END) AS incomplete,
    SUM(CASE WHEN ai.attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END) AS tidak_hadir
FROM attendance_imports ai
LEFT JOIN employees e ON e.employee_code = ai.employee_code
WHERE ai.attendance_year = 2026 AND ai.attendance_month = 6
GROUP BY ai.employee_code, e.employee_name
ORDER BY days_present DESC;

PRINT '';
PRINT '  [10D.2] Scan logs provenance (what cell detail would show):';
SELECT TOP 5
    sl.parsed_employee_code,
    sl.machine_code,
    sl.raw_device_user_id,
    sl.zkteco_user_name,
    sl.zkteco_user_name_source,
    sl.time_correction_status,
    sl.scan_time,
    sl.scan_time_wib,
    sl.scan_date
FROM attendance_scan_logs sl
WHERE sl.zkteco_user_name IS NOT NULL
  AND sl.zkteco_user_name_source = 'MACHINE_USER_RAW'
ORDER BY sl.scan_time DESC;

PRINT '';
PRINT '[PHASE 10] COMPLETE. Fix any issues found before Phase 11.';
PRINT 'GO';

