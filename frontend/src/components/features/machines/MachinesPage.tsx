import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  MapPin,
  Monitor,
  Network,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { getToken } from '../../../lib/api';
import { getOperationalMachines, syncAllMachines, syncMachine } from '../../../services/machine-service';
import type { Machine, MachineOperationalStatus, MachineOperationalStatusCode, SchedulerInfo } from '../../../types';
import { MachineDetailModal } from './components/MachineDetailModal';

type StatusFilter = 'all' | 'online' | 'offline';

const SEVERITY_GROUPS: Array<{
  key: string;
  title: string;
  subtitle: string;
  statuses: MachineOperationalStatusCode[];
}> = [
  {
    key: 'online',
    title: 'Online',
    subtitle: 'Mesin dapat diakses (termasuk warning/stale)',
    statuses: ['ONLINE', 'WARNING', 'STALE'],
  },
  {
    key: 'offline',
    title: 'Offline',
    subtitle: 'Port blocked, unreachable, atau offline',
    statuses: ['BLOCKED', 'UNREACHABLE', 'OFFLINE', 'DISABLED'],
  },
];

const STATUS_LABEL: Record<MachineOperationalStatusCode, string> = {
  ONLINE: 'Online',
  WARNING: 'Online',
  BLOCKED: 'Offline',
  UNREACHABLE: 'Offline',
  OFFLINE: 'Offline',
  DISABLED: 'Offline',
  STALE: 'Online',
};

function statusClass(status: MachineOperationalStatusCode) {
  if (status === 'ONLINE' || status === 'WARNING' || status === 'STALE') return 'online';
  return 'offline';
}

function statusIcon(status: MachineOperationalStatusCode) {
  if (status === 'ONLINE') return <Wifi size={14} />;
  if (status === 'BLOCKED' || status === 'UNREACHABLE' || status === 'OFFLINE') return <WifiOff size={14} />;
  if (status === 'DISABLED') return <Wrench size={14} />;
  return <AlertTriangle size={14} />;
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

function toLegacyMachine(machine: MachineOperationalStatus): Machine {
  const legacyStatus = machine.status === 'ONLINE' ? 'ONLINE' : machine.status === 'WARNING' || machine.status === 'STALE' ? 'WARNING' : 'OFFLINE';
  const accessStatus = machine.status === 'ONLINE'
    ? 'ACCESSIBLE'
    : machine.status === 'STALE' || machine.status === 'WARNING'
      ? 'TIMEOUT'
      : machine.accessStatus;

  return {
    machine_code: machine.machineCode,
    machine_name: machine.machineName,
    location_name: machine.locationName,
    status: legacyStatus,
    access_status: accessStatus,
    ip_address: machine.ipAddress,
    port: machine.port,
    is_active: machine.status !== 'DISABLED',
    last_sync_at: machine.lastSyncAt,
    scan_count_1h: machine.scan1h,
    user_count: machine.userCount,
    data_source: machine.dataSource,
  };
}

export function MachinesPage() {
  const queryClient = useQueryClient();
  const [selectedMachine, setSelectedMachine] = useState<MachineOperationalStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const canRunMachineActions = Boolean(getToken());

  const {
    data: machines = [],
    isLoading,
    refetch,
  } = useQuery<MachineOperationalStatus[]>({
    queryKey: ['operational-machines'],
    queryFn: () => getOperationalMachines(),
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });

  const { data: scheduler } = useQuery<SchedulerInfo>({
    queryKey: ['scheduler-status'],
    queryFn: () => api<SchedulerInfo>('/api/scheduler/status'),
    refetchInterval: 15000,
  });

  const syncAll = useMutation({
    mutationFn: () => syncAllMachines(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduler-status'] });
      queryClient.invalidateQueries({ queryKey: ['operational-machines'] });
    },
  });

  const syncOne = useMutation({
    mutationFn: (code: string) => syncMachine(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduler-status'] });
      queryClient.invalidateQueries({ queryKey: ['operational-machines'] });
    },
  });

  const testConnection = useMutation({
    mutationFn: async (machine: MachineOperationalStatus) => {
      const result = await api<{ success?: boolean; error?: string; message?: string }>(
        `/api/machines/${encodeURIComponent(machine.machineCode)}/test-connection`,
        { method: 'POST' }
      );
      return { machineCode: machine.machineCode, result };
    },
    onSuccess: ({ machineCode, result }) => {
      setTestResult((prev) => ({
        ...prev,
        [machineCode]: result.success === false ? result.error ?? 'Test gagal' : result.message ?? 'Koneksi OK',
      }));
      queryClient.invalidateQueries({ queryKey: ['operational-machines'] });
    },
    onError: (error, machine) => {
      setTestResult((prev) => ({
        ...prev,
        [machine.machineCode]: error instanceof Error ? error.message : 'Test koneksi gagal',
      }));
    },
  });

  const filteredMachines = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return machines.filter((machine) => {
      const matchesStatus = statusFilter === 'all' || statusClass(machine.status) === statusFilter;
      const matchesSearch = !needle ||
        machine.machineCode.toLowerCase().includes(needle) ||
        machine.machineName.toLowerCase().includes(needle) ||
        machine.locationName.toLowerCase().includes(needle) ||
        machine.ipAddress.includes(needle) ||
        machine.networkGroup.toLowerCase().includes(needle);
      return matchesStatus && matchesSearch;
    });
  }, [machines, searchQuery, statusFilter]);

  const groupedBySeverity = useMemo(() => {
    return SEVERITY_GROUPS.map((group) => ({
      ...group,
      machines: filteredMachines.filter((machine) => group.statuses.includes(machine.status)),
    })).filter((group) => group.machines.length > 0 || statusFilter === 'all');
  }, [filteredMachines, statusFilter]);

  const groupedByNetwork = useMemo(() => {
    return filteredMachines.reduce<Record<string, MachineOperationalStatus[]>>((acc, machine) => {
      acc[machine.networkGroup] = acc[machine.networkGroup] ?? [];
      acc[machine.networkGroup].push(machine);
      return acc;
    }, {});
  }, [filteredMachines]);

  const counts = useMemo(() => ({
    total: machines.length,
    online: machines.filter((m) => m.status === 'ONLINE').length,
    critical: machines.filter((m) => ['BLOCKED', 'UNREACHABLE', 'OFFLINE'].includes(m.status)).length,
    warning: machines.filter((m) => ['WARNING', 'STALE'].includes(m.status)).length,
    disabled: machines.filter((m) => m.status === 'DISABLED').length,
    users: machines.reduce((sum, machine) => sum + machine.userCount, 0),
    scans: machines.reduce((sum, machine) => sum + machine.scanToday, 0),
  }), [machines]);

  const selectedLegacyMachine = selectedMachine ? toLegacyMachine(selectedMachine) : null;

  return (
    <>
      <div className="app-content">
        <header className="machine-page-header">
          <div>
            <div className="machine-page-title">
              <Monitor size={34} />
              <h1>Mesin Absensi (ZKTeco)</h1>
            </div>
            <p className="machine-page-subtitle">
              Severity-first monitoring untuk {counts.total} mesin absensi dan jalur jaringan.
            </p>
          </div>
          <div className="machine-header-actions">
            <button className="btn-organic btn-organic-secondary" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              className="btn-organic btn-organic-primary"
              onClick={() => syncAll.mutate()}
              disabled={syncAll.isPending || !canRunMachineActions}
              title={canRunMachineActions ? 'Sinkronkan semua mesin' : 'Login dibutuhkan'}
            >
              <Play size={16} />
              {syncAll.isPending ? 'Menyinkronkan...' : 'Sync Semua'}
            </button>
          </div>
        </header>

        <section className="stats-overview">
          <div className="stat-card-organic">
            <div className="stat-card-organic-header">
              <div className="stat-card-organic-icon green"><Wifi size={20} /></div>
              <span className="stat-card-organic-label">Online</span>
            </div>
            <div className="stat-card-organic-value">{counts.online} / {counts.total}</div>
            <div className="stat-card-organic-trend">{scheduler?.status === 'SYNCING' ? 'Scheduler sync' : 'Monitoring aktif'}</div>
          </div>
          <div className="stat-card-organic">
            <div className="stat-card-organic-header">
              <div className="stat-card-organic-icon yellow"><ShieldAlert size={20} /></div>
              <span className="stat-card-organic-label">Critical</span>
            </div>
            <div className="stat-card-organic-value">{counts.critical}</div>
            <div className="stat-card-organic-trend">Blocked / unreachable / offline</div>
          </div>
          <div className="stat-card-organic">
            <div className="stat-card-organic-header">
              <div className="stat-card-organic-icon blue"><Database size={20} /></div>
              <span className="stat-card-organic-label">User Mesin</span>
            </div>
            <div className="stat-card-organic-value">{counts.users.toLocaleString('id-ID')}</div>
            <div className="stat-card-organic-trend">Terdaftar dari device</div>
          </div>
          <div className="stat-card-organic">
            <div className="stat-card-organic-header">
              <div className="stat-card-organic-icon yellow"><Activity size={20} /></div>
              <span className="stat-card-organic-label">Scan Hari Ini</span>
            </div>
            <div className="stat-card-organic-value">{counts.scans.toLocaleString('id-ID')}</div>
            <div className="stat-card-organic-trend">{counts.warning} warning, {counts.disabled} disabled</div>
          </div>
        </section>

        <div className="filters-bar machine-noc-filters">
          <div className="search-input-wrap">
            <Search size={18} />
            <input
              type="text"
              placeholder="Cari kode, lokasi, IP, atau network..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="filter-chips">
            <button className={`chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>Semua</button>
            <button className={`chip ${statusFilter === 'online' ? 'active' : ''}`} onClick={() => setStatusFilter('online')}>Online</button>
            <button className={`chip ${statusFilter === 'offline' ? 'active' : ''}`} onClick={() => setStatusFilter('offline')}>Offline</button>
          </div>
        </div>

        {isLoading ? (
          <div className="machine-grid">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="machine-card" style={{ cursor: 'default' }}>
                <div className="skeleton" style={{ height: 18, width: '55%', marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 14, width: '80%', marginBottom: 20 }} />
                <div className="skeleton" style={{ height: 52 }} />
              </div>
            ))}
          </div>
        ) : filteredMachines.length === 0 ? (
          <div className="empty-state">
            <Monitor size={40} />
            <p>Tidak ada mesin sesuai filter</p>
          </div>
        ) : (
          <div className="machine-noc-layout">
            <section className="machine-noc-wall">
              {groupedBySeverity.map((group) => (
                <div key={group.key} className={`machine-severity-group ${group.key}`}>
                  <div className="machine-severity-header">
                    <div>
                      <h2>{group.title}</h2>
                      <p>{group.subtitle}</p>
                    </div>
                    <span>{group.machines.length}</span>
                  </div>

                  <div className="machine-grid noc">
                    {group.machines.map((machine) => (
                      <article
                        key={machine.machineCode}
                        className={`machine-card machine-noc-card ${machine.status.toLowerCase()}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedMachine(machine)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            setSelectedMachine(machine);
                          }
                        }}
                      >
                        <div className="machine-card-header">
                          <div className="machine-info">
                            <h3>{machine.machineCode}</h3>
                            <div className="machine-location">
                              <MapPin size={14} />
                              {machine.locationName}
                            </div>
                          </div>
                          <span className={`status-badge-organic ${statusClass(machine.status)}`}>
                            <span className="status-dot-animated" />
                            {STATUS_LABEL[machine.status]}
                          </span>
                        </div>

                        <span className="machine-ip">{machine.ipAddress} : {machine.port}</span>
                        <p className="machine-health-message">{machine.healthMessage ?? `${machine.networkGroup} - ${machine.accessStatus}`}</p>

                        <div className="machine-stats">
                          <div className="machine-stat">
                            <div className="machine-stat-value">{machine.dbRecordCount ?? 0}</div>
                            <div className="machine-stat-label">DB record</div>
                          </div>
                          <div className="machine-stat">
                            <div className="machine-stat-value">{machine.userCount || 0}</div>
                            <div className="machine-stat-label">Karyawan</div>
                          </div>
                          <div className="machine-stat">
                            <div className="machine-stat-value">{machine.scanToday}</div>
                            <div className="machine-stat-label">Scan hari ini</div>
                          </div>
                        </div>

                        <div className="machine-footer">
                          <span className="last-sync">Last sync: <strong>{formatTime(machine.lastSyncAt)}</strong></span>
                          <div className="machine-card-actions">
                            <button
                              className="btn-organic btn-organic-secondary btn-organic-icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                testConnection.mutate(machine);
                              }}
                              disabled={testConnection.isPending || !canRunMachineActions}
                              title={canRunMachineActions ? 'Test koneksi' : 'Login dibutuhkan'}
                            >
                              {statusIcon(machine.status)}
                            </button>
                            <button
                              className="btn-organic btn-organic-secondary btn-organic-icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                syncOne.mutate(machine.machineCode);
                              }}
                              disabled={syncOne.isPending || !canRunMachineActions}
                              title={canRunMachineActions ? 'Sinkronkan mesin' : 'Login dibutuhkan'}
                            >
                              <RefreshCw size={14} className={syncOne.isPending ? 'animate-spin' : ''} />
                            </button>
                          </div>
                        </div>

                        {testResult[machine.machineCode] && (
                          <div className="machine-action-result">{testResult[machine.machineCode]}</div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <aside className="machine-topology-panel">
              <div className="machine-topology-header">
                <Network size={18} />
                <div>
                  <h2>Network Topology</h2>
                  <p>Group operasional mesin</p>
                </div>
              </div>
              <div className="machine-topology-list">
                {Object.entries(groupedByNetwork).map(([network, items]) => {
                  const critical = items.filter((m) => ['BLOCKED', 'UNREACHABLE', 'OFFLINE'].includes(m.status)).length;
                  const healthy = items.filter((m) => m.status === 'ONLINE').length;
                  return (
                    <div key={network} className="machine-topology-group">
                      <div className="machine-topology-group-head">
                        <strong>{network}</strong>
                        <span>{healthy}/{items.length} online</span>
                      </div>
                      <div className="ops-machine-chips">
                        {items.map((machine) => (
                          <button
                            key={machine.machineCode}
                            className={`ops-chip ${machine.status.toLowerCase()}`}
                            onClick={() => setSelectedMachine(machine)}
                            title={`${machine.machineCode}: ${STATUS_LABEL[machine.status]}`}
                          >
                            {machine.machineCode}
                          </button>
                        ))}
                      </div>
                      {critical > 0 && <p className="machine-topology-alert"><AlertTriangle size={13} /> {critical} critical</p>}
                    </div>
                  );
                })}
              </div>

              <div className="machine-topology-footer">
                <Clock size={14} />
                Scheduler: {scheduler?.status ?? 'IDLE'}
              </div>
            </aside>
          </div>
        )}
      </div>

      <MachineDetailModal
        machine={selectedLegacyMachine}
        isOpen={!!selectedMachine}
        onClose={() => setSelectedMachine(null)}
      />
    </>
  );
}
