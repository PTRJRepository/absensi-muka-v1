/**
 * React Query hook for fetching the attendance matrix.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchAttendanceMatrix } from '../services/attendance.service';
import { useMatrixFilters } from './useMatrixFilters';

export function useAttendanceMatrix() {
  const {
    mode,
    year,
    month,
    divisionCode,
    machineCode,
    status,
    debouncedSearch,
    page,
    pageSize,
  } = useMatrixFilters();

  const query = useQuery({
    queryKey: [
      'attendance-matrix',
      mode,
      year,
      month,
      divisionCode,
      machineCode,
      status,
      debouncedSearch,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchAttendanceMatrix({
        mode,
        year,
        month,
        divisionCode,
        machineCode,
        status,
        search: debouncedSearch,
        page,
        pageSize,
      }),
    staleTime: 30_000,
  });

  return query;
}
