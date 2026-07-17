/**
 * Individual status cell within the matrix.
 */
import { normalizeStatus, statusCode } from '../utils/status-mapping';
import type { AttendanceMatrixCell as MatrixCell } from '../../../types';

interface StatusCellProps {
  cell: MatrixCell;
  onClick?: (cell: MatrixCell) => void;
  isSunday?: boolean;
  isToday?: boolean;
  showTooltip?: boolean;
}

export function StatusCell({
  cell,
  onClick,
  isSunday = false,
  isToday = false,
  showTooltip = true,
}: StatusCellProps) {
  const { uiStatus, cls, label } = normalizeStatus(cell.status, cell.source);
  const code = statusCode(uiStatus);
  const title = showTooltip
    ? `${label} · ${cell.scanCount ?? 0} scan · In: ${cell.checkInAt ? new Date(cell.checkInAt).toLocaleTimeString('id-ID') : '—'} · Out: ${cell.checkOutAt ? new Date(cell.checkOutAt).toLocaleTimeString('id-ID') : '—'}`
    : undefined;

  return (
    <td
      className={isSunday ? 'rb-sunday-cell' : undefined}
      style={{
        padding: 2,
        textAlign: 'center',
        background: isSunday ? 'rgba(201,90,78,0.05)' : undefined,
      }}
    >
      {onClick ? (
        <button
          className={`rb-status-cell ${cls}`}
          style={{ width: 36, height: 36, cursor: 'pointer', border: 'none', padding: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            onClick(cell);
          }}
          title={title}
          aria-label={`${cell.date}: ${label}`}
        >
          {code}
        </button>
      ) : (
        <div
          className={`rb-status-cell ${cls}`}
          style={{ width: 36, height: 36, cursor: 'default' }}
          title={title}
        >
          {code}
        </div>
      )}
    </td>
  );
}
