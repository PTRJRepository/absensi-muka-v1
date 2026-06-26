/**
 * Real-Time Machine Status API
 * GET /api/machines/real-time-status
 */

import { route } from "../router";
import { sendJson } from "../response";
import { query } from "../../lib/db";

route("GET", "/api/machines/real-time-status", async (ctx) => {
  const machines = await query<any>(`
    SELECT
      m.id,
      m.machine_code,
      m.location_name,
      m.ip_address,
      m.port,
      m.access_status,
      m.data_source,
      m.loc_code,
      m.last_sync_at,
      m.last_error_message,
      COALESCE(today.scans, 0) AS records_today,
      COALESCE(today.employees, 0) AS employees_today
    FROM attendance_machines m
    LEFT JOIN (
      SELECT
        machine_code,
        COUNT(*) AS scans,
        COUNT(DISTINCT parsed_employee_code) AS employees
      FROM attendance_scan_logs
      WHERE scan_date = CAST(GETDATE() AS DATE)
      GROUP BY machine_code
    ) today ON m.machine_code = today.machine_code
    WHERE m.is_active = 1
    ORDER BY m.machine_code
  `);

  const summary = {
    total: machines.length,
    online: 0,
    offline: 0,
    total_scans_today: 0
  };

  for (const m of machines) {
    summary.total_scans_today += Number(m.records_today ?? 0);
  }

  sendJson(ctx.res, 200, { machines, summary });
});
