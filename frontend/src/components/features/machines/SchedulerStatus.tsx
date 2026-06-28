import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { Loader, Clock, Power, RefreshCw } from 'lucide-react';
import type { SchedulerInfo } from '../../../types';

function formatTime(value: string | null) {
  if (!value) return 'Belum pernah';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SchedulerStatus() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [intervalInput, setIntervalInput] = useState('');

  const { data, isLoading } = useQuery<SchedulerInfo>({
    queryKey: ['scheduler-status'],
    queryFn: () => api<SchedulerInfo>('/api/scheduler/status'),
    refetchInterval: 10000,
  });

  const updateConfig = useMutation({
    mutationFn: async (payload: { enabled?: boolean; intervalMinutes?: number }) => {
      return api<SchedulerInfo>('/api/scheduler/config', { method: 'PUT', body: JSON.stringify(payload) });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler-status'] }),
  });

  const runNow = useMutation({
    mutationFn: () => api('/api/scheduler/sync-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler-status'] }),
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
        <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
        Loading
      </div>
    );
  }

  const enabled = Boolean(data?.enabled);
  const isReady = enabled;
  const statusColor = isReady ? '#4ade80' : '#9ca3af';
  const statusText = isReady ? 'Aktif' : 'Nonaktif';

  const saveInterval = () => {
    const min = parseInt(intervalInput, 10);
    if (Number.isFinite(min) && min > 0) {
      updateConfig.mutate({ intervalMinutes: min });
      setEditing(false);
      setIntervalInput('');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '6px 12px',
      borderRadius: 6,
      background: 'rgba(255,255,255,0.1)',
      border: '1px solid rgba(255,255,255,0.15)',
      fontSize: 12,
      color: 'rgba(255,255,255,0.85)',
      minWidth: 220,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor,
          }} />
          <strong>Scheduler: {statusText}</strong>
        </div>
        <button
          onClick={() => updateConfig.mutate({ enabled: !enabled })}
          disabled={updateConfig.isPending}
          title={enabled ? 'Nonaktifkan' : 'Aktifkan'}
          style={{
            background: enabled ? '#f87171' : '#4ade80',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Power size={12} />
          {enabled ? 'Stop' : 'Start'}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.7)' }}>
        <Clock size={11} />
        <span>Interval: {data?.interval_minutes} menit</span>
        {editing ? (
          <>
            <input
              type="number"
              value={intervalInput}
              onChange={(e) => setIntervalInput(e.target.value)}
              placeholder="menit"
              style={{ width: 60, fontSize: 11, padding: '2px 4px' }}
              autoFocus
            />
            <button onClick={saveInterval} style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>Simpan</button>
            <button onClick={() => setEditing(false)} style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>Batal</button>
          </>
        ) : (
          <button onClick={() => { setIntervalInput(String(data?.interval_minutes ?? '')); setEditing(true); }} style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer', background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3 }}>Ubah</button>
        )}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.7)' }}>
        Terakhir jalan: {formatTime(data?.last_run ?? null)}
      </div>
      <button
        onClick={() => runNow.mutate()}
        disabled={runNow.isPending}
        style={{
          fontSize: 11, padding: '4px 8px', cursor: 'pointer',
          background: 'rgba(255,255,255,0.15)', color: 'inherit',
          border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4,
          display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
        }}
      >
        <RefreshCw size={11} />
        {runNow.isPending ? 'Menjalankan...' : 'Sync Sekarang'}
      </button>
    </div>
  );
}
