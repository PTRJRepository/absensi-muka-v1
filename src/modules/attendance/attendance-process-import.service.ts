/**
 * Attendance Process Service
 *
 * Processes raw attendance scan logs into attendance_imports table
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

      // Process NEED_REVIEW records → MANUAL_REVIEW division
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
          NULL AS employee_id,
          'MANUAL_' + s.raw_device_user_id AS employee_code,
          'MANUAL_REVIEW' AS division_code,
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
          1 AS needs_manual_review,
          MIN(s.id) AS raw_scan_log_id
        FROM attendance_scan_logs s
        WHERE s.sync_batch_id = @batchId
          AND s.mapping_status = 'NEED_REVIEW'
          AND NOT EXISTS (
            SELECT 1 FROM attendance_imports ai
            WHERE ai.employee_code = 'MANUAL_' + s.raw_device_user_id
              AND ai.attendance_date = s.scan_date
              AND ai.source_reference = s.machine_code
          )
        GROUP BY s.raw_device_user_id, s.parsed_division_code, s.scan_date, s.machine_code`,
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

      // Get NEED_REVIEW groups → MANUAL_REVIEW division
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
          MIN(s.id) AS raw_scan_id
        FROM attendance_scan_logs s
        WHERE s.mapping_status = 'NEED_REVIEW'
          AND NOT EXISTS (
            SELECT 1 FROM attendance_imports ai
            WHERE ai.employee_code = 'MANUAL_' + s.raw_device_user_id
              AND ai.attendance_date = s.scan_date
              AND ai.source_reference = s.machine_code
          )
        GROUP BY s.raw_device_user_id, s.parsed_division_code, s.scan_date, s.machine_code, s.sync_batch_id`
      );

      let reviewProcessed = 0;
      for (const row of reviewGroups ?? []) {
        const year = new Date(row.scan_date).getFullYear();
        const month = new Date(row.scan_date).getMonth() + 1;
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
