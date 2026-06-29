import { route, RequestContext } from '../router';
import { sendEnvelope, sendError } from '../response';
import {
  getEmployeesComprehensive,
  getEmployeesComprehensiveKPIs,
  getEmployeeDetail,
  getEmployeeScans,
  type EmployeeComprehensiveFilters,
  type MappingStatus,
} from '../../modules/employees/employee-comprehensive.service';

// ─── Row mappers (snake_case SQL → camelCase frontend) ───────────────────────
// Backend query aliases are snake_case; frontend types (EmployeeComprehensiveRow,
// EmployeeKPIs) are camelCase. Without these, only `nik` (same both sides) shows
// and drawer detail/scans get empty employeeCode → "//detail" 404.

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const str = String(v).trim();
  return str === '' ? null : str;
}
function n(v: unknown, def = 0): number {
  const num = Number(v);
  return Number.isFinite(num) ? num : def;
}

function mapRow(r: Record<string, unknown>) {
  return {
    identityKey: s(r.identity_key) ?? `${s(r.machine_code) ?? ''}:${s(r.raw_device_user_id) ?? ''}`,
    rawDeviceUserId: s(r.raw_device_user_id) ?? '',
    parsedEmployeeCode: s(r.parsed_employee_code),
    currentEmpCode: s(r.current_emp_code),
    employeeCode: s(r.employee_code) ?? s(r.current_emp_code) ?? s(r.parsed_employee_code),
    nik: s(r.nik),
    zktecoUserName: s(r.zkteco_user_name),
    employeeName: s(r.employee_name),
    machineCode: s(r.machine_code) ?? '',
    divisionCode: s(r.division_code),
    gangCode: s(r.gang_code),
    mappingStatus: (s(r.mapping_status) ?? 'NEED_REVIEW') as 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW' | 'AMBIGUOUS',
    mappingReason: s(r.mapping_reason),
    scanCount: n(r.scan_count),
    firstScanAt: s(r.first_scan_at),
    lastScanAt: s(r.last_scan_at),
  };
}

function mapKpi(k: Record<string, unknown>) {
  return {
    total: n(k.total_users ?? k.totalUniqueUsers),
    mapped: n(k.mapped ?? k.mappedCount),
    unmapped: n(k.unmapped ?? k.unmappedCount),
    needReview: n(k.need_review ?? k.needReviewCount),
    nameFound: n(k.name_found),
    nameMissing: n(k.name_missing),
    scanCount: n(k.total_scans ?? k.totalScans),
    activeMachines: n(k.active_machines),
  };
}

function mapDetail(r: Record<string, unknown> | null) {
  if (!r) return null;
  return {
    rawDeviceUserId: s(r.raw_device_user_id) ?? '',
    parsedEmployeeCode: s(r.parsed_employee_code),
    currentEmpCode: s(r.current_emp_code),
    nik: s(r.nik),
    employeeCode: s(r.employee_code) ?? s(r.current_emp_code),
    zktecoUserName: s(r.zkteco_user_name),
    employeeName: s(r.employee_name),
    machineCode: s(r.machine_codes) ?? '',
    divisionCode: s(r.division_code),
    divisionName: s(r.division_name),
    gangCode: s(r.gang_code),
    mappingStatus: (s(r.mapping_status) ?? 'NEED_REVIEW') as 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW' | 'AMBIGUOUS',
    mappingReason: s(r.mapping_reason),
    firstSeenAt: s(r.first_scan_at) ?? s(r.first_seen_at),
    lastSeenAt: s(r.last_scan_at) ?? s(r.last_seen_at),
    hrEmployeeCode: s(r.hr_employee_code),
    hrLocCode: s(r.hr_loc_code),
    hrStatus: s(r.hr_status),
    isActive: r.is_active === true || r.is_active === 1 || r.is_active === 'true',
    machineCodes: s(r.machine_codes) ?? '',
    machineCount: n(r.machine_count),
    batchImport: s(r.batch_import),
  };
}

// ─── Default Date Range Helper ────────────────────────────────────────────────

function getDefaultDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
}

function parseMappingStatus(value: string | null | undefined): MappingStatus | 'ALL' {
  if (!value || value === 'ALL') return 'ALL';
  const upper = value.toUpperCase();
  if (['MAPPED', 'UNMAPPED', 'NEED_REVIEW', 'AMBIGUOUS'].includes(upper)) {
    return upper as MappingStatus;
  }
  return 'ALL';
}

// ─── Main List Endpoint (Dual-Mode) ─────────────────────────────────────────

route('GET', '/api/employees-comprehensive', async (ctx: RequestContext) => {
  const mode = ctx.query.get('mode') ?? 'datamesin';
  const divisionCode = ctx.query.get('divisionCode');
  const machineCode = ctx.query.get('machineCode');
  const search = ctx.query.get('search');
  const mappingStatus = ctx.query.get('mappingStatus') ?? 'ALL';
  const startDateParam = ctx.query.get('startDate');
  const endDateParam = ctx.query.get('endDate');
  const page = ctx.query.get('page') ?? '1';
  const pageSize = ctx.query.get('pageSize') ?? '50';

  // Validate mode
  const validMode = mode === 'database' ? 'database' : 'datamesin';

  // Parse pagination
  const pageNum = Math.max(parseInt(page) || 1, 1);
  const pageSizeNum = Math.min(Math.max(parseInt(pageSize) || 50, 1), 200);

  // Date range with defaults
  const { startDate, endDate } = getDefaultDateRange();
  const startDateFinal = startDateParam || startDate;
  const endDateFinal = endDateParam || endDate;

  // Validate dates
  if (startDateFinal > endDateFinal) {
    sendError(ctx.res, 400, 'INVALID_DATE_RANGE', 'startDate must be before or equal to endDate');
    return;
  }

  const filters: EmployeeComprehensiveFilters = {
    mode: validMode,
    divisionCode: divisionCode || null,
    machineCode: machineCode || null,
    search: search || null,
    mappingStatus: parseMappingStatus(mappingStatus),
    startDate: startDateFinal,
    endDate: endDateFinal,
    page: pageNum,
    pageSize: pageSizeNum,
  };

  try {
    const result = await getEmployeesComprehensive(filters);
    sendEnvelope(ctx.res, 200, {
      rows: (result.rows as unknown as Record<string, unknown>[]).map(mapRow),
      pagination: result.pagination,
    }, {
      source: 'employees_comprehensive',
      mode: validMode,
    });
  } catch (error) {
    console.error('Error fetching employees comprehensive:', error);
    sendError(ctx.res, 500, 'INTERNAL_ERROR', 'Failed to fetch employee comprehensive data');
  }
});

// ─── KPI Summary Endpoint ────────────────────────────────────────────────────

route('GET', '/api/employees-comprehensive/kpis', async (ctx: RequestContext) => {
  const machineCode = ctx.query.get('machineCode');
  const divisionCode = ctx.query.get('divisionCode');
  const startDateParam = ctx.query.get('startDate');
  const endDateParam = ctx.query.get('endDate');

  const { startDate, endDate } = getDefaultDateRange();
  const startDateFinal = startDateParam || startDate;
  const endDateFinal = endDateParam || endDate;

  try {
    const kpis = await getEmployeesComprehensiveKPIs(
      startDateFinal,
      endDateFinal,
      machineCode || null,
      divisionCode || null
    );
    sendEnvelope(ctx.res, 200, mapKpi(kpis as unknown as Record<string, unknown>), {
      source: 'employees_comprehensive_kpis',
      startDate: startDateFinal,
      endDate: endDateFinal,
    });
  } catch (error) {
    console.error('Error fetching employees comprehensive KPIs:', error);
    sendError(ctx.res, 500, 'INTERNAL_ERROR', 'Failed to fetch employee comprehensive KPIs');
  }
});

// ─── Employee Detail Endpoint ────────────────────────────────────────────────

route('GET', '/api/employees-comprehensive/:employeeCode/detail', async (ctx: RequestContext) => {
  const { employeeCode } = ctx.params;
  const startDateParam = ctx.query.get('startDate');
  const endDateParam = ctx.query.get('endDate');

  if (!employeeCode) {
    sendError(ctx.res, 400, 'MISSING_PARAMETER', 'employeeCode is required');
    return;
  }

  const { startDate, endDate } = getDefaultDateRange();
  const startDateFinal = startDateParam || startDate;
  const endDateFinal = endDateParam || endDate;

  try {
    const detail = await getEmployeeDetail(employeeCode, startDateFinal, endDateFinal);
    if (!detail) {
      sendError(ctx.res, 404, 'NOT_FOUND', `Employee with code '${employeeCode}' not found`);
      return;
    }
    sendEnvelope(ctx.res, 200, mapDetail(detail as unknown as Record<string, unknown>), {
      source: 'employees_comprehensive_detail',
      employeeCode,
    });
  } catch (error) {
    console.error('Error fetching employee detail:', error);
    sendError(ctx.res, 500, 'INTERNAL_ERROR', 'Failed to fetch employee detail');
  }
});

// ─── Employee Scan History Endpoint ─────────────────────────────────────────

route('GET', '/api/employees-comprehensive/:employeeCode/scans', async (ctx: RequestContext) => {
  const { employeeCode } = ctx.params;
  const startDateParam = ctx.query.get('startDate');
  const endDateParam = ctx.query.get('endDate');
  const page = ctx.query.get('page') ?? '1';
  const pageSize = ctx.query.get('pageSize') ?? '50';

  if (!employeeCode) {
    sendError(ctx.res, 400, 'MISSING_PARAMETER', 'employeeCode is required');
    return;
  }

  const machineCode = ctx.query.get('machineCode');
  const { startDate, endDate } = getDefaultDateRange();
  const startDateFinal = startDateParam || startDate;
  const endDateFinal = endDateParam || endDate;
  const pageNum = Math.max(parseInt(page) || 1, 1);
  const pageSizeNum = Math.min(Math.max(parseInt(pageSize) || 50, 1), 200);

  try {
    const result = await getEmployeeScans(employeeCode, startDateFinal, endDateFinal, pageNum, pageSizeNum, machineCode || null);
    // Map snake_case rows → camelCase ScanRecord (frontend EmployeeIdentityDrawer reads camelCase)
    const rows = result.rows.map((r) => ({
      id: r.scan_log_id,
      machineCode: r.machine_code,
      rawDeviceUserId: r.raw_device_user_id ?? '',
      rawUserSn: null,
      scanTime: r.scan_time,
      scanDate: r.scan_date,
      parsedEmployeeCode: r.parsed_employee_code,
      mappingStatus: r.mapping_status,
      eventType: r.event_type,
      verifyType: r.verify_type,
      zktecoUserName: r.zkteco_user_name,
      syncBatchId: null,
      createdAt: r.scan_time,
    }));
    sendEnvelope(ctx.res, 200, { rows, pagination: result.pagination }, {
      source: 'employees_comprehensive_scans',
      employeeCode,
      startDate: startDateFinal,
      endDate: endDateFinal,
    });
  } catch (error) {
    console.error('Error fetching employee scans:', error);
    sendError(ctx.res, 500, 'INTERNAL_ERROR', 'Failed to fetch employee scan history');
  }
});
