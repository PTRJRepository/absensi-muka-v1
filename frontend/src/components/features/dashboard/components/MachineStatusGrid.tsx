import { Monitor, Wifi, WifiOff, AlertCircle, ShieldOff, Ban, RefreshCw } from 'lucide-react';
import type { Machine } from '../../../../types';

interface MachineStatusGridProps {
  machines: Machine[];
  onMachineClick?: (machine: Machine) => void;
  compact?: boolean;
}

export type GridStatus = 'ONLINE' | 'WARNING' | 'BLOCKED' | 'UNREACHABLE' | 'OFFLINE' | 'DISABLED' | 'STALE';

export function MachineStatusGrid({ machines, onMachineClick, compact = false }: MachineStatusGridProps) {
  const getMachineStatus = (machine: Machine): GridStatus => {
    // 1. Check if disabled
    if (!machine.is_active) return 'DISABLED';

    // 2. Check access_status for BLOCKED / UNREACHABLE
    const access = (machine.access_status ?? '').toUpperCase();
    if (access === 'PORT_BLOCKED') return 'BLOCKED';
    if (access === 'NETWORK_UNREACHABLE') return 'UNREACHABLE';
    if (access === 'OFFLINE') return 'OFFLINE';

    // 3. Check display_status override (from enriched API response)
    const display = (machine.display_status ?? '').toUpperCase();
    if (display && ['ONLINE', 'WARNING', 'BLOCKED', 'UNREACHABLE', 'OFFLINE', 'DISABLED', 'STALE'].includes(display)) {
      return display as GridStatus;
    }

    // 4. Check live_status for actual connection state
    const live = (machine.live_status ?? '').toUpperCase();
    if (live === 'ONLINE') return 'ONLINE';
    if (live === 'OFFLINE') return 'OFFLINE';

    // 5. Check sync freshness
    const sync = (machine.sync_status ?? '').toUpperCase();
    if (sync === 'STALE' || sync === 'NEVER_SYNCED' || sync === 'SYNC_FAILED') return 'STALE';

    // 6. Check legacy status field
    const legacy = (machine.status ?? '').toUpperCase();
    if (legacy === 'WARNING') return 'WARNING';
    if (legacy === 'ONLINE') {
      // Check sync age from last_sync_at
      if (machine.last_sync_at) {
        const ageMs = Date.now() - new Date(machine.last_sync_at).getTime();
        if (ageMs > 60 * 60 * 1000) return 'STALE'; // > 60 min
      }
      // Check quality score
      const quality = machine.quality_score ?? 100;
      if (quality < 80) return 'WARNING';
      return 'ONLINE';
    }

    // 7. Fallback: check last_sync_at age for ACCESSIBLE machines
    if (access === 'ACCESSIBLE' && machine.last_sync_at) {
      const ageMs = Date.now() - new Date(machine.last_sync_at).getTime();
      if (ageMs > 60 * 60 * 1000) return 'STALE';
    }

    return 'OFFLINE';
  };

  const getStatusIcon = (status: GridStatus) => {
    switch (status) {
      case 'ONLINE':
        return <Wifi size={16} />;
      case 'WARNING':
        return <AlertCircle size={16} />;
      case 'BLOCKED':
        return <Ban size={16} />;
      case 'UNREACHABLE':
        return <ShieldOff size={16} />;
      case 'OFFLINE':
        return <WifiOff size={16} />;
      case 'DISABLED':
        return <Ban size={16} />;
      case 'STALE':
        return <RefreshCw size={16} />;
    }
  };

  const getStatusColor = (status: GridStatus): string => {
    switch (status) {
      case 'ONLINE':
        return 'var(--success)';
      case 'WARNING':
        return 'var(--warning)';
      case 'BLOCKED':
        return 'var(--error)';
      case 'UNREACHABLE':
        return '#dc2626'; // red-600
      case 'OFFLINE':
        return '#991b1b'; // dark red
      case 'DISABLED':
        return 'var(--text-tertiary)';
      case 'STALE':
        return '#f97316'; // orange-500
    }
  };

  const getStatusLabel = (status: GridStatus): string => {
    switch (status) {
      case 'ONLINE': return 'Online';
      case 'WARNING': return 'Warning';
      case 'BLOCKED': return 'Blocked';
      case 'UNREACHABLE': return 'Unreachable';
      case 'OFFLINE': return 'Offline';
      case 'DISABLED': return 'Disabled';
      case 'STALE': return 'Stale';
    }
  };

  const getStatusClassName = (status: GridStatus): string => {
    switch (status) {
      case 'ONLINE': return 'online';
      case 'WARNING': return 'warning';
      case 'BLOCKED': return 'blocked';
      case 'UNREACHABLE': return 'unreachable';
      case 'OFFLINE': return 'offline';
      case 'DISABLED': return 'disabled';
      case 'STALE': return 'stale';
    }
  };

  if (compact) {
    return (
      <div className="machine-status-grid compact">
        {machines.slice(0, 12).map((machine) => {
          const status = getMachineStatus(machine);
          return (
            <div
              key={machine.machine_code}
              className={`machine-chip ${getStatusClassName(status)}`}
              onClick={() => onMachineClick?.(machine)}
              title={`${machine.machine_name}: ${getStatusLabel(status)}`}
            >
              <span className="machine-chip-dot" style={{ backgroundColor: getStatusColor(status) }} />
              <span className="machine-chip-name">{machine.machine_name}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="machine-status-grid full">
      {machines.map((machine) => {
        const status = getMachineStatus(machine);
        return (
          <div
            key={machine.machine_code}
            className={`machine-card ${getStatusClassName(status)}`}
            onClick={() => onMachineClick?.(machine)}
            role="button"
            tabIndex={0}
          >
            <div className="machine-card-header">
              <div className="machine-card-icon" style={{ color: getStatusColor(status) }}>
                <Monitor size={20} />
              </div>
              <div
                className="machine-status-badge"
                style={{ backgroundColor: `${getStatusColor(status)}20`, color: getStatusColor(status) }}
              >
                {getStatusIcon(status)}
                <span>{getStatusLabel(status)}</span>
              </div>
            </div>
            <div className="machine-card-name">{machine.machine_name}</div>
            <div className="machine-card-location">{machine.location_name}</div>
            <div className="machine-card-stats">
              <div className="machine-stat">
                <span className="machine-stat-value">{machine.scan_count_1h}</span>
                <span className="machine-stat-label">Scan/1j</span>
              </div>
              <div className="machine-stat">
                <span className="machine-stat-value">{machine.user_count}</span>
                <span className="machine-stat-label">User</span>
              </div>
            </div>
            {machine.last_sync_at && (
              <div className="machine-card-sync">
                Sync: {new Date(machine.last_sync_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
