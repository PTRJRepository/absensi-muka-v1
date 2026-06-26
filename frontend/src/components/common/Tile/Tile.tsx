import type { ReactNode } from 'react';

interface TileProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

export function Tile({ title, subtitle, icon, children, className = '', actions }: TileProps) {
  return (
    <div className={`tile ${className}`}>
      {title && (
        <div className="tile-header">
          {icon}
          <div className="tile-header-text">
            <span className="tile-title">{title}</span>
            {subtitle && <span className="tile-subtitle">{subtitle}</span>}
          </div>
          {actions}
        </div>
      )}
      <div className="tile-body">{children}</div>
    </div>
  );
}
