# SYNC ARCHITECTURE - Sinkronisasi Database ke Mesin Absen

## Gambaran Sistem

Sistem Absensi PT Rebinmas Jaya menggunakan **sinkronisasi satu arah (one-way)** dari mesin ZKTeco ke database SQL Server. Sistem **TIDAK pernah menulis kembali** data ke mesin ZKTeco.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         16 MESIN ZKTECO                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ... (16 total)           │
│  │  P1A    │ │  P1B    │ │  IJL    │ │  MILL   │                           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘                           │
│       └───────────┴─────┬─────┴───────────┘                                  │
│                        │ TCP (node-zklib)                                     │
└────────────────────────┼─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Node.js Backend (port 8004)                               │
│                                                                              │
│  3 ENTRY POINTS:                                                            │
│  1. Scheduler (child_process fork) — auto 60 min                            │
│  2. HTTP API (POST /api/ops/sync) → SyncOrchestrator                       │
│  3. CLI Script (node dist/scripts/sync-machines.js)                          │
│                                                                              │
│  Data flow:                                                                 │
│  Machines → Import → SSOT Parser → scan_logs → Attendance Pipeline → imports   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Arsitektur Data Flow

```
┌──────────────────┐
│  ZKTeco Machine    │  TCP port 4370
│  (Fingerprint/    │  node-zklib
│   Card)           │
└────────┬─────────┘
         │ TCP getAttendances() + getUsers() — READ ONLY
         ▼
┌──────────────────┐
│  node-zklib        │
│  ZKLib instance   │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  sync-machines.ts / sync-orchestrator.service.ts                           │
│                                                                         │
│  Step 1: SSOT Parser (zkteco-employee-code-parser.ts)                   │
│    raw_device_user_id → parsed_employee_code + parsed_division_code          │
│    mapping_status = 'MAPPED' | 'NEED_REVIEW'                           │
│                                                                         │
│  Step 2: INSERT attendance_scan_logs (IF NOT EXISTS dedup)               │
│    scan_time=WIB, scan_date=WIB                                         │
│    parsed_employee_code, parsed_division_code, mapping_status               │
│                                                                         │
│  Step 3: Enrich zkteco_user_name (machine_user_raw JOIN)                 │
│                                                                         │
│  Step 4: Enrich current_emp_code (NIK resolution cascade)                │
│    employees lookup → hr_employee_current_snapshot → current_emp_code      │
│                                                                         │
│  Step 5: Process attendance_imports (per-batch)                          │
│    GROUP BY (parsed_employee_code, scan_date, machine_code)                 │
│    MIN → check_in_at, MAX → check_out_at, COUNT≥2 → HADIR                │
│    division_code ← employees.division_id → divisions.division_code        │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  rebuild-attendance-imports.js (scheduled, 60 min)                      │
│  Processes ALL pending MAPPED groups (NOT EXISTS idempotent)              │
│  Uses NIK cascade: scan_logs → employees → divisions                     │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SQL Server: rebinmas_absensi_monitoring                                 │
│  attendance_scan_logs (808,093 rows — WIB-corrected)                           │
│  attendance_imports (55,051 rows — all 11 divisions, 99.99% enriched)        │
│  employees (8,005 rows — all with correct division_id)                       │
│  hr_employee_current_snapshot (daily sync from db_ptrj)                      │
│  machine_user_raw (6,293 rows)                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3 Entry Points Sinkronisasi

### 1. Scheduler (Otomatis, Produksi)

```
server.ts (port 8004)
    │
    └── startSchedulerService()
            │
            ├── Global sync (60 min): sync-machines.js (semua mesin)
            │
            ├── attendance_pipeline_sync (60 min): rebuild-attendance-imports.js
            │
            └── hr_snapshot_sync (1440 min / daily): sync-hr-current-snapshot.js
```

**Konfigurasi:** `src/config/schedule.json`
```json
{
  "enabled": true,
  "intervalMinutes": 60,
  "jobs": [
    {
      "id": "attendance_pipeline_sync",
      "name": "Attendance Pipeline Sync",
      "intervalMinutes": 60,
      "enabled": true,
      "script": "dist/scripts/rebuild-attendance-imports.js"
    },
    {
      "id": "hr_snapshot_sync",
      "name": "HR Snapshot Sync",
      "intervalMinutes": 1440,
      "enabled": true,
      "script": "dist/scripts/sync-hr-current-snapshot.js",
      "env": { "HR_DB_SERVER": "10.0.0.110" }
    }
  ]
}
```

### 2. HTTP API (Manual)

```
POST /api/ops/sync
    │
    └── SyncOrchestrator.syncMachine(machineCode)
            │
            ├── connectZkteco() — TCP socket
            ├── upsertMachineUser() — machine_user_raw (getUsers)
            ├── insertRawScan() — scan_logs with SSOT parser
            ├── enrichUserNames() — from machine_user_raw
            ├── enrichCurrentEmpCode() — NIK resolution cascade
            └── processScanLogsForBatch() — → attendance_imports
```

**File:** `src/api/routes/ops.routes.ts`

### 3. CLI Script (Manual)

```bash
# Sinkronisasi semua mesin aktif
node dist/scripts/sync-machines.js

# Filter satu mesin
node dist/scripts/sync-machines.js --machine=P1A

# Rebuild attendance_imports dari scan_logs
node dist/scripts/rebuild-attendance-imports.js

# HR snapshot (daily)
node dist/scripts/sync-hr-current-snapshot.js
```

**Files:** `src/scripts/sync-machines.ts`, `src/scripts/rebuild-attendance-imports.ts`

---

## Complete Sync Flow (CLI Path — sync-machines.ts)

```
sync-machines.ts (standalone CLI)
    │
    ├── connectDb() → mssql ConnectionPool
    │
    ├── Query attendance_machines
    │     WHERE is_active=1 AND data_source='DIRECT_ZKTECO'
    │
    ├── For EACH machine:
    │     │
    │     ├─ createBatch() — INSERT attendance_import_batches
    │     │
    │     ├─ connectZkteco(ip, port, password, timeoutMs)
    │     │     ZKLib instance → createSocket()
    │     │     1500ms handshake timeout
    │     │
    │     ├─ zk.disableDevice()      ← Cegah mesin terima scan baru
    │     ├─ zk.getUsers()          ← Pull enrolled users → machine_user_raw
    │     ├─ zk.getAttendances()     ← Pull raw log
    │     ├─ zk.enableDevice()       ← Selalu jalan (finally{})
    │     └─ zk.disconnect()
    │     │
    │     ├─ For EACH attendance record:
    │     │     │
    │     │     ├─ insertRawScan() [IF NOT EXISTS dedup]
    │     │     │     normalizeRecord() → SSOT parser
    │     │     │     parsed_employee_code, mapping_status, parsed_division_code
    │     │     │
    │     │     └─ rawCount++ / newRecordsInserted++
    │     │
    │     ├─ enrichUserNames() — from machine_user_raw
    │     │
    │     ├─ enrichCurrentEmpCode() — NIK resolution
    │     │     employees.parsed_employee_code → current_emp_code
    │     │
    │     ├─ processScanLogsForBatch() — per-batch → attendance_imports
    │     │     Uses NIK cascade: scan_logs → employees → divisions
    │     │
    │     ├─ Update attendance_import_batches (status, counts)
    │     └─ Update attendance_machines (last_sync_at, access_status)
    │
    └── Summary: success=N/total, raw=N, inserted=N
```

---

## SSOT Employee Code Parser

**File:** `src/modules/mapping/zkteco-employee-code-parser.ts`
**Function:** `parseZktecoUserIdToEmployeeCode()`

### Scanner Code → LocCode Mapping

```
100 → A (P1A)     001 → L (IJL)
200 → J (ARC)
300 → B (P1B)
400 → H (AB2)
500 → C (P2A)
600 → D (P2B)
700 → E (DME)
800 → F (ARA)
900 → G (AB1)
```

### Contoh Mapping

| raw_device_user_id | Scanner | Emp Code | Division |
|--------------------|---------|----------|----------|
| `10044` | 100 (P1A) | `A0044` | P1A |
| `30232` | 300 (P1B) | `B0232` | P1B |
| `5000010` | 500 (P2A) | `C0010` | P2A |
| `7001234` | 700 (DME) | `E1234` | DME |
| `8000001` | 800 (ARA) | `F0001` | ARA |
| `40001` | 400 (AB2) | `H0001` | AB2 |
| `0010022` | — (IJL) | `L0022` | IJL |

### ID Length Rules

| Panjang ID | Contoh | Status | Aksi |
|------------|--------|--------|------|
| 5 digits | `10044` | **MAPPED** | Auto-parse: `{locCode}{last4}` |
| >5 digits, with scanner prefix | `1000044` | **MAPPED** | Strip prefix → `{locCode}{last4}` |
| >5 digits, NO scanner prefix | `3000193` | **NEED_REVIEW** | Check HR match |
| <5 digits | `44` | **NEED_REVIEW** | Manual mapping |

### Priority Cascade

```
Raw ID arrives
    │
    ├─ Format [A-Z][0-9]{4}? ──→ EXACT (already employee code)
    │
    ├─ Numeric, len≤5? ──→ EXCLUDED
    │
    ├─ Numeric, len>5, scanner prefix? ──→ MAPPED: {locCode}{last4}
    │     Allow auto-map if name matches OR no name available
    │
    └─ Numeric, len>5, NO prefix ──→ NEED_REVIEW
```

---

## NIK Resolution Cascade (3-Step)

```
parsed_employee_code (from SSOT parser)
    │
    ├─ [Step 1] employees WHERE employee_code = parsed_employee_code
    │     → e_parsed: id, current_emp_code, nik, division_id
    │
    ├─ [Step 2] employees WHERE employee_code = e_parsed.current_emp_code
    │     AND is_active = 1 AND employee_code != e_parsed.employee_code
    │     → e_current: id, employee_code, employee_name, division_id
    │
    └─ [Step 3] Result for attendance_imports:
          employee_id = COALESCE(e_current.id, e_parsed.id)
          employee_code = COALESCE(e_current.employee_code, e_parsed.employee_code)
          division_code = divisions.division_code WHERE divisions.id = COALESCE(e_current.division_id, e_parsed.division_id)
```

---

## Division Resolution (Critical Fix — 2026-06-25)

**PRIOR: division_code dari `parsed_division_code` (locCode single letter — SALAH)**

**SEKARANG: division_code dari `employees.division_id → divisions.division_code` (BENAR)**

Root cause bug: `hr-employee-sync.service.ts` lookup `divisionMap` dengan key `locCode` (A, B, C...) padahal `divisions.division_code` = (P1A, P2B, DME...). Semua `divisionId = NULL`. **Fixed**: lookup langsung dengan `hr_loc_code` (P1A, P2B...) sebagai key.

---

## Database Tables yang Terlibat

### Tabel Sinkronisasi

| Table | Fungsi | Ditulis Oleh |
|-------|--------|-------------|
| `attendance_import_batches` | Batch audit per sync | sync-machines.ts |
| `attendance_machines` | last_sync_at, access_status | sync-machines.ts |
| `machine_user_raw` | Enrolled users dari mesin | sync-machines.ts + Orchestrator |

### Tabel Data

| Table | Rows | Fungsi | Ditulis Oleh |
|-------|------|--------|-------------|
| `attendance_scan_logs` | 808,093 | Normalized scan records (WIB-corrected) | sync-machines.ts |
| `attendance_imports` | 55,051 | Processed attendance (check_in/out) | rebuild script + processScanLogsForBatch |
| `employees` | 8,005 | SSOT employee identity | hr-employee-sync.service.ts |

### Tabel Mapping

| Table | Fungsi |
|-------|--------|
| `employees` | SSOT — nik, current_emp_code, division_id, zkteco_user_id |
| `hr_employee_current_snapshot` | NIK → EmpCode terbaru dari db_ptrj (daily sync) |
| `employee_code_history` | Riwayat perubahan code per NIK |
| `employee_mapping_overrides` | Manual override per machine |
| `loc_codes` | locCode → division_code mapping |
| `scanner_codes` | scannerCode → division mapping |
| `divisions` | Division master (id, division_code) |

---

## Error Handling

### Connection Failure Classification

| Error | machine.access_status |
|-------|---------------------|
| `ECONNREFUSED` | `PORT_FORWARDING_NEEDED` |
| `ETIMEDOUT` | `TIMEOUT` |
| `ENETUNREACH` | `NETWORK_UNREACHABLE` |
| Auth failed | `AUTH_FAILED` |
| Not ZKTeco | `NOT_ZKTECO` |

### Retry Strategy

- **Tidak ada auto-retry per machine** — scheduler interval retry otomatis
- **Tidak ada exponential backoff**
- **Tidak ada circuit breaker**
- **Failure isolation**: 1 machine gagal ≠ stop machine lain

### Deduplication

```sql
-- attendance_scan_logs dedup key:
(machine_code, raw_device_user_id, raw_record_time)
IF NOT EXISTS → INSERT (idempotent)
```

---

## ZKTeco Service Wrapper

**File:** `src/modules/machines/zkteco.service.ts`

```typescript
class ZktecoService {
  async connect()        // TCP socket
  async fetchUsers()      // disableDevice() → getUsers() → enableDevice()
  async fetchAttendanceRecords()  // disableDevice() → getAttendances() → enableDevice()
  async disconnect()      // Safe: try/catch
  async testAccessibility() // Fast TCP test (5-min cache)
}
```

---

## Monitoring & Troubleshooting

### Check Sync Status

```sql
-- Last sync per machine
SELECT machine_code, last_sync_at, access_status
FROM attendance_machines ORDER BY last_sync_at DESC;

-- attendance_imports by division
SELECT division_code, COUNT(*) as cnt
FROM attendance_imports GROUP BY division_code ORDER BY cnt DESC;

-- Pending unmapped records
SELECT COUNT(*) as unmapped_count
FROM attendance_scan_logs WHERE mapping_status = 'NEED_REVIEW';

-- Attendance pipeline status
SELECT attendance_status, COUNT(*) as cnt
FROM attendance_imports GROUP BY attendance_status;
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Machine unreachable | Port forwarding inactive | Aktifkan port forwarding |
| Auth failed | Wrong password | Update `ZKTECO_PASSWORD` env |
| PGE: 0 attendance records | No zkteco_user_id linkage | Run `sync --machine=OFFICE_PGE` |
| All divisions correct | — | OK |

---

## File Reference

| File | Role |
|------|------|
| `src/scripts/sync-machines.ts` | Primary CLI sync — SSOT parser, NIK enrichment |
| `src/scripts/rebuild-attendance-imports.js` | Full attendance_imports rebuild |
| `src/scripts/sync-hr-current-snapshot.js` | HR snapshot → hr_employee_current_snapshot |
| `src/modules/import/sync-orchestrator.service.ts` | HTTP API sync path |
| `src/modules/machines/zkteco.service.ts` | ZKTeco TCP client wrapper |
| `src/modules/machines/tcp-accessibility.service.ts` | Fast TCP health check |
| `src/modules/scheduler/scheduler.service.ts` | In-memory scheduler |
| `src/modules/attendance/attendance-process-import.service.ts` | Post-sync processor (NIK cascade) |
| `src/modules/mapping/zkteco-employee-code-parser.ts` | SSOT parser |

---

## Catatan Penting

1. **TIDAK ADA reverse sync** — sistem tidak pernah push data ke mesin ZKTeco
2. **Enrollment di mesin dilakukan secara fisik** (fingerprint/card)
3. **node-zklib** hanya READ: `getUsers()` dan `getAttendances()`
4. **attendance_imports division_code** ← `employees.division_id → divisions.division_code` (BUKAN parsed_division_code)
5. **HR sync daily** menjaga `nik`, `current_emp_code`, `hr_loc_code` tetap aktual
6. **attendance_pipeline_sync** (60 min) memastikan semua pending scan_logs masuk attendance_imports
7. **`zkteco_hr_employee_map` DROPPED 2026-06-24** — `vw_attendance_monthly_matrix` rebuilt via `migrations/072_fix_matrix_view_sSOT.sql` — tidak lagi menggunakan tabel mapping tersebut

## ⚠️ Legacy Migrations (DO NOT RE-RUN)

| Migration | Status | Reason |
|-----------|--------|--------|
| `020_update_attendance_views.sql` | DEPRECATED | References `zkteco_hr_employee_map` |
| `023_live_attendance_compat.sql` | DEPRECATED | References `zkteco_hr_employee_map` |
| `072_fix_matrix_view_sSOT.sql` | ACTIVE | Canonical view rebuild (SSOT only) |
| `073_deprecate_legacy_migrations.sql` | ACTIVE | Deprecation marker |
