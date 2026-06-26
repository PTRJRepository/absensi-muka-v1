import { query, sql } from '../../lib/db';
import { route } from '../router';
import { sendJson } from '../response';
import { buildWorkbook } from '../services/report.service';

route('GET', '/api/reports/daily', async (ctx) => {
  const date = ctx.query.get('date') ?? new Date().toISOString().slice(0, 10);
  const rows = await query('SELECT * FROM vw_attendance_final WHERE attendance_date=@date ORDER BY division_code, employee_code', [{ name: 'date', type: sql.Date, value: date }]);
  sendJson(ctx.res, 200, rows);
});

route('GET', '/api/reports/monthly', async (ctx) => {
  const year = Number(ctx.query.get('year') ?? new Date().getFullYear());
  const month = Number(ctx.query.get('month') ?? new Date().getMonth() + 1);
  const rows = await query('SELECT * FROM vw_attendance_monthly_summary WHERE attendance_year=@year AND attendance_month=@month ORDER BY division_code, employee_code', [{ name: 'year', type: sql.Int, value: year }, { name: 'month', type: sql.Int, value: month }]);
  sendJson(ctx.res, 200, rows);
});

route('GET', '/api/reports/export/excel', async (ctx) => {
  const type = ctx.query.get('type') ?? 'daily';
  let rows: Record<string, unknown>[] = [];
  let filename = `attendance-daily-${new Date().toISOString().slice(0, 10)}.xlsx`;
  if (type === 'monthly') {
    const year = Number(ctx.query.get('year') ?? new Date().getFullYear());
    const month = Number(ctx.query.get('month') ?? new Date().getMonth() + 1);
    rows = await query('SELECT * FROM vw_attendance_monthly_summary WHERE attendance_year=@year AND attendance_month=@month', [{ name: 'year', type: sql.Int, value: year }, { name: 'month', type: sql.Int, value: month }]);
    filename = `attendance-monthly-${year}-${String(month).padStart(2, '0')}.xlsx`;
  } else if (type === 'sync-log') {
    rows = await query('SELECT TOP 1000 * FROM attendance_sync_logs ORDER BY started_at DESC');
    filename = `sync-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
  } else {
    const date = ctx.query.get('date') ?? new Date().toISOString().slice(0, 10);
    rows = await query('SELECT * FROM vw_attendance_final WHERE attendance_date=@date', [{ name: 'date', type: sql.Date, value: date }]);
    filename = `attendance-daily-${date}.xlsx`;
  }
  const buffer = await buildWorkbook('Report', rows);
  ctx.res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename}"` });
  ctx.res.end(Buffer.from(buffer));
});
