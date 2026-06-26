USE rebinmas_absensi_monitoring;
GO

-- =============================================================================
-- PROBLEM: employees.employee_code is in IT API format ("0010001")
--          attendance_scan_logs uses ZKTeco format ("L10086")
--          They don't match!
--
-- SOLUTION: Update employees.employee_code to ZKTeco format using loc_code mapping
-- =============================================================================

-- Step 1: Show current state - mismatched formats
PRINT '=== Current State ===';

-- Show sample employees with their divisions
SELECT TOP 10 e.employee_code, e.employee_name, d.division_code, m.loc_code
FROM employees e
JOIN divisions d ON d.id = e.division_id
LEFT JOIN attendance_machines m ON m.division_code = d.division_code AND m.loc_code IS NOT NULL
ORDER BY e.employee_code;

-- Step 2: Create temporary mapping table based on raw_device_user_id patterns
-- If raw_device_user_id is numeric like "10086" and loc_code is "L", then ZKTeco code is "L10086"
-- If raw_device_user_id is IT API format like "0010011", strip leading zeros and add loc_code

PRINT '=== Creating ZKTeco employee codes ===';

-- For employees with matching scan logs (numeric raw IDs)
;WITH ScanMapping AS (
  SELECT DISTINCT
    LTRIM(RTRIM(s.raw_device_user_id)) AS raw_id,
    m.loc_code,
    'ZKTECO_' + m.loc_code + LTRIM(RTRIM(s.raw_device_user_id)) AS zkteco_code
  FROM attendance_scan_logs s
  JOIN attendance_machines m ON m.machine_code = s.machine_code
  WHERE ISNUMERIC(LTRIM(RTRIM(s.raw_device_user_id))) = 1
    AND LEN(LTRIM(RTRIM(s.raw_device_user_id))) >= 4
)
SELECT * FROM ScanMapping WHERE zkteco_code IN (
  SELECT zkteco_code FROM ScanMapping GROUP BY zkteco_code HAVING COUNT(*) = 1
) ORDER BY raw_id;

-- Step 3: Update employees with explicit ZKTeco codes from scan logs
-- This uses the numeric raw IDs that successfully parsed
PRINT '=== Updating employees with ZKTeco codes from scan logs ===';

BEGIN TRANSACTION;

-- Create temp table with the mapping
IF OBJECT_ID('tempdb..#ZktecoMapping') IS NOT NULL DROP TABLE #ZktecoMapping;

SELECT
  e.id AS employee_id,
  e.employee_code AS old_code,
  e.employee_name,
  d.division_code,
  m.loc_code,
  -- Generate ZKTeco code: loc_code + raw_device_user_id (last digits)
  'ZKTECO_' + m.loc_code + RIGHT('00000' + SUBSTRING(e.employee_code, 3, 5), 5) AS new_zkteco_code
INTO #ZktecoMapping
FROM employees e
JOIN divisions d ON d.id = e.division_id
LEFT JOIN attendance_machines m ON m.division_code = d.division_code
WHERE m.loc_code IS NOT NULL;

-- Show the mapping
SELECT * FROM #ZktecoMapping ORDER BY old_code;

-- Update employees table
UPDATE e
SET e.employee_code = zk.new_zkteco_code
FROM employees e
JOIN #ZktecoMapping zk ON zk.employee_id = e.id;

-- Verify the update
SELECT TOP 20 employee_code, employee_name, division_id
FROM employees
WHERE employee_code LIKE 'ZKTECO_%'
ORDER BY employee_code;

PRINT 'Updated employees to ZKTECO format';
ROLLBACK TRANSACTION; -- Rollback for safety - run with COMMIT in production

-- Step 4: Alternative - Simple format update without scan log reference
-- Just add loc_code prefix based on division
PRINT '=== Alternative: Simple format update ===';

BEGIN TRANSACTION;

;WITH DivLoc AS (
  SELECT division_code, loc_code
  FROM attendance_machines
  WHERE loc_code IS NOT NULL
)
UPDATE e
SET e.employee_code = dl.loc_code + RIGHT('00000' + SUBSTRING(e.employee_code, 3, 5), 5)
FROM employees e
JOIN divisions d ON d.id = e.division_id
JOIN DivLoc dl ON dl.division_code = d.division_code
WHERE d.division_code IN ('IJL', 'PGE', 'P1A', 'P1B', 'P2A', 'P2B', 'AB1', 'AB2', 'ARA', 'DME', 'ARC');

SELECT TOP 20 employee_code, employee_name, division_id
FROM employees
ORDER BY employee_code;

PRINT 'Simple format update completed';
ROLLBACK TRANSACTION;

GO
