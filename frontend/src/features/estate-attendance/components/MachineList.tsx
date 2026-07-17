import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Wifi, WifiOff, MapPin } from 'lucide-react';
import { fetchMachines } from '../services/machine.service';
import type { MachineRecord } from '../types/machine.types';
import { Skeleton } from '../../../design-system/components';

type StatusFilter = 'all' | 'online' | 'offline';

function isOnlineStatus(status: MachineRecord['status']) {
  return status === 'ONLINE' || status === 'WARNING' || status === 'STALE';
}

function formatTime(value: string | null) {
  if (!value) return 'Belum pernah';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface MachineListProps {
  onSelect: (machine: MachineRecord) => void;
}

export function MachineList({ onSelect }: MachineListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: machines = [], isLoading } = useQuery<MachineRecord[]>({
    queryKey: ['estate-machine-list'],
    queryFn: fetchMachines,
    refetchInterval: 60000,
  });

  const filtered = machines.filter((m) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'online' && isOnlineStatus(m.status)) ||
      (statusFilter === 'offline' && !isOnlineStatus(m.status));

    const needle = search.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      m.machineCode.toLowerCase().includes(needle) ||
      m.machineName.toLowerCase().includes(needle) ||
      m.locationName.toLowerCase().includes(needle) ||
      m.ipAddress.includes(needle);

    return matchesStatus && matchesSearch;
  });

  return (
    <aside className="rb-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
        <Monitor size={16} style={{ color: 'var(--rb-gold)' }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Mesin Absensi</span>
      </div>

      <div className="rb-search">
        <input
          type="text"
          placeholder="Cari mesin…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {(['all', 'online', 'offline'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            className={`rb-badge ${statusFilter === f ? 'rb-badge--present' : ''}`}
            style={{ cursor: 'pointer', border: 'none', padding: '2px 8px', fontSize: 11 }}
            onClick={() => setStatusFilter(f)}
          >
            {f === 'all' ? 'Semua' : f === 'online' ? 'Online' : 'Offline'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', flex: 1 }}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 'var(--rb-radius-md)', background: 'var(--rb-surface-raised)', border: '1px solid var(--rb-border-subtle)' }}>
              <Skeleton width="55%" height={14} />
              <Skeleton width="75%" height={12} />
              <Skeleton height={32} />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--rb-text-muted)', padding: 24, fontSize: 13 }}>
            Tidak ada mesin.
          </div>
        ) : (
          filtered.map((machine) => (
            <article
              key={machine.machineCode}
              className="rb-panel"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(machine)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelect(machine);
              }}
              style={{
                cursor: 'pointer',
                padding: '10px 12px',
                borderRadius: 'var(--rb-radius-md)',
                border: `1px solid ${isOnlineStatus(machine.status) ? 'var(--rb-leaf)' : 'var(--rb-crimson)'}`,
                opacity: isOnlineStatus(machine.status) ? 1 : 0.72,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--rb-font-mono)' }}>
                  {machine.machineCode}
                </span>
                <span
                  className={`rb-badge ${isOnlineStatus(machine.status) ? 'rb-badge--present' : 'rb-badge--review'}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                >
                  {isOnlineStatus(machine.status) ? <Wifi size={10} /> : <WifiOff size={10} />}
                  {isOnlineStatus(machine.status) ? 'Online' : 'Offline'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--rb-text-secondary)', marginBottom: 6 }}>
                <MapPin size={11} />
                {machine.locationName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--rb-text-muted)' }}>
                {machine.ipAddress}:{machine.port}
              </div>
              <div style={{ fontSize: 10, color: 'var(--rb-text-muted)', marginTop: 4 }}>
                Sync: {formatTime(machine.lastSyncAt)}
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}
