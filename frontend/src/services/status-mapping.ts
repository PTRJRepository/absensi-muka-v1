import type {
  AttendanceSource,
  IntelligenceAttendanceStatus,
  MachineOperationalStatusCode,
  MappingStatus,
  IncidentSeverity,
} from '../types';

export function normalizeMachineStatus(input: {
  access_status?: string | null;
  status?: string | null;
  is_active?: boolean | number | null;
  last_sync_at?: string | null;
  scan_count_today?: number | null;
  scan_count_1h?: number | null;
  quality_score?: number | null;
}): MachineOperationalStatusCode {
  if (input.is_active === false || input.is_active === 0) return 'DISABLED';

  const access = String(input.access_status ?? input.status ?? '').toUpperCase();
  if (access.includes('BLOCK') || access.includes('PORT')) return 'BLOCKED';
  if (access.includes('UNREACH') || access.includes('NO_ROUTE')) return 'UNREACHABLE';
  if (access.includes('TIMEOUT')) return 'UNREACHABLE';
  if (access.includes('OFFLINE')) return 'OFFLINE';

  if (input.last_sync_at) {
    const last = new Date(input.last_sync_at).getTime();
    if (Number.isFinite(last) && Date.now() - last > 60 * 60 * 1000) return 'STALE';
  }

  const quality = Number(input.quality_score ?? 100);
  if (quality < 80) return 'WARNING';
  if (access === 'ACCESSIBLE' || access === 'ONLINE') return 'ONLINE';
  return access ? 'WARNING' : 'OFFLINE';
}

export function machineSeverity(status: MachineOperationalStatusCode, qualityScore = 100): IncidentSeverity {
  if (status === 'BLOCKED' || status === 'UNREACHABLE' || qualityScore < 50) return 'CRITICAL';
  if (status === 'OFFLINE' || status === 'STALE') return 'HIGH';
  if (status === 'WARNING' || qualityScore < 80) return 'MEDIUM';
  return 'LOW';
}

export function normalizeAttendanceStatus(status: unknown, source?: unknown): IntelligenceAttendanceStatus {
  const raw = String(status ?? '').toUpperCase();
  const src = String(source ?? '').toUpperCase();
  if (src === 'MANUAL_CORRECTION' || raw === 'MANUAL_CORRECTION') return 'MANUAL_CORRECTION';
  if (raw === 'PRESENT' || raw === 'HADIR') return 'HADIR';
  if (raw === 'ABSENT' || raw === 'ALPHA' || raw === 'TIDAK_HADIR') return 'TIDAK_HADIR';
  if (raw === 'SAKIT' || raw === 'SICK') return 'SAKIT';
  if (raw === 'CUTI' || raw === 'IZIN' || raw === 'LEAVE') return 'CUTI';
  if (raw === 'HOLIDAY' || raw === 'LIBUR') return 'HOLIDAY';
  if (raw === 'OFF_DAY' || raw === 'REST_DAY' || raw === 'LIBUR_KERJA') return 'OFF_DAY';
  if (raw === 'INCOMPLETE_SCAN') return 'INCOMPLETE_SCAN';
  if (raw === 'SCAN_ON_OFFDAY') return 'SCAN_ON_OFFDAY';
  if (raw === 'SCAN_ON_HOLIDAY') return 'SCAN_ON_HOLIDAY';
  if (raw === 'SCAN_ON_OFFDAY_INCOMPLETE') return 'SCAN_ON_OFFDAY_INCOMPLETE';
  if (raw === 'SCAN_ON_HOLIDAY_INCOMPLETE') return 'SCAN_ON_HOLIDAY_INCOMPLETE';
  if (raw === 'INVALID') return 'INVALID';
  return 'NO_DATA';
}

export function normalizeMappingStatus(value: unknown): MappingStatus {
  const raw = String(value ?? '').toUpperCase();
  if (raw === 'MAPPED') return 'MAPPED';
  if (raw === 'NEED_REVIEW' || raw === 'MANUAL_OVERRIDE_PENDING') return 'NEED_REVIEW';
  return 'UNMAPPED';
}

export function normalizeSource(value: unknown): AttendanceSource {
  const raw = String(value ?? '').toUpperCase();
  if (raw.includes('MANUAL')) return 'MANUAL';
  if (raw.includes('API') || raw.includes('IT_SOLUTION')) return 'API';
  if (raw.includes('HYBRID')) return 'HYBRID';
  if (raw.includes('ZKTECO') || raw.includes('DIRECT')) return 'ZKTECO';
  return 'NO_DATA';
}

export function attendanceStatusCode(status: IntelligenceAttendanceStatus): string {
  switch (status) {
    case 'HADIR': return 'H';
    case 'TIDAK_HADIR': return 'A';
    case 'CUTI': return 'C';
    case 'SAKIT': return 'S';
    case 'HOLIDAY': return 'L';
    case 'OFF_DAY': return 'O';
    case 'MANUAL_CORRECTION': return 'M';
    case 'NO_DATA': return '-';
    case 'INCOMPLETE_SCAN': return '1';
    case 'SCAN_ON_OFFDAY': return 'X';
    case 'SCAN_ON_HOLIDAY': return 'Z';
    case 'SCAN_ON_OFFDAY_INCOMPLETE': return 'X';
    case 'SCAN_ON_HOLIDAY_INCOMPLETE': return 'Z';
    case 'INVALID': return '?';
    default: return '-';
  }
}
