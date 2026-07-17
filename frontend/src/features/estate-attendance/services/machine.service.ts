import { api } from '../../../lib/api';
import type { MachineRecord, RawUser, RawScanLog } from '../types/machine.types';

export async function fetchMachines(): Promise<MachineRecord[]> {
  return api<MachineRecord[]>('/api/machines');
}

export async function fetchMachineUsers(
  machineCode: string,
  page = 1,
  pageSize = 50
): Promise<{ data: RawUser[]; total: number }> {
  return api<{ data: RawUser[]; total: number }>(
    `/api/monitoring/machine/${encodeURIComponent(machineCode)}/employees`,
    { params: { page, pageSize } }
  );
}

export async function fetchMachineRawData(
  machineCode: string,
  params: { dateFrom?: string; dateTo?: string; page?: number; pageSize?: number } = {}
): Promise<{ data: RawScanLog[]; total: number }> {
  return api<{ data: RawScanLog[]; total: number }>(
    `/api/monitoring/machine/${encodeURIComponent(machineCode)}/raw-data`,
    { params }
  );
}
