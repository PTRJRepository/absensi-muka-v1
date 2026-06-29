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
    sendEnvelope(ctx.res, 200, result, {
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
    sendEnvelope(ctx.res, 200, kpis, {
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
    sendEnvelope(ctx.res, 200, detail, {
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
