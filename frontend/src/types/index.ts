// === Shared Types for Absensi Muka Frontend ===

export interface Machine {
  machine_code: string;
  machine_name: string;
  location_name: string;
  status: 'ONLINE' | 'OFFLINE' | 'WARNING';
  access_status: string;
  ip_address: string;
  port: number;
  is_active: boolean;
  last_sync_at: string | null;
  scan_count_1h: number;
  user_count: number;
  data_source: string;
  // 7-status classification fields
  display_status?: string;
  sync_status?: string;
  live_status?: string;
  severity?: string;
  reason?: string;
  quality_score?: number;
  scan_count_today?: number;
  error_count?: number;
  last_error_message?: string;
}

export interface Employee {
  id: number;
  employee_code: string;
  employee_name: string;
  division_code: string;
  gang_code: string | null;
  is_active: boolean;
  division_name?: string;
}

export interface Division {
  id: number;
  division_code: string;
  division_name: string;
  location: string;
  is_active: boolean;
}

export interface AttendanceRecord {
  id: number;
  employee_code: string;
  employee_name: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  division_code: string;
  machine_code: string;
  status: 'HADIR' | 'ALPHA' | 'IZIN' | 'SAKIT' | null;
}

export interface AttendanceDaily {
  employee_code: string;
  employee_name: string;
  division_code: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: number | null;
  status: string | null;
}

export interface DashboardStats {
  total_machines: number;
  online_machines: number;
  offline_machines: number;
  total_employees: number;
  total_scans_today: number;
  unmapped_count: number;
  quality_score: number;
  last_sync: string | null;
  today_date: string;
}

export interface DashboardSummary {
  date: string;
  total_present: number;
  total_absent: number;
  total_employees: number;
  coverage_pct: number;
}

export interface DivisionSummary {
  division_code: string;
  division_name: string;
  total_present: number;
  total_absent: number;
  total_employees: number;
  coverage_pct: number;
}

export interface SyncBatch {
  batch_code: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';
  started_at: string;
  completed_at: string | null;
  machine_code: string | null;
  total_records: number;
  error_message: string | null;
}

export interface SyncStatus {
  machine_code: string;
  machine_name: string;
  status: string;
  last_sync_at: string | null;
  records_today: number;
  errors: number;
}

export interface AlertRule {
  id: number;
  name: string;
  type: string;
  condition: string;
  threshold: number;
  enabled: boolean;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}

export interface QualityMetric {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  value: number;
  description: string;
  recommendations?: string[];
}

export interface QualityReport {
  overall_status: 'healthy' | 'warning' | 'critical';
  score: number;
  metrics: QualityMetric[];
  summary: {
    critical_count: number;
    warning_count: number;
    healthy_count: number;
  };
}

// === Employee Comprehensive Explorer Types ===
export interface EmployeeComprehensiveFilters {
  mode: 'datamesin' | 'database';
  divisionCode?: string;
  machineCode?: string;
  search?: string;
  mappingStatus?: 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW' | 'ALL';
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface EmployeeComprehensiveRow {
  identityKey: string;
  rawDeviceUserId: string;
  parsedEmployeeCode: string | null;
  currentEmpCode: string | null;
  employeeCode: string | null;
  nik: string | null;
  zktecoUserName: string | null;
  employeeName: string | null;
  machineCode: string;
  divisionCode: string | null;
  gangCode: string | null;
  mappingStatus: 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW' | 'AMBIGUOUS';
  mappingReason: string | null;
  scanCount: number;
  firstScanAt: string | null;
  lastScanAt: string | null;
}

export interface EmployeeKPIs {
  total: number;
  mapped: number;
  unmapped: number;
  needReview: number;
  nameFound: number;
  nameMissing: number;
  scanCount: number;
  activeMachines: number;
}

export interface EmployeeIdentity {
  rawDeviceUserId: string;
  parsedEmployeeCode: string | null;
  currentEmpCode: string | null;
  nik: string | null;
  employeeCode: string | null;
  zktecoUserName: string | null;
  employeeName: string | null;
  machineCode: string;
  divisionCode: string | null;
  gangCode: string | null;
  mappingStatus: 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW' | 'AMBIGUOUS';
  mappingReason: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface ScanRecord {
  id: number;
  machineCode: string;
  rawDeviceUserId: string;
  rawUserSn: string | null;
  scanTime: string;
  scanDate: string;
  parsedEmployeeCode: string | null;
  mappingStatus: string;
  eventType: string | null;
  verifyType: string | null;
  syncBatchId: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  rows: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface SchedulerInfo {
  enabled: boolean;
  interval_minutes: number;
  running_jobs: string[];
  next_scheduled_run: string | null;
  status: 'IDLE' | 'SYNCING' | 'ERROR';
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

// Attendance status union type
export type AttendanceStatus = 'HADIR' | 'ALPHA' | 'IZIN' | 'SAKIT' | 'NO_DATA' | 'CUTI' | 'DINAS_LUAR' | 'LIBUR' | 'REMOTE' | null;

// Extended AttendanceDaily with all fields
export interface AttendanceDailyExtended extends AttendanceDaily {
  attendance_date: string;
  gang_code: string | null;
  attendance_status?: string;
  division_name?: string;
  home_division?: string;
  cross_division_scan?: boolean;
  need_review?: boolean;
}

// === Employee Detail Types ===

export interface CodeHistoryEntry {
  id: number;
  empCode: string;
  empName: string | null;
  locCode: string | null;
  status: string | null;
  isCurrent: boolean;
  createDate: string | null;
  updateDate: string | null;
  sourceTable?: string;
  syncedAt?: string;
}

export interface MachineEnrollment {
  rawDeviceUserId: string;
  parsedCode: string | null;
  currentEmpCode: string | null;
  machineCode: string;
  machineName?: string;
  zktecoUserName?: string | null;
  mappingStatus?: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface EmployeeDetail {
  employeeId: number;
  currentEmpCode: string;
  employeeName: string | null;
  nik: string | null;
  nikMasked: string | null;
  divisionCode?: string | null;
  divisionName?: string | null;
  gangCode?: string | null;
  locCode?: string | null;
  status?: string | null;
  isActive?: boolean;
  createDate?: string | null;
  updateDate?: string | null;
  codeHistory: CodeHistoryEntry[];
  machineEnrollments: MachineEnrollment[];
}

// Quality page types
export interface UnmappedRecord {
  raw_device_user_id: string;
  machine_code: string;
  first_seen: string;
  scan_count: number;
}

export interface DuplicateRecord {
  employee_code: string;
  scan_time: string;
  machine_code: string;
  count: number;
}

// Live feed item
export interface LiveFeedItem {
  emp_code: string;
  machine: string;
  time: string;
  status?: 'mapped' | 'unmapped';
}

// Sync status
export interface SyncMachineStatus {
  machine_code: string;
  machine_name: string;
  status: 'ONLINE' | 'OFFLINE' | 'WARNING';
  last_sync_at: string | null;
  records_today: number;
  errors: number;
}

export type MachineStatusVariant = 'primary' | 'success' | 'warning' | 'error' | 'info';
export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

// Alert types
export interface Alert {
  id: number;
  title: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  category?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface AlertRule {
  id: number;
  name: string;
  checkType: string;
  condition: string;
  threshold: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  channels: string[];
  enabled: boolean;
}

// Batch history types
export interface BatchHistory {
  id: number;
  batch_code: string;
  machine_id: number | null;
  machine_code: string;
  machine_name: string;
  ip_address: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL_SUCCESS' | 'STUCK';
  records_total: number;
  records_success: number;
  records_failed: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

export interface BatchSummary {
  total: number;
  completed: number;
  running: number;
  failed: number;
  stuck: number;
}

// === Machine Detail Types ===
// IMPORTANT: Understand the dual-mode concept:
// - "Data Mesin" mode shows machine_raw (raw device_uid from ZKTeco)
// - "Database" mode shows database_mapped + unmapped (processed/linked to employees)

export interface MachineEmployeeSummary {
  total_unique_ids: number;
  mapped_count: number;
  unmapped_count: number;
  db_employees_seen: number;
}

/**
 * Raw user data from machine - use for "Data Mesin" mode.
 * Primary identity: raw_id (device UID). employee_code is the resolved mapping.
 */
export interface MachineRawUser {
  raw_id: string;                    // Device UID (e.g., "10044")
  parsed_employee_code?: string;    // SSOT parsed code from scan_logs
  employee_code?: string | null;    // Resolved current_emp_code via employees table
  employee_name?: string | null;    // Employee name from employees table
  zkteco_user_name?: string | null; // Name from ZKTeco machine
  parsed_division_code?: string;     // Division code from parsing
  mapping_status?: string;          // MAPPED, NEED_REVIEW, UNMAPPED
  mapping_reason?: string;           // Mapping reason
  raw_id_length?: number;           // Length of raw_id for display
  occurrence_count: number;
  last_seen: string;
}

/**
 * Mapped user - employee successfully linked to device_uid.
 * Primary identity: employee_code. Use for "Database" mode.
 */
export interface MachineDbMappedUser {
  raw_id: string;               // Original device UID
  parsed_employee_code?: string; // Parsed from SSOT parser
  employee_code: string;         // Resolved current_emp_code (primary key for display)
  employee_name: string;         // Employee name
  occurrence_count: number;
  last_seen: string;
}

/**
 * Unmapped user - device_uid that couldn't be mapped to employee.
 * Use for "Database" mode.
 */
export interface MachineUnmappedUser {
  raw_id: string;              // Device UID that failed mapping
  employee_code?: string | null; // Could be resolved
  zkteco_user_name?: string | null;
  mapping_status: string;        // Why unmapped
  mapping_reason?: string;      // Detailed reason
  raw_id_length?: number;
  occurrence_count?: number;
  last_seen: string;
}

export interface MachineDbEmployee {
  employee_code: string;
  employee_name: string;
  division_code: string;
  last_scan: string | null;
}

/**
 * Complete response for MachineDetailModal
 * Contains all user data for both modes:
 * - machine_raw: For "Data Mesin" toggle (blue)
 * - database_mapped + unmapped: For "Database" toggle (green)
 */
export interface MachineEmployeesResponse {
  machine: {
    id: number;
    machine_code: string;
    location_name: string;
    ip_address: string;
    port: number;
    access_status: string;
  };
  summary: MachineEmployeeSummary;
  machine_raw: MachineRawUser[];      // ← Data Mesin mode
  database_mapped: MachineDbMappedUser[]; // ← Database mode
  unmapped: MachineUnmappedUser[];    // ← Database mode (show as "Unmapped" badge)
  db_employees: MachineDbEmployee[];
}

export interface RawScanLog {
  id: number;
  raw_id?: string;
  raw_device_user_id: string;
  parsed_employee_code: string | null;
  zkteco_user_name?: string | null;
  employee_code?: string | null;   // Resolved current_emp_code
  employee_name?: string | null;  // Employee name from employees table
  scan_time: string;
  scan_date?: string;
  event_type: string;
  verify_type: string;
  work_code: string | null;
  machine_code: string;
  mapping_status: string;
  mapping_reason?: string | null;
  raw_id_length?: number;
}

export interface RawScanLogsResponse {
  machine_code: string;
  filter: string;
  records: RawScanLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SyncHistory {
  id: number;
  batch_code: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL_SUCCESS';
  started_at: string;
  finished_at: string | null;
  records_total: number;
  records_success: number;
  records_failed: number;
  error_message: string | null;
}

// ─── Machine Clock Health ──────────────────────────────────────────────────────
export type TimezoneMode = 'UTC_SOURCE' | 'WIB_SOURCE' | 'CUSTOM_OFFSET' | 'UNKNOWN';
export type ClockStatus = 'OK' | 'UTC_MODE' | 'DRIFTED' | 'UNKNOWN' | 'NEEDS_MANUAL_CHECK';
export type TimeCorrectionStatus =
  | 'NOT_CHECKED' | 'PREVIEWED' | 'CORRECTED'
  | 'SKIPPED_WIB_ALREADY' | 'SKIPPED_UNKNOWN_PROFILE'
  | 'ROLLBACKED' | 'ERROR';

export interface MachineClockHealth {
  machineCode: string;
  timezoneMode: TimezoneMode;
  offsetMinutes: number;
  clockStatus: ClockStatus;
  scanCount: number;
  earliestHour: number;
  latestHour: number;
  needsCorrection: boolean;
  lastClockCheckedAt: string | null;
  clockNote: string | null;
}

export interface CorrectionPreview {
  machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number;
  affectedRows: number; dateChangedRows: number; collisionCount: number;
  sample: Array<{ id: number; oldScanTime: string; newScanTime: string; oldScanDate: string; newScanDate: string; rawDeviceUserId: string }>;
}

export interface ApplyCorrectionRequest {
  machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number;
  executedBy?: string; dryRun?: boolean; rebuildImports?: boolean;
}

export type MachineOperationalStatusCode =
  | 'ONLINE'
  | 'WARNING'
  | 'BLOCKED'
  | 'UNREACHABLE'
  | 'OFFLINE'
  | 'DISABLED'
  | 'STALE';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IntelligenceAttendanceStatus =
  | 'HADIR'
  | 'TIDAK_HADIR'
  | 'SAKIT'
  | 'CUTI'
  | 'HOLIDAY'
  | 'OFF_DAY'
  | 'NO_DATA'
  | 'MANUAL_CORRECTION'
  | 'INCOMPLETE_SCAN'
  | 'SCAN_ON_OFFDAY'
  | 'SCAN_ON_HOLIDAY'
  | 'SCAN_ON_OFFDAY_INCOMPLETE'
  | 'SCAN_ON_HOLIDAY_INCOMPLETE'
  | 'INVALID';

export type MappingStatus = 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW' | 'INVALID';

export type AttendanceSource = 'ZKTECO' | 'API' | 'MANUAL' | 'HYBRID' | 'NO_DATA';

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    generated_at?: string;
    page?: number;
    page_size?: number;
    total?: number;
    source?: string;
    quality_score?: number;
    [key: string]: unknown;
  };
  errors?: Array<{
    code: string;
    message: string;
    detail?: string;
  }>;
  message?: string;
  error?: string | { code: string; message: string };
}

export interface MachineOperationalStatus {
  machineCode: string;
  machineName: string;
  locationName: string;
  ipAddress: string;
  port: number;
  divisionCode: string;
  networkGroup: string;
  status: MachineOperationalStatusCode;
  accessStatus: string;
  dataSource: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  scan1h: number;
  scanToday: number;
  userCount: number;
  qualityScore: number;
  incidentSeverity: IncidentSeverity;
  errorCount: number;
  healthMessage: string | null;
  // 7-status classification fields
  syncStatus?: string;
  liveStatus?: string;
  severity?: string;
  reason?: string;
}

export interface OpsSummary {
  generatedAt: string;
  totalMachines: number;
  accessibleMachines: number;
  onlineMachines: number;
  liveOnlineMachines: number;
  warningMachines: number;
  blockedMachines: number;
  unreachableMachines: number;
  offlineMachines: number;
  staleMachines: number;
  disabledMachines: number;
  scanToday: number;
  totalEmployees: number;
  unmappedCount: number;
  qualityScore: number;
  lastSyncAt: string | null;
}

export interface OpsIncident {
  id: string;
  title: string;
  message: string;
  severity: IncidentSeverity;
  category: 'MACHINE' | 'MAPPING' | 'BATCH' | 'QUALITY' | 'ATTENDANCE';
  machineCode?: string;
  createdAt: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
}

export interface AttendanceMatrixCell {
  date: string;
  day: number;
  status: IntelligenceAttendanceStatus;
  source: AttendanceSource;
  scanCount: number;
  checkInAt: string | null;
  checkOutAt: string | null;
  machineCode: string | null;
  qualityFlags: string[];
  rawDeviceUserId?: string | null;
  reason?: string | null;
  reasonCode?: string | null;
  expectedStatus?: 'WORKDAY' | 'OFF_DAY' | 'HOLIDAY' | 'CUTI' | 'SAKIT' | 'NO_DATA';
  expectedWorkMinutes?: number | null;
  expectedLabel?: string | null;
  holidayName?: string | null;
  workdayLabel?: string | null;
  decisionSource?: string | null;
  provenance?: string | null;
  traceState?: string | null;
  hasRawScan?: boolean;
  hasImport?: boolean;
  hasManualCorrection?: boolean;
}

export interface AttendanceMatrixRow {
  identityKey: string;
  employeeCode: string;
  employeeName: string;
  divisionCode: string;
  divisionName?: string;
  mappingStatus: MappingStatus;
  rawDeviceUserId?: string;
  machineCode?: string;
  rawIdLength?: number;
  mappingReason?: string;
  days: AttendanceMatrixCell[];
  summary: {
    present: number;
    absent: number;
    leave: number;
    sick: number;
    noData: number;
    holiday: number;
    offDay: number;
    manual: number;
    scanCount: number;
    attendanceRate: number;
  };
}

export interface QualitySummary {
  generatedAt: string;
  qualityScore: number;
  status: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
  mappedRate: number;
  unmappedCount: number;
  duplicateRate: number;
  syncSuccessRate: number;
  staleDataCount: number;
  invalidTimestampCount: number;
  totalScans: number;
  failedBatches: number;
  completedBatches: number;
}
