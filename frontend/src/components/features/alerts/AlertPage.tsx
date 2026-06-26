import { useQuery } from '@tanstack/react-query';
import { Header } from '../../layout/Header/Header';
import { Tile } from '../../common/Tile/Tile';
import { Badge } from '../../common/Badge/Badge';
import { DataTable } from '../../common/DataTable/DataTable';
import { api } from '../../../lib/api';
import { Bell, BellOff, AlertTriangle, AlertCircle, Info, CheckCircle, RefreshCw } from 'lucide-react';
import type { Alert, AlertRule } from '../../../types';

export function AlertPage() {
  // Fetch active alerts
  const { data: alerts, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery<Alert[]>({
    queryKey: ['alerts-active'],
    queryFn: () => api<Alert[]>('/api/alerts/active'),
    refetchInterval: 30000,
  });

  // Fetch alert rules
  const { data: rules, isLoading: rulesLoading, refetch: refetchRules } = useQuery<AlertRule[]>({
    queryKey: ['alerts-rules'],
    queryFn: () => api<AlertRule[]>('/api/alerts/rules'),
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertCircle size={16} style={{ color: 'var(--error)' }} />;
      case 'WARNING':
        return <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />;
      default:
        return <Info size={16} style={{ color: 'var(--info)' }} />;
    }
  };

  const getSeverityVariant = (severity: string): 'error' | 'warning' | 'info' => {
    switch (severity) {
      case 'CRITICAL': return 'error';
      case 'WARNING': return 'warning';
      default: return 'info';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const criticalCount = alerts?.filter(a => a.severity === 'CRITICAL').length ?? 0;
  const warningCount = alerts?.filter(a => a.severity === 'WARNING').length ?? 0;
  const infoCount = alerts?.filter(a => a.severity === 'INFO').length ?? 0;

  return (
    <>
      <Header
        title="Notifikasi"
        subtitle="Peringatan dan notifikasi sistem"
        onRefresh={() => {
          refetchAlerts();
          refetchRules();
        }}
        isRefreshing={alertsLoading || rulesLoading}
      />

      <div className="app-content">
        {/* Summary Cards */}
        <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
          <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--info)', lineHeight: 1 }}>
              {infoCount}
            </div>
            <div className="stat-card-label">Info</div>
          </div>
          <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--warning)', lineHeight: 1 }}>
              {warningCount}
            </div>
            <div className="stat-card-label">Peringatan</div>
          </div>
          <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--error)', lineHeight: 1 }}>
              {criticalCount}
            </div>
            <div className="stat-card-label">Kritis</div>
          </div>
          <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {alerts?.length ?? 0}
            </div>
            <div className="stat-card-label">Total Aktif</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          {/* Alerts List */}
          <Tile title="Notifikasi Aktif" icon={<Bell size={16} />}>
            {alertsLoading ? (
              <div className="empty-state">
                <RefreshCw size={24} className="spin" />
                <p>Memuat notifikasi...</p>
              </div>
            ) : alerts && alerts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: 12,
                      background: alert.isRead ? 'transparent' : 'rgba(59, 130, 246, 0.1)',
                      borderRadius: 8,
                      border: `1px solid ${alert.severity === 'CRITICAL' ? 'var(--error)' : alert.severity === 'WARNING' ? 'var(--warning)' : 'var(--info)'}30`,
                    }}
                  >
                    {getSeverityIcon(alert.severity)}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{alert.title}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{alert.message}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        {formatDate(alert.createdAt)}
                      </div>
                    </div>
                    <Badge variant={getSeverityVariant(alert.severity)}>
                      {alert.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <BellOff size={40} />
                <p>Tidak ada notifikasi aktif</p>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Semua sistem berjalan normal
                </span>
              </div>
            )}
          </Tile>

          {/* Alert Rules */}
          <Tile title="Aturan Notifikasi" icon={<AlertTriangle size={16} />}>
            {rulesLoading ? (
              <div className="empty-state">
                <RefreshCw size={24} className="spin" />
              </div>
            ) : rules && rules.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: rule.enabled ? 'transparent' : 'rgba(128, 128, 128, 0.1)',
                      borderRadius: 6,
                      opacity: rule.enabled ? 1 : 0.6,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{rule.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        Threshold: {rule.threshold}
                      </div>
                    </div>
                    <Badge variant={rule.enabled ? 'success' : 'neutral'}>
                      {rule.enabled ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <CheckCircle size={24} />
                <p>Tidak ada aturan</p>
              </div>
            )}
          </Tile>
        </div>
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
