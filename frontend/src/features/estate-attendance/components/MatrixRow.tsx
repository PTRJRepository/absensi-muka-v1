/**
 * Single row in the attendance matrix.
 */
import { StatusCell } from './StatusCell';
import { rowKey, cellKey } from '../utils/keys';
import { isSunday, safeText } from '../utils/display';
import { Badge } from '../../../design-system/components';
import type { AttendanceMatrixRow as MatrixRow, AttendanceMatrixCell as MatrixCell } from '../../../types';

interface MatrixRowProps {
  row: MatrixRow;
  year: number;
  month: number;
  mode: string;
  today: string;
  onSelectRow: (row: MatrixRow) => void;
  onCellClick?: (row: MatrixRow, cell: MatrixCell) => void;
}

function mappingBadgeVariant(
  status: string,
): 'success' | 'warning' | 'neutral' {
  switch (status) {
    case 'MAPPED': return 'success';
    case 'NEED_REVIEW': return 'warning';
    default: return 'neutral';
  }
}

export function MatrixRowComponent({
  row,
  year,
  month,
  mode,
  today,
  onSelectRow,
  onCellClick,
}: MatrixRowProps) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayParts = today.split('-');
  const todayDay = todayParts.length === 3 ? parseInt(todayParts[2], 10) : -1;
  const isCurrentMonth =
    parseInt(todayParts[0], 10) === year && parseInt(todayParts[1], 10) === month;

  const key = rowKey(row);

  // Build day cells for 1..daysInMonth
  const cellsByDate = new Map<string, MatrixCell>();
  for (const cell of row.days) {
    cellsByDate.set(cell.date, cell);
  }

  function handleCellClick(cell: MatrixCell) {
    onCellClick?.(row, cell);
  }

  return (
    <tr
      onClick={() => onSelectRow(row)}
      style={{ cursor: 'pointer' }}
      data-identity-key={key}
    >
      {/* Sticky: Kode */}
      <td className="rb-sticky-1" style={{ textAlign: 'left' }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>{safeText(row.employeeCode)}</span>
      </td>

      {/* Sticky: Nama Karyawan */}
      <td className="rb-sticky-2" style={{ textAlign: 'left' }}>
        <div className="rb-employee-name">{safeText(row.employeeName)}</div>
        <div className="rb-employee-meta">
          {safeText(row.divisionCode)}
          {row.machineCode ? ` · ${row.machineCode}` : ''}
          {' '}
          <Badge
            variant={mappingBadgeVariant(row.mappingStatus)}
            style={{ fontSize: 9, padding: '1px 5px' }}
          >
            {row.mappingStatus}
          </Badge>
        </div>
      </td>

      {/* Day cells */}
      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const cell = cellsByDate.get(dateStr);
        const isToday = isCurrentMonth && day === todayDay;
        const sun = isSunday(dateStr);
        if (!cell) {
          return (
            <td
              key={dateStr}
              style={{
                padding: 2,
                textAlign: 'center',
                background: sun ? 'rgba(201,90,78,0.04)' : undefined,
              }}
            >
              <div
                className="rb-status-cell rb-status-cell--no-data"
                style={{ width: 36, height: 36, opacity: 0.3 }}
              >
                —
              </div>
            </td>
          );
        }
        return (
          <StatusCell
            key={dateStr}
            cell={cell}
            onClick={onCellClick ? handleCellClick : undefined}
            isSunday={sun}
            isToday={isToday}
          />
        );
      })}

      {/* Summary: H */}
      <td style={{ fontWeight: 700, color: 'var(--rb-present)', fontSize: 12 }}>
        {row.summary.present}
      </td>
      {/* Summary: A */}
      <td style={{ fontWeight: 700, color: 'var(--rb-absent)', fontSize: 12 }}>
        {row.summary.absent}
      </td>
      {/* Summary: % */}
      <td style={{ fontWeight: 700, fontSize: 12 }}>
        {row.summary.attendanceRate}%
      </td>
    </tr>
  );
}
