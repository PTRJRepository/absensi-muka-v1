import type { ReactNode } from 'react';
import { Wifi, WifiOff, Monitor } from 'lucide-react';
import type { MachineRecord, MachineInspectionTab } from '../types/machine.types';
import { SegmentedControl } from '../../../design-system/components';

function isOnlineStatus(status: MachineRecord['status']) {
  return status === 'ONLINE' || status === 'WARNING' || status === 'STALE';
}

interface MachineInspectorProps {
  machine: MachineRecord | null;
  activeTab: MachineInspectionTab;
  onTabChange: (tab: MachineInspectionTab) => void;
  children?: ReactNode;
}

const TABS: { value: MachineInspectionTab; label: string }[] = [
  { value: 'users', label: 'Users' },
  { value: 'scans', label: 'Scan Log' },
  { value: 'errors', label: 'Errors' },
  { value: 'mapping', label: 'Mapping' },
];

export function MachineInspector({ machine, activeTab, onTabChange, children }: MachineInspectorProps) {
  if (!machine) {
    return (
      <aside className="rb-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--rb-text-muted)', fontSize: 13, padding: 32 }}>
        Pilih mesin dari daftar
      </aside>
    );
  }

  return (
    <aside className="rb-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Machine header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Monitor size={16} style={{ color: 'var(--rb-gold)' }} />
          <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--rb-font-mono)' }}>
            {machine.machineCode}
          </span>
          <span
            className={`rb-badge ${isOnlineStatus(machine.status) ? 'rb-badge--present' : 'rb-badge--review'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
          >
            {isOnlineStatus(machine.status) ? <Wifi size={11} /> : <WifiOff size={11} />}
            {isOnlineStatus(machine.status) ? 'Online' : 'Offline'}
          </span>
        </div>

        <div style={{ fontSize: 13, fontWeight: 500 }}>{machine.machineName}</div>
        <div style={{ fontSize: 12, color: 'var(--rb-text-secondary)' }}>{machine.locationName}</div>
        <div style={{ fontSize: 11, color: 'var(--rb-text-muted)', fontFamily: 'var(--rb-font-mono)' }}>
          {machine.ipAddress}:{machine.port}
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--rb-text-muted)' }}>User</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{machine.userCount}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--rb-text-muted)' }}>Scan Hari Ini</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{machine.scanToday}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--rb-text-muted)' }}>Network</div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{machine.networkGroup}</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <SegmentedControl
        options={TABS}
        value={activeTab}
        onChange={onTabChange}
        ariaLabel="Tab inspeksi mesin"
      />

      {/* Tab content */}
      {children}
    </aside>
  );
}
