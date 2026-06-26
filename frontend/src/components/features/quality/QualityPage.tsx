import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle,
  Database,
  Filter,
  GitCompare,
  RefreshCw,
  Search,
  ShieldCheck,
  TimerReset,
  XCircle,
} from 'lucide-react';
import { Header } from '../../layout/Header/Header';
import { Tile } from '../../common/Tile/Tile';
import { Badge } from '../../common/Badge/Badge';
import {
  getDuplicateGroups,
  getMachineDrift,
  getQualityReportDetail,
  getQualitySummary,
  getUnmappedQueue,
  qualityStatus,
} from '../../../services/quality-service';
import { getOperationalMachines } from '../../../services/machine-service';

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatTime(value: unknown) {
  if (!value) return '-';
  return new Date(String(value)).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function QualityPage() {
  const [days, setDays] = useState(30);
  const [machineFilter, setMachineFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ['quality-summary', days],
    queryFn: () => getQualitySummary(days),
    refetchInterval: 60000,
  });

  const { data: unmapped, refetch: refetchUnmapped } = useQuery({
    queryKey: ['quality-unmapped', days, machineFilter],
    queryFn: () => getUnmappedQueue(days, machineFilter),
  });

  const { data: duplicates, refetch: refetchDuplicates } = useQuery({
    queryKey: ['quality-duplicates', days, machineFilter],
    queryFn: () => getDuplicateGroups(days, machineFilter),
  });

  const { data: report } = useQuery({
    queryKey: ['quality-report-detail', days],
    queryFn: () => getQualityReportDetail(days),
  });

  const { data: drift } = useQuery({
    queryKey: ['quality-machine-drift'],
    queryFn: () => getMachineDrift(3600),
    refetchInterval: 60000,
  });

  const { data: machines } = useQuery({
    queryKey: ['operational-machines', 'quality'],
    queryFn: () => getOperationalMachines(),
    staleTime: 60000,
  });

  const filteredUnmapped = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const items = (unmapped?.items ?? []) as Array<Record<string, unknown>>;
    if (!needle) return items;
    return items.filter((item) =>
      String(item.raw_device_user_id ?? '').toLowerCase().includes(needle) ||
      String(item.machines ?? item.machine_code ?? '').toLowerCase().includes(needle) ||
      String(item.mapping_status ?? '').toLowerCase().includes(needle)
    );
  }, [unmapped, search]);

  const duplicateItems = (duplicates?.items ?? []) as Array<Record<string, unknown>>;
  const batchRows = report?.batch_summary ?? [];
  const status = summary ? qualityStatus(summary.qualityScore) : 'WARNING';

  const refreshAll = () => {
    refetch();
    refetchUnmapped();
    refetchDuplicates();
  };

  return (
    <>
      <Header
        title="Data Quality Center"
        subtitle={`Mapping, duplikat, batch, dan stale data ${days} hari terakhir.`}
        onRefresh={refreshAll}
        isRefreshing={isLoading}
      />

      <div className="app-content">
        <section className="quality-score-grid">
          <div className={`quality-score-hero ${status.toLowerCase()}`}>
            <span>Quality Score</span>
            <strong>{summary?.qualityScore ?? 0}%</strong>
            <p>{status}</p>
          </div>
          <div className="quality-score-card">
            <CheckCircle size={18} />
            <strong>{summary?.mappedRate ?? 0}%</strong>
            <span>Mapped Rate</span>
          </div>
          <div className="quality-score-card warning">
            <AlertTriangle size={18} />
            <strong>{summary?.unmappedCount ?? 0}</strong>
            <span>Unmapped</span>
          </div>
          <div className="quality-score-card info">
            <ShieldCheck size={18} />
            <strong>{summary?.syncSuccessRate ?? 0}%</strong>
            <span>Sync Success</span>
          </div>
          <div className="quality-score-card danger">
            <GitCompare size={18} />
            <strong>{duplicates?.duplicate_groups ?? 0}</strong>
            <span>Duplicate Groups</span>
          </div>
        </section>

        <section className="quality-filter-bar">
          <Filter size={16} />
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>7 hari</option>
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
          </select>
          <select value={machineFilter} onChange={(event) => setMachineFilter(event.target.value)}>
            <option value="">Semua Mesin</option>
            {(machines ?? []).map((machine) => (
              <option key={machine.machineCode} value={machine.machineCode}>{machine.machineCode} - {machine.locationName}</option>
            ))}
          </select>
          <div className="quality-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari raw ID, mesin, mapping status..." />
          </div>
        </section>

        <div className="quality-center-grid">
          <Tile title="Unmapped Queue" subtitle={`${unmapped?.total_unmapped ?? 0} raw device ID perlu review`} icon={<AlertTriangle size={16} />}>
            <div className="quality-table-wrap">
              <table className="data-table quality-table">
                <thead>
                  <tr>
                    <th>Raw Device ID</th>
                    <th>Machines</th>
                    <th>Status</th>
                    <th>Scans</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnmapped.slice(0, 25).map((item) => (
                    <tr key={`${item.raw_device_user_id}-${item.mapping_status}`}>
                      <td className="mono">{String(item.raw_device_user_id ?? '-')}</td>
                      <td>{String(item.machines ?? item.machine_code ?? '-')}</td>
                      <td><Badge variant="warning">{String(item.mapping_status ?? 'UNMAPPED')}</Badge></td>
                      <td>{numberValue(item.occurrence_count)}</td>
                      <td>{formatTime(item.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUnmapped.length === 0 && <div className="empty-state"><p>Tidak ada unmapped record untuk filter ini</p></div>}
            </div>
          </Tile>

          <div className="quality-side-stack">
            <Tile title="Duplicate Scans" subtitle={`${duplicates?.extra_records ?? 0} extra records`} icon={<GitCompare size={16} />}>
              <div className="quality-list">
                {duplicateItems.slice(0, 8).map((item) => (
                  <div key={`${item.raw_device_user_id}-${item.machine_code}-${item.scan_date}`} className="quality-list-item">
                    <div>
                      <strong>{String(item.raw_device_user_id ?? '-')}</strong>
                      <span>{String(item.machine_code ?? '-')} · {String(item.scan_date ?? '-')}</span>
                    </div>
                    <Badge variant="warning">{numberValue(item.scan_count)} scans</Badge>
                  </div>
                ))}
                {duplicateItems.length === 0 && <div className="empty-state"><p>Tidak ada duplicate group</p></div>}
              </div>
            </Tile>

            <Tile title="Machine Drift" subtitle="Sinkronisasi lebih dari 1 jam" icon={<TimerReset size={16} />}>
              <div className="quality-drift-summary">
                <div><strong>{drift?.synced_machines ?? 0}</strong><span>Synced</span></div>
                <div><strong>{drift?.drifted_machines ?? 0}</strong><span>Drifted</span></div>
                <div><strong>{drift?.total_machines ?? 0}</strong><span>Total</span></div>
              </div>
            </Tile>
          </div>
        </div>

        <div className="quality-bottom-grid">
          <Tile title="Batch Integrity" icon={<Database size={16} />}>
            <div className="quality-list">
              {batchRows.map((batch) => (
                <div key={batch.status} className="quality-list-item">
                  <div>
                    <strong>{batch.status}</strong>
                    <span>{numberValue(batch.total_records).toLocaleString('id-ID')} total records</span>
                  </div>
                  <Badge variant={batch.status === 'FAILED' ? 'error' : 'success'}>
                    {batch.batch_count} batch
                  </Badge>
                </div>
              ))}
              {batchRows.length === 0 && <div className="empty-state"><p>Belum ada batch summary</p></div>}
            </div>
          </Tile>

          <Tile title="Quality Formula" icon={<ShieldCheck size={16} />}>
            <div className="quality-formula">
              <p>Score menggabungkan mapped rate, sync success rate, duplicate rate, dan machine online rate.</p>
              <div>
                <span>Mapped</span><strong>{summary?.mappedRate ?? 0}%</strong>
              </div>
              <div>
                <span>Sync</span><strong>{summary?.syncSuccessRate ?? 0}%</strong>
              </div>
              <div>
                <span>Duplicate</span><strong>{summary?.duplicateRate ?? 0}%</strong>
              </div>
              <div>
                <span>Invalid Timestamp</span><strong>{summary?.invalidTimestampCount ?? 0}</strong>
              </div>
            </div>
          </Tile>

          <Tile title="Action Path" icon={<XCircle size={16} />}>
            <div className="quality-action-path">
              <p>Mapping review harus mencatat raw device ID, mesin, suggested employee code, reviewer, dan alasan perubahan di audit trail.</p>
              <button className="btn btn-outline btn-sm" disabled>Mapping Review</button>
            </div>
          </Tile>
        </div>
      </div>
    </>
  );
}
