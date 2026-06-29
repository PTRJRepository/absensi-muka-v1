import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * Live clock in WIB (Asia/Jakarta) regardless of server/browser timezone.
 * Shows current date + time, updates every second.
 * Use to surface the "now" baseline so sync gaps are visible at a glance.
 */
const WIB = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function LiveClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const label = WIB.format(now) + ' WIB';

  return (
    <span className={`live-clock ${compact ? 'compact' : ''}`} title="Waktu sekarang (WIB)">
      <Clock size={compact ? 12 : 14} />
      <span className="mono">{label}</span>
      <style>{`
        .live-clock {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: var(--font-size-sm, 13px);
          color: var(--text-secondary, #6b7280);
          font-weight: 500;
        }
        .live-clock.compact { font-size: 11px; }
        .live-clock .mono { font-variant-numeric: tabular-nums; }
      `}</style>
    </span>
  );
}
