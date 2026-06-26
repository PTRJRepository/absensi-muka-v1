import type { Machine, MachineOperationalStatus } from '../types';
import { requestData, toNumber, toStringOrNull } from './api-client';
import { machineSeverity, normalizeMachineStatus } from './status-mapping';

const NETWORK_GROUPS: Record<string, string> = {
  OFFICE_PGE: 'PGE Network',
  P1A: 'PGE Network',
  P1B: 'PGE Network',
  MILL: 'MILL Network',
  IJL: 'IJL Network',
  DME_01: 'DME Network',
  DME_02: 'DME Network',
  ARA: 'ARA / ARC / AB',
  ARC_01: 'ARA / ARC / AB',
  ARC_02: 'ARA / ARC / AB',
  AB1: 'ARA / ARC / AB',
  AB2: 'ARA / ARC / AB',
  OFFICE_APE: 'ARA / ARC / AB',
  P2A_01: 'P2 Area',
  P2A_02: 'P2 Area',
  P2B: 'P2 Area',
};

export function normalizeMachine(machine: Partial<Machine> & Record<string, unknown>): MachineOperationalStatus {
  const machineCode = String(machine.machine_code ?? machine.machineCode ?? '');
  const scanToday = toNumber(machine.scan_count_today ?? machine.scanToday ?? machine.scan_count_1h);
  const scan1h = toNumber(machine.scan_count_1h ?? machine.scan1h ?? machine.scans_last_hour);
  const userCount = toNumber(machine.user_count ?? machine.userCount ?? machine.user_count_today ?? machine.total_users);
  const qualityScore = toNumber(machine.quality_score ?? machine.qualityScore, scanToday > 0 ? 90 : 0);
  const status = normalizeMachineStatus({
    access_status: toStringOrNull(machine.access_status),
    status: toStringOrNull(machine.status),
    is_active: machine.is_active as boolean | number | null | undefined,
    last_sync_at: toStringOrNull(machine.last_sync_at),
    scan_count_today: scanToday,
    scan_count_1h: scan1h,
    quality_score: qualityScore,
  });

  return {
    machineCode,
    machineName: String(machine.machine_name ?? machine.location_name ?? machineCode),
    locationName: String(machine.location_name ?? machine.machine_name ?? machineCode),
    ipAddress: String(machine.ip_address ?? machine.ipAddress ?? ''),
    port: toNumber(machine.port),
    divisionCode: String(machine.division_code ?? machine.loc_code ?? ''),
    networkGroup: NETWORK_GROUPS[machineCode] ?? 'Other Network',
    status,
    accessStatus: String(machine.access_status ?? status),
    dataSource: String(machine.data_source ?? ''),
    lastSeenAt: toStringOrNull(machine.last_seen_at ?? machine.last_sync_at),
    lastSyncAt: toStringOrNull(machine.last_sync_at),
    scan1h,
    scanToday,
    userCount,
    qualityScore,
    incidentSeverity: machineSeverity(status, qualityScore),
    errorCount: toNumber(machine.error_count),
    healthMessage: toStringOrNull(machine.last_error_message ?? machine.health_message),
  };
}

export async function getOperationalMachines(): Promise<MachineOperationalStatus[]> {
  const machines = await requestData<Array<Partial<Machine> & Record<string, unknown>>>('/api/machines');
  return (machines ?? []).map(normalizeMachine);
}

export async function syncAllMachines(): Promise<{ batchCode: string; status: string; message?: string }> {
  return requestData('/api/scheduler/sync-all', { method: 'POST' });
}

export async function syncMachine(machineCode: string): Promise<{ batchCode: string; status: string; message?: string }> {
  return requestData(`/api/scheduler/sync/${encodeURIComponent(machineCode)}`, { method: 'POST' });
}
