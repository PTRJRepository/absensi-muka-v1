/**
 * Sync Scheduler API Routes
 * Uses scheduler.service.ts (new 3-job schedule.json: global sync + pipeline + HR snapshot)
 */

import { route } from '../router';
import { sendJson, sendError } from '../response';
import { query } from '../../lib/db';
import { spawn } from 'child_process';
import { requireAnyRole } from '../middleware/auth';
import { writeAudit } from '../services/audit.service';
import { getSchedulerService } from '../../modules/scheduler/scheduler.service';

// Singleton instance for all route handlers
const schedulerService = getSchedulerService();

// GET /api/scheduler/jobs — list all jobs from scheduler service
route('GET', '/api/scheduler/jobs', async (ctx) => {
  const config = schedulerService.getConfig();
  const lastRunInfo = await query<any>(`
    SELECT TOP 50 b.id, b.batch_code, am.machine_code,
           b.status, b.started_at, b.finished_at,
           b.records_success, b.records_failed
    FROM attendance_import_batches b
    LEFT JOIN attendance_machines am ON b.machine_id = am.id
    WHERE b.batch_code LIKE 'SCHED_%' OR b.batch_code LIKE 'SYNC_%' OR b.batch_code LIKE 'MANUAL_%'
    ORDER BY b.started_at DESC
  `);

  const jobsWithStatus = config.jobs.map((job) => {
    const relevant = lastRunInfo.filter((r: any) =>
      job.machines.length === 0 || job.machines.includes(r.machine_code)
    );
    const lastRun = relevant[0];
    return {
      id: job.id,
      name: job.name,
      machines: job.machines,
      intervalMinutes: job.intervalMinutes,
      enabled: job.enabled,
      script: job.script ?? null,
      dryRun: job.dryRun ?? false,
      isRunning: schedulerService.isRunning(job.name),
      lastRun: lastRun ? {
        batchCode: lastRun.batch_code,
        status: lastRun.status,
        startedAt: lastRun.started_at,
        finishedAt: lastRun.finished_at,
        recordsSuccess: lastRun.records_success,
        recordsFailed: lastRun.records_failed
      } : null,
      nextRun: job.nextRun ?? null,
    };
  });

  sendJson(ctx.res, 200, {
    jobs: jobsWithStatus,
    globalEnabled: config.enabled,
    globalInterval: config.intervalMinutes,
    globalMachines: config.machines
  });
});

// POST /api/scheduler/jobs — create new job via scheduler service
route('POST', '/api/scheduler/jobs', async (ctx) => {
  if (!requireAnyRole(ctx, ['IT_ADMIN', 'OPERATOR'], 'scheduler job creation')) return;
  const body = ctx.body as { name: string; machines?: string[]; intervalMinutes: number; enabled?: boolean; script?: string; env?: Record<string, string>; dryRun?: boolean };
  if (!body.name || !body.intervalMinutes) {
    return sendError(ctx.res, 400, 'INVALID_INPUT', 'name and intervalMinutes required');
  }
  const job = schedulerService.createJob({
    name: body.name,
    machines: body.machines,
    intervalMinutes: body.intervalMinutes,
    enabled: body.enabled,
    script: body.script,
    env: body.env,
    dryRun: body.dryRun,
  });
  if (!job) {
    return sendError(ctx.res, 400, 'DUPLICATE_NAME', 'Job already exists');
  }
  sendJson(ctx.res, 201, { job, message: `Job "${body.name}" created` });
});

// PUT /api/scheduler/jobs/:name — update job via scheduler service
route('PUT', '/api/scheduler/jobs/:name', async (ctx) => {
  const { name } = ctx.params;
  const body = ctx.body as { machines?: string[]; intervalMinutes?: number; enabled?: boolean; script?: string; dryRun?: boolean; env?: Record<string, string> };
  const job = schedulerService.updateJob(name, body);
  if (!job) return sendError(ctx.res, 404, 'NOT_FOUND', 'Job not found');
  sendJson(ctx.res, 200, { job, message: `Job "${name}" updated` });
});

// DELETE /api/scheduler/jobs/:name — delete job via scheduler service
route('DELETE', '/api/scheduler/jobs/:name', async (ctx) => {
  const { name } = ctx.params;
  const deleted = schedulerService.deleteJob(name);
  if (!deleted) return sendError(ctx.res, 404, 'NOT_FOUND', 'Job not found');
  sendJson(ctx.res, 200, { name, message: `Job "${name}" deleted` });
});

// POST /api/scheduler/jobs/:name/run — trigger a specific job immediately
route('POST', '/api/scheduler/jobs/:name/run', async (ctx) => {
  if (!requireAnyRole(ctx, ['IT_ADMIN', 'OPERATOR'], 'scheduler job run')) return;
  const { name } = ctx.params;
  const config = schedulerService.getConfig();
  const job = config.jobs.find(j => j.name === name);
  if (!job) return sendError(ctx.res, 404, 'NOT_FOUND', 'Job not found');
  const batchCode = `SCHED_${Date.now()}_${name.replace(/\s+/g, '_').toUpperCase()}`;
  const args = ['dist/scripts/sync-machines.js', `--batch=${batchCode}`];
  if (job.machines.length > 0) {
    for (const m of job.machines) args.push(`--machine=${m}`);
  }
  spawn('node', args, { cwd: process.cwd() });
  await writeAudit({ entityType: 'SCHEDULER_JOB', entityId: name, actionType: 'RUN_SCHEDULER_JOB', reason: `Started ${batchCode}`, changedBy: ctx.user?.id ?? null, ipAddress: ctx.req.socket.remoteAddress ?? null, userAgent: ctx.req.headers['user-agent'] ?? null });
  sendJson(ctx.res, 202, {
    jobName: name, batchCode, status: 'STARTED',
    machines: job.machines.length > 0 ? job.machines : ['ALL'],
    message: `Job "${name}" started as batch ${batchCode}`
  });
});

// GET /api/scheduler/status — global status from scheduler service
route('GET', '/api/scheduler/status', async (ctx) => {
  const config = schedulerService.getConfig();
  const activeJobs = config.jobs.filter((j) => j.enabled);
  sendJson(ctx.res, 200, {
    enabled: config.enabled,
    interval_minutes: config.intervalMinutes,
    running_jobs: activeJobs.map((j) => j.name),
    next_scheduled_run: activeJobs.length > 0 && config.intervalMinutes
      ? new Date(Date.now() + config.intervalMinutes * 60000).toISOString()
      : null,
    status: activeJobs.length > 0 ? 'IDLE' : 'IDLE'
  });
});

// PUT /api/scheduler/config — update global config via scheduler service
route('PUT', '/api/scheduler/config', async (ctx) => {
  const body = ctx.body as { enabled?: boolean; intervalMinutes?: number; machines?: string[] };
  const config = schedulerService.updateConfig({
    enabled: body.enabled,
    intervalMinutes: body.intervalMinutes,
    machines: body.machines,
  });
  sendJson(ctx.res, 200, { config, message: 'Scheduler config updated' });
});

// POST /api/scheduler/sync-all — trigger global machine sync
route('POST', '/api/scheduler/sync-all', async (ctx) => {
  if (!requireAnyRole(ctx, ['IT_ADMIN', 'OPERATOR'], 'machine sync')) return;
  const batchCode = `MANUAL_${Date.now()}`;
  spawn('node', ['dist/scripts/sync-machines.js', `--batch=${batchCode}`], { cwd: process.cwd() });
  await writeAudit({ entityType: 'SYNC', entityId: batchCode, actionType: 'SYNC_ALL', reason: 'Manual sync all machines', changedBy: ctx.user?.id ?? null, ipAddress: ctx.req.socket.remoteAddress ?? null, userAgent: ctx.req.headers['user-agent'] ?? null });
  sendJson(ctx.res, 202, { batchCode, status: 'STARTED', message: 'Full sync started for all machines' });
});

// POST /api/scheduler/sync/:machineCode — trigger single machine sync
route('POST', '/api/scheduler/sync/:machineCode', async (ctx) => {
  if (!requireAnyRole(ctx, ['IT_ADMIN', 'OPERATOR'], 'machine sync')) return;
  const { machineCode } = ctx.params;
  const batchCode = `MANUAL_${Date.now()}_${machineCode}`;
  spawn('node', ['dist/scripts/sync-machines.js', `--machine=${machineCode}`, `--batch=${batchCode}`], { cwd: process.cwd() });
  await writeAudit({ entityType: 'SYNC', entityId: batchCode, actionType: 'SYNC_MACHINE', reason: `Manual sync ${machineCode}`, changedBy: ctx.user?.id ?? null, ipAddress: ctx.req.socket.remoteAddress ?? null, userAgent: ctx.req.headers['user-agent'] ?? null });
  sendJson(ctx.res, 202, { batchCode, machineCode, status: 'STARTED', message: `Sync started for ${machineCode}` });
});
