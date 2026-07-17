/**
 * Cell detail drawer — slides in from the right.
 * Lazy-fetches raw logs when opened.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCellDetail } from '../services/attendance.service';
import { normalizeStatus } from '../utils/status-mapping';
import type { AttendanceMatrixRow as MatrixRow, AttendanceMatrixCell as MatrixCell } from '../../../types';

interface CellDetailDrawerProps {
  row: MatrixRow | null;
  cell: MatrixCell | null;
  mode: string;
  onClose: () => void;
}

function formatTime(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function CellDetailDrawer({ row, cell, mode, onClose }: CellDetailDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (cell) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [cell]);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['cell-detail', mode, row?.identityKey, cell?.date],
    queryFn: () =>
      fetchCellDetail({
        mode,
        identityKey: row?.identityKey ?? '',
        date: cell!.date,
        employeeCode: row?.employeeCode,
        rawDeviceUserId: row?.rawDeviceUserId,
        machineCode: row?.machineCode,
      }),
    enabled: isOpen && !!cell && !!row,
    staleTime: 15_000,
  });

  if (!isOpen || !cell || !row) return null;

  const { uiStatus, label } = normalizeStatus(cell.status, cell.source);

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 40,
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className="rb-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 360,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
        role="dialog"
        aria-label={`Detail sel ${cell.date}`}
      >
        {/* Header */}
        <div
          className="rb-panel__header"
          style={{ borderBottom: '1px solid var(--rb-border-subtle)' }}
        >
          <div>
            <div className="rb-panel__title" style={{ fontSize: 14 }}>
              {row.employeeName}
            </div>
            <div className="rb-panel__meta" style={{ fontFamily: 'var(--rb-font-mono)' }}>
              {row.employeeCode} · {cell.date}
            </div>
          </div>
          <button
            className="rb-button"
            onClick={onClose}
            aria-label="Tutup"
            style={{ minHeight: 36, minWidth: 36, padding: 0, display: 'grid', placeItems: 'center' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'grid', gap: 14, alignContent: 'start' }}>
          {/* Status */}
          <div className="rb-panel" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--rb-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Status
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                className={`rb-status-cell ${uiStatus === 'HADIR' ? 'rb-status-cell--present' : uiStatus === 'TIDAK_HADIR' ? 'rb-status-cell--absent' : 'rb-status-cell--no-data'}`}
                style={{ width: 44, height: 44, fontSize: 16 }}
              >
                {label[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'var(--rb-text-muted)' }}>
                  {detail?.source ?? cell.source} · {cell.scanCount ?? 0} scan
                </div>
              </div>
            </div>
          </div>

          {/* Check-in / Check-out */}
          <div className="rb-panel" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--rb-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Check-in / Check-out
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <dt style={{ fontSize: 10, color: 'var(--rb-text-muted)' }}>In</dt>
                <dd style={{ fontWeight: 600, fontFamily: 'var(--rb-font-mono)' }}>{formatTime(cell.checkInAt)}</dd>
              </div>
              <div>
                <dt style={{ fontSize: 10, color: 'var(--rb-text-muted)' }}>Out</dt>
                <dd style={{ fontWeight: 600, fontFamily: 'var(--rb-font-mono)' }}>{formatTime(cell.checkOutAt)}</dd>
              </div>
            </dl>
          </div>

          {/* Raw logs */}
          <div className="rb-panel" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--rb-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Raw Logs ({detail?.raw_logs?.length ?? 0})
            </div>
            {isLoading ? (
              <div style={{ color: 'var(--rb-text-muted)', fontSize: 12 }}>Memuat…</div>
            ) : detail?.raw_logs && detail.raw_logs.length > 0 ? (
              <div className="rb-log">
                {detail.raw_logs.slice(0, 8).map((log, i) => (
                  <div key={i} className="rb-log__item">
                    <div className="rb-log__dot" />
                    <div>
                      <div className="rb-log__title" style={{ fontFamily: 'var(--rb-font-mono)' }}>
                        {formatTime(String(log.scan_time ?? ''))}
                      </div>
                      <div className="rb-log__meta">
                        {String(log.machine_code ?? '-')} · {String(log.raw_device_user_id ?? '-')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--rb-text-muted)', fontSize: 12 }}>Tidak ada raw log.</div>
            )}
          </div>

          {/* Provenance */}
          {detail?.provenance && (
            <div className="rb-panel" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--rb-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Provenance
              </div>
              <p style={{ fontSize: 11, color: 'var(--rb-text-muted)', margin: 0 }}>
                {detail.provenance}
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
