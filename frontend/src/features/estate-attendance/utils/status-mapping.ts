/**
 * Status mapping: API status → UI status + CSS class + label.
 * Uses the existing normalizeAttendanceStatus from the codebase service.
 */
import { normalizeAttendanceStatus } from '../../../services/status-mapping';
import type { AttendanceUiStatus, IntelligenceAttendanceStatus } from '../../../types';

const STATUS_LABELS: Record<string, string> = {
  HADIR: 'Hadir',
  TIDAK_HADIR: 'Tidak Hadir',
  SAKIT: 'Sakit',
  CUTI: 'Cuti',
  OFF_DAY: 'Off Day',
  NO_DATA: '—',
  MANUAL: 'Manual',
  MANUAL_CORRECTION: 'Manual',
  INCOMPLETE_SCAN: 'Belum Lengkap',
  NEED_REVIEW: 'Tinjau',
  UNMAPPED: 'Belum Terpetakan',
  AMBIGUOUS: 'Ambig',
};

const STATUS_CLASSES: Record<string, string> = {
  HADIR: 'rb-status-cell--present',
  TIDAK_HADIR: 'rb-status-cell--absent',
  SAKIT: 'rb-status-cell--sick',
  CUTI: 'rb-status-cell--leave',
  OFF_DAY: 'rb-status-cell--no-data',
  NO_DATA: 'rb-status-cell--no-data',
  MANUAL: 'rb-status-cell--manual',
  MANUAL_CORRECTION: 'rb-status-cell--manual',
  INCOMPLETE_SCAN: 'rb-status-cell--absent',
  NEED_REVIEW: 'rb-status-cell--review',
  UNMAPPED: 'rb-status-cell--no-data',
  AMBIGUOUS: 'rb-status-cell--review',
};

export interface NormalizedStatus {
  uiStatus: string;
  cls: string;
  label: string;
}

/**
 * Normalize any API status string to UI status, CSS class, and label.
 */
export function normalizeStatus(
  apiStatus: string | null | undefined,
  source?: string | null,
): NormalizedStatus {
  const normalized = normalizeAttendanceStatus(apiStatus, source) as string;
  return {
    uiStatus: normalized,
    cls: STATUS_CLASSES[normalized] ?? 'rb-status-cell--no-data',
    label: STATUS_LABELS[normalized] ?? apiStatus ?? '?',
  };
}

/**
 * Get the short code letter for a status (for cell display).
 */
export function statusCode(status: AttendanceUiStatus | string): string {
  const s = String(status).toUpperCase();
  switch (s) {
    case 'HADIR': return 'H';
    case 'TIDAK_HADIR': return 'A';
    case 'SAKIT': return 'S';
    case 'CUTI': return 'C';
    case 'OFF_DAY': return 'O';
    case 'NO_DATA': return '—';
    case 'MANUAL':
    case 'MANUAL_CORRECTION': return 'M';
    case 'INCOMPLETE_SCAN': return '1';
    case 'NEED_REVIEW': return '?';
    case 'UNMAPPED': return '!';
    case 'AMBIGUOUS': return '~';
    default: return '-';
  }
}
