export type MachineStatusCode = 'ONLINE' | 'WARNING' | 'STALE' | 'BLOCKED' | 'UNREACHABLE' | 'OFFLINE' | 'DISABLED';

export type MachineStatusLabel = 'Online' | 'Offline';

export type MachineInspectionTab = 'users' | 'scans' | 'errors' | 'mapping';

export interface MachineRecord {
  machineCode: string;
  machineName: string;
  locationName: string;
  ipAddress: string;
  port: number;
  status: MachineStatusCode;
  accessStatus: string;
  networkGroup: string;
  userCount: number;
  scanToday: number;
  lastSyncAt: string | null;
  healthMessage?: string;
}

export interface RawUser {
  rawUserId: string;
  name: string;
  privilege: string;
  cardNo: string | null;
  password: string | null;
  machineCode: string;
}

export interface RawScanLog {
  id: string;
  machineCode: string;
  rawUserId: string;
  userName: string;
  scanTime: string;
  direction: 'IN' | 'OUT';
  mappingStatus: string;
}
