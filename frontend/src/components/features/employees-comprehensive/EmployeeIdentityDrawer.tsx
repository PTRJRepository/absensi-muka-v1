import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  User,
  Fingerprint,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Monitor,
  Loader,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '../../common/Badge/Badge';
import { employeeComprehensiveApi } from '../../../services/employee-comprehensive.service';
import type {
  EmployeeComprehensiveRow,
  EmployeeIdentity,
  ScanRecord,
  BadgeVariant,
} from '../../../types';

interface EmployeeIdentityDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeComprehensiveRow | null;
}

type TabType = 'identity' | 'scans' | 'mapping';

// Helper to format dates
function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '-';
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

// Helper to get badge variant for mapping status
function getMappingBadgeVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case 'MAPPED':
      return 'success';
    case 'UNMAPPED':
      return 'error';
    case 'NEED_REVIEW':
      return 'warning';
    case 'AMBIGUOUS':
      return 'info';
    default:
      return 'neutral';
  }
}

function getMappingBadgeLabel(status: string | null | undefined): string {
  switch (status) {
    case 'MAPPED':
      return 'Mapped';
    case 'UNMAPPED':
      return 'Unmapped';
    case 'NEED_REVIEW':
      return 'Need Review';
    case 'AMBIGUOUS':
      return 'Ambiguous';
    default:
      return status || '-';
  }
}

export function EmployeeIdentityDrawer({
  open,
  onOpenChange,
  employee,
}: EmployeeIdentityDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('identity');
  const [scanPage, setScanPage] = useState(1);
  const scanPageSize = 20;

  // Fetch employee detail
  const {
    data: detailData,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['employee-comprehensive', 'detail', employee?.identityKey, employee?.machineCode],
    queryFn: () =>
      employeeComprehensiveApi.getEmployeeDetail(
        employee?.employeeCode || employee?.parsedEmployeeCode || employee?.rawDeviceUserId || '',
        employee?.machineCode
      ),
    enabled: !!employee && open,
  });

  const detail: EmployeeIdentity | null = detailData?.data || null;

  // Fetch scan history
  const {
    data: scansData,
    isLoading: scansLoading,
    refetch: refetchScans,
  } = useQuery({
    queryKey: ['employee-comprehensive', 'scans', employee?.identityKey, employee?.machineCode, scanPage],
    queryFn: () =>
      employeeComprehensiveApi.getScans(
        employee?.employeeCode || employee?.parsedEmployeeCode || employee?.rawDeviceUserId || '',
        employee?.machineCode,
        scanPage,
        scanPageSize
      ),
    enabled: !!employee && open,
  });

  const scans = scansData?.data?.rows || [];
  const scansPagination = scansData?.data?.pagination;
  const totalScanPages = scansPagination?.totalPages ?? 1;

  // Get title from employee data
  const title = employee?.employeeName || employee?.zktecoUserName || employee?.rawDeviceUserId || 'Employee Detail';

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div className="identity-drawer-overlay" onClick={() => onOpenChange(false)} />

      {/* Panel */}
      <aside className="identity-drawer-panel">
        {/* Header */}
        <header className="identity-drawer-header">
          <div className="identity-drawer-header-left">
            <div className="identity-avatar">
              {employee?.employeeName
                ? employee.employeeName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()
                : employee?.zktecoUserName
                ? employee.zktecoUserName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()
                : '?'}
            </div>
            <div>
              <h2>{title}</h2>
              <div className="identity-header-badges">
                <Badge variant={getMappingBadgeVariant(employee?.mappingStatus)}>
                  {getMappingBadgeLabel(employee?.mappingStatus)}
                </Badge>
                <span className="identity-header-code">
                  {employee?.employeeCode || employee?.parsedEmployeeCode || '-'}
                </span>
              </div>
            </div>
          </div>
          <button
            className="identity-drawer-close"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>

        {/* Subtitle */}
        <div className="identity-drawer-subtitle">
          <span className="mono">{employee?.employeeCode || '-'}</span>
          <span className="divider">|</span>
          <span className="mono">{employee?.rawDeviceUserId || '-'}</span>
          <span className="divider">|</span>
          <Badge variant="neutral">{employee?.machineCode || '-'}</Badge>
        </div>

        {/* Tabs */}
        <nav className="identity-drawer-tabs">
          <button
            className={`identity-tab-btn ${activeTab === 'identity' ? 'active' : ''}`}
            onClick={() => setActiveTab('identity')}
          >
            <User size={16} />
            Identitas
          </button>
          <button
            className={`identity-tab-btn ${activeTab === 'scans' ? 'active' : ''}`}
            onClick={() => setActiveTab('scans')}
          >
            <Fingerprint size={16} />
            Scan History
            {scansPagination && <span className="tab-count">{scansPagination.total}</span>}
          </button>
          <button
            className={`identity-tab-btn ${activeTab === 'mapping' ? 'active' : ''}`}
            onClick={() => setActiveTab('mapping')}
          >
            <MapPin size={16} />
            Mapping
          </button>
        </nav>

        {/* Content */}
        <div className="identity-drawer-content">
          {/* Identity Tab */}
          {activeTab === 'identity' && (
            <div className="identity-tab-panel">
              {detailLoading ? (
                <div className="identity-loading">
                  <Loader size={24} className="animate-spin" />
                  <span>Memuat data karyawan...</span>
                </div>
              ) : detail ? (
                <>
                  {/* Device Info */}
                  <section className="identity-section">
                    <h3 className="identity-section-title">
                      <Monitor size={16} />
                      Informasi Device
                    </h3>
                    <div className="identity-info-grid">
                      <div className="identity-info-card">
                        <div className="info-label">Absensi ID (Raw)</div>
                        <div className="info-value mono">{detail.rawDeviceUserId || '-'}</div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Parsed ID</div>
                        <div className="info-value mono">
                          {detail.parsedEmployeeCode || '-'}
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Employee Code</div>
                        <div className="info-value mono">
                          {detail.employeeCode || '-'}
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Current EmpCode</div>
                        <div className="info-value mono">
                          {(detail as any).currentEmpCode || '-'}
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">NIK</div>
                        <div className="info-value mono">
                          {(detail as any).nik || '-'}
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Nama di Mesin</div>
                        <div className="info-value">
                          {detail.zktecoUserName || '-'}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Employee Info */}
                  <section className="identity-section">
                    <h3 className="identity-section-title">
                      <User size={16} />
                      Informasi Karyawan
                    </h3>
                    <div className="identity-info-grid">
                      <div className="identity-info-card">
                        <div className="info-label">Nama Lengkap</div>
                        <div className="info-value">
                          {detail.employeeName || '-'}
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Divisi</div>
                        <div className="info-value">
                          <Badge variant="neutral">{detail.divisionCode || '-'}</Badge>
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Gang</div>
                        <div className="info-value">
                          <Badge variant="neutral">{detail.gangCode || '-'}</Badge>
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Mesin</div>
                        <div className="info-value">
                          <Badge variant="neutral">{detail.machineCode || '-'}</Badge>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Mapping Info */}
                  <section className="identity-section">
                    <h3 className="identity-section-title">
                      <MapPin size={16} />
                      Status Mapping
                    </h3>
                    <div className="identity-info-grid">
                      <div className="identity-info-card">
                        <div className="info-label">Status</div>
                        <div className="info-value">
                          <Badge variant={getMappingBadgeVariant(detail.mappingStatus)}>
                            {getMappingBadgeLabel(detail.mappingStatus)}
                          </Badge>
                        </div>
                      </div>
                      <div className="identity-info-card full-width">
                        <div className="info-label">Alasan</div>
                        <div className="info-value text-muted">
                          {detail.mappingReason || '-'}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Timeline */}
                  <section className="identity-section">
                    <h3 className="identity-section-title">
                      <Clock size={16} />
                      Timeline
                    </h3>
                    <div className="identity-timeline">
                      <div className="timeline-item">
                        <div className="timeline-icon first-seen">
                          <Clock size={14} />
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-label">First Seen</div>
                          <div className="timeline-value">{formatDateTime(detail.firstSeenAt)}</div>
                        </div>
                      </div>
                      <div className="timeline-item">
                        <div className="timeline-icon last-seen">
                          <Clock size={14} />
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-label">Last Seen</div>
                          <div className="timeline-value">{formatDateTime(detail.lastSeenAt)}</div>
                        </div>
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <div className="identity-empty">
                  <AlertCircle size={48} />
                  <p>Tidak ada data detail karyawan</p>
                </div>
              )}
            </div>
          )}

          {/* Scans Tab */}
          {activeTab === 'scans' && (
            <div className="identity-tab-panel">
              {scansLoading ? (
                <div className="identity-loading">
                  <Loader size={24} className="animate-spin" />
                  <span>Memuat scan history...</span>
                </div>
              ) : scans.length > 0 ? (
                <>
                  <div className="scan-list">
                    {scans.map((scan: ScanRecord, index: number) => (
                      <div key={scan.id || index} className="scan-item">
                        <div className="scan-item-header">
                          <div className="scan-time">
                            <Clock size={12} />
                            <span className="mono">{formatDateTime(scan.scanTime)}</span>
                          </div>
                          <Badge variant="neutral">{scan.machineCode || '-'}</Badge>
                        </div>
                        <div className="scan-item-details">
                          <div className="scan-detail">
                            <span className="detail-label">Event:</span>
                            <span className="detail-value">{scan.eventType || '-'}</span>
                          </div>
                          <div className="scan-detail">
                            <span className="detail-label">Verify:</span>
                            <span className="detail-value">{scan.verifyType || '-'}</span>
                          </div>
                          <div className="scan-detail">
                            <span className="detail-label">Status:</span>
                            <Badge
                              variant={
                                scan.mappingStatus === 'MAPPED'
                                  ? 'success'
                                  : scan.mappingStatus === 'NEED_REVIEW'
                                  ? 'warning'
                                  : 'error'
                              }
                            >
                              {scan.mappingStatus || '-'}
                            </Badge>
                          </div>
                        </div>
                        {scan.parsedEmployeeCode && (
                          <div className="scan-item-code">
                            <span className="detail-label">Parsed:</span>
                            <span className="mono">{scan.parsedEmployeeCode}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalScanPages > 1 && (
                    <div className="scan-pagination">
                      <button
                        className="page-btn"
                        onClick={() => setScanPage((p) => Math.max(1, p - 1))}
                        disabled={scanPage === 1}
                      >
                        Prev
                      </button>
                      <span className="pagination-text">
                        {scanPage} / {totalScanPages}
                      </span>
                      <button
                        className="page-btn"
                        onClick={() => setScanPage((p) => Math.min(totalScanPages, p + 1))}
                        disabled={scanPage === totalScanPages}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="identity-empty">
                  <Fingerprint size={48} />
                  <p>Tidak ada scan history</p>
                </div>
              )}
            </div>
          )}

          {/* Mapping Tab */}
          {activeTab === 'mapping' && (
            <div className="identity-tab-panel">
              {detailLoading ? (
                <div className="identity-loading">
                  <Loader size={24} className="animate-spin" />
                  <span>Memuat mapping info...</span>
                </div>
              ) : detail ? (
                <>
                  {/* Mapping Status */}
                  <section className="identity-section">
                    <h3 className="identity-section-title">
                      <MapPin size={16} />
                      Status Mapping
                    </h3>
                    <div className="mapping-status-card">
                      <div className="mapping-status-icon">
                        {detail.mappingStatus === 'MAPPED' ? (
                          <CheckCircle size={48} className="text-success" />
                        ) : (
                          <XCircle size={48} className="text-error" />
                        )}
                      </div>
                      <div className="mapping-status-info">
                        <div className="mapping-status-badge">
                          <Badge variant={getMappingBadgeVariant(detail.mappingStatus)}>
                            {getMappingBadgeLabel(detail.mappingStatus)}
                          </Badge>
                        </div>
                        <div className="mapping-reason">
                          {detail.mappingReason || 'Tidak ada informasi'}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Code Mapping */}
                  <section className="identity-section">
                    <h3 className="identity-section-title">
                      <Fingerprint size={16} />
                      Code Mapping
                    </h3>
                    <div className="identity-info-grid">
                      <div className="identity-info-card">
                        <div className="info-label">Raw Device ID</div>
                        <div className="info-value mono">{detail.rawDeviceUserId || '-'}</div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Parsed Code</div>
                        <div className="info-value mono">
                          {detail.parsedEmployeeCode || '-'}
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Current EmpCode</div>
                        <div className="info-value mono">
                          {(detail as any).currentEmpCode || '-'}
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Employee Code (DB)</div>
                        <div className="info-value mono">
                          {detail.employeeCode || '-'}
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">NIK</div>
                        <div className="info-value mono">
                          {(detail as any).nik || '-'}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Batch Import & Machine Context */}
                  <section className="identity-section">
                    <h3 className="identity-section-title">
                      <Monitor size={16} />
                      Konteks Mesin
                    </h3>
                    <div className="identity-info-grid">
                      <div className="identity-info-card">
                        <div className="info-label">Machine Code</div>
                        <div className="info-value">
                          <Badge variant="neutral">{detail.machineCode || '-'}</Badge>
                        </div>
                      </div>
                      <div className="identity-info-card">
                        <div className="info-label">Batch Import</div>
                        <div className="info-value mono">
                          {(detail as any).batchImport || '-'}
                        </div>
                      </div>
                      <div className="identity-info-card full-width">
                        <div className="info-label">Machine Codes (Enrolled)</div>
                        <div className="info-value">
                          {(detail as any).machineCodes
                            ? (detail as any).machineCodes.split(',').map((code: string) => (
                                <Badge key={code} variant="neutral">{code}</Badge>
                              ))
                            : '-'}
                        </div>
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <div className="identity-empty">
                  <AlertCircle size={48} />
                  <p>Tidak ada data mapping</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="identity-drawer-footer">
          <button className="identity-btn-secondary" onClick={() => refetchDetail()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </footer>
      </aside>

      <style>{`
        .identity-drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 999;
        }

        .identity-drawer-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 480px;
          max-width: 100vw;
          background: var(--surface-card);
          border-left: 1px solid var(--border-color);
          z-index: 1000;
          display: flex;
          flex-direction: column;
          box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
        }

        .identity-drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .identity-drawer-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .identity-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--brand-primary);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .identity-drawer-header h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .identity-header-badges {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }

        .identity-header-code {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-secondary);
        }

        .identity-drawer-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--duration-fast);
        }

        .identity-drawer-close:hover {
          background: var(--surface-muted);
          color: var(--text-primary);
        }

        .identity-drawer-subtitle {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: var(--surface-muted);
          border-bottom: 1px solid var(--border-color);
          font-size: 12px;
          color: var(--text-secondary);
        }

        .identity-drawer-subtitle .divider {
          color: var(--border-color);
        }

        .identity-drawer-tabs {
          display: flex;
          border-bottom: 1px solid var(--border-color);
          padding: 0 16px;
        }

        .identity-tab-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 12px 16px;
          border: none;
          background: none;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: all var(--duration-fast);
        }

        .identity-tab-btn:hover {
          color: var(--text-primary);
        }

        .identity-tab-btn.active {
          color: var(--brand-primary);
          border-bottom-color: var(--brand-primary);
        }

        .tab-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 18px;
          padding: 0 6px;
          border-radius: 9px;
          background: var(--surface-muted);
          font-size: 11px;
          font-weight: 600;
        }

        .identity-tab-btn.active .tab-count {
          background: var(--brand-primary);
          color: white;
        }

        .identity-drawer-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
        }

        .identity-tab-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .identity-loading,
        .identity-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          color: var(--text-secondary);
          text-align: center;
        }

        .identity-empty p {
          margin: 0;
          font-size: 14px;
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .identity-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .identity-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .identity-info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .identity-info-card {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .identity-info-card.full-width {
          grid-column: span 2;
        }

        .info-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-value {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .info-value.mono {
          font-family: var(--font-mono);
        }

        .info-value.text-muted {
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 400;
        }

        .identity-timeline {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 12px;
          background: var(--surface-muted);
          border-radius: 8px;
        }

        .timeline-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .timeline-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .timeline-icon.first-seen {
          background: rgba(58, 160, 255, 0.12);
          color: var(--info);
        }

        .timeline-icon.last-seen {
          background: rgba(54, 209, 124, 0.12);
          color: var(--success);
        }

        .timeline-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .timeline-label {
          font-size: 11px;
          color: var(--text-tertiary);
          font-weight: 600;
          text-transform: uppercase;
        }

        .timeline-value {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
        }

        /* Scan List */
        .scan-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .scan-item {
          padding: 12px;
          background: var(--surface-muted);
          border-radius: 8px;
          border: 1px solid var(--border-color);
        }

        .scan-item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .scan-time {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-primary);
        }

        .scan-item-details {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .scan-detail {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
        }

        .scan-detail .detail-label {
          color: var(--text-tertiary);
        }

        .scan-detail .detail-value {
          color: var(--text-primary);
          font-weight: 500;
        }

        .scan-item-code {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--border-color);
          font-size: 12px;
        }

        .scan-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 16px;
        }

        .page-btn {
          padding: 6px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--surface-card);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast);
        }

        .page-btn:hover:not(:disabled) {
          background: var(--surface-muted);
          color: var(--text-primary);
        }

        .page-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagination-text {
          font-size: 12px;
          color: var(--text-secondary);
        }

        /* Mapping Status */
        .mapping-status-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: var(--surface-muted);
          border-radius: 8px;
        }

        .mapping-status-icon {
          flex-shrink: 0;
        }

        .text-success {
          color: var(--success);
        }

        .text-error {
          color: var(--error);
        }

        .mapping-status-info {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .mapping-status-badge {
          display: flex;
        }

        .mapping-reason {
          font-size: 13px;
          color: var(--text-secondary);
        }

        /* Footer */
        .identity-drawer-footer {
          display: flex;
          justify-content: flex-end;
          padding: 12px 20px;
          border-top: 1px solid var(--border-color);
          background: var(--surface-card);
        }

        .identity-btn-secondary {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--surface-card);
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--duration-fast);
        }

        .identity-btn-secondary:hover {
          background: var(--surface-muted);
          color: var(--text-primary);
        }

        .mono {
          font-family: var(--font-mono);
        }
      `}</style>
    </>
  );
}
