import { route } from '../router';
import { sendEnvelope } from '../response';
import { query } from '../../lib/db';
import { testMachineAccessibility, TcpAccessibilityResult } from '../../modules/machines/tcp-accessibility.service';

type MachineStatus = 'ONLINE' | 'WARNING' | 'BLOCKED' | 'UNREACHABLE' | 'OFFLINE' | 'DISABLED' | 'STALE';
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

function minutesSince(iso: string | Date | null | undefined): number {
  if (!iso) return Infinity;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) ? (Date.now() - ts) / 60000 : Infinity;
}

function classifyMachine(machine: any, tcpResult?: TcpAccessibilityResult): MachineStatus {
  if (machine.is_active === false || machine.is_active === 0) return 'DISABLED';
  // Prefer real-time TCP result over stored access_status
  const access = tcpResult ? tcpResult.status : String(machine.access_status ?? '').toUpperCase();
  if (access === 'PORT_BLOCKED' || access.includes('PORT')) return 'BLOCKED';
  if (access === 'NETWORK_UNREACHABLE' || access.includes('UNREACH') || access.includes('NO_ROUTE')) return 'UNREACHABLE';
  if (access === 'OFFLINE' || access.includes('OFFLINE')) return 'OFFLINE';
  if (access === 'ACCESSIBLE') {
    if ((machine as any).live_connected === true) return 'ONLINE';
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

function severityFor(status: MachineStatus, qualityScore: number): Severity {
  if (status === 'BLOCKED' || status === 'UNREACHABLE' || qualityScore < 50) return 'CRITICAL';
  if (status === 'OFFLINE' || status === 'STALE') return 'HIGH';
  if (status === 'WARNING' || qualityScore < 80) return 'MEDIUM';
  return 'LOW';
}

async function getMachineRows() {
  return query<any>(`
    SELECT
      m.id,
      m.machine_code,
      m.location_name,
      m.ip_address,
      m.port,
      m.access_status,
      m.data_source,
      m.loc_code,
      m.machine_type,
      m.is_active,
      m.last_sync_at,
      m.last_error_message,
      COALESCE(today.scan_today, 0) AS scan_today,
      COALESCE(hourly.scan_1h, 0) AS scan_1h,
      COALESCE(today.user_count, 0) AS user_count,
      CASE
        WHEN m.access_status = 'ACCESSIBLE' AND COALESCE(today.scan_today, 0) > 0 THEN 95
        WHEN m.access_status = 'ACCESSIBLE' THEN 72
        ELSE 0
      END AS quality_score
    FROM attendance_machines m
    LEFT JOIN (
      SELECT machine_code, COUNT(*) AS scan_today, COUNT(DISTINCT COALESCE(parsed_employee_code, raw_device_user_id)) AS user_count
      FROM attendance_scan_logs
      WHERE scan_date = CAST(GETDATE() AS DATE)
      GROUP BY machine_code
    ) today ON today.machine_code = m.machine_code
    LEFT JOIN (
      SELECT machine_code, COUNT(*) AS scan_1h
      FROM attendance_scan_logs
      WHERE scan_time >= DATEADD(hour, -1, GETDATE())
      GROUP BY machine_code
    ) hourly ON hourly.machine_code = m.machine_code
    WHERE m.is_active = 1
    ORDER BY m.machine_code
  `);
}

async function getQualitySnapshot() {
  const rows = await query<any>(`
    SELECT
      (SELECT COUNT(*) FROM attendance_scan_logs WHERE scan_date >= DATEADD(day, -7, CAST(GETDATE() AS DATE))) AS total_scans,
      (SELECT COUNT(DISTINCT parsed_employee_code) FROM attendance_scan_logs
       WHERE scan_date >= DATEADD(day, -7, CAST(GETDATE() AS DATE)) AND mapping_status = 'MAPPED') AS mapped_employees,
      (SELECT COUNT(DISTINCT raw_device_user_id) FROM attendance_scan_logs
       WHERE scan_date >= DATEADD(day, -7, CAST(GETDATE() AS DATE)) AND mapping_status != 'MAPPED') AS unmapped_codes,
      (SELECT COUNT(*) FROM attendance_import_batches
       WHERE started_at >= DATEADD(day, -7, GETDATE()) AND status = 'FAILED') AS failed_batches,
      (SELECT COUNT(*) FROM attendance_import_batches
       WHERE started_at >= DATEADD(day, -7, GETDATE()) AND status IN ('COMPLETED','SUCCESS')) AS completed_batches,
      (SELECT TOP 1 started_at FROM attendance_import_batches ORDER BY started_at DESC) AS last_sync
  `);
  const row = rows[0] ?? {};
  const mapped = Number(row.mapped_employees ?? 0);
  const unmapped = Number(row.unmapped_codes ?? 0);
  const totalMapped = mapped + unmapped;
  const mappedRate = totalMapped > 0 ? Math.round((mapped / totalMapped) * 100) : 100;
  const completed = Number(row.completed_batches ?? 0);
  const failed = Number(row.failed_batches ?? 0);
  const batchTotal = completed + failed;
  const syncSuccessRate = batchTotal > 0 ? Math.round((completed / batchTotal) * 100) : failed > 0 ? 0 : 100;
  const qualityScore = Math.round(mappedRate * 0.5 + syncSuccessRate * 0.25 + 100 * 0.15 + 100 * 0.1);
  return {
    totalScans: Number(row.total_scans ?? 0),
    mapped,
    unmapped,
    failed,
    completed,
    mappedRate,
    syncSuccessRate,
    qualityScore,
    lastSync: row.last_sync ?? null,
  };
}

route('GET', '/api/ops/summary', async (ctx) => {
  const [machines, quality, employeeRows] = await Promise.all([
    getMachineRows(),
    getQualitySnapshot(),
    query<any>('SELECT COUNT(*) AS total FROM employees WHERE is_active = 1'),
  ]);

  // Run real-time TCP accessibility tests for all DIRECT_ZKTECO machines in parallel
  const zktecoMachines = machines.filter((m: any) => m.data_source === 'DIRECT_ZKTECO' && m.ip_address && m.port);
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
    }
  }

  const statusCounts = machines.reduce((acc: Record<MachineStatus, number>, machine: any) => {
    const tcpResult = tcpResults.get(machine.machine_code);
    const status = classifyMachine(machine, tcpResult);
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, { ONLINE: 0, WARNING: 0, BLOCKED: 0, UNREACHABLE: 0, OFFLINE: 0, DISABLED: 0, STALE: 0 });

  const scanToday = machines.reduce((sum: number, machine: any) => sum + Number(machine.scan_today ?? 0), 0);

  // Count accessible/unreachable based on real-time TCP results
  const accessibleMachines = Array.from(tcpResults.values()).filter((r) => r.status === 'ACCESSIBLE').length;
  const liveOnlineMachines = machines.filter((m: any) => (m as any).live_connected === true).length;

  sendEnvelope(ctx.res, 200, {
    generated_at: new Date().toISOString(),
    totalMachines: machines.length,
    accessibleMachines,
    liveOnlineMachines,
    blockedMachines: statusCounts.BLOCKED,
    unreachableMachines: statusCounts.UNREACHABLE,
    offlineMachines: statusCounts.OFFLINE,
    staleMachines: statusCounts.STALE,
    disabledMachines: statusCounts.DISABLED,
    warningMachines: statusCounts.WARNING,
    scanToday,
    totalEmployees: Number(employeeRows[0]?.total ?? 0),
    unmappedCount: quality.unmapped,
    qualityScore: quality.qualityScore,
    lastSyncAt: quality.lastSync,
  }, {
    source: 'DIRECT_MSSQL',
    quality_score: quality.qualityScore,
  });
});

route('GET', '/api/ops/incidents', async (ctx) => {
  const severityFilter = ctx.query.get('severity')?.toUpperCase();
  const machines = await getMachineRows();

  // Real-time TCP tests for incident classification
  const zktecoMachines = machines.filter((m: any) => m.data_source === 'DIRECT_ZKTECO' && m.ip_address && m.port);
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
    }
  }

  const incidents = machines
    .map((machine: any) => {
      const tcpResult = tcpResults.get(machine.machine_code);
      const status = classifyMachine(machine, tcpResult);
      const qualityScore = Number(machine.quality_score ?? 0);
      const severity = severityFor(status, qualityScore);
      if (severity === 'LOW') return null;
      return {
        id: `machine-${machine.machine_code}-${status}`,
        title: `${machine.machine_code} ${status}`,
        message: machine.last_error_message ?? `${machine.machine_code} status ${status}`,
        severity,
        category: 'MACHINE',
        machineCode: machine.machine_code,
        realAccessStatus: tcpResult?.status ?? machine.access_status,
        accessTestedAt: tcpResult?.testedAt ?? null,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
      };
    })
    .filter(Boolean)
    .filter((incident: any) => !severityFilter || incident.severity === severityFilter);

  sendEnvelope(ctx.res, 200, incidents, { total: incidents.length, source: 'DIRECT_MSSQL' });
});

route('GET', '/api/ops/recommendations', async (ctx) => {
  const [machines, quality] = await Promise.all([getMachineRows(), getQualitySnapshot()]);

  // Real-time TCP tests for accurate recommendation generation
  const zktecoMachines = machines.filter((m: any) => m.data_source === 'DIRECT_ZKTECO' && m.ip_address && m.port);
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
    }
  }

  const statuses = machines.map((m: any) => classifyMachine(m, tcpResults.get(m.machine_code)));
  const blocked = statuses.filter((status) => status === 'BLOCKED').length;
  const unreachable = statuses.filter((status) => status === 'UNREACHABLE').length;
  const stale = statuses.filter((status) => status === 'STALE').length;
  const items: string[] = [];

  if (blocked > 0) items.push(`Periksa firewall/router untuk ${blocked} mesin dengan port blocked.`);
  if (unreachable > 0) items.push(`Cek konektivitas jaringan untuk ${unreachable} mesin unreachable.`);
  if (stale > 0) items.push(`Jalankan refresh status untuk ${stale} mesin stale sync.`);
  if (quality.unmapped > 0) items.push(`Review ${quality.unmapped} device user id yang belum mapped.`);
  if (quality.failed > 0) items.push(`Audit ${quality.failed} batch sinkronisasi gagal dalam 7 hari terakhir.`);
  if (items.length === 0) items.push('Tidak ada tindakan kritis. Pantau refresh mesin dan kualitas data berkala.');

  sendEnvelope(ctx.res, 200, { items }, { source: 'DIRECT_MSSQL', quality_score: quality.qualityScore });
});
