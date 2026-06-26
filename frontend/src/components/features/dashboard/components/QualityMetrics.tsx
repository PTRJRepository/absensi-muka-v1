import { CheckCircle, AlertTriangle, XCircle, Activity } from 'lucide-react';
import type { QualityReport, QualityMetric } from '../../../types';

interface QualityMetricsProps {
  quality: QualityReport | undefined;
  loading?: boolean;
}

export function QualityMetrics({ quality, loading }: QualityMetricsProps) {
  if (loading) {
    return (
      <div className="quality-metrics loading">
        <div className="quality-skeleton">
          <div className="skeleton" style={{ height: 60, width: 60, borderRadius: '50%' }} />
          <div className="skeleton" style={{ height: 20, width: 80, marginTop: 8 }} />
        </div>
      </div>
    );
  }

  if (!quality) {
    return (
      <div className="quality-metrics empty">
        <Activity size={24} className="empty-icon" />
        <p>Tidak ada data kualitas</p>
      </div>
    );
  }

  const getOverallIcon = () => {
    switch (quality.overall_status) {
      case 'healthy':
        return <CheckCircle size={40} className="status-icon healthy" />;
      case 'warning':
        return <AlertTriangle size={40} className="status-icon warning" />;
      case 'critical':
        return <XCircle size={40} className="status-icon critical" />;
    }
  };

  const getOverallColor = () => {
    switch (quality.overall_status) {
      case 'healthy':
        return 'var(--success)';
      case 'warning':
        return 'var(--warning)';
      case 'critical':
        return 'var(--error)';
    }
  };

  const getOverallLabel = () => {
    switch (quality.overall_status) {
      case 'healthy':
        return 'Sehat';
      case 'warning':
        return 'Peringatan';
      case 'critical':
        return 'Kritis';
    }
  };

  const getMetricIcon = (status: QualityMetric['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle size={14} />;
      case 'warning':
        return <AlertTriangle size={14} />;
      case 'critical':
        return <XCircle size={14} />;
    }
  };

  return (
    <div className="quality-metrics">
      <div className="quality-header">
        <div className="quality-score-ring" style={{ '--score-color': getOverallColor() } as React.CSSProperties}>
          <svg viewBox="0 0 36 36" className="quality-ring-svg">
            <path
              className="quality-ring-bg"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="quality-ring-fill"
              strokeDasharray={`${quality.score}, 100`}
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="quality-score-value" style={{ color: getOverallColor() }}>
            {quality.score}%
          </div>
        </div>
        <div className="quality-info">
          <div className="quality-status">
            {getOverallIcon()}
            <span style={{ color: getOverallColor() }}>{getOverallLabel()}</span>
          </div>
          <div className="quality-summary-counts">
            <span className="count healthy">{quality.summary.healthy_count} sehat</span>
            <span className="count warning">{quality.summary.warning_count} peringatan</span>
            <span className="count critical">{quality.summary.critical_count} kritis</span>
          </div>
        </div>
      </div>

      <div className="quality-metrics-list">
        {quality.metrics?.map((metric, index) => (
          <div key={index} className={`quality-metric-item ${metric.status}`}>
            <div className="quality-metric-icon">{getMetricIcon(metric.status)}</div>
            <div className="quality-metric-info">
              <span className="quality-metric-name">{metric.name}</span>
              <span className="quality-metric-description">{metric.description}</span>
            </div>
            <div className="quality-metric-value">{metric.value}</div>
          </div>
        ))}
      </div>

      {quality.metrics && quality.metrics.length > 0 && (
        <div className="quality-recommendations">
          {quality.metrics
            .filter((m) => m.recommendations && m.recommendations.length > 0)
            .slice(0, 2)
            .map((m, i) => (
              <div key={i} className="recommendation">
                <AlertTriangle size={12} />
                <span>{m.recommendations![0]}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
