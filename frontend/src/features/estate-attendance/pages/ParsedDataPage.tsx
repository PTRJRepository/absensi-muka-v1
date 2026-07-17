/**
 * Parsed data page — filterable attendance records from database.
 */

import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import '../../../design-system/rebinmas/estate-operations-grid.css';
import { fetchParsedRecords } from '../services/search.service';
import { useQuery } from '@tanstack/react-query';
import { LoadingState, EmptyState, ErrorState } from '../../../design-system/components';

const DIVISIONS = [
  { value: 'P1A', label: 'P1A' },
  { value: 'P1B', label: 'P1B' },
  { value: 'P2A', label: 'P2A' },
  { value: 'P2B', label: 'P2B' },
  { value: 'DME', label: 'DME' },
  { value: 'ARA', label: 'ARA' },
  { value: 'AB1', label: 'AB1' },
  { value: 'AB2', label: 'AB2' },
  { value: 'ARC', label: 'ARC' },
  { value: 'IJL', label: 'IJL' },
  { value: 'PGE', label: 'PGE' },
];

export function ParsedDataPage() {
  const [search, setSearch] = useState('');
  const [division, setDivision] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['parsed-records', search, division, page],
    queryFn: () => fetchParsedRecords({ search, division, page, pageSize }),
    placeholderData: (prev) => prev,
  });

  const records = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <AppShell>
      <div>
        <div className="rb-title-row">
          <div>
            <h1 className="rb-title">Data Parsed</h1>
            <p className="rb-subtitle">Data absensi hasil pemrosesan final</p>
          </div>
        </div>

        {/* Filters */}
        <div className="rb-filterbar" style={{ marginBottom: 16 }}>
          <input
            type="text"
            className="rb-search"
            placeholder="Cari..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <select
            className="rb-select"
            value={division}
            onChange={(e) => { setDivision(e.target.value); setPage(1); }}
          >
            <option value="">Semua Divisi</option>
            {DIVISIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {isLoading && <LoadingState />}
        {isError && <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />}
        {!isLoading && !isError && records.length === 0 && <EmptyState />}
        {!isLoading && !isError && records.length > 0 && (
          <>
            <div className="rb-panel" style={{ overflow: 'auto' }}>
              <table className="rb-matrix" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama</th>
                    <th>Divisi</th>
                    <th>Tanggal</th>
                    <th>Status</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td style={{ textAlign: 'left' }}>{r.currentEmpCode || r.employeeCode}</td>
                      <td style={{ textAlign: 'left' }}>{r.employeeName}</td>
                      <td>{r.divisionCode}</td>
                      <td>{r.attendanceDate}</td>
                      <td>{r.status}</td>
                      <td>{r.checkIn ?? '—'}</td>
                      <td>{r.checkOut ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ color: 'var(--rb-text-muted)', fontSize: 12 }}>
                {records.length} dari {total}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="rb-button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>←</button>
                <span style={{ color: 'var(--rb-text-muted)', fontSize: 12, lineHeight: '42px' }}>Halaman {page}</span>
                <button className="rb-button" onClick={() => setPage(p => p + 1)} disabled={records.length < pageSize}>→</button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
