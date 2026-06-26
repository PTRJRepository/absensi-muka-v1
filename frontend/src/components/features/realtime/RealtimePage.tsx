import { Header } from '../../layout/Header/Header';
import { api } from '../../../lib/api';
import { Loader, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { LiveFeed } from './components/LiveFeed';
import { Tile } from '../../common/Tile/Tile';
import type { AttendanceDaily } from '../../../types';

// Transform attendance_status from API to status field
function transformAttendanceData(rawData: any[]): AttendanceDaily[] {
  return rawData.map(r => ({
    ...r,
    status: r.attendance_status ?? r.status,
  }));
}

interface RealtimeFeedProps {
  date: string;
}

function RealtimeFeed({ date }: RealtimeFeedProps) {
  const { data, isLoading } = useQuery<AttendanceDaily[]>({
    queryKey: ['realtime-attendance', date],
    queryFn: async () => {
      const rawData = await api<any[]>(`/api/attendance/daily?date=${date}`);
      return transformAttendanceData(rawData);
    },
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32, color: 'var(--text-secondary)' }}>
        <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Memuat data real-time...</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 14 }}>
        Belum ada data absensi masuk hari ini
      </div>
    );
  }

  const latest = [...data].sort((a, b) => {
    const timeA = a.check_in ? new Date(a.check_in).getTime() : 0;
    const timeB = b.check_in ? new Date(b.check_in).getTime() : 0;
    return timeB - timeA;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 8px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Total: {data.length} scan</span>
        <span style={{ animation: 'pulse 2s infinite' }}>● LIVE</span>
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {latest.map((record, idx) => (
          <div key={`${record.employee_code}-${idx}`} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            borderBottom: '1px solid var(--gray-100)',
            fontSize: 13,
            transition: 'background 0.15s',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--success)',
              flexShrink: 0,
              boxShadow: '0 0 4px var(--success)',
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', minWidth: 72 }}>
              {record.employee_code}
            </span>
            <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {record.employee_name || '—'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {record.check_in
                ? new Date(record.check_in).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : '—'}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              background: record.check_out ? 'var(--success-light)' : 'var(--info-light)',
              color: record.check_out ? 'var(--success)' : 'var(--info)',
            }}>
              {record.check_out ? 'OUT' : 'IN'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RealtimePage() {
  const date = new Date().toISOString().split('T')[0];

  return (
    <>
      <Header title="Absensi Real-Time" subtitle={`Live feed — ${date}`} />
      <div className="app-content">
        {/* Live Feed with SSE */}
        <Tile
          title="Scan Langsung"
          icon={<Activity size={16} />}
          subtitle="Data real-time dari mesin absensi"
        >
          <LiveFeed maxItems={50} />
        </Tile>

        {/* Daily Attendance Table */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
          marginTop: 16,
        }}>
          <RealtimeFeed date={date} />
        </div>
      </div>
    </>
  );
}
