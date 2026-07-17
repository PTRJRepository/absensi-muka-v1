import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import '../../../design-system/rebinmas/estate-operations-grid.css';
import { MachineList } from '../components/MachineList';
import { MachineInspector } from '../components/MachineInspector';
import { RawUserTable } from '../components/RawUserTable';
import { RawScanLogTable } from '../components/RawScanLogTable';
import type { MachineRecord, MachineInspectionTab } from '../types/machine.types';
import { SegmentedControl } from '../../../design-system/components';

const TABS: { value: MachineInspectionTab; label: string }[] = [
  { value: 'users', label: 'Users' },
  { value: 'scans', label: 'Scan Log' },
  { value: 'errors', label: 'Errors' },
  { value: 'mapping', label: 'Mapping' },
];

const ComingSoon = ({ label }: { label: string }) => (
  <div
    className="rb-panel"
    style={{
      padding: 32,
      textAlign: 'center',
      color: 'var(--rb-text-muted)',
      fontSize: 13,
      flex: 1,
    }}
  >
    {label} — coming soon
  </div>
);

export function MachineDataPage() {
  const [selectedMachine, setSelectedMachine] = useState<MachineRecord | null>(null);
  const [activeTab, setActiveTab] = useState<MachineInspectionTab>('users');

  return (
    <AppShell>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 14,
          minHeight: 'calc(100vh - 72px)',
          alignItems: 'stretch',
        }}
      >
        {/* Left: Machine list panel (280px) */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <MachineList onSelect={setSelectedMachine} />
        </div>

        {/* Center: Tab bar + tab content (flexible) */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minWidth: 0,
          }}
        >
          {/* Tab bar (only shown when machine selected) */}
          {selectedMachine && (
            <div className="rb-panel" style={{ padding: '10px 12px' }}>
              <SegmentedControl
                options={TABS}
                value={activeTab}
                onChange={setActiveTab}
                ariaLabel="Tab inspeksi mesin"
              />
            </div>
          )}

          {/* Tab content */}
          <div style={{ flex: 1 }}>
            {activeTab === 'users' && selectedMachine && (
              <RawUserTable machineCode={selectedMachine.machineCode} />
            )}
            {activeTab === 'scans' && selectedMachine && (
              <RawScanLogTable machineCode={selectedMachine.machineCode} />
            )}
            {activeTab === 'errors' && <ComingSoon label="Error log" />}
            {activeTab === 'mapping' && <ComingSoon label="Mapping summary" />}
            {!selectedMachine && (
              <div
                className="rb-panel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--rb-text-muted)',
                  fontSize: 13,
                  padding: 32,
                  textAlign: 'center',
                }}
              >
                Pilih mesin dari daftar untuk melihat detail.
              </div>
            )}
          </div>
        </div>

        {/* Right: Machine detail inspector (320px) */}
        <div style={{ width: 320, flexShrink: 0 }}>
          <MachineInspector
            machine={selectedMachine}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      </div>
    </AppShell>
  );
}
