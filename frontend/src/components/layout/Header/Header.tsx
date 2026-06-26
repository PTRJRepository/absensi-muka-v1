import { RefreshCw } from 'lucide-react';
import { SchedulerStatus } from '../../features/machines/SchedulerStatus';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, onRefresh, isRefreshing, actions }: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p style={{ fontSize: '13px', opacity: 0.75 }}>{subtitle}</p>}
      </div>
      <div className="header-actions">
        <SchedulerStatus />
        {actions}
        {onRefresh && (
          <button
            className="refresh-btn"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            {isRefreshing ? 'Menyegarkan...' : 'Segarkan'}
          </button>
        )}
      </div>
    </header>
  );
}
