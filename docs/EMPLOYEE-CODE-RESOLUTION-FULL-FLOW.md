# Employee Code Resolution — Full Flow Dokumentasi

**Tanggal:** 2026-06-25
**Tujuan:** Mendokumentasikan 4 tahap resolusi: Parsing → Mapping → NIK Resolution → Pipeline

---

## Ringkasan 4 Tahap

```
ZKTeco Machine (raw_device_user_id: "4000521")
  │
  ├─ TAHAP 1: SSOT PARSER (sync time)
  │   raw_device_user_id → parsed_employee_code
  │   "4000521" → "H0052"
  │   Location: normalizeRecord() di sync-machines.ts + sync-orchestrator.service.ts
  │
  ├─ TAHAP 2: MAPPING STATUS (sync time)
  │   allowAutoMap? → MAPPED : NEED_REVIEW
  │   Location: insertRawScan() / insertRawScanLog()
  │
  ├─ TAHAP 3: NIK RESOLUTION / CURRENT EMP CODE (post-sync enrichment)
  │   parsed_employee_code → employees → current_emp_code (via NIK)
  │   Location: enrich step di sync + current-employee-resolution.service.ts
  │
  └─ TAHAP 4: ATTENDANCE PIPELINE (attendance_imports rebuild)
      parsed → e_parsed → e_current (NIK cascade) → attendance_imports
      Location: attendance-process-import.service.ts
```

---

## TAHAP 1: SSOT Parser — raw_device_user_id → parsed_employee_code

**File:** `src/modules/mapping/zkteco-employee-code-parser.ts`
**Fungsi:** `parseZktecoUserIdToEmployeeCode(input)`

### Scanner Prefix → locCode Mapping

| Prefix | Division | locCode | Contoh Input | Output |
|--------|----------|---------|-------------|--------|
| `100` | P1A | A | `10044` → EXCLUDED (len=5) | — |
| `100` | P1A | A | `1000044` | `A0044` |
| `200` | ARC | J | `2000015` | `J0015` |
| `300` | P1B | B | `3000193` | `B0193` |
| `400` | AB2 | H | `4000521` | `H0052` |
| `500` | P2A | C | `5000040` | `C0040` |
| `700` | DME | E | `7000088` | `E0088` |
| `800` | ARA | F | `8000001` | `F0001` |
| `900` | AB1 | G | `9000042` | `G0042` |
| `001` | IJL | L | `0010022` | `L0022` |

### Parsing Rules (Priority Order)

```
Input: raw_device_user_id

1. EMPTY?
   └→ EXCLUDED ("EMPTY_RAW_ID")

2. Format [A-Z][0-9]{4}?   (e.g., "H0052")
   └→ EXACT ("RAW_ID_ALREADY_EMPLOYEE_CODE")
      parsedEmployeeCode = raw value, locCode = first char

3. Numeric-only, length ≤ 5?
   └→ EXCLUDED ("RAW_ID_TOO_SHORT_EXCLUDED")

4. Numeric-only, length > 5, starts with scanner prefix (001/100/200/.../900)?
   └→ STRONG ("PARSED_SCANNER_PREFIX_{prefix}_LOC_{locCode}")
      Algoritma: strip prefix → ambil last 4 suffix → pad 0 → prepend locCode
      Contoh: 4000521 → strip '400' → '0521' → last4='0521' → 'H0521'

5. Numeric-only, length > 5, NO scanner prefix?
   └→ NONE ("LONG_RAW_ID_NO_PREFIX_LOOKUP_REQUIRED")
      Butuh lookup manual/direct ke employees.zkteco_user_id

6. Non-numeric, non-standard?
   └→ EXCLUDED ("UNSUPPORTED_FORMAT")
```

### Parser Output Structure

```typescript
{
  parsedEmployeeCode: "H0052" | null,
  scannerPrefix:      "400" | null,
  locCode:            "H" | null,
  confidence:         "EXACT" | "STRONG" | "WEAK" | "NONE" | "EXCLUDED",
  reason:             "PARSED_SCANNER_PREFIX_400_LOC_H",
  allowAutoMap:       true | false  // true → mapping_status='MAPPED'
}
```

### Nama Validasi (Secondary Step — BLOCK auto-map jika mismatch)

```
Name similarity < 0.5 → NAME_MISMATCH → BLOCK (allowAutoMap = false)
Name similarity 0.5-0.8 → WEAK_NAME_MATCH → allow (tapi flag NEED_REVIEW)
Name similarity ≥ 0.8 → STRONG_NAME_MATCH → allow
```

---

## TAHAP 2: Mapping Status — Per Record di Scan Logs

**Diisi oleh:** `sync-machines.ts` (CLI path) dan `sync-orchestrator.service.ts` (HTTP API path)

### Kolom di `attendance_scan_logs`

| Kolom | Deskripsi | Sumber |
|-------|-----------|--------|
| `raw_device_user_id` | User ID mentah dari ZKTeco | `zk.getAttendances()` |
| `parsed_employee_code` | Hasil SSOT parser | `parseZktecoUserIdToEmployeeCode()` |
| `parsed_division_code` | locCode dari parser | `parsed.locCode` |
| `mapping_status` | `MAPPED` / `NEED_REVIEW` | `parsed.allowAutoMap ? 'MAPPED' : 'NEED_REVIEW'` |
| `mapping_reason` | Alasan mapping | `parsed.reason` (e.g. "PARSED_SCANNER_PREFIX_400_LOC_H") |

### Status Values

| Value | Kapan | Artinya |
|-------|-------|---------|
| `MAPPED` | `allowAutoMap = true` | Bisa langsung proses ke attendance_imports |
| `NEED_REVIEW` | `allowAutoMap = false` | Butuh manual review / NIK lookup / format tidak dikenal |

> **⚠️ PENTING:** Sebelumnya sync scripts tulis `AUTO_MAPPED`, tapi semua pipeline cari `MAPPED`.
> Sudah difix — sekarang sync tulis `MAPPED`. Migration 073 normalisasi existing data.

---

## TAHAP 3: NIK Resolution — parsed_employee_code → current_emp_code

**Masalah:** Employee code bisa berubah karena mutasi/rotasi.
- Karyawan scan dengan kode lama `H0052` (parsed dari raw device ID)
- Di HR system, kode dia sekarang `H0520`
- NIK-nya tetap sama: `12345678`

### End-to-End Flow

```
parsed_employee_code: "H0052"
  │
  ├─ [3a] DIRECT MATCH via employees table
  │   SELECT * FROM employees WHERE employee_code = 'H0052'
  │   └─ Ketemu: id=123, current_emp_code='H0520', nik='12345678'
  │
  ├─ [3b] FOLLOW current_emp_code
  │   SELECT * FROM employees WHERE employee_code = 'H0520' AND is_active = 1
  │   └─ Ketemu: id=456, employee_code='H0520', employee_name='SUARDI'
  │
  └─ [3c] RESULT
      current_employee_id = 456
      current_emp_code = 'H0520'
      current_mapping_status = 'MAPPED'
      current_mapping_reason = 'NIK_RESOLVED_VIA_CURRENT_EMP_CODE'
```

### Dua Jalur NIK Resolution

#### Jalur A: Code-side (sync enrichment) — `sync-machines.ts` + `sync-orchestrator.service.ts`

```sql
-- Setelah insert attendance_scan_logs, jalankan enrichment:
UPDATE sl SET
    sl.current_emp_code = COALESCE(e_curr.employee_code, e_parsed.current_emp_code, e_parsed.employee_code),
    sl.current_employee_id = COALESCE(e_curr.id, e_parsed.id),
    sl.current_mapping_status = CASE WHEN ... IS NOT NULL THEN 'MAPPED' ELSE 'NEED_REVIEW' END
FROM attendance_scan_logs sl
LEFT JOIN employees e_parsed ON e_parsed.employee_code = sl.parsed_employee_code
LEFT JOIN employees e_current
    ON e_current.employee_code = e_parsed.current_emp_code
    AND e_current.is_active = 1
    AND e_current.employee_code != e_parsed.employee_code
WHERE sl.sync_batch_id = @batchId
```

#### Jalur B: Service-side (via API/frontend) — `current-employee-resolution.service.ts`

```
resolveCurrentEmpCode("H0052")
  │
  ├─ Step 1: Cache check (memory cache untuk 10,000 entries)
  ├─ Step 2: Lookup "H0052" di DB_PTRJ.dbo.HR_EMPLOYEE → dapat NewICNo (NIK)
  ├─ Step 3: Normalize NIK (trim, uppercase)
  ├─ Step 4: Lookup NIK di hr_employee_current_snapshot → current_emp_code
  ├─ Step 5: Check ambiguity (is_ambiguous=1? multiple active rows?)
  └─ Step 6: Return MAPPED_CURRENT dengan currentEmpCode
```

### Sumber Data NIK Resolution

| Table | Role | Diisi Oleh |
|-------|------|-----------|
| `DB_PTRJ.dbo.HR_EMPLOYEE` | HR master: EmpCode → NewICNo (NIK) | External HR system |
| `hr_employee_current_snapshot` | Cache: NIK → current_emp_code | `hr-employee-sync.service.ts` |
| `employees.nik` | Local cache NIK | `hr-employee-sync.service.ts` |
| `employees.current_emp_code` | Latest employee code for this NIK | Backfill migration 073 / HR sync |
| `employees.current_resolution_status` | MAPPED_CURRENT / PARSED_ONLY / NIK_NOT_FOUND | Migration 073 / resolution service |

### Kenapa employees.nik Masih NULL (Current State)

HR sync (`hr-employee-sync.service.ts`) adalah yang mengisi `employees.nik` dari `DB_PTRJ.dbo.HR_EMPLOYEE.NewICNo`. Saat ini belum pernah dijalankan:
- HR sync perlu koneksi ke database external DB_PTRJ
- Tanpa HR sync, `employees.nik` = NULL → `current_emp_code` = self-reference (`employee_code`)
- Setelah HR sync dijalankan, NIK resolution akan berfungsi penuh

---

## TAHAP 4: Attendance Pipeline — attendance_imports Rebuild

**File:** `src/modules/attendance/attendance-process-import.service.ts`

### processScanLogsForBatch() — Per Batch

```sql
INSERT INTO attendance_imports (employee_id, employee_code, ...)
SELECT
    COALESCE(e_current.id, e_parsed.id) AS employee_id,
    COALESCE(e_current.employee_code, e_parsed.employee_code, s.parsed_employee_code) AS employee_code,
    ...
FROM attendance_scan_logs s
LEFT JOIN employees e_parsed ON e_parsed.employee_code = s.parsed_employee_code
LEFT JOIN employees e_current
    ON e_current.employee_code = e_parsed.current_emp_code   -- NIK resolution!
    AND e_current.is_active = 1
    AND e_current.employee_code != e_parsed.employee_code
WHERE s.mapping_status IN ('MAPPED', 'AUTO_MAPPED')
  AND s.parsed_employee_code IS NOT NULL
```

### processAllUnprocessed() — All Batches

Sama — tapi dengan query dulu, baru INSERT per row (bisa pakai `resolved_employee_code` yang sudah di-resolve di query).

### Attendance Status Logic

```
COUNT(scan_time) ≥ 2 → HADIR (check_in = MIN, check_out = MAX)
COUNT(scan_time) = 1 → INCOMPLETE_SCAN (check_in = MIN, check_out = NULL)
COUNT(scan_time) = 0 → (tidak diproses)
```

### NEED_REVIEW Records

```
mapping_status = 'NEED_REVIEW' → division_code = 'MANUAL_REVIEW'
employee_code = 'MANUAL_' + raw_device_user_id
needs_manual_review = 1
```

---

## Display Name Resolution (Frontend)

**File:** `frontend/src/services/attendance-service.ts`

```
Priority cascade:
  1. employees.employee_name (HR name)              → "SUARDI"
  2. attendance_scan_logs.zkteco_user_name           → "SUARDI (ROHANIAH)"
  3. machine_user_raw.machine_raw_user_name          → "SUARDI (ROHANIAH)"
  4. employees.employee_code                         → "H0520"
  5. attendance_scan_logs.raw_device_user_id          → "4000521"
  6. "-" (fallback)
```

---

## Ringkasan Semua File yang Terlibat

| # | File | Peran | Status |
|---|------|-------|--------|
| 1 | `src/modules/mapping/zkteco-employee-code-parser.ts` | SSOT parser: raw ID → employee code | **ACTIVE** — dipanggil sync |
| 2 | `src/scripts/sync-machines.ts` | CLI sync: parsing + mapping + enrichment | **UPDATED** — parsing + MAPPED + NIK |
| 3 | `src/modules/import/sync-orchestrator.service.ts` | HTTP sync: parsing + mapping + enrichment | **UPDATED** — parsing + MAPPED + NIK |
| 4 | `src/modules/attendance/attendance-process-import.service.ts` | Pipeline: scan_logs → attendance_imports | **UPDATED** — NIK JOIN cascade |
| 5 | `src/modules/employees/current-employee-resolution.service.ts` | NIK resolution service (API path) | ACTIVE — tidak dipakai pipeline |
| 6 | `src/modules/employees/hr-employee-sync.service.ts` | HR sync: DB_PTRJ → employees (nik) | PENDING — belum dijalankan |
| 7 | `src/modules/employees/employee-comprehensive.service.ts` | Frontend data: resolvedEmployeeCodeSql | ACTIVE |
| 8 | `migrations/072_backfill_parsed_employee_code.sql` | Backfill parsed_employee_code | SUDAH JALAN |
| 9 | `migrations/073_normalize_mapping_status_and_current_emp_code.sql` | Normalize + backfill current_emp_code | SUDAH JALAN via script |
| 10 | `docs/EMPLOYEE-DATA-FLOW.md` | 8 tempat employee data | DONE |
| 11 | `docs/EMPLOYEE-CODE-RESOLUTION-FULL-FLOW.md` | This document | DONE |

---

## Dataset Saat Ini (Post-Audit, 2026-06-26)

| Table | Rows | Status |
|-------|------|--------|
| `attendance_scan_logs` | 808,093 | WIB-corrected, 0 corrupt dates ✅ |
| `attendance_scan_logs.parsed_employee_code` (not null) | ~808,093 | Normalized ✅ |
| `attendance_scan_logs.mapping_status=MAPPED` | ~808,093 | Normalized ✅ |
| `attendance_imports` | 55,051 | 11 divisions, 99.99% enriched ✅ |
| `employees` | 3,761 | Need HR sync |
| `employees.nik` | NULL (all) | **BLOCKER** — HR sync needed |
| `employees.current_emp_code` | = employee_code (self-ref) | No NIK → no resolution |
| `hr_employee_current_snapshot` | 4,763 | Data ada, siap pakai |
| `attendance_imports` | 0 | Pipeline belum dijalankan |

---

## Next Steps

1. **Jalankan HR sync** (`hr-employee-sync.service.ts`) — isi `employees.nik` dari `DB_PTRJ`
2. **Re-run backfill current_emp_code** — setelah NIK terisi, resolusi akan berubah
3. **Jalankan pipeline** (`processAllUnprocessed`) — rebuild `attendance_imports` dengan NIK resolution
4. **Jalankan sync 1 mesin** — verifikasi flow end-to-end berjalan