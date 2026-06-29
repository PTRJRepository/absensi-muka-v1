import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle, Loader2, RefreshCw, Wifi } from 'lucide-react';
import { api } from '../../../lib/api';
import { LiveClock } from '../../common/LiveClock/LiveClock';

interface SyncMachineProgress {
  machine_code: string;
  location_name: string;
  access_status: string;
  last_sync_at: string | null;
  sync_age_min: number | null;
  stale: boolean;
  latest_scan: string | null;
  scan_age_min: number | null;
  syncing_now: boolean;
  running_batch: string | null;
  running_age_sec: number | null;
}

interface SyncProgressResponse {
  generated_at: string;
  stale_threshold_minutes: number;
  summary: { total: number; fresh: number; stale: number; syncing_now: number };
  machines: SyncMachineProgress[];
}

function fmtAge(min: number | null): string {
  if (min === null) return 'never';
  if (min < 1) return 'now';
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${Math.round(min % 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function SyncProgressPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery<SyncProgressResponse>({
    queryKey: ['sync-progress'],
    queryFn: () => api<SyncProgressResponse>('/api/scheduler/sync-progress'),
    refetchInterval: 15000,
  });

  const machines = data?.machines ?? [];
  const summary = data?.summary;

  return (
    <section className="sync-progress-panel">
      <div className="sync-progress-header">
        <div className="sync-progress-title">
          <Activity size={20} />
          <div>
            <h2>Progress Sinkronisasi</h2>
            <p className="sync-progress-sub">
              {summary ? `${summary.fresh}/${summary.total} fresh · ${summary.stale} stale · ${summary.syncing_now} syncing` : 'memuat…'} · threshold {data?.stale_threshold_minutes ?? 60}m
            </p>
          </div>
        </div>
        <div className="sync-progress-actions">
          <LiveClock compact />
          <button className="btn-organic btn-organic-secondary btn-organic-icon" onClick={() => refetch()} disabled={isFetching} title="Refresh">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="sync-progress-loading"><Loader2 size={20} className="animate-spin" /> Memuat status sync…</div>
      ) : (
        <div className="sync-progress-table-wrap">
          <table className="sync-progress-table">
            <thead>
              <tr>
                <th>Mesin</th>
                <th>Akses</th>
                <th>Last Sync</th>
                <th>Age</th>
                <th>Scan Terbaru</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => {
                const syncing = m.syncing_now;
                const fresh = !m.stale;
                return (
                  <tr key={m.machine_code} className={syncing ? 'syncing' : fresh ? 'fresh' : 'stale'}>
                    <td className="mono"><strong>{m.machine_code}</strong><div className="muted">{m.location_name}</div></td>
                    <td>
                      <span className={`access-chip ${(m.access_status || '').toLowerCase()}`}>
                        <Wifi size={11} /> {m.access_status?.replace(/_/g, ' ') ?? '-'}
                      </span>
                    </td>
                    <td className="mono small">{m.last_sync_at ? new Date(m.last_sync_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'belum pernah'}</td>
                    <td className="mono">{fmtAge(m.sync_age_min)}</td>
                    <td className="mono small">{m.latest_scan ? new Date(m.latest_scan).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td>
                      {syncing ? (
                        <span className="status-pill syncing"><Loader2 size={11} className="animate-spin" /> Syncing {m.running_age_sec != null ? `${Math.round(m.running_age_sec)}s` : ''}</span>
                      ) : fresh ? (
                        <span className="status-pill fresh"><CheckCircle size={11} /> Fresh</span>
                      ) : (
                        <span className="status-pill stale"><AlertTriangle size={11} /> Stale</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .sync-progress-panel {
          background: var(--surface-card, #fff);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: var(--radius-lg, 12px);
          padding: 16px;
          margin-bottom: 16px;
        }
        .sync-progress-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
        .sync-progress-title { display: flex; align-items: center; gap: 10px; }
        .sync-progress-title h2 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-primary); }
        .sync-progress-sub { margin: 2px 0 0; font-size: 12px; color: var(--text-secondary); }
        .sync-progress-actions { display: flex; align-items: center; gap: 10px; }
        .sync-progress-loading { display: flex; align-items: center; gap: 8px; padding: 24px; color: var(--text-secondary); justify-content: center; }
        .sync-progress-table-wrap { overflow-x: auto; }
        .sync-progress-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .sync-progress-table th { text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); }
        .sync-progress-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); vertical-align: top; }
        .sync-progress-table tr.syncing td { background: rgba(59,130,246,0.06); }
        .sync-progress-table tr.stale td { background: rgba(239,68,68,0.04); }
        .mono { font-family: var(--font-mono, monospace); }
        .small { font-size: 12px; }
        .muted { font-size: 11px; color: var(--text-tertiary, #9ca3af); }
        .access-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--surface-muted, #f3f4f6); color: var(--text-secondary); }
        .access-chip.accessible { background: #d1fae5; color: #065f46; }
        .access-chip.port_forwarding_needed, .access-chip.network_unreachable { background: #fee2e2; color: #991b1b; }
        .status-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
        .status-pill.fresh { background: #d1fae5; color: #065f46; }
        .status-pill.stale { background: #fee2e2; color: #991b1b; }
        .status-pill.syncing { background: #dbeafe; color: #1e40af; }
      `}</style>
    </section>
  );
}
