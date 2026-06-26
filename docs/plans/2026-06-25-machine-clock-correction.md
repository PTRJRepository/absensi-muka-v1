# Machine Clock Correction & Time Normalization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Menormalkan seluruh waktu scan mesin ZKTeco ke WIB, menambahkan audit trail per-machine timezone profile, memperbaiki data historis (preview → apply → rollback), dan memperbaiki sync engine agar tidak mengulang masalah yang sama.

**Architecture:** Solusi dibagi 7 fase — DB migrations → timezone service → time correction service → API endpoints → sync fix → rebuild service → frontend. Semua koreksi historis wajib lewat preview (dry-run) sebelum apply. Audit trail disimpan di tabel `attendance_time_correction_detail` untuk memungkinkan rollback per batch.

**Tech Stack:** Node.js/TypeScript backend, SQL Server, React frontend, node-zklib, mssql, custom router pattern (bukan Express).

---

## Context: Existing Patterns

**Database table naming:** Migrations pakai prefix `NNN_description.sql`, terakhir `058_backfill_scan_logs_mapping.sql`.

**Sync flow saat ini:**
```
ZKTeco recordTime → rawRecordTime → scanTime (stored as-is)
                                        → scanDate = getWibDateKey(scanTime) ✓ (WIB date OK)
```

**Masalah:** `scan_time` di-P1B tersimpan sebagai jam 22:50 (UTC) padahal seharusnya jam 05:50 WIB. `scan_date` sudah benar karena `getWibDateKey()` menghitung date di WIB. Tapi `scan_time` salah → `MIN(scan_time)` dan `MAX(scan_time)` di `attendance_imports` jadi salah.

**Key files:**
- `src/modules/import/sync-orchestrator.service.ts` — insert raw scan logs
- `src/modules/attendance/attendance-process-import.service.ts` — aggregates to `attendance_imports`
- `src/shared/timezone.ts` — `getWibDateKey()`, `getWibTimeString()`, `getWibDateTimeString()`
- `src/api/routes/quality.routes.ts` — existing quality API pattern
- `src/lib/db.ts` — `query()`, `execute()`, `withTransaction()`
- `frontend/src/services/quality-service.ts` — existing quality frontend service
- `frontend/src/types/index.ts` — existing `AttendanceMatrixCell`, `IntelligenceAttendanceStatus`

---

## Phase 1: Database Migrations

### Task 1: Migration 059 — Buat Tabel `attendance_machine_time_profile`

**Files:**
- Create: `migrations/059_create_machine_time_profile.sql`

```sql
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
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT fk_time_profile_machine FOREIGN KEY (machine_code)
        REFERENCES attendance_machines(machine_code)
);
CREATE INDEX ix_time_profile_machine_active
    ON attendance_machine_time_profile(machine_code, is_active)
    WHERE is_active = 1;

-- Seed P1B sebagai UTC_SOURCE (confirmed dari investigation)
INSERT INTO attendance_machine_time_profile
    (machine_code, timezone_mode, offset_minutes, valid_from, is_active,
     evidence_note, verified_by, verified_at)
VALUES
    ('P1B', 'UTC_SOURCE', 420, '2026-06-01T00:00:00', 1,
     'scan_time jam 22-23 WIB saat operasional jam 05-06. Pattern konsisten menunjukkan UTC.',
     'SYSTEM_INVESTIGATION', SYSDATETIME());

-- Semua mesin lain sementara UNKNOWN sampai diinvestigasi
INSERT INTO attendance_machine_time_profile
    (machine_code, timezone_mode, offset_minutes, valid_from, is_active,
     evidence_note, verified_by, verified_at)
SELECT machine_code, 'UNKNOWN', 0, '2026-06-01T00:00:00', 1,
       'Belum diinvestigasi timezone mode mesin ini', 'SYSTEM', SYSDATETIME()
FROM attendance_machines
WHERE machine_code != 'P1B'
  AND is_active = 1;
```

**Step 1: Write the migration**

Run: `npm run db:migrate`
Expected: Migration 059 runs successfully, new table + seed data created

**Step 2: Verify**

```sql
SELECT machine_code, timezone_mode, offset_minutes, is_active
FROM attendance_machine_time_profile
ORDER BY machine_code;
```
Expected: P1B = UTC_SOURCE/420/active, sisanya UNKNOWN/0/active

**Step 3: Commit**

```bash
git add migrations/059_create_machine_time_profile.sql
git commit -m "feat(db): add attendance_machine_time_profile table with P1B UTC_SOURCE seed"
```

---

### Task 2: Migration 060 — Buat Tabel Batch dan Detail Audit

**Files:**
- Create: `migrations/060_create_time_correction_tables.sql`

```sql
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
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT fk_correction_detail_batch
        FOREIGN KEY (batch_id) REFERENCES attendance_time_correction_batch(batch_id),
    CONSTRAINT fk_correction_detail_scanlog
        FOREIGN KEY (scan_log_id) REFERENCES attendance_scan_logs(id)
);

CREATE INDEX ix_correction_batch_status
    ON attendance_time_correction_batch(status, created_at);
CREATE INDEX ix_correction_detail_batch
    ON attendance_time_correction_detail(batch_id);
```

**Step 1: Write the migration**

Run: `npm run db:migrate`
Expected: Migration 060 runs successfully

**Step 2: Verify**

```sql
SELECT COUNT(*) AS batch_count FROM attendance_time_correction_batch;
SELECT COUNT(*) AS detail_count FROM attendance_time_correction_detail;
```
Expected: 0 rows each (tables empty, ready for use)

**Step 3: Commit**

```bash
git add migrations/060_create_time_correction_tables.sql
git commit -m "feat(db): add time correction audit tables (batch + detail)"
```

---

### Task 3: Migration 061 — Tambah Kolom Koreksi di `attendance_scan_logs`

**Files:**
- Create: `migrations/061_add_time_correction_columns_scan_logs.sql`

```sql
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

ALTER TABLE attendance_scan_logs ADD
    CONSTRAINT fk_scanlogs_time_correction_batch
        FOREIGN KEY (time_correction_batch_id)
        REFERENCES attendance_time_correction_batch(batch_id);

-- Set default status untuk existing records
UPDATE attendance_scan_logs
SET time_correction_status = 'NOT_CHECKED'
WHERE time_correction_status IS NULL;

ALTER TABLE attendance_scan_logs
ALTER COLUMN time_correction_status NVARCHAR(30) NOT NULL;
```

**Step 1: Write the migration**

Run: `npm run db:migrate`
Expected: Migration 061 runs, columns added, existing records get `time_correction_status = 'NOT_CHECKED'`

**Step 2: Verify**

```sql
SELECT TOP 5
    id, machine_code, scan_time,
    time_correction_status
FROM attendance_scan_logs;
```
Expected: existing records show `time_correction_status = 'NOT_CHECKED'`

**Step 3: Commit**

```bash
git add migrations/061_add_time_correction_columns_scan_logs.sql
git commit -m "feat(db): add time correction columns to attendance_scan_logs"
```

---

### Task 4: Migration 062 — Tambah Kolom Clock Status di `attendance_machines`

**Files:**
- Create: `migrations/062_add_machine_clock_status_columns.sql`

```sql
ALTER TABLE attendance_machines ADD
    timezone_mode NVARCHAR(30) NULL,
    timezone_offset_minutes INT NULL,
    clock_status NVARCHAR(30) NULL,
    clock_drift_minutes INT NULL,
    last_clock_checked_at DATETIME2 NULL,
    clock_note NVARCHAR(500) NULL;

-- Backfill dari time profile
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
JOIN attendance_machine_time_profile p
    ON p.machine_code = m.machine_code
WHERE p.is_active = 1;
```

**Step 1: Write the migration**

Run: `npm run db:migrate`

**Step 2: Verify**

```sql
SELECT machine_code, timezone_mode, clock_status
FROM attendance_machines
WHERE is_active = 1
ORDER BY machine_code;
```
Expected: P1B = UTC_SOURCE/UTC_MODE, sisanya sesuai profile

**Step 3: Commit**

```bash
git add migrations/062_add_machine_clock_status_columns.sql
git commit -m "feat(db): add machine clock status columns and backfill from time profile"
```

---

## Phase 2: Backend Services

### Task 5: Buat `MachineTimeProfileService`

**Files:**
- Create: `src/modules/machines/machine-time-profile.service.ts`
- Test: `src/modules/machines/__tests__/machine-time-profile.service.test.ts`

```typescript
// src/modules/machines/machine-time-profile.service.ts

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
  /**
   * Ambil active timezone profile untuk satu mesin.
   * Mengembalikan null jika tidak ada profile aktif.
   */
  async getActiveProfile(machineCode: string): Promise<MachineTimeProfile | null> {
    const rows = await query<any>(`
      SELECT TOP 1
        profile_id, machine_code, timezone_mode, offset_minutes,
        valid_from, valid_to, is_active,
        evidence_note, verified_by, verified_at
      FROM attendance_machine_time_profile
      WHERE machine_code = @machineCode
        AND is_active = 1
        AND (valid_to IS NULL OR valid_to > SYSDATETIME())
      ORDER BY valid_from DESC
    `, [{ name: 'machineCode', type: sql.NVarChar, value: machineCode }]);

    if (!rows.length) return null;
    const r = rows[0];
    return {
      profileId: r.profile_id,
      machineCode: r.machine_code,
      timezoneMode: r.timezone_mode as TimezoneMode,
      offsetMinutes: r.offset_minutes,
      validFrom: r.valid_from,
      validTo: r.valid_to,
      isActive: Boolean(r.is_active),
      evidenceNote: r.evidence_note ?? null,
      verifiedBy: r.verified_by ?? null,
      verifiedAt: r.verified_at ?? null,
    };
  }

  /**
   * Normalisasi waktu mesin ke WIB berdasarkan profile aktif.
   * Semua mesin tanpa profile aktif → UNKNOWN, tidak auto-correct.
   */
  normalizeToWib(
    recordTime: Date,
    profile: MachineTimeProfile | null
  ): { scanTime: Date; scanDate: string; correctionStatus: TimeCorrectionStatus; offsetMinutes: number } {
    if (!profile) {
      return {
        scanTime: recordTime,
        scanDate: getWibDateKey(recordTime),
        correctionStatus: 'SKIPPED_UNKNOWN_PROFILE',
        offsetMinutes: 0,
      };
    }

    if (profile.timezoneMode === 'UTC_SOURCE') {
      const corrected = new Date(recordTime.getTime() + profile.offsetMinutes * 60_000);
      return {
        scanTime: corrected,
        scanDate: getWibDateKey(corrected),
        correctionStatus: 'CORRECTED',
        offsetMinutes: profile.offsetMinutes,
      };
    }

    if (profile.timezoneMode === 'WIB_SOURCE') {
      return {
        scanTime: recordTime,
        scanDate: getWibDateKey(recordTime),
        correctionStatus: 'SKIPPED_WIB_ALREADY',
        offsetMinutes: 0,
      };
    }

    // CUSTOM_OFFSET
    const corrected = new Date(recordTime.getTime() + profile.offsetMinutes * 60_000);
    return {
      scanTime: corrected,
      scanDate: getWibDateKey(corrected),
      correctionStatus: 'CORRECTED',
      offsetMinutes: profile.offsetMinutes,
    };
  }

  /**
   * Ambil clock health summary untuk semua mesin.
   */
  async getClockHealthAll(): Promise<MachineClockHealth[]> {
    const [profiles, scanStats] = await Promise.all([
      query<any>(`
        SELECT machine_code, timezone_mode, offset_minutes, clock_status,
               last_clock_checked_at, clock_note
        FROM attendance_machines
        WHERE is_active = 1
      `),
      query<any>(`
        SELECT TOP 30
          machine_code,
          COUNT(*) AS scan_count,
          MIN(DATEPART(HOUR, scan_time)) AS earliest_hour,
          MAX(DATEPART(HOUR, scan_time)) AS latest_hour
        FROM attendance_scan_logs
        WHERE scan_date >= DATEADD(DAY, -30, CAST(SYSDATETIME() AS DATE))
        GROUP BY machine_code
      `),
    ]);

    const statsMap = new Map(scanStats.map(s => [s.machine_code, s]));
    const result: MachineClockHealth[] = [];

    for (const m of profiles) {
      const stats = statsMap.get(m.machine_code);
      const needsCorrection = m.timezone_mode === 'UTC_SOURCE';
      result.push({
        machineCode: m.machine_code,
        timezoneMode: m.timezone_mode as TimezoneMode,
        offsetMinutes: m.timezone_offset_minutes ?? 0,
        clockStatus: m.clock_status as ClockStatus,
        scanCount: stats?.scan_count ?? 0,
        earliestHour: stats?.earliest_hour ?? -1,
        latestHour: stats?.latest_hour ?? -1,
        needsCorrection,
        lastClockCheckedAt: m.last_clock_checked_at ?? null,
        clockNote: m.clock_note ?? null,
      });
    }

    return result;
  }

  /**
   * Simpan profile baru (misal: setelah mesin diperbaiki ke WIB).
   */
  async upsertProfile(params: {
    machineCode: string;
    timezoneMode: TimezoneMode;
    offsetMinutes: number;
    validFrom: Date;
    evidenceNote?: string;
    verifiedBy?: string;
  }): Promise<number> {
    const { machineCode, timezoneMode, offsetMinutes, validFrom, evidenceNote, verifiedBy } = params;

    // Deactivate existing active profiles
    await execute(`
      UPDATE attendance_machine_time_profile
      SET is_active = 0, valid_to = @validFrom
      WHERE machine_code = @machineCode AND is_active = 1
    `, [
      { name: 'machineCode', type: sql.NVarChar, value: machineCode },
      { name: 'validFrom', type: sql.DateTime2, value: validFrom },
    ]);

    // Insert new active profile
    const result = await execute(`
      INSERT INTO attendance_machine_time_profile
        (machine_code, timezone_mode, offset_minutes, valid_from, is_active,
         evidence_note, verified_by, verified_at)
      OUTPUT INSERTED.profile_id
      VALUES (@machineCode, @timezoneMode, @offsetMinutes, @validFrom, 1,
              @evidenceNote, @verifiedBy, SYSDATETIME())
    `, [
      { name: 'machineCode', type: sql.NVarChar, value: machineCode },
      { name: 'timezoneMode', type: sql.NVarChar, value: timezoneMode },
      { name: 'offsetMinutes', type: sql.Int, value: offsetMinutes },
      { name: 'validFrom', type: sql.DateTime2, value: validFrom },
      { name: 'evidenceNote', type: sql.NVarChar, value: evidenceNote ?? null },
      { name: 'verifiedBy', type: sql.NVarChar, value: verifiedBy ?? null },
    ]);

    return result.recordset?.[0]?.profile_id ?? 0;
  }
}

import { query, execute, sql } from '../../lib/db';
import { getWibDateKey } from '../../shared/timezone';

export const machineTimeProfileService = new MachineTimeProfileService();
```

**Step 1: Write the service**

**Step 2: Write the test**

```typescript
// src/modules/machines/__tests__/machine-time-profile.service.test.ts
import { MachineTimeProfileService } from '../machine-time-profile.service';

describe('MachineTimeProfileService.normalizeToWib', () => {
  const service = new MachineTimeProfileService();

  it('UTC_SOURCE: adds offset to scan time', () => {
    // Record jam 22:50 UTC → harus jadi jam 05:50 WIB (+7 jam = +420 menit)
    const utcTime = new Date('2026-06-02T22:50:18.000Z');
    const profile = {
      profileId: 1, machineCode: 'P1B', timezoneMode: 'UTC_SOURCE' as const,
      offsetMinutes: 420, validFrom: new Date(), validTo: null, isActive: true,
      evidenceNote: null, verifiedBy: null, verifiedAt: null,
    };
    const result = service.normalizeToWib(utcTime, profile);
    expect(result.scanTime.toISOString()).toContain('2026-06-03T05:50:18');
    expect(result.correctionStatus).toBe('CORRECTED');
    expect(result.offsetMinutes).toBe(420);
  });

  it('WIB_SOURCE: no change', () => {
    const wibTime = new Date('2026-06-02T05:50:18.000Z');
    const profile = {
      profileId: 2, machineCode: 'PGE', timezoneMode: 'WIB_SOURCE' as const,
      offsetMinutes: 0, validFrom: new Date(), validTo: null, isActive: true,
      evidenceNote: null, verifiedBy: null, verifiedAt: null,
    };
    const result = service.normalizeToWib(wibTime, profile);
    expect(result.scanTime.toISOString()).toBe(wibTime.toISOString());
    expect(result.correctionStatus).toBe('SKIPPED_WIB_ALREADY');
    expect(result.offsetMinutes).toBe(0);
  });

  it('UNKNOWN: no change, SKIPPED_UNKNOWN_PROFILE', () => {
    const anyTime = new Date('2026-06-02T05:50:18.000Z');
    const profile = {
      profileId: 3, machineCode: 'DME', timezoneMode: 'UNKNOWN' as const,
      offsetMinutes: 0, validFrom: new Date(), validTo: null, isActive: true,
      evidenceNote: null, verifiedBy: null, verifiedAt: null,
    };
    const result = service.normalizeToWib(anyTime, profile);
    expect(result.scanTime.toISOString()).toBe(anyTime.toISOString());
    expect(result.correctionStatus).toBe('SKIPPED_UNKNOWN_PROFILE');
  });

  it('null profile: no change, SKIPPED_UNKNOWN_PROFILE', () => {
    const anyTime = new Date('2026-06-02T05:50:18.000Z');
    const result = service.normalizeToWib(anyTime, null);
    expect(result.scanTime.toISOString()).toBe(anyTime.toISOString());
    expect(result.correctionStatus).toBe('SKIPPED_UNKNOWN_PROFILE');
  });

  it('scanDate uses getWibDateKey on corrected time', () => {
    // UTC 22:50 pada 2026-06-02 → WIB jam 05:50 pada 2026-06-03
    // scanDate HARUS = 2026-06-03
    const utcTime = new Date('2026-06-02T22:50:18.000Z');
    const profile = {
      profileId: 1, machineCode: 'P1B', timezoneMode: 'UTC_SOURCE' as const,
      offsetMinutes: 420, validFrom: new Date(), validTo: null, isActive: true,
      evidenceNote: null, verifiedBy: null, verifiedAt: null,
    };
    const result = service.normalizeToWib(utcTime, profile);
    expect(result.scanDate).toBe('2026-06-03');
  });
});
```

**Step 3: Run the tests**

Run: `cd "D:\Gawean Rebinmas\Absensi_Muka" && npx ts-node --esm node_modules/.bin/vitest run src/modules/machines/__tests__/machine-time-profile.service.test.ts` (or use the project's test runner)
Expected: All 5 tests PASS

**Step 4: Commit**

```bash
git add src/modules/machines/machine-time-profile.service.ts \
       src/modules/machines/__tests__/machine-time-profile.service.test.ts
git commit -m "feat: add MachineTimeProfileService with normalizeToWib"
```

---

### Task 6: Buat `TimeCorrectionService`

**Files:**
- Create: `src/modules/attendance/time-correction.service.ts`
- Test: `src/modules/attendance/__tests__/time-correction.service.test.ts`

```typescript
// src/modules/attendance/time-correction.service.ts

import { query, execute, withTransaction, sql } from '../../lib/db';
import { MachineTimeProfileService } from '../machines/machine-time-profile.service';
import { AttendanceProcessService } from './attendance-process-import.service';

export interface CorrectionPreview {
  machineCode: string;
  dateFrom: string;
  dateTo: string;
  offsetMinutes: number;
  affectedRows: number;
  dateChangedRows: number;
  collisionCount: number;
  sample: Array<{
    id: number;
    oldScanTime: string;
    newScanTime: string;
    oldScanDate: string;
    newScanDate: string;
    rawDeviceUserId: string;
  }>;
}

export interface ApplyResult {
  success: boolean;
  batchId: number;
  batchCode: string;
  appliedCount: number;
  error?: string;
}

export class TimeCorrectionService {
  private profileService = new MachineTimeProfileService();
  private processService = new AttendanceProcessService();

  /**
   * Preview koreksi: hitung affected rows, date-changed rows, dan collision
   * tanpa mengubah data sama sekali (SELECT only).
   */
  async previewCorrection(params: {
    machineCode: string;
    dateFrom: string;
    dateTo: string;
    offsetMinutes: number;
  }): Promise<CorrectionPreview> {
    const { machineCode, dateFrom, dateTo, offsetMinutes } = params;

    const [affected, dateChanged, collisions, sample] = await Promise.all([
      // Affected rows (tidak termasuk yang sudah dikoreksi)
      query<any>(`
        SELECT COUNT(*) AS cnt
        FROM attendance_scan_logs
        WHERE machine_code = @machineCode
          AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
      `, [
        { name: 'machineCode', type: sql.NVarChar, value: machineCode },
        { name: 'dateFrom', type: sql.Date, value: dateFrom },
        { name: 'dateTo', type: sql.Date, value: dateTo },
      ]),

      // Rows where date changes after offset applied
      query<any>(`
        SELECT COUNT(*) AS cnt
        FROM attendance_scan_logs
        WHERE machine_code = @machineCode
          AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
          AND CAST(DATEADD(MINUTE, @offsetMinutes, scan_time) AS DATE) <> scan_date
      `, [
        { name: 'machineCode', type: sql.NVarChar, value: machineCode },
        { name: 'dateFrom', type: sql.Date, value: dateFrom },
        { name: 'dateTo', type: sql.Date, value: dateTo },
        { name: 'offsetMinutes', type: sql.Int, value: offsetMinutes },
      ]),

      // Collision check: duplicates after correction
      query<any>(`
        WITH candidate AS (
          SELECT id, machine_code, raw_device_user_id,
                 DATEADD(MINUTE, @offsetMinutes, scan_time) AS new_scan_time
          FROM attendance_scan_logs
          WHERE machine_code = @machineCode
            AND scan_date BETWEEN @dateFrom AND @dateTo
            AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
        )
        SELECT COUNT(*) AS cnt
        FROM candidate c
        JOIN attendance_scan_logs s ON s.machine_code = c.machine_code
            AND s.raw_device_user_id = c.raw_device_user_id
            AND s.scan_time = c.new_scan_time
            AND s.id <> c.id
        WHERE s.machine_code = @machineCode
      `, [
        { name: 'machineCode', type: sql.NVarChar, value: machineCode },
        { name: 'dateFrom', type: sql.Date, value: dateFrom },
        { name: 'dateTo', type: sql.Date, value: dateTo },
        { name: 'offsetMinutes', type: sql.Int, value: offsetMinutes },
      ]),

      // Sample 10 rows
      query<any>(`
        SELECT TOP 10
          id, raw_device_user_id,
          scan_time AS old_scan_time,
          DATEADD(MINUTE, @offsetMinutes, scan_time) AS new_scan_time,
          scan_date AS old_scan_date,
          CAST(DATEADD(MINUTE, @offsetMinutes, scan_time) AS DATE) AS new_scan_date
        FROM attendance_scan_logs
        WHERE machine_code = @machineCode
          AND scan_date BETWEEN @dateFrom AND @dateTo
          AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
        ORDER BY scan_time
      `, [
        { name: 'machineCode', type: sql.NVarChar, value: machineCode },
        { name: 'dateFrom', type: sql.Date, value: dateFrom },
        { name: 'dateTo', type: sql.Date, value: dateTo },
        { name: 'offsetMinutes', type: sql.Int, value: offsetMinutes },
      ]),
    ]);

    return {
      machineCode,
      dateFrom,
      dateTo,
      offsetMinutes,
      affectedRows: affected[0]?.cnt ?? 0,
      dateChangedRows: dateChanged[0]?.cnt ?? 0,
      collisionCount: collisions[0]?.cnt ?? 0,
      sample: sample.map(s => ({
        id: s.id,
        oldScanTime: new Date(s.old_scan_time).toISOString(),
        newScanTime: new Date(s.new_scan_time).toISOString(),
        oldScanDate: String(s.old_scan_date),
        newScanDate: String(s.new_scan_date),
        rawDeviceUserId: s.raw_device_user_id,
      })),
    };
  }

  /**
   * Apply koreksi historis dalam transaction.
   * 1. Buat batch record
   * 2. Insert detail audit
   * 3. Update scan_logs (preserving originals)
   * 4. Rebuild attendance_imports untuk periode tersebut
   */
  async applyCorrection(params: {
    machineCode: string;
    dateFrom: string;
    dateTo: string;
    offsetMinutes: number;
    executedBy: string;
    dryRun?: boolean;
  }): Promise<ApplyResult> {
    const { machineCode, dateFrom, dateTo, offsetMinutes, executedBy, dryRun } = params;

    if (dryRun) {
      const preview = await this.previewCorrection({ machineCode, dateFrom, dateTo, offsetMinutes });
      return {
        success: true, batchId: 0, batchCode: 'DRY-RUN', appliedCount: preview.affectedRows,
      };
    }

    return withTransaction(async (tx) => {
      // Create batch
      const batchCode = `TIMEFIX-${machineCode}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
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
        .query(`
          INSERT INTO attendance_time_correction_batch
            (batch_code, correction_scope, machine_code, date_from, date_to,
             offset_minutes, status, started_at, executed_by, notes)
          OUTPUT INSERTED.batch_id
          VALUES (@batchCode, @scope, @machineCode, @dateFrom, @dateTo,
                  @offsetMinutes, @status, @startedAt, @executedBy, @notes)
        `);
      const batchId = batchResult.recordset[0].batch_id;

      // Insert audit detail
      await tx.request()
        .input('batchId', sql.BigInt, batchId)
        .input('machineCode', sql.NVarChar, machineCode)
        .input('dateFrom', sql.Date, dateFrom)
        .input('dateTo', sql.Date, dateTo)
        .input('offsetMinutes', sql.Int, offsetMinutes)
        .query(`
          INSERT INTO attendance_time_correction_detail
            (batch_id, scan_log_id, machine_code, raw_device_user_id,
             parsed_employee_code, old_scan_time, new_scan_time,
             old_scan_date, new_scan_date, offset_minutes,
             correction_status, correction_reason)
          SELECT
            @batchId, id, machine_code, raw_device_user_id,
            parsed_employee_code, scan_time,
            DATEADD(MINUTE, @offsetMinutes, scan_time),
            scan_date, CAST(DATEADD(MINUTE, @offsetMinutes, scan_time) AS DATE),
            @offsetMinutes, 'CORRECTED',
            'Historical UTC timestamp normalized to WIB'
          FROM attendance_scan_logs
          WHERE machine_code = @machineCode
            AND scan_date BETWEEN @dateFrom AND @dateTo
            AND ISNULL(time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
        `);

      // Update scan logs
      await tx.request()
        .input('batchId', sql.BigInt, batchId)
        .input('machineCode', sql.NVarChar, machineCode)
        .input('dateFrom', sql.Date, dateFrom)
        .input('dateTo', sql.Date, dateTo)
        .input('offsetMinutes', sql.Int, offsetMinutes)
        .query(`
          UPDATE sl
          SET scan_time_original = ISNULL(sl.scan_time_original, sl.scan_time),
              scan_date_original = ISNULL(sl.scan_date_original, sl.scan_date),
              scan_time_wib = DATEADD(MINUTE, @offsetMinutes, sl.scan_time),
              scan_date_wib = CAST(DATEADD(MINUTE, @offsetMinutes, sl.scan_time) AS DATE),
              scan_time = DATEADD(MINUTE, @offsetMinutes, sl.scan_time),
              scan_date = CAST(DATEADD(MINUTE, @offsetMinutes, sl.scan_time) AS DATE),
              time_correction_status = 'CORRECTED',
              time_correction_offset_minutes = @offsetMinutes,
              time_correction_reason = 'Historical UTC timestamp normalized to WIB',
              time_corrected_at = SYSDATETIME(),
              time_corrected_by = @executedBy,
              time_correction_batch_id = @batchId
          FROM attendance_scan_logs sl
          WHERE sl.machine_code = @machineCode
            AND sl.scan_date BETWEEN @dateFrom AND @dateTo
            AND ISNULL(sl.time_correction_status, 'NOT_CHECKED') NOT IN ('CORRECTED', 'ROLLBACKED')
        `);

      // Update batch status
      await tx.request()
        .input('batchId', sql.BigInt, batchId)
        .query(`
          UPDATE attendance_time_correction_batch
          SET status = 'COMPLETED',
              completed_at = SYSDATETIME(),
              applied_count = (
                SELECT COUNT(*) FROM attendance_time_correction_detail
                WHERE batch_id = @batchId
              )
          WHERE batch_id = @batchId
        `);

      return { success: true, batchId, batchCode, appliedCount: 0 }; // appliedCount updated in batch
    });
  }

  /**
   * Rollback correction batch: kembalikan scan_time ke nilai original.
   */
  async rollbackBatch(batchId: number, executedBy: string): Promise<{ success: boolean; rolledBackCount: number }> {
    return withTransaction(async (tx) => {
      // Rollback scan logs
      const rollbackResult = await tx.request()
        .input('batchId', sql.BigInt, batchId)
        .input('executedBy', sql.NVarChar, executedBy)
        .query(`
          UPDATE sl
          SET scan_time = ISNULL(d.old_scan_time, sl.scan_time),
              scan_date = ISNULL(d.old_scan_date, sl.scan_date),
              scan_time_wib = NULL,
              scan_date_wib = NULL,
              time_correction_status = 'ROLLBACKED',
              time_correction_reason = CONCAT('Rollback from batch ', @batchId),
              time_corrected_at = SYSDATETIME(),
              time_corrected_by = @executedBy,
              time_correction_batch_id = NULL
          FROM attendance_scan_logs sl
          JOIN attendance_time_correction_detail d ON d.scan_log_id = sl.id
          WHERE d.batch_id = @batchId
        `);

      // Update batch status
      await tx.request()
        .input('batchId', sql.BigInt, batchId)
        .query(`
          UPDATE attendance_time_correction_batch
          SET status = 'ROLLBACKED', completed_at = SYSDATETIME()
          WHERE batch_id = @batchId
        `);

      return {
        success: true,
        rolledBackCount: rollbackResult.rowsAffected?.[0] ?? 0,
      };
    });
  }

  /**
   * Get correction batch details.
   */
  async getBatchDetail(batchId: number) {
    const [batch, details] = await Promise.all([
      query<any>(`
        SELECT batch_id, batch_code, correction_scope, machine_code,
               date_from, date_to, offset_minutes, status,
               applied_count, skipped_count, error_count,
               started_at, completed_at, executed_by, notes, created_at
        FROM attendance_time_correction_batch
        WHERE batch_id = @batchId
      `, [{ name: 'batchId', type: sql.BigInt, value: batchId }]),

      query<any>(`
        SELECT TOP 50
          detail_id, scan_log_id, machine_code,
          raw_device_user_id, parsed_employee_code,
          old_scan_time, new_scan_time,
          old_scan_date, new_scan_date,
          correction_status, correction_reason, created_at
        FROM attendance_time_correction_detail
        WHERE batch_id = @batchId
        ORDER BY old_scan_time
      `, [{ name: 'batchId', type: sql.BigInt, value: batchId }]),
    ]);

    return { batch: batch[0], details };
  }
}

export const timeCorrectionService = new TimeCorrectionService();
```

**Step 1: Write the service**

**Step 2: Write a basic integration test (mock-free, tests SQL logic via service)**

```typescript
// src/modules/attendance/__tests__/time-correction.service.test.ts
import { TimeCorrectionService } from '../time-correction.service';

describe('TimeCorrectionService', () => {
  const service = new TimeCorrectionService();

  describe('previewCorrection', () => {
    it('returns affected rows count and sample for P1B June 2026', async () => {
      const preview = await service.previewCorrection({
        machineCode: 'P1B',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        offsetMinutes: 420,
      });
      expect(preview.machineCode).toBe('P1B');
      expect(preview.offsetMinutes).toBe(420);
      expect(typeof preview.affectedRows).toBe('number');
      expect(Array.isArray(preview.sample)).toBe(true);
      if (preview.sample.length > 0) {
        const s = preview.sample[0];
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('oldScanTime');
        expect(s).toHaveProperty('newScanTime');
        expect(s).toHaveProperty('oldScanDate');
        expect(s).toHaveProperty('newScanDate');
      }
    });

    it('dryRun does not create a batch', async () => {
      const result = await service.applyCorrection({
        machineCode: 'P1B',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        offsetMinutes: 420,
        executedBy: 'DBA',
        dryRun: true,
      });
      expect(result.success).toBe(true);
      expect(result.batchCode).toBe('DRY-RUN');
      expect(result.batchId).toBe(0);
    });
  });
});
```

**Step 3: Run tests**

**Step 4: Commit**

```bash
git add src/modules/attendance/time-correction.service.ts \
       src/modules/attendance/__tests__/time-correction.service.test.ts
git commit -m "feat: add TimeCorrectionService for preview/apply/rollback"
```

---

### Task 7: Buat `AttendanceRebuildService`

**Files:**
- Create: `src/modules/attendance/attendance-rebuild.service.ts`

Layanan ini dedicated untuk rebuild `attendance_imports` dari `attendance_scan_logs` setelah koreksi waktu. Dipisah dari `AttendanceProcessService` karena rebuild perlu bisa dijalankan per machine + date range (bukan per batch).

```typescript
// src/modules/attendance/attendance-rebuild.service.ts

import { query, execute, sql } from '../../lib/db';

export class AttendanceRebuildService {
  /**
   * Rebuild attendance_imports untuk mesin + periode tertentu.
   * Hapus existing ZKTECO records, lalu insert ulang dari scan_logs.
   * Attendance_status: scan_count >= 2 → HADIR, else INCOMPLETE_SCAN
   */
  async rebuildImports(params: {
    machineCode: string;
    dateFrom: string;
    dateTo: string;
    source?: string;
  }): Promise<{ deleted: number; inserted: number }> {
    const { machineCode, dateFrom, dateTo, source = 'ZKTECO' } = params;

    // Get count before delete
    const before = await query<any>(`
      SELECT COUNT(*) AS cnt FROM attendance_imports
      WHERE machine_code = @machineCode
        AND attendance_date BETWEEN @dateFrom AND @dateTo
        AND source = @source
    `, [
      { name: 'machineCode', type: sql.NVarChar, value: machineCode },
      { name: 'dateFrom', type: sql.Date, value: dateFrom },
      { name: 'dateTo', type: sql.Date, value: dateTo },
      { name: 'source', type: sql.NVarChar, value: source },
    ]);
    const deleted = before[0]?.cnt ?? 0;

    // Delete existing
    await execute(`
      DELETE FROM attendance_imports
      WHERE machine_code = @machineCode
        AND attendance_date BETWEEN @dateFrom AND @dateTo
        AND source = @source
    `, [
      { name: 'machineCode', type: sql.NVarChar, value: machineCode },
      { name: 'dateFrom', type: sql.Date, value: dateFrom },
      { name: 'dateTo', type: sql.Date, value: dateTo },
      { name: 'source', type: sql.NVarChar, value: source },
    ]);

    // Batch size: 500 per INSERT
    const BATCH = 500;
    let totalInserted = 0;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await execute(`
        INSERT INTO attendance_imports (
          employee_id, employee_code, division_code,
          attendance_date, attendance_year, attendance_month,
          check_in_at, check_out_at, total_scans,
          attendance_status, has_work, source, source_reference,
          batch_id, needs_manual_review
        )
        OUTPUT INSERTED.id
        SELECT TOP ${BATCH}
          COALESCE(e.id, NULL) AS employee_id,
          COALESCE(s.current_emp_code, s.parsed_employee_code) AS employee_code,
          COALESCE(d.division_code, s.parsed_division_code, 'UNKNOWN') AS division_code,
          s.scan_date AS attendance_date,
          YEAR(s.scan_date) AS attendance_year,
          MONTH(s.scan_date) AS attendance_month,
          MIN(s.scan_time) AS check_in_at,
          CASE WHEN COUNT(*) >= 2 THEN MAX(s.scan_time) ELSE NULL END AS check_out_at,
          COUNT(*) AS total_scans,
          CASE WHEN COUNT(*) >= 2 THEN 'HADIR'
               WHEN COUNT(*) = 1 THEN 'INCOMPLETE_SCAN'
               ELSE 'NO_DATA' END AS attendance_status,
          CASE WHEN COUNT(*) >= 1 THEN 1 ELSE 0 END AS has_work,
          'ZKTECO' AS source,
          s.machine_code AS source_reference,
          ISNULL(MAX(s.sync_batch_id), 0) AS batch_id,
          CASE WHEN e.id IS NOT NULL THEN 0 ELSE 1 END AS needs_manual_review
        FROM attendance_scan_logs s
        LEFT JOIN employees e ON e.employee_code = s.parsed_employee_code
        LEFT JOIN divisions d ON d.id = e.division_id
        WHERE s.machine_code = @machineCode
          AND s.scan_date BETWEEN @dateFrom AND @dateTo
          AND s.mapping_status = 'MAPPED'
        GROUP BY COALESCE(e.id, NULL), COALESCE(s.current_emp_code, s.parsed_employee_code),
                 COALESCE(d.division_code, s.parsed_division_code, 'UNKNOWN'),
                 s.scan_date, s.machine_code
        OFFSET ${offset} ROWS
      `, [
        { name: 'machineCode', type: sql.NVarChar, value: machineCode },
        { name: 'dateFrom', type: sql.Date, value: dateFrom },
        { name: 'dateTo', type: sql.Date, value: dateTo },
      ]);

      const inserted = result.rowsAffected?.[0] ?? 0;
      totalInserted += inserted;
      offset += BATCH;
      hasMore = inserted === BATCH;
    }

    return { deleted, inserted: totalInserted };
  }
}

export const attendanceRebuildService = new AttendanceRebuildService();
```

**Step 1: Write the service**

**Step 2: Commit**

```bash
git add src/modules/attendance/attendance-rebuild.service.ts
git commit -m "feat: add AttendanceRebuildService for post-correction import rebuild"
```

---

## Phase 3: API Endpoints

### Task 8: Tambah Endpoint di `quality.routes.ts`

**Files:**
- Modify: `src/api/routes/quality.routes.ts` (add at end of file, before last `});`)

```typescript
// ─── Machine Clock Health ──────────────────────────────────────────────────────
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
    profileService.getClockHealthAll().then(list =>
      list.find(h => h.machineCode === machineCode)
    ),
  ]);
  sendJson(ctx.res, 200, { success: true, data: { profile, health } });
});

route('POST', '/api/quality/machine-clock/preview-correction', async (ctx) => {
  const body = ctx.body as {
    machineCode?: string;
    dateFrom?: string;
    dateTo?: string;
    offsetMinutes?: number;
  };
  if (!body.machineCode || !body.dateFrom || !body.dateTo || body.offsetMinutes == null) {
    sendError(ctx.res, 400, 'machineCode, dateFrom, dateTo, offsetMinutes required');
    return;
  }
  const preview = await correctionService.previewCorrection({
    machineCode: body.machineCode,
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
    offsetMinutes: body.offsetMinutes,
  });
  sendJson(ctx.res, 200, { success: true, data: preview });
});

route('POST', '/api/quality/machine-clock/apply-correction', async (ctx) => {
  const body = ctx.body as {
    machineCode?: string;
    dateFrom?: string;
    dateTo?: string;
    offsetMinutes?: number;
    executedBy?: string;
    dryRun?: boolean;
    rebuildImports?: boolean;
  };
  if (!body.machineCode || !body.dateFrom || !body.dateTo || body.offsetMinutes == null) {
    sendError(ctx.res, 400, 'machineCode, dateFrom, dateTo, offsetMinutes required');
    return;
  }
  const result = await correctionService.applyCorrection({
    machineCode: body.machineCode,
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
    offsetMinutes: body.offsetMinutes,
    executedBy: body.executedBy ?? 'API',
    dryRun: body.dryRun ?? false,
  });

  // Rebuild attendance_imports if requested and not dry run
  let rebuildResult = null;
  if (result.success && !body.dryRun && body.rebuildImports !== false) {
    rebuildResult = await rebuildService.rebuildImports({
      machineCode: body.machineCode,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
    });
  }

  sendJson(ctx.res, result.success ? 200 : 500, {
    success: result.success,
    data: { ...result, rebuildResult },
  });
});

route('POST', '/api/quality/machine-clock/rollback', async (ctx) => {
  const body = ctx.body as { batchId?: number; executedBy?: string; rebuildImports?: boolean };
  if (!body.batchId) {
    sendError(ctx.res, 400, 'batchId required');
    return;
  }

  const rollbackResult = await correctionService.rollbackBatch(
    body.batchId,
    body.executedBy ?? 'API'
  );

  // Rebuild attendance_imports after rollback
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

  sendJson(ctx.res, 200, {
    success: rollbackResult.success,
    data: { ...rollbackResult, rebuildResult },
  });
});

route('GET', '/api/quality/machine-clock/batch/:batchId', async (ctx) => {
  const batchId = parseInt(ctx.params.batchId);
  if (!batchId) { sendError(ctx.res, 400, 'invalid batchId'); return; }
  const detail = await correctionService.getBatchDetail(batchId);
  sendJson(ctx.res, 200, { success: true, data: detail });
});
```

**Step 1: Add the import and routes to quality.routes.ts**

**Step 2: Verify routes register correctly**

Run: `npm run build` (to check TypeScript compiles without errors)
Expected: No compilation errors

**Step 3: Commit**

```bash
git add src/api/routes/quality.routes.ts
git commit -m "feat(api): add machine-clock quality endpoints (preview/apply/rollback)"
```

---

## Phase 4: Fix Sync Engine

### Task 9: Update `insertRawScanLog` di `sync-orchestrator.service.ts`

**Files:**
- Modify: `src/modules/import/sync-orchestrator.service.ts`

Ubah fungsi `insertRawScanLog` (baris ~86-137) untuk menggunakan `MachineTimeProfileService.normalizeToWib()`. Profile mesin dibaca sekali di awal `syncViaZkteco()`, lalu setiap record dinormalisasi sebelum insert.

**Step 1: Add import**

Add at top of file (after existing imports):

```typescript
import { MachineTimeProfileService } from '../machines/machine-time-profile.service';
```

**Step 2: Add profileService to constructor**

```typescript
export class SyncOrchestrator {
  constructor(
    private machineService: MachineService,
    private machineRepo: MachineRepository,
    private importJobService: ImportJobService,
    private employeeMappingService: EmployeeMappingService,
    private employeeRepo: EmployeeRepository,
    private sqlClient: SqlClient,
    private mssqlPool?: any
  ) {
    this.profileService = new MachineTimeProfileService();
  }
  private profileService: MachineTimeProfileService;
  // ...
}
```

**Step 3: Update `insertRawScanLog` function signature**

Change `insertRawScanLog` to accept a `profile` parameter:

```typescript
function insertRawScanLog(
  pool: any,
  batchId: number,
  machine: { machine_id: number; machine_code: string; ip_address: string },
  att: RawAttendanceRecord,
  profile: { timezoneMode: string; offsetMinutes: number } | null
): { inserted: boolean } {
```

**Step 4: Update scan time calculation inside `insertRawScanLog`**

Replace the current `scanTime`/`scanDate` calculation:

```typescript
  const rawRecordTime = new Date(
    (att.recordTime ?? att.timestamp ?? att.time) as string | Date
  );
  const scanTime = Number.isNaN(rawRecordTime.getTime())
    ? new Date()
    : rawRecordTime;
  const scanDate = getWibDateKey(scanTime);

  // Normalize to WIB based on machine timezone profile
  // If UTC_SOURCE: add offset; if WIB_SOURCE: keep as-is; if UNKNOWN: keep as-is
  let finalScanTime = scanTime;
  let finalScanDate = scanDate;
  let correctionStatus = 'NOT_CHECKED';

  if (profile) {
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
```

**Step 5: Update INSERT statement to include new columns**

```typescript
  req.query(`
    INSERT INTO attendance_scan_logs
      (machine_id, machine_code, raw_device_user_id, raw_user_sn,
       raw_record_time, raw_ip, zkteco_user_name,
       scan_time, scan_date,
       event_type, verify_type, work_code,
       sync_batch_id, mapping_status,
       time_correction_status, time_correction_offset_minutes)
    VALUES
      (@machineId, @machineCode, @rawDeviceUserId, @rawUserSn,
       @rawRecordTime, @rawIp, @zktecoUserName,
       @scanTime, @scanDate,
       @eventType, @verifyType, @workCode,
       @batchId, 'NEED_REVIEW',
       @correctionStatus, @offsetMinutes)
  `);
```

**Step 6: Add inputs for new columns**

```typescript
    .input('scanTime', pool.mssql.DateTime2, finalScanTime)
    .input('scanDate', pool.mssql.Date, finalScanDate)
    .input('correctionStatus', profile?.timezoneMode === 'UTC_SOURCE' ? 'CORRECTED'
        : profile?.timezoneMode === 'WIB_SOURCE' ? 'SKIPPED_WIB_ALREADY'
        : profile ? 'SKIPPED_UNKNOWN_PROFILE'
        : 'NOT_CHECKED')
    .input('offsetMinutes', pool.mssql.Int, profile?.offsetMinutes ?? 0)
```

**Step 7: Update `syncViaZkteco` to fetch profile before inserting**

Add after machine validation in `syncViaZkteco`:

```typescript
// Get machine timezone profile BEFORE inserting records
const machineProfile = await this.profileService.getActiveProfile(machine.machine_code);
```

Then in the insert loop:

```typescript
for (const att of attendances) {
  const result = insertRawScanLog(
    this.mssqlPool, batchId, machine, att, machineProfile
  );
  attCount++;
  if (result.inserted) newRecordsInserted++;
}
```

**Step 8: Build and verify**

Run: `npm run build`
Expected: Compiles without errors

**Step 9: Commit**

```bash
git add src/modules/import/sync-orchestrator.service.ts
git commit -m "fix(sync): normalize machine timestamps to WIB using timezone profile on insert"
```

`★ Insight ─────────────────────────────────────`
Mengapa sync engine perlu fix duluan sebelum API dan frontend? Karena data baru yang masuk HARI INI juga berpotensi salah timezone. Kalau kita cuma perbaiki data historis tanpa fix sync, masalah yang sama akan terulang di data esok hari. Sync engine adalah "downstream fix" yang memastikan masalah ini tidak pernah muncul lagi — sementara TimeCorrectionService adalah "upstream repair" untuk data yang sudah terlanjur salah.
`─────────────────────────────────────────────────`

---

## Phase 5: Frontend — Machine Clock Health Page

### Task 10: Tambah Types di `frontend/src/types/index.ts`

**Files:**
- Modify: `frontend/src/types/index.ts` (add new types at end)

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
  machineCode: string;
  dateFrom: string;
  dateTo: string;
  offsetMinutes: number;
  affectedRows: number;
  dateChangedRows: number;
  collisionCount: number;
  sample: Array<{
    id: number;
    oldScanTime: string;
    newScanTime: string;
    oldScanDate: string;
    newScanDate: string;
    rawDeviceUserId: string;
  }>;
}

export interface CorrectionBatch {
  batchId: number;
  batchCode: string;
  correctionScope: string;
  machineCode: string;
  dateFrom: string;
  dateTo: string;
  offsetMinutes: number;
  status: string;
  appliedCount: number;
  skippedCount: number;
  errorCount: number;
  startedAt: string | null;
  completedAt: string | null;
  executedBy: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CorrectionBatchDetail {
  batch: CorrectionBatch;
  details: Array<{
    detailId: number;
    scanLogId: number;
    machineCode: string;
    rawDeviceUserId: string;
    parsedEmployeeCode: string;
    oldScanTime: string;
    newScanTime: string;
    oldScanDate: string;
    newScanDate: string;
    correctionStatus: TimeCorrectionStatus;
    correctionReason: string;
    createdAt: string;
  }>;
}

export interface ApplyCorrectionRequest {
  machineCode: string;
  dateFrom: string;
  dateTo: string;
  offsetMinutes: number;
  executedBy?: string;
  dryRun?: boolean;
  rebuildImports?: boolean;
}

export interface ApplyCorrectionResponse {
  success: boolean;
  data: {
    batchId: number;
    batchCode: string;
    appliedCount: number;
    rebuildResult?: { deleted: number; inserted: number };
  };
}
```

---

### Task 11: Tambah API Methods di `frontend/src/services/quality-service.ts`

**Files:**
- Modify: `frontend/src/services/quality-service.ts` (add at end before closing `}`)

```typescript
// ─── Machine Clock Health ──────────────────────────────────────────────────────

export async function getMachineClockHealth(): Promise<MachineClockHealth[]> {
  return requestData<MachineClockHealth[]>('/api/quality/machine-clock');
}

export async function getMachineClockHealthByCode(machineCode: string): Promise<{
  profile: unknown;
  health: MachineClockHealth | null;
}> {
  return requestData(`/api/quality/machine-clock/${encodeURIComponent(machineCode)}`);
}

export async function previewCorrection(params: {
  machineCode: string;
  dateFrom: string;
  dateTo: string;
  offsetMinutes: number;
}): Promise<CorrectionPreview> {
  return requestData<CorrectionPreview>('/api/quality/machine-clock/preview-correction', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function applyCorrection(params: ApplyCorrectionRequest): Promise<ApplyCorrectionResponse> {
  return requestData<ApplyCorrectionResponse>('/api/quality/machine-clock/apply-correction', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function rollbackCorrection(params: {
  batchId: number;
  executedBy?: string;
  rebuildImports?: boolean;
}): Promise<{ success: boolean; data: { rolledBackCount: number; rebuildResult?: unknown } }> {
  return requestData('/api/quality/machine-clock/rollback', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getCorrectionBatchDetail(batchId: number): Promise<CorrectionBatchDetail> {
  return requestData<CorrectionBatchDetail>(
    `/api/quality/machine-clock/batch/${batchId}`
  );
}
```

---

### Task 12: Buat `MachineClockHealthPage`

**Files:**
- Create: `frontend/src/pages/MachineClockHealthPage.tsx`
- Create: `frontend/src/components/features/quality/MachineClockHealthTable.tsx`

```tsx
// frontend/src/pages/MachineClockHealthPage.tsx
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  getMachineClockHealth,
  previewCorrection,
  applyCorrection,
  rollbackCorrection,
  getCorrectionBatchDetail,
} from '../../services/quality-service';
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
  return h < 0 ? '-' : `${String(h).padStart(2, '0')}:00`;
}

export default function MachineClockHealthPage() {
  const { data: machines = [], isLoading, refetch } = useQuery({
    queryKey: ['machine-clock-health'],
    queryFn: getMachineClockHealth,
    refetchInterval: 60_000,
  });

  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<CorrectionPreview | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);

  const previewMutation = useMutation({
    mutationFn: (machineCode: string) =>
      previewCorrection({
        machineCode,
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        offsetMinutes: 420,
      }),
    onSuccess: (data) => {
      setPreviewData(data);
      setShowPreviewModal(true);
    },
  });

  const applyMutation = useMutation({
    mutationFn: (machineCode: string) =>
      applyCorrection({
        machineCode,
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
        offsetMinutes: 420,
        executedBy: 'HR_ADMIN',
        rebuildImports: true,
      }),
    onSuccess: () => {
      setShowPreviewModal(false);
      setConfirmApply(false);
      setPreviewData(null);
      refetch();
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (batchId: number) =>
      rollbackCorrection({ batchId, executedBy: 'HR_ADMIN', rebuildImports: true }),
    onSuccess: () => refetch(),
  });

  if (isLoading) return <div className="p-6">Loading...</div>;

  const needsCorrection = machines.filter(m => m.needsCorrection);
  const healthy = machines.filter(m => !m.needsCorrection && m.clockStatus === 'OK');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Machine Clock Health</h1>
          <p className="text-gray-600">
            {healthy.length} sehat · {needsCorrection.length} perlu koreksi waktu WIB
          </p>
        </div>
        <Button onClick={() => refetch()} variant="secondary">
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Mesin" value={machines.length} />
        <StatCard label="Sehat (WIB)" value={healthy.length} color="green" />
        <StatCard label="UTC Mode (Butuh Koreksi)" value={needsCorrection.length} color="blue" />
        <StatCard label="Unknown" value={machines.filter(m => m.clockStatus === 'UNKNOWN').length} color="gray" />
      </div>

      {/* Machine Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Mesin', 'Timezone Mode', 'Offset', 'Clock Status', 'Total Scan', 'Jam Terawal', 'Jam Terbaru', 'Aksi'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {machines.map((m: MachineClockHealth) => (
              <tr key={m.machineCode} className={m.needsCorrection ? 'bg-blue-50' : ''}>
                <td className="px-4 py-3 font-medium">{m.machineCode}</td>
                <td className="px-4 py-3 text-sm">{m.timezoneMode}</td>
                <td className="px-4 py-3 text-sm">{m.offsetMinutes === 0 ? '-' : `+${m.offsetMinutes} min`}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${CLOCK_STATUS_COLORS[m.clockStatus] ?? 'bg-gray-100'}`}>
                    {m.clockStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">{m.scanCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm">{formatHour(m.earliestHour)}</td>
                <td className="px-4 py-3 text-sm">{formatHour(m.latestHour)}</td>
                <td className="px-4 py-3">
                  {m.needsCorrection && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => previewMutation.mutate(m.machineCode)}
                        disabled={previewMutation.isPending}
                      >
                        {previewMutation.isPending ? 'Loading...' : 'Preview'}
                      </Button>
                    </div>
                  )}
                  {!m.needsCorrection && (
                    <Badge color="green">OK</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && previewData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Preview Koreksi: {previewData.machineCode}</h2>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <StatCard label="Record Terdampak" value={previewData.affectedRows} />
              <StatCard label="Tanggal Berubah" value={previewData.dateChangedRows} color={previewData.dateChangedRows > 0 ? 'yellow' : 'green'} />
              <StatCard label="Collision" value={previewData.collisionCount} color={previewData.collisionCount > 0 ? 'red' : 'green'} />
            </div>

            {previewData.collisionCount > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 font-medium">⚠️ Collision detected! Koreksi tidak boleh dijalankan.</p>
                <p className="text-red-600 text-sm">Ada record yang setelah dikoreksi menghasilkan scan_time DUPLIKAT.</p>
              </div>
            )}

            <h3 className="font-semibold mb-2">Sample Perubahan:</h3>
            <table className="min-w-full text-sm mb-6">
              <thead>
                <tr className="bg-gray-50">
                  {['ID', 'Waktu Lama', 'Waktu Baru', 'Tanggal Lama', 'Tanggal Baru'].map(h => (
                    <th key={h} className="px-3 py-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.sample.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2">{s.id}</td>
                    <td className="px-3 py-2 font-mono text-xs">{new Date(s.oldScanTime).toISOString()}</td>
                    <td className="px-3 py-2 font-mono text-xs text-green-700">{new Date(s.newScanTime).toISOString()}</td>
                    <td className="px-3 py-2">{s.oldScanDate}</td>
                    <td className="px-3 py-2 text-green-700 font-medium">{s.newScanDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setShowPreviewModal(false); setConfirmApply(false); }}>
                Batal
              </Button>
              {previewData.collisionCount === 0 && !confirmApply && (
                <Button variant="primary" onClick={() => setConfirmApply(true)}>
                  Apply Koreksi
                </Button>
              )}
              {confirmApply && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Konfirmasi apply?</span>
                  <Button
                    variant="danger"
                    onClick={() => applyMutation.mutate(previewData.machineCode)}
                    disabled={applyMutation.isPending}
                  >
                    {applyMutation.isPending ? 'Processing...' : 'Ya, Apply'}
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmApply(false)}>
                    Tidak
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'text-green-600',
    blue: 'text-blue-600',
    red: 'text-red-600',
    yellow: 'text-yellow-600',
    gray: 'text-gray-600',
  };
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${colorMap[color ?? 'gray']}`}>{value.toLocaleString()}</div>
    </div>
  );
}
```

**Step 1: Create the page component**

**Step 2: Add to router**

Modify `frontend/src/router.tsx` to add the new page:

```tsx
import MachineClockHealthPage from './pages/MachineClockHealthPage';

// Add route:
// /machine-clock-health → MachineClockHealthPage
```

**Step 3: Add navigation link**

Modify the sidebar (`frontend/src/components/layout/Sidebar/`) to include the Machine Clock Health link under the Quality section.

**Step 4: Verify frontend builds**

Run: `cd "D:\Gawean Rebinmas\Absensi_Muka\frontend" && npm run build`
Expected: Builds successfully

**Step 5: Commit**

```bash
git add frontend/src/pages/MachineClockHealthPage.tsx \
       frontend/src/components/features/quality/MachineClockHealthTable.tsx \
       frontend/src/types/index.ts \
       frontend/src/services/quality-service.ts \
       frontend/src/router.tsx \
       frontend/src/components/layout/Sidebar/
git commit -m "feat(frontend): add Machine Clock Health page with preview/apply/rollback"
```

---

## Phase 6: Validation Queries (Post-Deployment)

### Task 13: Validasi dengan Acceptance Criteria Query

**Files:**
- Create: `sql/validate_time_correction.sql`

```sql
-- ============================================================
-- AC-001: Data Original Aman
-- Result harus 0
-- ============================================================
SELECT COUNT(*) AS violation_count
FROM attendance_scan_logs
WHERE time_correction_status = 'CORRECTED'
  AND scan_time_original IS NULL;

-- ============================================================
-- AC-002: Waktu P1B B0193 Terkoreksi
-- Untuk id tertentu, scan_time harus +7 jam dari sebelum koreksi
-- ============================================================
SELECT TOP 5
    id, machine_code, raw_device_user_id,
    scan_time_original AS old_scan_time,
    scan_time AS new_scan_time,
    DATEDIFF(MINUTE, scan_time_original, scan_time) AS offset_applied_min
FROM attendance_scan_logs
WHERE machine_code = 'P1B'
  AND time_correction_status = 'CORRECTED'
ORDER BY id;

-- ============================================================
-- AC-003: scan_date harus sesuai scan_time
-- Result harus 0
-- ============================================================
SELECT COUNT(*) AS violation_count
FROM attendance_scan_logs
WHERE CAST(scan_time AS DATE) <> scan_date
  AND time_correction_status = 'CORRECTED';

-- ============================================================
-- AC-004: attendance_imports check_in_at WIB
-- ============================================================
SELECT TOP 10
    employee_code, attendance_date,
    check_in_at, check_out_at,
    attendance_status, scan_count
FROM attendance_imports
WHERE machine_code = 'P1B'
  AND attendance_date BETWEEN '2026-06-01' AND '2026-06-30'
  AND source = 'ZKTECO'
ORDER BY employee_code, attendance_date;

-- ============================================================
-- AC-005: Tidak ada collision duplicate
-- Result harus kosong
-- ============================================================
SELECT
    machine_code, raw_device_user_id,
    scan_time, COUNT(*) AS duplicate_count
FROM attendance_scan_logs
WHERE time_correction_status IN ('CORRECTED', 'NOT_CHECKED')
GROUP BY machine_code, raw_device_user_id, scan_time
HAVING COUNT(*) > 1;

-- ============================================================
-- AC-007: Future sync correctness
-- Semua record sync baru harus punya status WIB_SOURCE atau CORRECTED
-- ============================================================
SELECT TOP 20
    machine_code,
    time_correction_status,
    COUNT(*) AS cnt
FROM attendance_scan_logs
WHERE time_correction_status IS NOT NULL
GROUP BY machine_code, time_correction_status
ORDER BY machine_code;
```

**Step 1: Save the SQL file**

**Step 2: Commit**

```bash
git add sql/validate_time_correction.sql
git commit -m "docs: add time correction validation SQL (AC queries)"
```

---

## Implementation Sequence

| Phase | Task | File | Priority |
|-------|------|------|----------|
| 1 | Migration 059 — time_profile table | migrations/059_*.sql | CRITICAL |
| 1 | Migration 060 — batch + detail tables | migrations/060_*.sql | CRITICAL |
| 1 | Migration 061 — scan_logs correction cols | migrations/061_*.sql | CRITICAL |
| 1 | Migration 062 — machines clock cols | migrations/062_*.sql | CRITICAL |
| 2 | MachineTimeProfileService | src/modules/machines/machine-time-profile.service.ts | CRITICAL |
| 2 | TimeCorrectionService | src/modules/attendance/time-correction.service.ts | CRITICAL |
| 2 | AttendanceRebuildService | src/modules/attendance/attendance-rebuild.service.ts | HIGH |
| 3 | Quality API endpoints | src/api/routes/quality.routes.ts | HIGH |
| 4 | Sync orchestrator fix | src/modules/import/sync-orchestrator.service.ts | CRITICAL |
| 5 | Frontend types | frontend/src/types/index.ts | MEDIUM |
| 5 | Frontend API methods | frontend/src/services/quality-service.ts | MEDIUM |
| 5 | MachineClockHealthPage | frontend/src/pages/MachineClockHealthPage.tsx | MEDIUM |
| 6 | Validation SQL | sql/validate_time_correction.sql | HIGH |

## Rollback Strategy

Jika ada masalah setelah deployment:

1. **API rollback**: `POST /api/quality/machine-clock/rollback` dengan `batchId` yang disimpan saat apply
2. **Sync engine revert**: Kembalikan `sync-orchestrator.service.ts` ke versi sebelumnya (undo Task 9)
3. **Database revert**: Jalankan migration rollback jika perlu (backup tables sudah dibuat)

## Production Deployment Checklist

- [ ] Run semua migration 059-062 di production (backup DB sebelumnya!)
- [ ] Deploy backend (sync fix harus running)
- [ ] Test P1B preview: `POST /api/quality/machine-clock/preview-correction` dengan `dryRun: true`
- [ ] Approval dari IT/HR sebelum apply correction
- [ ] Apply correction P1B + rebuild imports
- [ ] Validasi AC queries (Task 13)
- [ ] Monitoring sync 3 hari setelah mesin P1B diperbaiki timezone-nya ke WIB
- [ ] Update `attendance_machine_time_profile` P1B → `WIB_SOURCE` setelah mesin diperbaiki
