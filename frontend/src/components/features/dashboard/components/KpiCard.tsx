import type { ReactNode } from 'react';
import type { MachineStatusVariant } from '../../../types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  variant?: MachineStatusVariant;
  trend?: number; // percentage change, positive = up, negative = down
  subtitle?: string;
  onClick?: () => void;
}

export function KpiCard({
  icon,
  value,
  label,
  variant = 'primary',
  trend,
  subtitle,
  onClick,
}: KpiCardProps) {
  const getTrendIcon = () => {
    if (trend === undefined || trend === 0) {
      return <Minus size={12} className="trend-icon neutral" />;
    }
    return trend > 0 ? (
      <TrendingUp size={12} className="trend-icon up" />
    ) : (
      <TrendingDown size={12} className="trend-icon down" />
    );
  };

  const getVariantColor = (): string => {
    switch (variant) {
      case 'success':
        return 'var(--success)';
      case 'warning':
        return 'var(--warning)';
      case 'error':
        return 'var(--error)';
      case 'info':
        return 'var(--info)';
      default:
        return 'var(--primary-accent)';
    }
  };

  return (
    <div
      className="kpi-card"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="kpi-header">
        <div className="kpi-icon" style={{ backgroundColor: `${getVariantColor()}15`, color: getVariantColor() }}>
          {icon}
        </div>
        {trend !== undefined && (
          <div className="kpi-trend">
            {getTrendIcon()}
            <span className={`trend-value ${trend > 0 ? 'up' : trend < 0 ? 'down' : 'neutral'}`}>
              {Math.abs(trend)}%
            </span>
          </div>
        )}
      </div>
      <div className="kpi-value" style={{ color: getVariantColor() }}>
        {value}
      </div>
      <div className="kpi-label">{label}</div>
      {subtitle && <div className="kpi-subtitle">{subtitle}</div>}
    </div>
  );
}
