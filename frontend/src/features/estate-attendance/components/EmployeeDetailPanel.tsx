/**
 * Employee detail side panel (320px).
 * Shows profile, stats, and recent scans for the selected row.
 */
import { Badge } from '../../../design-system/components';
import { safeText } from '../utils/display';
import type { AttendanceMatrixRow as MatrixRow } from '../../../types';

interface EmployeeDetailPanelProps {
  row: MatrixRow | null;
  mode: string;
}

function mappingVariant(
  status: string,
): 'success' | 'warning' | 'neutral' {
  switch (status) {
    case 'MAPPED': return 'success';
    case 'NEED_REVIEW': return 'warning';
    default: return 'neutral';
  }
}

export function EmployeeDetailPanel({ row, mode }: EmployeeDetailPanelProps) {
  if (!row) {
    return (
      <aside className="rb-detail" style={{ minWidth: 0 }}>
        <div className="rb-detail-card rb-panel">
          <div style={{ color: 'var(--rb-text-muted)', fontSize: 13, textAlign: 'center', padding: '40px 16px' }}>
            Klik baris untuk melihat detail karyawan
          </div>
        </div>
      </aside>
    );
  }

  const workedDays = row.summary.present + row.summary.absent;
  const percent = workedDays > 0
    ? Math.round((row.summary.present / workedDays) * 100)
    : 0;

  return (
    <aside className="rb-detail" style={{ minWidth: 0 }}>
      {/* Profile card */}
      <div className="rb-panel rb-detail-card">
        <div className="rb-profile">
          <div
            className="rb-avatar"
            style={{
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--rb-text-secondary)',
            }}
          >
            {row.employeeName?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div>
            <div className="rb-profile__name">{safeText(row.employeeName)}</div>
            <div className="rb-profile__meta" style={{ fontFamily: 'var(--rb-font-mono)' }}>
              {safeText(row.employeeCode)}
            </div>
          </div>
        </div>

        <dl className="rb-kv" style={{ marginTop: 16 }}>
          <div>
            <dt>Divisi</dt>
            <dd style={{ fontWeight: 600 }}>{safeText(row.divisionCode)}</dd>
          </div>
          {mode === 'datamesin' && row.machineCode && (
            <div>
              <dt>Mesin</dt>
              <dd style={{ fontWeight: 600 }}>{row.machineCode}</dd>
            </div>
          )}
          <div>
            <dt>Mapping</dt>
            <dd>
              <Badge variant={mappingVariant(row.mappingStatus)}>
                {row.mappingStatus}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd style={{ fontSize: 11 }}>{mode === 'database' ? 'Parsed (Database)' : 'Raw (Mesin)'}</dd>
          </div>
        </dl>
      </div>

      {/* Stats card */}
      <div className="rb-panel rb-detail-card">
        <div style={{ fontSize: 12, color: 'var(--rb-text-muted)', marginBottom: 12, letterSpacing: '.04em', textTransform: 'uppercase' }}>
          Statistik
        </div>
        <dl className="rb-kv">
          <div>
            <dt>Hadir</dt>
            <dd style={{ color: 'var(--rb-present)', fontWeight: 700, fontSize: 16 }}>
              {row.summary.present}
            </dd>
          </div>
          <div>
            <dt>Tidak Hadir</dt>
            <dd style={{ color: 'var(--rb-absent)', fontWeight: 700, fontSize: 16 }}>
              {row.summary.absent}
            </dd>
          </div>
          <div>
            <dt>Sakit / Cuti</dt>
            <dd style={{ color: 'var(--rb-sick)', fontWeight: 700, fontSize: 16 }}>
              {row.summary.sick + row.summary.leave}
            </dd>
          </div>
          <div>
            <dt>Kehadiran</dt>
            <dd style={{ fontWeight: 700, fontSize: 16 }}>
              {percent}%
            </dd>
          </div>
        </dl>
      </div>

      {/* Data buttons */}
      <div className="rb-panel" style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
        <button
          className="rb-button"
          style={{ flex: 1, fontSize: 12 }}
          onClick={() => {/* Navigate to machine data */}}
        >
          Data Mesin
        </button>
        <button
          className="rb-button"
          style={{ flex: 1, fontSize: 12 }}
          onClick={() => {/* Navigate to parsed data */}}
        >
          Data Parsed
        </button>
      </div>
    </aside>
  );
}
