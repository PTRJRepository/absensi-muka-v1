/**
 * Parsed attendance and employee search types for Estate Operations Grid.
 */

export interface ParsedRecord {
  id: string;
  employeeCode: string;
  currentEmpCode: string;
  employeeName: string;
  divisionCode: string;
  attendanceDate: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  scanCount: number;
  source: string;
  hasManualCorrection: boolean;
}

export interface SearchResult {
  identityKey: string;
  employeeCode: string;
  currentEmpCode: string;
  displayName: string;
  divisionCode: string;
  machineCode?: string;
  mappingStatus: string;
  lastScan?: string;
}

export interface SavedView {
  id: string;
  label: string;
  filter: Record<string, string>;
}
