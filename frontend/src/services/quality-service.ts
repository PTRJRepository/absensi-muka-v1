import type { QualityReport, QualitySummary, MachineClockHealth, CorrectionPreview, ApplyCorrectionRequest } from '../types';
import { requestData, toNumber } from './api-client';

export function qualityStatus(score: number): QualitySummary['status'] {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 80) return 'GOOD';
  if (score >= 60) return 'WARNING';
  return 'CRITICAL';
}

export function normalizeQualitySummary(raw: Record<string, unknown>): QualitySummary {
  const mapped = toNumber(raw.mapped_employees ?? raw.mapped_count);
  const unmapped = toNumber(raw.unmapped_codes ?? raw.unmapped_count);
  const totalMapped = mapped + unmapped;
  const mappedRate = toNumber(raw.mapped_rate, totalMapped > 0 ? Math.round((mapped / totalMapped) * 100) : 0);
  const completed = toNumber(raw.completed_batches);
  const failed = toNumber(raw.failed_batches);
  const batchTotal = completed + failed;
  const syncSuccessRate = batchTotal > 0 ? Math.round((completed / batchTotal) * 100) : failed > 0 ? 0 : 100;
  const duplicateRate = toNumber(raw.duplicate_rate);
  const onlineRate = toNumber(raw.online_rate, 100);
  const score = toNumber(
    raw.quality_score ?? raw.score,
    Math.round(mappedRate * 0.5 + syncSuccessRate * 0.25 + onlineRate * 0.15 + (100 - duplicateRate) * 0.1)
  );

  return {
    generatedAt: String(raw.generated_at ?? new Date().toISOString()),
    qualityScore: score,
    status: qualityStatus(score),
    mappedRate,
    unmappedCount: unmapped,
    duplicateRate,
    syncSuccessRate,
    staleDataCount: toNumber(raw.stale_data_count),
    invalidTimestampCount: toNumber(raw.invalid_timestamp_count),
    totalScans: toNumber(raw.total_scans),
    failedBatches: failed,
    completedBatches: completed,
  };
}

export function toQualityReport(summary: QualitySummary): QualityReport {
  const overall_status = summary.qualityScore >= 90
    ? 'healthy'
    : summary.qualityScore >= 60
      ? 'warning'
      : 'critical';

  return {
    score: summary.qualityScore,
    overall_status,
    summary: {
      healthy_count: summary.mappedRate,
      warning_count: summary.failedBatches + summary.staleDataCount,
      critical_count: summary.unmappedCount + summary.invalidTimestampCount,
    },
    metrics: [
      {
        name: 'Mapped Rate',
        status: summary.mappedRate >= 90 ? 'healthy' : summary.mappedRate >= 70 ? 'warning' : 'critical',
        value: summary.mappedRate,
        description: 'Persentase device user id yang berhasil dipetakan',
      },
      {
        name: 'Kode Tidak Terpetakan',
        status: summary.unmappedCount > 0 ? 'warning' : 'healthy',
        value: summary.unmappedCount,
        description: 'Device user id yang belum punya mapping karyawan',
      },
      {
        name: 'Sync Success Rate',
        status: summary.syncSuccessRate >= 95 ? 'healthy' : summary.syncSuccessRate >= 80 ? 'warning' : 'critical',
        value: summary.syncSuccessRate,
        description: 'Rasio batch sinkronisasi berhasil',
      },
      {
        name: 'Duplicate Rate',
        status: summary.duplicateRate <= 2 ? 'healthy' : summary.duplicateRate <= 5 ? 'warning' : 'critical',
        value: summary.duplicateRate,
        description: 'Estimasi proporsi scan duplikat',
      },
    ],
  };
}

export async function getQualitySummary(days = 7): Promise<QualitySummary> {
  const raw = await requestData<Record<string, unknown>>(`/api/quality/summary?days=${days}`);
  return normalizeQualitySummary(raw);
}

export async function getQualityReport(days = 7): Promise<QualityReport> {
  return toQualityReport(await getQualitySummary(days));
}

export async function getUnmappedQueue(days = 30, machine = '') {
  const params = new URLSearchParams({ days: String(days) });
  if (machine) params.set('machine', machine);
  return requestData<{ items: unknown[]; total_unmapped?: number }>(`/api/quality/unmapped?${params.toString()}`);
}

export async function getDuplicateGroups(days = 30, machine = '') {
  const params = new URLSearchParams({ days: String(days) });
  if (machine) params.set('machine', machine);
  return requestData<{ items: unknown[]; duplicate_groups?: number; extra_records?: number }>(`/api/quality/duplicates?${params.toString()}`);
}

export async function getQualityReportDetail(days = 30) {
  return requestData<{
    period_days: number;
    since: string;
    summary: Record<string, unknown>;
    daily_trend: unknown[];
    by_division: unknown[];
    unmapped_codes: unknown[];
    batch_summary: Array<{
      status: string;
      batch_count: number;
      total_records: number;
      success_records: number;
      failed_records: number;
    }>;
  }>(`/api/quality/report?days=${days}`);
}

export async function getMachineDrift(threshold = 3600) {
  return requestData<{
    threshold_seconds: number;
    total_machines: number;
    synced_machines: number;
    drifted_machines: number;
    items: unknown[];
  }>(`/api/quality/machine-drift?threshold=${threshold}`);
}

// ─── CurrentEmpCode Quality Dashboard ──────────────────────────────────────────

export interface CurrentEmpCodeSummary {
  registryQuality: {
    totalRegistry: number;
    mappedCurrent: number;
    parsedOnly: number;
    parsedCodeNotFound: number;
    nikNotFound: number;
    currentEmpNotFound: number;
    ambiguousNik: number;
    needReview: number;
  };
  parsedCodeChanges: {
    total: number;
    changes: Array<{
      parsedCode: string;
      currentEmpCode: string;
      count: number;
    }>;
  };
  snapshotHealth: {
    totalSnapshots: number;
    ambiguousNik: number;
    lastSyncAt: string | null;
  };
}

export interface CurrentEmpCodeChanges {
  data: Array<{
    rawDeviceUserId: string;
    parsedCode: string;
    currentEmpCode: string;
    resolvedNik: string | null;
    currentEmpName: string | null;
    currentHrStatus: string | null;
    resolutionStatus: string | null;
    resolutionReason: string | null;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface CurrentEmpCodeAmbiguous {
  data: Array<{
    nik: string;
    currentEmpCode: string;
    activeCount: number;
    ambiguityReason: string;
  }>;
  total: number;
}

export interface CurrentEmpCodeSnapshotStatus {
  snapshotCount: number;
  historyCount: number;
  ambiguousCount: number;
  lastSyncAt: string | null;
  isStale: boolean;
  staleThreshold: number;
  hoursSinceSync: number | null;
}

export async function getCurrentEmpCodeSummary(): Promise<CurrentEmpCodeSummary> {
  return requestData<CurrentEmpCodeSummary>('/api/quality/current-empcode/summary');
}

export async function getCurrentEmpCodeChanges(limit = 100, offset = 0): Promise<CurrentEmpCodeChanges> {
  return requestData<CurrentEmpCodeChanges>(
    `/api/quality/current-empcode/changes?limit=${limit}&offset=${offset}`
  );
}

export async function getCurrentEmpCodeAmbiguous(): Promise<CurrentEmpCodeAmbiguous> {
  return requestData<CurrentEmpCodeAmbiguous>('/api/quality/current-empcode/ambiguous');
}

export async function getCurrentEmpCodeSnapshotStatus(staleThreshold = 24): Promise<CurrentEmpCodeSnapshotStatus> {
  return requestData<CurrentEmpCodeSnapshotStatus>(
    `/api/quality/current-empcode/snapshot-status?staleThreshold=${staleThreshold}`
  );
}

// ─── Machine Clock Health ──────────────────────────────────────────────────────

export async function getMachineClockHealth(): Promise<MachineClockHealth[]> {
  return requestData<MachineClockHealth[]>('/api/quality/machine-clock');
}

export async function previewCorrection(params: {
  machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number;
}): Promise<CorrectionPreview> {
  return requestData<CorrectionPreview>('/api/quality/machine-clock/preview-correction', {
    method: 'POST', body: JSON.stringify(params),
  });
}

export async function applyCorrection(params: ApplyCorrectionRequest): Promise<any> {
  return requestData('/api/quality/machine-clock/apply-correction', {
    method: 'POST', body: JSON.stringify(params),
  });
}

export async function rollbackCorrection(params: {
  batchId: number; executedBy?: string; rebuildImports?: boolean;
}): Promise<any> {
  return requestData('/api/quality/machine-clock/rollback', {
    method: 'POST', body: JSON.stringify(params),
  });
}
