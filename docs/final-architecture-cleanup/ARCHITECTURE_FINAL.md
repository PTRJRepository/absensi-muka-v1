# ARCHITECTURE_FINAL — Sistem Absensi PT Rebinmas Jaya (ZKTeco-only)

> Status: FINAL · 2026-06-26 · Owner: System Architect
> Audit basis: live DB (`rebinmas_absensi_monitoring`), 17 backend files, frontend `features/*`, migrations 001–074.
> Related: [[DATABASE_CLEANUP_PLAN]], [[DATA_DICTIONARY_FINAL]], [[API_CONTRACT_FINAL]], [[MIGRATION_ROADMAP]]

---

## 1. Ringkasan Arsitektur Final

Sistem absensi **one-way, ZKTeco-only**. Tidak ada IT Solution API. Data mengalir satu arah: mesin ZKTeco → SQL Server. Sistem **tidak pernah menulis balik** ke mesin.

```
ZKTeco Machine (TCP :4370, node-zklib)
   │  getUsers()        ──►  RAW: machine_user_raw        (~6.293 rows)
   │  getAttendances()  ──►  RAW: attendance_scan_logs    (~808.093 rows)
   │                          │
   │                          ├─ SSOT parser (zkteco-employee-code-parser.ts)
   │                          │   raw_device_user_id → parsed_employee_code
   │                          │
   │                          ├─ enrich (machine_user_raw names, current_emp_code)
   │                          │
   │                          ▼
   │  MASTER: employees (8.005) ──► divisions (16) ──► gangs (0)
   │                          │
   │                          ▼
   │  REFERENCE/HISTORY:
   │    hr_employee_current_snapshot (4.763)  ◄── DB_PTRJ.HR_EMPLOYEE snapshot
   │    employee_code_history        (5.967)  ◄── riwayat kode per NIK
   │                          │
   │                          ▼  (current_emp_code / NIK resolution cascade — lihat §6)
   │  PROCESSED: attendance_imports (55.057) + attendance_manual_corrections (0)
   │                          │
   │                          ▼
   │  API (HTTP, custom router — bukan Express)  ──►  Frontend (React 19)
   └──────────────────────────┘
```

**Sumber data satu-satunya: mesin ZKTeco.** HR (DB_PTRJ) hanya sumber *reference* untuk identitas current (NIK + current_emp_code), bukan sumber attendance.

---

## 2. Diagram Data Flow

```
┌─────────────┐  getUsers()   ┌──────────────────┐
│ ZKTeco (16) │──────────────►│ machine_user_raw │  RAW enrollment
└─────────────┘               └──────────────────┘
       │
       │ getAttendances()
       ▼
┌────────────────────┐   SSOT parser   ┌──────────────────────────────────────┐
│ attendance_scan_logs│◄────────────────│ parsed_employee_code, mapping_status │
│  (808.093 raw scans)│                 │ MAPPED / NEED_REVIEW                  │
└─────────┬──────────┘                  └──────────────────────────────────────┘
          │
          │ enrich: current_emp_code (NIK cascade via employees + HR snapshot)
          ▼
┌───────────────┐  division_id FK   ┌────────────┐     ┌──────────────────────────────────┐
│  employees    │◄──────────────────│ divisions  │     │ hr_employee_current_snapshot      │
│  (SSOT, 8005) │                   │ (16: 11+5) │     │  (current_emp_code per NIK)       │
└───────┬───────┘                   └────────────┘     └──────────────┬───────────────────┘
        │                                                          │
        │   processScanLogsForBatch / rebuild-attendance-imports  │
        ▼                                                          ▼
┌─────────────────────────────────────┐  COALESCE(current, parsed) ──► employee_code final
│ attendance_imports (55.057)         │  COALESCE(e_current.id, e_parsed.id) ──► employee_id
│  per employee per date (final)      │  division dari current employee
│  check_in=MIN(scan), check_out=MAX  │
└──────────────────┬──────────────────┘
                   │ COALESCE(correction, import, NO_DATA)
                   ▼
            vw_attendance_final / vw_attendance_monthly_matrix  (VIEW)
                   │
                   ▼
        API endpoints (matrix / cell / dashboard)  ──►  React frontend
```

---

## 3. 4-Layer: RAW → MASTER → REFERENCE/HISTORY → PROCESSED

| Layer | Tabel | Sumber | Fungsi |
|-------|-------|--------|--------|
| **RAW** | `machine_user_raw` | `zk.getUsers()` | Enrollment user dari mesin (raw_id, user_name, role, card_no). 6.293 rows. |
| **RAW** | `attendance_scan_logs` | `zk.getAttendances()` | Setiap scan mentah. 808.093 rows. Punya `parsed_employee_code` (SSOT) + `current_emp_code` (resolved saat import). |
| **MASTER** | `employees` | HR + parser | **SSOT utama** data karyawan (8.005). `employee_code` (parsed), `nik`, `current_emp_code`, `division_id`. |
| **MASTER** | `divisions`, `gangs`, `attendance_machines`, `loc_codes`, `scanner_codes` | config/seed | Master referensi. divisions=16 (11 real + 5 dummy), gangs=0 (tidak dipakai). |
| **REFERENCE/HISTORY** | `hr_employee_current_snapshot` | DB_PTRJ.HR_EMPLOYEE (daily snapshot) | Current identity per NIK: `current_emp_code`, `current_emp_name`, `current_loc_code`. 4.763 rows. `is_ambiguous` flag untuk NIK yang punya >1 emp_code aktif. |
| **REFERENCE/HISTORY** | `employee_code_history` | DB_PTRJ | Riwayat perubahan kode per NIK (5.967 rows, `is_current` flag). |
| **PROCESSED** | `attendance_imports` | scan_logs + employees + NIK resolution | Hasil akhir absensi per employee per date (55.057). `source='ZKTECO'`. |
| **PROCESSED** | `attendance_manual_corrections` | HR Admin override | Manual correction (0 rows saat ini). `is_deleted` soft-delete. |

**Layer tidak ada di flow final** (legacy): `mst_employee`, `mst_division`, `mst_machine`, `api_attendance_raw`, `attendance_daily_process`, `attendance_raw_log`, `import_batch`. Lihat [[DATABASE_CLEANUP_PLAN]] §legacy.

---

## 4. Mode Data Mesin vs Mode Database

| Aspek | Mode Data Mesin | Mode Database |
|-------|----------------|---------------|
| **Source** | `machine_user_raw` + `attendance_scan_logs` | `attendance_imports` + `employees` |
| **Key utama** | `machine_code` + `raw_device_user_id` | `employee_code` + `attendance_date` |
| **Tujuan** | Debugging mesin, raw scan, enrollment, mapping status | Tampilan HR/final attendance |
| **Merge lintas employee** | ❌ TIDAK boleh — ikut data mesin asli | ✅ Scan di beberapa mesin tanggal sama → 1 cell |
| **check_in/out** | MIN/MAX(scan_time) per raw_id+date | `check_in_at`=MIN(scan_time), `check_out_at`=MAX(scan_time) |
| **Employee identity** | `parsed_employee_code` (raw, untuk debug) | `current_emp_code` (HR current) — lihat §6 |
| **Endpoint** | `monthly-matrix?mode=datamesin`, `employees-comprehensive?mode=datamesin` | `monthly-matrix?mode=database`, `employees-comprehensive?mode=database` |

**Aturan kunci:** Mode Data Mesin boleh tampilkan `parsed_employee_code` mentah. Mode Database **wajib** pakai current employee identity (current_emp_code + current_emp_name + current division). Jangan tampilkan parsed code di UI Database final.

---

## 5. Sync One-Way + Entry Points

Sync **hanya menarik** dari mesin ZKTeco → SQL Server. Tidak ada reverse sync.

| Entry Point | Mekanisme | Frekuensi | Tujuan |
|-------------|-----------|-----------|--------|
| **Scheduler** | `setInterval` → `child_process.fork`, config `src/config/schedule.json` | 60 min (global sync), 60 min (attendance_pipeline_sync), 1440 min (hr_snapshot_sync) | Auto background |
| **HTTP API** | `POST /api/ops/sync` | On-demand | Manual per-machine trigger |
| **CLI** | `node dist/scripts/sync-machines.js` | Manual | Full sync semua mesin aktif |

### Pipeline Sync (3 job scheduler)

```
[1] global sync (60 min): sync-machines.js
    ├─ connectZkteco (TCP)
    ├─ upsertMachineUser → machine_user_raw
    ├─ insertRawScan → attendance_scan_logs (SSOT parser, mapping_status)
    ├─ enrichUserNames (dari machine_user_raw)
    ├─ enrichCurrentEmpCode (NIK cascade)
    └─ processScanLogsForBatch → attendance_imports

[2] attendance_pipeline_sync (60 min): rebuild-attendance-imports.js
    └─ Loop per division → INSERT attendance_imports (idempotent NOT EXISTS)

[3] hr_snapshot_sync (1440 min/daily): sync-hr-current-snapshot.js
    ├─ hr_employee_current_snapshot ← DB_PTRJ.HR_EMPLOYEE (ROW_NUMBER PARTITION BY nik, current_rank=1)
    └─ employees ← HR via MERGE (nik, hr_loc_code, hr_status; division_id resolve via hr_loc_code)
```

Scheduler status: `enabled: true`, `attendance_pipeline_sync: enabled`.

---

## 6. ⚠️ DB_PTRJ / Current Employee Code / NIK Resolution (CRITICAL)

> `parsed_employee_code` dari scan_logs = hasil parsing `raw_device_user_id`. **Bisa kode lama.**
> Employee final (attendance_imports, matrix database, employee-comprehensive, frontend Database) **wajib** ikut `current_emp_code` dari HR/DB_PTRJ, BUKAN parsed code.

### 6.1 Resolution Cascade (wajib)

```
attendance_scan_logs.parsed_employee_code
  │
  ├─ JOIN employees e_parsed ON e_parsed.employee_code = parsed_employee_code
  │     └─ ambil e_parsed.nik dan/atau e_parsed.current_emp_code
  │
  ├─ JOIN hr_employee_current_snapshot h ON h.nik = e_parsed.nik
  │     └─ resolve: current_emp_code, current_emp_name, current_loc_code
  │        (jika h.is_ambiguous = 1 → tandai NEED_REVIEW, JANGAN merge asal)
  │
  ├─ JOIN employees e_current ON e_current.employee_code = h.current_emp_code
  │
  └─ OUTPUT attendance_imports:
        employee_id     = COALESCE(e_current.id, e_parsed.id)
        employee_code   = COALESCE(e_current.employee_code, e_parsed.employee_code)
        division_code   = division dari current employee (e_current.division_id → divisions)
        current_emp_code= h.current_emp_code
        current_emp_name= h.current_emp_name
        nik             = e_parsed.nik (resolved_nik)
```

### 6.2 Fallback Rule

| Kondisi | Hasil |
|---------|-------|
| NIK tersedia, current_emp_code unik (tidak ambigu) | ✅ Pakai current identity (e_current) |
| NIK tersedia, `is_ambiguous=1` | ⚠️ `NEED_REVIEW`, jangan merge. Tampilkan parsed code + flag. |
| NIK NULL (2.038 employees belum punya NIK) | ↩️ Fallback ke `parsed_employee_code` (e_parsed). Tidak ada current resolution. |
| current_emp_code NULL di HR snapshot | ↩️ Fallback ke parsed. |
| Karyawan scan pakai kode lama (mutasi) | ✅ Data final tampil sebagai kode aktif/current |

### 6.3 Data Quality Saat Ini (live, 2026-06-26)

| Metric | Nilai | Status |
|--------|-------|--------|
| employees total | 8.005 | — |
| employees `current_emp_code` ≠ `employee_code` (mutasi/kode lama) | **1.204** | ⚠️ Butuh current resolution |
| employees `current_emp_code` = `employee_code` (SAME) | 6.801 | ✅ |
| employees NIK NULL | **2.038** | ⚠️ Tidak bisa current-resolve |
| employees NIK ada | 5.967 | ✅ |
| HR snapshot total | 4.763 | — |
| HR snapshot `current_emp_code` NULL | 0 | ✅ |
| HR snapshot `is_ambiguous=1` | **23** | ⚠️ NEED_REVIEW, jangan merge |
| attendance_imports pakai kode lama padahal ada current_emp_code | **2 kode** (B0654→F0365: 25 rows, A0904→F0351: 18 rows) | Hampir bersih — 43 rows sisanya |
| attendance_imports `raw_scan_log_id` NULL | **45.034 / 55.057 (82%)** | ⚠️ Provenance broken (aggregate-per-date proses drop link scan) |

### 6.4 Risiko Jika Hanya Pakai `parsed_employee_code`

1. Karyawan mutasi divisi tampil di divisi lama → dashboard salah.
2. Karyawan pakai kode lama tampil 2x (kode lama + kode baru) → duplikat.
3. NIK tidak ter-resolve → tidak bisa JOIN ke HR identity.
4. Cross-location mixing tidak terdeteksi (karyawan A0044 di P1A tapi current D0357 di P2B).
5. Frontend Database menampilkan kode tidak aktif → HR bingung.

### 6.5 API Response Wajib Bawa (Mode Database)

Setiap response matrix/cell/employee-comprehensive mode database **wajib** menyertakan:
```json
{
  "parsed_employee_code": "A0044",        // raw dari mesin (debug)
  "current_emp_code":    "D0357",        // HR current
  "employee_code":       "D0357",        // FINAL (COALESCE current, parsed)
  "employee_name":       "HENDRA ( MARIAM )",  // FINAL name
  "current_resolution_status": "RESOLVED",      // RESOLVED | NEED_REVIEW | FALLBACK_PARSED | NO_NIK
  "current_resolution_method": "HR_SNAPSHOT_NIK", // HR_SNAPSHOT_NIK | EMPLOYEE_CURRENT | PARSED_FALLBACK | NONE
  "resolved_nik":        "1906010901770001"
}
```

### 6.6 Query Validasi current_emp_code

```sql
-- 1. Employee parsed ≠ current (kode lama/mutasi)
SELECT e.employee_code AS parsed, e.current_emp_code, e.nik,
       h.current_emp_name, h.current_loc_code
FROM employees e
LEFT JOIN hr_employee_current_snapshot h ON h.nik = e.nik
WHERE e.current_emp_code IS NOT NULL AND e.current_emp_code <> e.employee_code;

-- 2. NIK ambiguous di HR (jangan merge)
SELECT nik, current_emp_code, current_emp_name, ambiguity_reason
FROM hr_employee_current_snapshot WHERE is_ambiguous = 1;

-- 3. Imports masih pakai kode lama
SELECT ai.employee_code AS import_code, e.current_emp_code, COUNT(*) AS total
FROM attendance_imports ai
JOIN employees e ON e.employee_code = ai.employee_code
WHERE e.current_emp_code IS NOT NULL AND e.current_emp_code <> e.employee_code
GROUP BY ai.employee_code, e.current_emp_code ORDER BY total DESC;

-- 4. NIK missing (fallback ke parsed)
SELECT COUNT(*) FROM employees WHERE nik IS NULL OR LTRIM(RTRIM(nik)) = '';
```

---

## 7. Source of Truth per Layer

| Pertanyaan | Source of Truth | BUKAN |
|------------|----------------|-------|
| Raw scan dari mesin | `attendance_scan_logs` | api_attendance_raw (legacy, 0 rows) |
| Enrollment user mesin | `machine_user_raw` | machine_user_map (legacy, 0 rows) |
| Identitas karyawan | `employees` (SSOT) | mst_employee (legacy, 0 rows) |
| Current emp code per NIK | `hr_employee_current_snapshot` | zkteco_hr_employee_map (DROPPED) |
| Riwayat kode | `employee_code_history` | — |
| Attendance final harian | `attendance_imports` | attendance_daily_process (legacy, 0 rows) |
| Manual correction | `attendance_manual_corrections` | attendance_manual_adjustment (legacy, 0 rows) |
| Dashboard metric | row actual `attendance_imports` + `attendance_scan_logs` | ❌ `attendance_import_batches` (tidak reliable) |
| Employee code parsing | SSOT parser `zkteco-employee-code-parser.ts` | ❌ Jangan bikin parser baru |

---

## 8. Tech Stack

- **Runtime**: Node.js v22+
- **DB**: SQL Server via `mssql` (direct, target `rebinmas_absensi_monitoring`)
- **ZKTeco**: `node-zklib@1.3.0` (TCP :4370)
- **Config**: env vars via `zod`
- **Frontend**: React 19 + Vite + TypeScript + React Query + React Router
- **Backend port**: 8004 (`APP_PORT=8004`)
- **HR DB**: `DB_PTRJ` (10.0.0.110) — hanya baca snapshot, bukan sumber attendance

---

## 9. Aturan Baku (Hard Rules)

1. ❌ Tidak ada IT Solution API. Jangan jadikan source of truth.
2. ❌ Tidak ada reverse sync ke mesin.
3. ❌ Jangan drop table langsung. Audit dependency dulu → mark deprecated → stop usage → archive → drop. Lihat [[MIGRATION_ROADMAP]].
4. ❌ Jangan bikin parser baru. Pakai SSOT parser.
5. ❌ Jangan pakai `SqlClient`/`extend_db_ptrj` untuk attendance baru. Direct MSSQL ke `rebinmas_absensi_monitoring`.
6. ❌ Jangan jadikan `attendance_import_batches` source of truth dashboard.
7. ❌ Jangan re-introduce correlated subqueries (`resolvedEmployeeCodeSql()` dkk) di matrix/machine query — 30–50s timeout di 800k scan_logs.
8. ✅ Mode Database pakai current employee identity. Mode Data Mesin boleh parsed code.
9. ✅ Dashboard pakai row actual `attendance_imports`/`attendance_scan_logs`.
10. ✅ Setelah DB schema change: `npm run build` lalu restart server.
