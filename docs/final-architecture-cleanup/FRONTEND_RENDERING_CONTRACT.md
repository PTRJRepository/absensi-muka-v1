# FRONTEND_RENDERING_CONTRACT — Kontrak Render Frontend

> Basis: audit `frontend/src/**.tsx` + `frontend/src/services/*` + `frontend/src/types/*` (2026-06-26).
> Related: [[API_CONTRACT_FINAL]] [[ARCHITECTURE_FINAL]]

---

## 1. Data Contract per Mode

### Mode Database (final HR view)
- **Source:** `attendance_imports` + `employees` (via `monthly-matrix?mode=database`, `employees-comprehensive?mode=database`)
- **Key utama:** `employee_code` + `attendance_date`
- **Identity wajib:** `current_emp_code` (HR current), BUKAN parsed.
- **Merge lintas mesin:** ✅ scan di beberapa mesin tanggal sama → 1 cell. `check_in_at`=MIN, `check_out_at`=MAX.

### Mode Data Mesin (debugging)
- **Source:** `machine_user_raw` + `attendance_scan_logs` (via `mode=datamesin`)
- **Key utama:** `machine_code` + `raw_device_user_id`
- **Identity:** `parsed_employee_code` (raw, untuk debug). Boleh tampilkan.
- **Merge lintas employee:** ❌ TIDAK boleh. Ikut data mesin asli.

---

## 2. `row_key` Wajib (stable, unik)

Aturan: row_key **harus** unik per row. Jangan pakai index array kecuali last resort.

| Komponen | Key saat ini | Status | Fix |
|----------|-------------|--------|-----|
| `AttendanceMatrixPage.tsx:301` | `row.identityKey \|\| row.employeeCode \|\| row.rawDeviceUserId \|\| \`${row.machineCode ?? 'row'}\`` | ⚠️ cascade panjang, mungkin collide | Prioritas: `identityKey` (backend wajib kirim) → fallback `employeeCode` → fallback `rawDeviceUserId`. Backend **wajib** kirim `identity_key` unik. |
| `EmployeeComprehensiveTable.tsx:552,560,579` | `col.id ?? col.accessorKey ?? \`col-${index}\`` | ✅ OK | — |
| `DataTable.tsx:69` | `String(row[keyField]) ?? i` | ❌ **DEAD CODE** — `String(undefined)` = `"undefined"`, `??` tidak trigger → duplicate `"undefined"` keys | Fix: `row[keyField] != null ? String(row[keyField]) : \`row-${i}\`` |
| `AttendancePage.tsx:435` | `scan.scan_log_id \|\| idx` | ⚠️ fallback idx OK bila scan_log_id unik | — |
| `EmployeeIdentityDrawer.tsx:403` | `scan.id \|\| index` | ⚠️ OK bila id unik | — |
| `AttendanceMatrixPage.tsx:422` | `String(log.id ?? index)` | ✅ OK | — |

### Anti-pattern index keys (PERLU FIX)
Index key (`key={i}` / `key={idx}` / `key={index}`) menyebabkan re-render bug saat reorder/filter:

| File:line | Pattern |
|-----------|---------|
| `DataTable.tsx:53` | `key={i}` |
| `Skeleton.tsx:25` | `key={i}` |
| `AttendancePage.tsx:392` | `key={idx}` |
| `BatchHistoryPage.tsx:181` | `key={m}` |
| `MachineClockHealthPage.tsx:82,144` | `key={h}` |
| `QualityMetrics.tsx:112,129` | `key={index}`, `key={i}` |
| `DashboardPage.tsx:179,181,245` | `key={i}`, `key={index}` |
| `EmployeeComprehensiveTable.tsx:558` | `key={i}` |
| `MachineDetailModal.tsx:1039` | `key={idx}` |
| `MachinesPage.tsx:313` | `key={index}` |

### Duplicate key bugs (PERLU FIX — data-driven collision)
| File:line | Key | Bug |
|-----------|-----|-----|
| `QualityPage.tsx:218` | `key={batch.status}` | status berulang → duplikat |
| `MonitoringDashboard.tsx:151` | `key={item}` | item = object → `[object Object]` → semua duplikat |
| `MachinesPage.tsx:300` | `key={status}` | status berulang |
| `MachinesPage.tsx:435` | `key={network}` | network group mungkin berulang |
| `AttendanceMatrixPage.tsx:404` | `key={flag}` | flag mungkin berulang |

**Fix:** pakai `key={\`${status}-${i}\`}` atau field unik (`batch.id`, `item.id`).

---

## 3. `cell_key` Wajib (matrix cell)

Format: `${employee_code}_${attendance_date}` (mode database) atau `${machine_code}_${raw_device_user_id}_${attendance_date}` (mode datamesin).

- Cell **wajib** unik per employee+date di mode database (meskipun scan di beberapa mesin → merge 1 cell).
- Cell detail modal pakai cell_key untuk fetch `/api/attendance/monthly-matrix/cell?employeeCode=...&date=...`.

---

## 4. `display_name` Priority (cascade)

Saat render nama karyawan, pakai **first non-empty** dari urutan ini:

```
employee_name          → final resolved name (current)
  ↓ (empty/null)
current_emp_name       → HR current name
  ↓
zkteco_user_name       → nama di mesin ZKTeco
  ↓
machine_raw_user_name  → nama dari machine_user_raw
  ↓
employee_code          → kode (fallback identitas)
  ↓
raw_device_user_id     → raw ID (debug only)
  ↓
"-"                    → placeholder
```

Implementasi: `frontend/src/utils/display.ts` → `resolveDisplayName(row)` + `safeText(value)`. **Pakai ini, jangan inline cascade.**

> Mode Database: prioritaskan `employee_name`/`current_emp_name`. Mode Data Mesin: boleh `zkteco_user_name`/`machine_raw_user_name` untuk debugging.

---

## 5. State Contracts

### Loading state
- React Query `isLoading` / `isPending` → tampilkan Skeleton (jumlah baris sesuai pageSize).
- Jangan tampilkan tabel kosong saat loading.

### Error state
- React Query `isError` → tampilkan error banner dengan `error.message`.
- `EmployeeComprehensivePage.tsx` sudah ada error banner (FR-009 fix). **Pakai pola ini di semua page.**
- Jangan swallow error (return `[]` diam-diam).

### Empty state
- `data.length === 0` (dan bukan loading/error) → tampilkan empty state: "Tidak ada data untuk filter ini" + suggestion reset filter.
- **Bukan** error. Backend return 200 `[]`.

---

## 6. Cell Detail Modal Contract

Trigger: klik cell matrix → buka modal.

| Field | Source | Keterangan |
|-------|--------|-----------|
| `employee_code` / `current_emp_code` | API cell response | identitas |
| `attendance_date` | cell_key | tanggal |
| `final_status` | `data.final_status` | HADIR/INCOMPLETE_SCAN/NO_DATA |
| `source` | `data.source` | ZKTECO/MANUAL_CORRECTION/NO_DATA |
| `expected_status` | `data.expected_status` | dari holiday/work calendar |
| `check_in_at` / `check_out_at` | `data.check_in_at` / `data.check_out_at` | |
| `scan_count` | `data.scan_count` | jumlah scan |
| `raw_logs` | `data.raw_logs[]` | detail tiap scan (machine_code, scan_time, verify_type) |
| `correction` | `data.correction` | manual correction jika ada (null jika tidak) |
| `quality_flags` | `data.quality_flags[]` | badge array |
| `provenance` | `data.provenance` (JSON string) | parse + tampilkan source_chain |

API call: `GET /api/attendance/monthly-matrix/cell?date=...&employeeCode=...&rawDeviceUserId=...&machineCode=...`

---

## 7. Fix Duplicate Key `undefined`

**Root cause:** `DataTable.tsx:69` — `String(row[keyField]) ?? i`. `String(undefined)` menghasilkan string `"undefined"`, jadi `??` (nullish) tidak trigger fallback ke `i`. Semua row dengan `keyField` undefined dapat key `"undefined"` → duplikat.

**Fix:**
```tsx
// BAD
key={String(row[keyField]) ?? i}

// GOOD
key={row[keyField] != null ? String(row[keyField]) : `row-${i}`}
```

Atau lebih baik: backend **wajib** kirim `identity_key` unik, frontend pakai itu sebagai `keyField`.

---

## 8. Nested Button Issue (MachinesPage)

**Status: FIXED** (FR-011, 2026-06-26). Audit konfirmasi 0 nested `<button>` tersisa.

Pola fix: outer `<button>` → `<article role="button">` (atau `<div onClick>`). Jangan nested `<button>` di dalam `<button>` (invalid HTML → hydration/DOM error).

Aturan: kalau card/button parent punya child interaktif (button/link), parent **bukan** `<button>`. Pakai `<article>`/`<div>` + `onClick`.

---

## 9. Badge Contracts

### Mapping Status Badge (Data Mesin mode)

| Status | Warna | Keterangan |
|--------|-------|-----------|
| `MAPPED` | hijau | parsed code cocok employee |
| `NEED_REVIEW` | kuning/oranye | butuh review (NIK NULL, ambiguous, dll) |
| `UNMAPPED` | abu-abu | tidak ketemu employee |
| `AMBIGUOUS` | merah | NIK punya >1 emp_code (is_ambiguous=1) |

### Attendance Status Badge (Database mode)

| Status | Warna | Keterangan |
|--------|-------|-----------|
| `HADIR` | hijau | 2+ scan |
| `INCOMPLETE_SCAN` | kuning | 1 scan (no checkout) |
| `MANUAL_REVIEW` | oranye | unmapped/unresolved |
| `NO_DATA` | abu-abu | tidak ada scan |
| `PRESENT` (legacy view) | hijau | alias HADIR |
| `ABSENT` / `ALPHA` / `TIDAK_HADIR` | merah | tidak hadir |

Implementasi: `frontend/src/services/status-mapping.ts` (sudah ada, pakai ini).

---

## 10. Summary Cards Source

Dashboard summary cards **wajib** dari row actual, bukan `attendance_import_batches`:

| Metric | Source query | Bukan |
|--------|-------------|-------|
| Total machines | `COUNT(*) FROM attendance_machines WHERE is_active=1` | — |
| Online machines | `COUNT(*) FROM attendance_machines WHERE last_sync_at > DATEADD(minute,-60,GETDATE())` | ❌ jangan = total |
| Total employees | `COUNT(*) FROM employees WHERE is_active=1` | — |
| Scans today | `COUNT(*) FROM attendance_scan_logs WHERE CAST(scan_time AS DATE)=CAST(GETDATE() AS DATE)` | — |
| Unmapped count | `COUNT(*) FROM attendance_scan_logs WHERE mapping_status='NEED_REVIEW'` | — |
| Quality score | compute: `1 - (NEED_REVIEW + NULL_nik) / total` | ❌ hardcoded 85 |
| Last sync | `MAX(started_at) FROM attendance_sync_logs` atau `MAX(last_sync_at) FROM attendance_machines` | ❌ bukan `attendance_import_batches.started_at` |

---

## 11. File Mapping (frontend → endpoint)

| Frontend | Endpoint | Mode |
|----------|----------|------|
| `AttendanceMatrixPage.tsx` | `/api/attendance/monthly-matrix?mode=` | database/datamesin |
| `EmployeeComprehensivePage.tsx` | `/api/employees-comprehensive?mode=` | database/datamesin |
| `EmployeeComprehensiveTable.tsx` | (props dari page) | — |
| `EmployeeComprehensiveToolbar.tsx` | (mode toggle) | — |
| `EmployeeDetailModal.tsx` | `/api/employees-comprehensive/:code/detail` | — |
| `EmployeeIdentityDrawer.tsx` | `/api/employees-comprehensive/:code/scans` | — |
| `MachinesPage.tsx` | `/api/machines` + `/api/monitoring/machine/:code/employees` | — |
| `MachineDetailModal.tsx` | `/api/monitoring/machine/:code/employees` | database |
| `DashboardPage.tsx` | `/api/dashboard/stats` | — |
| `AttendancePage.tsx` | `/api/attendance/...` | — |

Service layer: `attendance-service.ts` (matrix + cell), `employee-comprehensive.service.ts`, `machine-service.ts`, `ops-service.ts`. Semua via `api-client.ts` (sudah unwrap `ApiResponse<>` — jangan double-wrap).
