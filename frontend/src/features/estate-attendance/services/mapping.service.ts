import { api } from '../../../lib/api';
import type { MappingRecord } from '../types/mapping.types';

export async function fetchMappingQueue(params: {
  status?: string; // NEED_REVIEW | UNMAPPED | AMBIGUOUS
  machine?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: MappingRecord[]; total: number }> {
  // Wire to GET /api/employees-comprehensive with mappingStatus filter
  return api('/api/employees-comprehensive', {
    params: { mode: 'datamesin', mappingStatus: params.status, page: params.page, pageSize: params.pageSize }
  });
}

export async function fetchUnmappedSummary(): Promise<{ unmapped: MappingRecord[]; total: number }> {
  // Wire to GET /api/employees-comprehensive?mappingStatus=UNMAPPED
  const data = await api('/api/employees-comprehensive', {
    params: { mode: 'datamesin', mappingStatus: 'UNMAPPED', page: 1, pageSize: 100 }
  });
  return { unmapped: data?.data ?? [], total: data?.total ?? 0 };
}
