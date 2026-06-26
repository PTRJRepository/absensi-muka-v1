# Employee Data Flow — Semua Tempat Data Karyawan Disimpan

**Tanggal:** 2026-06-25
**Arsitektur:** 3-Layer (RAW → MASTER → PROCESSED) per Migration 056

---

## Arsitektur 3-Layer

```
Layer 1 (RAW)                     Layer 2 (MASTER)                  Layer 3 (PROCESSED)
─────────────────────────         ─────────────────────────         ──────────────────────────
machine_user_raw                   employees                         attendance_imports
  ├─ user_name (dari ZKTeco)        ├─ employee_code (PK unik)        ├─ employee_id FK → employees
  ├─ machine_user_id                ├─ employee_name (HR name)        ├─ employee_code
  ├─ machine_id FK                  ├─ nik                            ├─ check_in_at / check_out_at
  └─ per-machine user list          ├─ hr_employee_code               └─ attendance_status
                                    ├─ hr_loc_code
attendance_scan_logs                ├─ current_emp_code
  ├─ raw_device_user_id             ├─ zkteco_user_name
  ├─ zkteco_user_name (dienrich)    ├─ raw_device_user_id
  ├─ parsed_employee_code (SSOT)    ├─ parsed_division_code
  ├─ mapping_status                 ├─ mapping_status
  └─ mapping_reason                 ├─ division_id FK → divisions
                                    └─ gang_id FK → gangs
machine_user_map
  ├─ machine_id + machine_user_id   hr_employee_current_snapshot
  └─ employee_id FK → employees       ├─ nik (dari DB_PTRJ HR)
                                      ├─ current_emp_code
zkteco_hr_employee_map               ├─ current_emp_name
  ├─ machine_code + zkteco_user_id   └─ current_loc_code
  ├─ hr_employee_code (nullable)
  └─ hr_employee_name                employee_code_history
                                       ├─ nik → emp_code tracking
                                       ├─ is_current
                                       └─ history perubahan kode
```

---

## 8 Tempat Data Karyawan Disimpan

### 1. `machine_user_raw` — RAW: Data User dari ZKTeco Machine

**Sumber:** `zk.getUsers()` — enrollment data langsung dari mesin absensi
**Kapan diisi:** Setiap sync, Step 1 (sebelum getAttendances)

| Kolom | Deskripsi | Contoh |
|-------|-----------|--------|
| `machine_id` | FK ke attendance_machines | 7 (AB2) |
| `machine_user_id` | User ID dari mesin | `4000521` |
| `user_name` | Nama user dari mesin | `SUARDI (ROHANIAH)` |
| `machine_raw_user_name` | Copy user_name untuk tracking | `SUARDI (ROHANIAH)` |
| `machine_uid` | UID internal ZKTeco | `123` |
| `role` | Role user di mesin | `0` (user biasa) |
| `card_no` | Nomor kartu RFID | `12345678` |
| `password_exists` | Ada password? | 1/0 |
| `raw_payload` | JSON mentah dari ZKTeco | `{"uid":123,...}` |
| `first_seen_at` | Pertama kali terdeteksi | 2026-06-25 08:30 |
| `last_seen_at` | Terakhir terdeteksi | 2026-06-25 17:00 |
| `imported_at` | Kapan di-import | 2026-06-25 10:15 |

**Unique key:** `(machine_id, machine_user_id)`
**Digunakan untuk:** Enrichment `zkteco_user_name` di `attendance_scan_logs`

---

### 2. `attendance_scan_logs` — RAW: Log Absensi Mentah

**Sumber:** `zk.getAttendances()` — record absensi langsung dari mesin
**Kapan diisi:** Setiap sync, Step 2 (setelah getUsers)

| Kolom Employee-Related | Deskripsi | Contoh |
|------------------------|-----------|--------|
| `raw_device_user_id` | User ID mentah dari mesin | `4000521` |
| `zkteco_user_name` | Nama setelah enrichment dari `machine_user_raw` | `SUARDI (ROHANIAH)` |
| `zkteco_user_name_source` | Sumber nama: ATTENDANCE_RECORD / MACHINE_USER_RAW | `MACHINE_USER_RAW` |
| `zkteco_user_name_sync_status` | FILLED / EMPTY_RAW_USER_NAME / NO_RAW_USER | `FILLED` |
| `parsed_employee_code` | Hasil SSOT parser (sync time) | `H0052` |
| `parsed_division_code` | Loc code hasil parsing | `H` (AB2) |
| `mapping_status` | AUTO_MAPPED / NEED_REVIEW | `AUTO_MAPPED` |
| `mapping_reason` | Alasan mapping | `PARSED_SCANNER_PREFIX_400_LOC_H` |

**Unique key:** `(machine_code, raw_device_user_id, raw_record_time)`

---

### 3. `employees` — MASTER: Satu-Satunya SSOT Data Karyawan

**Sumber:** Gabungan dari 3 sumber:
1. **ZKTeco:** `machine_user_raw.user_name` → `zkteco_user_name`
2. **SSOT Parser:** `raw_device_user_id` → `parsed_employee_code`
3. **HR Database (DB_PTRJ):** `hr_employee_current_snapshot` → `employee_name`, `nik`, `hr_*`

**Kapan diisi:**
- Saat sync: `EmployeeRepository.upsert()` untuk user baru
- Saat HR sync: `hr-employee-sync.service.ts` UPDATE/INSERT bulk
- Saat merge: Migration 056 merge dari `zkteco_absensi_user_registry`

**Full Schema (setelah migration 056):**

| Kolom | Deskripsi | Sumber |
|-------|-----------|--------|
| `id` | PK auto-increment | DB |
| `employee_code` | Kode karyawan unik (format: `{locCode}{4digit}`) | SSOT Parser |
| `employee_name` | Nama dari HR | HR DB |
| `nik` | Nomor Induk Karyawan | HR DB |
| `division_id` | FK ke divisions | HR DB / parser |
| `gang_id` | FK ke gangs (tim) | HR DB |
| `employment_status` | ACTIVE / INACTIVE | HR DB |
| `is_active` | 1/0 | System |
| `raw_device_user_id` | User ID mentah ZKTeco | ZKTeco |
| `zkteco_user_name` | Nama dari ZKTeco machine | ZKTeco |
| `raw_id_length` | Panjang raw ID | System |
| `id_category` | SHORT / LONG / PREFIXED | System |
| `scan_count` | Total scan | System |
| `first_seen_at` | Pertama scan | ZKTeco |
| `last_seen_at` | Terakhir scan | ZKTeco |
| `parsed_division_code` | Loc code hasil parser | SSOT Parser |
| `hr_employee_code` | Kode dari HR system | HR DB |
| `hr_loc_code` | Loc code dari HR | HR DB |
| `hr_status` | Status dari HR | HR DB |
| `mapping_status` | MAPPED / UNMAPPED / NEED_REVIEW | System |
| `mapping_reason` | Alasan mapping | System |
| `resolved_nik` | NIK hasil resolusi | System |
| `current_resolution_status` | Status resolusi terbaru | System |
| `current_resolution_method` | Metode resolusi | System |
| `current_emp_code` | Employee code terkini | HR DB |
| `current_emp_name` | Nama terkini | HR DB |
| `current_resolved_at` | Kapan di-resolve | System |
| `current_hr_loc_code` | Loc code terkini dari HR | HR DB |
| `current_hr_create_date` | Tanggal pembuatan HR | HR DB |
| `current_hr_update_date` | Tanggal update HR | HR DB |
| `created_at` | Dibuat | System |
| `updated_at` | Diupdate | System |

> **⚠️ Ini adalah SATU-SATUNYA SSOT.** `zkteco_absensi_user_registry` sudah di-drop di migration 056.
> Semua query employee HARUS JOIN ke tabel ini, bukan ke mapping table lain.

---

### 4. `zkteco_hr_employee_map` — MAPPING: ZKTeco User ↔ HR Employee

**Sumber:** Hasil mapping/cross-reference antara ZKTeco user ID dan HR employee code
**Status:** MASIH ADA tapi sudah tidak digunakan sebagai primary source

| Kolom | Deskripsi |
|-------|-----------|
| `machine_code` | Kode mesin |
| `zkteco_user_id` | User ID dari ZKTeco |
| `zkteco_user_name` | Nama dari ZKTeco |
| `hr_employee_code` | Kode karyawan HR (nullable — banyak NULL) |
| `hr_employee_name` | Nama karyawan HR |
| `match_confidence` | UNMATCHED / LOW / MEDIUM / HIGH |
| `match_method` | ID_CONVERSION / NAME_MATCH / MANUAL |

**Unique key:** `(machine_code, zkteco_user_id)`

> **Catatan:** Table ini sudah TIDAK digunakan untuk query utama. `employees` adalah SSOT.
> Tapi table ini masih ada untuk backward compatibility. Bisa di-drop nanti.

---

### 5. `hr_employee_current_snapshot` — REFERENCE: Snapshot HR Database

**Sumber:** `DB_PTRJ.dbo.HR_EMPLOYEE` — HR system PT Rebinmas Jaya
**Kapan diisi:** Saat HR sync job berjalan (manual/scheduled)

| Kolom | Deskripsi |
|-------|-----------|
| `nik` | Nomor Induk Karyawan (key) |
| `current_emp_code` | Kode karyawan saat ini |
| `current_emp_name` | Nama karyawan saat ini |
| `current_loc_code` | Lokasi/divisi saat ini |
| `current_status` | Status HR |
| `active_count` | Jumlah row aktif |
| `row_count` | Total row untuk NIK ini |
| `is_ambiguous` | 1 jika NIK punya >1 emp_code |
| `ambiguity_reason` | Alasan ambigu |
| `synced_at` | Kapan terakhir sync |

**Digunakan untuk:** Name resolution. Join path: `employees.nik` = `hr_employee_current_snapshot.nik`

---

### 6. `employee_code_history` — HISTORY: Tracking Perubahan Kode Karyawan

**Sumber:** `DB_PTRJ` HR system
**Kapan diisi:** HR sync

| Kolom | Deskripsi |
|-------|-----------|
| `nik` | NIK (key untuk tracking) |
| `emp_code` | Employee code di point waktu ini |
| `emp_name` | Nama di point waktu ini |
| `loc_code` | Lokasi di point waktu ini |
| `hr_status` | Status HR |
| `create_date` | Tanggal record dibuat di HR |
| `update_date` | Tanggal record diupdate di HR |
| `is_current` | 1 = ini emp_code terkini |
| `source_table` | Sumber data |
| `synced_at` | Kapan di-sync |

**Digunakan untuk:** Tracking history perubahan kode (satu NIK bisa ganti emp_code karena rotasi/promosi)

---

### 7. `machine_user_map` — MAPPING: Bridge Machine User → Employee (Legacy)

**Sumber:** Hasil mapping manual/auto
**Status:** Legacy, dari migration 001

| Kolom | Deskripsi |
|-------|-----------|
| `machine_id` | FK ke machine |
| `machine_user_id` | User ID dari ZKTeco |
| `employee_id` | FK ke employees |
| `confidence` | Match confidence |
| `mapped_by` | Siapa yang mapping |

**Digunakan untuk:** Tidak lagi digunakan aktif. Ada untuk kompatibilitas.

---

### 8. `attendance_imports` — PROCESSED: Hasil Akhir Absensi Per Hari

**Sumber:** `attendance_scan_logs` diproses oleh pipeline `attendance-process-import.service.ts`
**Kapan diisi:** Pipeline rebuild (`MERGE` dari `attendance_scan_logs`)

| Kolom Employee-Related | Deskripsi |
|------------------------|-----------|
| `employee_id` | FK ke `employees.id` |
| `employee_code` | Kode karyawan |
| `division_code` | Kode divisi |
| `gang_code` | Kode gang/tim |
| `attendance_date` | Tanggal absensi (WIB) |
| `check_in_at` | Jam masuk (MIN scan_time) |
| `check_out_at` | Jam keluar (MAX scan_time) |
| `attendance_status` | HADIR / TIDAK_HADIR / NO_CHECKOUT |
| `source` | ZKTECO |
| `needs_manual_review` | 1 jika perlu review manual |

---

## Alur Data Karyawan (End-to-End)

### Fase 1: Sync dari ZKTeco Machine

```
ZKTeco Machine (mesin absensi)
  │
  ├─ zk.getUsers()
  │   └─→ machine_user_raw.user_name
  │       └─→ employees.zkteco_user_name (upsert)
  │
  └─ zk.getAttendances()
      └─→ attendance_scan_logs
          ├─ raw_device_user_id (mentah)
          ├─ zkteco_user_name (dienrich dari machine_user_raw)
          └─ parsed_employee_code (SSOT parser di sync time) ← BARU!
```

### Fase 2: HR Sync (dari DB_PTRJ)

```
DB_PTRJ.dbo.HR_EMPLOYEE (HR System)
  │
  ├─→ hr_employee_current_snapshot
  │     ├─ nik (NIK)
  │     ├─ current_emp_code (kode terbaru)
  │     └─ current_emp_name (nama terbaru)
  │
  ├─→ employee_code_history
  │     └─ tracking perubahan emp_code per NIK
  │
  └─→ employees (UPDATE/INSERT via hr-employee-sync.service.ts)
        ├─ employee_name ← HR name
        ├─ nik ← HR NIK
        ├─ hr_employee_code ← HR emp_code
        ├─ hr_loc_code ← HR loc_code
        └─ hr_verified ← 1
```

### Fase 3: Pipeline Attendance (Rebuild) — dengan NIK Resolution

```
attendance_scan_logs (RAW)
  │
  ├─ parsed_employee_code → JOIN employees e_parsed (direct match)
  │      │
  │      ├─ e_parsed.current_emp_code NOT NULL? → JOIN employees e_current
  │      │   └─ e_current.employee_code = e_parsed.current_emp_code
  │      │      (NIK-based resolution: kode lama → kode terbaru)
  │      │
  │      └─ Priority: COALESCE(e_current.id, e_parsed.id)
  │         └─ employee_code pakai current_emp_code jika ada
  │
  └─→ attendance_imports (PROCESSED)
        ├─ employee_id (FK — resolved ke current)
        ├─ employee_code (current_emp_code hasil resolusi NIK)
        ├─ check_in_at = MIN(scan_time)
        ├─ check_out_at = MAX(scan_time)
        └─ attendance_status = CASE COUNT ≥2 → HADIR, 1 → NO_CHECKOUT, 0 → TIDAK_HADIR
```

**Contoh NIK Resolution:**
```
Scan: raw_device_user_id="4000521" → parsed_employee_code="H0052"
  │
  ├─ employees (e_parsed): employee_code="H0052", current_emp_code="H0520", nik="12345678"
  │    → e_parsed.id = 123 (kode lama)
  │
  └─ employees (e_current): employee_code="H0520", is_active=1
       → e_current.id = 456 (kode terbaru)
       → RESULT: employee_id=456, employee_code="H0520" ✅
```

### Fase 4: Display Name Resolution

```
Frontend (attendance-service.ts → getDisplayName)

Prioritas:
  1. employees.employee_name (HR name)          → "SUARDI"
  2. attendance_scan_logs.zkteco_user_name       → "SUARDI (ROHANIAH)"
  3. machine_user_raw.user_name                  → "SUARDI (ROHANIAH)"
  4. employees.employee_code                     → "H0052"
  5. attendance_scan_logs.raw_device_user_id      → "4000521"
  6. "-" (fallback)
```

---

## Ringkasan: Kenapa 8 Tempat?

| # | Table | Layer | Kenapa Ada | Status |
|---|-------|-------|------------|--------|
| 1 | `machine_user_raw` | RAW | Simpan name ZKTeco sebelum enrichment | **ACTIVE** — diisi setiap sync |
| 2 | `attendance_scan_logs` | RAW | Log absensi mentah dengan parsed_employee_code | **ACTIVE** — diisi setiap sync |
| 3 | `employees` | MASTER | **SSOT** — satu tabel semua data karyawan | **ACTIVE** — SSOT utama |
| 4 | `zkteco_hr_employee_map` | MAPPING | Legacy: mapping ZKTeco↔HR | **DEPRECATED** — mungkin di-drop |
| 5 | `hr_employee_current_snapshot` | REFERENCE | Cache dari HR system (DB_PTRJ) | **ACTIVE** — sumber HR name |
| 6 | `employee_code_history` | HISTORY | Tracking perubahan kode karyawan | **ACTIVE** — untuk audit |
| 7 | `machine_user_map` | MAPPING | Legacy: bridge machine→employee | **DEPRECATED** — tidak digunakan |
| 8 | `attendance_imports` | PROCESSED | Hasil akhir: 1 row per employee per hari | **ACTIVE** — dari pipeline |

---

## Query Penting

### Cari nama karyawan dari raw ID
```sql
-- Path: raw_device_user_id → employees → HR name
SELECT
    e.employee_code,
    e.employee_name AS hr_name,
    e.zkteco_user_name AS machine_name,
    s.raw_device_user_id
FROM attendance_scan_logs s
LEFT JOIN employees e ON e.employee_code = s.parsed_employee_code
WHERE s.raw_device_user_id = '4000521';
```

### Cari semua data untuk satu karyawan
```sql
-- Lihat 3 layer sekaligus
SELECT
    s.raw_device_user_id,
    s.parsed_employee_code,
    s.mapping_status,
    m.user_name AS machine_raw_name,
    e.employee_name AS hr_name,
    e.nik,
    hr.current_emp_code,
    hr.current_loc_code
FROM attendance_scan_logs s
LEFT JOIN machine_user_raw m ON m.machine_id = s.machine_id AND m.machine_user_id = s.raw_device_user_id
LEFT JOIN employees e ON e.employee_code = s.parsed_employee_code
LEFT JOIN hr_employee_current_snapshot hr ON hr.nik = e.nik
WHERE s.id = 123456;
```

### Verifikasi SSOT parser baru
```sql
-- Cek hasil parsing di sync terbaru
SELECT
    raw_device_user_id,
    machine_code,
    parsed_employee_code,
    parsed_division_code,
    mapping_status,
    mapping_reason,
    COUNT(*) AS total
FROM attendance_scan_logs
WHERE mapping_reason IS NOT NULL
GROUP BY raw_device_user_id, machine_code, parsed_employee_code,
         parsed_division_code, mapping_status, mapping_reason
ORDER BY total DESC;
```

---

## Referensi
- `migrations/056_merge_and_simplify_employee_tables.sql` — SSOT consolidation
- `migrations/051_create_hr_employee_current_snapshot.sql` — HR snapshot
- `migrations/052_create_employee_code_history.sql` — Code history
- `migrations/017_create_zkteco_hr_mapping.sql` — Legacy mapping
- `src/modules/mapping/zkteco-employee-code-parser.ts` — SSOT parser
- `src/scripts/sync-machines.ts` — CLI sync with parser
- `src/modules/import/sync-orchestrator.service.ts` — API sync with parser