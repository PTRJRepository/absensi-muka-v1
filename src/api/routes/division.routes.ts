/**
 * Division API Routes
 * Database: rebinmas_absensi_monitoring
 *
 * Endpoints for division management and attendance analysis
 */

import { route } from '../router';
import { sendJson, sendError } from '../response';
import { query, sql } from '../../lib/db';

// ─── List All Divisions ───────────────────────────────────────────────────────
route('GET', '/api/divisions', async (ctx) => {
  const divisions = await query<any>(`
    SELECT
      d.id,
      d.division_code,
      d.division_name,
      d.is_active,
      COUNT(e.id)                                           AS total_employees,
      SUM(CASE WHEN e.is_active = 1 THEN 1 ELSE 0 END)      AS active_employees,
      SUM(CASE WHEN e.is_active = 0 THEN 1 ELSE 0 END)      AS inactive_employees
    FROM divisions d
    LEFT JOIN employees e ON e.division_id = d.id
    GROUP BY d.id, d.division_code, d.division_name, d.is_active
    ORDER BY d.division_code
  `);

  sendJson(ctx.res, 200, divisions);
});

// ─── Compare Multiple Divisions ──────────────────────────────────────────────
route('GET', '/api/divisions/compare', async (ctx) => {
  const divisionsParam = ctx.query.get('divisions') ?? '';
  const year = parseInt(ctx.query.get('year') ?? new Date().getFullYear().toString());
  const month = parseInt(ctx.query.get('month') ?? (new Date().getMonth() + 1).toString().padStart(2, '0'));

  if (!divisionsParam) {
    return sendError(ctx.res, 400, 'BAD_REQUEST', 'divisions parameter is required');
  }

  const divisionCodes = divisionsParam.split(',').map((d: string) => d.trim()).filter(Boolean);

  if (divisionCodes.length < 2) {
    return sendError(ctx.res, 400, 'BAD_REQUEST', 'At least 2 divisions are required for comparison');
  }

  if (divisionCodes.length > 6) {
    return sendError(ctx.res, 400, 'BAD_REQUEST', 'Maximum 6 divisions allowed for comparison');
  }

  // Verify all divisions exist
  const divisions = await query<any>(`
    SELECT division_code, division_name FROM divisions
    WHERE division_code IN (${divisionCodes.map((_, i) => `@div${i}`).join(',')})
  `, divisionCodes.map((d, i) => ({ name: `div${i}`, type: sql.NVarChar, value: d })));

  if (divisions.length !== divisionCodes.length) {
    return sendError(ctx.res, 404, 'NOT_FOUND', 'One or more divisions not found');
  }

  // Get summary for each division
  const summaryResults = await Promise.all(
    divisionCodes.map(async (code) => {
      const result = await query<any>(`
        SELECT
          COUNT(*)                                           AS total_records,
          COUNT(DISTINCT employee_code)                      AS unique_employees,
          SUM(CASE WHEN attendance_status = 'HADIR' THEN 1 ELSE 0 END)    AS hadir,
          SUM(CASE WHEN attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END) AS tidak_hadir,
          SUM(CASE WHEN is_sick = 1 THEN 1 ELSE 0 END)      AS sick,
          SUM(CASE WHEN is_leave = 1 THEN 1 ELSE 0 END)    AS leave,
          COUNT(DISTINCT attendance_date)                    AS days_worked
        FROM attendance_imports
        WHERE division_code = @code
          AND attendance_year = @year
          AND attendance_month = @month
      `, [
        { name: 'code', type: sql.NVarChar, value: code },
        { name: 'year', type: sql.Int, value: year },
        { name: 'month', type: sql.Int, value: month },
      ]);
      return { code, ...(result[0] || {}) };
    })
  );

  // Get daily trend comparison
  const dailyTrend = await query<any>(`
    SELECT
      attendance_date AS date,
      ${divisionCodes.map((code, i) => `
        SUM(CASE WHEN division_code = '${code}' THEN 1 ELSE 0 END) AS div_${i}_total,
        SUM(CASE WHEN division_code = '${code}' AND attendance_status = 'HADIR' THEN 1 ELSE 0 END) AS div_${i}_hadir
      `).join(',')}
    FROM attendance_imports
    WHERE division_code IN (${divisionCodes.map((_, i) => `@div${i}`).join(',')})
      AND attendance_year = @year
      AND attendance_month = @month
    GROUP BY attendance_date
    ORDER BY attendance_date
  `, [...divisionCodes.map((d, i) => ({ name: `div${i}`, type: sql.NVarChar, value: d })),
      { name: 'year', type: sql.Int, value: year },
      { name: 'month', type: sql.Int, value: month }]);

  // Calculate rates for each division
  const comparison = summaryResults.map((s) => {
    const total = (s.hadir ?? 0) + (s.tidak_hadir ?? 0);
    const hadirRate = total > 0 ? Math.round(((s.hadir ?? 0) / total) * 100) : 0;
    const division = divisions.find((d: any) => d.division_code === s.code);

    return {
      division_code: s.code,
      division_name: division?.division_name ?? s.code,
      total_records: s.total_records ?? 0,
      unique_employees: s.unique_employees ?? 0,
      hadir: s.hadir ?? 0,
      tidak_hadir: s.tidak_hadir ?? 0,
      sick: s.sick ?? 0,
      leave: s.leave ?? 0,
      days_worked: s.days_worked ?? 0,
      hadir_rate: hadirRate,
    };
  });

  // Sort by hadir_rate descending for ranking
  const rankedComparison = comparison.sort((a, b) => b.hadir_rate - a.hadir_rate)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  sendJson(ctx.res, 200, {
    year,
    month,
    divisions: divisionCodes,
    comparison: rankedComparison,
    daily_trend: dailyTrend.map((d: any) => ({
      date: d.date,
      data: divisionCodes.reduce((acc: any, code, i) => {
        acc[code] = {
          total: d[`div_${i}_total`],
          hadir: d[`div_${i}_hadir`],
        };
        return acc;
      }, {}),
    })),
  });
});

// ─── Division Detail with Employee Summary ────────────────────────────────────
route('GET', '/api/divisions/:code', async (ctx) => {
  const { code } = ctx.params;

  const divisions = await query<any>(`
    SELECT
      d.id,
      d.division_code,
      d.division_name
    FROM divisions d
    WHERE d.division_code = @code
  `, [{ name: 'code', type: sql.NVarChar, value: code }]);

  if (!divisions.length) {
    return sendError(ctx.res, 404, 'NOT_FOUND', 'Division not found');
  }

  const [employeeStats, machineStats] = await Promise.all([
    query<any>(`
      SELECT
        COUNT(*)                                           AS total_employees,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END)    AS active_employees,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END)    AS inactive_employees
      FROM employees
      WHERE division_id = @id
    `, [{ name: 'id', type: sql.BigInt, value: divisions[0].id }]),

    query<any>(`
      SELECT COUNT(DISTINCT machine_code) AS machine_count
      FROM attendance_scan_logs
      WHERE parsed_division_code = @code
    `, [{ name: 'code', type: sql.NVarChar, value: code }]),
  ]);

  sendJson(ctx.res, 200, {
    ...divisions[0],
    employee_count: employeeStats[0]?.total_employees ?? 0,
    active_employees: employeeStats[0]?.active_employees ?? 0,
    inactive_employees: employeeStats[0]?.inactive_employees ?? 0,
    machines_active: machineStats[0]?.machine_count ?? 0,
  });
});







// ─── Division Attendance for Month ─────────────────────────────────────────────
route('GET', '/api/divisions/:code/attendance', async (ctx) => {
  const { code } = ctx.params;
  const year = parseInt(ctx.query.get('year') ?? new Date().getFullYear().toString());
  const month = parseInt(ctx.query.get('month') ?? (new Date().getMonth() + 1).toString().padStart(2, '0'));

  // Verify division exists
  const divisions = await query<any>(`
    SELECT id, division_code, division_name FROM divisions WHERE division_code = @code
  `, [{ name: 'code', type: sql.NVarChar, value: code }]);

  if (!divisions.length) {
    return sendError(ctx.res, 404, 'NOT_FOUND', 'Division not found');
  }

  const [summary, dailyBreakdown, employeeBreakdown, statusSummary] = await Promise.all([
    query<any>(`
      SELECT
        COUNT(*)                                           AS total_records,
        COUNT(DISTINCT employee_code)                     AS unique_employees,
        SUM(CASE WHEN attendance_status = 'HADIR' THEN 1 ELSE 0 END)          AS hadir,
        SUM(CASE WHEN attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END)   AS tidak_hadir,
        SUM(CASE WHEN is_sick = 1 THEN 1 ELSE 0 END)      AS sick,
        SUM(CASE WHEN is_leave = 1 THEN 1 ELSE 0 END)    AS leave,
        SUM(CASE WHEN is_holiday = 1 THEN 1 ELSE 0 END)  AS holiday,
        COUNT(DISTINCT attendance_date)                    AS days_worked
      FROM attendance_imports
      WHERE division_code = @code
        AND attendance_year = @year
        AND attendance_month = @month
    `, [
      { name: 'code', type: sql.NVarChar, value: code },
      { name: 'year', type: sql.Int, value: year },
      { name: 'month', type: sql.Int, value: month },
    ]),

    query<any>(`
      SELECT
        attendance_date AS date,
        COUNT(*)                                           AS total_records,
        COUNT(DISTINCT employee_code)                      AS unique_employees,
        SUM(CASE WHEN attendance_status = 'HADIR' THEN 1 ELSE 0 END)    AS hadir,
        SUM(CASE WHEN attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END) AS tidak_hadir
      FROM attendance_imports
      WHERE division_code = @code
        AND attendance_year = @year
        AND attendance_month = @month
      GROUP BY attendance_date
      ORDER BY attendance_date
    `, [
      { name: 'code', type: sql.NVarChar, value: code },
      { name: 'year', type: sql.Int, value: year },
      { name: 'month', type: sql.Int, value: month },
    ]),

    query<any>(`
      SELECT TOP 50 ai.employee_code,
        e.employee_name,
        COUNT(*) AS total_days,
        SUM(CASE WHEN ai.attendance_status = 'HADIR' THEN 1 ELSE 0 END) AS hadir,
        SUM(CASE WHEN ai.attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END) AS tidak_hadir,
        SUM(CASE WHEN ai.is_sick = 1 THEN 1 ELSE 0 END) AS sick,
        SUM(CASE WHEN ai.is_leave = 1 THEN 1 ELSE 0 END) AS leave
      FROM attendance_imports ai
      LEFT JOIN employees e ON e.employee_code = ai.employee_code
      WHERE ai.division_code = @code
        AND ai.attendance_year = @year
        AND ai.attendance_month = @month
      GROUP BY ai.employee_code, e.employee_name
      ORDER BY total_days DESC
    `, [
      { name: 'code', type: sql.NVarChar, value: code },
      { name: 'year', type: sql.Int, value: year },
      { name: 'month', type: sql.Int, value: month },
    ]),

    query<any>(`
      SELECT
        attendance_status,
        COUNT(*) AS count
      FROM attendance_imports
      WHERE division_code = @code
        AND attendance_year = @year
        AND attendance_month = @month
      GROUP BY attendance_status
    `, [
      { name: 'code', type: sql.NVarChar, value: code },
      { name: 'year', type: sql.Int, value: year },
      { name: 'month', type: sql.Int, value: month },
    ]),
  ]);

  const s = summary[0] || {};
  const total = (s.hadir ?? 0) + (s.tidak_hadir ?? 0);
  const hadirRate = total > 0 ? Math.round(((s.hadir ?? 0) / total) * 100) : 0;

  sendJson(ctx.res, 200, {
    division: divisions[0],
    year,
    month,
    summary: {
      total_records: s.total_records ?? 0,
      unique_employees: s.unique_employees ?? 0,
      hadir: s.hadir ?? 0,
      tidak_hadir: s.tidak_hadir ?? 0,
      sick: s.sick ?? 0,
      leave: s.leave ?? 0,
      holiday: s.holiday ?? 0,
      days_worked: s.days_worked ?? 0,
      hadir_rate: hadirRate,
    },
    by_date: dailyBreakdown,
    by_employee: employeeBreakdown,
    by_status: statusSummary,
  });
});



// ─── Division Machine Activity ────────────────────────────────────────────────
route('GET', '/api/divisions/:code/machines', async (ctx) => {
  const { code } = ctx.params;

  const divisions = await query<any>(`
    SELECT id FROM divisions WHERE division_code = @code
  `, [{ name: 'code', type: sql.NVarChar, value: code }]);

  if (!divisions.length) {
    return sendError(ctx.res, 404, 'NOT_FOUND', 'Division not found');
  }

  const machines = await query<any>(`
    SELECT DISTINCT TOP 20
      m.machine_code,
      m.location_name,
      m.ip_address,
      COUNT(s.id)                                          AS scan_count,
      COUNT(DISTINCT s.parsed_employee_code)                AS unique_employees,
      MAX(s.scan_time)                                      AS last_scan
    FROM attendance_machines m
    INNER JOIN attendance_scan_logs s ON s.machine_code = m.machine_code
    WHERE s.parsed_division_code = @code
    GROUP BY m.machine_code, m.location_name, m.ip_address
    ORDER BY scan_count DESC
  `, [{ name: 'code', type: sql.NVarChar, value: code }]);

  sendJson(ctx.res, 200, {
    division_code: code,
    machine_count: machines.length,
    machines: machines,
  });
});

// ─── Division Raw Scan Logs ───────────────────────────────────────────────────
route('GET', '/api/divisions/:code/scans', async (ctx) => {
  const { code } = ctx.params;
  const page = parseInt(ctx.query.get('page') ?? '1');
  const limit = parseInt(ctx.query.get('limit') ?? '50');
  const offset = (page - 1) * limit;
  const days = parseInt(ctx.query.get('days') ?? '7');
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const countResult = await query<any>(`
    SELECT COUNT(*) AS total
    FROM attendance_scan_logs
    WHERE parsed_division_code = @code AND scan_date >= @since
  `, [
    { name: 'code', type: sql.NVarChar, value: code },
    { name: 'since', type: sql.NVarChar, value: since },
  ]);
  const total = countResult[0]?.total ?? 0;

  const logs = await query<any>(`
    SELECT TOP ${limit}
      raw_device_user_id,
      parsed_employee_code,
      machine_code,
      scan_time,
      scan_date,
      mapping_status,
      event_type,
      verify_type
    FROM attendance_scan_logs
    WHERE parsed_division_code = @code AND scan_date >= @since
    ORDER BY scan_time DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `, [
    { name: 'code', type: sql.NVarChar, value: code },
    { name: 'since', type: sql.NVarChar, value: since },
    { name: 'offset', type: sql.Int, value: offset },
    { name: 'limit', type: sql.Int, value: limit },
  ]);

  sendJson(ctx.res, 200, {
    division_code: code,
    period_days: days,
    records: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});
