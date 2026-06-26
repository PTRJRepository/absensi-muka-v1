import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  User,
  Clock,
  Monitor,
  History,
  MapPin,
  Copy,
  CheckCircle,
  XCircle,
  Loader,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '../../common/Badge/Badge';
import { employeeDetailApi, employeeDetailKeys } from '../../../services/employee-detail.service';
import type { EmployeeDetail, CodeHistoryEntry, MachineEnrollment } from '../../../types';

interface EmployeeDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Employee identifier: numeric ID, NIK, or employee code */
  employeeIdentifier: string | number | null;
  /** Source of the identifier */
  source?: 'id' | 'nik' | 'code';
}

type TabType = 'overview' | 'history' | 'machines';

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '-';
  }
}

function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  try {
    const date = typeof iso === 'string' ? new Date(iso) : iso;
    return date.toLocaleString('id-ID', {
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

function maskNik(nik: string | null): string {
  if (!nik) return '-';
  const str = nik.replace(/\s+/g, '');
  if (str.length <= 8) return str;
  return str.substring(0, 4) + '*'.repeat(str.length - 8) + str.substring(str.length - 4);
}

function getLocCodeDescription(locCode: string | null): string {
  if (!locCode) return '-';
  const descriptions: Record<string, string> = {
    A: 'P1A (Parit 1 A)',
    B: 'P1B (Parit 1 B)',
    C: 'P2A (Parit 2 A)',
    D: 'P2B (Parit 2 B)',
    E: 'DME',
    F: 'ARA / OFFICE APE',
    G: 'AB1',
    H: 'AB2 / MILL',
    J: 'ARC',
    L: 'IJL',
  };
  return descriptions[locCode] || locCode;
}

function getStatusVariant(status: string | null | undefined): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (!status) return 'neutral';
  const upper = status.toUpperCase();
  if (upper === 'ACTIVE' || upper === '1') return 'success';
  if (upper === 'LEFT' || upper === '4' || upper === 'RESIGNED') return 'error';
  if (upper === 'WARNING' || upper === 'PROBATION') return 'warning';
  return 'info';
}

export function EmployeeDetailModal({
  open,
  onOpenChange,
  employeeIdentifier,
  source = 'id',
}: EmployeeDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showFullNik, setShowFullNik] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch employee detail
  const {
    data: detail,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: employeeDetailKeys.byIdentifier(employeeIdentifier ?? ''),
    queryFn: () => employeeDetailApi.getDetail(employeeIdentifier!),
    enabled: !!employeeIdentifier && open,
  });

  // Handle copy to clipboard
  const handleCopyCode = async () => {
    if (!detail?.currentEmpCode) return;
    try {
      await navigator.clipboard.writeText(detail.currentEmpCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy to clipboard');
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div className="emp-detail-overlay" onClick={() => onOpenChange(false)} />

      {/* Modal */}
      <div className="emp-detail-modal">
        {/* Header */}
        <header className="emp-detail-header">
          <div className="emp-detail-header-left">
            <div className="emp-detail-avatar">
              {detail?.employeeName
                ? detail.employeeName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()
                : detail?.currentEmpCode?.substring(0, 2) || '??'}
            </div>
            <div>
              <h2>{detail?.employeeName || 'Loading...'}</h2>
              <div className="emp-detail-header-badges">
                <Badge variant={getStatusVariant(detail?.status)}>
                  {detail?.status || 'Unknown'}
                </Badge>
                {detail?.locCode && (
                  <Badge variant="info">{getLocCodeDescription(detail.locCode)}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="emp-detail-header-actions">
            <button
              className="emp-detail-icon-btn"
              onClick={() => refetch()}
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
            <button
              className="emp-detail-icon-btn"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Current Code Hero */}
        <div className="emp-detail-hero">
          <div className="emp-detail-hero-label">CURRENT CODE</div>
          <div className="emp-detail-hero-code">
            {isLoading ? (
              <span className="emp-detail-loading-text">Loading...</span>
            ) : (
              <>
                <span className="emp-detail-code-value">{detail?.currentEmpCode || '-'}</span>
                <button
                  className="emp-detail-copy-btn"
                  onClick={handleCopyCode}
                  title="Copy code"
                >
                  {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Subtitle */}
        <div className="emp-detail-subtitle">
          <span className="mono">NIK: {showFullNik ? detail?.nik || '-' : detail?.nikMasked || '-'}</span>
          {detail?.nik && (
            <button
              className="emp-detail-nik-toggle"
              onClick={() => setShowFullNik(!showFullNik)}
              title={showFullNik ? 'Hide NIK' : 'Show NIK'}
            >
              {showFullNik ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>

        {/* Tabs */}
        <nav className="emp-detail-tabs">
          <button
            className={`emp-detail-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <User size={16} />
            Overview
          </button>
          <button
            className={`emp-detail-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={16} />
            Code History
            {detail?.codeHistory && detail.codeHistory.length > 1 && (
              <span className="tab-count">{detail.codeHistory.length - 1}</span>
            )}
          </button>
          <button
            className={`emp-detail-tab-btn ${activeTab === 'machines' ? 'active' : ''}`}
            onClick={() => setActiveTab('machines')}
          >
            <Monitor size={16} />
            Machines
            {detail?.machineEnrollments && detail.machineEnrollments.length > 0 && (
              <span className="tab-count">{detail.machineEnrollments.length}</span>
            )}
          </button>
        </nav>

        {/* Content */}
        <div className="emp-detail-content">
          {isLoading && (
            <div className="emp-detail-loading">
              <Loader size={32} className="animate-spin" />
              <span>Memuat data karyawan...</span>
            </div>
          )}

          {error && (
            <div className="emp-detail-error">
              <XCircle size={48} />
              <p>Error loading employee data</p>
              <button className="emp-detail-retry-btn" onClick={() => refetch()}>
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}

          {!isLoading && !error && detail && (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="emp-detail-tab-panel">
                  {/* Identity Section */}
                  <section className="emp-detail-section">
                    <h3 className="emp-detail-section-title">
                      <User size={16} />
                      Identity
                    </h3>
                    <div className="emp-detail-info-grid">
                      <div className="emp-detail-info-card">
                        <div className="info-label">Employee Code</div>
                        <div className="info-value mono">{detail.currentEmpCode || '-'}</div>
                      </div>
                      <div className="emp-detail-info-card">
                        <div className="info-label">Location Code</div>
                        <div className="info-value">
                          <Badge variant="info">{detail.locCode || '-'}</Badge>
                        </div>
                      </div>
                      <div className="emp-detail-info-card">
                        <div className="info-label">NIK</div>
                        <div className="info-value mono">
                          {showFullNik ? detail.nik || '-' : detail.nikMasked || '-'}
                          {detail.nik && (
                            <button
                              className="emp-detail-inline-btn"
                              onClick={() => setShowFullNik(!showFullNik)}
                            >
                              {showFullNik ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="emp-detail-info-card">
                        <div className="info-label">HR Status</div>
                        <div className="info-value">
                          <Badge variant={getStatusVariant(detail.status)}>
                            {detail.status || '-'}
                          </Badge>
                        </div>
                      </div>
                      {detail.divisionName && (
                        <div className="emp-detail-info-card">
                          <div className="info-label">Division</div>
                          <div className="info-value">{detail.divisionName}</div>
                        </div>
                      )}
                      {detail.gangCode && (
                        <div className="emp-detail-info-card">
                          <div className="info-label">Gang</div>
                          <div className="info-value">
                            <Badge variant="neutral">{detail.gangCode}</Badge>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Dates Section */}
                  <section className="emp-detail-section">
                    <h3 className="emp-detail-section-title">
                      <Clock size={16} />
                      Dates
                    </h3>
                    <div className="emp-detail-info-grid">
                      <div className="emp-detail-info-card">
                        <div className="info-label">Create Date</div>
                        <div className="info-value">{formatDate(detail.createDate)}</div>
                      </div>
                      <div className="emp-detail-info-card">
                        <div className="info-label">Update Date</div>
                        <div className="info-value">{formatDate(detail.updateDate)}</div>
                      </div>
                    </div>
                  </section>

                  {/* Quick Code History */}
                  {detail.codeHistory.length > 0 && (
                    <section className="emp-detail-section">
                      <h3 className="emp-detail-section-title">
                        <History size={16} />
                        Recent Code Changes
                      </h3>
                      <div className="emp-detail-code-history-preview">
                        {detail.codeHistory.slice(0, 3).map((entry, idx) => (
                          <div
                            key={entry.id}
                            className={`emp-detail-history-item ${entry.isCurrent ? 'current' : 'past'}`}
                          >
                            <div className="history-item-indicator">
                              {entry.isCurrent ? (
                                <CheckCircle size={14} className="text-success" />
                              ) : (
                                <XCircle size={14} className="text-muted" />
                              )}
                            </div>
                            <div className="history-item-content">
                              <div className="history-item-code mono">
                                {entry.empCode}
                                {entry.isCurrent && <Badge variant="success">Current</Badge>}
                              </div>
                              <div className="history-item-meta">
                                <span>{getLocCodeDescription(entry.locCode)}</span>
                                <span>•</span>
                                <Badge variant={getStatusVariant(entry.status)}>
                                  {entry.status || '-'}
                                </Badge>
                              </div>
                              {entry.updateDate && (
                                <div className="history-item-date">
                                  {formatDate(entry.updateDate)}
                                </div>
                              )}
                            </div>
                            {idx < detail.codeHistory.length - 1 && idx < 2 && (
                              <div className="history-item-connector" />
                            )}
                          </div>
                        ))}
                        {detail.codeHistory.length > 3 && (
                          <button
                            className="emp-detail-view-more"
                            onClick={() => setActiveTab('history')}
                          >
                            View all {detail.codeHistory.length} changes
                            <ChevronRight size={14} />
                          </button>
                        )}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div className="emp-detail-tab-panel">
                  <section className="emp-detail-section">
                    <div className="emp-detail-section-header">
                      <h3 className="emp-detail-section-title">
                        <History size={16} />
                        Code Change History
                      </h3>
                      <span className="emp-detail-count-badge">
                        {detail.codeHistory.length} {detail.codeHistory.length === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>

                    {detail.codeHistory.length === 0 ? (
                      <div className="emp-detail-empty">
                        <History size={48} />
                        <p>No code history available</p>
                      </div>
                    ) : (
                      <div className="emp-detail-timeline">
                        {detail.codeHistory.map((entry, idx) => (
                          <div
                            key={entry.id}
                            className={`emp-detail-timeline-item ${entry.isCurrent ? 'current' : ''}`}
                          >
                            <div className="timeline-marker">
                              {entry.isCurrent ? (
                                <div className="timeline-dot current">
                                  <CheckCircle size={16} />
                                </div>
                              ) : (
                                <div className="timeline-dot past">
                                  <Clock size={14} />
                                </div>
                              )}
                              {idx < detail.codeHistory.length - 1 && (
                                <div className="timeline-line" />
                              )}
                            </div>
                            <div className="timeline-content">
                              <div className="timeline-header">
                                <div className="timeline-code mono">
                                  {entry.empCode}
                                </div>
                                {entry.isCurrent && (
                                  <Badge variant="success">Current</Badge>
                                )}
                              </div>
                              <div className="timeline-details">
                                <div className="timeline-detail">
                                  <span className="detail-label">Location:</span>
                                  <span className="detail-value">
                                    {getLocCodeDescription(entry.locCode)}
                                  </span>
                                </div>
                                <div className="timeline-detail">
                                  <span className="detail-label">Status:</span>
                                  <Badge variant={getStatusVariant(entry.status)}>
                                    {entry.status || '-'}
                                  </Badge>
                                </div>
                              </div>
                              {entry.empName && (
                                <div className="timeline-name">{entry.empName}</div>
                              )}
                              <div className="timeline-dates">
                                {entry.createDate && (
                                  <span>Created: {formatDate(entry.createDate)}</span>
                                )}
                                {entry.createDate && entry.updateDate && (
                                  <span className="date-sep">•</span>
                                )}
                                {entry.updateDate && (
                                  <span>Updated: {formatDate(entry.updateDate)}</span>
                                )}
                              </div>
                              {entry.sourceTable && (
                                <div className="timeline-source">
                                  Source: {entry.sourceTable}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* Machines Tab */}
              {activeTab === 'machines' && (
                <div className="emp-detail-tab-panel">
                  <section className="emp-detail-section">
                    <div className="emp-detail-section-header">
                      <h3 className="emp-detail-section-title">
                        <Monitor size={16} />
                        Machine Enrollments
                      </h3>
                      <span className="emp-detail-count-badge">
                        {detail.machineEnrollments.length} {detail.machineEnrollments.length === 1 ? 'machine' : 'machines'}
                      </span>
                    </div>

                    {detail.machineEnrollments.length === 0 ? (
                      <div className="emp-detail-empty">
                        <Monitor size={48} />
                        <p>No machine enrollments</p>
                      </div>
                    ) : (
                      <div className="emp-detail-machines">
                        {detail.machineEnrollments.map((enrollment) => (
                          <div key={enrollment.machineCode} className="emp-detail-machine-card">
                            <div className="machine-card-header">
                              <div className="machine-info">
                                <Badge variant="info">{enrollment.machineCode}</Badge>
                                {enrollment.machineName && (
                                  <span className="machine-name">{enrollment.machineName}</span>
                                )}
                              </div>
                              {enrollment.mappingStatus && (
                                <Badge
                                  variant={
                                    enrollment.mappingStatus === 'MAPPED'
                                      ? 'success'
                                      : enrollment.mappingStatus === 'UNMAPPED'
                                      ? 'error'
                                      : 'warning'
                                  }
                                >
                                  {enrollment.mappingStatus}
                                </Badge>
                              )}
                            </div>
                            <div className="machine-card-body">
                              <div className="machine-detail-row">
                                <span className="detail-label">Raw ID:</span>
                                <span className="detail-value mono">
                                  {enrollment.rawDeviceUserId || '-'}
                                </span>
                              </div>
                              <div className="machine-detail-row">
                                <span className="detail-label">Parsed Code:</span>
                                <span className="detail-value mono">
                                  {enrollment.parsedCode || '-'}
                                </span>
                              </div>
                              {enrollment.zktecoUserName && (
                                <div className="machine-detail-row">
                                  <span className="detail-label">Machine Name:</span>
                                  <span className="detail-value">
                                    {enrollment.zktecoUserName}
                                  </span>
                                </div>
                              )}
                              <div className="machine-detail-row">
                                <span className="detail-label">First Seen:</span>
                                <span className="detail-value">
                                  {formatDateTime(enrollment.firstSeenAt)}
                                </span>
                              </div>
                              <div className="machine-detail-row">
                                <span className="detail-label">Last Seen:</span>
                                <span className="detail-value">
                                  {formatDateTime(enrollment.lastSeenAt)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="emp-detail-footer">
          <button
            className="emp-detail-btn-secondary"
            onClick={() => onOpenChange(false)}
          >
            Close
          </button>
        </footer>
      </div>

      <style>{`
        .emp-detail-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 999;
        }

        .emp-detail-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 600px;
          max-width: 95vw;
          max-height: 90vh;
          background: var(--surface-card);
          border-radius: var(--radius-lg);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          z-index: 1000;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .emp-detail-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .emp-detail-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .emp-detail-avatar {
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

        .emp-detail-header h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .emp-detail-header-badges {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
        }

        .emp-detail-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .emp-detail-icon-btn {
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

        .emp-detail-icon-btn:hover {
          background: var(--surface-muted);
          color: var(--text-primary);
        }

        .emp-detail-hero {
          padding: 20px;
          background: linear-gradient(135deg, var(--brand-primary) 0%, #1e40af 100%);
          color: white;
          text-align: center;
        }

        .emp-detail-hero-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 2px;
          opacity: 0.8;
          margin-bottom: 8px;
        }

        .emp-detail-hero-code {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .emp-detail-code-value {
          font-family: var(--font-mono);
          font-size: 36px;
          font-weight: 700;
          letter-spacing: 2px;
        }

        .emp-detail-copy-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          cursor: pointer;
          transition: all var(--duration-fast);
        }

        .emp-detail-copy-btn:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .emp-detail-subtitle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 20px;
          background: var(--surface-muted);
          border-bottom: 1px solid var(--border-color);
          font-size: 13px;
          color: var(--text-secondary);
        }

        .emp-detail-nik-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .emp-detail-nik-toggle:hover {
          background: var(--surface-hover);
          color: var(--text-primary);
        }

        .emp-detail-tabs {
          display: flex;
          border-bottom: 1px solid var(--border-color);
          padding: 0 16px;
        }

        .emp-detail-tab-btn {
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

        .emp-detail-tab-btn:hover {
          color: var(--text-primary);
        }

        .emp-detail-tab-btn.active {
          color: var(--brand-primary);
          border-bottom-color: var(--brand-primary);
        }

        .tab-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 9px;
          background: var(--surface-muted);
          font-size: 11px;
          font-weight: 600;
        }

        .emp-detail-tab-btn.active .tab-count {
          background: var(--brand-primary);
          color: white;
        }

        .emp-detail-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
        }

        .emp-detail-loading,
        .emp-detail-error,
        .emp-detail-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          color: var(--text-secondary);
          text-align: center;
        }

        .emp-detail-error {
          color: var(--error);
        }

        .emp-detail-retry-btn {
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
        }

        .emp-detail-retry-btn:hover {
          background: var(--surface-muted);
          color: var(--text-primary);
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .emp-detail-tab-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .emp-detail-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .emp-detail-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .emp-detail-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .emp-detail-count-badge {
          font-size: 12px;
          color: var(--text-secondary);
          background: var(--surface-muted);
          padding: 2px 8px;
          border-radius: 10px;
        }

        .emp-detail-info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .emp-detail-info-card {
          display: flex;
          flex-direction: column;
          gap: 4px;
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
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .info-value.mono {
          font-family: var(--font-mono);
        }

        .emp-detail-inline-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border: none;
          border-radius: 4px;
          background: transparent;
          color: var(--text-tertiary);
          cursor: pointer;
        }

        .emp-detail-inline-btn:hover {
          background: var(--surface-muted);
          color: var(--text-primary);
        }

        /* Code History Preview */
        .emp-detail-code-history-preview {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .emp-detail-history-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          background: var(--surface-muted);
          border-radius: 8px;
          position: relative;
        }

        .emp-detail-history-item.current {
          background: rgba(54, 209, 124, 0.1);
          border: 1px solid rgba(54, 209, 124, 0.3);
        }

        .history-item-indicator {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .text-success {
          color: var(--success);
        }

        .text-muted {
          color: var(--text-tertiary);
        }

        .history-item-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .history-item-code {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .history-item-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .history-item-date {
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .history-item-connector {
          position: absolute;
          left: 22px;
          top: 100%;
          width: 2px;
          height: 8px;
          background: var(--border-color);
        }

        .emp-detail-view-more {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 8px;
          border: none;
          background: transparent;
          color: var(--brand-primary);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 6px;
        }

        .emp-detail-view-more:hover {
          background: var(--surface-muted);
        }

        /* Timeline */
        .emp-detail-timeline {
          display: flex;
          flex-direction: column;
        }

        .emp-detail-timeline-item {
          display: flex;
          gap: 16px;
        }

        .timeline-marker {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex-shrink: 0;
        }

        .timeline-dot {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .timeline-dot.current {
          background: rgba(54, 209, 124, 0.2);
          color: var(--success);
        }

        .timeline-dot.past {
          background: var(--surface-muted);
          color: var(--text-tertiary);
        }

        .timeline-line {
          width: 2px;
          flex: 1;
          background: var(--border-color);
          margin: 4px 0;
        }

        .timeline-content {
          flex: 1;
          padding-bottom: 20px;
        }

        .emp-detail-timeline-item:last-child .timeline-content {
          padding-bottom: 0;
        }

        .timeline-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .timeline-code {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .timeline-details {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 8px;
        }

        .timeline-detail {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .detail-label {
          color: var(--text-tertiary);
        }

        .detail-value {
          color: var(--text-primary);
          font-weight: 500;
        }

        .detail-value.mono {
          font-family: var(--font-mono);
        }

        .timeline-name {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .timeline-dates {
          font-size: 12px;
          color: var(--text-tertiary);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .date-sep {
          color: var(--border-color);
        }

        .timeline-source {
          font-size: 11px;
          color: var(--text-tertiary);
          margin-top: 4px;
          font-style: italic;
        }

        /* Machines */
        .emp-detail-machines {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .emp-detail-machine-card {
          padding: 12px;
          background: var(--surface-muted);
          border-radius: 8px;
          border: 1px solid var(--border-color);
        }

        .machine-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .machine-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .machine-name {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .machine-card-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .machine-detail-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }

        .emp-detail-footer {
          display: flex;
          justify-content: flex-end;
          padding: 12px 20px;
          border-top: 1px solid var(--border-color);
          background: var(--surface-card);
        }

        .emp-detail-btn-secondary {
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

        .emp-detail-btn-secondary:hover {
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
