/**
 * Attendance matrix API service.
 * Wraps the existing codebase services for the estate attendance feature.
 */
import { getMonthlyMatrix, getAttendanceCellDetail } from '../../../services/attendance-service';
import type {
  AttendanceMatrixRow as ServiceMatrixRow,
  AttendanceMatrixCell as ServiceMatrixCell,
} from '../../../types';

export interface MatrixQueryParams {
  mode: string;
  year: number;
  month: number;
  division?: string;
  machine?: string;
  status?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface CellDetailParams {
  mode: string;
  identityKey: string;
  date: string;
  employeeCode?: string;
  rawDeviceUserId?: string;
  machineCode?: string;
}

/**
 * Fetch the monthly attendance matrix from the API.
 */
export async function fetchAttendanceMatrix(
  params: MatrixQueryParams,
): Promise<{
  rows: ServiceMatrixRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  meta: { generatedAt: string; source: string; mode: string };
}> {
  return getMonthlyMatrix({
    year: params.year,
    month: params.month,
    divisionCode: params.division,
    machineCode: params.machine,
    search: params.search,
    status: params.status as any,
    mode: params.mode as 'database' | 'datamesin',
    page: params.page,
    pageSize: params.pageSize,
  });
}

/**
 * Fetch cell detail (raw logs, scan trace) for a specific cell.
 */
export async function fetchCellDetail(
  params: CellDetailParams,
): Promise<{
  date: string;
  final_status: string;
  source: string;
  check_in_at: string | null;
  check_out_at: string | null;
  raw_logs: Array<Record<string, unknown>>;
  quality_flags: string[];
  provenance?: string | null;
}> {
  return getAttendanceCellDetail({
    employeeCode: params.employeeCode,
    rawDeviceUserId: params.rawDeviceUserId,
    machineCode: params.machineCode,
    date: params.date,
  });
}
