/**
 * Search service for employee lookup and parsed attendance data.
 */

import { api } from '../../../lib/api';
import type { ParsedRecord, SearchResult } from '../types/parsed.types';

export async function fetchParsedRecords(params: {
  search?: string;
  division?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  page: number;
  pageSize: number;
}): Promise<{ data: ParsedRecord[]; total: number }> {
  return api<{ data: ParsedRecord[]; total: number }>('/api/employees-comprehensive', {
    params: { mode: 'database', ...params },
  });
}

export async function searchEmployees(
  params: {
    search: string;
    division?: string;
    page?: number;
    pageSize?: number;
  },
  signal?: AbortSignal
): Promise<{ data: SearchResult[]; total: number }> {
  return api<{ data: SearchResult[]; total: number }>(
    '/api/employees-comprehensive',
    { params: { mode: 'database', ...params }, signal }
  );
}

export async function fetchEmployeeDetail(employeeCode: string, signal?: AbortSignal): Promise<unknown> {
  return api(
    `/api/employees-comprehensive/${encodeURIComponent(employeeCode)}/detail`,
    { signal }
  );
}

export async function fetchEmployeeScans(employeeCode: string, signal?: AbortSignal): Promise<unknown> {
  return api(
    `/api/employees-comprehensive/${encodeURIComponent(employeeCode)}/scans`,
    { signal }
  );
}
