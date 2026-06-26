-- ============================================================
-- FIX: Rescue UNMAPPED scan logs via direct employee lookup
-- ============================================================
-- ROOT CAUSE: 
-- 1. Employee codes like 9xxxxxx (159K records) are FULL employee codes
--    but mapper regex only accepts ^\d{1,6}$ — rejects them as "too long"
-- 2. 7-digit codes like 0010106, 1000001 are also employee codes
--    but regex rejects them as "too long" 
-- 3. The 9xxxx codes ARE valid employee codes in the employees table
--    they just need a direct lookup BEFORE the prefix logic
--
-- STRATEGY:
-- For UNMAPPED records where raw_device_user_id = employee_code,
-- UPDATE parsed_employee_code = raw_device_user_id, status = 'MAPPED'
-- ============================================================

SET NOCOUNT ON;

PRINT '=== RESCUE MAPPING FIX ===';
PRINT '';

-- Step 1: Rescue 9xxxx codes that ARE employee codes
PRINT '[1] Rescuing 9xxxx codes (full employee codes in 9xxxxxx range)...';
UPDATE s
SET s.parsed_employee_code = s.raw_device_user_id,
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Rescued: direct lookup found full employee_code'
FROM attendance_scan_logs s
WHERE s.mapping_status = 'UNMAPPED'
AND s.raw_device_user_id LIKE '9%'
AND EXISTS (SELECT 1 FROM employees e WHERE e.employee_code = s.raw_device_user_id);
PRINT '   9xxxx rescued: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' records';
GO

-- Step 2: Rescue too_long (7-digit) codes that ARE employee codes  
PRINT '[2] Rescuing 7-digit codes (full employee codes like 0010106, 1000001)...';
UPDATE s
SET s.parsed_employee_code = s.raw_device_user_id,
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Rescued: direct lookup found full employee_code (7-digit)'
FROM attendance_scan_logs s
WHERE s.mapping_status = 'UNMAPPED'
AND LEN(s.raw_device_user_id) > 6
AND s.raw_device_user_id NOT LIKE '9%'
AND s.raw_device_user_id NOT LIKE '%[^0-9]%'
AND EXISTS (SELECT 1 FROM employees e WHERE e.employee_code = s.raw_device_user_id);
PRINT '   7-digit rescued: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' records';
GO

-- Step 3: Rescue 6-digit numeric codes that ARE employee codes
-- (Some employee codes like 0010001 are 7 digits, some are 6)
PRINT '[3] Rescuing 6-digit codes that are full employee codes...';
UPDATE s
SET s.parsed_employee_code = s.raw_device_user_id,
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Rescued: direct lookup found full employee_code (6-digit)'
FROM attendance_scan_logs s
WHERE s.mapping_status = 'UNMAPPED'
AND LEN(s.raw_device_user_id) = 6
AND s.raw_device_user_id NOT LIKE '9%'
AND s.raw_device_user_id NOT LIKE '%[^0-9]%'
AND EXISTS (SELECT 1 FROM employees e WHERE e.employee_code = s.raw_device_user_id);
PRINT '   6-digit rescued: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' records';
GO

-- Step 4: Final status report
PRINT '';
PRINT '=== POST-FIX MAPPING STATUS ===';
SELECT mapping_status, COUNT(*) as cnt 
FROM attendance_scan_logs 
GROUP BY mapping_status 
ORDER BY cnt DESC;
GO

-- Step 5: Detailed breakdown of remaining UNMAPPED
PRINT '';
PRINT '=== REMAINING UNMAPPED BREAKDOWN ===';
SELECT 
  machine_code,
  mapping_reason,
  COUNT(*) as cnt
FROM attendance_scan_logs 
WHERE mapping_status = 'UNMAPPED'
GROUP BY machine_code, mapping_reason
ORDER BY cnt DESC;
GO

-- Step 4: Rescue 4xxxxx codes (7-digit with division prefix 4=AB2=H)
-- Pattern: raw 4xxxxxx → strip '4' → 6-digit → prefix with locCode from machine division
PRINT '[4] Rescuing 4xxxxx 7-digit codes (division prefix pattern)...';
UPDATE s
SET s.parsed_employee_code = (
    CASE s.machine_code
        WHEN 'AB1' THEN 'G' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 2, 6), 6)
        WHEN 'AB2' THEN 'H' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 2, 6), 6)
        WHEN 'P1A' THEN 'A' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 2, 6), 6)
        WHEN 'P1B' THEN 'B' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 2, 6), 6)
        WHEN 'P2A' THEN 'C' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 2, 6), 6)
        WHEN 'P2B' THEN 'D' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 2, 6), 6)
        WHEN 'DME' THEN 'E' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 2, 6), 6)
        WHEN 'ARA' THEN 'F' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 2, 6), 6)
        WHEN 'ARC' THEN 'J' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 2, 6), 6)
        ELSE 'X' + RIGHT('0000' + SUBSTRING(s.raw_device_user_id, 2, 6), 6)
    END
),
    s.mapping_status = 'MAPPED',
    s.mapping_reason = 'Rescued: 7-digit div prefix mapped to employee code'
FROM attendance_scan_logs s
WHERE s.mapping_status = 'UNMAPPED'
AND s.raw_device_user_id LIKE '[4-9]%'
AND LEN(s.raw_device_user_id) = 7
AND s.raw_device_user_id NOT LIKE '%[^0-9]%'
AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.employee_code = s.raw_device_user_id);
PRINT '   4xxxxx rescued: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' records';
GO
