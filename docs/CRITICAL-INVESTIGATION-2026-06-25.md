# CRITICAL INCIDENT REPORT: Database Wipe & Attendance Pipeline Collapse

**Document ID**: INCIDENT-2026-06-25-001
**Tanggal**: 2026-06-25
**Severity**: **CRITICAL / P0**
**Status**: INVESTIGASI SELESAI
**Database**: `rebinmas_absensi_monitoring` @ `10.0.0.110`

---

## EXECUTIVE SUMMARY

**Kondisi Saat Ini**: Seluruh tabel utama production database **KOSONG**. Data 788,915 records attendance scan log tersedia di backup table (`attendance_scan_logs_backup_20260623_233022`) tapi **tidak di-restored** ke tabel aktif. Sistem attendance import pipeline **RUSAK** — tidak memproses employee non-G dengan benar. Investigation of record ID 3000193 (B0193 / USWATUL HASANAH) reveals the system has multiple systemic failures that require a **complete system rebuild**.

**Kerusakan Found**:
1. **Database wipe** — `attendance_scan_logs`, `employees`, `attendance_imports`, `attendance_machines` semua **KOSONG**
2. **attendance_imports pipeline** hanya memproses G-employees (123 employees, 4,161 records)
3. **B-employees (P1B, P1A)** tidak pernah masuk `attendance_imports`
4. **Clock issue** — mesin ZKTeco menyimpan jam dalam UTC bukan WIB
5. **Batch failures** — banyak batch dengan error `"Invalid object name 'attendance_imports'."`

**Dampak**: Frontend tidak bisa menampilkan data absensi. Semua API yang bergantung pada tabel aktif return kosong. Sistem **TIDAK BISA PRODUKSI**.

---

## BAGIAN 1: DATABASE STATE — KONDISI SAAT INI

### 1.1 Tabel Utama: SEMUA KOSONG

| Tabel | Baris | Status |
|-------|-------|--------|
| `attendance_scan_logs` | **0** | ❌ KOSONG |
| `attendance_imports` | **0** | ❌ KOSONG |
| `employees` | **0** | ❌ KOSONG |
| `attendance_machines` | **0** | ❌ KOSONG |
| `attendance_import_batches` | **~60** | ⚠️ Ada tapi batch_id VARCHAR vs bigint mismatch |
| `attendance_manual_corrections` | **0** | ❌ KOSONG |

**Catatan**: `attendance_imports` sebelumnya ada 4,161 records (G-employees only) tapi sekarang juga 0. Diduga di-wipe antara 2026-06-23 dan sekarang.

### 1.2 Backup Table: DATA MASIH ADA

| Backup Table | Baris | Tanggal Backup |
|---|---|---|
| `attendance_scan_logs_backup_20260623_233022` | **788,915** | 2026-06-23 23:30 UTC |
| `attendance_scan_logs_backup_20260623_233115` | ? | 2026-06-23 23:31 UTC |
| `attendance_scan_logs_unmapped_backup_20260623` | ? | 2026-06-23 23:?? |
| `attendance_scan_logs_linked_backup_20260623` | ? | 2026-06-23 23:?? |
| `zkteco_hr_employee_map_backup_20260623` | ? | 2026-06-23 |
| `employees_backup_20260623` | ? | 2026-06-23 |
| `zkteco_absensi_user_registry_backup_current_empcode_20260623` | ? | 2026-06-23 |

**Action**: Data di backup table **BELUM direstore** ke tabel aktif.

### 1.3 Schema: Tabel Utama

#### `attendance_scan_logs` (18 columns)

```
id                    bigint        NOT NULL  -- Primary key
machine_id            int           NULL
machine_code          nvarchar      NOT NULL  -- P1B, AB1, DME_01, dll
raw_device_user_id    nvarchar      NOT NULL  -- 5-7 digit ID dari mesin
raw_user_sn           nvarchar      NULL
raw_record_time       datetime2     NOT NULL  -- Timestamp ASAL dari mesin (UTC!)
raw_ip                nvarchar      NULL
parsed_employee_code   nvarchar      NULL      -- Hasil parsing: B0193, G0007, dll
parsed_division_code   nvarchar      NULL      -- Hasil parsing: B, G, E, dll
mapping_status        nvarchar      NOT NULL  -- MAPPED / NEED_REVIEW / INVALID
mapping_reason        nvarchar      NULL      -- SANITIZE_041_LONG_RAW_ID_HR_MATCH, dll
scan_time             datetime2     NOT NULL  -- BUG: Salinan raw_record_time (UTC)
scan_date             date          NOT NULL  -- BUG: Tanggal dari scan_time (UTC), bukan WIB
event_type            nvarchar      NULL
verify_type           nvarchar      NULL
work_code             nvarchar      NULL
sync_batch_id         bigint        NULL      -- Foreign key ke attendance_import_batches.id
created_at            datetime2     NOT NULL  -- Timestamp record dibuat (UTC)
```

**⚠️ CRITICAL BUG**: `scan_time` dan `scan_date` menyimpan nilai dari `raw_record_time` (UTC) TANPA konversi ke WIB. Ini berarti semua data attendance untuk jam 22:00-23:00 UTC (05:00-06:00 WIB dini hari) akan tercatat di tanggal yang salah (UTC date, bukan WIB date).

#### `attendance_imports` (22 columns)

```
id                    bigint        NOT NULL  -- Primary key
employee_id            int           NOT NULL  -- FK ke employees.id
employee_code          nvarchar      NOT NULL  -- B0193, G0007, dll
division_code          nvarchar      NOT NULL  -- B, G, E, dll
gang_code              nvarchar      NULL
attendance_date        date          NOT NULL  -- Tanggal attendance (WIB)
attendance_year        int           NOT NULL
attendance_month       int           NOT NULL
check_in_at           datetime2     NULL      -- Jam check-in (WIB?)
check_out_at          datetime2     NULL      -- Jam check-out (WIB?)
attendance_status     nvarchar      NOT NULL  -- HADIR, TIDAK_HADIR, dll
has_work              bit           NOT NULL  DEFAULT 0
is_leave              bit           NOT NULL  DEFAULT 0
is_sick               bit           NOT NULL  DEFAULT 0
is_holiday            bit           NOT NULL  DEFAULT 0
overtime_hours        decimal       NOT NULL  DEFAULT 0
source                nvarchar      NOT NULL  -- ZKTECO
source_reference      nvarchar      NULL      -- Machine code atau raw ID
batch_id              bigint        NULL      -- FK ke attendance_import_batches
raw_scan_log_id       bigint        NULL      -- FK ke attendance_scan_logs
created_at            datetime2     NOT NULL
needs_manual_review    bit           NOT NULL  DEFAULT 0
```

#### `attendance_import_batches` (14 columns)

```
id                    bigint        NOT NULL  -- Primary key
batch_code            nvarchar      NOT NULL  -- P1B-2026-06-18T16-32-40-843Z
source                nvarchar      NOT NULL  -- DIRECT_ZKTECO
machine_id            int           NULL      -- FK ke attendance_machines
division_code         nvarchar      NULL
period_start          date          NULL
period_end            date          NULL
status                nvarchar      NOT NULL  -- RUNNING / SUCCESS / FAILED
started_at            datetime2     NOT NULL
finished_at           datetime2     NULL
records_total         int           NOT NULL
records_success       int           NOT NULL
records_failed        int           NOT NULL
error_message         nvarchar      NULL
```

#### `attendance_machines` (17 columns)

```
id                    int           NOT NULL
machine_code           nvarchar      NOT NULL  -- P1B, AB1, dll
location_name          nvarchar      NOT NULL
ip_address            nvarchar      NULL
port                  int           NULL
local_ip              nvarchar      NULL
machine_type          nvarchar      NOT NULL  -- ZKTECO
scanner_code          int           NULL      -- 100, 200, 300, dll
loc_code              nvarchar      NULL      -- A, B, C, E, dll (division letter)
access_status         nvarchar      NOT NULL
data_source           nvarchar      NOT NULL  -- DIRECT_ZKTECO
notes                 nvarchar      NULL
is_active             bit           NOT NULL
last_sync_at          datetime2     NULL
last_error_message    nvarchar      NULL
created_at            datetime2     NOT NULL
updated_at            datetime2     NULL
```

#### `employees` (9 columns)

```
id                    int           NOT NULL
employee_code         nvarchar      NOT NULL  -- B0193, G0007, dll
employee_name         nvarchar      NOT NULL
division_id           int           NOT NULL  -- FK ke divisions
gang_id               int           NULL
employment_status     nvarchar      NOT NULL
is_active             bit           NOT NULL
created_at            datetime2     NOT NULL
updated_at            datetime2     NULL
```

#### `attendance_manual_corrections` (20 columns)

```
id                    bigint        NOT NULL
employee_id           int           NOT NULL
employee_code         nvarchar      NOT NULL
division_code         nvarchar      NOT NULL
gang_code             nvarchar      NULL
attendance_date       date          NOT NULL
attendance_status     nvarchar      NOT NULL
check_in_at           datetime2     NULL
check_out_at          datetime2     NULL
has_work              bit           NOT NULL  DEFAULT 0
is_leave              bit           NOT NULL  DEFAULT 0
is_sick               bit           NOT NULL  DEFAULT 0
is_holiday            bit           NOT NULL  DEFAULT 0
overtime_hours        decimal       NOT NULL  DEFAULT 0
reason                nvarchar      NOT NULL
is_deleted            bit           NOT NULL  DEFAULT 0
created_by            int           NULL
updated_by            int           NULL
created_at            datetime2     NOT NULL
updated_at            datetime2     NULL
```

### 1.4 Views (Semua KOSONG karena tabel sumber kosong)

| View | Fungsi |
|------|--------|
| `vw_attendance_final` | Attendance final per employee per day |
| `vw_attendance_daily_summary` | Daily summary |
| `vw_attendance_monthly_matrix` | Monthly matrix |
| `vw_attendance_monthly_summary` | Monthly summary |
| `vw_attendance_zkteco_daily_summary` | ZKTeco daily summary |
| `vw_attendance_zkteco_final` | ZKTeco final |
| `vw_attendance_zkteco_monthly_summary` | ZKTeco monthly |
| `vw_employee_master_clean` | Employee master |
| `vw_sync_latest_status` | Latest sync status |

---

## BAGIAN 2: ATTENDANCE IMPORT PIPELINE — SYSTEMIC FAILURES

### 2.1 Pipeline Architecture (Current)

```
ZKTeco Machine (TCP:4370)
  ↓
getAttendances() → raw_device_user_id + raw_record_time (UTC)
  ↓
insertRawLog() → attendance_scan_logs (UTC timestamps)
  ↓
rebuildImportsForMachineDates() → attendance_imports
  ↓
MIN(scan_time) → check_in_at
MAX(scan_time) → check_out_at
COUNT ≥ 2 → attendance_status = 'HADIR'
```

### 2.2 FAILURE #1: attendance_imports KOSONG untuk Non-G Employees

**Bukti**: Dari backup table:

```
Division  Total Scans  Unique Employees
G         436,578      135
H         192,777      109
J          45,568      238
E          47,284      176
A          27,410      175
B          27,853      163
L           9,103       45
F           1,654        2
D             343        4
C             282        4
─────────────────────────────
TOTAL      788,915      ~1,051
```

**Tapi `attendance_imports` hanya punya**:
- 123 G-employees (hanya divisi G)
- 4,161 total records
- Date range: 2000-01-01 hingga 2026-06-23
- Batch 1065: 4,160 records
- Batch 1062: 1 record

**Semua employee A, B, C, D, E, F, H, J, L TIDAK PERNAH masuk `attendance_imports`**.

### 2.3 FAILURE #2: Batch Processing Errors

**Batch 570 & 571** (AB1, 2026-06-20):
```
error_message: "Invalid object name 'attendance_imports'."
status: FAILED
```

**Arti**: Tabel `attendance_imports` BELUM ada atau tidak accessible saat batch berjalan. Ini berarti pipeline mencoba INSERT ke tabel yang belum ready.

### 2.4 FAILURE #3: Type Mismatch — batch_id VARCHAR vs bigint

**Schema inspection reveals**:
- `attendance_import_batches.id` = `bigint`
- `attendance_imports.batch_id` = `bigint`
- `attendance_scan_logs.sync_batch_id` = `bigint`

**Tapi di data actual**:
```sql
-- attendance_imports.batch_id = '1062', '1065' (stored as VARCHAR in result)
-- attendance_scan_logs.sync_batch_id = '62', '3', dll (stored as VARCHAR)
```

**Root cause**: Nilai numeric di-INSERT tanpa CAST explisit, atau frontend query CONVERT ke VARCHAR otomatis.

### 2.5 FAILURE #4: Pipeline Hanya Olah G-Employees

Dari Q1 earlier — `attendance_imports` hanya berisi G-employees. Kemungkinan penyebab:
1. Pipeline filter berdasarkan division_code = 'G'
2. Mapping cascade gagal untuk semua non-G employees
3. JOIN condition salah antara scan_logs dan employees table

---

## BAGIAN 3: CLOCK ISSUE — ZKTECO STORES UTC NOT WIB

### 3.1 Evidence

Dari backup table analysis:

```
Machine      Scan Date (UTC)    Jam UTC    Jam WIB         Actual Day
AB1         2026-06-02        22:54      05:54 (3 Jun)   Tgl 3, 05:54 WIB
AB1         2026-06-02        23:01      06:01 (3 Jun)   Tgl 3, 06:01 WIB
P1B         2026-06-02        22:50      05:50 (3 Jun)   Tgl 3, 05:50 WIB
P1B         2026-06-03        07:43      14:43 (3 Jun)   Tgl 3, 14:43 WIB
```

**Pola**: Semua mesin scan di jam 22:00-23:00 UTC = 05:00-06:00 WIB (dini hari). Ini menunjukkan:
- Clock mesin di-set ke UTC
- Jam kerja normal 06:00-18:00 WIB = 23:00-11:00 UTC
- Scan checkout di 22:54 UTC = 05:54 WIB

### 3.2 Root Cause: `scan_time` and `scan_date` Not Timezone-Aware

```typescript
// Current (BUGGY):
const scanTime = new Date(rawRecordTime);  // rawRecordTime = UTC from machine
await insertRawLog({
  scan_time: scanTime,           // BUG: Stored as UTC, not WIB
  scan_date: scanTime.toISOString().split('T')[0]  // BUG: UTC date, not WIB date
});

// CORRECT:
const wibTime = addHours(new Date(rawRecordTime), 7);  // Convert UTC to WIB
await insertRawLog({
  scan_time: wibTime,           // Correct: WIB timestamp
  scan_date: wibTime.toISOString().split('T')[0]  // Correct: WIB date
});
```

### 3.3 Impact

1. **Tanggal SALAH**: Record jam 22:00 UTC (05:00 WIB) tercatat di tanggal UTC — di SQL Server jadi UTC date yang lebih lambat 7 jam
2. **Attendance matrix SALAH**: Jika scan_date = UTC date, maka checkout jam 05:00 WIB tercatat di tanggal berikutnya
3. **Daily aggregation SALAH**: `attendance_imports` menggunakan scan_date untuk grouping — jadi record yang seharusnya di tanggal 1 (WIB) malah masuk tanggal 2 (UTC)

### 3.4 Historical Data Affected

```
Tanggal UTC vs WIB:
Jam 22:00-23:00 UTC = 05:00-06:00 WIB (next day)
Jam 06:00-23:00 UTC = 13:00-06:00 WIB (same day, but 13:00 = 1 PM!)

Artinya:
- Semua scan checkout di 05:00-06:00 WIB → masuk tanggal UTC previous day
- Semua scan di mesin P1B yang anomalous jam 07:43 UTC (14:43 WIB) → jam 2 PM, bukan jam kerja normal
```

---

## BAGIAN 4: CASE STUDY — RECORD ID 66667 (B0193 / USWATUL HASANAH)

### 4.1 Record Details

```
Field                  Value
────────────────────── ──────────────────────
id                     66667
machine_code           P1B
raw_device_user_id     3000193 (7-digit LONG ID)
parsed_employee_code   B0193
parsed_division_code   B
mapping_status         MAPPED
mapping_reason         SANITIZE_041_LONG_RAW_ID_HR_MATCH
raw_record_time        2026-06-02 22:50:18 UTC
scan_time              2026-06-02 22:50:18 UTC  ← BUG: same as UTC
scan_date              2026-06-02 (UTC date)   ← BUG: should be 2026-06-03 WIB
sync_batch_id          62
created_at             2026-06-18 16:32:58
```

### 4.2 Employee Verification

| Field | Value |
|-------|-------|
| Employee Code | B0193 |
| Name | USWATUL HASANAH (PARSIYAH) |
| Location | P1B |
| Status | 1 (ACTIVE) |
| Created | 2019-04-02 |

### 4.3 B0193 Attendance Pattern (from backup, 115 records)

```
Tanggal di DB (UTC)   Jam UTC      Jam WIB        Keterangan
──────────────────────────────────────────────────────────────
2026-06-02           22:50:18    05:50 (3 Jun)  ← Checkout Tgl 1
2026-06-03           07:43:38    14:43          ← Anomalous: 2 PM!
2026-06-03           22:49:14    05:49 (4 Jun)  ← Checkout Tgl 3
2026-06-04           07:25:24    14:25          ← Anomalous: 2 PM!
2026-06-04           23:03:39    06:03 (5 Jun)  ← Checkout Tgl 4
2026-06-05           04:19:59    11:20          ← Early: 11 AM
...
```

### 4.4 VERDICT: B0193 Tidak Absen di Tanggal 2 Juni 2026

**Claim**: "B0193 absen di tanggal 2 Juni 2026 jam 22:50"
**Reality**: Scan 22:50 UTC = 05:50 WIB Tanggal 3 Juni. B0193 TIDAK punya scan check-in di tanggal 2 Juni 2026.

**Pola asli** (dari backup):
- Tanggal 1 Juni: scan di P1B
- Tanggal 2 Juni: TIDAK ADA scan
- Tanggal 3 Juni: scan jam 07:43 UTC (14:43 WIB) — anomalous (jam 2 PM bukan jam kerja)

**7-digit ID 3000193 adalah VALID** — employee enrolled di P1B, rutin scan 2x/hari, consistent mapping ke B0193.

---

## BAGIAN 5: ROOT CAUSE ANALYSIS

### 5.1 Contributing Factors

| # | Issue | Root Cause | Severity |
|---|-------|-----------|----------|
| 1 | `attendance_scan_logs` KOSONG | Unknown — manual deletion, failed migration, or sync process bug | **CRITICAL** |
| 2 | `attendance_imports` hanya G-employees | Pipeline filter atau mapping cascade failure | **CRITICAL** |
| 3 | `employees` KOSONG | Same as #1 | **CRITICAL** |
| 4 | `attendance_machines` KOSONG | Same as #1 | **CRITICAL** |
| 5 | `scan_time`/`scan_date` = UTC not WIB | Code tidak konversi timezone | **HIGH** |
| 6 | Batch 570-571: "Invalid object name" | Schema migration race condition | **MEDIUM** |
| 7 | Type mismatch: batch_id VARCHAR vs bigint | Code INSERT tanpa CAST explisit | **MEDIUM** |
| 8 | P1B anomalous scan times (07:43 UTC = 14:43 WIB) | Machine clock drift atau NTP sync failure | **HIGH** |

### 5.2 Timeline Reconstruction

```
2026-06-18 15:59-16:34  : Batch 62 (P1B) sync — 3,179 records, 386 success
2026-06-20 05:30       : Batch 570, 571 (AB1) FAILED — "Invalid object name 'attendance_imports'"
2026-06-23 23:30-23:31 : Backup tables created (788,915 scan logs backed up)
2026-06-23 11:18-12:18 : attendance_imports populated — G0007 only, 4,161 records
2026-06-25 (now)       : attendance_imports = 0, scan_logs = 0, employees = 0
                          All tables wiped between 2026-06-23 and 2026-06-25
```

---

## BAGIAN 6: REFACTOR BLUEPRINT

### 6.1 Phase 0: Emergency Restore

**Tujuan**: Kembalikan data dari backup table ke tabel aktif.

```sql
-- Step 1: Restore attendance_scan_logs dari backup
INSERT INTO attendance_scan_logs
SELECT id, machine_id, machine_code, raw_device_user_id, raw_user_sn,
       raw_record_time, raw_ip, parsed_employee_code, parsed_division_code,
       mapping_status, mapping_reason, scan_time, scan_date,
       event_type, verify_type, work_code, sync_batch_id, created_at
FROM attendance_scan_logs_backup_20260623_233022;

-- Step 2: Restore employees dari backup
INSERT INTO employees
SELECT * FROM employees_backup_20260623;

-- Step 3: Restore attendance_machines
INSERT INTO attendance_machines
SELECT id, machine_code, location_name, ip_address, port, local_ip,
       machine_type, scanner_code, loc_code, access_status, data_source,
       notes, is_active, last_sync_at, last_error_message, created_at, updated_at
FROM [backup table];
```

### 6.2 Phase 1: Fix Clock Issue

**File**: `src/modules/import/attendance-process.service.ts`

```typescript
// BEFORE (buggy):
const scanTime = new Date(rawRecordTime);
const scanDate = scanTime.toISOString().split('T')[0];

// AFTER (correct):
const UTC_TIME_OFFSET = 7; // WIB = UTC + 7
const wibTime = new Date(rawRecordTime.getTime() + UTC_TIME_OFFSET * 3600000);
const scanTime = wibTime;
const scanDate = wibTime.toISOString().split('T')[0];
```

### 6.3 Phase 2: Fix attendance_imports Pipeline

**File**: `src/modules/import/attendance-process-import.service.ts`

**Bug Fixes**:
1. Remove G-employee-only filter
2. Fix batch_id type consistency
3. Add proper timezone handling
4. Fix date grouping: `scan_date` → WIB date, bukan UTC date

### 6.4 Phase 3: Fix rebuildImportsForMachineDates()

**Current logic**:
```typescript
-- Groups by UTC scan_date
SELECT scan_date, MIN(scan_time), MAX(scan_time)
FROM attendance_scan_logs
GROUP BY scan_date
```

**Fixed logic**:
```typescript
-- Groups by WIB scan_date
SELECT
  CONVERT(date, DATEADD(HOUR, 7, scan_time)) AS wib_date,
  MIN(DATEADD(HOUR, 7, scan_time)) AS wib_check_in,
  MAX(DATEADD(HOUR, 7, scan_time)) AS wib_check_out
FROM attendance_scan_logs
GROUP BY CONVERT(date, DATEADD(HOUR, 7, scan_time))
```

### 6.5 Phase 4: Fix Stored Procedures / Views

**Fix all 9 views** that depend on `attendance_scan_logs`, `attendance_imports`, `employees` — they all need data restored AND timezone-corrected.

### 6.6 Phase 5: NTP Sync & Machine Clock Fix

1. Add timezone field to `attendance_machines` table
2. Script to set all machines to WIB (UTC+7)
3. NTP server configuration for all 16 machines
4. Monitoring: alert if machine clock drifts > 5 minutes

---

## BAGIAN 7: DATABASE RELATIONSHIP DIAGRAM

```
┌──────────────────────────────────────────────────────────────────┐
│                    attendance_scan_logs (788,915 rows in backup)  │
│  id (PK) · machine_id (FK) · machine_code · raw_device_user_id  │
│  raw_record_time (UTC) · scan_time (UTC→WIB needed)              │
│  scan_date (UTC date→WIB needed) · parsed_employee_code         │
│  mapping_status · sync_batch_id (FK)                              │
└──────────────┬────────────────────────┬──────────────────────────┘
               │                        │
               │ machine_id             │ parsed_employee_code
               ▼                        ▼
┌──────────────────────────┐  ┌─────────────────────────────────────┐
│   attendance_machines    │  │           employees                 │
│   id (PK)                │  │   id (PK) · employee_code (UK)      │
│   machine_code (UK)      │  │   employee_name · division_id (FK) │
│   ip_address · loc_code  │  │   employment_status · is_active    │
│   scanner_code · is_active│  └──────────────┬──────────────────────┘
│   last_sync_at           │                 │ division_id
└──────────────────────────┘                 ▼
                                  ┌─────────────────────┐
                                  │     divisions        │
                                  │ id (PK) · code (UK) │
                                  └─────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   attendance_imports (0 rows — NEEDS REBUILD)     │
│  id (PK) · employee_id (FK) · employee_code · attendance_date   │
│  check_in_at (WIB) · check_out_at (WIB) · attendance_status     │
│  batch_id (FK) · raw_scan_log_id (FK) · needs_manual_review     │
└──────────────┬────────────────────────┬──────────────────────────┘
               │                        │
               │ batch_id               │ raw_scan_log_id
               ▼                        ▼
┌────────────────────────────┐  ┌──────────────────────────────────┐
│ attendance_import_batches │  │    attendance_scan_logs          │
│ id (PK) · batch_code      │  │    id (PK)                       │
│ machine_id (FK) · status  │  │    ...                           │
│ records_success/failed    │  └──────────────────────────────────┘
│ error_message             │
└────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│            attendance_manual_corrections                 │
│ id (PK) · employee_id (FK) · employee_code             │
│ attendance_date · attendance_status · check_in_at        │
│ check_out_at · is_leave · is_sick · reason              │
│ is_deleted · created_by · updated_by                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│         attendance_holiday / holidays                   │
│ id (PK) · holiday_date · description                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│         employee_schedules / shifts                     │
│ id (PK) · employee_id (FK) · shift_code               │
│ start_time · end_time                                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│         employee_code_history                           │
│ id (PK) · employee_id (FK) · old_code · new_code      │
│ changed_at · reason                                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│         employee_mapping_overrides                      │
│ id (PK) · machine_id (FK) · raw_device_user_id        │
│ employee_id (FK) · reason · is_active                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│         zkteco_hr_employee_map                          │
│ id (PK) · machine_user_id · hr_employee_id             │
│ mapped_at · source                                      │
└─────────────────────────────────────────────────────────┘
```

---

## BAGIAN 8: MIGRASI YANG DIBUTUHKAN

### Migration 059: Emergency Data Restore

```sql
-- File: migrations/059_restore_from_backup.sql
-- Status: PENDING
-- Risk: HIGH (large data insert)

BEGIN TRANSACTION;

-- 1. Restore attendance_machines
INSERT INTO attendance_machines
SELECT id, machine_code, location_name, ip_address, port, local_ip,
       machine_type, scanner_code, loc_code, access_status, data_source,
       notes, is_active, last_sync_at, last_error_message, created_at, updated_at
FROM attendance_machines_backup_20260623;

-- 2. Restore employees
INSERT INTO employees
SELECT id, employee_code, employee_name, division_id, gang_id,
       employment_status, is_active, created_at, updated_at
FROM employees_backup_20260623;

-- 3. Restore attendance_scan_logs
INSERT INTO attendance_scan_logs
SELECT id, machine_id, machine_code, raw_device_user_id, raw_user_sn,
       raw_record_time, raw_ip, parsed_employee_code, parsed_division_code,
       mapping_status, mapping_reason, scan_time, scan_date,
       event_type, verify_type, work_code, sync_batch_id, created_at
FROM attendance_scan_logs_backup_20260623_233022;

-- 4. Add timezone correction columns
ALTER TABLE attendance_scan_logs ADD scan_time_wib datetime2 NULL;
ALTER TABLE attendance_scan_logs ADD scan_date_wib date NULL;

-- 5. Backfill corrected timezone
UPDATE attendance_scan_logs
SET scan_time_wib = DATEADD(HOUR, 7, scan_time),
    scan_date_wib = CONVERT(date, DATEADD(HOUR, 7, scan_time));

-- 6. Add timezone field to machines
ALTER TABLE attendance_machines ADD timezone nvarchar(50) NULL DEFAULT 'Asia/Makassar';

COMMIT;
```

### Migration 060: Fix scan_date/scan_time to WIB

```sql
-- File: migrations/060_fix_timezone_scan_logs.sql
-- Status: PENDING
-- Risk: MEDIUM

BEGIN TRANSACTION;

-- Backfill corrected scan_date (WIB)
UPDATE attendance_scan_logs
SET scan_date = CONVERT(date, DATEADD(HOUR, 7, scan_time))
WHERE scan_date_wib IS NULL;

-- Update scan_time to WIB
UPDATE attendance_scan_logs
SET scan_time = DATEADD(HOUR, 7, scan_time)
WHERE scan_time_wib IS NULL;

-- Now attendance_imports grouping will be correct
-- Rebuild attendance_imports using corrected scan_date

COMMIT;
```

### Migration 061: Fix attendance_imports Pipeline

```sql
-- File: migrations/061_rebuild_attendance_imports.sql
-- Status: PENDING
-- Risk: MEDIUM

BEGIN TRANSACTION;

-- Clear existing (G-employees only, incorrect)
DELETE FROM attendance_imports;

-- Rebuild for ALL employees using corrected scan_date
INSERT INTO attendance_imports (
  employee_id, employee_code, division_code, gang_code,
  attendance_date, attendance_year, attendance_month,
  check_in_at, check_out_at, attendance_status,
  has_work, is_leave, is_sick, is_holiday, overtime_hours,
  source, source_reference, batch_id, raw_scan_log_id,
  created_at, needs_manual_review
)
SELECT
  e.id AS employee_id,
  e.employee_code,
  LEFT(e.employee_code, 1) AS division_code,
  NULL AS gang_code,
  sl.scan_date AS attendance_date,  -- Now WIB-corrected
  YEAR(sl.scan_date) AS attendance_year,
  MONTH(sl.scan_date) AS attendance_month,
  wib_min.check_in_at,
  wib_max.check_out_at,
  CASE
    WHEN wib_count.scan_count >= 2 THEN 'HADIR'
    WHEN wib_count.scan_count = 1 THEN 'NO_CHECKOUT'
    ELSE 'TIDAK_HADIR'
  END AS attendance_status,
  0 AS has_work, 0 AS is_leave, 0 AS is_sick, 0 AS is_holiday, 0 AS overtime_hours,
  'ZKTECO' AS source,
  sl.machine_code AS source_reference,
  sl.sync_batch_id,
  sl.id AS raw_scan_log_id,
  GETUTCDATE() AS created_at,
  0 AS needs_manual_review
FROM attendance_scan_logs sl
INNER JOIN employees e ON e.employee_code = sl.parsed_employee_code
INNER JOIN (
  SELECT scan_date, parsed_employee_code, MIN(scan_time) AS check_in_at
  FROM attendance_scan_logs
  WHERE parsed_employee_code IS NOT NULL
  GROUP BY scan_date, parsed_employee_code
) wib_min ON wib_min.scan_date = sl.scan_date
          AND wib_min.parsed_employee_code = sl.parsed_employee_code
INNER JOIN (
  SELECT scan_date, parsed_employee_code, MAX(scan_time) AS check_out_at
  FROM attendance_scan_logs
  WHERE parsed_employee_code IS NOT NULL
  GROUP BY scan_date, parsed_employee_code
) wib_max ON wib_max.scan_date = sl.scan_date
          AND wib_max.parsed_employee_code = sl.parsed_employee_code
INNER JOIN (
  SELECT scan_date, parsed_employee_code, COUNT(*) AS scan_count
  FROM attendance_scan_logs
  WHERE parsed_employee_code IS NOT NULL
  GROUP BY scan_date, parsed_employee_code
) wib_count ON wib_count.scan_date = sl.scan_date
            AND wib_count.parsed_employee_code = sl.parsed_employee_code
GROUP BY
  e.id, e.employee_code, sl.scan_date,
  wib_min.check_in_at, wib_max.check_out_at, wib_count.scan_count,
  sl.machine_code, sl.sync_batch_id, sl.id;

COMMIT;
```

---

## BAGIAN 9: BACKEND CODE CHANGES REQUIRED

### 9.1 File: `src/modules/import/attendance-process.service.ts`

**Fix**: Konversi UTC → WIB untuk `scan_time` dan `scan_date`.

### 9.2 File: `src/modules/import/attendance-process-import.service.ts`

**Fix**: 
- Hapus filter G-employee-only
- Fix batch_id type consistency
- Fix `attendance_date` grouping menggunakan WIB date

### 9.3 File: `src/modules/import/sync-orchestrator.service.ts`

**Fix**: 
- Handle empty tables gracefully
- Log lebih detail untuk debugging
- Retry logic untuk batch failures

### 9.4 File: `src/modules/machines/zkteco.service.ts`

**Fix**: 
- Konversi `raw_record_time` ke WIB sebelum insert
- Validasi timezone mesin saat connect

### 9.5 File: `src/lib/db.ts`

**Check**: 
- Pastikan koneksi ke semua tabel aktif
- Handle empty result sets gracefully

---

## BAGIAN 10: FRONTEND IMPACT

### 10.1 API Routes Affected

| Route | Impact | Status |
|-------|--------|--------|
| `GET /api/attendance/monthly-matrix` | Empty (no data) | NEEDS FIX |
| `GET /api/attendance/daily` | Empty | NEEDS FIX |
| `GET /api/employees` | Empty | NEEDS FIX |
| `GET /api/monitoring/machine/:code/employees` | Empty | NEEDS FIX |
| `GET /api/monitoring/machine/:code/user/:rawId/attendance` | Empty | NEEDS FIX |
| `POST /api/ops/sync` | May fail (no machines) | NEEDS FIX |

### 10.2 Frontend Types

All API response types reference empty tables. Need to verify frontend expects correct timezone (WIB) in response.

---

## BAGIAN 11: RECOMMENDED ACTION PLAN

### Priority 0 — EMERGENCY (Before anything else)

1. **Backup current database state** (empty tables + backup tables)
2. **Restore data** from `attendance_scan_logs_backup_20260623_233022`
3. **Restore employees** from `employees_backup_20260623`
4. **Restore machines** from appropriate backup
5. **Verify frontend** can read data

### Priority 1 — CRITICAL (Week 1)

1. Fix `scan_time`/`scan_date` timezone issue in backend code
2. Run migration 060: backfill corrected timezone
3. Rebuild `attendance_imports` for ALL employees (not just G)
4. Fix `attendance_import_batches` schema (ensure table exists before batch runs)
5. Verify batch processing works end-to-end

### Priority 2 — HIGH (Week 2)

1. NTP sync all 16 ZKTeco machines to WIB
2. Add timezone field to `attendance_machines` table
3. Add clock drift monitoring/alerting
4. Fix P1B anomalous clock (earliest=07:43 UTC = 14:43 WIB)
5. Verify B0193 attendance data is correct after fix

### Priority 3 — MEDIUM (Week 3-4)

1. Implement comprehensive batch error logging
2. Add retry logic for failed batches
3. Fix type consistency: batch_id should be consistent type across all tables
4. Add timezone validation during sync
5. Write automated tests for timezone conversion

### Priority 4 — LOW (Ongoing)

1. Performance: optimize `attendance_imports` rebuild queries
2. Monitoring: dashboard for batch success/failure rates
3. Documentation: update architecture docs with timezone handling

---

## BAGIAN 12: DATA QUALITY ISSUES IN BACKUP

### 12.1 Invalid scan_dates

```
machine_code  earliest_date    latest_date
AB1          2000-01-01       2026-06-23
AB2          1999-12-31       2026-06-23
DME_01       1999-12-31       2026-05-07
```

**Arti**: Ada records dengan tanggal 1999-12-31 dan 2000-01-01 — jelas invalid (clock malfunction atau epoch bug).

### 12.2 NEED_REVIEW Records

```
machine_code  count  division
AB1          62      NULL (no parsed_employee_code)
```

62 records tidak bisa di-mapping — perlu manual review.

### 12.3 INVALID Records

1 record dengan `mapping_status = 'INVALID'` — perlu investigation.

---

## BAGIAN 13: KNOWN WORKING COMPONENTS

Despite the catastrophic state, these still work:

| Component | Status | Notes |
|-----------|--------|-------|
| ZKTeco machine connectivity | ✅ Working | Machines reachable, data pulled |
| Raw scan log insertion | ✅ Working | 788,915 records in backup prove it |
| DB connection (mssql) | ✅ Working | Queries execute successfully |
| SSOT Parser (ID→EmpCode) | ✅ Working | B0193 mapping is correct |
| HR employee lookup | ✅ Working | DB_PTRJ accessible |
| CLI sync script | ✅ Working | Sync batches created |
| Backend build system | ✅ Working | TypeScript compiles |
| Frontend build | ✅ Working | Production bundle builds |

**Artinya**: Pipeline insertion bagian BAWAH (raw logs) berfungsi. Yang rusak adalah pipeline ATAS (aggregation ke `attendance_imports`) dan timezone handling.

---

## APPENDIX A: Query Examples for Verification

### Check attendance_imports after restore
```sql
SELECT employee_code, COUNT(*) as days, MIN(attendance_date), MAX(attendance_date)
FROM attendance_imports
GROUP BY employee_code
ORDER BY days DESC
```

### Check scan_time timezone distribution
```sql
-- Before fix: scan_time is UTC
SELECT TOP 10
  scan_time AS stored_time,
  DATEADD(HOUR, 7, scan_time) AS wib_time,
  scan_date AS stored_date,
  CONVERT(date, DATEADD(HOUR, 7, scan_time)) AS wib_date,
  machine_code
FROM attendance_scan_logs
WHERE parsed_employee_code = 'B0193'
ORDER BY scan_time
```

### Check batch 62 (P1B sync)
```sql
SELECT * FROM attendance_import_batches
WHERE id = 62 OR batch_code LIKE '%P1B%'
ORDER BY started_at DESC
```

### Check all machines and their data counts
```sql
SELECT
  m.machine_code,
  m.ip_address,
  m.loc_code,
  m.is_active,
  COUNT(sl.id) AS scan_count,
  COUNT(DISTINCT sl.parsed_employee_code) AS emp_count
FROM attendance_machines m
LEFT JOIN attendance_scan_logs sl ON sl.machine_code = m.machine_code
GROUP BY m.machine_code, m.ip_address, m.loc_code, m.is_active
ORDER BY scan_count DESC
```

---

## APPENDIX B: Glossary

| Term | Definition |
|------|-----------|
| UTC | Coordinated Universal Time — ZKTeco machines store time in UTC |
| WIB | Waktu Indonesia Barat (UTC+7) — local time for PT Rebinmas operations |
| Raw scan log | Individual attendance record from ZKTeco machine (one scan = one row) |
| Attendance import | Aggregated daily attendance (check-in + check-out per employee per day) |
| MAPPED | Employee code successfully parsed from raw_device_user_id |
| NEED_REVIEW | Cannot auto-map — requires manual review |
| Long raw ID | raw_device_user_id > 5 digits (e.g., 3000193) |
| SSOT Parser | Single Source of Truth — parses scanner prefix → employee code |
| Batch | One sync operation — pull data from one machine |
| Clock drift | Machine clock running faster/slower than real time |

---

**Document Status**: COMPLETE
**Last Updated**: 2026-06-25
**Author**: Claude Code (Systematic Investigation)
**Version**: 1.0
