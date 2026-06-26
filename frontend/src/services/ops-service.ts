import type { OpsIncident, OpsSummary } from '../types';
import { requestData, toNumber, toStringOrNull } from './api-client';
import { getOperationalMachines } from './machine-service';

export async function getOpsSummary(): Promise<OpsSummary> {
  try {
    const raw = await requestData<Record<string, unknown>>('/api/ops/summary');
    return normalizeOpsSummary(raw);
  } catch {
    const [stats, machines] = await Promise.all([
      requestData<Record<string, unknown>>('/api/dashboard/stats'),
      getOperationalMachines(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      totalMachines: machines.length || toNumber(stats.total_machines),
      accessibleMachines: machines.filter((m) => (m.accessStatus ?? '').toUpperCase() === 'ACCESSIBLE').length,
      onlineMachines: machines.filter((m) => m.status === 'ONLINE').length,
      liveOnlineMachines: machines.filter((m) => (m.liveStatus ?? '').toUpperCase() === 'ONLINE').length,
      warningMachines: machines.filter((m) => m.status === 'WARNING' || m.status === 'STALE').length,
      blockedMachines: machines.filter((m) => m.status === 'BLOCKED').length,
      unreachableMachines: machines.filter((m) => m.status === 'UNREACHABLE').length,
      offlineMachines: machines.filter((m) => m.status === 'OFFLINE').length,
      staleMachines: machines.filter((m) => m.status === 'STALE').length,
      disabledMachines: machines.filter((m) => m.status === 'DISABLED').length,
      scanToday: toNumber(stats.total_scans_today) || machines.reduce((sum, m) => sum + m.scanToday, 0),
      totalEmployees: toNumber(stats.total_employees),
      unmappedCount: toNumber(stats.unmapped_count),
      qualityScore: toNumber(stats.quality_score),
      lastSyncAt: toStringOrNull(stats.last_sync),
    };
  }
}

export async function getOpsIncidents(): Promise<OpsIncident[]> {
  try {
    const raw = await requestData<OpsIncident[]>('/api/ops/incidents');
    return raw ?? [];
  } catch {
    const machines = await getOperationalMachines();
    return machines
      .filter((m) => m.incidentSeverity !== 'LOW')
      .map((m) => ({
        id: `machine-${m.machineCode}`,
        title: `${m.machineCode} ${m.status}`,
        message: m.healthMessage ?? `${m.machineCode} requires attention`,
        severity: m.incidentSeverity,
        category: 'MACHINE',
        machineCode: m.machineCode,
        createdAt: new Date().toISOString(),
        status: 'OPEN',
      }));
  }
}

export async function getOpsRecommendations(): Promise<string[]> {
  try {
    const raw = await requestData<{ items?: string[] } | string[]>('/api/ops/recommendations');
    return Array.isArray(raw) ? raw : raw.items ?? [];
  } catch {
    const summary = await getOpsSummary();
    const recommendations: string[] = [];
    if (summary.blockedMachines > 0) recommendations.push('Prioritaskan pemeriksaan firewall/router untuk mesin blocked.');
    if (summary.unreachableMachines > 0) recommendations.push('Cek konektivitas jaringan lokal untuk mesin unreachable.');
    if (summary.unmappedCount > 0) recommendations.push('Review queue unmapped sebelum laporan final digunakan.');
    if (summary.qualityScore < 80) recommendations.push('Jalankan audit kualitas data dan batch gagal.');
    return recommendations;
  }
}

function normalizeOpsSummary(raw: Record<string, unknown>): OpsSummary {
  return {
    generatedAt: String(raw.generated_at ?? raw.generatedAt ?? new Date().toISOString()),
    totalMachines: toNumber(raw.totalMachines ?? raw.total_machines),
    // Handle both new API field names (accessibleMachines) and legacy (onlineMachines)
    accessibleMachines: toNumber(raw.accessibleMachines ?? raw.accessible_machines ?? raw.onlineMachines ?? raw.online_machines),
    onlineMachines: toNumber(raw.onlineMachines ?? raw.online_machines ?? raw.accessibleMachines ?? raw.accessible_machines),
    liveOnlineMachines: toNumber(raw.liveOnlineMachines ?? raw.liveOnlineMachines),
    warningMachines: toNumber(raw.warningMachines ?? raw.warning_machines),
    blockedMachines: toNumber(raw.blockedMachines ?? raw.blocked_machines),
    unreachableMachines: toNumber(raw.unreachableMachines ?? raw.unreachable_machines),
    offlineMachines: toNumber(raw.offlineMachines ?? raw.offline_machines),
    staleMachines: toNumber(raw.staleMachines ?? raw.stale_machines),
    disabledMachines: toNumber(raw.disabledMachines ?? raw.disabled_machines),
    scanToday: toNumber(raw.scanToday ?? raw.scan_today ?? raw.total_scans_today),
    totalEmployees: toNumber(raw.totalEmployees ?? raw.total_employees),
    unmappedCount: toNumber(raw.unmappedCount ?? raw.unmapped_count),
    qualityScore: toNumber(raw.qualityScore ?? raw.quality_score),
    lastSyncAt: toStringOrNull(raw.lastSyncAt ?? raw.last_sync_at ?? raw.lastSync),
  };
}
