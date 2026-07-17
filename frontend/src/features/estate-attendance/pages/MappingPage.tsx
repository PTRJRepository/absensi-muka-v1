import { useState } from 'react';
import { AppShell } from '../components/AppShell';
import '../../../design-system/rebinmas/estate-operations-grid.css';
import { MappingTable } from '../components/MappingTable';
import { SegmentedControl } from '../../../design-system/components';
import type { MappingStatus } from '../types/mapping.types';

export function MappingPage() {
  const [statusFilter, setStatusFilter] = useState<MappingStatus>('NEED_REVIEW');
  const [machineFilter, setMachineFilter] = useState('');

  return (
    <AppShell>
      <div>
        <div className="rb-title-row">
          <div>
            <h1 className="rb-title">Mapping Review</h1>
            <p className="rb-subtitle">Tinjau dan resolve raw identity → employee master mapping</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="rb-filterbar" style={{ marginBottom: 16 }}>
          <SegmentedControl
            options={[
              { value: 'NEED_REVIEW', label: 'Need Review' },
              { value: 'UNMAPPED', label: 'Unmapped' },
              { value: 'AMBIGUOUS', label: 'Ambiguous' },
              { value: 'MAPPED', label: 'Mapped' },
            ]}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as MappingStatus)}
            ariaLabel="Filter status mapping"
          />
          <input
            type="text"
            className="rb-search"
            placeholder="Filter mesin..."
            value={machineFilter}
            onChange={(e) => setMachineFilter(e.target.value)}
          />
        </div>

        {/* Guardrail notice */}
        <div style={{
          padding: '10px 14px',
          borderRadius: 'var(--rb-radius-md)',
          border: '1px solid rgba(212,154,66,.25)',
          background: 'rgba(212,154,66,.06)',
          color: 'var(--rb-gold)',
          fontSize: 12,
          marginBottom: 16,
        }}>
          Mapping changes are audit logged. Ambiguous mappings require explicit confirmation before saving.
        </div>

        {/* Table */}
        <MappingTable
          statusFilter={statusFilter}
          machineFilter={machineFilter}
        />
      </div>
    </AppShell>
  );
}
