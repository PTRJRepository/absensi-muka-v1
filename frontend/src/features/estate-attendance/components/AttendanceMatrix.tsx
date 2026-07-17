/**
 * Full attendance matrix table with loading, empty, and error states.
 */
import { useMatrixFilters } from '../hooks/useMatrixFilters';
import { useAttendanceMatrix } from '../hooks/useAttendanceMatrix';
import { MatrixHeader } from './MatrixHeader';
import { MatrixRowComponent } from './MatrixRow';
import { Skeleton, EmptyState, ErrorState } from '../../../design-system/components';
import type { AttendanceMatrixRow as MatrixRow, AttendanceMatrixCell as MatrixCell } from '../../../types';

interface AttendanceMatrixProps {
  onSelectRow: (row: MatrixRow) => void;
  onCellClick?: (row: MatrixRow, cell: MatrixCell) => void;
}

export function AttendanceMatrix({ onSelectRow, onCellClick }: AttendanceMatrixProps) {
  const { year, month } = useMatrixFilters();
  const { data, isLoading, isFetching, error, refetch } = useAttendanceMatrix();

  const today = new Date().toISOString().split('T')[0];
  const daysInMonth = new Date(year, month, 0).getDate();
  const rows = data?.rows ?? [];

  if (isLoading) {
    return (
      <div className="rb-matrix-panel">
        <div className="rb-panel__header">
          <span className="rb-panel__title">Memuat…</span>
        </div>
        <div className="rb-table-scroll" style={{ padding: 16 }}>
          <table className="rb-matrix">
            <MatrixHeader
              year={year}
              month={month}
              daysInMonth={daysInMonth}
              today={today}
            />
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="rb-sticky-1" style={{ textAlign: 'left' }}>
                    <Skeleton width={70} height={16} />
                  </td>
                  <td className="rb-sticky-2" style={{ textAlign: 'left' }}>
                    <Skeleton width={160} height={16} />
                  </td>
                  {Array.from({ length: Math.min(daysInMonth, 31) }, (_, j) => (
                    <td key={j} style={{ padding: 2 }}>
                      <Skeleton width={36} height={36} />
                    </td>
                  ))}
                  <td><Skeleton width={30} height={16} /></td>
                  <td><Skeleton width={30} height={16} /></td>
                  <td><Skeleton width={30} height={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rb-matrix-panel">
        <ErrorState
          title="Gagal memuat matriks"
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rb-matrix-panel">
        <EmptyState
          title="Tidak ada data"
          message="Tidak ada data untuk filter ini. Coba ubah filter atau reset pencarian."
        />
      </div>
    );
  }

  return (
    <div className="rb-matrix-panel">
      <div className="rb-panel__header">
        <span className="rb-panel__title">
          {rows.length} karyawan
          {data?.pagination.total != null && data.pagination.total > rows.length
            ? ` dari ${data.pagination.total}`
            : ''}
        </span>
        <span className="rb-panel__meta">
          {isFetching && 'Memperbarui…'}
          {data?.meta.source ? `· ${data.meta.source}` : ''}
        </span>
      </div>
      <div className="rb-table-scroll">
        <table className="rb-matrix">
          <MatrixHeader
            year={year}
            month={month}
            daysInMonth={daysInMonth}
            today={today}
          />
          <tbody>
            {rows.map((row) => (
              <MatrixRowComponent
                key={row.identityKey}
                row={row}
                year={year}
                month={month}
                mode={data?.meta.mode ?? 'database'}
                today={today}
                onSelectRow={onSelectRow}
                onCellClick={onCellClick}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
