/**
 * Estate Attendance UI Types
 * Domain types for the Estate Operations Grid attendance matrix.
 */

export type AttendanceSourceMode = 'database' | 'datamesin';

export type AttendanceUiStatus =
  | 'HADIR'
  | 'TIDAK_HADIR'
  | 'SAKIT'
  | 'CUTI'
  | 'OFF_DAY'
  | 'NO_DATA'
  | 'MANUAL'
  | 'INCOMPLETE_SCAN'
  | 'NEED_REVIEW';

export type MappingStatus = 'MAPPED' | 'NEED_REVIEW' | 'UNMAPPED' | 'AMBIGUOUS';

export interface AttendanceDayCell {
  date: string;
  day: number;
  weekday: string;
  uiStatus: AttendanceUiStatus;
  label: string;
  cellKey: string;
  scanCount?: number;
  hasManualCorrection?: boolean;
}

export interface AttendanceMatrixRow {
  identityKey: string;
  employeeCode: string;
  currentEmpCode?: string;
  rawDeviceUserId?: string;
  displayName: string;
  divisionCode: string;
  machineCode?: string;
  mappingStatus: MappingStatus;
  days: AttendanceDayCell[];
  presentCount: number;
  absentCount: number;
  attendancePercent: number;
}

export interface AttendanceMatrixPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface MatrixFilters {
  year: number;
  month: number;
  divisionCode?: string;
  machineCode?: string;
  status?: AttendanceUiStatus;
  mapping?: MappingStatus;
  search?: string;
  mode: AttendanceSourceMode;
  page: number;
  pageSize: number;
}

export interface SelectedEmployeeDetail {
  identityKey: string;
  employeeCode: string;
  displayName: string;
  divisionCode: string;
  machineCode?: string;
  mappingStatus: MappingStatus;
  role?: string;
  workplace?: string;
  presentCount: number;
  absentCount: number;
  sickCount: number;
  attendancePercent: number;
  recentScans: Array<{
    id: string;
    timestamp: string;
    direction: 'IN' | 'OUT';
    location: string;
  }>;
}
