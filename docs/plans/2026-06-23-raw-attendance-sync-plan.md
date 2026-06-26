# Plan: Raw Attendance Sync — Simplifikasi Sync ke Raw Data Only

**Date:** 2026-06-23
**Author:** Claude Code
**Status:** Draft

---

## Context & Problem Statement

User requirement (verbatim):

> "sinkronisasi itu harus masuk data originalnya aja dulu semuanya original gak harus di mapping dulu. Coba bantu setup cara tarik data dari seluruh mesin absensi itu. Ingat pada saat penarikan kamu tidak boleh menarik dari data yang sudah ada sebelumnya, kamu tidak boleh menduplikasi data yang sudah ditarik. Jadi tidak ada penumpukan data ketika sinkronisasi dilakukan terus-menerus."

**Konsep inti:** Satu karyawan bisa absen di manapun. Yang harus disimpan adalah **data asli dari mesin**: siapa user ID-nya, nama apa, absen di mesin apa, jam berapa, event type (0=in, 1=out). Mapping employee dilakukan terpisah.

**3 constraint kritis:**
1. **READ-ONLY** — tidak boleh hapus/menghapus data di mesin ZKTeco
2. **NO DUPLICATE** — setiap record masuk maksimal sekali, keyed by `(machine_code + raw_device_user_id + raw_record_time)`
3. **RAW DATA FIRST** — mapping employee dilakukan terpisah dari sync, tidak di dalam proses pull data

---

## Goal

**Goal akhir:** Semua data scan dari 16 mesin ZKTeco tersimpan di `attendance_scan_logs` sebagai data mentah (raw), tanpa mapping employee, tanpa duplikat, tanpa kehilangan data.

**Measurable outcomes:**
- Setiap record yang ditarik dari mesin masuk ke database maksimal 1x
- Tidak ada record di mesin yang hilang setelah sync (READ-ONLY)
- Semua field raw (user ID, nama, timestamp, event type) tersimpan lengkap
- Mapping employee (`parsed_employee_code`, `current_emp_code`) dilakukan DI LUAR proses sync

---

## Ekspektasi (Acceptance Criteria)

| # | Ekspektasi | Cara Verifikasi |
|---|---|---|
| E1 | Setiap scan dari mesin masuk ke database maksimal 1x | Query dedup — tidak ada duplicate key violation |
| E2 | Sync berjalan berulang tidak menyebabkan penumpukan data | Sync machine yang sama 2x → records_success kali kedua = 0 |
| E3 | Data di mesin ZKTeco TIDAK berubah/setelah sync | Cek manual di mesin — data masih ada |
| E4 | Semua field raw tersimpan (user ID, nama, timestamp, event_type) | `SELECT` dari `attendance_scan_logs` — semua kolom terisi |
| E5 | `mapping_status` semua record baru = `'NEED_REVIEW'` | Query `WHERE mapping_status <> 'NEED_REVIEW'` → 0 |
| E6 | Batch record tersimpan di `attendance_import_batches` | Batch_id FK valid untuk setiap record baru |
| E7 | Satu mesin gagal TIDAK menghentikan mesin lain | Sync 16 mesin → 15 sukses meskipun 1 gagal |
| E8 | Sync dari mesin offline → batch status = `FAILED` | Query batch status untuk mesin offline |

---

## Known Information

### Mesin & Data ZKTeco

- **16 mesin ZKTeco** di berbagai lokasi perkebunan kelapa sawit
- **TCP port 4370** via `node-zklib`
- Password: `12345`
- Timeout: 30000ms

**Data yang tersedia dari `getAttendances()`:**

| Field dari ZKTeco | Tipe | Contoh | Keterangan |
|---|---|---|---|
| `deviceUserId` / `userId` / `uid` / `id` | string/number | `10044`, `5000010` | ID asli employee di mesin |
| `name` / `userName` | string | `BUDI SANTOSO` | Nama employee di mesin |
| `recordTime` / `timestamp` / `time` | Date/string | `2026-06-23T07:00:00` | Timestamp scan |
| `type` | number | `0` (in), `1` (out) | Event type |
| `verifyType` | number | `1` (fingerprint), `5` (card) | Verify method |
| `workCode` | string | `1`, `2` | Work code |
| `userSn` | string | `123456789` | User serial number |
| `ip` | string | `192.168.1.1` | IP mesin |

### Konvensi ZKTeco

- `type = 0` → Check In (masuk)
- `type = 1` → Check Out (pulang)

### Deduplication

- **Kunci UNIK di database**: `(machine_code, raw_device_user_id, raw_record_time)`
- **Strategi**: `IF NOT EXISTS ... INSERT` — race-safe dengan scheduler single-process
- **Efek**: sync berulang tidak menyebabkan duplikat

### Machine Groups

| Group | IP Range | Machines |
|---|---|---|
| PG1A Estate | `10.0.0.x` | PGE, P1A, P1B, P2A_01, P2B, P2A_02 |
| DME Estate | `103.144.228.42` | DME_01, DME_02 |
| Air Ruak Estate | `103.144.208.154` | APE, AB1, AB2, ARC_01, ARC_02, ARA |
| IJL Estate | `103.144.211.226` | IJL |
| MILL | `103.127.66.32` | MILL |

### Existing Tables

- `attendance_machines` — machine config (code, IP, port, status)
- `attendance_scan_logs` — raw scan records (existing, but currently has mapping columns)
- `attendance_import_batches` — batch audit trail

### Current Code That Needs Changes

- `src/scripts/sync-machines.ts` — CLI sync script, still does mapping inside sync
- `src/modules/import/sync-orchestrator.service.ts` — HTTP API sync path

---

## Requirements

### Core Requirements

1. **Pull raw attendance from all 16 machines** on demand and via scheduler
2. **Store raw data only** — no employee mapping during sync
3. **No duplicate records** — keyed by `(machine_code + raw_device_user_id + raw_record_time)`
4. **READ-ONLY on machines** — never delete/clear data from ZKTeco devices
5. **Batch audit trail** — every sync run recorded in `attendance_import_batches`
6. **Graceful failure** — one machine failure doesn't stop other machines

### Field Mapping (Raw Only)

Each attendance record from `getAttendances()` must be stored as:

| DB Column | Source Field | Notes |
|---|---|---|
| `machine_code` | machine config | From `attendance_machines.machine_code` |
| `raw_device_user_id` | `deviceUserId` (via `pickAbsensiId`) | ID asli dari mesin |
| `zkteco_user_name` | `name` / `userName` | Nama dari mesin |
| `raw_record_time` | `recordTime` | Timestamp asli dari mesin |
| `scan_date` | computed (WIB) | Tanggal di WIB |
| `event_type` | `type` | `0`=in, `1`=out |
| `verify_type` | `verifyType` | `1`=fingerprint, `5`=card |
| `work_code` | `workCode` | Kode kerja |
| `raw_user_sn` | `userSn` | Serial number |
| `sync_batch_id` | batch.id | FK ke batch |
| `mapping_status` | literal `'NEED_REVIEW'` | Mapping dilakukan terpisah |

### Deduplication SQL

```sql
IF NOT EXISTS (
    SELECT 1 FROM attendance_scan_logs
    WHERE machine_code = @machineCode
      AND raw_device_user_id = @rawDeviceUserId
      AND raw_record_time = @rawRecordTime
)
INSERT INTO attendance_scan_logs (...) VALUES (...);
```

### Non-Requirements

- Employee mapping during sync (done separately)
- `getUsers()` enrollment sync (separate concern)
- Data deletion from ZKTeco machines
- Real-time streaming from machines

---

## Implementation Plan

### Phase 1 — Database Schema ✅ DONE

- `zkteco_user_name` column: ADDED
- `uq_scan_logs_dedup` UNIQUE constraint: ADDED
- Backup: `attendance_scan_logs_backup_20260623_233022`
- Rows cleaned: 614,741 duplicates removed → 72,689 clean rows

### Phase 2 — Create `insertRawScan()` Function ✅ DONE

**File:** `src/scripts/sync-machines.ts` — COMPLETE REWRITE

**Functions removed:**
- `resolveHrMapping()` — HR mapping cascade (uses dropped `zkteco_hr_employee_map`)
- `verifyEmployeeCode()` — employee verification
- `mapEmployeeCode()` — employee code mapping
- `namesCompatibleSql()`, `normalizedNameSql()` — HR name matching
- `hrMappingCache` — HR mapping cache
- `scannerPrefixLocMap` — mapping prefix (kept `machineCodeLocMap` for display)
- `hasScannerPrefixMachineConflict()` — conflict detection
- `rebuildImportsForMachineDates()` — MERGE into attendance_imports (mapping step)

**Functions kept:**
- `normalizeRecord()` — timezone conversion (WIB)
- `createBatch()` — batch creation
- `connectZkteco()` — TCP connection
- `syncMachine()` — orchestrator

**New `insertRawScan()`:**
- Reads: `deviceUserId`, `name`/`userName`, `recordTime`, `type`, `verifyType`, `workCode`, `userSn`
- Stores: all raw fields + `zkteco_user_name` + `mapping_status = 'NEED_REVIEW'`
- Dedup: `UNIQUE` constraint guarantees no duplicates
- Idempotent: safe to call repeatedly

**Batch tracking:**
- `records_total` = all records pulled from machine
- `records_success` = new records actually inserted (after dedup)
- `records_failed` = 0 (raw inserts always succeed or skip)

### Phase 3 — Update Batch Recording ✅ DONE

Integrated into `syncMachine()`.

### Phase 4 — Update CLI Script ✅ DONE

`src/scripts/sync-machines.ts` — COMPLETE REWRITE (same file as Phase 2).

### Phase 5 — Update SyncOrchestrator (HTTP API) ✅ DONE

**File:** `src/modules/import/sync-orchestrator.service.ts` — COMPLETE REWRITE

**Key changes:**
- Removed ALL mapping logic from attendance insert loop
- Removed `parsed_employee_code`, `parsed_division_code`, `mapping_reason`, `mappingStatus` columns from insert
- New `insertRawScanLog()` function — raw data only, `mapping_status = 'NEED_REVIEW'`
- Added `mssqlPool` injection for direct writes to `attendance_scan_logs` (bypasses HTTP gateway → correct DB)
- Removed `unmappedCount` warn logging for attendance records
- `attendances` loop no longer calls `employeeMappingService` methods

**Note:** Orchestrator sync now warns if `mssqlPool` not configured — attendance writes skipped in that case. The CLI (`sync-machines.ts`) remains the primary sync path.

### Phase 6 — Testing

**Test scenarios:**

| Scenario | Expected |
|---|---|
| Sync machine with 0 new records | Batch created, 0 inserted |
| Sync machine with 100 new records | 100 inserted |
| Sync same machine again (same data) | 0 new inserted (dedup) |
| Sync machine with mixed: new + existing | Only new inserted |
| Machine offline | Batch FAILED, other machines continue |

**Verification SQL:**

```sql
-- Check dedup is working
SELECT machine_code, raw_device_user_id, COUNT(*) as cnt
FROM attendance_scan_logs
GROUP BY machine_code, raw_device_user_id
HAVING COUNT(*) > 1;

-- Check mapping status is NEED_REVIEW
SELECT mapping_status, COUNT(*) as cnt
FROM attendance_scan_logs
GROUP BY mapping_status;

-- Check all records have event_type
SELECT machine_code, event_type, COUNT(*) as cnt
FROM attendance_scan_logs
GROUP BY machine_code, event_type;
```

---

## File Changes Summary

| File | Action | Status |
|---|---|---|
| `src/scripts/sync-machines.ts` | COMPLETE REWRITE — raw only, no mapping | ✅ DONE |
| `src/modules/import/sync-orchestrator.service.ts` | COMPLETE REWRITE — strip mapping, add mssql direct write | ✅ DONE |
| `migrations/057_add_zkteco_user_name_to_scan_logs.sql` | Schema changes | ✅ DONE |
| `src/scripts/cleanup-scan-log-duplicates-all.ts` | Dedup cleanup (one-time, 614K rows removed) | ✅ DONE |
| `src/scripts/run-057-migration.ts` | Helper script (temp) | ✅ Created |

## Rollback Plan

1. Revert `sync-machines.ts` to previous version (git)
2. Revert `sync-orchestrator.service.ts` if needed
3. Database schema unchanged (no destructive changes)

---

## Open Questions

1. **Do we need to also pull `getUsers()` data?** — Daftar user yang terdaftar di mesin (enrollment). Separate concern from attendance logs.
2. **What to do with existing `parsed_employee_code` column in `attendance_scan_logs`?** — Keep it (NULL for new records), fill via separate mapping job.
3. **Should `attendance_import_batches.records_total` count all pulled records or only new inserts?** — Count all pulled (mesin doesn't clear), records_success = new inserts only.

---

## Test Plan

### Pre-Conditions
- Database `rebinmas_absensi_monitoring` accessible
- Minimal 1 mesin ZKTeco accessible (for live test)
- Backend TypeScript compiles clean
- CLI script runs without errors

### Test Categories

#### T1 — Deduplication Tests

| ID | Scenario | Steps | Expected Result | Pass Criteria |
|----|----------|-------|----------------|---------------|
| T1.1 | Sync machine, data baru | 1. Sync mesin P1A (dengan data baru) | Semua record di-insert | `records_success = N` |
| T1.2 | Sync machine, data duplikat | 1. Sync mesin P1A lagi | 0 record inserted | `records_success = 0` |
| T1.3 | Sync mesin berbeda, data sama | 1. Sync P1A → data baru<br>2. Sync P1B → data employee yang sama | Masing-masing di-insert (beda mesin) | Count > 0 untuk kedua batch |

```sql
-- T1 verify: Tidak ada duplikat di database
SELECT machine_code, raw_device_user_id, raw_record_time, COUNT(*) as cnt
FROM attendance_scan_logs
GROUP BY machine_code, raw_device_user_id, raw_record_time
HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

#### T2 — Raw Data Completeness Tests

| ID | Scenario | Steps | Expected Result | Pass Criteria |
|----|----------|-------|----------------|---------------|
| T2.1 | Record memiliki zkteco_user_name | 1. Sync mesin dengan user yang punya nama | `zkteco_user_name` terisi | `zkteco_user_name IS NOT NULL` |
| T2.2 | Record memiliki event_type | 1. Sync mesin | `event_type` = 0 atau 1 | `event_type IN (0, 1)` |
| T2.3 | Record memiliki scan_date | 1. Sync mesin | `scan_date` valid date | `scan_date IS NOT NULL` |
| T2.4 | Record mapping_status = NEED_REVIEW | 1. Sync mesin | Semua record baru = `NEED_REVIEW` | `COUNT WHERE mapping_status = 'NEED_REVIEW' = N` |

```sql
-- T2 verify: Semua field raw terisi
SELECT TOP 10
  machine_code,
  raw_device_user_id,
  zkteco_user_name,
  raw_record_time,
  scan_date,
  event_type,
  verify_type,
  mapping_status
FROM attendance_scan_logs
ORDER BY id DESC;
```

#### T3 — Machine Failure Isolation Tests

| ID | Scenario | Steps | Expected Result | Pass Criteria |
|----|----------|-------|----------------|---------------|
| T3.1 | Satu mesin offline | 1. Sync all machines<br>2. Mesin offline tidak bisa connect | Mesin offline = `FAILED`, mesin lain = `SUCCESS` | Mesin yang connect tetap tersync |
| T3.2 | Batch record untuk mesin gagal | 1. Sync mesin offline | Batch dengan status `FAILED` tetap dibuat | `attendance_import_batches` row exists |

```sql
-- T3 verify: Batch record ada untuk mesin yang gagal
SELECT machine_code, status, records_total, records_success, error_message
FROM attendance_import_batches
WHERE status = 'FAILED'
ORDER BY started_at DESC;
```

#### T4 — Batch Audit Trail Tests

| ID | Scenario | Steps | Expected Result | Pass Criteria |
|----|----------|-------|----------------|---------------|
| T4.1 | Batch record terbuat | 1. Sync mesin | `attendance_import_batches` row baru | `batch_id` valid FK di scan logs |
| T4.2 | records_total vs records_success | 1. Sync mesin (re-run) | `records_total` = semua data, `records_success` = 0 | `records_success < records_total` |

```sql
-- T4 verify: Batch audit trail
SELECT
  batch_code,
  machine_id,
  status,
  records_total,
  records_success,
  records_failed,
  started_at,
  completed_at
FROM attendance_import_batches
ORDER BY started_at DESC;
```

#### T5 — READ-ONLY Machine Tests

| ID | Scenario | Steps | Expected Result | Pass Criteria |
|----|----------|-------|----------------|---------------|
| T5.1 | Data tidak dihapus dari mesin | 1. Sync mesin<br>2. Sync lagi | Mesin memiliki data yang SAMA sebelum dan sesudah | Count data di mesin tetap sama |

```typescript
// Pseudo-test: Bandingkan jumlah record dari mesin sebelum dan sesudah
const before = await zk.getAttendances();
await syncMachine(machine);
const after = await zk.getAttendances();
// after.length harus >= before.length (tidak kurang)
```

### Test Execution Order

```
1. T2 (completeness) — Pastikan schema benar
2. T1 (deduplication) — Pastikan constraint benar
3. T4 (batch audit) — Pastikan tracking benar
4. T3 (failure isolation) — Pastikan error handling benar
5. T5 (READ-ONLY) — Pastikan mesin tidak berubah
```

### Success Criteria

**ALL tests MUST pass before deployment:**

- [ ] T1.1 — New records inserted
- [ ] T1.2 — Duplicate records skipped (0 inserted)
- [ ] T1.3 — Different machines allow same user+time
- [ ] T2.1 — `zkteco_user_name` present
- [ ] T2.2 — `event_type` present and valid (0 or 1)
- [ ] T2.3 — `scan_date` valid
- [ ] T2.4 — All new records = `NEED_REVIEW`
- [ ] T3.1 — Offline machine doesn't block others
- [ ] T3.2 — Failed batch recorded
- [ ] T4.1 — Batch record exists
- [ ] T4.2 — records_total vs records_success correct
- [ ] T5.1 — Machine data unchanged after sync
