import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Monitor,
  RefreshCw,
  TrendingUp,
  Wifi,
} from 'lucide-react';
import { Header } from '../../layout/Header/Header';
import { Tile } from '../../common/Tile/Tile';
import { KpiCard } from '../dashboard/components/KpiCard';
import { QualityMetrics } from '../dashboard/components/QualityMetrics';
import { getOperationalMachines } from '../../../services/machine-service';
import { getOpsIncidents, getOpsRecommendations, getOpsSummary } from '../../../services/ops-service';
import { getQualityReport } from '../../../services/quality-service';
import { SyncProgressPanel } from './SyncProgressPanel';
import type { MachineOperationalStatus, QualityReport } from '../../../types';

function machineGroupKey(machine: MachineOperationalStatus) {
  if (machine.status === 'ONLINE') return 'Healthy';
  if (machine.status === 'BLOCKED' || machine.status === 'UNREACHABLE') return 'Critical';
  if (machine.status === 'DISABLED') return 'Disabled';
  return 'Warning';
}

export function MonitoringDashboard() {
  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['ops-summary', 'monitoring'],
    queryFn: () => getOpsSummary(),
    refetchInterval: 30000,
  });

  const { data: machines, isLoading: machinesLoading, refetch: refetchMachines } = useQuery<MachineOperationalStatus[]>({
    queryKey: ['operational-machines', 'monitoring'],
    queryFn: () => getOperationalMachines(),
    refetchInterval: 30000,
  });

  const { data: quality } = useQuery<QualityReport>({
    queryKey: ['quality', 'monitoring'],
    queryFn: () => getQualityReport(),
    refetchInterval: 60000,
  });

  const { data: incidents } = useQuery({
    queryKey: ['ops-incidents', 'monitoring'],
    queryFn: () => getOpsIncidents(),
    refetchInterval: 30000,
  });

  const { data: recommendations } = useQuery({
    queryKey: ['ops-recommendations', 'monitoring'],
    queryFn: () => getOpsRecommendations(),
    refetchInterval: 60000,
  });

  const groupedMachines = (machines ?? []).reduce<Record<string, MachineOperationalStatus[]>>((acc, machine) => {
    const key = machineGroupKey(machine);
    acc[key] = acc[key] ?? [];
    acc[key].push(machine);
    return acc;
  }, {});

  const refreshAll = () => {
    refetchStats();
    refetchMachines();
  };

  return (
    <>
      <Header
        title="Monitoring Operasional"
        subtitle="Tampilan ringkas status mesin, kualitas data, dan insiden aktif."
        onRefresh={refreshAll}
        isRefreshing={statsLoading || machinesLoading}
      />

      <div className="app-content">
        <div className="kpi-grid">
          <KpiCard icon={<Monitor size={20} />} value={stats?.totalMachines ?? 0} label="Total Mesin" variant="primary" />
          <KpiCard icon={<Wifi size={20} />} value={stats?.onlineMachines ?? 0} label="Online" variant="success" />
          <KpiCard icon={<AlertTriangle size={20} />} value={stats?.blockedMachines ?? 0} label="Blocked" variant="error" />
          <KpiCard icon={<Activity size={20} />} value={stats?.scanToday ?? 0} label="Scan Hari Ini" variant="warning" />
          <KpiCard icon={<TrendingUp size={20} />} value={`${stats?.qualityScore ?? 0}%`} label="Quality Score" variant="success" />
          <KpiCard icon={<Clock size={20} />} value={stats?.lastSyncAt ? new Date(stats.lastSyncAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'} label="Last Sync" variant="info" />
        </div>

        <SyncProgressPanel />

        <div className="ops-command-grid">
          <Tile
            title="Monitoring Wall"
            subtitle="Prioritas mesin berdasarkan severity"
            icon={<Monitor size={16} />}
            actions={<a href="/mesin" style={{ fontSize: 12, color: 'var(--primary-accent)' }}>Mesin Absensi</a>}
          >
            {machinesLoading ? (
              <div className="loading-state"><RefreshCw size={22} className="spin" /><span>Memuat status mesin...</span></div>
            ) : (
              <div className="ops-network-list">
                {Object.entries(groupedMachines).map(([group, items]) => (
                  <div key={group} className={`ops-network-group ${group.toLowerCase()}`}>
                    <div>
                      <strong>{group}</strong>
                      <span>{items.length} mesin</span>
                    </div>
                    <div className="ops-machine-chips">
                      {items.map((machine) => (
                        <a key={machine.machineCode} href="/mesin" className={`ops-chip ${machine.status.toLowerCase()}`} title={machine.healthMessage ?? machine.status}>
                          {machine.machineCode}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(groupedMachines).length === 0 && <div className="empty-state"><p>Tidak ada data mesin</p></div>}
              </div>
            )}
          </Tile>

          <Tile title="Insiden Aktif" subtitle="Kondisi yang perlu investigasi" icon={<AlertTriangle size={16} />}>
            <div className="ops-incident-list">
              {(incidents ?? []).slice(0, 8).map((incident) => (
                <div key={incident.id} className={`ops-incident ${incident.severity.toLowerCase()}`}>
                  <strong>{incident.title}</strong>
                  <span>{incident.message}</span>
                </div>
              ))}
              {(!incidents || incidents.length === 0) && (
                <div className="empty-state">
                  <CheckCircle size={28} />
                  <p>Tidak ada insiden aktif</p>
                </div>
              )}
            </div>
          </Tile>
        </div>

        <div className="ops-command-grid secondary">
          <Tile title="Kualitas Data" subtitle="Mapping, batch, dan integritas scan" icon={<TrendingUp size={16} />}>
            <QualityMetrics quality={quality} loading={statsLoading} />
          </Tile>

          <Tile title="Rekomendasi Operator" icon={<CheckCircle size={16} />}>
            <div className="ops-recommendations">
              {(recommendations ?? []).map((item, index) => (
                <div key={item} className="ops-recommendation">
                  <span>{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
              {(!recommendations || recommendations.length === 0) && <div className="empty-state"><p>Tidak ada rekomendasi baru</p></div>}
            </div>
          </Tile>
        </div>
      </div>
    </>
  );
}
