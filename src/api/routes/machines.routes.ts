import { query, sql } from '../../lib/db';
import { ZktecoService } from '../../modules/machines/zkteco.service';
import { testMachineAccessibility, TcpAccessibilityResult } from '../../modules/machines/tcp-accessibility.service';
import { route } from '../router';
import { sendJson } from '../response';
import { requireAnyRole } from '../middleware/auth';
import { writeAudit } from '../services/audit.service';

function minutesSince(iso: string | Date | null | undefined): number {
  if (!iso) return Infinity;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) ? (Date.now() - ts) / 60000 : Infinity;
}

function computeDisplayStatus(machine: any, tcpResult?: TcpAccessibilityResult): string {
  if (machine.is_active === false || machine.is_active === 0) return 'DISABLED';
  // Use real-time TCP result when available; fall back to DB access_status
  const access = tcpResult
    ? tcpResult.status
    : String(machine.access_status ?? '').toUpperCase();
  if (access === 'PORT_BLOCKED' || access.includes('PORT')) return 'BLOCKED';
  if (access === 'NETWORK_UNREACHABLE' || access.includes('UNREACH') || access.includes('NO_ROUTE')) return 'UNREACHABLE';
  if (access === 'OFFLINE' || access.includes('OFFLINE')) return 'OFFLINE';
  if (access === 'ACCESSIBLE') {
    if (machine.live_connected === true) return 'ONLINE';
    const age = minutesSince(machine.last_sync_at);
    if (age > 60) return 'STALE';
    const quality = Number(machine.quality_score ?? 100);
    if (quality < 80) return 'WARNING';
    return 'ONLINE';
  }
  const quality = Number(machine.quality_score ?? 100);
  if (quality < 80) return 'WARNING';
  return 'WARNING';
}

function computeSyncStatus(machine: any, tcpResult?: TcpAccessibilityResult): string {
  const access = tcpResult
    ? tcpResult.status
    : String(machine.access_status ?? '').toUpperCase();
  if (access === 'NETWORK_UNREACHABLE') return 'SYNC_FAILED';
  if (access === 'PORT_BLOCKED') return 'SYNC_FAILED';
  if (access === 'OFFLINE') return 'OFFLINE';
  if (!machine.last_sync_at) return 'NEVER_SYNCED';
  const age = minutesSince(machine.last_sync_at);
  if (age > 60) return 'STALE';
  return 'FRESH';
}

function computeLiveStatus(machine: any, tcpResult?: TcpAccessibilityResult): string {
  if (machine.live_connected === true) return 'ONLINE';
  const access = tcpResult
    ? tcpResult.status
    : String(machine.access_status ?? '').toUpperCase();
  if (access === 'NETWORK_UNREACHABLE') return 'TIMEOUT';
  if (access === 'PORT_BLOCKED') return 'FAILED';
  if (access === 'OFFLINE') return 'OFFLINE';
  if (!machine.last_sync_at) return 'UNKNOWN';
  return 'OFFLINE';
}

function computeSeverity(displayStatus: string, qualityScore: number): string {
  if (displayStatus === 'BLOCKED' || displayStatus === 'UNREACHABLE') return 'CRITICAL';
  if (displayStatus === 'OFFLINE' || displayStatus === 'STALE' || displayStatus === 'DISABLED') return 'HIGH';
  if (displayStatus === 'WARNING' || qualityScore < 80) return 'MEDIUM';
  return 'LOW';
}

function computeReason(displayStatus: string, machine: any, tcpResult?: TcpAccessibilityResult): string {
  switch (displayStatus) {
    case 'DISABLED': return 'Machine is deactivated';
    case 'BLOCKED': return 'Port forwarding blocked at router/firewall';
    case 'UNREACHABLE': return 'Network unreachable from server';
    case 'OFFLINE': return 'Machine reported offline or never synced';
    case 'STALE': return 'Machine accessible but sync is stale (>60 min)';
    case 'WARNING': return `Quality score ${machine.quality_score ?? 0} below threshold (80)`;
    case 'ONLINE': return 'Machine is accessible and synced';
    default: return 'Unknown status';
  }
}

route('GET', '/api/machines', async (ctx) => {
  const rows = await query(`SELECT m.id, m.machine_code, m.location_name, m.access_status, m.ip_address, m.port, m.is_active, m.data_source, m.loc_code, m.machine_type,
    m.last_sync_at,
    m.last_error_message,
    m.machine_record_count,
    m.machine_record_count_updated_at,
    COALESCE((SELECT COUNT(*) FROM attendance_raw WHERE machine_code=m.machine_code), 0) AS db_record_count,
    COALESCE((SELECT COUNT(*) FROM attendance_scan_logs WHERE machine_code=m.machine_code AND scan_date >= CAST(GETDATE() AS DATE)), 0) AS scan_count_today,
    COALESCE((SELECT COUNT(DISTINCT COALESCE(NULLIF(parsed_employee_code, ''), raw_device_user_id)) FROM attendance_scan_logs WHERE machine_code=m.machine_code AND scan_date >= CAST(GETDATE() AS DATE)), 0) AS user_count_today,
    COALESCE((
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE CAST(ROUND(
          (SUM(CASE WHEN mapping_status = 'MAPPED' AND NULLIF(parsed_employee_code, '') IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) * 0.75
          + (CASE WHEN m.access_status = 'ACCESSIBLE' THEN 100 ELSE 40 END) * 0.25
        , 0) AS INT)
      END
      FROM attendance_scan_logs
      WHERE machine_code = m.machine_code
        AND scan_date >= DATEADD(day, -7, CAST(GETDATE() AS DATE))
    ), 0) AS quality_score,
    COALESCE((
      SELECT COUNT(*)
      FROM attendance_scan_logs
      WHERE machine_code = m.machine_code
        AND scan_date >= DATEADD(day, -7, CAST(GETDATE() AS DATE))
        AND (mapping_status != 'MAPPED' OR NULLIF(parsed_employee_code, '') IS NULL)
    ), 0) AS unmapped_count_7d
    FROM attendance_machines m
    WHERE m.is_active = 1
    ORDER BY m.machine_code`);

  // Perform real-time TCP accessibility tests in parallel (uses in-memory cache)
  const zktecoMachines = rows.filter((m: any) => m.data_source === 'DIRECT_ZKTECO' && m.ip_address && m.port);
  const otherMachines = rows.filter((m: any) => m.data_source !== 'DIRECT_ZKTECO' || !m.ip_address || !m.port);

  const tcpResults = new Map<string, TcpAccessibilityResult>();
  if (zktecoMachines.length > 0) {
    const results = await Promise.allSettled(
      zktecoMachines.map((m: any) =>
        testMachineAccessibility(m.ip_address, m.port).then((r) => ({ machineCode: m.machine_code, result: r }))
      )
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        tcpResults.set(result.value.machineCode, result.value.result);
      }
      // If rejected, just skip - machine will use DB fallback
    }
  }

  const enriched = rows.map((machine: any) => {
    const tcpResult = tcpResults.get(machine.machine_code);
    const displayStatus = computeDisplayStatus(machine, tcpResult);
    const qualityScore = Number(machine.quality_score ?? 0);
    return {
      ...machine,
      // Real-time TCP results override database access_status
      real_access_status: tcpResult?.status ?? machine.access_status,
      access_latency_ms: tcpResult?.latencyMs ?? null,
      access_tested_at: tcpResult?.testedAt ?? null,
      display_status: displayStatus,
      sync_status: computeSyncStatus(machine, tcpResult),
      live_status: computeLiveStatus(machine, tcpResult),
      severity: computeSeverity(displayStatus, qualityScore),
      reason: computeReason(displayStatus, machine, tcpResult),
    };
  });

  sendJson(ctx.res, 200, enriched);
});

route('GET', '/api/machines/failures', async (ctx) => {
  const rows = await query(
    "SELECT TOP 100 * FROM machine_connection_logs WHERE status='FAILED' ORDER BY checked_at DESC"
  );
  sendJson(ctx.res, 200, rows);
});

route('POST', '/api/machines/:machineCode/test-connection', async (ctx) => {
  if (!requireAnyRole(ctx, ['IT_ADMIN', 'OPERATOR'], 'machine connection test')) return;
  const rows = await query<any>(
    'SELECT TOP 1 * FROM attendance_machines WHERE machine_code=@machineCode',
    [{ name: 'machineCode', type: sql.NVarChar, value: ctx.params.machineCode }]
  );
  const machine = rows[0];
  if (!machine || machine.data_source !== 'DIRECT_ZKTECO') {
    return sendJson(ctx.res, 200, { success: false, error: 'Machine not direct ZKTeco' });
  }
  const service = new ZktecoService({ machineCode: machine.machine_code, ipAddress: machine.ip_address, port: machine.port });
  const result = await service.connect();
  await service.disconnect();
  await writeAudit({ entityType: 'MACHINE', entityId: ctx.params.machineCode, actionType: 'TEST_CONNECTION', reason: result?.success ? 'Connection test success' : 'Connection test failed', changedBy: ctx.user?.id ?? null, ipAddress: ctx.req.socket.remoteAddress ?? null, userAgent: ctx.req.headers['user-agent'] ?? null });
  sendJson(ctx.res, 200, result);
});

route('POST', '/api/machines/:machineCode/test-tcp', async (ctx) => {
  // Real-time TCP accessibility test (no full ZKTeco handshake)
  if (!requireAnyRole(ctx, ['IT_ADMIN', 'OPERATOR'], 'TCP accessibility test')) return;
  const rows = await query<any>(
    'SELECT TOP 1 * FROM attendance_machines WHERE machine_code=@machineCode',
    [{ name: 'machineCode', type: sql.NVarChar, value: ctx.params.machineCode }]
  );
  const machine = rows[0];
  if (!machine) {
    return sendJson(ctx.res, 200, { success: false, error: 'Machine not found' });
  }
  const service = new ZktecoService({ machineCode: machine.machine_code, ipAddress: machine.ip_address, port: machine.port });
  const result = await service.testAccessibility();
  await writeAudit({ entityType: 'MACHINE', entityId: ctx.params.machineCode, actionType: 'TEST_TCP_ACCESSIBILITY', reason: result.success ? `TCP test success: ${result.data?.status}` : `TCP test failed: ${result.error?.message}`, changedBy: ctx.user?.id ?? null, ipAddress: ctx.req.socket.remoteAddress ?? null, userAgent: ctx.req.headers['user-agent'] ?? null });
  sendJson(ctx.res, 200, result);
});
