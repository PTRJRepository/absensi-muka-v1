import { useQuery } from '@tanstack/react-query';
import { Header } from '../../layout/Header/Header';
import { KpiCard } from './components/KpiCard';
import { QualityMetrics } from './components/QualityMetrics';
import { Tile } from '../../common/Tile/Tile';
import {
  Monitor,
  Wifi,
  Users,
  ClipboardList,
  AlertTriangle,
  TrendingUp,
  Clock,
  Activity,
  ShieldCheck,
  ShieldOff,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import { getOperationalMachines } from '../../../services/machine-service';
import { getOpsIncidents, getOpsRecommendations, getOpsSummary } from '../../../services/ops-service';
import { getQualityReport } from '../../../services/quality-service';
import type { MachineOperationalStatus, QualityReport } from '../../../types';

function SkeletonCard() {
  return (
    <div className="kpi-card">
      <div className="skeleton" style={{ height: 44, width: 44, borderRadius: 10, marginBottom: 12 }}></div>
      <div className="skeleton" style={{ height: 32, width: 60, marginBottom: 8 }}></div>
      <div className="skeleton" style={{ height: 14, width: 80 }}></div>
    </div>
  );
}

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading, refetch } = useQuery({
    queryKey: ['ops-summary'],
    queryFn: () => getOpsSummary(),
    refetchInterval: 30000,
  });

  const { data: machines, isLoading: machinesLoading } = useQuery<MachineOperationalStatus[]>({
    queryKey: ['operational-machines'],
    queryFn: () => getOperationalMachines(),
    refetchInterval: 30000,
  });

  const { data: quality } = useQuery<QualityReport>({
    queryKey: ['quality'],
    queryFn: () => getQualityReport(),
    refetchInterval: 60000,
  });

  const { data: incidents } = useQuery({
    queryKey: ['ops-incidents'],
    queryFn: () => getOpsIncidents(),
    refetchInterval: 30000,
  });

  const { data: recommendations } = useQuery({
    queryKey: ['ops-recommendations'],
    queryFn: () => getOpsRecommendations(),
    refetchInterval: 60000,
  });

  // Compute summary counts from machines data (7-status classification)
  const totalMachines = machines?.length ?? 0;

  // Accessible: machines with access_status = ACCESSIBLE
  const accessibleCount = machines?.filter(
    (m) => (m.accessStatus ?? '').toUpperCase() === 'ACCESSIBLE'
  ).length ?? 0;

  // Live Online: machines with actual live connection (live_status = ONLINE)
  const liveOnlineCount = machines?.filter(
    (m) => (m.liveStatus ?? '').toUpperCase() === 'ONLINE'
  ).length ?? 0;

  // Port Blocked: machines with access_status = PORT_BLOCKED
  const portBlockedCount = machines?.filter(
    (m) => (m.accessStatus ?? '').toUpperCase() === 'PORT_BLOCKED'
  ).length ?? 0;

  // Network Unreachable: machines with access_status = NETWORK_UNREACHABLE
  const unreachableCount = machines?.filter(
    (m) => (m.accessStatus ?? '').toUpperCase() === 'NETWORK_UNREACHABLE'
  ).length ?? 0;

  // Stale Sync: machines with sync_status = STALE
  const staleSyncCount = machines?.filter(
    (m) => (m.syncStatus ?? '').toUpperCase() === 'STALE'
  ).length ?? 0;

  // Fallback: compute from ops-summary if available
  const displayAccessible = statsLoading ? undefined : (stats?.totalMachines ? accessibleCount : stats?.totalMachines);
  const displayLiveOnline = statsLoading ? undefined : (liveOnlineCount > 0 ? liveOnlineCount : stats?.onlineMachines);
  const displayBlocked = statsLoading ? undefined : (portBlockedCount > 0 ? portBlockedCount : stats?.blockedMachines);
  const displayUnreachable = statsLoading ? undefined : (unreachableCount > 0 ? unreachableCount : stats?.unreachableMachines);
  const displayStale = statsLoading ? undefined : (staleSyncCount > 0 ? staleSyncCount : stats?.staleMachines);

  const kpiCards = [
    {
      icon: <ShieldCheck size={20} />,
      value: displayAccessible ?? '—',
      label: 'Accessible',
      variant: 'success' as const,
      subtitle: `${displayAccessible ?? '—'} / ${totalMachines || (stats?.totalMachines ?? 16)}`,
    },
    {
      icon: <Wifi size={20} />,
      value: displayLiveOnline ?? '—',
      label: 'Live Online',
      variant: 'success' as const,
    },
    {
      icon: <ShieldOff size={20} />,
      value: displayBlocked ?? '—',
      label: 'Port Blocked',
      variant: 'error' as const,
    },
    {
      icon: <WifiOff size={20} />,
      value: displayUnreachable ?? '—',
      label: 'Network Unreachable',
      variant: 'error' as const,
    },
    {
      icon: <RefreshCw size={20} />,
      value: displayStale ?? '—',
      label: 'Stale Sync',
      variant: 'warning' as const,
    },
    {
      icon: <ClipboardList size={20} />,
      value: stats?.scanToday ?? '—',
      label: 'Scan Hari Ini',
      variant: 'warning' as const,
    },
    {
      icon: <Users size={20} />,
      value: stats?.totalEmployees ?? '—',
      label: 'User Mesin',
      variant: 'info' as const,
    },
    {
      icon: <TrendingUp size={20} />,
      value: `${stats?.qualityScore ?? 0}%`,
      label: 'Quality Score',
      variant: 'success' as const,
    },
  ];

  const groupedMachines = (machines ?? []).reduce<Record<string, MachineOperationalStatus[]>>((acc, machine) => {
    const key = machine.status === 'ONLINE'
      ? 'Online'
      : machine.status === 'STALE'
        ? 'Stale'
        : machine.status === 'WARNING'
          ? 'Warning'
          : 'Offline';
    acc[key] = acc[key] ?? [];
    acc[key].push(machine);
    return acc;
  }, {});

  return (
    <>
      <Header
        title="Absensi Ops Center"
        subtitle="Monitoring mesin, data absensi, mapping, dan kualitas sinkronisasi."
        onRefresh={() => refetch()}
        isRefreshing={statsLoading}
      />

      <div className="app-content">
        {/* KPI Cards Grid - 8 cards for 7-status classification */}
        <div className="kpi-grid">
          {statsLoading
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
            : kpiCards.map((card, i) => (
                <KpiCard key={i} {...card} />
              ))}
        </div>

        <div className="ops-command-grid">
          <Tile
            title="Topologi Operasional"
            subtitle="Network group dan status mesin prioritas"
            icon={<Monitor size={16} />}
            actions={<a href="/mesin" style={{ fontSize: 12, color: 'var(--primary-accent)' }}>Mesin NOC</a>}
          >
            {machinesLoading ? (
              <div className="empty-state"><p>Memuat mesin...</p></div>
            ) : (
              <div className="ops-network-list">
                {Object.entries(groupedMachines).map(([group, items]) => (
                  <div key={group} className={`ops-network-group ${group.toLowerCase()}`}>
                    <div>
                      <strong>{group}</strong>
                      <span>{items.length} mesin</span>
                    </div>
                    <div className="ops-machine-chips">
                      {items.slice(0, 8).map((machine) => (
                        <a key={machine.machineCode} href="/mesin" className={`ops-chip ${machine.status.toLowerCase()}`}>
                          {machine.machineCode}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Tile>

          <Tile
            title="Live Alert Feed"
            subtitle="Insiden aktif yang perlu dilihat operator"
            icon={<AlertTriangle size={16} />}
            actions={<a href="/notifikasi" style={{ fontSize: 12, color: 'var(--primary-accent)' }}>Semua</a>}
          >
            <div className="ops-incident-list">
              {(incidents ?? []).slice(0, 6).map((incident) => (
                <div key={incident.id} className={`ops-incident ${incident.severity.toLowerCase()}`}>
                  <strong>{incident.title}</strong>
                  <span>{incident.message}</span>
                </div>
              ))}
              {(!incidents || incidents.length === 0) && <div className="empty-state"><p>Tidak ada insiden aktif</p></div>}
            </div>
          </Tile>
        </div>

        <div className="ops-command-grid secondary">
          <Tile
            title="Kualitas Data"
            icon={<Activity size={16} />}
            actions={<a href="/laporan" style={{ fontSize: 12, color: 'var(--primary-accent)' }}>Data Quality</a>}
          >
            <QualityMetrics quality={quality} />
          </Tile>

          <Tile title="Rekomendasi Tindakan" icon={<Users size={16} />}>
            <div className="ops-recommendations">
              {(recommendations ?? []).map((item, index) => (
                <div key={index} className="ops-recommendation">
                  <span>{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </Tile>
        </div>

        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={14} />
          Sinkronisasi Terakhir: {stats?.lastSyncAt ? new Date(stats.lastSyncAt).toLocaleString('id-ID') : 'Belum pernah'}
        </div>
      </div>
    </>
  );
}
