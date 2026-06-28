import { query, sql } from '../../lib/db';
import { route } from '../router';
import { sendJson } from '../response';

route('GET', '/api/dashboard/summary', async (ctx) => {
  const date = ctx.query.get('date') ?? new Date().toISOString().slice(0, 10);
  const rows = await query(`
    SELECT
      (SELECT COUNT(*) FROM employees WHERE is_active=1) AS total_employee,
      SUM(CASE WHEN attendance_status='HADIR' THEN 1 ELSE 0 END) AS present_today,
      SUM(CASE WHEN attendance_status IN ('INCOMPLETE_SCAN','NO_DATA') THEN 1 ELSE 0 END) AS absent_today,
      SUM(CASE WHEN is_leave=1 OR is_sick=1 THEN 1 ELSE 0 END) AS leave_or_sick,
      COALESCE(SUM(overtime_hours),0) AS total_overtime
    FROM vw_attendance_final
    WHERE attendance_date=@date
  `, [{ name: 'date', type: sql.Date, value: date }]);
  sendJson(ctx.res, 200, rows[0] ?? { total_employee: 0, present_today: 0, absent_today: 0, leave_or_sick: 0, total_overtime: 0 });
});

route('GET', '/api/dashboard/division-summary', async (ctx) => {
  const date = ctx.query.get('date') ?? new Date().toISOString().slice(0, 10);
  const rows = await query('SELECT * FROM vw_attendance_daily_summary WHERE attendance_date=@date ORDER BY division_code', [{ name: 'date', type: sql.Date, value: date }]);
  sendJson(ctx.res, 200, rows);
});

route('GET', '/api/dashboard/sync-status', async (ctx) => {
  const rows = await query('SELECT TOP 50 * FROM vw_sync_latest_status ORDER BY started_at DESC');
  sendJson(ctx.res, 200, rows);
});

route('GET', '/api/dashboard/stats', async (ctx) => {
  const rows = await query(`
    SELECT
      (SELECT COUNT(*) FROM attendance_machines WHERE is_active=1) AS total_machines,
      (SELECT COUNT(*) FROM attendance_machines WHERE is_active=1) AS online_machines,
      (SELECT COUNT(*) FROM attendance_machines WHERE is_active=1) AS offline_machines,
      (SELECT COUNT(*) FROM employees WHERE is_active=1) AS total_employees,
      COALESCE((SELECT COUNT(*) FROM attendance_raw WHERE CAST(scan_time AS DATE) = CAST(GETDATE() AS DATE)), 0) AS total_scans_today,
      COALESCE((SELECT COUNT(*) FROM attendance_raw r JOIN scan_map sm ON sm.scan_log_id = r.id WHERE sm.map_status = 'UNMAPPED'), 0) AS unmapped_count,
      COALESCE((SELECT TOP 1 started_at FROM attendance_import_batches ORDER BY started_at DESC), NULL) AS last_sync,
      85 AS quality_score,
      FORMAT(GETDATE(), 'yyyy-MM-dd') AS today_date
  `);
  sendJson(ctx.res, 200, rows[0] ?? {
    total_machines: 0,
    online_machines: 0,
    offline_machines: 0,
    total_employees: 0,
    total_scans_today: 0,
    unmapped_count: 0,
    last_sync: null,
    quality_score: 0,
    today_date: new Date().toISOString().split('T')[0]
  });
});
