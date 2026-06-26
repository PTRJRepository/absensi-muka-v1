-- ============================================================
-- Migration: Bulk insert attendance_imports from scan_logs
-- Date: 2026-06-19
-- Pattern: G10044→employee_code=10044 (strip G/B/H/E prefix fallback)
-- ============================================================

SET NOCOUNT ON;

PRINT '=== STEP 1: Create temp table with employee resolution ===';

SELECT TOP 0
  s.id AS scan_log_id,
  s.parsed_employee_code,
  s.parsed_division_code,
  s.scan_date,
  s.machine_code,
  s.sync_batch_id,
  CAST(NULL AS INT) AS employee_id,
  CAST(NULL AS NVARCHAR(50)) AS resolved_employee_code,
  CAST(0 AS BIT) AS needs_manual_review
INTO #emp_map
FROM attendance_scan_logs s;

-- Insert all MAPPED scan logs
INSERT INTO #emp_map (scan_log_id, parsed_employee_code, parsed_division_code, scan_date, machine_code, sync_batch_id)
SELECT s.id, s.parsed_employee_code, s.parsed_division_code, s.scan_date, s.machine_code, s.sync_batch_id
FROM attendance_scan_logs s
WHERE s.mapping_status = 'MAPPED'
  AND s.parsed_employee_code IS NOT NULL
  AND s.parsed_employee_code != ''
  AND NOT EXISTS (
    SELECT 1 FROM attendance_imports ai
    WHERE ai.employee_code = s.parsed_employee_code
      AND ai.attendance_date = s.scan_date
      AND ai.source_reference = s.machine_code
  );

PRINT 'Rows in temp table: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- Resolve employee_id via direct + fallback
DECLARE @ec NVARCHAR(50), @fid INT, @fcc NVARCHAR(50);
DECLARE @map_cursor CURSOR;
SET @map_cursor = CURSOR FOR
  SELECT DISTINCT parsed_employee_code FROM #emp_map WHERE employee_id IS NULL;

OPEN @map_cursor;
FETCH NEXT FROM @map_cursor INTO @ec;
WHILE @@FETCH_STATUS = 0
BEGIN
  -- Try direct match
  SELECT TOP 1 @fid = id, @fcc = employee_code FROM employees WHERE employee_code = @ec;
  IF @fid IS NOT NULL
  BEGIN
    UPDATE #emp_map SET employee_id = @fid, resolved_employee_code = @fcc, needs_manual_review = 0
    WHERE parsed_employee_code = @ec AND employee_id IS NULL;
  END
  ELSE
  BEGIN
    -- Try fallback: strip G/B/H/E prefix
    DECLARE @stripped NVARCHAR(50);
    IF @ec LIKE 'G%' SET @stripped = SUBSTRING(@ec, 2, 50);
    ELSE IF @ec LIKE 'B%' SET @stripped = SUBSTRING(@ec, 2, 50);
    ELSE IF @ec LIKE 'H%' SET @stripped = SUBSTRING(@ec, 2, 50);
    ELSE IF @ec LIKE 'E%' SET @stripped = SUBSTRING(@ec, 2, 50);
    ELSE SET @stripped = NULL;

    IF @stripped IS NOT NULL
    BEGIN
      SELECT TOP 1 @fid = id, @fcc = employee_code FROM employees WHERE employee_code = @stripped;
      IF @fid IS NOT NULL
      BEGIN
        UPDATE #emp_map SET employee_id = @fid, resolved_employee_code = @fcc, needs_manual_review = 0
        WHERE parsed_employee_code = @ec AND employee_id IS NULL;
      END
    END

    -- No match found → mark as manual review
    IF NOT EXISTS (SELECT 1 FROM #emp_map WHERE parsed_employee_code = @ec AND employee_id IS NOT NULL)
    BEGIN
      UPDATE #emp_map SET needs_manual_review = 1, resolved_employee_code = @ec
      WHERE parsed_employee_code = @ec AND employee_id IS NULL;
    END
  END
  SET @fid = NULL; SET @fcc = NULL;
  FETCH NEXT FROM @map_cursor INTO @ec;
END
CLOSE @map_cursor;
DEALLOCATE @map_cursor;

PRINT 'Resolved with employee_id: ' + CAST((SELECT COUNT(*) FROM #emp_map WHERE employee_id IS NOT NULL) AS VARCHAR);
PRINT 'Marked for manual review: ' + CAST((SELECT COUNT(*) FROM #emp_map WHERE needs_manual_review = 1) AS VARCHAR);

PRINT '';
PRINT '=== STEP 2: Insert resolved MAPPED records ===';

INSERT INTO attendance_imports (
  employee_id, employee_code, division_code,
  attendance_date, attendance_year, attendance_month,
  check_in_at, check_out_at,
  attendance_status, has_work,
  source, source_reference, batch_id, needs_manual_review
)
SELECT TOP 500
  m.employee_id,
  m.resolved_employee_code,
  ISNULL(d.division_code, m.parsed_division_code),
  m.scan_date,
  YEAR(m.scan_date),
  MONTH(m.scan_date),
  (SELECT MIN(s.scan_time) FROM attendance_scan_logs s WHERE s.id = m.scan_log_id),
  (SELECT MAX(s.scan_time) FROM attendance_scan_logs s WHERE s.id = m.scan_log_id),
  CASE WHEN (SELECT COUNT(*) FROM attendance_scan_logs s WHERE s.id = m.scan_log_id OR (s.parsed_employee_code = m.parsed_employee_code AND s.scan_date = m.scan_date AND s.machine_code = m.machine_code)) >= 2 THEN 'HADIR' ELSE 'TIDAK_HADIR' END,
  CASE WHEN (SELECT COUNT(*) FROM attendance_scan_logs s WHERE s.id = m.scan_log_id OR (s.parsed_employee_code = m.parsed_employee_code AND s.scan_date = m.scan_date AND s.machine_code = m.machine_code)) >= 2 THEN 1 ELSE 0 END,
  'ZKTECO',
  m.machine_code,
  m.sync_batch_id,
  m.needs_manual_review
FROM #emp_map m
LEFT JOIN employees e ON e.id = m.employee_id
LEFT JOIN divisions d ON d.id = e.division_id
WHERE m.needs_manual_review = 0;

PRINT 'MAPPED (with emp) inserted: ' + CAST(@@ROWCOUNT AS VARCHAR);

PRINT '';
PRINT '=== STEP 3: Insert NEED_REVIEW -> MANUAL_REVIEW ===';

WITH review_grouped AS (
  SELECT
    'MANUAL_' + s.raw_device_user_id AS employee_code,
    s.scan_date,
    s.machine_code,
    s.sync_batch_id,
    MIN(s.scan_time) AS check_in,
    MAX(s.scan_time) AS check_out,
    COUNT(*) AS scan_count,
    MIN(s.id) AS raw_scan_id
  FROM attendance_scan_logs s
  WHERE s.mapping_status = 'NEED_REVIEW'
    AND NOT EXISTS (
      SELECT 1 FROM attendance_imports ai
      WHERE ai.employee_code = 'MANUAL_' + s.raw_device_user_id
        AND ai.attendance_date = s.scan_date
        AND ai.source_reference = s.machine_code
    )
  GROUP BY s.raw_device_user_id, s.scan_date, s.machine_code, s.sync_batch_id
)
INSERT INTO attendance_imports (
  employee_id, employee_code, division_code,
  attendance_date, attendance_year, attendance_month,
  check_in_at, check_out_at,
  attendance_status, has_work,
  source, source_reference, batch_id, needs_manual_review, raw_scan_log_id
)
SELECT
  NULL,
  rg.employee_code,
  'MANUAL_REVIEW',
  rg.scan_date,
  YEAR(rg.scan_date),
  MONTH(rg.scan_date),
  rg.check_in,
  rg.check_out,
  CASE WHEN rg.scan_count >= 2 THEN 'HADIR' ELSE 'TIDAK_HADIR' END,
  CASE WHEN rg.scan_count >= 2 THEN 1 ELSE 0 END,
  'ZKTECO',
  rg.machine_code,
  rg.sync_batch_id,
  1,
  rg.raw_scan_id
FROM review_grouped rg;

PRINT 'NEED_REVIEW inserted: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- Cleanup
DROP TABLE #emp_map;

PRINT '';
PRINT '=== SUMMARY ===';
SELECT COUNT(*) AS total FROM attendance_imports;
SELECT TOP 15 division_code, COUNT(*) AS cnt FROM attendance_imports GROUP BY division_code ORDER BY cnt DESC;

GO
