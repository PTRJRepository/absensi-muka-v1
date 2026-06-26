import { useQuery } from '@tanstack/react-query';
import { Header } from '../../layout/Header/Header';
import { Tile } from '../../common/Tile/Tile';
import { Badge } from '../../common/Badge/Badge';
import { api } from '../../../lib/api';
import { Settings, Bell, Clock, Database, Shield } from 'lucide-react';

export function SettingsPage() {
  const { data: scheduler } = useQuery<{
    enabled: boolean;
    interval_minutes: number;
    running_jobs: string[];
    next_scheduled_run: string | null;
    status: string;
  }>({
    queryKey: ['scheduler-status'],
    queryFn: () => api('/api/scheduler/status'),
  });

  const { data: divisions } = useQuery<{
    id: number;
    division_code: string;
    division_name: string;
    location: string;
    is_active: boolean;
  }[]>({
    queryKey: ['divisions'],
    queryFn: () => api('/api/divisions'),
  });

  return (
    <>
      <Header title="Pengaturan" subtitle="Konfigurasi sistem absensi" />

      <div className="app-content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Tile title="Scheduler Sinkronisasi" icon={<Clock size={16} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Status Scheduler</span>
                <Badge variant={scheduler?.enabled ? 'success' : 'neutral'}>
                  {scheduler?.enabled ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Interval</span>
                <span style={{ fontWeight: 600 }}>{scheduler?.interval_minutes ?? '—'} menit</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Job Aktif</span>
                <span style={{ fontWeight: 600 }}>{scheduler?.running_jobs?.length ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Jadwal Berikutnya</span>
                <span style={{ fontSize: 12 }}>
                  {scheduler?.next_scheduled_run
                    ? new Date(scheduler.next_scheduled_run).toLocaleString('id-ID')
                    : '—'}
                </span>
              </div>
            </div>
          </Tile>

          <Tile title="Informasi Sistem" icon={<Database size={16} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>API Backend</span>
                <span style={{ fontWeight: 600 }}>localhost:8004</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Divisi</span>
                <span style={{ fontWeight: 600 }}>{divisions?.length ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Versi</span>
                <Badge variant="info">v1.0.0</Badge>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Status</span>
                <Badge variant="success">Berjalan</Badge>
              </div>
            </div>
          </Tile>
        </div>

        <Tile title="Daftar Divisi" icon={<Settings size={16} />} style={{ marginTop: 16 }}>
          {divisions && divisions.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Divisi</th>
                  <th>Lokasi</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{d.division_code}</td>
                    <td style={{ fontWeight: 600 }}>{d.division_name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{d.location}</td>
                    <td>
                      <Badge variant={d.is_active ? 'success' : 'neutral'}>
                        {d.is_active ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <p>Tidak ada data divisi</p>
            </div>
          )}
        </Tile>
      </div>
    </>
  );
}
