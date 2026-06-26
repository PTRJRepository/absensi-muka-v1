import { requestData } from './api-client';
import type {
  EmployeeComprehensiveFilters,
  EmployeeComprehensiveRow,
  EmployeeKPIs,
  EmployeeIdentity,
  ScanRecord,
  PaginatedResponse,
  ApiResponse,
} from '../types';

/**
 * Employee Comprehensive Explorer API Service
 * Provides endpoints for exploring employee data from both machine and database perspectives
 */
export const employeeComprehensiveApi = {
  /**
   * Get paginated list of employees with comprehensive data
   */
  async getEmployees(filters: EmployeeComprehensiveFilters) {
    const params = new URLSearchParams({
      mode: filters.mode,
      page: String(filters.page || 1),
      pageSize: String(filters.pageSize || 50),
    });

    if (filters.divisionCode) params.set('divisionCode', filters.divisionCode);
    if (filters.machineCode) params.set('machineCode', filters.machineCode);
    if (filters.search) params.set('search', filters.search);
    if (filters.mappingStatus) params.set('mappingStatus', filters.mappingStatus);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);

    const response = await requestData<ApiResponse<PaginatedResponse<EmployeeComprehensiveRow>>>(
      `/api/employees-comprehensive?${params.toString()}`
    );
    return response;
  },

  /**
   * Get KPI summary for employee comprehensive data
   */
  async getKPIs(filters: Partial<EmployeeComprehensiveFilters>) {
    const params = new URLSearchParams();

    if (filters.mode) params.set('mode', filters.mode);
    if (filters.divisionCode) params.set('divisionCode', filters.divisionCode);
    if (filters.machineCode) params.set('machineCode', filters.machineCode);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);

    const response = await requestData<ApiResponse<EmployeeKPIs>>(
      `/api/employees-comprehensive/kpis?${params.toString()}`
    );
    return response;
  },

  /**
   * Get detailed information for a specific employee
   */
  async getEmployeeDetail(employeeCode: string, machineCode?: string) {
    const params = new URLSearchParams();
    if (machineCode) params.set('machineCode', machineCode);

    const response = await requestData<ApiResponse<EmployeeIdentity>>(
      `/api/employees-comprehensive/${encodeURIComponent(employeeCode)}/detail?${params.toString()}`
    );
    return response;
  },

  /**
   * Get scan history for a specific employee
   */
  async getScans(employeeCode: string, machineCode?: string, page = 1, pageSize = 50) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    if (machineCode) params.set('machineCode', machineCode);

    const response = await requestData<ApiResponse<PaginatedResponse<ScanRecord>>>(
      `/api/employees-comprehensive/${encodeURIComponent(employeeCode)}/scans?${params.toString()}`
    );
    return response;
  },
};

// TanStack Query key factory for cache management
export const employeeComprehensiveKeys = {
  all: ['employees-comprehensive'] as const,
  lists: () => [...employeeComprehensiveKeys.all, 'list'] as const,
  list: (filters: EmployeeComprehensiveFilters) => [...employeeComprehensiveKeys.lists(), filters] as const,
  kpis: (filters: Partial<EmployeeComprehensiveFilters>) => [...employeeComprehensiveKeys.all, 'kpis', filters] as const,
  detail: (employeeCode: string, machineCode?: string) =>
    [...employeeComprehensiveKeys.all, 'detail', employeeCode, machineCode] as const,
  scans: (employeeCode: string, machineCode?: string) =>
    [...employeeComprehensiveKeys.all, 'scans', employeeCode, machineCode] as const,
};