export const meta = {
  name: 'machine-clock-correction',
  description: 'Execute machine clock correction plan: 6 phases with agents',
  phases: [
    { title: 'Phase 1: DB Migrations', detail: 'migrations 059-062' },
    { title: 'Phase 2: Backend Services', detail: '3 services' },
    { title: 'Phase 3: API Endpoints', detail: 'quality.routes.ts' },
    { title: 'Phase 4: Sync Engine Fix', detail: 'sync-orchestrator' },
    { title: 'Phase 5: Frontend', detail: 'MachineClockHealthPage' },
    { title: 'Phase 6: Validation SQL', detail: 'AC queries' },
  ],
}

phase('Phase 1: DB Migrations');

const r1 = await agent(`Write 4 SQL migration files in D:/Gawean Rebinmas/Absensi_Muka/migrations/:

### File 1: 059_create_machine_time_profile.sql
CREATE TABLE attendance_machine_time_profile (
    profile_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    machine_code NVARCHAR(50) NOT NULL,
    timezone_mode NVARCHAR(30) NOT NULL,
    offset_minutes INT NOT NULL,
    valid_from DATETIME2 NOT NULL,
    valid_to DATETIME2 NULL,
    is_active BIT NOT NULL DEFAULT 1,
    evidence_note NVARCHAR(1000) NULL,
    verified_by NVARCHAR(100) NULL,
    verified_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
CREATE INDEX ix_time_profile_machine_active
    ON attendance_machine_time_profile(machine_code, is_active);
INSERT INTO attendance_machine_time_profile
    (machine_code, timezone_mode, offset_minutes, valid_from, is_active,
     evidence_note, verified_by, verified_at)
VALUES
    ('P1B', 'UTC_SOURCE', 420, '2026-06-01T00:00:00', 1,
     'scan_time jam 22-23 WIB saat operasional jam 05-06. Pattern konsisten menunjukkan UTC.',
     'SYSTEM_INVESTIGATION', SYSDATETIME());
INSERT INTO attendance_machine_time_profile
    (machine_code, timezone_mode, offset_minutes, valid_from, is_active,
     evidence_note, verified_by, verified_at)
SELECT machine_code, 'UNKNOWN', 0, '2026-06-01T00:00:00', 1,
       'Belum diinvestigasi timezone mode mesin ini', 'SYSTEM', SYSDATETIME()
FROM attendance_machines
WHERE machine_code != 'P1B'
  AND is_active = 1;

### File 2: 060_create_time_correction_tables.sql
CREATE TABLE attendance_time_correction_batch (
    batch_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    batch_code NVARCHAR(100) NOT NULL UNIQUE,
    correction_scope NVARCHAR(100) NOT NULL,
    machine_code NVARCHAR(50) NULL,
    date_from DATE NULL,
    date_to DATE NULL,
    offset_minutes INT NOT NULL,
    status NVARCHAR(30) NOT NULL DEFAULT 'PENDING',
    preview_count INT NOT NULL DEFAULT 0,
    applied_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    started_at DATETIME2 NULL,
    completed_at DATETIME2 NULL,
    executed_by NVARCHAR(100) NULL,
    notes NVARCHAR(1000) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
CREATE TABLE attendance_time_correction_detail (
    detail_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    batch_id BIGINT NOT NULL,
    scan_log_id BIGINT NOT NULL,
    machine_code NVARCHAR(50) NOT NULL,
    raw_device_user_id NVARCHAR(100) NULL,
    parsed_employee_code NVARCHAR(50) NULL,
    old_scan_time DATETIME2 NOT NULL,
    new_scan_time DATETIME2 NOT NULL,
    old_scan_date DATE NOT NULL,
    new_scan_date DATE NOT NULL,
    offset_minutes INT NOT NULL,
    correction_status NVARCHAR(30) NOT NULL,
    correction_reason NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
CREATE INDEX ix_correction_batch_status
    ON attendance_time_correction_batch(status, created_at);
CREATE INDEX ix_correction_detail_batch
    ON attendance_time_correction_detail(batch_id);

### File 3: 061_add_time_correction_columns_scan_logs.sql
ALTER TABLE attendance_scan_logs ADD
    scan_time_original DATETIME2 NULL,
    scan_date_original DATE NULL,
    scan_time_wib DATETIME2 NULL,
    scan_date_wib DATE NULL,
    time_correction_status NVARCHAR(30) NULL,
    time_correction_offset_minutes INT NULL,
    time_correction_reason NVARCHAR(500) NULL,
    time_corrected_at DATETIME2 NULL,
    time_corrected_by NVARCHAR(100) NULL,
    time_correction_batch_id BIGINT NULL;
UPDATE attendance_scan_logs
SET time_correction_status = 'NOT_CHECKED'
WHERE time_correction_status IS NULL;

### File 4: 062_add_machine_clock_status_columns.sql
ALTER TABLE attendance_machines ADD
    timezone_mode NVARCHAR(30) NULL,
    timezone_offset_minutes INT NULL,
    clock_status NVARCHAR(30) NULL,
    clock_drift_minutes INT NULL,
    last_clock_checked_at DATETIME2 NULL,
    clock_note NVARCHAR(500) NULL;
UPDATE m
SET
    m.timezone_mode = p.timezone_mode,
    m.timezone_offset_minutes = p.offset_minutes,
    m.clock_status = CASE p.timezone_mode
        WHEN 'UTC_SOURCE' THEN 'UTC_MODE'
        WHEN 'WIB_SOURCE' THEN 'OK'
        WHEN 'UNKNOWN' THEN 'UNKNOWN'
        ELSE 'NEEDS_MANUAL_CHECK'
    END,
    m.last_clock_checked_at = p.verified_at,
    m.clock_note = p.evidence_note
FROM attendance_machines m
JOIN attendance_machine_time_profile p ON p.machine_code = m.machine_code
WHERE p.is_active = 1;

Write each file, then run: npm run db:migrate
Then: git add migrations/059 migrations/060 migrations/061 migrations/062 && git commit -m "feat(db): add machine clock time correction infrastructure (migrations 059-062)"`, { phase: 'Phase 1: DB Migrations', label: 'phase1-migrations' });

phase('Phase 2: Backend Services');

const r2 = await agent(`Implement 3 TypeScript services in D:/Gawean Rebinmas/Absensi_Muka

First read these files to understand patterns:
- src/lib/db.ts (query/execute/withTransaction/sql)
- src/shared/timezone.ts (getWibDateKey)

## Service 1: src/modules/machines/machine-time-profile.service.ts
```typescript
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
    const statsMap = new Map(scanStats.map((s) => [s.machine_code, s]));
    return profiles.map((m) => {
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
```

## Service 2: src/modules/attendance/time-correction.service.ts
```typescript
import { query, execute, withTransaction, sql } from '../../lib/db';

export interface CorrectionPreview {
  machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number;
  affectedRows: number; dateChangedRows: number; collisionCount: number;
  sample: Array<{ id: number; oldScanTime: string; newScanTime: string; oldScanDate: string; newScanDate: string; rawDeviceUserId: string }>;
}

export class TimeCorrectionService {
  async previewCorrection(params: { machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number }): Promise<CorrectionPreview> {
    const { machineCode, dateFrom, dateTo, offsetMinutes } = params;
    const [affected, dateChanged, collisions, sample] = await Promise.all([
      query<any>(`SELECT COUNT(*) AS cnt FROM attendance_scan_logs
        WHERE machine_code = @machineCode AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')`,
        [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
         { name: 'dateFrom', type: sql.Date, value: dateFrom },
         { name: 'dateTo', type: sql.Date, value: dateTo }]),
      query<any>(`SELECT COUNT(*) AS cnt FROM attendance_scan_logs
        WHERE machine_code = @machineCode AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
          AND CAST(DATEADD(MINUTE, @offsetMinutes, scan_time) AS DATE) <> scan_date`,
        [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
         { name: 'dateFrom', type: sql.Date, value: dateFrom },
         { name: 'dateTo', type: sql.Date, value: dateTo },
         { name: 'offsetMinutes', type: sql.Int, value: offsetMinutes }]),
      query<any>(`WITH candidate AS (
        SELECT id, machine_code, raw_device_user_id, DATEADD(MINUTE, @offsetMinutes, scan_time) AS new_scan_time
        FROM attendance_scan_logs
        WHERE machine_code = @machineCode AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
      ) SELECT COUNT(*) AS cnt FROM candidate c
        JOIN attendance_scan_logs s ON s.machine_code = c.machine_code AND s.raw_device_user_id = c.raw_device_user_id
          AND s.scan_time = c.new_scan_time AND s.id <> c.id
        WHERE s.machine_code = @machineCode`,
        [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
         { name: 'dateFrom', type: sql.Date, value: dateFrom },
         { name: 'dateTo', type: sql.Date, value: dateTo },
         { name: 'offsetMinutes', type: sql.Int, value: offsetMinutes }]),
      query<any>(`SELECT TOP 10 id, raw_device_user_id, scan_time AS old_scan_time,
        DATEADD(MINUTE, @offsetMinutes, scan_time) AS new_scan_time,
        scan_date AS old_scan_date, CAST(DATEADD(MINUTE, @offsetMinutes, scan_time) AS DATE) AS new_scan_date
        FROM attendance_scan_logs
        WHERE machine_code = @machineCode AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
        ORDER BY scan_time`,
        [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
         { name: 'dateFrom', type: sql.Date, value: dateFrom },
         { name: 'dateTo', type: sql.Date, value: dateTo },
         { name: 'offsetMinutes', type: sql.Int, value: offsetMinutes }]),
    ]);
    return {
      machineCode, dateFrom, dateTo, offsetMinutes,
      affectedRows: Number(affected[0]?.cnt ?? 0),
      dateChangedRows: Number(dateChanged[0]?.cnt ?? 0),
      collisionCount: Number(collisions[0]?.cnt ?? 0),
      sample: sample.map((s) => ({
        id: Number(s.id),
        oldScanTime: new Date(s.old_scan_time).toISOString(),
        newScanTime: new Date(s.new_scan_time).toISOString(),
        oldScanDate: String(s.old_scan_date),
        newScanDate: String(s.new_scan_date),
        rawDeviceUserId: s.raw_device_user_id,
      })),
    };
  }

  async applyCorrection(params: { machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number; executedBy: string; dryRun?: boolean }): Promise<{ success: boolean; batchId: number; batchCode: string; appliedCount: number }> {
    const { machineCode, dateFrom, dateTo, offsetMinutes, executedBy, dryRun } = params;
    if (dryRun) {
      const preview = await this.previewCorrection({ machineCode, dateFrom, dateTo, offsetMinutes });
      return { success: true, batchId: 0, batchCode: 'DRY-RUN', appliedCount: preview.affectedRows };
    }
    return withTransaction(async (tx) => {
      const batchCode = 'TIMEFIX-' + machineCode + '-' + new Date().toISOString().replace(/[:.]/g, '-');
      const batchResult = await tx.request()
        .input('batchCode', sql.NVarChar, batchCode)
        .input('scope', sql.NVarChar, 'MACHINE_DATE_RANGE')
        .input('machineCode', sql.NVarChar, machineCode)
        .input('dateFrom', sql.Date, dateFrom)
        .input('dateTo', sql.Date, dateTo)
        .input('offsetMinutes', sql.Int, offsetMinutes)
        .input('status', sql.NVarChar, 'RUNNING')
        .input('startedAt', sql.DateTime2, new Date())
        .input('executedBy', sql.NVarChar, executedBy)
        .input('notes', sql.NVarChar, 'UTC timestamp normalized to WIB')
        .query(`INSERT INTO attendance_time_correction_batch
          (batch_code, correction_scope, machine_code, date_from, date_to, offset_minutes, status, started_at, executed_by, notes)
          OUTPUT INSERTED.batch_id
          VALUES (@batchCode, @scope, @machineCode, @dateFrom, @dateTo, @offsetMinutes, @status, @startedAt, @executedBy, @notes)`);
      const batchId = Number(batchResult.recordset[0].batch_id);

      await tx.request().input('batchId', sql.BigInt, batchId)
        .input('machineCode', sql.NVarChar, machineCode).input('dateFrom', sql.Date, dateFrom)
        .input('dateTo', sql.Date, dateTo).input('offsetMinutes', sql.Int, offsetMinutes)
        .query(`INSERT INTO attendance_time_correction_detail
          (batch_id, scan_log_id, machine_code, raw_device_user_id, parsed_employee_code,
           old_scan_time, new_scan_time, old_scan_date, new_scan_date, offset_minutes, correction_status, correction_reason)
          SELECT @batchId, id, machine_code, raw_device_user_id, parsed_employee_code, scan_time,
                 DATEADD(MINUTE, @offsetMinutes, scan_time), scan_date,
                 CAST(DATEADD(MINUTE, @offsetMinutes, scan_time) AS DATE),
                 @offsetMinutes, 'CORRECTED', 'Historical UTC timestamp normalized to WIB'
          FROM attendance_scan_logs
          WHERE machine_code = @machineCode AND scan_date BETWEEN @dateFrom AND @dateTo
            AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')`);

      await tx.request().input('batchId', sql.BigInt, batchId)
        .input('machineCode', sql.NVarChar, machineCode).input('dateFrom', sql.Date, dateFrom)
        .input('dateTo', sql.Date, dateTo).input('offsetMinutes', sql.Int, offsetMinutes)
        .input('executedBy', sql.NVarChar, executedBy)
        .query(`UPDATE sl SET
          scan_time_original = ISNULL(sl.scan_time_original, sl.scan_time),
          scan_date_original = ISNULL(sl.scan_date_original, sl.scan_date),
          scan_time_wib = DATEADD(MINUTE, @offsetMinutes, sl.scan_time),
          scan_date_wib = CAST(DATEADD(MINUTE, @offsetMinutes, sl.scan_time) AS DATE),
          scan_time = DATEADD(MINUTE, @offsetMinutes, sl.scan_time),
          scan_date = CAST(DATEADD(MINUTE, @offsetMinutes, sl.scan_time) AS DATE),
          time_correction_status = 'CORRECTED',
          time_correction_offset_minutes = @offsetMinutes,
          time_correction_reason = 'Historical UTC timestamp normalized to WIB',
          time_corrected_at = SYSDATETIME(), time_corrected_by = @executedBy,
          time_correction_batch_id = @batchId
          FROM attendance_scan_logs sl
          WHERE sl.machine_code = @machineCode AND sl.scan_date BETWEEN @dateFrom AND @dateTo
            AND ISNULL(sl.time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')`);

      await tx.request().input('batchId', sql.BigInt, batchId)
        .query(`UPDATE attendance_time_correction_batch SET status = 'COMPLETED', completed_at = SYSDATETIME(),
          applied_count = (SELECT COUNT(*) FROM attendance_time_correction_detail WHERE batch_id = @batchId)
          WHERE batch_id = @batchId`);

      return { success: true, batchId, batchCode, appliedCount: 0 };
    });
  }

  async rollbackBatch(batchId: number, executedBy: string): Promise<{ success: boolean; rolledBackCount: number }> {
    return withTransaction(async (tx) => {
      const result = await tx.request().input('batchId', sql.BigInt, batchId)
        .input('executedBy', sql.NVarChar, executedBy)
        .query(`UPDATE sl SET
          scan_time = ISNULL(d.old_scan_time, sl.scan_time),
          scan_date = ISNULL(d.old_scan_date, sl.scan_date),
          scan_time_wib = NULL, scan_date_wib = NULL,
          time_correction_status = 'ROLLBACKED',
          time_correction_reason = CONCAT('Rollback from batch ', @batchId),
          time_corrected_at = SYSDATETIME(), time_corrected_by = @executedBy,
          time_correction_batch_id = NULL
          FROM attendance_scan_logs sl
          JOIN attendance_time_correction_detail d ON d.scan_log_id = sl.id
          WHERE d.batch_id = @batchId`);
      await tx.request().input('batchId', sql.BigInt, batchId)
        .query(`UPDATE attendance_time_correction_batch SET status = 'ROLLBACKED', completed_at = SYSDATETIME() WHERE batch_id = @batchId`);
      return { success: true, rolledBackCount: result.rowsAffected?.[0] ?? 0 };
    });
  }

  async getBatchDetail(batchId: number) {
    const [batch, details] = await Promise.all([
      query<any>(`SELECT batch_id, batch_code, correction_scope, machine_code, date_from, date_to,
        offset_minutes, status, applied_count, skipped_count, error_count,
        started_at, completed_at, executed_by, notes, created_at
        FROM attendance_time_correction_batch WHERE batch_id = @batchId`,
        [{ name: 'batchId', type: sql.BigInt, value: batchId }]),
      query<any>(`SELECT TOP 50 detail_id, scan_log_id, machine_code, raw_device_user_id, parsed_employee_code,
        old_scan_time, new_scan_time, old_scan_date, new_scan_date, correction_status, correction_reason, created_at
        FROM attendance_time_correction_detail WHERE batch_id = @batchId ORDER BY old_scan_time`,
        [{ name: 'batchId', type: sql.BigInt, value: batchId }]),
    ]);
    return { batch: batch[0], details };
  }
}

export const timeCorrectionService = new TimeCorrectionService();
```

## Service 3: src/modules/attendance/attendance-rebuild.service.ts
```typescript
import { query, execute, sql } from '../../lib/db';

export class AttendanceRebuildService {
  async rebuildImports(params: { machineCode: string; dateFrom: string; dateTo: string; source?: string }): Promise<{ deleted: number; inserted: number }> {
    const { machineCode, dateFrom, dateTo, source = 'ZKTECO' } = params;
    const before = await query<any>(`SELECT COUNT(*) AS cnt FROM attendance_imports
      WHERE machine_code = @machineCode AND attendance_date BETWEEN @dateFrom AND @dateTo AND source = @source`,
      [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
       { name: 'dateFrom', type: sql.Date, value: dateFrom },
       { name: 'dateTo', type: sql.Date, value: dateTo },
       { name: 'source', type: sql.NVarChar, value: source }]);
    const deleted = Number(before[0]?.cnt ?? 0);
    await execute(`DELETE FROM attendance_imports
      WHERE machine_code = @machineCode AND attendance_date BETWEEN @dateFrom AND @dateTo AND source = @source`,
      [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
       { name: 'dateFrom', type: sql.Date, value: dateFrom },
       { name: 'dateTo', type: sql.Date, value: dateTo },
       { name: 'source', type: sql.NVarChar, value: source }]);

    const BATCH = 500;
    let totalInserted = 0, offset = 0, hasMore = true;
    while (hasMore) {
      const result = await execute(`
        INSERT INTO attendance_imports (employee_id, employee_code, division_code, attendance_date, attendance_year, attendance_month,
          check_in_at, check_out_at, total_scans, attendance_status, has_work, source, source_reference, batch_id, needs_manual_review)
        OUTPUT INSERTED.id
        SELECT TOP ${BATCH}
          COALESCE(e.id, NULL), COALESCE(s.current_emp_code, s.parsed_employee_code),
          COALESCE(d.division_code, s.parsed_division_code, 'UNKNOWN'),
          s.scan_date, YEAR(s.scan_date), MONTH(s.scan_date),
          MIN(s.scan_time), CASE WHEN COUNT(*) >= 2 THEN MAX(s.scan_time) ELSE NULL END,
          COUNT(*), CASE WHEN COUNT(*) >= 2 THEN 'HADIR' WHEN COUNT(*) = 1 THEN 'INCOMPLETE_SCAN' ELSE 'NO_DATA' END,
          CASE WHEN COUNT(*) >= 1 THEN 1 ELSE 0 END, 'ZKTECO', s.machine_code, ISNULL(MAX(s.sync_batch_id), 0),
          CASE WHEN e.id IS NOT NULL THEN 0 ELSE 1 END
        FROM attendance_scan_logs s
        LEFT JOIN employees e ON e.employee_code = s.parsed_employee_code
        LEFT JOIN divisions d ON d.id = e.division_id
        WHERE s.machine_code = @machineCode AND s.scan_date BETWEEN @dateFrom AND @dateTo AND s.mapping_status = 'MAPPED'
        GROUP BY COALESCE(e.id, NULL), COALESCE(s.current_emp_code, s.parsed_employee_code),
                 COALESCE(d.division_code, s.parsed_division_code, 'UNKNOWN'), s.scan_date, s.machine_code
        OFFSET ${offset} ROWS
      `, [{ name: 'machineCode', type: sql.NVarChar, value: machineCode },
          { name: 'dateFrom', type: sql.Date, value: dateFrom },
          { name: 'dateTo', type: sql.Date, value: dateTo }]);
      const n = Number(result.rowsAffected?.[0] ?? 0);
      totalInserted += n; offset += BATCH; hasMore = n === BATCH;
    }
    return { deleted, inserted: totalInserted };
  }
}

export const attendanceRebuildService = new AttendanceRebuildService();
```

After writing all 3 files, run: npm run build
Fix TypeScript errors if any.
Then: git add src/modules/machines/machine-time-profile.service.ts src/modules/attendance/time-correction.service.ts src/modules/attendance/attendance-rebuild.service.ts && git commit -m "feat: add time correction services (MachineTimeProfileService, TimeCorrectionService, AttendanceRebuildService)"`, { phase: 'Phase 2: Backend Services', label: 'phase2-services' });

phase('Phase 3: API Endpoints');

const r3 = await agent(`Read the current quality.routes.ts file at: D:/Gawean Rebinmas/Absensi_Muka/src/api/routes/quality.routes.ts

Also verify these service files exist:
- D:/Gawean Rebinmas/Absensi_Muka/src/modules/machines/machine-time-profile.service.ts
- D:/Gawean Rebinmas/Absensi_Muka/src/modules/attendance/time-correction.service.ts
- D:/Gawean Rebinmas/Absensi_Muka/src/modules/attendance/attendance-rebuild.service.ts

Then append these new routes at the END of quality.routes.ts (just before the final closing }); ):

```typescript
import { MachineTimeProfileService } from '../../modules/machines/machine-time-profile.service';
import { TimeCorrectionService } from '../../modules/attendance/time-correction.service';
import { AttendanceRebuildService } from '../../modules/attendance/attendance-rebuild.service';

const profileService = new MachineTimeProfileService();
const correctionService = new TimeCorrectionService();
const rebuildService = new AttendanceRebuildService();

route('GET', '/api/quality/machine-clock', async (ctx) => {
  const health = await profileService.getClockHealthAll();
  sendJson(ctx.res, 200, { success: true, data: health });
});

route('GET', '/api/quality/machine-clock/:machineCode', async (ctx) => {
  const { machineCode } = ctx.params;
  const [profile, health] = await Promise.all([
    profileService.getActiveProfile(machineCode),
    profileService.getClockHealthAll().then(list => list.find((h) => h.machineCode === machineCode)),
  ]);
  sendJson(ctx.res, 200, { success: true, data: { profile, health } });
});

route('POST', '/api/quality/machine-clock/preview-correction', async (ctx) => {
  const body = ctx.body;
  if (!body?.machineCode || !body?.dateFrom || !body?.dateTo || body?.offsetMinutes == null) {
    sendError(ctx.res, 400, 'machineCode, dateFrom, dateTo, offsetMinutes required'); return;
  }
  const preview = await correctionService.previewCorrection({
    machineCode: body.machineCode, dateFrom: body.dateFrom, dateTo: body.dateTo, offsetMinutes: body.offsetMinutes,
  });
  sendJson(ctx.res, 200, { success: true, data: preview });
});

route('POST', '/api/quality/machine-clock/apply-correction', async (ctx) => {
  const body = ctx.body;
  if (!body?.machineCode || !body?.dateFrom || !body?.dateTo || body?.offsetMinutes == null) {
    sendError(ctx.res, 400, 'machineCode, dateFrom, dateTo, offsetMinutes required'); return;
  }
  const result = await correctionService.applyCorrection({
    machineCode: body.machineCode, dateFrom: body.dateFrom, dateTo: body.dateTo,
    offsetMinutes: body.offsetMinutes, executedBy: body.executedBy ?? 'API', dryRun: body.dryRun ?? false,
  });
  let rebuildResult = null;
  if (result.success && !body.dryRun && body.rebuildImports !== false) {
    rebuildResult = await rebuildService.rebuildImports({
      machineCode: body.machineCode, dateFrom: body.dateFrom, dateTo: body.dateTo,
    });
  }
  sendJson(ctx.res, result.success ? 200 : 500, { success: result.success, data: { ...result, rebuildResult } });
});

route('POST', '/api/quality/machine-clock/rollback', async (ctx) => {
  const body = ctx.body;
  if (!body?.batchId) { sendError(ctx.res, 400, 'batchId required'); return; }
  const rollbackResult = await correctionService.rollbackBatch(body.batchId, body.executedBy ?? 'API');
  let rebuildResult = null;
  if (rollbackResult.success && body.rebuildImports !== false) {
    const batch = await correctionService.getBatchDetail(body.batchId);
    if (batch.batch) {
      rebuildResult = await rebuildService.rebuildImports({
        machineCode: batch.batch.machine_code,
        dateFrom: String(batch.batch.date_from),
        dateTo: String(batch.batch.date_to),
      });
    }
  }
  sendJson(ctx.res, 200, { success: rollbackResult.success, data: { ...rollbackResult, rebuildResult } });
});

route('GET', '/api/quality/machine-clock/batch/:batchId', async (ctx) => {
  const batchId = parseInt(ctx.params.batchId);
  if (!batchId) { sendError(ctx.res, 400, 'invalid batchId'); return; }
  const detail = await correctionService.getBatchDetail(batchId);
  sendJson(ctx.res, 200, { success: true, data: detail });
});
```

Then run: npm run build
Fix any TypeScript errors.
Then: git add src/api/routes/quality.routes.ts && git commit -m "feat(api): add machine-clock quality endpoints (preview/apply/rollback)"`, { phase: 'Phase 3: API Endpoints', label: 'phase3-api' });

phase('Phase 4: Sync Engine Fix');

const r4 = await agent(`Read these files:
- D:/Gawean Rebinmas/Absensi_Muka/src/modules/import/sync-orchestrator.service.ts
- D:/Gawean Rebinmas/Absensi_Muka/src/modules/machines/machine-time-profile.service.ts
- D:/Gawean Rebinmas/Absensi_Muka/src/shared/timezone.ts

Make these changes to sync-orchestrator.service.ts:

1. ADD this import after the existing imports (around line 20):
import { MachineTimeProfileService } from '../machines/machine-time-profile.service';

2. ADD this class property inside the SyncOrchestrator class, after the existing properties:
  private profileService = new MachineTimeProfileService();

3. In syncViaZkteco method, FIND this line in the attendance section:
  let attCount = 0;
  let newRecordsInserted = 0;
  const attendances = (attResult.data || []) as any[];
  for (const att of attendances) {
    const result = insertRawScanLog(this.mssqlPool, batchId, machine, att);
And ADD BEFORE the for loop:
  const machineProfile = await this.profileService.getActiveProfile(machine.machine_code);

4. REPLACE the entire insertRawScanLog function (it starts at "function insertRawScanLog(" and ends before "// ─── Service") with this new version:
function insertRawScanLog(
  pool: any,
  batchId: number,
  machine: { machine_id: number; machine_code: string; ip_address: string },
  att: RawAttendanceRecord,
  profile: { timezoneMode: string; offsetMinutes: number } | null
): { inserted: boolean } {
  const rawDeviceUserId = pickAbsensiId(att.deviceUserId, undefined, undefined, undefined);
  const rawUserSn = att.userSn == null ? null : String(att.userSn);
  const zktecoUserName = att.name == null && att.userName == null ? null : String(att.name ?? att.userName);
  const rawRecordTime = new Date((att.recordTime ?? att.timestamp ?? att.time) as string | Date);
  const scanTime = Number.isNaN(rawRecordTime.getTime()) ? new Date() : rawRecordTime;

  let finalScanTime = scanTime;
  let finalScanDate = getWibDateKey(scanTime);
  let correctionStatus = 'NOT_CHECKED';
  let offsetMinutes = 0;

  if (profile) {
    offsetMinutes = profile.offsetMinutes;
    if (profile.timezoneMode === 'UTC_SOURCE') {
      finalScanTime = new Date(scanTime.getTime() + profile.offsetMinutes * 60_000);
      finalScanDate = getWibDateKey(finalScanTime);
      correctionStatus = 'CORRECTED';
    } else if (profile.timezoneMode === 'WIB_SOURCE') {
      correctionStatus = 'SKIPPED_WIB_ALREADY';
    } else {
      correctionStatus = 'SKIPPED_UNKNOWN_PROFILE';
    }
  }

  const req = pool.request()
    .input('machineId', pool.mssql.Int, machine.machine_id)
    .input('machineCode', machine.machine_code)
    .input('rawDeviceUserId', rawDeviceUserId)
    .input('rawUserSn', rawUserSn)
    .input('rawRecordTime', pool.mssql.DateTime2, rawRecordTime)
    .input('rawIp', machine.ip_address)
    .input('zktecoUserName', zktecoUserName)
    .input('scanTime', pool.mssql.DateTime2, finalScanTime)
    .input('scanDate', pool.mssql.Date, finalScanDate)
    .input('eventType', att.type == null ? null : String(att.type))
    .input('verifyType', att.verifyType == null ? null : String(att.verifyType))
    .input('workCode', att.workCode == null ? null : String(att.workCode))
    .input('batchId', pool.mssql.BigInt, batchId)
    .input('correctionStatus', correctionStatus)
    .input('offsetMinutes', pool.mssql.Int, offsetMinutes);

  req.query(" + "`" + `INSERT INTO attendance_scan_logs
    (machine_id, machine_code, raw_device_user_id, raw_user_sn,
     raw_record_time, raw_ip, zkteco_user_name,
     scan_time, scan_date, event_type, verify_type, work_code,
     sync_batch_id, mapping_status, time_correction_status, time_correction_offset_minutes)
  VALUES
    (@machineId, @machineCode, @rawDeviceUserId, @rawUserSn,
     @rawRecordTime, @rawIp, @zktecoUserName,
     @scanTime, @scanDate, @eventType, @verifyType, @workCode,
     @batchId, 'NEED_REVIEW', @correctionStatus, @offsetMinutes)` + "`" + `);

  return { inserted: true };
}

5. UPDATE the insert call inside the loop to pass machineProfile:
FIND: const result = insertRawScanLog(this.mssqlPool, batchId, machine, att);
REPLACE WITH: const result = insertRawScanLog(this.mssqlPool, batchId, machine, att, machineProfile);

Run: npm run build
Fix any TypeScript errors.
Then: git add src/modules/import/sync-orchestrator.service.ts && git commit -m "fix(sync): normalize machine timestamps to WIB using timezone profile on insert"`, { phase: 'Phase 4: Sync Engine Fix', label: 'phase4-sync' });

phase('Phase 5: Frontend');

const r5 = await agent(`Implement the frontend Machine Clock Health feature. Read these files first:
- D:/Gawean Rebinmas/Absensi_Muka/frontend/src/types/index.ts
- D:/Gawean Rebinmas/Absensi_Muka/frontend/src/services/quality-service.ts
- D:/Gawean Rebinmas/Absensi_Muka/frontend/src/router.tsx

## 1. Append types to frontend/src/types/index.ts
At the very end of the file, add:
```typescript
// ─── Machine Clock Health ──────────────────────────────────────────────────────
export type TimezoneMode = 'UTC_SOURCE' | 'WIB_SOURCE' | 'CUSTOM_OFFSET' | 'UNKNOWN';
export type ClockStatus = 'OK' | 'UTC_MODE' | 'DRIFTED' | 'UNKNOWN' | 'NEEDS_MANUAL_CHECK';
export type TimeCorrectionStatus =
  | 'NOT_CHECKED' | 'PREVIEWED' | 'CORRECTED'
  | 'SKIPPED_WIB_ALREADY' | 'SKIPPED_UNKNOWN_PROFILE'
  | 'ROLLBACKED' | 'ERROR';

export interface MachineClockHealth {
  machineCode: string;
  timezoneMode: TimezoneMode;
  offsetMinutes: number;
  clockStatus: ClockStatus;
  scanCount: number;
  earliestHour: number;
  latestHour: number;
  needsCorrection: boolean;
  lastClockCheckedAt: string | null;
  clockNote: string | null;
}

export interface CorrectionPreview {
  machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number;
  affectedRows: number; dateChangedRows: number; collisionCount: number;
  sample: Array<{ id: number; oldScanTime: string; newScanTime: string; oldScanDate: string; newScanDate: string; rawDeviceUserId: string }>;
}

export interface ApplyCorrectionRequest {
  machineCode: string; dateFrom: string; dateTo: string; offsetMinutes: number;
  executedBy?: string; dryRun?: boolean; rebuildImports?: boolean;
}
```

## 2. Append API methods to frontend/src/services/quality-service.ts
At the very end of the file, add:
```typescript
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
```

## 3. Create the page file: frontend/src/pages/MachineClockHealthPage.tsx
Write this complete component (use template literals for className concatenation instead of clsx/classnames):
```tsx
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { getMachineClockHealth, previewCorrection, applyCorrection } from '../../services/quality-service';
import type { MachineClockHealth, CorrectionPreview } from '../../types';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';

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

export default function MachineClockHealthPage() {
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
                  {!m.needsCorrection && <Badge color="green">OK</Badge>}
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
```

## 4. Register the route in frontend/src/router.tsx
Read the router file. Add:
- Import at top: import MachineClockHealthPage from './pages/MachineClockHealthPage';
- Add route path: '/machine-clock-health' → MachineClockHealthPage (find the pattern used for other routes)

After all changes, run: cd "D:/Gawean Rebinmas/Absensi_Muka/frontend" && npm run build
Fix any errors.
Then: git add frontend/src/types/index.ts frontend/src/services/quality-service.ts frontend/src/pages/MachineClockHealthPage.tsx frontend/src/router.tsx && git commit -m "feat(frontend): add Machine Clock Health page with preview/apply modal"`, { phase: 'Phase 5: Frontend', label: 'phase5-frontend' });

phase('Phase 6: Validation SQL');

const r6 = await agent(`Create the validation SQL file at: D:/Gawean Rebinmas/Absensi_Muka/sql/validate_time_correction.sql

Write this exact content:
```sql
-- Machine Clock Correction - Acceptance Criteria Validation Queries
-- Run after applying time corrections to validate correctness

-- AC-001: Data Original Aman (must return 0)
SELECT COUNT(*) AS violation_count,
       'AC-001: CORRECTED records missing scan_time_original' AS check_name
FROM attendance_scan_logs
WHERE time_correction_status = 'CORRECTED'
  AND scan_time_original IS NULL;

-- AC-002: Offset verification for P1B (should show +420 min offset)
SELECT TOP 5
    id, machine_code, raw_device_user_id,
    scan_time_original AS old_scan_time,
    scan_time AS new_scan_time,
    DATEDIFF(MINUTE, scan_time_original, scan_time) AS offset_applied_min,
    'AC-002: Offset verification' AS check_name
FROM attendance_scan_logs
WHERE machine_code = 'P1B'
  AND time_correction_status = 'CORRECTED'
  AND scan_time_original IS NOT NULL
ORDER BY id;

-- AC-003: scan_date must match scan_time after correction (must return 0)
SELECT COUNT(*) AS violation_count,
       'AC-003: scan_date/scan_time mismatch' AS check_name
FROM attendance_scan_logs
WHERE time_correction_status = 'CORRECTED'
  AND CAST(scan_time AS DATE) <> scan_date;

-- AC-004: attendance_imports shows correct WIB times
SELECT TOP 10
    employee_code, attendance_date,
    FORMAT(check_in_at, 'HH:mm:ss') AS check_in_time,
    FORMAT(check_out_at, 'HH:mm:ss') AS check_out_time,
    attendance_status, scan_count,
    'AC-004: attendance_imports time check' AS check_name
FROM attendance_imports
WHERE machine_code = 'P1B'
  AND attendance_date BETWEEN '2026-06-01' AND '2026-06-30'
  AND source = 'ZKTECO'
ORDER BY employee_code, attendance_date;

-- AC-005: No duplicate collisions after correction (must return 0 rows)
SELECT
    machine_code, raw_device_user_id,
    FORMAT(scan_time, 'yyyy-MM-dd HH:mm:ss') AS scan_time,
    COUNT(*) AS duplicate_count,
    'AC-005: Duplicate collision check' AS check_name
FROM attendance_scan_logs
WHERE time_correction_status = 'CORRECTED'
GROUP BY machine_code, raw_device_user_id, scan_time
HAVING COUNT(*) > 1;

-- AC-006: Batch audit trail
SELECT
    COUNT(*) AS total_batches,
    SUM(applied_count) AS total_corrected,
    SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_batches,
    'AC-006: Batch audit trail' AS check_name
FROM attendance_time_correction_batch;

-- AC-007: Future sync status distribution
SELECT
    time_correction_status, COUNT(*) AS cnt,
    'AC-007: Future sync status' AS check_name
FROM attendance_scan_logs
WHERE time_correction_status IS NOT NULL
GROUP BY time_correction_status
ORDER BY cnt DESC;
```

Then: git add sql/validate_time_correction.sql && git commit -m "docs: add time correction acceptance criteria validation SQL"`, { phase: 'Phase 6: Validation SQL', label: 'phase6-validation' });
