interface StatusDotProps {
  status: 'online' | 'offline' | 'warning' | 'error' | 'syncing';
  label?: string;
}

export function StatusDot({ status, label }: StatusDotProps) {
  return (
    <span className={`status-dot ${status}`}>
      {label ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
