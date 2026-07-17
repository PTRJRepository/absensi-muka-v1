/**
 * Matrix header: sticky thead with Kode, Nama Karyawan, days 1-31, H, A, %.
 */
import { weekdayShort, isSunday } from '../utils/display';

interface MatrixHeaderProps {
  year: number;
  month: number;
  daysInMonth: number;
  today: string; // ISO date string YYYY-MM-DD
}

const WEEKDAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function padDay(n: number) {
  return String(n).padStart(2, '0');
}

export function MatrixHeader({ year, month, daysInMonth, today }: MatrixHeaderProps) {
  const headerDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const todayParts = today.split('-');
  const todayDay = todayParts.length === 3 ? parseInt(todayParts[2], 10) : -1;
  const isCurrentMonth =
    parseInt(todayParts[0], 10) === year && parseInt(todayParts[1], 10) === month;

  return (
    <thead>
      <tr>
        {/* Sticky: Kode */}
        <th className="rb-sticky-1" style={{ zIndex: 6, textAlign: 'left', minWidth: 90 }}>
          Kode
        </th>
        {/* Sticky: Nama Karyawan */}
        <th className="rb-sticky-2" style={{ zIndex: 6, textAlign: 'left', minWidth: 210 }}>
          Nama Karyawan
        </th>
        {/* Day columns */}
        {headerDays.map((day) => {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${padDay(day)}`;
          const weekday = WEEKDAY_SHORT[new Date(dateStr + 'T00:00:00').getDay()];
          const isToday = isCurrentMonth && day === todayDay;
          const sun = isSunday(dateStr);
          return (
            <th
              key={day}
              style={{
                minWidth: 40,
                background: isToday
                  ? 'rgba(199,163,76,0.18)'
                  : sun
                  ? 'rgba(201,90,78,0.08)'
                  : undefined,
                outline: isToday ? '1px solid rgba(199,163,76,0.6)' : undefined,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700 }}>{day}</span>
              <span
                style={{
                  display: 'block',
                  fontSize: 9,
                  fontWeight: 400,
                  color: sun ? 'rgba(201,90,78,0.8)' : 'var(--rb-text-muted)',
                }}
              >
                {weekday}
              </span>
            </th>
          );
        })}
        {/* Summary: H */}
        <th style={{ minWidth: 40, color: 'var(--rb-present)' }}>H</th>
        {/* Summary: A */}
        <th style={{ minWidth: 40, color: 'var(--rb-absent)' }}>A</th>
        {/* Summary: % */}
        <th style={{ minWidth: 48 }}>%</th>
      </tr>
    </thead>
  );
}
