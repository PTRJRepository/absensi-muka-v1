# Attendance Matrix — Dokumentasi Teknis

> ⚠️ **SATU-SATUNYA SUMBER DATA**: Semua data attendance BERASAL dari mesin ZKTeco saja.
> **Tidak ada IT Solution API, tidak ada import dari HR system, tidak ada data eksternal lainnya.**
> Yang disebut "manual correction" adalah data yang di-entry MANUAL oleh HR Admin melalui dashboard — bukan dari sistem lain.

Dokumen ini menjelaskan:
1. Bagaimana attendance matrix bekerja
2. Bagaimana data diambil dari mesin ZKTeco
3. Bagaimana data diproses menjadi laporan harian/bulanan
4. Bagaimana memastikan data tidak salah masuk ke employee lain
5. Bagaimana traceability data (dari mesin → raw logs → matrix)

---

## 1. Konsep Dasar: Raw Scan Logs vs Attendance Matrix

### ⚠️ Sumber Data: Mesin ZKTeco SAJA

**Tidak ada data dari sumber lain.** Semua attendance yang masuk ke sistem ini — dan hanya dari ini — adalah scan fingerprint/kartu yang tercatat di mesin ZKTeco.

- ❌ Tidak ada IT Solution API
- ❌ Tidak ada HR system integration
- ❌ Tidak ada import dari file/spreadsheet
- ❌ Tidak ada data eksternal apapun

Yang dimaksud "manual correction" adalah data yang **HR Admin entry manual lewat dashboard** — bukan dari sistem lain. Ini murni overwrite manual, bukan data baru dari luar.

### Dua Layer Data

| Layer | Tabel | Isi | Granularitas |
|-------|-------|-----|--------------|
| **Raw** | `attendance_scan_logs` | Setiap scan fingerprint/card secara individual | Per scan |
| **Aggregated** | `attendance_imports` | Ringkasan harian: check_in, check_out, status | Per karyawan per hari |
| **View** | `vw_attendance_monthly_matrix` | Gabungan: data import + raw scan + manual correction | Per karyawan per hari |

### attendance_scan_logs (Raw Data)

Setiap kali karyawan absen (scan fingerprint atau tap kartu), mesin ZKTeco mencatat **1 record** ke `attendance_scan_logs`:

```sql
-- Contoh: Karyawan A0044 absen 3 kali di mesin P1A pada tanggal 2026-06-25
INSERT INTO attendance_scan_logs (machine_code, raw_device_user_id, scan_time, scan_date, ...)
VALUES
  ('P1A', '10044', '2026-06-25 07:05:22', '2026-06-25', ...),  -- Scan 1: Masuk
  ('P1A', '10044', '2026-06-25 12:30:00', '2026-06-25', ...),  -- Scan 2: Pulang siang
  ('P1A', '10044', '2026-06-25 13:05:00', '2026-06-25', ...);  -- Scan 3: Masuk lagi
```

**Key deduplication** (UNIQUE constraint): `(machine_code, raw_device_user_id, scan_time)` — record duplikat diabaikan secara otomatis oleh database.

### attendance_imports (Aggregated Data)

Record di atas kemudian di-**group by** `(employee_code, attendance_date, machine_code)` menghasilkan 1 ringkasan:

```sql
-- Agregasi dari 3 raw scan di atas
INSERT INTO attendance_imports (employee_code, attendance_date, check_in_at, check_out_at, attendance_status)
VALUES
  ('A0044', '2026-06-25', '2026-06-25 07:05:22', '2026-06-25 12:30:00', 'HADIR');
```

- `check_in_at` = `MIN(scan_time)` dari semua scan hari itu
- `check_out_at` = `MAX(scan_time)` dari semua scan hari itu
- `attendance_status`:
  - `COUNT >= 2` → `HADIR`
  - `COUNT = 1` → `INCOMPLETE_SCAN`
  - `COUNT = 0` → tidak ada record (ditandai sebagai `TIDAK_HADIR` oleh matrix view)

### vw_attendance_monthly_matrix (View — Sumber Data Matrix)

Matrix API (`GET /api/attendance/monthly-matrix`) membaca dari view `vw_attendance_monthly_matrix`. View ini membangun matriks per-employee-per-tanggal:

1. Jika ada raw scan di `attendance_scan_logs` → gunakan itu (ground truth dari mesin)
2. Jika ada data aggregated di `attendance_imports` → fallback
3. Jika ada manual correction → override status
4. Tanggal tanpa record apapun → `NO_DATA`
5. Tanggal tanpa scan tapi employee ada di sistem → tetap muncul, ditandai `TIDAK_HADIR`

**Penting**: View ini tidak menambah data baru. Ia hanya menyusun data dari `attendance_scan_logs` menjadi bentuk matriks.

---

## 2. Complete Data Flow: Mesin → Raw Logs → Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 1: COLLECTION (Mesin → Database)                      │
│  ⚠️ SATU-SATUNYA SUMBER DATA — tidak ada IT Solution API atau sumber lain    │
│                                                                                  │
│  Karyawan scan fingerprint di mesin ZKTeco                                      │
│            │                                                                     │
│            ▼                                                                     │
│  ┌──────────────────────────────┐                                               │
│  │  node-zklib (TCP port 4370)  │                                               │
│  │  zk.getAttendances()          │  ← Pull semua attendance record dari mesin   │
│  └──────────────┬─────────────────┘                                               │
│                 │                                                                  │
│                 ▼                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │  SyncOrchestrator.syncViaZkteco()                                         │   │
│  │  - Tidak ada API IT Solution, tidak ada data import dari luar             │   │
│  │  - Hanya INSERT INTO attendance_scan_logs dari mesin ZKTeco                │   │
│  │  - mapping_status = 'NEED_REVIEW' saat insert (belum di-resolve)          │   │
│  └──────────────┬────────────────────────────────────────────────────────────┘   │
│                 ▼                                                                  │
│  attendance_scan_logs (GROUND TRUTH — satu-satunya sumber data nyata)            │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 2: MAPPING (Raw ID → Employee Code)                   │
│                                                                                  │
│  Scan log baru punya mapping_status = 'NEED_REVIEW'                             │
│            │                                                                     │
│            ▼                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │  SSOT Parser: zkteco-employee-code-parser.ts                              │   │
│  │                                                                             │   │
│  │  Priority cascade:                                                        │   │
│  │  1. employee_mapping_overrides (manual override)                           │   │
│  │  2. employees.zkteco_user_id exact match                                  │   │
│  │  3. parseZktecoUserId() — scanner prefix → locCode + last4               │   │
│  │  4. verifyParsedCodeInHrMaster() — cek employee_code di HR master         │   │
│  │  5. validateNameMatch() — Levenshtein similarity zkteco_name vs hr_name   │   │
│  │                                                                             │   │
│  │  Confidence levels: EXACT > STRONG > WEAK > NEED_REVIEW > EXCLUDED       │   │
│  └──────────────┬────────────────────────────────────────────────────────────┘   │
│                 │                                                                  │
│                 ▼                                                                  │
│  attendance_scan_logs.updated: parsed_employee_code, mapping_status               │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: AGGREGATION (Scan Logs → Imports)                  │
│                                                                                  │
│  attendance_scan_logs yang sudah MAPPED                                         │
│            │                                                                     │
│            ▼                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │  AttendanceProcessService.processScanLogsForBatch()                         │   │
│  │                                                                             │   │
│  │  SELECT raw_device_user_id, scan_date, machine_code                        │   │
│  │  GROUP BY employee_code, attendance_date, machine_code                     │   │
│  │                                                                             │   │
│  │  MIN(scan_time)  → check_in_at                                            │   │
│  │  MAX(scan_time)  → check_out_at                                            │   │
│  │  COUNT >= 2      → attendance_status = 'HADIR'                            │   │
│  │  COUNT = 1       → attendance_status = 'INCOMPLETE_SCAN'                  │   │
│  │                                                                             │   │
│  │  NEED_REVIEW records → attendance_imports dengan division='MANUAL_REVIEW'   │   │
│  └──────────────┬────────────────────────────────────────────────────────────┘   │
│                 │                                                                  │
│                 ▼                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │  attendance_imports                                                        │   │
│  │  Kolom kunci: employee_code, attendance_date,                              │   │
│  │               check_in_at, check_out_at, attendance_status, batch_id      │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 4: MATRIX VIEW & API                                    │
│                                                                                  │
│  vw_attendance_monthly_matrix (view SQL Server)                                 │
│            │                                                                     │
│            ▼                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │  GET /api/attendance/monthly-matrix                                        │   │
│  │  - Mode: database (via view + employees JOIN)                             │   │
│  │  - Mode: datamesin (langsung dari attendance_scan_logs)                   │   │
│  │  - Mode: traceable (dengan provenance chain lengkap)                     │   │
│  │                                                                             │   │
│  │  Fill tanggal kosong: untuk setiap employee × tanggal dalam bulan           │   │
│  │  Final status: HADIR / TIDAK_HADIR / INCOMPLETE_SCAN / NO_DATA / dll     │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Employee Code Mapping Cascade

Mapping dari `raw_device_user_id` (device ID di mesin) ke `employee_code` (kode karyawan di database) adalah langkah paling kritis dalam pipeline.

### Scanner Prefix → locCode Mapping

| Scanner Prefix | Division | locCode | Contoh raw ID | Employee Code |
|--------------|----------|---------|--------------|--------------|
| `001` | IJL | L | `00144` | `L0044` |
| `100` | P1A | A | `10044` | `A0044` |
| `200` | ARC | J | `20015` | `J0015` |
| `300` | P1B | B | `30232` | `B0232` |
| `400` | AB2 | H | `40001` | `H0001` |
| `500` | P2A | C | `50001` | `C0001` |
| `600` | P2B | D | `60010` | `D0010` |
| `700` | DME | E | `70088` | `E0088` |
| `800` | ARA | F | `80001` | `F0001` |
| `900` | AB1 | G | `90001` | `G0001` |

### ID Length Rules — KRITIS

**Hanya ID dengan panjang > 5 digit yang eligible untuk auto-mapping review:**

| Panjang | Contoh | Status | Aksi |
|---------|--------|--------|------|
| 5 digits | `10044` | **MAPPED** | Auto-parse: `100`→`A`, `0044`→`A0044` |
| >5 digits (dengan scanner prefix) | `5000040` | **MAPPED** | Parse: `500`→`C`, `0040`→`C0040` |
| >5 digits (tanpa scanner prefix) | `100123456` | **NEED_REVIEW** | EXCLUDED_LONG_ABSENSI_ID |
| <5 digits | `44` | **NEED_REVIEW** | Short ID, manual mapping needed |

### Mapping Priority Cascade (Urut Prioritas Tertinggi → Terendah)

```
Raw ID arrives (e.g., "5000040")
    │
    ├─ 1. employee_mapping_overrides (manual override per machine)?
    │     → MANUAL — prioritas tertinggi
    │
    ├─ 2. employees.zkteco_user_id exact match?
    │     → EXACT_LONG_RAW_ID — prioritas kedua
    │
    ├─ 3. Length > 5 digits tanpa scanner prefix?
    │     → NEED_REVIEW — langsung exclude, tidak coba parse
    │
    ├─ 4. Scanner prefix detected (3-digit prefix)?
    │     → CONVERTED_LONG_RAW_ID: {locCode}{last4}
    │     Contoh: "5000040" → "C0040"
    │     THEN: verifyParsedCodeInHrMaster() — cek apakah C0044 ada di HR master
    │     THEN: validateNameMatch() — Levenshtein similarity
    │       ├── similarity >= 0.8 → STRONG (auto-map OK)
    │       ├── similarity >= 0.5 → WEAK (auto-map, flag review)
    │       └── similarity < 0.5 → NEED_REVIEW (BLOCKED)
    │
    └─ 5. Fallback (tidak cocok dengan aturan di atas)
          → NEED_REVIEW
```

### SSOT Parser: zkteco-employee-code-parser.ts

File ini adalah **SATU-SATUNYA** tempat parsing logic berada. Semua modul lain HARUS menggunakan parser ini.

```typescript
// Algoritma parseWithScannerPrefix:
function parseWithScannerPrefix(rawId: string, prefix: string): ParsedMappingResult {
  const locCode = SCANNER_PREFIX_MAP[prefix];   // '500' → 'C'
  const suffix = rawId.slice(prefix.length);    // '5000040'.slice(3) → '0040'
  const paddedSuffix = suffix.slice(-4).padStart(4, '0');  // '0040' (sudah 4 digit)
  return {
    parsedEmployeeCode: `${locCode}${paddedSuffix}`  // 'C0040'
  };
}
```

---

## 4. Attendance Status Types

### Status di attendance_imports

| Status | Kondisi | Arti |
|--------|---------|------|
| `HADIR` | `COUNT >= 2` scan dari mesin | Karyawan hadir, check-in dan check-out tercatat di mesin |
| `INCOMPLETE_SCAN` | `COUNT = 1` scan dari mesin | Hanya ada 1 scan tercatat (masuk atau pulang saja) |
| `MANUAL_CORRECTION` | Di-entry manual oleh HR Admin | Status yang dikoreksi manual — ini SATU-SATUNYA data non-mesin |

### Status di vw_attendance_monthly_matrix (Final Status)

Matrix view menentukan `final_status` berdasarkan prioritas:

```
1. MANUAL_CORRECTION  ← Di-entry HR Admin lewat dashboard (bukan dari sistem lain)
2. ZKTECO (HADIR)     ← >=2 scan di hari kerja → HADIR
3. ZKTECO (INCOMPLETE)← 1 scan di hari kerja → INCOMPLETE_SCAN
4. SCAN_ON_OFFDAY     ← Scan di hari libur terjadwal → OFF_DAY
5. SCAN_ON_HOLIDAY    ← Scan di hari libur nasional → HOLIDAY
6. NO_DATA            ← Tidak ada record di mesin
```

**Poin penting**: "manual correction" BUKAN data dari sistem lain — itu overwrite manual oleh HR Admin. Satu-satunya sumber data asli tetap mesin ZKTeco.

### Status Display di Frontend

| UI Status | Kondisi | Warna |
|-----------|---------|-------|
| `HADIR` | >=2 scan di hari kerja | Hijau |
| `TIDAK_HADIR` | 0 scan di hari kerja | Merah |
| `INCOMPLETE_SCAN` | 1 scan di hari kerja | Orange |
| `OFF_DAY` | Scan di hari libur terjadwal | Abu-abu |
| `HOLIDAY` | Scan di hari libur nasional | Abu-abu |
| `NO_DATA` | Tidak ada record | Abu-abu |

---

## 5. Three Sync Entry Points

### Entry Point 1: Scheduler (Otomatis)

```
server.ts → startSchedulerService()
    │
    ├── Baca config/src/config/schedule.json
    │     Konfigurasi: intervalMinutes, enabled, jobs[]
    │
    ├── setInterval setiap N menit (default: 15 menit)
    │
    └── child_process.spawn('node dist/scripts/sync-machines.js')
              │
              └─→ Script standalone dengan mssql.connect() sendiri
```

**Konfigurasi** (`src/config/schedule.json`):
```json
{
  "enabled": true,
  "intervalMinutes": 15,
  "jobs": [
    { "name": "default", "intervalMinutes": 15, "enabled": true }
  ]
}
```

### Entry Point 2: HTTP API (Manual)

```
POST /api/ops/sync?machineCode=P1A
    │
    └── SyncOrchestrator.syncMachine(machineCode)
              │
              ├── Validasi: machine exists + ACCESSIBLE + DIRECT_ZKTECO
              ├── importJobService.createImportBatch()
              ├── ZktecoService.connect()
              │     └── disableDevice() → getUsers() → getAttendances() → enableDevice()
              ├── insertRawScanLog() untuk setiap attendance record
              │     └── UNIQUE constraint: (machine_code, raw_device_user_id, scan_time)
              ├── importJobService.completeBatch()
              └── publishSyncCompleted() → SSE event
```

### Entry Point 3: CLI Script (Manual Produksi)

```bash
# Sinkronisasi semua mesin aktif
node dist/scripts/sync-machines.js

# Filter mesin tertentu
node dist/scripts/sync-machines.js --machine=P1A

# Dry run (tidak insert)
node dist/scripts/sync-machines.js --dry-run
```

### Perbandingan Entry Points

| Aspek | Scheduler | HTTP API | CLI Script |
|-------|-----------|----------|------------|
| Trigger | Otomatis (interval) | Manual via HTTP | Manual via terminal |
| Scope | Semua mesin aktif | Per mesin | Semua/per-mesin |
| Batch tracking | `attendance_import_batches` | `import_batch` | `attendance_import_batches` |
| Mapping | Perlu proses terpisah | Perlu proses terpisah | Built-in rebuildImportsForMachineDates() |
| Real-time event | Ya (SSE) | Ya (SSE) | Tidak |
| Use case | Produksi | Dashboard / testing | Debugging |

---

## 6. Sync Orchestrator: Deduplication Logic

### Deduplication di attendance_scan_logs

**UNIQUE constraint** di level database:

```sql
ALTER TABLE attendance_scan_logs
ADD CONSTRAINT uq_scan_logs_dedup
UNIQUE (machine_code, raw_device_user_id, raw_record_time);
```

Setiap kali `insertRawScanLog()` dijalankan, constraint ini menjamin:
- Jika record yang sama (mesin + user ID + waktu) sudah ada → **INSERT silently ignored**
- Tidak ada error, tidak ada exception
- Progress tetap berlanjut

### Deduplication di attendance_imports

**NOT EXISTS check** di level aplikasi:

```sql
INSERT INTO attendance_imports (...)
SELECT ...
WHERE NOT EXISTS (
  SELECT 1 FROM attendance_imports ai
  WHERE ai.employee_code = @empCode
    AND ai.attendance_date = @date
    AND ai.source_reference = @machineCode
)
```

Ini mencegah duplikasi di level aggregated data.

---

## 7. Monthly Matrix API

### Mode database (default)

```http
GET /api/attendance/monthly-matrix?year=2026&month=6&division=A
```

Membaca dari `vw_attendance_monthly_matrix`, JOIN dengan `employees`, `divisions`, `gangs`. Mengisi tanggal kosong (employee yang tidak punya scan di tanggal tertentu tetap muncul).

### Mode datamesin

```http
GET /api/attendance/monthly-matrix?year=2026&month=6&mode=datamesin
```

Membaca langsung dari `attendance_scan_logs` tanpa melibatkan `vw_attendance_monthly_matrix`. Hanya menampilkan employee yang benar-benar punya raw scan di bulan tersebut.

### Mode traceable

```http
GET /api/attendance/monthly-matrix-traceable?year=2026&month=6
```

Mode paling detail. Setiap cell memiliki:
- `provenance`: JSON chain menunjukkan dari mana data berasal (MANUAL_CORRECTION → IMPORT → RAW_SCAN → HOLIDAY/OFF_DAY)
- `trace_state`: RAW_ONLY | IMPORTED | MANUAL_CORRECTION | HOLIDAY | OFF_DAY | NO_DATA
- `quality_flags`: Array flags seperti `INCOMPLETE_SCAN`, `MAPPING_REVIEW`, `HIGH_SCAN_COUNT`
- `reason`: Penjelasan tekstual kenapa status ini dipilih

### Cell Detail API

```http
GET /api/attendance/monthly-matrix/cell?date=2026-06-25&employeeCode=A0044
```

Untuk 1 employee di 1 tanggal. Mengembalikan:
- Semua raw scan logs di tanggal tersebut
- Data import jika ada
- Manual correction jika ada
- `expected_status` (WORKDAY / OFF_DAY / HOLIDAY)
- `quality_flags` array

---

## 8. File Reference

| File | Fungsi |
|------|--------|
| `src/modules/import/sync-orchestrator.service.ts` | HTTP API sync path — insert raw scan logs |
| `src/modules/attendance/attendance-process-import.service.ts` | Agregasi scan logs → attendance_imports |
| `src/modules/mapping/zkteco-employee-code-parser.ts` | **SSOT Parser** — raw ID → employee code |
| `src/modules/employees/employee-mapping.service.ts` | Cascading lookup dengan HR master + name validation |
| `src/modules/scheduler/scheduler.service.ts` | In-memory scheduler — spawn CLI script per interval |
| `src/api/routes/attendance.routes.ts` | Semua API matrix (database/datamesin/traceable/cell) |
| `src/api/routes/ops.routes.ts` | Ops summary, incidents, recommendations |

---

## 9. Troubleshooting Umum

### Status: NEED_REVIEW di scan logs

**Penyebab**: raw_device_user_id tidak bisa di-parse atau tidak ada di HR master.

**Solusi**:
1. Cek panjang ID: jika >5 digit tanpa scanner prefix → akan selalu NEED_REVIEW
2. Cek apakah employee_code hasil parsing ada di tabel `employees`
3. Cek name similarity: jika nama di mesin berbeda jauh dari HR master → perlu review manual

### Attendances tidak masuk matrix

**Penyebab**: attendance_imports tidak terisi, ATAU mapping_status masih NEED_REVIEW.

**Solusi**:
1. Cek apakah scan logs ada: `SELECT COUNT(*) FROM attendance_scan_logs WHERE scan_date = '2026-06-25'`
2. Cek mapping status: `SELECT mapping_status, COUNT(*) FROM attendance_scan_logs GROUP BY mapping_status`
3. Jika NEED_REVIEW tinggi → mapping belum resolve, scan log tidak masuk imports

### Data matrix berbeda dari raw scan

**Penyebab**: Matrix view menampilkan data dari 3 layer (raw scan logs → aggregated imports → manual corrections), bukan hanya raw scan. Prioritas data: **manual correction > scan logs > no data**.

**Solusi**: Gunakan mode `datamesin` untuk melihat data mentah saja, atau `traceable` untuk melihat provenance lengkap dari mana setiap status berasal.

---

## 10. Ringkasan Pipeline

```
Mesin ZKTeco (TCP:4370)
    │
    │ zk.getAttendances() ← SATU-SATUNYA sumber data
    ▼
attendance_scan_logs (raw — ground truth)
    │
    │ parseZktecoUserIdToEmployeeCode()
    │ + verifyParsedCodeInHrMaster()
    │ + validateNameMatch()
    ▼
attendance_scan_logs.updated (mapping_status = MAPPED/NEED_REVIEW)
    │
    │ AttendanceProcessService.processAllUnprocessed()
    │ GROUP BY (employee_code, scan_date, machine_code)
    │ MIN/MAX scan_time → check_in_at/check_out_at
    ▼
attendance_imports (agregasi — ringkasan per hari)
    │
    │ vw_attendance_monthly_matrix (view matriks)
    │ Manual corrections (overwrite manual oleh HR Admin)
    ▼
GET /api/attendance/monthly-matrix
```

**Kesimpulan**: Semua data di matrix — kecuali yang di-entry manual oleh HR Admin — berasal dari scan karyawan di mesin ZKTeco. Tidak ada data dari IT Solution, HR system, atau sumber lain.

---

## 11. Potensi Raw ID Salah Masuk ke Employee Code Lain

Ini pertanyaan penting: apakah ada kemungkinan scan dari raw ID A masuk ke employee code B?

### Jawaban Singkat: TIDAK dalam alur normal

Pada alur standard, tidak ada risiko cross-mapping karena:

```
Raw scan di mesin:
  → raw_device_user_id = "50044" (misalnya karyawan C0044)
  → attendance_scan_logs.raw_device_user_id = "50044"
  → attendance_scan_logs.parsed_employee_code = NULL (saat insert, mapping_status = 'NEED_REVIEW')
  → attendance_imports.employee_code = "C0044" (hasil parsing)

Scan "50044" TIDAK akan pernah masuk ke employee code lain.
```

### Tapi Ada Risiko Cross-Location

Yang bisa terjadi adalah **karyawan scan di mesin yang salah division**:

```
Karyawan C0044 (P2A) scan di mesin P1B (bukan mesinnya)
  → raw_device_user_id = "50044" (dari mesin P1B)
  → parsed_employee_code = "C0044" (prefix 500 = P2A = C)
  → attendance_imports.employee_code = "C0044" (benar)
  → attendance_imports.source_reference = "P1B" (mesin asal scan = P1B)
```

Ini bukan "salah masuk ke employee lain" — employee code tetap benar (C0044). Tapi lokasi scan berbeda dari seharusnya. Sistem sudah mendeteksi ini sebagai `is_cross_division_scan`.

### Skenario Risiko yang Sebenarnya Ada

| Skenario | Risiko | Sudah Tertangani? |
|----------|--------|-----------------|
| Scan A0044 masuk ke B0044 | ❌ Tidak mungkin | Tidak ada logika yang bisa menyebabkan ini |
| ID "50044" diparse sebagai C0044 padahal seharusnya A0044 | ⚠️ Ya, jika employee kedua terpakai di mesin berbeda | Ada audit cross-location |
| Long ID (tanpa scanner prefix) salah parsed | ⚠️ Ya | Long ID langsung NEED_REVIEW, tidak auto-map |
| Name mismatch (nama di mesin ≠ nama di HR) | ⚠️ Ya | Levenshtein similarity >= 0.8 baru auto-map |

### Audit Cross-Location

Ada script `src/scripts/audit-cross-location.ts` yang mendeteksi:

```sql
-- Mendeteksi: employee_code prefix (C) ≠ machine_code (P1B)
-- Artinya: karyawan C0044 scan di mesin P1B (bukan mesinnya)
```

Ini TIDAK berarti data salah employee code — tapi menunjukkan employee scan di lokasi yang tidak seharusnya.

### Kesimpulan: Data Aman

**Scan dari raw ID tertentu akan selalu menghasilkan employee code yang sama.** Tidak ada mekanisme dalam sistem ini yang会把 scan dari ID "50044" masuk ke employee code "C0045" atau "B0044". Yang terjadi adalah:

1. ✅ Karyawan C0044 scan di P2A → employee_code = C0044 ✅
2. ⚠️ Karyawan C0044 scan di P1B → employee_code = C0044, tapi flagged sebagai cross-location
3. ❌ Karyawan C0044 scan, employee_code menjadi B0044 → **TIDAK MUNGKIN dalam sistem ini**
