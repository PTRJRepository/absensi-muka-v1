import { query, execute, sql } from '../../lib/db';
import { getWibDateKey } from '../../shared/timezone';

export type TimezoneMode = 'UTC_SOURCE' | 'WIB_SOURCE' | 'CUSTOM_OFFSET' | 'UNKNOWN';
export type ClockStatus = 'OK' | 'UTC_MODE' | 'DRIFTED' | 'UNKNOWN' | 'NEEDS_MANUAL_CHECK';
export type TimeCorrectionStatus =
    | 'NOT_CHECKED' | 'PREVIEWED' | 'CORRECTED'
    | 'SKIPPED_WIB_ALREADY' | 'SKIPPED_UNKNOWN_PROFILE'
    | 'ROLLBACKED' | 'ERROR';

export interface MachineTimeProfile {
  profileId: number;
  machineCode: string;
  timezoneMode: TimezoneMode;
  offsetMinutes: number;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
  evidenceNote: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
}

export interface MachineClockHealth {
  machineCode: string;
  timezoneMode: TimezoneMode;
  offsetMinutes: number;
  clockStatus: ClockStatus;
  scanCount: number;
  earliestHour: number;
  latestHour: number;
  needsCorrection: boolean;
  lastClockCheckedAt: Date | null;
  clockNote: string | null;
}

export class MachineTimeProfileService {
  async getActiveProfile(machineCode: string): Promise<MachineTimeProfile | null> {
    const rows = await query<any>(`
      SELECT TOP 1 profile_id, machine_code, timezone_mode, offset_minutes,
             valid_from, valid_to, is_active, evidence_note, verified_by, verified_at
      FROM attendance_machine_time_profile
      WHERE machine_code = @machineCode
        AND is_active = 1
        AND (valid_to IS NULL OR valid_to > SYSDATETIME())
      ORDER BY valid_from DESC
    `, [{ name: 'machineCode', type: sql.NVarChar, value: machineCode }]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      profileId: Number(r.profile_id),
      machineCode: r.machine_code,
      timezoneMode: r.timezone_mode as TimezoneMode,
      offsetMinutes: Number(r.offset_minutes),
      validFrom: r.valid_from,
      validTo: r.valid_to,
      isActive: Boolean(r.is_active),
      evidenceNote: r.evidence_note ?? null,
      verifiedBy: r.verified_by ?? null,
      verifiedAt: r.verified_at ?? null,
    };
  }

  normalizeToWib(
    recordTime: Date,
    profile: MachineTimeProfile | null
  ): { scanTime: Date; scanDate: string; correctionStatus: TimeCorrectionStatus; offsetMinutes: number } {
    if (!profile) {
      return { scanTime: recordTime, scanDate: getWibDateKey(recordTime), correctionStatus: 'SKIPPED_UNKNOWN_PROFILE', offsetMinutes: 0 };
    }
    if (profile.timezoneMode === 'UTC_SOURCE') {
      const corrected = new Date(recordTime.getTime() + profile.offsetMinutes * 60_000);
      return { scanTime: corrected, scanDate: getWibDateKey(corrected), correctionStatus: 'CORRECTED', offsetMinutes: profile.offsetMinutes };
    }
    if (profile.timezoneMode === 'WIB_SOURCE') {
      return { scanTime: recordTime, scanDate: getWibDateKey(recordTime), correctionStatus: 'SKIPPED_WIB_ALREADY', offsetMinutes: 0 };
    }
    const corrected = new Date(recordTime.getTime() + profile.offsetMinutes * 60_000);
    return { scanTime: corrected, scanDate: getWibDateKey(corrected), correctionStatus: 'CORRECTED', offsetMinutes: profile.offsetMinutes };
  }

  async getClockHealthAll(): Promise<MachineClockHealth[]> {
    const [profiles, scanStats] = await Promise.all([
      query<any>(`SELECT machine_code, timezone_mode, timezone_offset_minutes, clock_status,
                         last_clock_checked_at, clock_note
                  FROM attendance_machines WHERE is_active = 1 ORDER BY machine_code`),
      query<any>(`SELECT TOP 30 machine_code, COUNT(*) AS scan_count,
                         MIN(DATEPART(HOUR, scan_time)) AS earliest_hour,
                         MAX(DATEPART(HOUR, scan_time)) AS latest_hour
                  FROM attendance_scan_logs
                  WHERE scan_date >= DATEADD(DAY, -30, CAST(SYSDATETIME() AS DATE))
                  GROUP BY machine_code`),
    ]);
    const statsMap = new Map(scanStats.map((s: any) => [s.machine_code, s]));
    return profiles.map((m: any) => {
      const stats = statsMap.get(m.machine_code);
      return {
        machineCode: m.machine_code,
        timezoneMode: (m.timezone_mode ?? 'UNKNOWN') as TimezoneMode,
        offsetMinutes: Number(m.timezone_offset_minutes ?? 0),
        clockStatus: (m.clock_status ?? 'UNKNOWN') as ClockStatus,
        scanCount: stats ? Number(stats.scan_count) : 0,
        earliestHour: stats ? Number(stats.earliest_hour) : -1,
        latestHour: stats ? Number(stats.latest_hour) : -1,
        needsCorrection: m.timezone_mode === 'UTC_SOURCE',
        lastClockCheckedAt: m.last_clock_checked_at ?? null,
        clockNote: m.clock_note ?? null,
      };
    });
  }
}

export const machineTimeProfileService = new MachineTimeProfileService();
