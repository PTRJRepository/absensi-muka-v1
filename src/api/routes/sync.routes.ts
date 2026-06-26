/**
 * Sync Control Routes
 * POST /api/monitoring/sync/:machineCode  - trigger sync for one machine
 * POST /api/monitoring/sync-all          - trigger sync for all machines
 * GET  /api/monitoring/sync-status/:id   - check batch status
 * POST /api/monitoring/sync/:machineCode/ping - ping machine TCP
 */

import { route } from '../router';
import { sendJson, sendError } from '../response';
import { query, sql } from '../../lib/db';
import { spawn } from 'child_process';
import * as path from 'path';

const SYNC_SCRIPT = path.join(__dirname, '../../scripts/sync-machines.js');

// ─── Ping Machine (TCP connect test) ─────────────────────────────────────────
route('POST', '/api/monitoring/sync/:machineCode/ping', async (ctx) => {
  const { machineCode } = ctx.params;

  const machines = await query<any>(`
    SELECT machine_code, ip_address, port
    FROM attendance_machines
    WHERE machine_code = @code AND is_active = 1
  `, [{ name: 'code', type: sql.NVarChar, value: machineCode }]);

  if (!machines.length) return sendError(ctx.res, 404, 'NOT_FOUND', 'Machine not found');

  const { ip_address, port } = machines[0];

  // TCP ping using node
  const result = await tcpPing(ip_address, parseInt(port as any));

  sendJson(ctx.res, 200, {
    machine_code: machineCode,
    ip: ip_address,
    port,
    ...result,
  });
});

// ─── Trigger Sync One Machine ────────────────────────────────────────────────
route('POST', '/api/monitoring/sync/:machineCode', async (ctx) => {
  const { machineCode } = ctx.params;

  // Verify machine exists
  const machines = await query<any>(`
    SELECT id, machine_code, ip_address, port, data_source, access_status
    FROM attendance_machines
    WHERE machine_code = @code AND is_active = 1
  `, [{ name: 'code', type: sql.NVarChar, value: machineCode }]);

  if (!machines.length) return sendError(ctx.res, 404, 'NOT_FOUND', 'Machine not found');
  const machine = machines[0];

  if (machine.data_source !== 'DIRECT_ZKTECO') {
    return sendError(ctx.res, 400, 'BAD_REQUEST', `Machine ${machineCode} is not configured for direct ZKTeco sync`);
  }

  // Spawn sync process
  const batchCode = `${machineCode}-${new Date().toISOString().replace(/[:.]/g, '-')}`.slice(0, 60);
  const child = spawn('node', [SYNC_SCRIPT, '--machine=' + machineCode, '--batch=' + batchCode], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  sendJson(ctx.res, 200, {
    machine_code: machineCode,
    batch_code: batchCode,
    status: 'RUNNING',
    message: 'Sync started. Check /api/monitoring/batches for batch progress.',
  });
});

// ─── Trigger Sync All Machines ───────────────────────────────────────────────
route('POST', '/api/monitoring/sync-all', async (ctx) => {
  const machines = await query<any>(`
    SELECT id, machine_code, ip_address, port, data_source, access_status
    FROM attendance_machines
    WHERE is_active = 1
      AND data_source = 'DIRECT_ZKTECO'
  `);

  const results: any[] = [];
  const errors: any[] = [];

  for (const m of machines) {
    const batchCode = `${m.machine_code}-${new Date().toISOString().replace(/[:.]/g, '-')}`.slice(0, 60);
    try {
      // Spawn detached sync
      spawn('node', [SYNC_SCRIPT, '--machine=' + m.machine_code, '--batch=' + batchCode], {
        detached: true,
        stdio: 'ignore',
      }).unref();

      results.push({
        machine_code: m.machine_code,
        batch_code: batchCode,
        status: 'TRIGGERED',
      });
    } catch (e: any) {
      errors.push({ machine_code: m.machine_code, error: e.message });
    }
  }

  sendJson(ctx.res, 200, {
    triggered: results.length,
    errors: errors.length,
    batches: results,
    errors_detail: errors,
  });
});

// ─── Get Batch Status ────────────────────────────────────────────────────────
route('GET', '/api/monitoring/sync-status/:id', async (ctx) => {
  const { id } = ctx.params;

  const batch = await query<any>(`
    SELECT
      b.id, b.batch_code, b.status,
      b.records_total, b.records_success, b.records_failed,
      b.started_at, b.finished_at, b.error_message,
      m.machine_code, m.ip_address
    FROM attendance_import_batches b
    LEFT JOIN attendance_machines m ON m.id = b.machine_id
    WHERE b.id = @id
  `, [{ name: 'id', type: sql.BigInt, value: id }]);

  if (!batch.length) return sendError(ctx.res, 404, 'NOT_FOUND', 'Batch not found');

  const b = batch[0];
  sendJson(ctx.res, 200, {
    id: b.id,
    batch_code: b.batch_code,
    machine_code: b.machine_code,
    ip: b.ip_address,
    status: b.status,
    records_total:   b.records_total ?? 0,
    records_success: b.records_success ?? 0,
    records_failed:  b.records_failed ?? 0,
    started_at: b.started_at,
    finished_at: b.finished_at,
    error_message: b.error_message,
  });
});

// ─── TCP Ping Utility ─────────────────────────────────────────────────────────
function tcpPing(host: string, port: number): Promise<any> {
  return new Promise((resolve) => {
    const start = Date.now();
    // Use PowerShell for TCP connection test on Windows
    const proc = spawn('powershell', [
      '-NoProfile',
      '-Command',
      `try {
        $tcp = New-Object System.Net.Sockets.TcpClient;
        $connect = $tcp.BeginConnect('${host}', ${port}, $null, $null);
        $wait = $connect.AsyncWaitHandle.WaitOne(3000);
        if ($wait -and $tcp.Connected) {
          Write-Output 'OK'
        } else {
          Write-Output 'TIMEOUT'
        }
        $tcp.Close();
      } catch {
        Write-Output 'ERROR'
      }`
    ], { stdio: 'pipe', timeout: 5000 });

    let output = '';
    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.on('close', () => {
      const ms = Date.now() - start;
      const result = output.trim().toUpperCase();
      resolve({
        reachable: result === 'OK',
        latency_ms: result === 'OK' ? ms : null,
        status: result,
      });
    });
    proc.on('error', () => {
      resolve({ reachable: false, latency_ms: null, status: 'ERROR', error: 'process error' });
    });
    setTimeout(() => {
      proc.kill();
      resolve({ reachable: false, latency_ms: null, status: 'TIMEOUT' });
    }, 5000);
  });
}
