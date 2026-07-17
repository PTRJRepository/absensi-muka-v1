import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Activity, ArrowDown, ArrowUp } from 'lucide-react';
import { fetchMachineRawData } from '../services/machine.service';
import { Skeleton, EmptyState } from '../../../design-system/components';

const PAGE_SIZE = 50;

interface RawScanLogTableProps {
  machineCode: string;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function RawScanLogTable({ machineCode }: RawScanLogTableProps) {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['estate-machine-scans', machineCode, page, dateFrom, dateTo],
    queryFn: () =>
      fetchMachineRawData(machineCode, {
        page,
        pageSize: PAGE_SIZE,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  if (isError) {
    return (
      <div style={{ padding: 16 }}>
        <div className="rb-error" style={{ fontSize: 12 }}>Gagal memuat scan log.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'hidden' }}>
      {/* Date filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--rb-text-muted)' }}>Dari:</label>
          <input
            type="date"
            className="rb-select"
            style={{ fontSize: 11, padding: '2px 6px' }}
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--rb-text-muted)' }}>Sampai:</label>
          <input
            type="date"
            className="rb-select"
            style={{ fontSize: 11, padding: '2px 6px' }}
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--rb-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Activity size={12} />
          {data ? `${data.total} record` : 'Memuat…'}
        </span>
      </div>

      {/* Empty state */}
      {!isLoading && (!data || data.data.length === 0) && (
        <div style={{ padding: 16 }}>
          <EmptyState title="Tidak ada record" message="Tidak ada scan log untuk filter ini." />
        </div>
      )}

      {/* Table */}
      {!isLoading && data && data.data.length > 0 && (
        <div style={{ flex: 1, overflow: 'auto', borderRadius: 'var(--rb-radius-md)', border: '1px solid var(--rb-border-subtle)' }}>
          <table className="rb-matrix" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Raw ID</th>
                <th>Nama</th>
                <th>Arah</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'var(--rb-font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {formatTimestamp(log.scanTime)}
                  </td>
                  <td style={{ fontFamily: 'var(--rb-font-mono)', fontSize: 11 }}>{log.rawUserId}</td>
                  <td>{log.userName || '—'}</td>
                  <td>
                    <span
                      className={`rb-badge ${log.direction === 'IN' ? 'rb-badge--present' : 'rb-badge--manual'}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10 }}
                    >
                      {log.direction === 'IN' ? <ArrowDown size={9} /> : <ArrowUp size={9} />}
                      {log.direction}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`rb-badge ${
                        log.mappingStatus === 'MAPPED'
                          ? 'rb-badge--present'
                          : log.mappingStatus === 'NEED_REVIEW'
                            ? 'rb-badge--review'
                            : 'rb-badge--default'
                      }`}
                      style={{ fontSize: 10 }}
                    >
                      {log.mappingStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div style={{ flex: 1, overflow: 'auto', borderRadius: 'var(--rb-radius-md)', border: '1px solid var(--rb-border-subtle)', padding: 12 }}>
          <table className="rb-matrix" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Raw ID</th>
                <th>Nama</th>
                <th>Arah</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.min(PAGE_SIZE, 10) }).map((_, i) => (
                <tr key={i}>
                  <td><Skeleton height={14} /></td>
                  <td><Skeleton height={14} /></td>
                  <td><Skeleton height={14} /></td>
                  <td><Skeleton height={14} /></td>
                  <td><Skeleton height={14} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--rb-text-muted)' }}>
            Halaman {page} / {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="rb-button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft size={13} />
            </button>
            <button
              className="rb-button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
