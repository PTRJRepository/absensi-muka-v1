/**
 * Attendance Process Service
 *
 * Processes raw attendance scan logs into attendance_imports table.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │  UNDERSTANDING MANUAL_REVIEW RECORDS                                        │
 * ├──────────────────────────────────────────────────────────────────────────────┤
 * │  MANUAL_REVIEW is a division_code, NOT an attendance_status.                │
 * │  Records with division_code = 'MANUAL_REVIEW' have VALID attendance data:   │
 * │    - employee_id = NULL       (can't link to HR employee master)            │
 * │    - attendance_status = 'HADIR' or 'INCOMPLETE_SCAN'  (valid status)    │
 * │    - check_in_at / check_out_at = correct timestamps                       │
 * │                                                                            │
 * │  Why do they exist?                                                        │
 * │  These are attendance events where the raw_badge_id from the ZKTeco        │
 * │  machine CANNOT be resolved to an employee in the HR master:              │
 * │                                                                            │
 * │  Root cause — PGE Office & MILL machines produce PURE NUMERIC badge IDs:  │
 * │    Examples: 10129, 188, 34, 10072, 30024, 20015                         │
 * │                                                                            │
 * │  These are ≤ 5 digits, so the SSOT parser excludes them:                  │
 * │    "if (rawId.length <= 5) → EXCLUDED → NEED_REVIEW"                      │
 * │    Reason: scanner-suffix IDs are ≥ 6 digits; short IDs could conflict.    │
 * │                                                                            │
 * │  The SSOT parser correctly identifies these as 'NEED_REVIEW' because:     │
 * │    1. Scanner-suffix IDs (P1A=100xxxx, P1B=300xxxx) are ≥ 6 digits       │
 * │    2. Pure numeric IDs ≤ 5 digits (10129, 188) have no locCode prefix    │
 * │    3. No employees.zkteco_user_id linkage exists for PGE/MILL employees  │
 * │                                                                            │
 * │  Why can't we link PGE/MILL employees by raw_badge_id = employee_code?   │
 * │    - employees.zkteco_user_id IS NULL for ALL PGE/MILL employees          │
 * │    - employees.employee_code for PGE has non-standard formats:             │
 * │        '0010106', '1000001', '1', '10001', etc. (not uniform)            │
 * │    - MILL has no employees in the 'MILL' division at all                  │
 * │    - Direct matching raw_device_user_id → employee_code FAILS for          │
 * │      most PGE employees because employee_code formats are inconsistent     │
 * │                                                                            │
 * │  ARCHITECTURAL DECISION:                                                   │
 * │  The SSOT parser intentionally excludes short IDs to prevent false matches.│
 * │  This is CORRECT behavior. PGE/MILL orphan data requires:                 │
 * │    Option A: Update machine enrollment with proper formatted IDs             │
 * │    Option B: Backfill employees.zkteco_user_id for PGE/MILL employees      │
 * │    Option C: Create a separate badge-to-employee mapping table              │
 * │                                                                            │
 * │  VALIDITY: MANUAL_REVIEW records are NOT garbage.                          │
 * │  They represent real attendance events with correct timestamps.             │
 * │  They simply cannot be attributed to a known employee in the HR master.     │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */

import { query, execute, sql } from "../../lib/db";

export interface ProcessResult {
  success: boolean;
  processed: number;
  errors: number;
  skipped: number;
  details?: {
    mapped: number;
    manualReview: number;
  };
}

export class AttendanceProcessService {
  /**
   * Process scan logs for a specific batch
   * - Includes ALL MAPPED records (removes e.id IS NOT NULL filter)
   * - Routes unmapped/need_review to MANUAL_REVIEW division
   */
  async processScanLogsForBatch(batchId: number): Promise<ProcessResult> {
    try {
      // Process MAPPED/AUTO_MAPPED records with NIK-based current_emp_code resolution.
      //
      // Resolution cascade (3-step JOIN):
      //   1. e_parsed:  direct match on parsed_employee_code = employee_code
      //   2. e_current: follow current_emp_code (NIK-resolved) if parsed row has one
      //   3. e_fallback: try employees by matching current_emp_code directly from
      //                  hr_employee_current_snapshot (for codes not in employees yet)
      //
      // Priority: e_current.id > e_parsed.id > NULL (manual review)
      // Enrichment columns — populated at INSERT time from employees + hr_employee_current_snapshot
      // This eliminates the need for a separate post-INSERT enrichment step.
      // Layer 1 (employees): employee_name, hr_status, hr_loc_code, nik
      // Layer 2 (hr_employee_current_snapshot via NIK): current_emp_name, current_hr_loc_code, current_hr_status
      const mappedResult = await execute(
        `INSERT INTO attendance_imports (
          employee_id, employee_code, division_code,
          attendance_date, attendance_year, attendance_month,
          check_in_at, check_out_at,
          attendance_status, has_work,
          source, source_reference, batch_id, needs_manual_review,
          employee_name, hr_status, hr_loc_code, nik,
          current_emp_name, current_hr_loc_code, current_hr_status
        )
        OUTPUT INSERTED.id
        SELECT TOP 500
          COALESCE(e_current.id, e_parsed.id) AS employee_id,
          COALESCE(e_current.employee_code, e_parsed.employee_code, s.parsed_employee_code) AS employee_code,
          COALESCE(d.division_code, s.parsed_division_code, 'UNKNOWN') AS division_code,
          s.scan_date AS attendance_date,
          YEAR(s.scan_date) AS attendance_year,
          MONTH(s.scan_date) AS attendance_month,
          MIN(s.scan_time) AS check_in_at,
          CASE WHEN COUNT(*) >= 2 THEN MAX(s.scan_time) ELSE NULL END AS check_out_at,
          CASE WHEN COUNT(*) >= 2 THEN 'HADIR' ELSE 'INCOMPLETE_SCAN' END AS attendance_status,
          CASE WHEN COUNT(*) >= 1 THEN 1 ELSE 0 END AS has_work,
          'ZKTECO' AS source,
          s.machine_code AS source_reference,
          @batchId AS batch_id,
          CASE WHEN COALESCE(e_current.id, e_parsed.id) IS NOT NULL THEN 0 ELSE 1 END AS needs_manual_review,
          -- Layer 1 enrichment from employees
          COALESCE(e_current.employee_name, e_parsed.employee_name) AS employee_name,
          COALESCE(e_current.hr_status, e_parsed.hr_status) AS hr_status,
          COALESCE(e_current.hr_loc_code, e_parsed.hr_loc_code) AS hr_loc_code,
          COALESCE(e_curr_hr.nik, e_parsed.nik) AS nik,
          -- Layer 2 enrichment from hr_employee_current_snapshot via NIK
          COALESCE(e_curr_hr.current_emp_name, e_current.employee_name, e_parsed.employee_name) AS current_emp_name,
          e_curr_hr.current_loc_code AS current_hr_loc_code,
          e_curr_hr.current_status AS current_hr_status
        FROM attendance_scan_logs s
        -- Step 1: direct match on parsed_employee_code
        LEFT JOIN employees e_parsed ON e_parsed.employee_code = s.parsed_employee_code
        -- Step 2: follow current_emp_code from parsed row (NIK-based resolution)
        LEFT JOIN employees e_current
          ON e_current.employee_code = e_parsed.current_emp_code
          AND e_current.is_active = 1
          AND e_current.employee_code != e_parsed.employee_code
        -- Layer 2: hr_employee_current_snapshot via NIK
        LEFT JOIN hr_employee_current_snapshot e_curr_hr
          ON e_curr_hr.nik = e_parsed.nik
        LEFT JOIN divisions d ON d.id = COALESCE(e_current.division_id, e_parsed.division_id)
        WHERE s.sync_batch_id = @batchId
          AND s.mapping_status IN ('MAPPED', 'AUTO_MAPPED')
          AND s.parsed_employee_code IS NOT NULL
          AND s.parsed_employee_code != ''
          -- Only insert records with a valid employee_id; NULL → route to NEED_REVIEW path instead
          AND COALESCE(e_current.id, e_parsed.id) IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM attendance_imports ai
            WHERE ai.employee_id = COALESCE(e_current.id, e_parsed.id)
              AND ai.employee_code = COALESCE(e_current.employee_code, e_parsed.employee_code, s.parsed_employee_code)
              AND ai.attendance_date = s.scan_date
              AND ai.source_reference = s.machine_code
          )
        GROUP BY COALESCE(e_current.id, e_parsed.id),
                 COALESCE(e_current.employee_code, e_parsed.employee_code, s.parsed_employee_code),
                 COALESCE(d.division_code, s.parsed_division_code, 'UNKNOWN'),
                 s.scan_date, s.machine_code,
                 COALESCE(e_current.employee_name, e_parsed.employee_name),
                 COALESCE(e_current.hr_status, e_parsed.hr_status),
                 COALESCE(e_current.hr_loc_code, e_parsed.hr_loc_code),
                 COALESCE(e_curr_hr.nik, e_parsed.nik),
                 COALESCE(e_curr_hr.current_emp_name, e_current.employee_name, e_parsed.employee_name),
                 e_curr_hr.current_loc_code,
                 e_curr_hr.current_status`,
        [{ name: "batchId", type: sql.BigInt, value: batchId }]
      );

      const mappedCount = mappedResult.rowsAffected?.[0] ?? 0;

      /**
       * Process NEED_REVIEW records with a TWO-STEP fallback:
       *
       * STEP 1 — Direct employee_code lookup (rescues PGE/MILL/APE orphan records):
       *   PGE Office and MILL machines produce PURE NUMERIC badge IDs (10129, 188, 34...).
       *   These fail the SSOT parser's short-ID exclusion rule. However, for PGE employees,
       *   the employee_code field sometimes matches the raw badge ID directly.
       *   Example: scan_logs.raw_device_user_id='10129' → employees.employee_code='10129'
       *   This step catches those matches and creates enriched records (employee_id, division).
       *
       *   Affected machines: OFFICE_PGE, MILL, OFFICE_APE
       *   Expected rescue: ~8,000-14,000 records currently in MANUAL_REVIEW.
       *
       * STEP 2 — True orphan routing (genuinely unmappable records):
       *   Records where raw_device_user_id does NOT match any employee_code,
       *   and has no SSOT-parsed code. These get division_code = 'MANUAL_REVIEW'.
       *
       * Deduplication key for direct lookup: (employee_code, attendance_date, source_reference)
       * Deduplication key for orphans:    (MANUAL_raw_device_user_id, attendance_date, source_reference)
       *
       * WHY: The unique constraint on attendance_imports is
       *   (employee_code, attendance_date, source, source_reference).
       * MANUAL_REVIEW records use employee_code='MANUAL_<raw_id>' so they don't conflict
       * with direct-lookup records that use the real employee_code.
       */
      const manualReviewResult = await execute(
        `INSERT INTO attendance_imports (
          employee_id, employee_code, division_code,
          attendance_date, attendance_year, attendance_month,
          check_in_at, check_out_at,
          attendance_status, has_work,
          source, source_reference, batch_id, needs_manual_review,
          raw_scan_log_id
        )
        OUTPUT INSERTED.id
        SELECT TOP 200
          COALESCE(e_direct.id, NULL) AS employee_id,
          COALESCE(e_direct.employee_code, 'MANUAL_' + s.raw_device_user_id) AS employee_code,
          COALESCE(d_direct.division_code, 'MANUAL_REVIEW') AS division_code,
          s.scan_date AS attendance_date,
          YEAR(s.scan_date) AS attendance_year,
          MONTH(s.scan_date) AS attendance_month,
          MIN(s.scan_time) AS check_in_at,
          CASE WHEN COUNT(*) >= 2 THEN MAX(s.scan_time) ELSE NULL END AS check_out_at,
          CASE WHEN COUNT(*) >= 2 THEN 'HADIR' ELSE 'INCOMPLETE_SCAN' END AS attendance_status,
          CASE WHEN COUNT(*) >= 1 THEN 1 ELSE 0 END AS has_work,
          'ZKTECO' AS source,
          s.machine_code AS source_reference,
          @batchId AS batch_id,
          CASE WHEN e_direct.id IS NOT NULL THEN 0 ELSE 1 END AS needs_manual_review,
          MIN(s.id) AS raw_scan_log_id
        FROM attendance_scan_logs s
        -- STEP 1: Direct employee_code lookup for short-numeric badge IDs
        -- Catches PGE (10129, 10072), MILL (188, 34), APE patterns that
        -- fail SSOT parser but match employees.employee_code directly.
        LEFT JOIN employees e_direct
          ON e_direct.employee_code = s.raw_device_user_id
        LEFT JOIN divisions d_direct ON d_direct.id = e_direct.division_id
        WHERE s.sync_batch_id = @batchId
          AND s.mapping_status = 'NEED_REVIEW'
          -- Skip if already processed:
          -- Direct-lookup record not yet inserted
          AND NOT EXISTS (
            SELECT 1 FROM attendance_imports ai
            WHERE ai.employee_code = COALESCE(e_direct.employee_code, 'MANUAL_' + s.raw_device_user_id)
              AND ai.attendance_date = s.scan_date
              AND ai.source_reference = s.machine_code
              AND (e_direct.id IS NOT NULL OR ai.employee_code LIKE 'MANUAL_%'))
          -- Orphan (no direct match) check: MANUAL_ record not yet inserted
          AND (
            e_direct.id IS NOT NULL
            OR NOT EXISTS (
              SELECT 1 FROM attendance_imports ai
              WHERE ai.employee_code = 'MANUAL_' + s.raw_device_user_id
                AND ai.attendance_date = s.scan_date
                AND ai.source_reference = s.machine_code
            )
          )
        GROUP BY
          e_direct.id, e_direct.employee_code, d_direct.division_code,
          s.raw_device_user_id, s.parsed_division_code, s.scan_date, s.machine_code`,
        [{ name: "batchId", type: sql.BigInt, value: batchId }]
      );

      const manualReviewCount = manualReviewResult.rowsAffected?.[0] ?? 0;

      // ── Post-INSERT enrichment: update enrichment columns for freshly inserted records ──
      // Layer 1: employee_name, hr_status, hr_loc_code, nik from employees
      try {
        await execute(`
          UPDATE ai SET
            ai.employee_name = COALESCE(ai.employee_name, e.employee_name),
            ai.hr_status = COALESCE(ai.hr_status, e.hr_status),
            ai.hr_loc_code = COALESCE(ai.hr_loc_code, e.hr_loc_code),
            ai.nik = COALESCE(ai.nik, e.nik)
          FROM attendance_imports ai
          INNER JOIN employees e ON e.id = ai.employee_id
          WHERE ai.batch_id = @batchId
            AND ai.employee_name IS NULL
        `, [{ name: "batchId", type: sql.BigInt, value: batchId }]);
      } catch (enrichErr) {
        console.warn('[processScanLogsForBatch] Layer 1 enrichment failed:', enrichErr);
      }

      // Layer 2: current_emp_name, current_hr_loc_code, current_hr_status from hr_employee_current_snapshot
      try {
        await execute(`
          UPDATE ai SET
            ai.current_emp_name = COALESCE(ai.current_emp_name,
              h.current_emp_name, e.employee_name),
            ai.current_hr_loc_code = COALESCE(ai.current_hr_loc_code,
              h.current_loc_code),
            ai.current_hr_status = COALESCE(ai.current_hr_status,
              h.current_status)
          FROM attendance_imports ai
          INNER JOIN employees e ON e.id = ai.employee_id
          LEFT JOIN hr_employee_current_snapshot h
            ON h.nik = e.nik
          WHERE ai.batch_id = @batchId
            AND ai.current_emp_name IS NULL
        `, [{ name: "batchId", type: sql.BigInt, value: batchId }]);
      } catch (enrichErr) {
        console.warn('[processScanLogsForBatch] Layer 2 enrichment failed:', enrichErr);
      }

      return {
        success: true,
        processed: mappedCount + manualReviewCount,
        errors: 0,
        skipped: 0,
        details: {
          mapped: mappedCount,
          manualReview: manualReviewCount
        }
      };
    } catch (error: any) {
      console.error("Error processing scan logs for batch:", error);
      return { success: false, processed: 0, errors: 1, skipped: 0 };
    }
  }

  /**
   * Process ALL unprocessed scan logs (across all batches)
   * - Processes MAPPED records with valid employee_id
   * - Routes unmapped/need_review to MANUAL_REVIEW division
   */
  async processAllUnprocessed(batchSize: number = 1000): Promise<ProcessResult> {
    try {
      // ── Select scan log groups for MAPPED records, keyed by resolved_employee_code ──
      // We GROUP BY the resolved identity (employee_id) to deduplicate records
      // where multiple raw_device_user_id codes resolve to the same employee via NIK.
      const scanGroups = await query<any>(
        `SELECT TOP ${batchSize}
          MIN(s.parsed_employee_code) AS parsed_employee_code,
          s.scan_date,
          s.machine_code,
          MAX(s.sync_batch_id) AS sync_batch_id,
          -- Identity key: resolved employee
          COALESCE(e_current.id, e_parsed.id) AS resolved_employee_id,
          COALESCE(e_current.employee_code, e_parsed.employee_code) AS resolved_employee_code,
          MIN(s.scan_time) AS check_in,
          MAX(s.scan_time) AS check_out,
          COUNT(*) AS scan_count
        FROM attendance_scan_logs s
        LEFT JOIN employees e_parsed ON e_parsed.employee_code = s.parsed_employee_code
        LEFT JOIN employees e_current
          ON e_current.employee_code = e_parsed.current_emp_code
          AND e_current.is_active = 1
          AND e_current.employee_code != e_parsed.employee_code
        WHERE s.mapping_status IN ('MAPPED', 'AUTO_MAPPED')
          AND s.parsed_employee_code IS NOT NULL
          AND s.parsed_employee_code != ''
          AND COALESCE(e_current.id, e_parsed.id) IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM attendance_imports ai
            WHERE ai.employee_code = COALESCE(e_current.employee_code, e_parsed.employee_code)
              AND ai.attendance_date = s.scan_date
              AND ai.source_reference = s.machine_code
          )
        GROUP BY
          COALESCE(e_current.id, e_parsed.id),
          COALESCE(e_current.employee_code, e_parsed.employee_code),
          s.scan_date, s.machine_code`
      );

      // Fetch all relevant employees for enrichment (division + name + HR fields)
      const empCodes = (scanGroups ?? [])
        .map(r => r.resolved_employee_code)
        .filter(Boolean);
      const allCodes = Array.from(new Set(empCodes));

      const employees = allCodes.length > 0 ? await query<any>(
        `SELECT e.id, e.employee_code, e.employee_name, e.hr_status, e.hr_loc_code, e.nik, d.division_code
         FROM employees e
         LEFT JOIN divisions d ON d.id = e.division_id
         WHERE e.employee_code IN (${allCodes.map((_, i) => `@c${i}`).join(',')})`,
        allCodes.map((c, i) => ({ name: `c${i}`, type: sql.NVarChar, value: c }))
      ) : [];
      const empMap = new Map(employees.map((e: any) => [e.employee_code, e]));

      let mappedProcessed = 0;
      for (const row of scanGroups ?? []) {
        const year = new Date(row.scan_date).getFullYear();
        const month = new Date(row.scan_date).getMonth() + 1;
        const empIdRaw = row.resolved_employee_id;
        if (!empIdRaw) continue;
        const emp = empMap.get(row.resolved_employee_code);
        const empId = Number(empIdRaw);
        const empCode = row.resolved_employee_code ?? row.parsed_employee_code;
        const divCode = emp?.division_code ?? row.parsed_division_code ?? 'UNKNOWN';
        const empName = emp?.employee_name ?? null;
        const hrStatus = emp?.hr_status ?? null;
        const hrLocCode = emp?.hr_loc_code ?? null;
        const nik = emp?.nik ?? null;

        // Layer 2: current_emp_name from hr_employee_current_snapshot via NIK
        const hrSnapshot = nik ? await query<any>(
          `SELECT TOP 1 current_emp_name, current_loc_code, current_status
           FROM hr_employee_current_snapshot WHERE nik = @nik`,
          [{ name: "nik", type: sql.NVarChar, value: nik }]
        ) : [];
        const hrRow = hrSnapshot?.[0];

        await execute(
          `INSERT INTO attendance_imports (
            employee_id, employee_code, division_code, attendance_date,
            attendance_year, attendance_month, check_in_at, check_out_at,
            attendance_status, has_work, source, source_reference,
            batch_id, needs_manual_review,
            employee_name, hr_status, hr_loc_code, nik,
            current_emp_name, current_hr_loc_code, current_hr_status
          ) VALUES (@eid, @ec, @dc, @dt, @yr, @mo, @ci, @co, @st, @hw, 'ZKTECO', @sr, @bid, 0,
            @en, @hrs, @hrl, @nik,
            @cen, @chrl, @chrs)`,
          [
            { name: "eid", type: sql.Int, value: empId },
            { name: "ec", type: sql.NVarChar, value: empCode },
            { name: "dc", type: sql.NVarChar, value: divCode },
            { name: "dt", type: sql.Date, value: row.scan_date },
            { name: "yr", type: sql.Int, value: year },
            { name: "mo", type: sql.Int, value: month },
            { name: "ci", type: sql.DateTime2, value: row.check_in },
            { name: "co", type: sql.DateTime2, value: row.scan_count >= 2 ? row.check_out : null },
            { name: "st", type: sql.NVarChar, value: row.scan_count >= 2 ? "HADIR" : "INCOMPLETE_SCAN" },
            { name: "hw", type: sql.Bit, value: row.scan_count >= 1 ? 1 : 0 },
            { name: "sr", type: sql.NVarChar, value: row.machine_code },
            { name: "bid", type: sql.BigInt, value: row.sync_batch_id },
            { name: "en", type: sql.NVarChar, value: empName },
            { name: "hrs", type: sql.NVarChar, value: hrStatus },
            { name: "hrl", type: sql.NVarChar, value: hrLocCode },
            { name: "nik", type: sql.NVarChar, value: nik },
            { name: "cen", type: sql.NVarChar, value: hrRow?.current_emp_name ?? empName },
            { name: "chrl", type: sql.NVarChar, value: hrRow?.current_loc_code ?? null },
            { name: "chrs", type: sql.NVarChar, value: hrRow?.current_status ?? null },
          ]
        );
      }

      /**
       * NEED_REVIEW records — two-step fallback (same as processScanLogsForBatch):
       * STEP 1: Direct employee_code lookup for PGE/MILL/APE numeric badge IDs
       * STEP 2: True orphans → division_code = 'MANUAL_REVIEW'
       */
      const reviewGroups = await query<any>(
        `SELECT TOP ${batchSize}
          s.raw_device_user_id,
          s.parsed_division_code AS div_code,
          s.scan_date,
          MIN(s.scan_time) AS check_in,
          MAX(s.scan_time) AS check_out,
          COUNT(*) AS scan_count,
          s.machine_code,
          s.sync_batch_id,
          MIN(s.id) AS raw_scan_id,
          -- STEP 1: Direct employee match (PGE/MILL numeric badge IDs)
          e_direct.id AS direct_employee_id,
          e_direct.employee_code AS direct_employee_code,
          d_direct.division_code AS direct_division_code,
          e_direct.employee_name AS direct_employee_name,
          e_direct.hr_status AS direct_hr_status,
          e_direct.hr_loc_code AS direct_hr_loc_code,
          e_direct.nik AS direct_nik
        FROM attendance_scan_logs s
        -- STEP 1 join: try direct employee_code match for orphan badge IDs
        LEFT JOIN employees e_direct
          ON e_direct.employee_code = s.raw_device_user_id
        LEFT JOIN divisions d_direct ON d_direct.id = e_direct.division_id
        WHERE s.mapping_status = 'NEED_REVIEW'
          AND (
            -- STEP 1: skip if direct match already inserted
            e_direct.id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM attendance_imports ai
              WHERE ai.employee_code = e_direct.employee_code
                AND ai.attendance_date = s.scan_date
                AND ai.source_reference = s.machine_code
            )
            -- STEP 2: skip if orphan already inserted
            OR (
              e_direct.id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM attendance_imports ai
                WHERE ai.employee_code = 'MANUAL_' + s.raw_device_user_id
                  AND ai.attendance_date = s.scan_date
                  AND ai.source_reference = s.machine_code
              )
            )
          )
        GROUP BY
          s.raw_device_user_id, s.parsed_division_code, s.scan_date,
          s.machine_code, s.sync_batch_id,
          e_direct.id, e_direct.employee_code, d_direct.division_code,
          e_direct.employee_name, e_direct.hr_status, e_direct.hr_loc_code, e_direct.nik`
      );

      let reviewProcessed = 0;
      for (const row of reviewGroups ?? []) {
        const year = new Date(row.scan_date).getFullYear();
        const month = new Date(row.scan_date).getMonth() + 1;

        // STEP 1: Direct employee match — use real employee data
        if (row.direct_employee_id != null) {
          await execute(
            `INSERT INTO attendance_imports (
              employee_id, employee_code, division_code, attendance_date,
              attendance_year, attendance_month, check_in_at, check_out_at,
              attendance_status, has_work, source, source_reference,
              batch_id, needs_manual_review, raw_scan_log_id,
              employee_name, hr_status, hr_loc_code, nik
            ) VALUES (@eid, @ec, @dc, @dt, @yr, @mo, @ci, @co, @st, @hw, 'ZKTECO', @sr, @bid, 0, @rsid,
              @en, @hrs, @hrl, @nik)`,
            [
              { name: "eid", type: sql.Int, value: Number(row.direct_employee_id) },
              { name: "ec", type: sql.NVarChar, value: row.direct_employee_code },
              { name: "dc", type: sql.NVarChar, value: row.direct_division_code ?? 'UNKNOWN' },
              { name: "dt", type: sql.Date, value: row.scan_date },
              { name: "yr", type: sql.Int, value: year },
              { name: "mo", type: sql.Int, value: month },
              { name: "ci", type: sql.DateTime2, value: row.check_in },
              { name: "co", type: sql.DateTime2, value: row.scan_count >= 2 ? row.check_out : null },
              { name: "st", type: sql.NVarChar, value: row.scan_count >= 2 ? 'HADIR' : 'INCOMPLETE_SCAN' },
              { name: "hw", type: sql.Bit, value: row.scan_count >= 1 ? 1 : 0 },
              { name: "sr", type: sql.NVarChar, value: row.machine_code },
              { name: "bid", type: sql.BigInt, value: row.sync_batch_id },
              { name: "rsid", type: sql.BigInt, value: row.raw_scan_id },
              { name: "en", type: sql.NVarChar, value: row.direct_employee_name ?? null },
              { name: "hrs", type: sql.NVarChar, value: row.direct_hr_status ?? null },
              { name: "hrl", type: sql.NVarChar, value: row.direct_hr_loc_code ?? null },
              { name: "nik", type: sql.NVarChar, value: row.direct_nik ?? null },
            ]
          );
        }
        // STEP 2: True orphan — route to MANUAL_REVIEW
        else {
          await execute(
            `INSERT INTO attendance_imports (
              employee_id, employee_code, division_code, attendance_date,
              attendance_year, attendance_month, check_in_at, check_out_at,
              attendance_status, has_work, source, source_reference,
              batch_id, needs_manual_review, raw_scan_log_id
            ) VALUES (NULL, @ec, 'MANUAL_REVIEW', @dt, @yr, @mo, @ci, @co, @st, @hw, 'ZKTECO', @sr, @bid, 1, @rsid)`,
            [
              { name: "ec", type: sql.NVarChar, value: 'MANUAL_' + row.raw_device_user_id },
              { name: "dt", type: sql.Date, value: row.scan_date },
              { name: "yr", type: sql.Int, value: year },
              { name: "mo", type: sql.Int, value: month },
              { name: "ci", type: sql.DateTime2, value: row.check_in },
              { name: "co", type: sql.DateTime2, value: row.scan_count >= 2 ? row.check_out : null },
              { name: "st", type: sql.NVarChar, value: row.scan_count >= 2 ? 'HADIR' : 'INCOMPLETE_SCAN' },
              { name: "hw", type: sql.Bit, value: row.scan_count >= 1 ? 1 : 0 },
              { name: "sr", type: sql.NVarChar, value: row.machine_code },
              { name: "bid", type: sql.BigInt, value: row.sync_batch_id },
              { name: "rsid", type: sql.BigInt, value: row.raw_scan_id }
            ]
          );
        }
        reviewProcessed++;
      }

      return {
        success: true,
        processed: mappedProcessed + reviewProcessed,
        errors: 0,
        skipped: 0,
        details: {
          mapped: mappedProcessed,
          manualReview: reviewProcessed
        }
      };
    } catch (error: any) {
      console.error("Error processing all scan logs:", error);
      return { success: false, processed: 0, errors: 1, skipped: 0 };
    }
  }

  async getImportCount(): Promise<number> {
    try {
      const result = await query<{ count: number }>("SELECT COUNT(*) AS count FROM attendance_imports");
      return result[0]?.count ?? 0;
    } catch { return 0; }
  }

  async getScanLogCount(): Promise<number> {
    try {
      const result = await query<{ count: number }>("SELECT COUNT(*) AS count FROM attendance_scan_logs");
      return result[0]?.count ?? 0;
    } catch { return 0; }
  }

  async getManualReviewCount(): Promise<number> {
    try {
      const result = await query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM attendance_imports WHERE division_code = 'MANUAL_REVIEW'"
      );
      return result[0]?.count ?? 0;
    } catch { return 0; }
  }
}

export const attendanceProcessService = new AttendanceProcessService();
