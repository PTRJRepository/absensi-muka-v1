import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '../../layout/Header/Header';
import { Tile } from '../../common/Tile/Tile';
import { Badge } from '../../common/Badge/Badge';
import { DataTable } from '../../common/DataTable/DataTable';
import { api } from '../../../lib/api';
import { Clock, CheckCircle, XCircle, AlertTriangle, Loader2, Database, RefreshCw } from 'lucide-react';
import type { BatchHistory, BatchSummary } from '../../../types';

export function BatchHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [machineFilter, setMachineFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch batches
  const { data: batchesData, isLoading, refetch } = useQuery<{ batches: BatchHistory[]; pagination: { total: number } }>({
    queryKey: ['batches', statusFilter, machineFilter, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (machineFilter) params.set('machine', machineFilter);
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      return api<{ batches: BatchHistory[]; pagination: { total: number } }>(`/api/monitoring/batches?${params}`);
    },
    refetchInterval: 30000,
  });

  const batches = batchesData?.batches ?? [];
  const totalCount = batchesData?.pagination?.total ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Calculate summary
  const summary: BatchSummary = {
    total: batches.length,
    completed: batches.filter(b => b.status === 'COMPLETED').length,
    running: batches.filter(b => b.status === 'RUNNING').length,
    failed: batches.filter(b => b.status === 'FAILED').length,
    stuck: batches.filter(b => b.status === 'STUCK').length,
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle size={14} style={{ color: 'var(--success)' }} />;
      case 'FAILED':
        return <XCircle size={14} style={{ color: 'var(--error)' }} />;
      case 'RUNNING':
        return <Loader2 size={14} style={{ color: 'var(--info)', animation: 'spin 1s linear infinite' }} />;
      case 'STUCK':
        return <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />;
      default:
        return <Clock size={14} style={{ color: 'var(--text-secondary)' }} />;
    }
  };

  const getStatusVariant = (status: string): 'success' | 'error' | 'warning' | 'info' | 'neutral' => {
    switch (status) {
      case 'COMPLETED': return 'success';
      case 'FAILED': return 'error';
      case 'RUNNING': return 'info';
      case 'STUCK': return 'warning';
      default: return 'neutral';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'Selesai';
      case 'FAILED': return 'Gagal';
      case 'RUNNING': return 'Berjalan';
      case 'STUCK': return 'Stuck';
      case 'PARTIAL_SUCCESS': return 'Sebagian';
      default: return status;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return '...';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}d`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}d`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const machines = [...new Set(batches.map(b => b.machine_code))].filter(Boolean);

  return (
    <>
      <Header
        title="Riwayat Batch"
        subtitle="Riwayat sinkronisasi dan import data"
        onRefresh={() => refetch()}
        isRefreshing={isLoading}
      />

      <div className="app-content">
        {/* Summary Cards */}
        <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 24 }}>
          <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {totalCount}
            </div>
            <div className="stat-card-label">Total Batch</div>
          </div>
          <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--success)', lineHeight: 1 }}>
              {summary.completed}
            </div>
            <div className="stat-card-label">Selesai</div>
          </div>
          <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--info)', lineHeight: 1 }}>
              {summary.running}
            </div>
            <div className="stat-card-label">Berjalan</div>
          </div>
          <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--warning)', lineHeight: 1 }}>
              {summary.stuck}
            </div>
            <div className="stat-card-label">Stuck</div>
          </div>
          <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--error)', lineHeight: 1 }}>
              {summary.failed}
            </div>
            <div className="stat-card-label">Gagal</div>
          </div>
        </div>

        <Tile title="Daftar Batch" icon={<Database size={16} />}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">Semua Status</option>
              <option value="RUNNING">Berjalan</option>
              <option value="COMPLETED">Selesai</option>
              <option value="FAILED">Gagal</option>
              <option value="STUCK">Stuck</option>
            </select>

            <select
              value={machineFilter}
              onChange={(e) => { setMachineFilter(e.target.value); setPage(1); }}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">Semua Mesin</option>
              {machines.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="empty-state">
              <RefreshCw size={24} className="spin" />
              <p>Memuat riwayat batch...</p>
            </div>
          ) : batches.length > 0 ? (
            <>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Mesin</th>
                    <th>Status</th>
                    <th>Batch Code</th>
                    <th>Records</th>
                    <th>Sukses</th>
                    <th>Gagal</th>
                    <th>Mulai</th>
                    <th>Durasi</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td style={{ fontWeight: 600 }}>{batch.machine_code || '-'}</td>
                      <td>
                        <Badge variant={getStatusVariant(batch.status)}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {getStatusIcon(batch.status)}
                            {getStatusLabel(batch.status)}
                          </span>
                        </Badge>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {batch.batch_code.substring(0, 20)}...
                      </td>
                      <td>{batch.records_total}</td>
                      <td style={{ color: 'var(--success)' }}>
                        {batch.records_success}
                      </td>
                      <td style={{ color: batch.records_failed > 0 ? 'var(--error)' : 'inherit' }}>
                        {batch.records_failed}
                      </td>
                      <td style={{ fontSize: 12 }}>{formatDate(batch.started_at)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {formatDuration(batch.started_at, batch.finished_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Menampilkan {batches.length} dari {totalCount} batch
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer',
                      opacity: page <= 1 ? 0.5 : 1,
                    }}
                  >
                    Prev
                  </button>
                  <span style={{ padding: '6px 12px' }}>
                    Halaman {page} dari {totalPages || 1}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                      opacity: page >= totalPages ? 0.5 : 1,
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Database size={40} />
              <p>Tidak ada riwayat batch</p>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Sinkronkan mesin untuk melihat riwayat
              </span>
            </div>
          )}
        </Tile>
      </div>

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
