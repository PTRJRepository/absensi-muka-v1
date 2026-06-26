import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { Wifi, WifiOff, Loader } from 'lucide-react';
import type { SchedulerInfo } from '../../../types';

export function SchedulerStatus() {
  // Backend returns: { enabled, interval_minutes, running_jobs, next_scheduled_run, status }
  const { data, isLoading } = useQuery<SchedulerInfo>({
    queryKey: ['scheduler-status'],
    queryFn: () => api<SchedulerInfo>('/api/scheduler/status'),
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
        <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
        Loading
      </div>
    );
  }

  // running_jobs from scheduler service reflects which jobs are enabled
  const hasActiveJobs = Boolean(data?.enabled && (data?.running_jobs?.length ?? 0) > 0);
  const isSyncing = data?.status === 'SYNCING';
  const hasError = data?.status === 'ERROR';
  const isReady = hasActiveJobs && !isSyncing && !hasError;

  const statusColor = isSyncing ? '#fbbf24' : hasError ? '#f87171' : isReady ? '#4ade80' : '#9ca3af';
  const statusText = isSyncing ? 'Menyinkronkan...' : hasError ? 'Error' : isReady ? 'Siap' : 'Disabled';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 12px',
      borderRadius: 6,
      background: 'rgba(255,255,255,0.1)',
      border: '1px solid rgba(255,255,255,0.15)',
      fontSize: 12,
      color: 'rgba(255,255,255,0.85)',
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: statusColor,
        boxShadow: isSyncing ? `0 0 6px ${statusColor}` : 'none',
        animation: isSyncing ? 'pulse 1s infinite' : 'none',
      }} />
      {statusText}
    </div>
  );
}
