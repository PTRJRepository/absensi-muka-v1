/**
 * Monitoring Dashboard API Routes
 * Database: rebinmas_absensi_monitoring
 * Actual schema:
 *   attendance_machines: id, machine_code, location_name, ip_address, port,
 *                       access_status, data_source, last_sync_at, last_error_message
 *   attendance_import_batches: id, batch_code, machine_id, status, records_total,
 *                             records_success, records_failed, started_at, finished_at, error_message
 *   attendance_scan_logs: machine_id, machine_code, raw_device_user_id, parsed_employee_code,
 *                         parsed_division_code, mapping_status, scan_time, scan_date
 *   attendance_imports: employee_id, employee_code, division_code, attendance_date,
 *                       attendance_month, attendance_year, check_in_at, check_out_at, attendance_status
 *   attendance_sync_logs: machine_id, machine_code, status, records_synced, duration_ms,
 *                         started_at, finished_at, error_message
 */

import { route } from '../router';
import { sendJson, sendError } from '../response';
import { query, sql } from '../../lib/db';

// ─── Dashboard Summary ───────────────────────────────────────────────────────
route('GET', '/api/monitoring/dashboard', async (ctx) => {
  const today = new Date().toISOString().split('T')[0];

  const [machineStats, todayStats, lastBatch, pending] = await Promise.all([
    query<any>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN access_status = 'ACCESSIBLE' THEN 1 ELSE 0 END) AS accessible,
        SUM(CASE WHEN access_status != 'ACCESSIBLE' THEN 1 ELSE 0 END) AS offline
      FROM attendance_machines WHERE is_active = 1
    `),
    query<any>(`
      SELECT
        COUNT(*) AS total_scans,
        COUNT(DISTINCT sm.parsed_emp_code) AS unique_employees
      FROM attendance_raw s
      LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
      WHERE s.scan_date = @today
        AND sm.parsed_emp_code IS NOT NULL
    `, [{ name: 'today', type: sql.NVarChar, value: today }]),
    query<any>(`
      SELECT TOP 1 id, batch_code, status, records_total, records_success,
                   records_failed, started_at, finished_at, error_message
      FROM attendance_import_batches
      ORDER BY started_at DESC
    `),
    query<any>(`
      SELECT COUNT(*) AS cnt
      FROM attendance_import_batches
      WHERE status IN ('RUNNING','PENDING')
    `),
  ]);

  const m = machineStats[0] || {};
  const t = todayStats[0] || {};
  const lb = lastBatch[0] || {};

  sendJson(ctx.res, 200, {
    totalMachines: m.total ?? 0,
    accessibleMachines: m.accessible ?? 0,
    offlineMachines: m.offline ?? 0,
    zktecoMachines: m.accessible ?? 0,
    todayTotalScans: t.total_scans ?? 0,
    todayUniqueEmployees: t.unique_employees ?? 0,
    pendingBatches: pending[0]?.cnt ?? 0,
    lastBatch: lb.id ? {
      id: lb.id,
      batchCode: lb.batch_code,
      status: lb.status,
      recordsTotal: lb.records_total ?? 0,
      recordsSuccess: lb.records_success ?? 0,
      recordsFailed: lb.records_failed ?? 0,
      errorMessage: lb.error_message,
      startedAt: lb.started_at,
      finishedAt: lb.finished_at,
    } : null,
  });
});

// ─── Machine List ────────────────────────────────────────────────────────────
route('GET', '/api/monitoring/machines', async (ctx) => {
  const rows = await query<any>(`
    SELECT
      m.id,
      m.machine_code,
      m.location_name       AS machine_name,
      m.ip_address,
      m.port,
      m.access_status,
      m.data_source,
      m.loc_code,
      m.last_sync_at,
      m.last_error_message  AS last_sync_error
    FROM attendance_machines m
    WHERE m.is_active = 1
    ORDER BY m.machine_code
  `);

  // Enrich with today's scan stats
  const today = new Date().toISOString().split('T')[0];
  const todayStats = await query<any>(`
    SELECT
      s.machine_code,
      COUNT(*)         AS records_today,
      COUNT(DISTINCT sm.parsed_emp_code) AS employees_today
    FROM attendance_raw s
    LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
    WHERE s.scan_date = @today
    GROUP BY s.machine_code
  `, [{ name: 'today', type: sql.NVarChar, value: today }]);

  const statMap: Record<string, any> = {};
  for (const s of todayStats) statMap[s.machine_code] = s;

  const machines = rows.map((m: any) => ({
    ...m,
    records_today: statMap[m.machine_code]?.records_today ?? 0,
    employees_today: statMap[m.machine_code]?.employees_today ?? 0,
  }));

  sendJson(ctx.res, 200, machines);
});

// ─── Single Machine Detail ───────────────────────────────────────────────────
route('GET', '/api/monitoring/machine/:code', async (ctx) => {
  const { code } = ctx.params;
  const today = new Date().toISOString().split('T')[0];

  const [machine, todayStats, recentSyncs, monthlyStats, deviceUsers, recentBatches] = await Promise.all([
    query<any>(`
      SELECT id, machine_code, location_name, ip_address, port,
             access_status, data_source, loc_code, last_sync_at, last_error_message
      FROM attendance_machines WHERE machine_code = @code
    `, [{ name: 'code', type: sql.NVarChar, value: code }]),
    query<any>(`
      SELECT
        COUNT(*)                    AS total_scans,
        COUNT(DISTINCT sm.parsed_emp_code) AS unique_employees,
        MIN(s.scan_time)            AS first_scan,
        MAX(s.scan_time)            AS last_scan
      FROM attendance_raw s
      LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
      WHERE s.machine_code = @code AND s.scan_date = @today
    `, [{ name: 'code', type: sql.NVarChar, value: code }, { name: 'today', type: sql.NVarChar, value: today }]),
    query<any>(`
      SELECT TOP 10
        b.started_at, b.status, b.records_success AS records_synced,
        DATEDIFF(millisecond, b.started_at, b.finished_at) AS duration_ms, b.error_message
      FROM attendance_import_batches b
      WHERE b.machine_id = (SELECT id FROM attendance_machines WHERE machine_code = @code)
      ORDER BY b.started_at DESC
    `, [{ name: 'code', type: sql.NVarChar, value: code }]),
    query<any>(`
      SELECT
        attendance_year  AS year,
        attendance_month AS month,
        COUNT(*)                   AS total_records,
        COUNT(DISTINCT employee_code) AS unique_employees
      FROM attendance_imports ai
      WHERE ai.division_code = @code
      GROUP BY attendance_year, attendance_month
      ORDER BY year DESC, month DESC
    `, [{ name: 'code', type: sql.NVarChar, value: code }]),
    query<any>(`
      SELECT TOP 50
        s.raw_device_user_id AS device_user_id,
        sm.parsed_emp_code AS parsed_employee_code,
        sm.loc_code AS parsed_division_code,
        sm.map_status AS mapping_status,
        COUNT(*) AS scan_count,
        MAX(s.scan_time) AS last_scan
      FROM attendance_raw s
      LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
      WHERE s.machine_code = @code
      GROUP BY s.raw_device_user_id, sm.parsed_emp_code, sm.loc_code, sm.map_status
      ORDER BY scan_count DESC
    `, [{ name: 'code', type: sql.NVarChar, value: code }]),
    query<any>(`
      SELECT TOP 5
        batch_code, status, records_total, records_success, records_failed,
        started_at, finished_at
      FROM attendance_import_batches
      WHERE machine_id = (SELECT id FROM attendance_machines WHERE machine_code = @code)
      ORDER BY started_at DESC
    `, [{ name: 'code', type: sql.NVarChar, value: code }]),
  ]);

  if (!machine.length) return sendError(ctx.res, 404, 'NOT_FOUND', 'Machine not found');

  // Calculate ping status based on last sync
  const m = machine[0];
  const lastSync = m.last_sync_at ? new Date(m.last_sync_at) : null;
  const pingStatus = !lastSync ? 'NEVER_SYNCED'
    : (Date.now() - lastSync.getTime() > 3600000) ? 'STALE' // > 1 hour
    : 'HEALTHY';

  // Summary of device users
  const mappedUsers = deviceUsers.filter((u: any) => u.mapping_status === 'MAPPED');
  const unmappedUsers = deviceUsers.filter((u: any) => u.mapping_status !== 'MAPPED');

  sendJson(ctx.res, 200, {
    machine: m,
    ping_status: pingStatus,
    todayStats: todayStats[0] || {},
    recentSyncs: recentSyncs,
    recentBatches: recentBatches,
    monthlyStats: monthlyStats,
    device_users: {
      summary: {
        total: deviceUsers.length,
        mapped: mappedUsers.length,
        unmapped: unmappedUsers.length,
      },
      mapped_users: mappedUsers.slice(0, 20),
      unmapped_users: unmappedUsers.slice(0, 20),
    },
  });
});

// ─── Import Batches ──────────────────────────────────────────────────────────
route('GET', '/api/monitoring/batches', async (ctx) => {
  const page   = parseInt(ctx.query.get('page')  ?? '1');
  const limit  = parseInt(ctx.query.get('limit') ?? '20');
  const offset = (page - 1) * limit;
  const machine  = ctx.query.get('machine') ?? '';
  const status   = ctx.query.get('status')  ?? '';
  const dateFrom = ctx.query.get('dateFrom') ?? '';
  const dateTo   = ctx.query.get('dateTo')  ?? '';

  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (machine)  { where += ' AND b.machine_code = @machine';  params.push({ name: 'machine',  type: sql.NVarChar, value: machine }); }
  if (status)   { where += ' AND b.status = @status';          params.push({ name: 'status',   type: sql.NVarChar, value: status }); }
  if (dateFrom) { where += ' AND b.started_at >= @dateFrom';   params.push({ name: 'dateFrom', type: sql.NVarChar, value: dateFrom }); }
  if (dateTo)   { where += ' AND b.started_at <= @dateTo';     params.push({ name: 'dateTo',   type: sql.NVarChar, value: dateTo + 'T23:59:59' }); }

  const countRow = await query<any>(`
    SELECT COUNT(*) AS total FROM attendance_import_batches b ${where}
  `, params);
  const total = countRow[0]?.total ?? 0;

  const rows = await query<any>(`
    SELECT
      b.id, b.batch_code, b.machine_id, b.status,
      b.records_total, b.records_success, b.records_failed,
      b.started_at, b.finished_at, b.error_message,
      m.machine_code, m.location_name AS machine_name, m.ip_address
    FROM attendance_import_batches b
    LEFT JOIN attendance_machines m ON m.id = b.machine_id
    ${where}
    ORDER BY b.started_at DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `, [...params,
      { name: 'offset', type: sql.Int, value: offset },
      { name: 'limit',  type: sql.Int, value: limit },
    ]);

  sendJson(ctx.res, 200, {
    batches: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ─── Single Batch Detail ────────────────────────────────────────────────────
route('GET', '/api/monitoring/batch/:id', async (ctx) => {
  const { id } = ctx.params;
  const batch = await query<any>(`
    SELECT b.*, m.machine_code, m.location_name, m.ip_address
    FROM attendance_import_batches b
    LEFT JOIN attendance_machines m ON m.id = b.machine_id
    WHERE b.id = @id
  `, [{ name: 'id', type: sql.BigInt, value: id }]);

  if (!batch.length) return sendError(ctx.res, 404, 'NOT_FOUND', 'Batch not found');

  const sampleLogs = await query<any>(`
    SELECT TOP 50
      s.raw_device_user_id, sm.parsed_emp_code AS parsed_employee_code, sm.loc_code AS parsed_division_code,
      sm.map_status AS mapping_status, s.scan_time, s.event_type, s.verify_type
    FROM attendance_raw s
    LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
    WHERE s.sync_batch_id = @id
    ORDER BY s.scan_time DESC
  `, [{ name: 'id', type: sql.BigInt, value: id }]);

  sendJson(ctx.res, 200, { batch: batch[0], sampleLogs });
});

// ─── Data Quality ────────────────────────────────────────────────────────────
route('GET', '/api/monitoring/quality', async (ctx) => {
  const days  = parseInt(ctx.query.get('days') ?? '30');
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const [summary, dailyTrend, recordsPerDivision, unmappedCodes] = await Promise.all([
    query<any>(`
      SELECT
        (SELECT COUNT(*) FROM attendance_raw WHERE scan_date >= @since) AS total_scan_logs,
        (SELECT COUNT(*) FROM attendance_imports  WHERE attendance_date >= @since) AS total_imports,
        (SELECT COUNT(DISTINCT s.raw_device_user_id) FROM attendance_raw s LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
         WHERE s.scan_date >= @since AND (sm.map_status IS NULL OR sm.map_status != 'MAPPED')) AS unmapped_count,
        (SELECT COUNT(*) FROM attendance_raw s LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
         WHERE s.scan_date >= @since AND sm.map_status = 'MAPPED') AS mapped_count
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),

    query<any>(`
      SELECT
        s.scan_date AS date,
        COUNT(*)                                    AS record_count,
        COUNT(DISTINCT sm.parsed_emp_code)          AS unique_employees
      FROM attendance_raw s
      LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
      WHERE s.scan_date >= @since
      GROUP BY s.scan_date
      ORDER BY s.scan_date DESC
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),

    query<any>(`
      SELECT TOP 20
        ai.division_code   AS division,
        COUNT(*)           AS record_count,
        COUNT(DISTINCT ai.employee_code) AS unique_employees
      FROM attendance_imports ai
      WHERE ai.attendance_date >= @since
      GROUP BY ai.division_code
      ORDER BY record_count DESC
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),

    query<any>(`
      SELECT TOP 30
        s.raw_device_user_id,
        COUNT(*)           AS occurrence_count,
        STRING_AGG(s.machine_code, ', ') AS machines,
        MAX(s.scan_time)     AS last_seen
      FROM attendance_raw s
      LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
      WHERE s.scan_date >= @since AND (sm.map_status IS NULL OR sm.map_status != 'MAPPED')
      GROUP BY s.raw_device_user_id
      ORDER BY occurrence_count DESC
    `, [{ name: 'since', type: sql.NVarChar, value: since }]),
  ]);

  const s = summary[0] || {};
  const total = (s.total_scan_logs ?? 0) + (s.total_imports ?? 0);
  const mappedRate = total > 0
    ? Math.round(((s.mapped_count ?? 0) / total) * 100)
    : 0;

  sendJson(ctx.res, 200, {
    totalScanLogs:  s.total_scan_logs ?? 0,
    totalImported:  s.total_imports  ?? 0,
    unmappedCount:  s.unmapped_count ?? 0,
    mappedCount:    s.mapped_count   ?? 0,
    mappedRate:     mappedRate,
    needReviewCount: s.unmapped_count ?? 0,
    dailyTrend,
    recordsPerDivision,
    unmappedCodes,
  });
});

// ─── Monthly Division Summary ────────────────────────────────────────────────
route('GET', '/api/monitoring/division-summary', async (ctx) => {
  const year  = ctx.query.get('year')  ?? new Date().getFullYear().toString();
  const month = ctx.query.get('month') ?? (new Date().getMonth() + 1).toString().padStart(2, '0');

  const rows = await query<any>(`
    SELECT
      ai.division_code,
      COUNT(*)                        AS total_records,
      COUNT(DISTINCT ai.employee_code) AS unique_employees,
      SUM(CASE WHEN ai.attendance_status = 'HADIR'    THEN 1 ELSE 0 END) AS hadir,
      SUM(CASE WHEN ai.attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END) AS tidak_hadir,
      SUM(CASE WHEN ai.is_sick    = 1 THEN 1 ELSE 0 END) AS sick,
      SUM(CASE WHEN ai.is_leave  = 1 THEN 1 ELSE 0 END) AS leave,
      SUM(CASE WHEN ai.is_holiday = 1 THEN 1 ELSE 0 END) AS holiday
    FROM attendance_imports ai
    WHERE ai.attendance_year  = @year
      AND ai.attendance_month = @month
    GROUP BY ai.division_code
    ORDER BY total_records DESC
  `, [
    { name: 'year',  type: sql.Int, value: parseInt(year) },
    { name: 'month', type: sql.Int, value: parseInt(month) },
  ]);

  sendJson(ctx.res, 200, { year, month, divisions: rows });
});
