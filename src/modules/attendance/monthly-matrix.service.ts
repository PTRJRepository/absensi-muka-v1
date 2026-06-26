import { query, sql } from "../../lib/db";

export interface ProcessedMatrixParams {
  year: number;
  month: number;
  division: string | null;
  machineCode: string | null;
  status: string | null;
  mapping: string | null;
  source: string | null;
  search: string;
  activeOnly: boolean;
  page: number;
  pageSize: number;
}

/**
 * Monthly matrix - DATABASE mode (FR-002).
 * Queries attendance_imports directly (NOT vw_attendance_monthly_matrix).
 * The view joins dropped/stale tables and hangs on large datasets;
 * attendance_imports is the canonical PROCESSED source and is fast.
 *
 * Returns flat employee-date rows paginated BY EMPLOYEE (DENSE_RANK),
 * matching the legacy response shape so the frontend keeps working.
 */
export async function getProcessedMatrix(p: ProcessedMatrixParams) {
  const searchPattern = `%${p.search}%`;
  const rows = await query<any>(
    `
    WITH ranked AS (
      SELECT
        ai.employee_code AS identity_key,
        COALESCE(e.current_emp_code, ai.employee_code) AS current_emp_code,
        ai.employee_code,
        COALESCE(NULLIF(e.current_emp_name, ''), NULLIF(e.employee_name, ''), ai.employee_code) AS employee_name,
        COALESCE(NULLIF(e.current_emp_name, ''), NULLIF(e.employee_name, ''), ai.employee_code, '-') AS display_name,
        ai.division_code,
        ai.attendance_date,
        ai.attendance_status AS final_status,
        ai.attendance_status AS ui_status,
        ai.check_in_at AS final_check_in,
        ai.check_out_at AS final_check_out,
        ai.source,
        CASE
          WHEN ai.check_in_at IS NOT NULL AND ai.check_out_at IS NOT NULL THEN 2
          WHEN ai.check_in_at IS NOT NULL THEN 1
          ELSE 0
        END AS scan_count,
        ai.needs_manual_review,
        CASE WHEN ai.source = 'MANUAL_CORRECTION' THEN 1 ELSE 0 END AS has_manual_correction,
        CAST(0 AS INT) AS is_leave,
        CAST(0 AS INT) AS is_sick,
        CAST(0 AS INT) AS is_holiday,
        'MAPPED' AS mapping_status,
        DENSE_RANK() OVER (ORDER BY ai.employee_code) AS emp_rn,
        COUNT(DISTINCT ai.employee_code) OVER () AS total_rows
      FROM attendance_imports ai
      LEFT JOIN employees e ON e.id = ai.employee_id
      WHERE ai.attendance_year = @year
        AND ai.attendance_month = @month
        AND (@division IS NULL OR ai.division_code = @division)
        AND (@status IS NULL OR ai.attendance_status = @status)
        AND (@source IS NULL OR ai.source = @source)
        AND (
          @searchRaw = ''
          OR ai.employee_code LIKE @search
          OR e.employee_name LIKE @search
          OR e.current_emp_code LIKE @search
        )
    )
    SELECT
      identity_key, current_emp_code, employee_code, employee_name, display_name,
      division_code, attendance_date, final_status, ui_status,
      final_check_in, final_check_out, source, scan_count,
      needs_manual_review, has_manual_correction, is_leave, is_sick, is_holiday,
      mapping_status, total_rows
    FROM ranked
    WHERE emp_rn > @offset AND emp_rn <= (@offset + @pageSize)
    ORDER BY emp_rn, attendance_date
    `,
    [
      { name: "year", type: sql.Int, value: p.year },
      { name: "month", type: sql.Int, value: p.month },
      { name: "division", type: sql.NVarChar, value: p.division },
      { name: "status", type: sql.NVarChar, value: p.status },
      { name: "source", type: sql.NVarChar, value: p.source },
      { name: "search", type: sql.NVarChar, value: searchPattern },
      { name: "searchRaw", type: sql.NVarChar, value: p.search },
      { name: "offset", type: sql.Int, value: (p.page - 1) * p.pageSize },
      { name: "pageSize", type: sql.Int, value: p.pageSize },
    ]
  );

  const total = Number(rows[0]?.total_rows ?? 0);
  return {
    rows,
    pagination: {
      page: p.page,
      pageSize: p.pageSize,
      total,
      totalPages: Math.ceil(total / p.pageSize),
    },
  };
}