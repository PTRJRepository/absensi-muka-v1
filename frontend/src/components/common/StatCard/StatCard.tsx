import type { ReactNode } from 'react';
import type { MachineStatusVariant } from '../../../types';

interface StatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  variant?: MachineStatusVariant;
}

export function StatCard({ icon, value, label, variant = 'primary' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className={`stat-card-icon ${variant}`}>{icon}</div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
