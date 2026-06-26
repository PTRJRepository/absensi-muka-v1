import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  GitCompare,
  Database,
  Shield,
  Clock,
  ChevronRight,
  XCircle,
} from 'lucide-react';
import { Header } from '../../layout/Header/Header';
import { Badge } from '../../common/Badge/Badge';
import {
  getCurrentEmpCodeSummary,
  getCurrentEmpCodeChanges,
  getCurrentEmpCodeAmbiguous,
  getCurrentEmpCodeSnapshotStatus,
} from '../../../services/quality-service';

function formatTime(value: unknown) {
  if (!value) return '-';
  return new Date(String(value)).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function numberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function calcPercent(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function StatusBar({ value, total, color }: { value: number; total: number; color: string }) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="current-empcode-bar">
      <div
        className="current-empcode-bar-fill"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function CurrentEmpCodeDashboard() {
  const [changesPage, setChangesPage] = useState(0);
  const changesPageSize = 15;

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['current-empcode-summary'],
    queryFn: getCurrentEmpCodeSummary,
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  const { data: changes, isLoading: changesLoading, refetch: refetchChanges } = useQuery({
    queryKey: ['current-empcode-changes', changesPage],
    queryFn: () => getCurrentEmpCodeChanges(changesPageSize, changesPage * changesPageSize),
  });

  const { data: ambiguous, isLoading: ambiguousLoading, refetch: refetchAmbiguous } = useQuery({
    queryKey: ['current-empcode-ambiguous'],
    queryFn: getCurrentEmpCodeAmbiguous,
  });

  const { data: snapshot, isLoading: snapshotLoading, refetch: refetchSnapshot } = useQuery({
    queryKey: ['current-empcode-snapshot-status'],
    queryFn: () => getCurrentEmpCodeSnapshotStatus(24),
    refetchInterval: 5 * 60 * 1000,
  });

  const isLoading = summaryLoading || changesLoading || ambiguousLoading || snapshotLoading;

  const refreshAll = () => {
    refetchSummary();
    refetchChanges();
    refetchAmbiguous();
    refetchSnapshot();
  };

  // Calculate status breakdown
  const statusBreakdown = useMemo(() => {
    if (!summary?.registryQuality) return [];
    const rq = summary.registryQuality;
    const total = rq.totalRegistry || 1;

    return [
      { label: 'MAPPED_CURRENT', value: rq.mappedCurrent, color: 'var(--success)', icon: CheckCircle },
      { label: 'PARSED_ONLY', value: rq.parsedOnly, color: 'var(--info)', icon: GitCompare },
      { label: 'NIK_DUPLICATE_AMBIGUOUS', value: rq.ambiguousNik, color: 'var(--warning)', icon: AlertTriangle },
      { label: 'PARSED_CODE_NOT_FOUND', value: rq.parsedCodeNotFound, color: 'var(--error)', icon: XCircle },
      { label: 'NEED_REVIEW_CURRENT', value: rq.needReview, color: 'var(--gray-400)', icon: Clock },
    ].filter(item => item.value > 0);
  }, [summary]);

  const totalChangesPages = changes ? Math.ceil(changes.total / changesPageSize) : 0;

  return (
    <>
      <Header
        title="Mapping Quality"
        subtitle="currentEmpCode resolution status dan quality metrics"
        onRefresh={refreshAll}
        isRefreshing={isLoading}
      />

      <div className="app-content">
        {/* ── Summary Cards ─────────────────────────────────────────── */}
        <section className="current-empcode-summary-grid">
          <div className="current-empcode-summary-card primary">
            <Database size={20} />
            <div className="current-empcode-summary-content">
              <strong>{numberValue(summary?.registryQuality?.totalRegistry ?? 0).toLocaleString('id-ID')}</strong>
              <span>Total Registry</span>
            </div>
          </div>
          <div className="current-empcode-summary-card success">
            <CheckCircle size={20} />
            <div className="current-empcode-summary-content">
              <strong>{numberValue(summary?.registryQuality?.mappedCurrent ?? 0).toLocaleString('id-ID')}</strong>
              <span>Mapped Current</span>
            </div>
          </div>
          <div className="current-empcode-summary-card warning">
            <GitCompare size={20} />
            <div className="current-empcode-summary-content">
              <strong>{numberValue(summary?.parsedCodeChanges?.total ?? 0).toLocaleString('id-ID')}</strong>
              <span>Code Changes</span>
            </div>
          </div>
          <div className="current-empcode-summary-card danger">
            <AlertTriangle size={20} />
            <div className="current-empcode-summary-content">
              <strong>{numberValue(ambiguous?.total ?? 0)}</strong>
              <span>Ambiguous NIKs</span>
            </div>
          </div>
        </section>

        <div className="current-empcode-main-grid">
          {/* ── Resolution Status Breakdown ──────────────────────────── */}
          <div className="current-empcode-panel">
            <div className="current-empcode-panel-header">
              <Shield size={18} />
              <h3>Resolution Status</h3>
            </div>
            <div className="current-empcode-panel-body">
              {statusBreakdown.length > 0 ? (
                <div className="current-empcode-status-list">
                  {statusBreakdown.map((item) => {
                    const Icon = item.icon;
                    const total = summary?.registryQuality?.totalRegistry || 1;
                    const percent = calcPercent(item.value, total);
                    return (
                      <div key={item.label} className="current-empcode-status-item">
                        <div className="current-empcode-status-header">
                          <div className="current-empcode-status-label">
                            <Icon size={14} style={{ color: item.color }} />
                            <span>{item.label.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="current-empcode-status-value">
                            <strong style={{ color: item.color }}>{item.value.toLocaleString('id-ID')}</strong>
                            <span className="current-empcode-status-percent">({percent})</span>
                          </div>
                        </div>
                        <StatusBar value={item.value} total={total} color={item.color} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="current-empcode-empty">
                  <p>No registry data available</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Snapshot Health ──────────────────────────────────────── */}
          <div className="current-empcode-panel">
            <div className="current-empcode-panel-header">
              <Clock size={18} />
              <h3>Snapshot Health</h3>
            </div>
            <div className="current-empcode-panel-body">
              <div className="current-empcode-snapshot-stats">
                <div className="current-empcode-snapshot-stat">
                  <span>Last Sync</span>
                  <strong>{formatTime(snapshot?.lastSyncAt)}</strong>
                  {snapshot?.hoursSinceSync !== null && (
                    <Badge variant={snapshot.isStale ? 'error' : 'success'}>
                      {snapshot.isStale ? 'Stale' : 'Fresh'} ({snapshot.hoursSinceSync}h)
                    </Badge>
                  )}
                </div>
                <div className="current-empcode-snapshot-stat">
                  <span>Total Snapshots</span>
                  <strong>{numberValue(snapshot?.snapshotCount ?? 0).toLocaleString('id-ID')}</strong>
                </div>
                <div className="current-empcode-snapshot-stat">
                  <span>Ambiguous</span>
                  <strong className="text-warning">{numberValue(snapshot?.ambiguousCount ?? 0)}</strong>
                </div>
                <div className="current-empcode-snapshot-stat">
                  <span>Stale (&gt;24h)</span>
                  <strong className={snapshot?.isStale ? 'text-error' : 'text-success'}>
                    {snapshot?.isStale ? '1' : '0'}
                  </strong>
                </div>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={refreshAll}
                disabled={isLoading}
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                Sync Now
              </button>
            </div>
          </div>
        </div>

        {/* ── Ambiguous NIK Alert ───────────────────────────────────── */}
        {numberValue(ambiguous?.total ?? 0) > 0 && (
          <section className="current-empcode-panel current-empcode-alert-panel">
            <div className="current-empcode-panel-header danger">
              <AlertTriangle size={18} />
              <h3>Attention Required: {ambiguous?.total} Ambiguous NIKs</h3>
            </div>
            <div className="current-empcode-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>NIK</th>
                    <th>Current Code</th>
                    <th>Active Rows</th>
                    <th>Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ambiguous?.data?.slice(0, 10).map((item, idx) => (
                    <tr key={`${item.nik}-${idx}`}>
                      <td className="mono">{item.nik}</td>
                      <td className="mono">{item.currentEmpCode}</td>
                      <td>
                        <Badge variant="warning">{item.activeCount}</Badge>
                      </td>
                      <td className="text-muted">{item.ambiguityReason}</td>
                      <td>
                        <button className="btn btn-outline btn-sm">
                          Review <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── ParsedCode Changes Table ──────────────────────────────── */}
        <section className="current-empcode-panel">
          <div className="current-empcode-panel-header">
            <GitCompare size={18} />
            <h3>Code Changes (parsedCode to currentEmpCode)</h3>
          </div>
          <div className="current-empcode-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>parsedCode</th>
                  <th>currentEmpCode</th>
                  <th>Employee Name</th>
                  <th>HR Status</th>
                  <th>Resolution Status</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {changes?.data?.map((item, idx) => (
                  <tr key={`${item.rawDeviceUserId}-${idx}`}>
                    <td className="mono text-muted">{item.parsedCode || '-'}</td>
                    <td className="mono font-bold">{item.currentEmpCode || '-'}</td>
                    <td>{item.currentEmpName || '-'}</td>
                    <td>
                      <Badge variant={item.currentHrStatus === 'AKTIF' ? 'success' : 'warning'}>
                        {item.currentHrStatus || '-'}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={
                        item.resolutionStatus === 'MAPPED_CURRENT' ? 'success' :
                        item.resolutionStatus === 'NEED_REVIEW_CURRENT' ? 'warning' : 'neutral'
                      }>
                        {item.resolutionStatus?.replace(/_/g, ' ') || '-'}
                      </Badge>
                    </td>
                    <td className="mono">-</td>
                  </tr>
                ))}
                {(!changes?.data || changes.data.length === 0) && (
                  <tr>
                    <td colSpan={6} className="current-empcode-empty-cell">
                      No code changes found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalChangesPages > 1 && (
            <div className="current-empcode-pagination">
              <span>
                Showing {changesPage * changesPageSize + 1} - {Math.min((changesPage + 1) * changesPageSize, changes?.total ?? 0)} of {changes?.total ?? 0}
              </span>
              <div className="current-empcode-pagination-controls">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setChangesPage(p => Math.max(0, p - 1))}
                  disabled={changesPage === 0}
                >
                  Previous
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setChangesPage(p => Math.min(totalChangesPages - 1, p + 1))}
                  disabled={changesPage >= totalChangesPages - 1}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
