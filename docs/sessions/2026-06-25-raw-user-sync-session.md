# Session Context: ZKTeco Raw User Sync First Implementation

**Tanggal:** 2026-06-25
**Topik:** Implementasi arsitektur sync user name dari ZKTeco machine ke database

---

## Problem Statement

Attendance record dari ZKTeco (`getAttendances()`) **tidak selalu membawa user name**. Field `att.name` / `att.userName` sering kosong/null. Akibatnya, `zkteco_user_name` di `attendance_scan_logs` selalu NULL.

**Root cause:** Sistem sebelumnya bergantung pada attendance record untuk nama, padahal user name sebenarnya tersedia dari call terpisah: `getUsers()`.

---

## Solusi: Raw User Sync First

```
getUsers() FIRST → machine_user_raw.user_name
     ↓
getAttendances() SECOND → attendance_scan_logs
     ↓
enrichAttendanceUserNames() → zkteco_user_name terisi
```

### Alur Sync Baru (sync-machines.ts)

1. **Connect** ke ZKTeco machine
2. **getUsers()** → `machine_user_raw` (upsert per user)
3. **getAttendances()** → `attendance_scan_logs` (IF NOT EXISTS dedup)
4. **enrichUserNames()** → UPDATE JOIN: `zkteco_user_name = machine_user_raw.user_name`
5. **Update** `last_sync_at` di `attendance_machines`

---

## Files Diubah

| File | Perubahan |
|------|----------|
| `migrations/059_add_zkteco_user_name_metadata.sql` | Created - kolom metadata + indexes |
| `migrations/060_backfill_zkteco_user_names.sql` | Created - backfill SQL |
| `src/scripts/sync-machines.ts` | Added: `upsertMachineUser()`, `enrichUserNames()`, call di `syncMachine()` |
| `src/modules/import/sync-orchestrator.service.ts` | Updated: enrichment logic |
| `frontend/src/services/attendance-service.ts` | Added: `getDisplayName()`, `getNameSourceBadge()` |
| `src/scripts/run-migrations.ts` | Fixed: auto-discover all .sql files |

---

## Database Schema Changes

### attendance_scan_logs (new columns)

```sql
ALTER TABLE attendance_scan_logs ADD
    zkteco_user_name NVARCHAR(150) NULL,
    zkteco_user_name_source NVARCHAR(30) NULL,        -- ATTENDANCE_RECORD | MACHINE_USER_RAW | UNKNOWN
    zkteco_user_name_synced_at DATETIME2 NULL,
    zkteco_user_name_sync_status NVARCHAR(30) NULL; -- FILLED | NO_RAW_USER | EMPTY_RAW_USER_NAME
```

### machine_user_raw (existing, added tracking)

```sql
ALTER TABLE machine_user_raw ADD
    machine_raw_user_name NVARCHAR(150) NULL,
    first_seen_at DATETIME2 NULL,
    last_seen_at DATETIME2 NULL;
```

---

## Test Results

```
machine_user_raw: 1,228 users tersimpan ✅
attendance_scan_logs: 4,953 records total
  - FILLED (MACHINE_USER_RAW): 1,617 ✅
  - NO_RAW_USER: 3,336 (records tanpa enrollment di machine)
```

### Sample Data (after enrichment)

```
AB2 4000521 | SUARDI (ROHANIAH)     | MACHINE_USER_RAW | FILLED
AB2 4000004 | RIMA MELATI (SERAWATI)| MACHINE_USER_RAW | FILLED
AB2 4000554 | HERI SUTANTO (MUSRI)  | MACHINE_USER_RAW | FILLED
```

---

## Open Issue: parsed_employee_code NULL

### Analisis

Record attendance memiliki `raw_device_user_id` seperti `4000521`:
- Scanner prefix: `400` → AB2 division → locCode = `H`
- Last 4 digits: `0052`
- **Expected parsed_employee_code:** `H0052`

Tapi `parsed_employee_code` **NULL**.

### Root Cause

Mapping pipeline **tidak berjalan**. Berdasarkan investigation sebelumnya (docs/CRITICAL-INVESTIGATION-2026-06-25.md):

1. **attendance_imports EMPTY** — pipeline tidak memproses data
2. **attendance_scan_logs.parsed_employee_code** di-set saat insert raw, tapi sync-machines.ts tidak mengisi kolom ini
3. Attendances tidak melalui SSOT parser

### SSOT Parser Flow (yang seharusnya)

```
raw_device_user_id: "4000521"
     ↓
SSOT Parser: {locCode}{last4}
     ↓
parsed_employee_code: "H0052"
     ↓
Mapping cascade:
  ├─ employee_mapping_overrides? ──→ MANUAL
  ├─ employees.zkteco_user_id ──→ EXACT_LONG_RAW_ID
  ├─ Scanner prefix rule ─────────→ CONVERTED_LONG_RAW_ID: {locCode}{last4}
  └─ Fallback ────────────────────→ NEED_REVIEW
```

### Kenapa parsed_employee_code NULL?

**sync-machines.ts tidak mengisi `parsed_employee_code`** saat insert ke `attendance_scan_logs`. Lihat:

```typescript
// sync-machines.ts - insertRawScan()
.query(`
  INSERT INTO attendance_scan_logs
    (machine_id, machine_code, raw_device_user_id, ...,
     parsed_employee_code, -- ← TIDAK DIISI!
     ...)
```

**Dua pendekatan untuk fix:**

#### Pendekatan A: Isi parsed_employee_code di sync (Recommended)
Tambahkan SSOT parser di `sync-machines.ts`:

```typescript
function parseEmployeeCode(rawDeviceUserId: string, machineCode: string): string | null {
  const locCode = LOC_CODE_MAP[machineCode];
  if (!locCode) return null;
  const last4 = rawDeviceUserId.slice(-4);
  return `${locCode}${last4}`;
}
```

#### Pendekatan B: Parsing di downstream pipeline
Biarkan `attendance_process.service.ts` / `attendance-process-import.service.ts` melakukan parsing. Tapi ini tidak jalan karena pipeline broken.

---

## next Steps

1. [ ] Fix `parsed_employee_code` di `sync-machines.ts` insertRawScan()
2. [ ] Test SSOT parser integration
3. [ ] Rebuild attendance_imports pipeline
4. [ ] Backfill existing records dengan parsed_employee_code

---

## Referensi

- `docs/ZKTECO-RAW-USER-SYNC-FIRST.md` - Arsitektur lengkap
- `docs/CRITICAL-INVESTIGATION-2026-06-25.md` - Database state analysis
- `CLAUDE.md` - SSOT parser rules, scanner → locCode mapping
