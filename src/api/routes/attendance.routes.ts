import { z } from 'zod';
import { getProcessedMatrix } from '../../modules/attendance/monthly-matrix.service';
import { execute, query, sql } from '../../lib/db';
import { route, validate } from '../router';
import { sendError, sendEnvelope, sendJson } from '../response';
import { writeAudit } from '../services/audit.service';
import { requireAnyRole } from '../middleware/auth';

const correctionSchema = z.object({
  employeeCode: z.string().min(1),
  attendanceDate: z.string().min(10),
  attendanceStatus: z.string().min(1),
  checkInAt: z.string().optional().nullable(),
  checkOutAt: z.string().optional().nullable(),
  hasWork: z.boolean().default(false),
  isLeave: z.boolean().default(false),
  isSick: z.boolean().default(false),
  isHoliday: z.boolean().default(false),
  overtimeHours: z.number().min(0).default(0),
  reason: z.string().min(3),
});

// ─── Daily Attendance ──────────────────────────────────────────────────────
route('GET', '/api/attendance/daily', async (ctx) => {
  const date = ctx.query.get('date') ?? new Date().toISOString().slice(0, 10);
  const division = ctx.query.get('divisionCode');
  const gang = ctx.query.get('gangCode');
  const search = `%${ctx.query.get('search') ?? ''}%`;
  const page = Math.max(Number(ctx.query.get('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(ctx.query.get('pageSize') ?? 50), 1), 200);
  const rows = await query(`
    SELECT
       employee_code, employee_name, division_code, gang_code,
       attendance_date, final_status AS attendance_status,
       final_check_in AS check_in_at, final_check_out AS check_out_at,
       source, is_leave, is_sick, is_holiday, overtime_hours,
       zkteco_machine_code AS machine_code
     FROM vw_attendance_monthly_matrix
     WHERE attendance_date=@date
       AND (@division IS NULL OR division_code=@division)
       AND (@gang IS NULL OR gang_code=@gang)
       AND (employee_code LIKE @search OR employee_name LIKE @search)
     ORDER BY employee_code OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
    [
      { name: 'date', type: sql.Date, value: date },
      { name: 'division', type: sql.NVarChar, value: division },
      { name: 'gang', type: sql.NVarChar, value: gang },
      { name: 'search', type: sql.NVarChar, value: search },
      { name: 'offset', type: sql.Int, value: (page - 1) * pageSize },
      { name: 'pageSize', type: sql.Int, value: pageSize },
    ]);
  sendJson(ctx.res, 200, rows);
});

// ─── Monthly Summary ───────────────────────────────────────────────────────
route('GET', '/api/attendance/monthly', async (ctx) => {
  const year = Number(ctx.query.get('year') ?? new Date().getFullYear());
  const month = Number(ctx.query.get('month') ?? new Date().getMonth() + 1);
  const division = ctx.query.get('divisionCode');
  const rows = await query(`
    SELECT * FROM vw_attendance_monthly_summary_v2
     WHERE attendance_year=@year AND attendance_month=@month
       AND (@division IS NULL OR division_code=@division)
     ORDER BY employee_code`,
    [
      { name: 'year', type: sql.Int, value: year },
      { name: 'month', type: sql.Int, value: month },
      { name: 'division', type: sql.NVarChar, value: division },
    ]);
  sendJson(ctx.res, 200, rows);
});

function normalizeMatrixStatusSql(expression: string) {
  return `CASE
    WHEN ${expression} IN ('PRESENT','HADIR') THEN 'HADIR'
    WHEN ${expression} IN ('ABSENT','ALPHA','TIDAK_HADIR') THEN 'TIDAK_HADIR'
    WHEN ${expression} IN ('SAKIT','SICK') THEN 'SAKIT'
    WHEN ${expression} IN ('CUTI','IZIN','LEAVE') THEN 'CUTI'
    WHEN ${expression} IN ('HOLIDAY','LIBUR') THEN 'HOLIDAY'
    WHEN ${expression} IN ('OFF_DAY','REST_DAY','LIBUR_KERJA') THEN 'OFF_DAY'
    WHEN ${expression} IN ('INCOMPLETE_SCAN','SCAN_ON_OFFDAY_INCOMPLETE','SCAN_ON_HOLIDAY_INCOMPLETE') THEN ${expression}
    WHEN ${expression} IN ('SCAN_ON_OFFDAY') THEN 'SCAN_ON_OFFDAY_INCOMPLETE'
    WHEN ${expression} IN ('SCAN_ON_HOLIDAY') THEN 'SCAN_ON_HOLIDAY_INCOMPLETE'
    ELSE 'NO_DATA'
  END`;
}

function rawDeviceUserIdLengthSql(alias = 's') {
  return `LEN(LTRIM(RTRIM(CAST(${alias}.raw_device_user_id AS NVARCHAR(100)))))`;
}

// ─── SSOT Scanner Prefix → locCode parser (JavaScript for reference) ──────────
// Scanner prefix → locCode: 100→A, 200→J, 300→B, 400→H, 500→C, 600→D, 700→E, 800→F, 900→G
// 5-digit IDs → excluded. ID without scanner prefix → exact DB lookup only.
// SQL equivalent below (no CASE WHEN for length ≤ 5 — those go to NEED_REVIEW directly).

/**
 * Employee code from scan log: priority cascade.
 * 1. employees.current_emp_code (via employees JOIN on raw_device_user_id → zkteco_user_id)
 * 2. employees.current_emp_code (via employees JOIN on parsed_employee_code → employee_code)
 * 3. parsed_employee_code (fallback when no current employee mapping exists)
 */
function resolvedEmployeeCodeSql(alias = 's') {
  return `COALESCE(
    (
      SELECT TOP 1 e.current_emp_code
      FROM employees e
      WHERE LTRIM(RTRIM(e.zkteco_user_id)) = LTRIM(RTRIM(${alias}.raw_device_user_id))
        AND e.current_emp_code IS NOT NULL
      ORDER BY
        CASE WHEN LTRIM(RTRIM(e.employee_code)) = LTRIM(RTRIM(e.current_emp_code)) THEN 0 ELSE 1 END,
        e.id DESC
    ),
    (
      SELECT TOP 1 e.current_emp_code
      FROM employees e
      WHERE LTRIM(RTRIM(e.employee_code)) = LTRIM(RTRIM(${alias}.parsed_employee_code))
        AND e.current_emp_code IS NOT NULL
      ORDER BY
        CASE WHEN LTRIM(RTRIM(e.employee_code)) = LTRIM(RTRIM(e.current_emp_code)) THEN 0 ELSE 1 END,
        e.id DESC
    ),
    NULLIF(LTRIM(RTRIM(${alias}.parsed_employee_code)), '')
  )`;
}

/**
 * Employee name: priority cascade.
 * 1. employees.employee_name (via scan_logs → employees)
 * 2. attendance_scan_logs.zkteco_user_name (from machine)
 */
function resolvedEmployeeNameSql(alias = 's') {
  return `COALESCE(
    (
      SELECT TOP 1 e.employee_name
      FROM employees e
      WHERE LTRIM(RTRIM(e.zkteco_user_id)) = LTRIM(RTRIM(${alias}.raw_device_user_id))
        AND e.employee_name IS NOT NULL
      ORDER BY e.id DESC
    ),
    (
      SELECT TOP 1 e.employee_name
      FROM employees e
      WHERE LTRIM(RTRIM(e.employee_code)) = LTRIM(RTRIM(${alias}.parsed_employee_code))
        AND e.employee_name IS NOT NULL
      ORDER BY e.id DESC
    ),
    NULLIF(LTRIM(RTRIM(${alias}.zkteco_user_name)), '')
  )`;
}

function matrixCurrentEmployeeCodeSql(canonicalAlias = 'canonical', employeeAlias = 'e', viewAlias = 'v') {
  return `COALESCE(
    NULLIF(${canonicalAlias}.current_emp_code, ''),
    NULLIF(${employeeAlias}.current_emp_code, ''),
    NULLIF(${canonicalAlias}.employee_code, ''),
    NULLIF(${employeeAlias}.employee_code, ''),
    NULLIF(${viewAlias}.employee_code, '')
  )`;
}

function matrixCurrentEmployeeNameSql(canonicalAlias = 'canonical', employeeAlias = 'e', viewAlias = 'v') {
  return `COALESCE(
    NULLIF(${canonicalAlias}.current_emp_name, ''),
    NULLIF(${canonicalAlias}.employee_name, ''),
    NULLIF(${employeeAlias}.current_emp_name, ''),
    NULLIF(${employeeAlias}.employee_name, ''),
    NULLIF(${viewAlias}.employee_name, '')
  )`;
}

function matrixCurrentHrLocCodeSql(canonicalAlias = 'canonical', employeeAlias = 'e', viewAlias = 'v') {
  return `COALESCE(
    NULLIF(${canonicalAlias}.current_hr_loc_code, ''),
    NULLIF(${canonicalAlias}.hr_loc_code, ''),
    NULLIF(${employeeAlias}.current_hr_loc_code, ''),
    NULLIF(${employeeAlias}.hr_loc_code, ''),
    NULLIF(${viewAlias}.division_code, ''),
    NULLIF(${viewAlias}.zkteco_machine_code, '')
  )`;
}

function resolvedHrLocCodeSql(alias = 'e') {
  return `NULLIF(LTRIM(RTRIM(${alias}.hr_loc_code)), '')`;
}

/**
 * Mapping reason for UI display.
 */
function resolvedMappingReasonSql(alias = 's') {
  const rawLength = rawDeviceUserIdLengthSql(alias);
  const empCode = resolvedEmployeeCodeSql(alias);
  const empName = resolvedEmployeeNameSql(alias);
  return `CASE
    WHEN ${rawLength} <= 5 THEN 'RAW_ID_TOO_SHORT_EXCLUDED'
    WHEN ${empCode} IS NOT NULL AND ${empName} IS NOT NULL THEN 'MAPPED_VIA_EMPLOYEES_TABLE'
    WHEN ${empCode} IS NOT NULL THEN 'MAPPED_VIA_EMPLOYEES_TABLE_PENDING_NAME'
    WHEN ${rawLength} > 5 THEN 'CURRENT_EMP_CODE_NOT_FOUND_NEED_REVIEW'
    ELSE 'UNKNOWN'
  END`;
}

function machineSourceFilterSql(expression: string) {
  return `(
    @source IS NULL
    OR (${expression} = @source)
    OR (@source IN ('ZKTECO', 'DIRECT_ZKTECO') AND ${expression} IN ('ZKTECO', 'DIRECT_ZKTECO'))
  )`;
}

async function safeQuery<T>(statement: string, params: Array<{ name: string; type: any; value: unknown }> = []): Promise<T[]> {
  try {
    return await query<T>(statement, params as any);
  } catch {
    return [];
  }
}

async function checkTableExists(table: string): Promise<boolean> {
  const rows = await safeQuery<{ found: number }>(`
    SELECT 1 AS found
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @table
  `, [{ name: 'table', type: sql.NVarChar, value: table }]);
  return rows.length > 0;
}

async function loadAvailableMonthsRows() {
  const fromView = await safeQuery<{ attendance_year: number; attendance_month: number }>(`
    SELECT DISTINCT
      YEAR(CAST(attendance_date AS DATE)) AS attendance_year,
      MONTH(CAST(attendance_date AS DATE)) AS attendance_month
    FROM vw_attendance_monthly_matrix
    ORDER BY attendance_year DESC, attendance_month DESC
  `);
  if (fromView.length > 0) return fromView;

  const fallback = await safeQuery<{ attendance_year: number; attendance_month: number }>(`
    SELECT DISTINCT
      YEAR(attendance_date) AS attendance_year,
      MONTH(attendance_date) AS attendance_month
    FROM (
      SELECT CAST(attendance_date AS DATE) AS attendance_date
      FROM attendance_imports
      UNION
      SELECT CAST(scan_date AS DATE) AS attendance_date
      FROM attendance_scan_logs
    ) src
    ORDER BY attendance_year DESC, attendance_month DESC
  `);
  return fallback;
}

function emptyCorrectionDailySql() {
  return `
    correction_daily AS (
      SELECT
        CAST(NULL AS NVARCHAR(30)) AS employee_code,
        CAST(NULL AS DATE) AS attendance_date,
        CAST(NULL AS DATETIME2) AS check_in_at,
        CAST(NULL AS DATETIME2) AS check_out_at,
        CAST(NULL AS NVARCHAR(30)) AS attendance_status,
        CAST(NULL AS BIT) AS is_leave,
        CAST(NULL AS BIT) AS is_sick,
        CAST(NULL AS BIT) AS is_holiday,
        CAST(NULL AS DECIMAL(8,2)) AS overtime_hours
      WHERE 1 = 0
    )`;
}

function weekDayIndexSql(dateExpression: string) {
  return `(ABS(DATEDIFF(DAY, '19000107', ${dateExpression})) % 7)`;
}

function weekDayIndexFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return 0;
  return new Date(year, month - 1, day).getDay();
}

function attendanceCalendarSql() {
  return `SELECT CAST(holiday_date AS DATE) AS holiday_date, holiday_name FROM attendance_holiday`;
}

async function loadAttendanceCalendarRows() {
  const merged = new Map<string, { holiday_date: string; holiday_name: string | null }>();
  const sources = [
    'SELECT CAST(holiday_date AS DATE) AS holiday_date, holiday_name FROM attendance_holiday',
    'SELECT CAST(holiday_date AS DATE) AS holiday_date, holiday_name FROM holidays',
  ];
  for (const statement of sources) {
    const rows = await safeQuery<{ holiday_date: string; holiday_name: string | null }>(statement);
    for (const row of rows) {
      const key = String(row.holiday_date).slice(0, 10);
      if (!merged.has(key)) {
        merged.set(key, row);
      }
    }
  }
  return Array.from(merged.values());
}

function workConfigSql() {
  return `SELECT day_of_week, is_workday, day_name FROM attendance_work_config`;
}

async function loadWorkConfigRows() {
  const rows = await safeQuery<{ day_of_week: number; is_workday: number | null; day_name: string | null; work_start_time?: string | null; work_end_time?: string | null }>(workConfigSql());
  if (rows.length > 0) return rows;
  return [
    { day_of_week: 0, is_workday: 0, day_name: 'Sunday' },
    { day_of_week: 6, is_workday: 0, day_name: 'Saturday' },
  ];
}

function expectedStatusSql(dateExpression: string) {
  return `CASE
    WHEN EXISTS (
      SELECT 1
      FROM (${attendanceCalendarSql()}) h
      WHERE h.holiday_date = ${dateExpression}
    ) THEN 'HOLIDAY'
    WHEN EXISTS (
      SELECT 1
      FROM (${workConfigSql()}) wc
      WHERE wc.day_of_week = ${weekDayIndexSql(dateExpression)}
        AND COALESCE(wc.is_workday, 1) = 0
    ) THEN 'OFF_DAY'
    ELSE 'WORKDAY'
  END`;
}

function normalizeAttendanceStatusCaseSql(expression: string) {
  return `CASE
    WHEN UPPER(${expression}) IN ('PRESENT','HADIR') THEN 'HADIR'
    WHEN UPPER(${expression}) IN ('ABSENT','ALPHA','TIDAK_HADIR') THEN 'TIDAK_HADIR'
    WHEN UPPER(${expression}) IN ('SAKIT','SICK') THEN 'SAKIT'
    WHEN UPPER(${expression}) IN ('CUTI','IZIN','LEAVE') THEN 'CUTI'
    WHEN UPPER(${expression}) IN ('HOLIDAY','LIBUR') THEN 'HOLIDAY'
    WHEN UPPER(${expression}) IN ('OFF_DAY','REST_DAY','LIBUR_KERJA') THEN 'OFF_DAY'
    WHEN UPPER(${expression}) = 'MANUAL_CORRECTION' THEN 'MANUAL_CORRECTION'
    WHEN UPPER(${expression}) = 'INCOMPLETE_SCAN' THEN 'INCOMPLETE_SCAN'
    WHEN UPPER(${expression}) = 'SCAN_ON_OFFDAY' THEN 'SCAN_ON_OFFDAY'
    WHEN UPPER(${expression}) = 'SCAN_ON_HOLIDAY' THEN 'SCAN_ON_HOLIDAY'
    WHEN UPPER(${expression}) = 'SCAN_ON_OFFDAY_INCOMPLETE' THEN 'SCAN_ON_OFFDAY_INCOMPLETE'
    WHEN UPPER(${expression}) = 'SCAN_ON_HOLIDAY_INCOMPLETE' THEN 'SCAN_ON_HOLIDAY_INCOMPLETE'
    ELSE NULL
  END`;
}

// ─── Monthly Matrix (final status database mode + raw machine mode) ─────────
route('GET', '/api/attendance/monthly-matrix', async (ctx) => {
  const year = Number(ctx.query.get('year') ?? new Date().getFullYear());
  const month = Number(ctx.query.get('month') ?? new Date().getMonth() + 1);
  const division = ctx.query.get('divisionCode');
  const machineCode = ctx.query.get('machineCode');
  const status = ctx.query.get('status');
  const mapping = ctx.query.get('mapping');
  const source = ctx.query.get('source');
  const mode = ctx.query.get('mode') === 'datamesin' ? 'datamesin' : 'database';
  const activeOnly = ctx.query.get('activeOnly') !== 'false';
  const searchRaw = ctx.query.get('search') ?? '';
  const search = `%${searchRaw}%`;
  const page = Math.max(Number(ctx.query.get('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(ctx.query.get('pageSize') ?? ctx.query.get('limit') ?? 100), 1), 500);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const params = [
    { name: 'startDate', type: sql.Date, value: startDate },
    { name: 'division', type: sql.NVarChar, value: division },
    { name: 'machineCode', type: sql.NVarChar, value: machineCode },
    { name: 'search', type: sql.NVarChar, value: search },
    { name: 'searchRaw', type: sql.NVarChar, value: searchRaw },
    { name: 'status', type: sql.NVarChar, value: status },
    { name: 'mapping', type: sql.NVarChar, value: mapping },
    { name: 'source', type: sql.NVarChar, value: source },
    { name: 'activeOnly', type: sql.Bit, value: activeOnly },
    { name: 'offset', type: sql.Int, value: (page - 1) * pageSize },
    { name: 'pageSize', type: sql.Int, value: pageSize },
  ];

  // DATABASE mode: use attendance_imports directly (fast, no slow view).
  // Bypasses the legacy vw_attendance_monthly_matrix query that hangs on large data.
  if (mode === 'database') {
    const result = await getProcessedMatrix({ year, month, division, machineCode, status, mapping, source, search: searchRaw, activeOnly, page, pageSize });
    sendEnvelope(ctx.res, 200, result, {
      page,
      page_size: pageSize,
      total: result.pagination.total,
      source: 'final_attendance_matrix',
      mode,
      period: `${year}-${String(month).padStart(2, '0')}`,
    });
    return;
  }

  if ((mode as string) === 'database' && searchRaw.trim() !== '') {
    const searchCandidates = await query<{
      resolved_employee_code: string | null;
      current_emp_code: string | null;
      employee_code: string | null;
      employee_name: string | null;
      current_hr_loc_code: string | null;
      hr_loc_code: string | null;
      raw_device_user_id: string | null;
      zkteco_user_id: string | null;
    }>(`
      SELECT DISTINCT
        COALESCE(NULLIF(e.current_emp_code, ''), NULLIF(e.employee_code, '')) AS resolved_employee_code,
        NULLIF(e.current_emp_code, '') AS current_emp_code,
        NULLIF(e.employee_code, '') AS employee_code,
        NULLIF(e.employee_name, '') AS employee_name,
        NULLIF(e.current_hr_loc_code, '') AS current_hr_loc_code,
        NULLIF(e.hr_loc_code, '') AS hr_loc_code,
        NULLIF(e.raw_device_user_id, '') AS raw_device_user_id,
        NULLIF(e.zkteco_user_id, '') AS zkteco_user_id
      FROM employees e
      WHERE (
        e.employee_code LIKE @search
        OR e.employee_name LIKE @search
        OR e.current_emp_code LIKE @search
        OR e.current_emp_name LIKE @search
        OR e.zkteco_user_id LIKE @search
        OR e.raw_device_user_id LIKE @search
        OR e.hr_loc_code LIKE @search
        OR e.current_hr_loc_code LIKE @search
      )
        AND (
          @division IS NULL
          OR COALESCE(NULLIF(e.current_hr_loc_code, ''), NULLIF(e.hr_loc_code, '')) = @division
        )
    `, [
      { name: 'search', type: sql.NVarChar, value: search },
      { name: 'division', type: sql.NVarChar, value: division },
    ]);

    const candidateCodes = Array.from(new Set(searchCandidates.flatMap((row) => [
      row.resolved_employee_code,
      row.current_emp_code,
      row.employee_code,
    ].filter((value): value is string => Boolean(value && value.trim())))));

    if (candidateCodes.length === 0) {
      sendEnvelope(ctx.res, 200, {
        rows: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      }, {
        page,
        page_size: pageSize,
        total: 0,
        source: 'final_attendance_matrix',
        mode,
        period: `${year}-${String(month).padStart(2, '0')}`,
      });
      return;
    }

    const candidateCodesJson = JSON.stringify(candidateCodes);
    const rows = await query<any>(`
      WITH candidate_codes AS (
        SELECT DISTINCT value AS employee_code
        FROM OPENJSON(@candidateCodesJson)
      ),
      base_rows AS (
        SELECT
          COALESCE(NULLIF(canonical.current_emp_code, ''), NULLIF(e.current_emp_code, ''), NULLIF(e.employee_code, ''), NULLIF(v.employee_code, '')) AS identity_key,
          COALESCE(NULLIF(canonical.current_emp_code, ''), NULLIF(e.current_emp_code, ''), NULLIF(e.employee_code, ''), NULLIF(v.employee_code, '')) AS current_emp_code,
          COALESCE(NULLIF(canonical.current_emp_code, ''), NULLIF(e.current_emp_code, ''), NULLIF(e.employee_code, ''), NULLIF(v.employee_code, '')) AS employee_code,
          COALESCE(NULLIF(canonical.current_emp_name, ''), NULLIF(canonical.employee_name, ''), NULLIF(e.current_emp_name, ''), NULLIF(e.employee_name, ''), v.employee_name) AS employee_name,
          COALESCE(NULLIF(canonical.current_hr_loc_code, ''), NULLIF(canonical.hr_loc_code, ''), NULLIF(e.current_hr_loc_code, ''), NULLIF(e.hr_loc_code, ''), v.division_code, v.zkteco_machine_code) AS division_code,
          COALESCE(d_hr.division_name, v.division_name, v.zkteco_machine_code) AS division_name,
          COALESCE(NULLIF(canonical.current_hr_loc_code, ''), NULLIF(canonical.hr_loc_code, ''), NULLIF(e.current_hr_loc_code, ''), NULLIF(e.hr_loc_code, ''), v.division_code, v.zkteco_machine_code) AS current_hr_loc_code,
          COALESCE(canonical.id, e.id, v.employee_id) AS employee_id,
          v.attendance_date,
          COALESCE(v.final_status, CASE WHEN v.final_check_in IS NOT NULL THEN 'HADIR' ELSE 'NO_DATA' END) AS final_status,
          CASE
            WHEN v.source IS NOT NULL AND v.source != 'NO_DATA' THEN v.source
            WHEN v.final_check_in IS NOT NULL THEN 'ZKTECO'
            ELSE 'NO_DATA'
          END AS source,
          v.final_check_in,
          v.final_check_out,
          CASE
            WHEN v.final_check_in IS NOT NULL AND v.final_check_out IS NOT NULL THEN 2
            WHEN v.final_check_in IS NOT NULL THEN 1
            ELSE 0
          END AS scan_count,
          COALESCE(CAST(v.zkteco_machine_code AS NVARCHAR(30)), NULLIF(e.raw_device_user_id, ''), NULLIF(e.zkteco_user_id, '')) AS machine_code,
          COALESCE(NULLIF(e.raw_device_user_id, ''), NULLIF(e.zkteco_user_id, '')) AS raw_device_user_id,
          CASE WHEN v.source = 'MANUAL_CORRECTION' THEN 1 ELSE 0 END AS has_manual_correction,
          CAST(COALESCE(v.is_leave, 0) AS INT) AS is_leave,
          CAST(COALESCE(v.is_sick, 0) AS INT) AS is_sick,
          CAST(COALESCE(v.is_holiday, 0) AS INT) AS is_holiday,
          COALESCE(v.final_status, CASE WHEN v.final_check_in IS NOT NULL THEN 'HADIR' ELSE 'NO_DATA' END) AS ui_status,
          CASE WHEN v.final_status IS NOT NULL THEN 'MAPPED' ELSE 'NEED_REVIEW' END AS mapping_status,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(NULLIF(canonical.current_emp_code, ''), NULLIF(e.current_emp_code, ''), NULLIF(e.employee_code, ''), NULLIF(v.employee_code, '')), v.attendance_date
            ORDER BY
              CASE WHEN v.source = 'MANUAL_CORRECTION' THEN 0 ELSE 1 END,
              CASE WHEN v.final_check_in IS NOT NULL THEN 0 ELSE 1 END,
              e.employee_code
          ) AS identity_rn
        FROM vw_attendance_monthly_matrix v
        INNER JOIN candidate_codes cc ON cc.employee_code = v.employee_code
        LEFT JOIN employees e ON e.employee_code = v.employee_code
        LEFT JOIN employees canonical ON canonical.employee_code = COALESCE(NULLIF(e.current_emp_code, ''), v.employee_code)
        LEFT JOIN divisions d_hr ON d_hr.division_code = COALESCE(NULLIF(canonical.current_hr_loc_code, ''), NULLIF(canonical.hr_loc_code, ''), NULLIF(e.current_hr_loc_code, ''), NULLIF(e.hr_loc_code, ''))
        WHERE v.attendance_date >= @startDate
          AND v.attendance_date <= EOMONTH(@startDate)
          AND (@division IS NULL OR COALESCE(NULLIF(canonical.current_hr_loc_code, ''), NULLIF(canonical.hr_loc_code, ''), NULLIF(e.current_hr_loc_code, ''), NULLIF(e.hr_loc_code, ''), v.division_code, v.zkteco_machine_code) = @division)
          AND (@machineCode IS NULL OR COALESCE(CAST(v.zkteco_machine_code AS NVARCHAR(30)), NULLIF(e.raw_device_user_id, ''), NULLIF(e.zkteco_user_id, '')) = @machineCode)
      ),
      deduped_rows AS (
        SELECT *
        FROM base_rows
        WHERE identity_rn = 1
      ),
      filtered_employees AS (
        SELECT
          identity_key,
          MIN(employee_name) AS employee_name,
          ROW_NUMBER() OVER (
            ORDER BY MIN(division_code), identity_key
          ) AS rn,
          COUNT(*) OVER () AS total_rows
        FROM deduped_rows
        GROUP BY identity_key
      ),
      paged AS (
        SELECT * FROM filtered_employees WHERE rn > @offset AND rn <= (@offset + @pageSize)
      )
      SELECT
        fr.*,
        p.total_rows
      FROM deduped_rows fr
      INNER JOIN paged p ON p.identity_key = fr.identity_key
      ORDER BY p.rn, fr.attendance_date`,
      [
        { name: 'candidateCodesJson', type: sql.NVarChar, value: candidateCodesJson },
        { name: 'startDate', type: sql.Date, value: startDate },
        { name: 'division', type: sql.NVarChar, value: division },
        { name: 'machineCode', type: sql.NVarChar, value: machineCode },
        { name: 'offset', type: sql.Int, value: (page - 1) * pageSize },
        { name: 'pageSize', type: sql.Int, value: pageSize },
      ]);

    const total = Number(rows[0]?.total_rows ?? 0);
    sendEnvelope(ctx.res, 200, {
      rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    }, {
      page,
      page_size: pageSize,
      total,
      source: 'final_attendance_matrix',
      mode,
      period: `${year}-${String(month).padStart(2, '0')}`,
    });
    return;
  }

  if (mode === 'datamesin') {
    const rows = await query<any>(`
      WITH scan_rows AS (
        SELECT
          s.raw_device_user_id,
          s.parsed_employee_code,
          COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) AS employee_code,
          NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '') AS zkteco_user_name,
          s.machine_code,
          CAST(s.scan_date AS DATE) AS attendance_date,
          s.scan_time,
          s.mapping_status,
          s.mapping_reason,
          LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))) AS raw_id_length
        FROM attendance_scan_logs s
        WHERE s.scan_date >= @startDate
          AND s.scan_date <= EOMONTH(@startDate)
          AND (@machineCode IS NULL OR s.machine_code = @machineCode)
          AND (
            @searchRaw = ''
            OR s.raw_device_user_id = @searchRaw
            OR s.raw_device_user_id LIKE @search
            OR s.parsed_employee_code LIKE @search
            OR COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) LIKE @search
            OR NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '') LIKE @search
          )
      ),
      raw_daily AS (
        SELECT
          raw_device_user_id,
          employee_code,
          MAX(parsed_employee_code) AS parsed_employee_code,
          MAX(zkteco_user_name) AS zkteco_user_name,
          machine_code,
          attendance_date,
          MIN(scan_time) AS final_check_in,
          CASE WHEN COUNT(DISTINCT CONVERT(VARCHAR(19), scan_time, 120)) >= 2 THEN MAX(scan_time) ELSE NULL END AS final_check_out,
          COUNT(DISTINCT CONVERT(VARCHAR(19), scan_time, 120)) AS scan_count,
          MAX(CASE WHEN employee_code IS NOT NULL THEN 1 ELSE 0 END) AS is_mapped,
          MAX(mapping_status) AS mapping_status,
          MAX(mapping_reason) AS mapping_reason,
          MAX(raw_id_length) AS raw_id_length
        FROM scan_rows
        GROUP BY raw_device_user_id, employee_code, machine_code, attendance_date
      ),
      raw_keys AS (
        SELECT
          raw_device_user_id,
          employee_code,
          MAX(parsed_employee_code) AS parsed_employee_code,
          MAX(zkteco_user_name) AS zkteco_user_name,
          machine_code,
          CASE WHEN MAX(is_mapped) = 1 THEN 'MAPPED' ELSE 'NEED_REVIEW' END AS mapping_status,
          CASE
            WHEN MAX(is_mapped) = 1 THEN MAX(mapping_reason)
            WHEN MAX(raw_id_length) <= 5 THEN 'RAW_ID_TOO_SHORT_EXCLUDED'
            ELSE 'CURRENT_EMP_CODE_NOT_FOUND_NEED_REVIEW'
          END AS mapping_reason,
          MAX(raw_id_length) AS raw_id_length,
          ROW_NUMBER() OVER (ORDER BY machine_code, raw_device_user_id) AS rn,
          COUNT(*) OVER () AS total_rows
        FROM raw_daily
        WHERE (@mapping IS NULL OR (@mapping = 'MAPPED' AND is_mapped = 1) OR (@mapping IN ('UNMAPPED', 'NEED_REVIEW') AND is_mapped = 0))
        GROUP BY raw_device_user_id, employee_code, machine_code
      ),
      paged AS (
        SELECT * FROM raw_keys WHERE rn > @offset AND rn <= (@offset + @pageSize)
      )
      SELECT
        p.raw_device_user_id,
        p.employee_code,
        p.parsed_employee_code,
        COALESCE(NULLIF(e.employee_name, ''), rd.zkteco_user_name, rd.raw_device_user_id) AS employee_name,
        COALESCE(d.division_code, p.machine_code) AS division_code,
        d.division_name,
        p.machine_code,
        p.mapping_status,
        p.mapping_reason,
        p.raw_id_length,
        rd.attendance_date,
        CASE WHEN rd.scan_count = 1 THEN 'INCOMPLETE_SCAN' ELSE 'HADIR' END AS final_status,
        'ZKTECO' AS source,
        rd.final_check_in,
        rd.final_check_out,
        rd.scan_count,
        p.total_rows
      FROM paged p
      INNER JOIN raw_daily rd
        ON rd.raw_device_user_id = p.raw_device_user_id
       AND rd.machine_code = p.machine_code
      LEFT JOIN employees e ON e.employee_code = p.employee_code
      LEFT JOIN divisions d ON d.id = e.division_id
      WHERE (@division IS NULL OR d.division_code = @division OR p.machine_code = @division)
        AND (@status IS NULL OR @status = 'HADIR')
        AND (@source IS NULL OR @source IN ('ZKTECO','DIRECT_ZKTECO'))
      ORDER BY p.rn, rd.attendance_date`,
      params);

    const total = Number(rows[0]?.total_rows ?? 0);
    sendEnvelope(ctx.res, 200, {
      rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    }, {
      page,
      page_size: pageSize,
      total,
      source: 'attendance_scan_logs',
      mode,
      period: `${year}-${String(month).padStart(2, '0')}`,
    });
    return;
  }

  const normalizedStatus = normalizeMatrixStatusSql('COALESCE(v.final_status, CASE WHEN r.employee_code IS NOT NULL THEN \'HADIR\' ELSE \'NO_DATA\' END)');
  const rows = await query<any>(`
    WITH scan_rows AS (
      SELECT
        s.raw_device_user_id,
        s.parsed_employee_code,
        COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) AS employee_code,
        NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '') AS zkteco_user_name,
        s.machine_code,
        CAST(s.scan_date AS DATE) AS attendance_date,
        s.scan_time,
        s.mapping_status
      FROM attendance_scan_logs s
      WHERE s.scan_date >= @startDate
        AND s.scan_date <= EOMONTH(@startDate)
        AND COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) IS NOT NULL
        AND (@machineCode IS NULL OR s.machine_code = @machineCode)
    ),
    raw_daily AS (
      SELECT
        raw_device_user_id,
        employee_code,
        MAX(parsed_employee_code) AS parsed_employee_code,
        MAX(zkteco_user_name) AS zkteco_user_name,
        machine_code,
        attendance_date,
        MIN(scan_time) AS raw_check_in,
        MAX(scan_time) AS raw_check_out,
        COUNT(DISTINCT CONVERT(VARCHAR(19), scan_time, 120)) AS scan_count,
        MAX(CASE WHEN employee_code IS NOT NULL THEN 1 ELSE 0 END) AS is_mapped,
        MAX(mapping_status) AS mapping_status
      FROM scan_rows
      GROUP BY raw_device_user_id, employee_code, machine_code, attendance_date
    ),
    search_candidates AS (
      SELECT DISTINCT
        COALESCE(NULLIF(e.current_emp_code, ''), NULLIF(e.employee_code, '')) AS resolved_employee_code
      FROM employees e
      WHERE @searchRaw <> ''
        AND COALESCE(NULLIF(e.current_emp_code, ''), NULLIF(e.employee_code, '')) IS NOT NULL
        AND (
          e.employee_code LIKE @search
          OR e.employee_name LIKE @search
          OR e.current_emp_code LIKE @search
          OR e.current_emp_name LIKE @search
          OR e.zkteco_user_id LIKE @search
          OR e.raw_device_user_id LIKE @search
          OR e.hr_loc_code LIKE @search
          OR e.current_hr_loc_code LIKE @search
        )
    ),
    resolved_rows AS (
      SELECT
        v.employee_id,
        v.attendance_date,
        v.final_status AS view_final_status,
        v.source AS view_source,
        v.final_check_in AS view_final_check_in,
        v.final_check_out AS view_final_check_out,
        v.division_name AS view_division_name,
        v.zkteco_machine_code,
        e.id AS source_employee_id,
        e.employee_code AS source_employee_code,
        canonical.id AS canonical_id,
        id_resolved.resolved_employee_code,
        id_resolved.resolved_employee_name,
        id_resolved.resolved_hr_loc_code,
        COALESCE(d_hr.division_name, v.division_name, v.zkteco_machine_code) AS resolved_division_name,
        r.employee_code AS raw_employee_code,
        r.raw_check_in,
        r.raw_check_out,
        COALESCE(r.scan_count, 0) AS scan_count,
        COALESCE(CAST(v.zkteco_machine_code AS NVARCHAR(30)), r.machine_code) AS machine_code,
        r.raw_device_user_id,
        CASE WHEN r.employee_code IS NULL THEN 'NEED_REVIEW' WHEN r.is_mapped = 1 THEN 'MAPPED' ELSE 'NEED_REVIEW' END AS mapping_status,
        CASE WHEN v.source = 'MANUAL_CORRECTION' THEN 1 ELSE 0 END AS has_manual_correction,
        CAST(COALESCE(v.is_leave, 0) AS INT) AS is_leave,
        CAST(COALESCE(v.is_sick, 0) AS INT) AS is_sick,
        CAST(COALESCE(v.is_holiday, 0) AS INT) AS is_holiday,
        ${normalizedStatus} AS ui_status
      FROM vw_attendance_monthly_matrix v
      LEFT JOIN employees e ON e.employee_code = v.employee_code
      LEFT JOIN employees canonical ON canonical.employee_code = COALESCE(NULLIF(e.current_emp_code, ''), v.employee_code)
      CROSS APPLY (
        SELECT
          COALESCE(
            NULLIF(canonical.current_emp_code, ''),
            NULLIF(e.current_emp_code, ''),
            NULLIF(canonical.employee_code, ''),
            NULLIF(e.employee_code, ''),
            NULLIF(v.employee_code, '')
          ) AS resolved_employee_code,
          COALESCE(
            NULLIF(canonical.current_emp_name, ''),
            NULLIF(canonical.employee_name, ''),
            NULLIF(e.current_emp_name, ''),
            NULLIF(e.employee_name, ''),
            NULLIF(v.employee_name, '')
          ) AS resolved_employee_name,
          COALESCE(
            NULLIF(canonical.current_hr_loc_code, ''),
            NULLIF(canonical.hr_loc_code, ''),
            NULLIF(e.current_hr_loc_code, ''),
            NULLIF(e.hr_loc_code, ''),
            NULLIF(v.division_code, ''),
            NULLIF(v.zkteco_machine_code, '')
          ) AS resolved_hr_loc_code
      ) id_resolved
      LEFT JOIN divisions d_hr ON d_hr.division_code = id_resolved.resolved_hr_loc_code
      LEFT JOIN raw_daily r ON r.employee_code = id_resolved.resolved_employee_code
        AND r.attendance_date = v.attendance_date
      WHERE v.attendance_date >= @startDate
        AND v.attendance_date <= EOMONTH(@startDate)
        AND (@activeOnly = 0 OR EXISTS (SELECT 1 FROM employees ex WHERE ex.employee_code = id_resolved.resolved_employee_code AND ex.is_active = 1))
        AND (@division IS NULL OR id_resolved.resolved_hr_loc_code = @division)
        AND (
          @searchRaw = ''
          OR EXISTS (
            SELECT 1
            FROM search_candidates sc
            WHERE sc.resolved_employee_code = id_resolved.resolved_employee_code
          )
        )
        AND (@machineCode IS NULL OR COALESCE(CAST(v.zkteco_machine_code AS NVARCHAR(30)), r.machine_code) = @machineCode)
    ),
    final_rows AS (
      SELECT
        resolved_employee_code AS identity_key,
        resolved_employee_code AS current_emp_code,
        resolved_employee_code AS employee_code,
        resolved_employee_name AS employee_name,
        resolved_hr_loc_code AS division_code,
        resolved_division_name AS division_name,
        resolved_hr_loc_code AS current_hr_loc_code,
        COALESCE(canonical_id, source_employee_id, employee_id) AS employee_id,
        attendance_date,
        COALESCE(view_final_status, CASE WHEN raw_employee_code IS NOT NULL THEN 'HADIR' ELSE 'NO_DATA' END) AS final_status,
        CASE
          WHEN view_source IS NOT NULL AND view_source != 'NO_DATA' THEN view_source
          WHEN raw_employee_code IS NOT NULL THEN 'ZKTECO'
          ELSE 'NO_DATA'
        END AS source,
        COALESCE(view_final_check_in, raw_check_in) AS final_check_in,
        COALESCE(view_final_check_out, raw_check_out) AS final_check_out,
        scan_count,
        machine_code,
        raw_device_user_id,
        mapping_status,
        has_manual_correction,
        is_leave,
        is_sick,
        is_holiday,
        ui_status,
        ROW_NUMBER() OVER (
          PARTITION BY resolved_employee_code, attendance_date
          ORDER BY
            CASE WHEN view_source = 'MANUAL_CORRECTION' THEN 0 ELSE 1 END,
            CASE WHEN scan_count > 0 OR COALESCE(view_final_status, 'NO_DATA') <> 'NO_DATA' THEN 0 ELSE 1 END,
            CASE WHEN source_employee_code = resolved_employee_code THEN 0 ELSE 1 END,
            scan_count DESC,
            source_employee_code
        ) AS identity_rn
      FROM resolved_rows
    ),
    deduped_rows AS (
      SELECT *
      FROM final_rows
      WHERE identity_rn = 1
    ),
    filtered_employees AS (
      SELECT
        identity_key,
        MIN(employee_name) AS employee_name,
        ROW_NUMBER() OVER (
          ORDER BY MIN(division_code), identity_key
        ) AS rn,
        COUNT(*) OVER () AS total_rows
      FROM deduped_rows
      GROUP BY identity_key
      HAVING (@status IS NULL OR SUM(CASE WHEN ui_status = @status THEN 1 ELSE 0 END) > 0)
        AND (@mapping IS NULL OR SUM(CASE WHEN mapping_status = @mapping THEN 1 ELSE 0 END) > 0)
        AND SUM(CASE WHEN ${machineSourceFilterSql('source')} THEN 1 ELSE 0 END) > 0
    ),
    paged AS (
      SELECT * FROM filtered_employees WHERE rn > @offset AND rn <= (@offset + @pageSize)
    )
    SELECT
      fr.*,
      p.total_rows
    FROM deduped_rows fr
    INNER JOIN paged p ON p.identity_key = fr.identity_key
    ORDER BY p.rn, fr.attendance_date
    OPTION (MAXRECURSION 370)`,
    params);

  const total = Number(rows[0]?.total_rows ?? 0);
  sendEnvelope(ctx.res, 200, {
    rows,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }, {
    page,
    page_size: pageSize,
    total,
    source: 'final_attendance_matrix',
    mode,
    period: `${year}-${String(month).padStart(2, '0')}`,
  });
});

route('GET', '/api/attendance/monthly-matrix-traceable', async (ctx) => {
  const year = Number(ctx.query.get('year') ?? new Date().getFullYear());
  const month = Number(ctx.query.get('month') ?? new Date().getMonth() + 1);
  const division = ctx.query.get('divisionCode');
  const machineCode = ctx.query.get('machineCode');
  const status = ctx.query.get('status');
  const mapping = ctx.query.get('mapping');
  const source = ctx.query.get('source');
  const searchRaw = ctx.query.get('search') ?? '';
  const search = `%${searchRaw}%`;
  const page = Math.max(Number(ctx.query.get('page') ?? 1), 1);
  const pageSize = Math.min(Math.max(Number(ctx.query.get('pageSize') ?? ctx.query.get('limit') ?? 100), 1), 500);
  const activeOnly = ctx.query.get('activeOnly') !== 'false';
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const params = [
    { name: 'startDate', type: sql.Date, value: startDate },
    { name: 'division', type: sql.NVarChar, value: division },
    { name: 'machineCode', type: sql.NVarChar, value: machineCode },
    { name: 'search', type: sql.NVarChar, value: search },
    { name: 'searchRaw', type: sql.NVarChar, value: searchRaw },
    { name: 'status', type: sql.NVarChar, value: status },
    { name: 'mapping', type: sql.NVarChar, value: mapping },
    { name: 'source', type: sql.NVarChar, value: source },
    { name: 'activeOnly', type: sql.Bit, value: activeOnly },
    { name: 'offset', type: sql.Int, value: (page - 1) * pageSize },
    { name: 'pageSize', type: sql.Int, value: pageSize },
  ];

  const hasManualCorrections = await checkTableExists('attendance_manual_corrections');
  const holidayRows = await loadAttendanceCalendarRows();
  const workRows = await loadWorkConfigRows();
  const holidayMap = new Map(holidayRows.map((row) => [String(row.holiday_date).slice(0, 10), row]));
  const workMap = new Map(workRows.map((row) => [Number(row.day_of_week), row]));
  const correctionDailyCte = hasManualCorrections
    ? `
    correction_daily AS (
      SELECT *
      FROM (
        SELECT
          mc.employee_code,
          mc.attendance_date,
          mc.attendance_status,
          mc.check_in_at,
          mc.check_out_at,
          mc.is_leave,
          mc.is_sick,
          mc.is_holiday,
          mc.overtime_hours,
          ROW_NUMBER() OVER (
            PARTITION BY mc.employee_code, mc.attendance_date
            ORDER BY mc.updated_at DESC, mc.created_at DESC, mc.id DESC
          ) AS rn
        FROM attendance_manual_corrections mc
        WHERE mc.is_deleted = 0
          AND mc.attendance_date >= @startDate
          AND mc.attendance_date <= EOMONTH(@startDate)
      ) x
      WHERE x.rn = 1
    )`
    : emptyCorrectionDailySql();

  const rows = await query<any>(`
    WITH calendar_days AS (
      SELECT CAST(@startDate AS DATE) AS attendance_date
      UNION ALL
      SELECT DATEADD(DAY, 1, attendance_date)
      FROM calendar_days
      WHERE attendance_date < EOMONTH(@startDate)
    ),
    scan_rows AS (
      SELECT
        COALESCE(COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code), s.raw_device_user_id) AS employee_code,
        COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) AS resolved_employee_code,
        s.raw_device_user_id,
        s.machine_code,
        CAST(s.scan_date AS DATE) AS attendance_date,
        s.scan_time,
        s.mapping_status
      FROM attendance_scan_logs s
      WHERE s.scan_date >= @startDate
        AND s.scan_date <= EOMONTH(@startDate)
        AND (@machineCode IS NULL OR s.machine_code = @machineCode)
        AND (@searchRaw = '' OR s.raw_device_user_id LIKE @search OR s.parsed_employee_code LIKE @search OR COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) LIKE @search OR NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '') LIKE @search)
    ),
    raw_daily AS (
      SELECT
        employee_code,
        attendance_date,
        MIN(scan_time) AS raw_check_in,
        MAX(scan_time) AS raw_check_out,
        COUNT(DISTINCT CONVERT(VARCHAR(19), scan_time, 120)) AS raw_scan_count,
        MIN(machine_code) AS machine_code,
        COALESCE(
          MAX(CASE WHEN LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 5 THEN raw_device_user_id END),
          MAX(raw_device_user_id)
        ) AS raw_device_user_id,
        MAX(CASE WHEN resolved_employee_code IS NOT NULL THEN 1 ELSE 0 END) AS is_mapped,
        MAX(CASE WHEN resolved_employee_code IS NULL THEN 1 ELSE 0 END) AS needs_review,
        MAX(CASE WHEN mapping_status = 'UNMAPPED' THEN 1 ELSE 0 END) AS is_unmapped
      FROM scan_rows
      GROUP BY employee_code, attendance_date
    ),
    import_daily AS (
      SELECT *
      FROM (
        SELECT
          ai.employee_code,
          ai.attendance_date,
          ai.attendance_status,
          ai.check_in_at,
          ai.check_out_at,
          ai.source,
          ai.source_reference,
          ai.is_leave,
          ai.is_sick,
          ai.is_holiday,
          ai.overtime_hours,
          ROW_NUMBER() OVER (
            PARTITION BY ai.employee_code, ai.attendance_date
            ORDER BY ai.created_at DESC, ai.id DESC
          ) AS rn
        FROM attendance_imports ai
        WHERE ai.attendance_date >= @startDate
          AND ai.attendance_date <= EOMONTH(@startDate)
      ) x
      WHERE x.rn = 1
    ),
    ${correctionDailyCte},
    identity_rows AS (
      SELECT
        CASE
          WHEN ${rawDeviceUserIdLengthSql()} < 5 THEN s.raw_device_user_id
          ELSE COALESCE(COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code), s.raw_device_user_id)
        END AS employee_code,
        COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) AS resolved_employee_code,
        s.raw_device_user_id,
        s.machine_code,
        s.zkteco_user_name AS employee_name,
        COALESCE(d.division_code, s.machine_code) AS division_code,
        COALESCE(d.division_name, s.machine_code) AS division_name,
        COALESCE(g.gang_code, 'N/A') AS gang_code,
        s.mapping_status
      FROM attendance_scan_logs s
      LEFT JOIN employees e ON e.employee_code = COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code)
      LEFT JOIN divisions d ON d.id = e.division_id
      LEFT JOIN gangs g ON g.id = e.gang_id
      WHERE s.scan_date >= @startDate
        AND s.scan_date <= EOMONTH(@startDate)
        AND (@machineCode IS NULL OR s.machine_code = @machineCode)
        AND (@searchRaw = '' OR s.raw_device_user_id LIKE @search OR s.parsed_employee_code LIKE @search OR COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) LIKE @search OR NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '') LIKE @search)
        AND (
          LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))) < 5
          OR COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) IS NULL
        )
    ),
    raw_identity_scope AS (
      SELECT
        employee_code,
        MIN(raw_device_user_id) AS raw_device_user_id,
        MIN(machine_code) AS machine_code,
        MIN(employee_name) AS employee_name,
        MIN(division_code) AS division_code,
        MIN(division_name) AS division_name,
        gang_code,
        MAX(CASE WHEN resolved_employee_code IS NOT NULL THEN 1 ELSE 0 END) AS is_mapped,
        MAX(CASE WHEN resolved_employee_code IS NULL THEN 1 ELSE 0 END) AS needs_review,
        MAX(CASE WHEN mapping_status = 'UNMAPPED' THEN 1 ELSE 0 END) AS is_unmapped
      FROM identity_rows
      GROUP BY
        employee_code,
        gang_code
    ),
    employee_scope AS (
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.employee_name,
        d.division_code,
        d.division_name,
        COALESCE(g.gang_code, 'N/A') AS gang_code,
        ROW_NUMBER() OVER (ORDER BY d.division_code, e.employee_code) AS rn,
        COUNT(*) OVER () AS total_rows
      FROM employees e
      INNER JOIN divisions d ON d.id = e.division_id
      LEFT JOIN gangs g ON g.id = e.gang_id
      WHERE (@activeOnly = 0 OR e.is_active = 1)
        AND (@division IS NULL OR d.division_code = @division)
        AND (
          @searchRaw = ''
          OR e.employee_code LIKE @search
          OR e.employee_name LIKE @search
          OR EXISTS (
            SELECT 1
            FROM raw_daily rd
            WHERE rd.employee_code = e.employee_code
              AND (
                rd.raw_device_user_id LIKE @search
                OR rd.machine_code LIKE @search
              )
          )
          OR EXISTS (
            SELECT 1
            FROM import_daily idr
            WHERE idr.employee_code = e.employee_code
              AND (
                idr.source_reference LIKE @search
                OR idr.source LIKE @search
              )
          )
        )
        AND (
          @machineCode IS NULL
          OR EXISTS (
            SELECT 1 FROM raw_daily rd
            WHERE rd.employee_code = e.employee_code
              AND rd.machine_code = @machineCode
          )
          OR EXISTS (
            SELECT 1 FROM import_daily idr
            WHERE idr.employee_code = e.employee_code
              AND idr.source_reference = @machineCode
          )
        )
      UNION ALL
      SELECT
        NULL AS employee_id,
        COALESCE(ris.employee_code, ris.raw_device_user_id) AS employee_code,
        ris.employee_name,
        ris.division_code,
        ris.division_name,
        ris.gang_code,
        100000 + ROW_NUMBER() OVER (ORDER BY ris.division_code, COALESCE(ris.employee_name, ris.raw_device_user_id)) AS rn,
        COUNT(*) OVER () AS total_rows
      FROM raw_identity_scope ris
      WHERE (
        @searchRaw = ''
        OR ris.employee_code LIKE @search
        OR ris.employee_name LIKE @search
        OR ris.raw_device_user_id LIKE @search
      )
        AND (
          @mapping IS NULL
          OR (@mapping = 'MAPPED' AND ris.is_mapped = 1)
          OR (@mapping = 'UNMAPPED' AND ris.is_unmapped = 1)
          OR (@mapping = 'NEED_REVIEW' AND ris.needs_review = 1)
        )
    ),
    paged_employees AS (
      SELECT *
      FROM employee_scope
      WHERE rn > @offset AND rn <= (@offset + @pageSize)
    )
    SELECT
      pe.employee_id,
      pe.employee_code,
      pe.employee_name,
      pe.division_code,
      pe.division_name,
      pe.gang_code,
      pe.rn AS employee_row_number,
      pe.total_rows,
      cd.attendance_date,
      rd.raw_scan_count,
      rd.raw_check_in,
      rd.raw_check_out,
      rd.raw_device_user_id,
      rd.machine_code AS raw_machine_code,
      rd.is_mapped,
      rd.needs_review,
      rd.is_unmapped,
      idr.attendance_status AS import_status,
      idr.check_in_at AS import_check_in,
      idr.check_out_at AS import_check_out,
      idr.source AS import_source,
      idr.source_reference AS import_source_reference,
      idr.is_leave AS import_is_leave,
      idr.is_sick AS import_is_sick,
      idr.is_holiday AS import_is_holiday,
      idr.overtime_hours AS import_overtime_hours,
      mc.attendance_status AS correction_status,
      mc.check_in_at AS correction_check_in,
      mc.check_out_at AS correction_check_out,
      mc.is_leave AS correction_is_leave,
      mc.is_sick AS correction_is_sick,
      mc.is_holiday AS correction_is_holiday,
      mc.overtime_hours AS correction_overtime_hours
    FROM paged_employees pe
    CROSS JOIN calendar_days cd
    LEFT JOIN raw_daily rd
      ON rd.employee_code = pe.employee_code
     AND rd.attendance_date = cd.attendance_date
    LEFT JOIN import_daily idr
      ON idr.employee_code = pe.employee_code
     AND idr.attendance_date = cd.attendance_date
    LEFT JOIN correction_daily mc
      ON mc.employee_code = pe.employee_code
     AND mc.attendance_date = cd.attendance_date
    ORDER BY pe.rn, cd.attendance_date
    OPTION (MAXRECURSION 370)`,
    params);

  const enrichedRows = rows.map((row) => {
    const rawDate = row.attendance_date;
    let attendanceDate: string;
    if (rawDate instanceof Date) {
      attendanceDate = rawDate.toISOString().slice(0, 10);
    } else if (typeof rawDate === 'string') {
      attendanceDate = rawDate.slice(0, 10);
    } else {
      attendanceDate = String(rawDate).slice(0, 10);
    }
    const dayOfWeek = weekDayIndexFromDateKey(attendanceDate);
    const holiday = holidayMap.get(attendanceDate) ?? null;
    const workConfig = workMap.get(dayOfWeek) ?? null;
    const rawScanCount = Number(row.raw_scan_count ?? 0);
    const hasRawScan = rawScanCount > 0;
    const hasImport = !!row.import_status;
    const hasManual = !!row.correction_status;
    const expectedStatus = holiday
      ? 'HOLIDAY'
      : (workConfig && Number(workConfig.is_workday ?? 1) === 0 ? 'OFF_DAY' : 'WORKDAY');

    let finalStatus: string;
    let source: string;
    let traceState: string;
    let reason: string;

    if (hasManual) {
      finalStatus = String(row.correction_status);
      source = 'MANUAL_CORRECTION';
      traceState = 'MANUAL_CORRECTION';
      reason = 'Manual correction';
    } else if (rawScanCount >= 2 && expectedStatus === 'WORKDAY') {
      finalStatus = 'HADIR';
      source = 'ZKTECO';
      traceState = 'RAW_ONLY';
      reason = 'Raw scan valid (>=2)';
    } else if (rawScanCount === 1 && expectedStatus === 'WORKDAY') {
      finalStatus = 'INCOMPLETE_SCAN';
      source = 'ZKTECO';
      traceState = 'RAW_ONLY';
      reason = 'Raw scan kurang dari 2';
    } else if (rawScanCount > 0 && expectedStatus === 'OFF_DAY') {
      finalStatus = rawScanCount === 1 ? 'SCAN_ON_OFFDAY_INCOMPLETE' : 'SCAN_ON_OFFDAY';
      source = 'ZKTECO';
      traceState = 'RAW_ONLY';
      reason = `Raw scan exists on off day${workConfig?.day_name ? ` (${workConfig.day_name})` : ''}`;
    } else if (rawScanCount > 0 && expectedStatus === 'HOLIDAY') {
      finalStatus = rawScanCount === 1 ? 'SCAN_ON_HOLIDAY_INCOMPLETE' : 'SCAN_ON_HOLIDAY';
      source = 'ZKTECO';
      traceState = 'RAW_ONLY';
      reason = `Raw scan exists on holiday${holiday?.holiday_name ? `: ${holiday.holiday_name}` : ''}`;
    } else if (hasImport) {
      finalStatus = String(row.import_status);
      source = String(row.import_source ?? 'IMPORTED');
      traceState = 'IMPORTED';
      reason = 'Data terimport';
    } else if (expectedStatus === 'HOLIDAY') {
      finalStatus = 'HOLIDAY';
      source = 'CALENDAR';
      traceState = 'HOLIDAY';
      reason = `Hari libur${holiday?.holiday_name ? `: ${holiday.holiday_name}` : ''}`;
    } else if (expectedStatus === 'OFF_DAY') {
      finalStatus = 'OFF_DAY';
      source = 'CALENDAR';
      traceState = 'OFF_DAY';
      reason = `Jadwal libur${workConfig?.day_name ? ` (${workConfig.day_name})` : ''}`;
    } else {
      finalStatus = 'NO_DATA';
      source = 'NO_DATA';
      traceState = 'NO_DATA';
      reason = 'Tidak ada raw scan';
    }

    const qualityFlags = [
      !hasRawScan && expectedStatus === 'WORKDAY' ? 'NO_RAW_SCAN' : '',
      rawScanCount === 1 && expectedStatus === 'WORKDAY' ? 'INCOMPLETE_SCAN' : '',
      hasRawScan && hasImport ? 'RAW_AND_IMPORT' : '',
      hasManual ? 'MANUAL_CORRECTION' : '',
      expectedStatus === 'HOLIDAY' ? 'HOLIDAY' : '',
      expectedStatus === 'OFF_DAY' ? 'OFF_DAY' : '',
      rawScanCount === 1 && expectedStatus === 'OFF_DAY' ? 'SCAN_ON_OFFDAY' : '',
      rawScanCount === 1 && expectedStatus === 'HOLIDAY' ? 'SCAN_ON_HOLIDAY' : '',
      row.needs_review ? 'MAPPING_REVIEW' : '',
      row.is_unmapped ? 'UNMAPPED_RAW' : '',
    ].filter(Boolean);

    const provenance = JSON.stringify({
      source_chain: [
        hasManual ? 'MANUAL_CORRECTION' : null,
        hasImport ? 'IMPORT' : null,
        hasRawScan ? 'RAW_SCAN' : null,
        expectedStatus === 'HOLIDAY' ? 'HOLIDAY' : null,
        expectedStatus === 'OFF_DAY' ? 'OFF_DAY' : null,
      ].filter(Boolean),
      has_raw_scan: hasRawScan,
      has_import: hasImport,
      has_manual_correction: hasManual,
      expected_status: expectedStatus,
      reason,
    });

    return {
      ...row,
      final_status: finalStatus,
      attendance_status: finalStatus,
      ui_status: finalStatus,
      source,
      expected_status: expectedStatus,
      holiday_name: holiday?.holiday_name ?? null,
      workday_label: workConfig?.day_name ?? null,
      work_start_time: workConfig?.work_start_time ?? null,
      work_end_time: workConfig?.work_end_time ?? null,
      has_raw_scan: hasRawScan,
      has_import: hasImport,
      has_manual_correction: hasManual,
      reason,
      trace_state: traceState,
      provenance,
      quality_flags: qualityFlags,
      mapping_status: hasManual
        ? 'MAPPED'
        : hasRawScan
          ? (row.is_mapped ? 'MAPPED' : (row.needs_review ? 'NEED_REVIEW' : 'UNMAPPED'))
          : (hasImport ? 'MAPPED' : 'UNMAPPED'),
      check_in_at: hasManual
        ? row.correction_check_in ?? row.import_check_in ?? row.raw_check_in ?? null
        : hasImport
          ? row.import_check_in ?? row.raw_check_in ?? null
          : row.raw_check_in ?? null,
      check_out_at: hasManual
        ? row.correction_check_out ?? row.import_check_out ?? row.raw_check_out ?? null
        : hasImport
          ? row.import_check_out ?? row.raw_check_out ?? null
          : row.raw_check_out ?? null,
    };
  });

  const normalizedStatus = status ? String(status).toUpperCase() : '';
  const normalizedMapping = mapping ? String(mapping).toUpperCase() : '';
  const normalizedSource = source ? String(source).toUpperCase() : '';
  const filteredRows = enrichedRows.filter((row) => {
    const rowStatus = String(row.final_status ?? '').toUpperCase();
    const rowMapping = String(row.mapping_status ?? '').toUpperCase();
    const rowSource = String(row.source ?? '').toUpperCase();
    if (normalizedStatus && rowStatus !== normalizedStatus) return false;
    if (normalizedMapping && rowMapping !== normalizedMapping) return false;
    if (normalizedSource) {
      if (normalizedSource === 'ZKTECO' || normalizedSource === 'DIRECT_ZKTECO') {
        if (!(rowSource === 'ZKTECO' || rowSource === 'DIRECT_ZKTECO')) return false;
      } else if (rowSource !== normalizedSource) {
        return false;
      }
    }
    return true;
  });

  const total = Number(filteredRows[0]?.total_rows ?? 0);
  sendEnvelope(ctx.res, 200, {
    rows: filteredRows,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }, {
    page,
    page_size: pageSize,
    total,
    source: 'traceable_attendance_matrix',
    mode: 'traceable',
    period: `${year}-${String(month).padStart(2, '0')}`,
  });
});

route('GET', '/api/attendance/monthly-matrix/cell', async (ctx) => {
  const date = ctx.query.get('date') ?? new Date().toISOString().slice(0, 10);
  const employeeCode = ctx.query.get('employeeCode');
  const rawDeviceUserId = ctx.query.get('rawDeviceUserId');
  const machineCode = ctx.query.get('machineCode');
  const hasManualCorrections = await checkTableExists('attendance_manual_corrections');

  const rawLogs = await query<any>(`
    SELECT TOP 100
      s.id,
      s.raw_device_user_id,
      s.parsed_employee_code AS parsed_employee_code,
      COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) AS employee_code,
      NULLIF(LTRIM(RTRIM(s.zkteco_user_name)), '') AS zkteco_user_name,
      s.zkteco_user_name AS employee_name,
      s.machine_code,
      s.scan_time,
      s.event_type,
      s.verify_type,
      s.work_code,
      CASE WHEN COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) IS NOT NULL THEN 'MAPPED' ELSE 'NEED_REVIEW' END AS mapping_status,
      s.mapping_reason
    FROM attendance_scan_logs s
    WHERE s.scan_date = @date
      AND (@employeeCode IS NULL OR s.current_emp_code = @employeeCode OR s.parsed_employee_code = @employeeCode OR s.raw_device_user_id = @employeeCode)
      AND (@rawDeviceUserId IS NULL OR s.raw_device_user_id = @rawDeviceUserId)
      AND (@machineCode IS NULL OR s.machine_code = @machineCode)
    ORDER BY s.scan_time ASC`,
    [
      { name: 'date', type: sql.Date, value: date },
      { name: 'employeeCode', type: sql.NVarChar, value: employeeCode },
      { name: 'rawDeviceUserId', type: sql.NVarChar, value: rawDeviceUserId },
      { name: 'machineCode', type: sql.NVarChar, value: machineCode },
    ]);

  const employee = employeeCode ? (await query<any>(`
    SELECT TOP 1 e.employee_code, e.employee_name, d.division_code, d.division_name
    FROM employees e
    INNER JOIN divisions d ON d.id = e.division_id
    WHERE e.employee_code = @employeeCode`,
    [{ name: 'employeeCode', type: sql.NVarChar, value: employeeCode }]))[0] : null;

  const correction = employeeCode && hasManualCorrections ? (await query<any>(`
    SELECT TOP 1 *
    FROM attendance_manual_corrections
    WHERE employee_code = @employeeCode AND attendance_date = @date AND is_deleted = 0
    ORDER BY updated_at DESC, created_at DESC`,
    [
      { name: 'employeeCode', type: sql.NVarChar, value: employeeCode },
      { name: 'date', type: sql.Date, value: date },
    ]))[0] : null;

  const imported = employeeCode ? (await query<any>(`
    SELECT TOP 1 *
    FROM attendance_imports
    WHERE employee_code = @employeeCode AND attendance_date = @date
    ORDER BY created_at DESC`,
    [
      { name: 'employeeCode', type: sql.NVarChar, value: employeeCode },
      { name: 'date', type: sql.Date, value: date },
    ]))[0] : null;

  const uniqueRawLogs = Array.from(
    new Map(rawLogs.map((log: any) => [String(log.scan_time).slice(0, 19), log])).values()
  );
  const rawFirst = uniqueRawLogs[0];
  const holidayRows = await loadAttendanceCalendarRows();
  const workRows = await loadWorkConfigRows();
  const holidayRow = holidayRows.find((row) => String(row.holiday_date).slice(0, 10) === date) ?? null;
  const weekdayIndex = weekDayIndexFromDateKey(date);
  const workConfig = workRows.find((row) => Number(row.day_of_week) === weekdayIndex) ?? null;
  const expectedStatus = holidayRow
    ? 'HOLIDAY'
    : (workConfig && Number(workConfig.is_workday ?? 1) === 0 ? 'OFF_DAY' : 'WORKDAY');
  const rawScanCount = uniqueRawLogs.length;
  const finalStatus = correction?.attendance_status
    ?? (
      rawScanCount >= 2 && expectedStatus === 'WORKDAY' ? 'HADIR'
        : rawScanCount === 1 && expectedStatus === 'WORKDAY' ? 'INCOMPLETE_SCAN'
          : rawScanCount > 0 && expectedStatus === 'OFF_DAY' ? 'SCAN_ON_OFFDAY_INCOMPLETE'
            : rawScanCount > 0 && expectedStatus === 'HOLIDAY' ? 'SCAN_ON_HOLIDAY_INCOMPLETE'
              : imported?.attendance_status ?? (rawScanCount > 0 ? 'HADIR' : 'NO_DATA')
    );
  const source = correction ? 'MANUAL_CORRECTION' : imported?.source ?? (rawScanCount > 0 ? 'DIRECT_ZKTECO' : 'NO_DATA');
  const provenance = {
    source_chain: [
      correction ? 'MANUAL_CORRECTION' : null,
      imported?.source ?? null,
      rawScanCount > 0 ? 'RAW_SCAN' : null,
      holidayRow ? 'HOLIDAY' : null,
      expectedStatus === 'OFF_DAY' ? 'OFF_DAY' : null,
    ].filter(Boolean),
    has_raw_scan: rawScanCount > 0,
    has_import: !!imported,
    has_manual_correction: !!correction,
    expected_status: expectedStatus,
  };
  const reason = correction
    ? 'Manual correction'
    : holidayRow
      ? `Hari libur${holidayRow.holiday_name ? `: ${holidayRow.holiday_name}` : ''}`
      : expectedStatus === 'OFF_DAY'
        ? `Jadwal libur${workConfig?.day_name ? ` (${workConfig.day_name})` : ''}`
        : rawScanCount === 1
          ? 'Hanya terdapat satu scan. Check-in atau check-out belum lengkap.'
          : rawScanCount > 1
            ? 'Raw scan ada dan lengkap'
        : imported
          ? 'Data terimport'
          : rawScanCount > 0
            ? 'Raw scan ada tetapi belum diolah'
            : 'Tidak ada raw scan';
  const qualityFlags = [
    rawScanCount === 0 ? 'NO_RAW_SCAN' : '',
    rawScanCount === 1 ? 'INCOMPLETE_SCAN' : '',
    rawScanCount === 1 && expectedStatus === 'OFF_DAY' ? 'SCAN_ON_OFFDAY' : '',
    rawScanCount === 1 && expectedStatus === 'HOLIDAY' ? 'SCAN_ON_HOLIDAY' : '',
    rawLogs.some((log: any) => log.mapping_status !== 'MAPPED') ? 'MAPPING_REVIEW' : '',
    rawScanCount > 10 ? 'HIGH_SCAN_COUNT' : '',
    holidayRow ? 'HOLIDAY' : '',
    expectedStatus === 'OFF_DAY' ? 'OFF_DAY' : '',
  ].filter(Boolean);

  sendEnvelope(ctx.res, 200, {
    employee,
    date,
    final_status: finalStatus,
    source,
    expected_status: expectedStatus,
    holiday_name: holidayRow?.holiday_name ?? null,
    workday_label: workConfig?.day_name ?? null,
    trace_state: correction ? 'MANUAL_CORRECTION' : imported ? 'IMPORTED' : uniqueRawLogs.length > 0 ? 'RAW_ONLY' : expectedStatus,
    provenance: JSON.stringify(provenance),
    reason,
    check_in_at: correction?.check_in_at
      ?? (
        rawScanCount > 0
          ? rawFirst?.scan_time ?? null
          : imported?.check_in_at ?? null
      ),
    check_out_at: correction?.check_out_at
      ?? (
        rawScanCount >= 2
          ? uniqueRawLogs[uniqueRawLogs.length - 1]?.scan_time ?? null
          : rawScanCount === 1
            ? null
            : imported?.check_out_at ?? null
      ),
    scan_count: rawScanCount,
    single_scan_at: rawScanCount === 1 ? rawFirst?.scan_time ?? null : null,
    raw_logs: rawLogs,
    correction,
    imported,
    quality_flags: qualityFlags,
  }, {
    source: 'attendance_cell_detail',
  });
});

// ─── Available Months ──────────────────────────────────────────────────────
route('GET', '/api/attendance/available-months', async (ctx) => {
  const rows = await loadAvailableMonthsRows();
  sendJson(ctx.res, 200, rows);
});

// ─── Daily Summary ─────────────────────────────────────────────────────────
route('GET', '/api/attendance/summary', async (ctx) => {
  const date = ctx.query.get('date') ?? new Date().toISOString().slice(0, 10);
  const rows = await query(`
    SELECT division_code,
       COUNT(DISTINCT employee_code) AS total_employees,
       SUM(CASE WHEN final_status IN ('PRESENT', 'HADIR') THEN 1 ELSE 0 END) AS total_present,
       SUM(CASE WHEN final_status IN ('NO_DATA', 'ABSENT', 'ALPHA', 'TIDAK_HADIR') THEN 1 ELSE 0 END) AS total_absent,
       SUM(CASE WHEN is_leave = 1 THEN 1 ELSE 0 END) AS total_leave,
       SUM(CASE WHEN is_sick = 1 THEN 1 ELSE 0 END) AS total_sick,
       SUM(overtime_hours) AS total_overtime_hours
     FROM vw_attendance_monthly_matrix
     WHERE attendance_date=@date
     GROUP BY division_code`,
    [{ name: 'date', type: sql.Date, value: date }]);
  sendJson(ctx.res, 200, rows);
});

// ─── Employee History ──────────────────────────────────────────────────────
route('GET', '/api/attendance/employee/:employeeCode', async (ctx) => {
  const rows = await query(`
    SELECT TOP 120
       employee_code, employee_name, division_code, gang_code,
       attendance_date, final_status AS attendance_status,
       final_check_in AS check_in_at, final_check_out AS check_out_at,
       source, is_leave, is_sick, is_holiday, overtime_hours
     FROM vw_attendance_monthly_matrix
     WHERE employee_code=@employeeCode
     ORDER BY attendance_date DESC`,
    [{ name: 'employeeCode', type: sql.NVarChar, value: ctx.params.employeeCode }]);
  sendJson(ctx.res, 200, rows);
});

// ─── Employee Raw Scan Logs ──────────────────────────────────────────────────
route('GET', '/api/attendance/employee/:employeeCode/raw', async (ctx) => {
  const limit = Math.min(Number(ctx.query.get('limit') ?? 200), 500);
  const rows = await query(`
     SELECT TOP @limit
       s.id AS scan_log_id,
       s.scan_date,
       s.scan_time,
       s.raw_device_user_id,
       s.machine_code,
       s.parsed_employee_code,
       s.zkteco_user_name,
       COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) AS employee_code,
       s.zkteco_user_name AS employee_name,
       s.source,
       CASE WHEN COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) IS NOT NULL THEN 'MAPPED' ELSE 'NEED_REVIEW' END AS mapping_status
     FROM attendance_scan_logs s
     WHERE COALESCE(NULLIF(s.current_emp_code, ''), s.parsed_employee_code) = @employeeCode
        OR s.raw_device_user_id = @employeeCode
     ORDER BY s.scan_date DESC, s.scan_time DESC`,
    [
      { name: 'employeeCode', type: sql.NVarChar, value: ctx.params.employeeCode },
      { name: 'limit', type: sql.Int, value: limit },
    ]);
  sendJson(ctx.res, 200, rows);
});

// ─── Corrections CRUD ──────────────────────────────────────────────────────
route('GET', '/api/attendance/corrections', async (ctx) => {
  if (!(await checkTableExists('attendance_manual_corrections'))) {
    sendJson(ctx.res, 200, []);
    return;
  }
  const rows = await query('SELECT TOP 200 * FROM attendance_manual_corrections WHERE is_deleted=0 ORDER BY created_at DESC');
  sendJson(ctx.res, 200, rows);
});

route('POST', '/api/attendance/corrections', async (ctx) => {
  if (!requireAnyRole(ctx, ['HR_ADMIN'], 'attendance correction')) return;
  if (!(await checkTableExists('attendance_manual_corrections'))) {
    sendError(ctx.res, 503, 'SCHEMA_MISSING', 'attendance_manual_corrections table is not available');
    return;
  }
  const input = validate(correctionSchema, ctx.body);
  await execute(`INSERT INTO attendance_manual_corrections(employee_id,employee_code,division_code,gang_code,attendance_date,attendance_status,check_in_at,check_out_at,has_work,is_leave,is_sick,is_holiday,overtime_hours,reason,created_by)
    SELECT e.id,e.employee_code,d.division_code,g.gang_code,@attendanceDate,@attendanceStatus,@checkInAt,@checkOutAt,@hasWork,@isLeave,@isSick,@isHoliday,@overtimeHours,@reason,@userId
    FROM employees e JOIN divisions d ON d.id=e.division_id LEFT JOIN gangs g ON g.id=e.gang_id WHERE e.employee_code=@employeeCode`, [
    { name: 'employeeCode', type: sql.NVarChar, value: input.employeeCode },
    { name: 'attendanceDate', type: sql.Date, value: input.attendanceDate },
    { name: 'attendanceStatus', type: sql.NVarChar, value: input.attendanceStatus },
    { name: 'checkInAt', type: sql.DateTime2, value: input.checkInAt ?? null },
    { name: 'checkOutAt', type: sql.DateTime2, value: input.checkOutAt ?? null },
    { name: 'hasWork', type: sql.Bit, value: input.hasWork },
    { name: 'isLeave', type: sql.Bit, value: input.isLeave },
    { name: 'isSick', type: sql.Bit, value: input.isSick },
    { name: 'isHoliday', type: sql.Bit, value: input.isHoliday },
    { name: 'overtimeHours', type: sql.Decimal(8, 2), value: input.overtimeHours },
    { name: 'reason', type: sql.NVarChar, value: input.reason },
    { name: 'userId', type: sql.Int, value: ctx.user?.id ?? null },
  ]);
  await writeAudit({ entityType: 'ATTENDANCE_CORRECTION', employeeCode: input.employeeCode, actionType: 'INSERT_CORRECTION', reason: input.reason, changedBy: ctx.user?.id ?? null, ipAddress: ctx.req.socket.remoteAddress ?? null, userAgent: ctx.req.headers['user-agent'] ?? null });
  sendJson(ctx.res, 201, { created: true });
});

route('PUT', '/api/attendance/corrections/:id', async (ctx) => {
  if (!requireAnyRole(ctx, ['HR_ADMIN'], 'attendance correction')) return;
  if (!(await checkTableExists('attendance_manual_corrections'))) {
    sendError(ctx.res, 503, 'SCHEMA_MISSING', 'attendance_manual_corrections table is not available');
    return;
  }
  const input = validate(correctionSchema, ctx.body);
  await execute(`UPDATE attendance_manual_corrections SET attendance_status=@attendanceStatus,check_in_at=@checkInAt,check_out_at=@checkOutAt,has_work=@hasWork,is_leave=@isLeave,is_sick=@isSick,is_holiday=@isHoliday,overtime_hours=@overtimeHours,reason=@reason,updated_by=@userId,updated_at=SYSUTCDATETIME() WHERE id=@id`, [
    { name: 'id', type: sql.BigInt, value: Number(ctx.params.id) },
    { name: 'attendanceStatus', type: sql.NVarChar, value: input.attendanceStatus },
    { name: 'checkInAt', type: sql.DateTime2, value: input.checkInAt ?? null },
    { name: 'checkOutAt', type: sql.DateTime2, value: input.checkOutAt ?? null },
    { name: 'hasWork', type: sql.Bit, value: input.hasWork },
    { name: 'isLeave', type: sql.Bit, value: input.isLeave },
    { name: 'isSick', type: sql.Bit, value: input.isSick },
    { name: 'isHoliday', type: sql.Bit, value: input.isHoliday },
    { name: 'overtimeHours', type: sql.Decimal(8, 2), value: input.overtimeHours },
    { name: 'reason', type: sql.NVarChar, value: input.reason },
    { name: 'userId', type: sql.Int, value: ctx.user?.id ?? null },
  ]);
  await writeAudit({ entityType: 'ATTENDANCE_CORRECTION', entityId: ctx.params.id, employeeCode: input.employeeCode, actionType: 'UPDATE_CORRECTION', reason: input.reason, changedBy: ctx.user?.id ?? null });
  sendJson(ctx.res, 200, { updated: true });
});

route('DELETE', '/api/attendance/corrections/:id', async (ctx) => {
  if (!requireAnyRole(ctx, ['HR_ADMIN'], 'attendance correction delete')) return;
  if (!(await checkTableExists('attendance_manual_corrections'))) {
    sendError(ctx.res, 503, 'SCHEMA_MISSING', 'attendance_manual_corrections table is not available');
    return;
  }
  await execute('UPDATE attendance_manual_corrections SET is_deleted=1, updated_by=@userId, updated_at=SYSUTCDATETIME() WHERE id=@id', [
    { name: 'id', type: sql.BigInt, value: Number(ctx.params.id) },
    { name: 'userId', type: sql.Int, value: ctx.user?.id ?? null },
  ]);
  await writeAudit({ entityType: 'ATTENDANCE_CORRECTION', entityId: ctx.params.id, actionType: 'DELETE_CORRECTION', reason: 'Manual correction deleted', changedBy: ctx.user?.id ?? null });
  sendJson(ctx.res, 200, { deleted: true });
});
