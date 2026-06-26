import type {
  AttendanceMatrixCell,
  AttendanceMatrixRow,
  AttendanceSource,
  IntelligenceAttendanceStatus,
  MappingStatus,
} from '../types';
import { requestData, toNumber, toStringOrNull } from './api-client';
import { normalizeAttendanceStatus, normalizeMappingStatus, normalizeSource } from './status-mapping';

type RawMatrixRecord = Record<string, unknown>;

// ─── Display Name Utilities (ZKTeco Raw User Sync First) ─────────────────────

/**
 * Get display name with priority chain:
 * 1. employee_name / current_emp_name (HR master)
 * 2. zkteco_user_name (from machine)
 * 3. machine_raw_user_name (from raw table)
 * 4. current_emp_code / parsed_employee_code / raw_device_user_id
 * 5. "-" fallback
 */
export function getDisplayName(record: RawMatrixRecord): string {
  const hrName = String(record['employee_name'] ?? record['current_emp_name'] ?? '').trim();
  if (hrName) return hrName;

  const zktecoName = String(record['zkteco_user_name'] ?? record['machine_raw_user_name'] ?? '').trim();
  if (zktecoName) return zktecoName;

  const empCode = String(
    record['current_emp_code'] ?? record['parsed_employee_code'] ?? record['raw_device_user_id'] ?? ''
  ).trim();
  if (empCode) return empCode;

  return '-';
}

/**
 * Get user name source badge for UI display
 */
export function getNameSourceBadge(record: RawMatrixRecord): string {
  const source = String(record['zkteco_user_name_source'] ?? '');
  switch (source) {
    case 'MACHINE_USER_RAW':
      return 'Machine';
    case 'ATTENDANCE_RECORD':
      return 'Attendance';
    case 'NO_RAW_USER':
      return 'No Enrollment';
    case 'EMPTY_RAW_USER_NAME':
      return 'No Name';
    default:
      return source || '-';
  }
}

export interface MatrixFilters {
  year: number;
  month: number;
  divisionCode?: string;
  machineCode?: string;
  search?: string;
  status?: IntelligenceAttendanceStatus | '';
  mapping?: MappingStatus | '';
  source?: AttendanceSource | '';
  page?: number;
  pageSize?: number;
  mode?: 'database' | 'datamesin';
}

export interface MatrixPageResult {
  rows: AttendanceMatrixRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  meta: {
    generatedAt: string;
    source: string;
    mode: 'database' | 'datamesin';
  };
}

export interface AttendanceCellDetail {
  employee?: {
    employee_code: string;
    employee_name: string;
    division_code: string;
    division_name?: string;
  } | null;
  date: string;
  final_status: string;
  expected_status?: string;
  holiday_name?: string | null;
  workday_label?: string | null;
  trace_state?: string | null;
  source: string;
  check_in_at: string | null;
  check_out_at: string | null;
  raw_logs: RawMatrixRecord[];
  correction?: RawMatrixRecord | null;
  imported?: RawMatrixRecord | null;
  quality_flags: string[];
  provenance?: string | null;
}

interface MatrixApiPayload {
  rows?: RawMatrixRecord[];
  data?: RawMatrixRecord[];
  pagination?: {
    page?: number;
    pageSize?: number;
    page_size?: number;
    total?: number;
    totalPages?: number;
    total_pages?: number;
  };
  meta?: Record<string, unknown>;
}

function daysForMonth(year: number, month: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: daysInMonth }, (_, index) => `${year}-${pad(month)}-${pad(index + 1)}`);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = toStringOrNull(value);
    if (normalized) return normalized;
  }
  return '';
}

function firstMatrixToken(...values: unknown[]): string {
  for (const value of values) {
    const normalized = toStringOrNull(value);
    if (!normalized) continue;
    const trimmed = normalized.trim();
    const upper = trimmed.toUpperCase();
    if (trimmed === '-' || upper === 'N/A' || upper === 'NULL' || upper === 'UNDEFINED') continue;
    return trimmed;
  }
  return '';
}

function dateKeyFromRecord(record: RawMatrixRecord): string {
  const directDate = firstString(record.attendance_date, record.scan_date);
  if (directDate) return directDate.slice(0, 10);

  const timeValue = firstString(record.scan_time, record.final_check_in, record.check_in_at, record.raw_record_time);
  return timeValue ? timeValue.slice(0, 10) : '';
}

function hasRawScan(record: RawMatrixRecord | undefined): boolean {
  if (!record) return false;
  return Boolean(
    record.scan_time ||
    record.final_check_in ||
    record.check_in_at ||
    record.raw_device_user_id ||
    toNumber(record.scan_count, 0) > 0
  );
}

function isTrustedLongIdMapping(record: RawMatrixRecord, rawEmployeeCode: string): boolean {
  if (!rawEmployeeCode) return false;
  const reason = firstString(record.mapping_reason, record.mappingReason).toUpperCase();
  const method = firstString(record.match_method, record.matchMethod).toUpperCase();
  const confidence = firstString(record.match_confidence, record.matchConfidence).toUpperCase();
  if (reason.includes('LONG_RAW_ID_LOOKUP_REQUIRED') || reason.includes('EXCLUDED_LONG_ABSENSI_ID')) return false;
  return (
    reason.includes('EMPLOYEES.ZKTECO_USER_ID') ||
    reason.includes('DIRECT_DATABASE_LOOKUP') ||
    reason.includes('EMPLOYEE_MAPPING_OVERRIDES') ||
    reason.includes('MANUAL') ||
    method.includes('EMPLOYEES.ZKTECO_USER_ID') ||
    method.includes('DIRECT_DATABASE_LOOKUP') ||
    method.includes('EMPLOYEE_MAPPING_OVERRIDES') ||
    method.includes('MANUAL') ||
    confidence === 'DIRECT' ||
    confidence === 'MANUAL'
  );
}

export async function getMonthlyMatrix(filters: MatrixFilters): Promise<MatrixPageResult> {
  const params = new URLSearchParams({
    year: String(filters.year),
    month: String(filters.month),
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 100),
    mode: filters.mode ?? 'database',
  });
  if (filters.divisionCode) params.set('divisionCode', filters.divisionCode);
  if (filters.machineCode) params.set('machineCode', filters.machineCode);
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.mapping) params.set('mapping', filters.mapping);
  if (filters.source) params.set('source', filters.source);

  const endpoint = `/api/attendance/monthly-matrix?${params.toString()}`;
  const raw = await requestData<MatrixApiPayload | RawMatrixRecord[]>(endpoint);
  const records = Array.isArray(raw) ? raw : raw.rows ?? raw.data ?? [];
  const rows = groupMatrixRecords(records, filters.year, filters.month, filters.mode ?? 'database');
  const paginationRaw = Array.isArray(raw) ? undefined : raw.pagination;
  const total = toNumber(paginationRaw?.total, rows.length);
  const fallbackPageSize = filters.pageSize ?? (rows.length || 1);
  const pageSize = toNumber(paginationRaw?.pageSize ?? paginationRaw?.page_size, fallbackPageSize);
  const page = toNumber(paginationRaw?.page, filters.page ?? 1);

  return {
    rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: toNumber(paginationRaw?.totalPages ?? paginationRaw?.total_pages, pageSize > 0 ? Math.ceil(total / pageSize) : 1),
    },
    meta: {
      generatedAt: String((raw as MatrixApiPayload).meta?.generated_at ?? new Date().toISOString()),
      source: String((raw as MatrixApiPayload).meta?.source ?? 'unknown'),
      mode: (filters.mode ?? 'database'),
    },
  };
}

export async function getAttendanceCellDetail(input: {
  employeeCode?: string;
  rawDeviceUserId?: string;
  machineCode?: string;
  date: string;
}): Promise<AttendanceCellDetail> {
  const params = new URLSearchParams({ date: input.date });
  if (input.employeeCode) params.set('employeeCode', input.employeeCode);
  if (input.rawDeviceUserId) params.set('rawDeviceUserId', input.rawDeviceUserId);
  if (input.machineCode) params.set('machineCode', input.machineCode);
  return requestData<AttendanceCellDetail>(`/api/attendance/monthly-matrix/cell?${params.toString()}`);
}

export function groupMatrixRecords(
  records: RawMatrixRecord[],
  year: number,
  month: number,
  mode: 'database' | 'datamesin' = 'database',
): AttendanceMatrixRow[] {
  const dates = daysForMonth(year, month);
  const byEmployee = new Map<string, {
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
    cells: Map<string, RawMatrixRecord>;
  }>();

  for (const [recordIndex, record] of records.entries()) {
    const rawId = firstMatrixToken(record.raw_device_user_id, record.rawDeviceUserId);
    const currentEmpCode = firstMatrixToken(record.current_emp_code, record.currentEmpCode);
    const rawEmployeeCode = firstMatrixToken(record.employee_code, record.employeeCode, currentEmpCode);
    const fallbackParsedEmployeeCode = firstMatrixToken(record.parsed_employee_code, record.parsedEmployeeCode);
    const currentHrLocCode = firstMatrixToken(
      record.current_hr_loc_code,
      record.currentHrLocCode,
      record.hr_loc_code,
      record.hrLocCode,
      record.current_loc_code,
      record.currentLocCode,
    );
    const rawIdLength = toNumber(record.raw_id_length, rawId.length);
    const isShortRawId = rawIdLength > 0 && rawIdLength < 5;
    const isLongRawId = rawIdLength > 5;
    const resolvedEmployeeCode = currentEmpCode || rawEmployeeCode || fallbackParsedEmployeeCode || '';
    const hasDirectLongMapping = isLongRawId ? isTrustedLongIdMapping(record, resolvedEmployeeCode) : Boolean(resolvedEmployeeCode);
    const mappedEmployeeCode = isLongRawId
      ? (hasDirectLongMapping ? resolvedEmployeeCode : '')
      : (resolvedEmployeeCode || fallbackParsedEmployeeCode);
    const machineCode = firstMatrixToken(record.machine_code, record.machineCode);
    const isMachineMode = mode === 'datamesin';
    const backendIdentityKey = firstMatrixToken(record.identity_key, record.identityKey);
    const identityKey = backendIdentityKey
      || currentEmpCode
      || resolvedEmployeeCode
      || rawId
      || `unknown:${mode}:${machineCode || 'matrix'}:${recordIndex}`;
    const groupKey = isMachineMode
      ? `${machineCode || 'datamesin'}:${rawId || identityKey}`
      : identityKey;
    if (!groupKey) continue;

    if (!byEmployee.has(groupKey)) {
      const mappingStatus = isShortRawId || (isLongRawId && !hasDirectLongMapping)
        ? 'NEED_REVIEW'
        : normalizeMappingStatus(record.mapping_status ?? (resolvedEmployeeCode ? 'MAPPED' : 'NEED_REVIEW'));
      byEmployee.set(groupKey, {
        identityKey,
        employeeCode: isMachineMode
          ? (isShortRawId || (isLongRawId && !hasDirectLongMapping) ? '' : mappedEmployeeCode || resolvedEmployeeCode || rawId)
          : (currentEmpCode || resolvedEmployeeCode || rawEmployeeCode || fallbackParsedEmployeeCode || rawId),
        employeeName: firstMatrixToken(
          record.current_emp_name,
          record.currentEmpName,
          record.employee_name,
          record.employeeName,
          record.zkteco_user_name,
          record.zktecoUserName,
          rawId,
          resolvedEmployeeCode,
        ),
        divisionCode: isMachineMode
          ? firstMatrixToken(record.division_code, record.parsed_division_code, machineCode)
          : (currentHrLocCode || firstMatrixToken(record.division_code, record.parsed_division_code, machineCode)),
        divisionName: toStringOrNull(record.division_name) ?? undefined,
        mappingStatus,
        rawDeviceUserId: isMachineMode
          ? (rawId || undefined)
          : ((rawId || firstMatrixToken(record.zkteco_user_id, record.zktecoUserId)) || undefined),
        machineCode: machineCode || undefined,
        rawIdLength: rawIdLength || undefined,
        mappingReason: isShortRawId
          ? 'RAW_ID_TOO_SHORT_EXCLUDED'
          : isLongRawId && !hasDirectLongMapping
            ? 'LONG_RAW_ID_LOOKUP_REQUIRED'
            : toStringOrNull(record.mapping_reason) ?? undefined,
        cells: new Map(),
      });
    }

    const date = dateKeyFromRecord(record);
    if (date) byEmployee.get(groupKey)!.cells.set(date, record);
  }

  return Array.from(byEmployee.values()).map((employee) => {
    let present = 0;
    let absent = 0;
    let leave = 0;
    let sick = 0;
    let noData = 0;
    let holiday = 0;
    let manual = 0;
    let offDay = 0;
    let scanCount = 0;

    const days: AttendanceMatrixCell[] = dates.map((date, index) => {
      const record = employee.cells.get(date);
      const explicitStatus = record?.ui_status ?? record?.final_status ?? record?.attendance_status ?? record?.status;
      const status = normalizeAttendanceStatus(explicitStatus ?? (hasRawScan(record) ? 'HADIR' : undefined), record?.source);
      const source = normalizeSource(record?.source ?? record?.data_source ?? (record ? 'ZKTECO' : 'NO_DATA'));
      const dayScanCount = record ? toNumber(record.scan_count, record.scan_time ? 1 : 0) : 0;
      const expectedStatus = String(record?.expected_status ?? record?.expectedStatus ?? '').toUpperCase();
      const reason = toStringOrNull(record?.reason) ?? toStringOrNull(record?.reason_text) ?? null;
      const provenanceValue = record?.provenance;
      const provenance = typeof provenanceValue === 'string'
        ? provenanceValue
        : provenanceValue
          ? JSON.stringify(provenanceValue)
          : null;
      const hasRaw = record ? hasRawScan(record) : false;
      const qualityFlags = [
        status === 'NO_DATA' ? 'NO_DATA' : '',
        status === 'OFF_DAY' ? 'OFF_DAY' : '',
        record?.has_manual_correction ? 'MANUAL_CORRECTION' : '',
        record?.mapping_status === 'NEED_REVIEW' || record?.mapping_status === 'UNMAPPED' || record?.mapping_status === 'INVALID' ? 'MAPPING_REVIEW' : '',
        expectedStatus === 'HOLIDAY' ? 'HOLIDAY' : '',
        expectedStatus === 'OFF_DAY' ? 'OFF_DAY_EXPECTED' : '',
        hasRaw ? 'RAW_SCAN' : '',
      ].filter(Boolean);

      scanCount += dayScanCount;
      if (status === 'HADIR') present++;
      else if (status === 'TIDAK_HADIR') absent++;
      else if (status === 'CUTI') leave++;
      else if (status === 'SAKIT') sick++;
      else if (status === 'HOLIDAY') holiday++;
      else if (status === 'OFF_DAY') offDay++;
      else if (status === 'MANUAL_CORRECTION') manual++;
      else if (status === 'INCOMPLETE_SCAN' || status === 'SCAN_ON_OFFDAY_INCOMPLETE' || status === 'SCAN_ON_HOLIDAY_INCOMPLETE') manual++;
      else noData++;

      return {
        date,
        day: index + 1,
        status,
        source,
        scanCount: dayScanCount,
        checkInAt: toStringOrNull(record?.final_check_in ?? record?.check_in_at ?? record?.scan_time),
        checkOutAt: toStringOrNull(record?.final_check_out ?? record?.check_out_at ?? null),
        machineCode: toStringOrNull(record?.machine_code ?? employee.machineCode),
        qualityFlags,
        rawDeviceUserId: toStringOrNull(record?.raw_device_user_id ?? employee.rawDeviceUserId),
        expectedStatus: expectedStatus as AttendanceMatrixCell['expectedStatus'],
        expectedLabel: toStringOrNull(record?.workday_label) ?? toStringOrNull(record?.holiday_name) ?? undefined,
        holidayName: toStringOrNull(record?.holiday_name) ?? undefined,
        workdayLabel: toStringOrNull(record?.workday_label) ?? undefined,
        reason,
        provenance,
        traceState: toStringOrNull(record?.trace_state) ?? undefined,
        hasRawScan: hasRaw,
        hasImport: Boolean(record?.has_import ?? record?.import_status),
        hasManualCorrection: Boolean(record?.has_manual_correction ?? record?.correction_status),
      };
    });

    const workedDays = days.length - noData;
    return {
      identityKey: employee.identityKey,
      employeeCode: employee.employeeCode,
      employeeName: employee.employeeName,
      divisionCode: employee.divisionCode,
      divisionName: employee.divisionName,
      mappingStatus: employee.mappingStatus,
      rawDeviceUserId: employee.rawDeviceUserId,
      machineCode: employee.machineCode,
      rawIdLength: employee.rawIdLength,
      mappingReason: employee.mappingReason,
      days,
      summary: {
        present,
        absent,
        leave,
        sick,
        noData,
        holiday,
        offDay,
        manual,
        scanCount,
        attendanceRate: workedDays > 0 ? Math.round((present / workedDays) * 100) : 0,
      },
    };
  });
}
