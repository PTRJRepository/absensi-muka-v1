import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { getMachineClockHealth, previewCorrection, applyCorrection } from '../../../services/quality-service';
import type { MachineClockHealth, CorrectionPreview } from '../../../types';
import { Button } from '../../common/Button/Button';
import { Badge } from '../../common/Badge/Badge';

const CLOCK_STATUS_COLORS: Record<string, string> = {
  OK: 'bg-green-100 text-green-800',
  UTC_MODE: 'bg-blue-100 text-blue-800',
  DRIFTED: 'bg-red-100 text-red-800',
  UNKNOWN: 'bg-gray-100 text-gray-800',
  NEEDS_MANUAL_CHECK: 'bg-yellow-100 text-yellow-800',
};

function formatHour(h: number): string {
  return h < 0 ? '-' : String(h).padStart(2, '0') + ':00';
}

export function MachineClockHealthPage() {
  const { data: machines = [], isLoading, refetch } = useQuery({
    queryKey: ['machine-clock-health'],
    queryFn: getMachineClockHealth,
    refetchInterval: 60000,
  });

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<CorrectionPreview | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);

  const previewMutation = useMutation({
    mutationFn: (machineCode: string) =>
      previewCorrection({ machineCode, dateFrom: '2026-06-01', dateTo: '2026-06-30', offsetMinutes: 420 }),
    onSuccess: (data) => { setPreviewData(data); setShowPreviewModal(true); },
  });

  const applyMutation = useMutation({
    mutationFn: (machineCode: string) =>
      applyCorrection({ machineCode, dateFrom: '2026-06-01', dateTo: '2026-06-30', offsetMinutes: 420, executedBy: 'HR_ADMIN', rebuildImports: true }),
    onSuccess: () => { setShowPreviewModal(false); setConfirmApply(false); setPreviewData(null); refetch(); },
  });

  if (isLoading) return <div className="p-6 text-gray-500">Memuat...</div>;

  const needsCorrection = machines.filter((m: MachineClockHealth) => m.needsCorrection);
  const healthy = machines.filter((m: MachineClockHealth) => !m.needsCorrection && m.clockStatus === 'OK');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Machine Clock Health</h1>
          <p className="text-gray-500 text-sm">{healthy.length} sehat · {needsCorrection.length} perlu koreksi</p>
        </div>
        <Button onClick={() => refetch()} variant="secondary">Refresh</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-3xl font-bold text-gray-700">{machines.length}</div>
          <div className="text-sm text-gray-500">Total Mesin</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-3xl font-bold text-green-600">{healthy.length}</div>
          <div className="text-sm text-gray-500">Sehat</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">{needsCorrection.length}</div>
          <div className="text-sm text-gray-500">UTC Mode</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <div className="text-3xl font-bold text-gray-500">{machines.filter((m: MachineClockHealth) => m.clockStatus === 'UNKNOWN').length}</div>
          <div className="text-sm text-gray-500">Unknown</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Mesin', 'Mode', 'Offset', 'Status', 'Scan', 'Jam Awal', 'Jam Akhir', 'Aksi'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {machines.map((m: MachineClockHealth) => (
              <tr key={m.machineCode} className={m.needsCorrection ? 'bg-blue-50' : ''}>
                <td className="px-4 py-3 font-medium">{m.machineCode}</td>
                <td className="px-4 py-3">{m.timezoneMode}</td>
                <td className="px-4 py-3">{m.offsetMinutes === 0 ? '-' : '+' + m.offsetMinutes + 'm'}</td>
                <td className="px-4 py-3">
                  <span className={'px-2 py-1 rounded-full text-xs font-medium ' + (CLOCK_STATUS_COLORS[m.clockStatus] ?? 'bg-gray-100')}>{m.clockStatus}</span>
                </td>
                <td className="px-4 py-3">{m.scanCount.toLocaleString()}</td>
                <td className="px-4 py-3">{formatHour(m.earliestHour)}</td>
                <td className="px-4 py-3">{formatHour(m.latestHour)}</td>
                <td className="px-4 py-3">
                  {m.needsCorrection && (
                    <Button size="sm" onClick={() => previewMutation.mutate(m.machineCode)} disabled={previewMutation.isPending}>
                      {previewMutation.isPending ? '...' : 'Preview'}
                    </Button>
                  )}
                  {!m.needsCorrection && <Badge variant="success">OK</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPreviewModal && previewData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Preview: {previewData.machineCode} (+{previewData.offsetMinutes}min)</h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 rounded p-3 text-center">
                <div className="text-2xl font-bold">{previewData.affectedRows.toLocaleString()}</div>
                <div className="text-xs text-gray-500">Record Terdampak</div>
              </div>
              <div className="bg-yellow-50 rounded p-3 text-center">
                <div className="text-2xl font-bold text-yellow-700">{previewData.dateChangedRows.toLocaleString()}</div>
                <div className="text-xs text-yellow-600">Tanggal Berubah</div>
              </div>
              <div className={(previewData.collisionCount > 0 ? 'bg-red-50' : 'bg-green-50') + ' rounded p-3 text-center'}>
                <div className={'text-2xl font-bold ' + (previewData.collisionCount > 0 ? 'text-red-700' : 'text-green-700')}>{previewData.collisionCount}</div>
                <div className="text-xs text-gray-500">Collision</div>
              </div>
            </div>

            {previewData.collisionCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 font-medium">Collision detected - koreksi tidak bisa dijalankan</p>
              </div>
            )}

            {previewData.sample.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-sm mb-2">Sample:</h3>
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {['ID', 'Waktu Lama', 'Waktu Baru', 'Tgl Lama', 'Tgl Baru'].map(h => (
                        <th key={h} className="px-3 py-2 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.sample.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="px-3 py-2">{s.id}</td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-red-600 line-through">{new Date(s.oldScanTime).toISOString().replace('T', ' ').substring(0, 19)}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-green-700 font-medium">{new Date(s.newScanTime).toISOString().replace('T', ' ').substring(0, 19)}</span>
                        </td>
                        <td className="px-3 py-2 text-red-400 line-through">{s.oldScanDate}</td>
                        <td className="px-3 py-2 text-green-700 font-medium">{s.newScanDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setShowPreviewModal(false); setConfirmApply(false); }}>Tutup</Button>
              {previewData.collisionCount === 0 && !confirmApply && (
                <Button variant="primary" onClick={() => setConfirmApply(true)}>Apply Koreksi</Button>
              )}
              {confirmApply && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Yakin?</span>
                  <Button variant="danger" onClick={() => previewData && applyMutation.mutate(previewData.machineCode)} disabled={applyMutation.isPending}>
                    {applyMutation.isPending ? 'Processing...' : 'Ya, Apply'}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmApply(false)}>Batal</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
