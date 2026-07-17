export type MappingStatus = 'MAPPED' | 'NEED_REVIEW' | 'UNMAPPED' | 'AMBIGUOUS';
export type MappingAction = 'ACCEPT' | 'MANUAL' | 'IGNORE' | 'REEVALUATE';

export interface MappingRecord {
  rawDeviceUserId: string;
  machineCode: string;
  parsedEmployeeCode: string;
  currentEmployeeCode: string | null;
  employeeName: string | null;
  mappingStatus: MappingStatus;
  reason: string | null;
  confidence: number | null;
  lastScan: string | null;
  userName: string | null;
}

export interface MappingActionPayload {
  record: MappingRecord;
  action: MappingAction;
  targetEmployeeCode?: string;
  reason?: string;
}

export interface AuditEntry {
  id: string;
  userId: string;
  timestamp: string;
  action: MappingAction;
  rawDeviceUserId: string;
  machineCode: string;
  beforeCode: string | null;
  afterCode: string | null;
  reason: string | null;
}
