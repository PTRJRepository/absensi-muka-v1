/**
 * Import Control API Routes
 * Non-scheduler import management (trigger, batch status, retry)
 * Uses schedulerService for schedule config (same source as scheduler.routes.ts)
 */

import { route } from '../router';
import { sendJson, sendError } from '../response';
import { query, sql } from '../../lib/db';
import { spawn } from 'child_process';
import { getSchedulerService } from '../../modules/scheduler/scheduler.service';

const schedulerService = getSchedulerService();

/**
 * POST /api/import/trigger
 * Trigger sync for one machine or all machines
 */
route('POST', '/api/import/trigger', async (ctx) => {
  const body = ctx.body as { machineCode?: string; force?: boolean } | undefined;
  const machineCode = body?.machineCode;
  const force = body?.force ?? false;

  // Generate batch code
  const batchCode = `SYNC_${Date.now()}_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  // Determine which machines to sync
  let machinesToSync: string[] = [];

  if (machineCode) {
    machinesToSync = [machineCode];
  } else {
    // Get all active machines
    const machines = await query<any>(`
      SELECT machine_code FROM attendance_machines WHERE is_active = 1
    `);
    machinesToSync = machines.map((m: any) => m.machine_code);
  }

  // Spawn sync process
  const args = ['dist/scripts/sync-machines.js'];
  if (machineCode) {
    args.push('--machine', machineCode);
  }
  if (force) {
    args.push('--force');
  }
  args.push('--batch', batchCode);

  const cwd = process.cwd();
  const syncProcess = spawn('node', args, { cwd });

  let stdout = '';
  let stderr = '';

  syncProcess.stdout.on('data', (data) => {
    stdout += data.toString();
    console.log(`[SYNC] ${data}`);
  });

  syncProcess.stderr.on('data', (data) => {
    stderr += data.toString();
    console.error(`[SYNC ERROR] ${data}`);
  });

  // Give it a moment to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  sendJson(ctx.res, 202, {
    jobId: batchCode,
    status: 'STARTED',
    machines: machinesToSync,
    message: `Sync job ${batchCode} started for ${machinesToSync.length} machine(s)`,
    pid: syncProcess.pid
  });
});

/**
 * GET /api/import/schedule
 * Get current schedule configuration (delegates to scheduler service)
 */
route('GET', '/api/import/schedule', async (ctx) => {
  const config = schedulerService.getConfig();

  // Get running jobs info
  const runningJobs = await query<any>(`
    SELECT TOP 10
      b.batch_code,
      m.machine_code,
      b.status,
      b.started_at
    FROM attendance_import_batches b
    LEFT JOIN attendance_machines m ON m.id = b.machine_id
    WHERE b.status IN ('RUNNING', 'PENDING')
    ORDER BY b.started_at DESC
  `);

  sendJson(ctx.res, 200, {
    config,
    runningJobs
  });
});

/**
 * PUT /api/import/schedule
 * Update schedule configuration (delegates to scheduler service)
 */
route('PUT', '/api/import/schedule', async (ctx) => {
  const body = ctx.body as {
    enabled?: boolean;
    intervalMinutes?: number;
    machines?: string[];
  };

  if (!body) {
    return sendError(ctx.res, 400, 'INVALID_INPUT', 'Request body is required');
  }

  const config = schedulerService.updateConfig({
    enabled: body.enabled,
    intervalMinutes: body.intervalMinutes,
    machines: body.machines,
  });

  sendJson(ctx.res, 200, {
    config,
    message: 'Schedule configuration updated'
  });
});

/**
 * GET /api/import/batch/:id/logs
 * Get paginated raw scan logs for a batch
 */
route('GET', '/api/monitoring/batch/:id/logs', async (ctx) => {
  const { id } = ctx.params;
  const page = parseInt(ctx.query.get('page') ?? '1', 10);
  const limit = Math.min(parseInt(ctx.query.get('limit') ?? '50', 10), 200);
  const offset = (page - 1) * limit;

  const countResult = await query<any>(`
    SELECT COUNT(*) AS total
    FROM attendance_scan_logs s
    WHERE sync_batch_id = @batchId
  `, [{ name: 'batchId', type: sql.BigInt, value: id }]);

  const logs = await query<any>(`
    SELECT
      s.id, s.raw_device_user_id, s.parsed_employee_code,
      s.parsed_division_code, s.scan_time, s.scan_date,
      s.machine_code, s.mapping_status, s.event_type,
      s.verify_type, s.work_code, s.sync_batch_id, s.created_at
    FROM attendance_scan_logs s
    WHERE sync_batch_id = @batchId
    ORDER BY scan_time DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `, [
    { name: 'batchId', type: sql.BigInt, value: id },
    { name: 'offset', type: sql.Int, value: offset },
    { name: 'limit', type: sql.Int, value: limit }
  ]);

  sendJson(ctx.res, 200, {
    logs,
    pagination: {
      page,
      limit,
      total: countResult[0]?.total ?? 0,
      totalPages: Math.ceil((countResult[0]?.total ?? 0) / limit)
    }
  });
});

/**
 * POST /api/import/batch/:id/retry
 * Retry failed records in a batch
 */
route('POST', '/api/import/batch/:id/retry', async (ctx) => {
  const { id } = ctx.params;

  const failedRecords = await query<any>(`
    SELECT id, raw_device_user_id, scan_time, machine_code
    FROM attendance_scan_logs s
    WHERE sync_batch_id = @batchId AND mapping_status = 'UNMAPPED'
  `, [{ name: 'batchId', type: sql.BigInt, value: id }]);

  if (failedRecords.length === 0) {
    return sendJson(ctx.res, 200, { retried: 0, message: 'No unmapped records to retry' });
  }

  const machineCodes = [...new Set(failedRecords.map((r: any) => r.machine_code))];
  const newBatchCode = `RETRY_${Date.now()}`;

  if (machineCodes.length > 0) {
    spawn('node', ['dist/scripts/sync-machines.js', '--machine', machineCodes[0], '--batch', newBatchCode],
      { cwd: process.cwd(), detached: true, stdio: 'ignore' });
  }

  sendJson(ctx.res, 202, {
    retried: failedRecords.length,
    newBatchCode,
    machines: machineCodes,
    message: `Retry job started for ${failedRecords.length} records`
  });
});

/**
 * GET /api/import/batch/:id/status
 * Get current status of a batch
 */
route('GET', '/api/import/batch/:id/status', async (ctx) => {
  const { id } = ctx.params;

  const rows = await query<any>(`
    SELECT b.*, am.machine_code, am.location_name AS machine_name
    FROM attendance_import_batches b
    LEFT JOIN attendance_machines am ON b.machine_id = am.id
    WHERE b.id = @id
  `, [{ name: 'id', type: sql.BigInt, value: id }]);

  if (rows.length === 0) return sendError(ctx.res, 404, 'NOT_FOUND', 'Batch not found');
  sendJson(ctx.res, 200, rows[0]);
});
