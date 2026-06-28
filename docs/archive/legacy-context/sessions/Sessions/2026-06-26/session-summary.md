# Session 2026-06-26 — Web App Patch (Endpoint 500 Fixes + Architecture Change)

## Tujuan

Patch web app absensi agar kompatibel dengan arsitektur database terbaru. Semua endpoint yang return 500 diperbaiki. Machine data sekarang dibaca dari raw data yang sudah di-import, bukan koneksi live ZKTeco.

## Result (Live-verified)

Semua endpoint yang dulu 500 sekarang return 200:

| Endpoint | Before | After |
|----------|--------|-------|
| `/api/attendance/monthly-matrix?mode=database` | 500 (view hang >60s) | 200, fast |
| `/api/attendance/monthly-matrix?mode=datamesin` | 30-50s+ timeout | 200 in 2.6s |
| `/api/monitoring/machine/ARC_01/employees` | 500 (GROUP BY error) | 200, fast |
| `/api/monitoring/machine/P1B/employees` | slow | 200, fast |
| `/api/employees-comprehensive?mode=database` | 500 (bad columns) | 200 |
| `/api/employees-comprehensive?mode=datamesin` | 500 (missing param) | 200 |

Build: backend `tsc` exit 0, frontend `vite build` exit 0.

## Commits (7 total, all pushed to GitHub)

1. `ff8fd91` Initial commit: baseline + secret sanitization
2. `8725d13` Enable attendance pipeline sync + rescue orphan NEED_REVIEW records
3. `7ca91f2` Fix frontend: duplicate React key, envelope mismatch, nested button
4. `b436d38` Fix monthly-matrix database mode: bypass slow view, query attendance_imports
5. `f2834ab` Fix employees-comprehensive 500: non-existent employees columns
6. `2eb95e9` Fix all 4 backend 500s + machine-employees architecture change
7. `2e18a9d` Optimize datamesin matrix: eliminate correlated subqueries (20x faster)

## Architecture Change

**Principle:** Machine data = already-imported raw data (`machine_user_raw` + `attendance_scan_logs`), NOT live ZKTeco connections.

- Endpoint mesin (`/api/monitoring/machine/:code/employees`) sekarang query `machine_user_raw` (~6k rows) + LEFT JOIN `attendance_scan_logs` untuk aggregates. Tidak ada correlated subqueries.
- Mesin offline (ARC_01 inaccessible) tetap return 200 dengan data yang sudah di-import. Tidak 500.
- Datamesin matrix pakai kolom langsung `current_emp_code`/`mapping_reason` (resolved at import), bukan `resolvedEmployeeCodeSql()` correlated subqueries.
- Database matrix pakai `attendance_imports` langsung via `monthly-matrix.service.ts`, bukan `vw_attendance_monthly_matrix` (view masih ref `zkteco_hr_employee_map` yang dropped, dan hang >60s).

## Root Causes & Fixes

### 1. monthly-matrix database mode (500 → 200)
- **Root cause:** Query `vw_attendance_monthly_matrix` hang >60s. View masih reference `zkteco_hr_employee_map` (dropped 2026-06-24). COUNT di view timeout >20s.
- **Fix:** New `src/modules/attendance/monthly-matrix.service.ts` dengan `getProcessedMatrix()` query `attendance_imports` langsung. Route early-return calls service. (FR-002, FR-019)
- **Bug tambahan:** `COUNT(DISTINCT employee_code) OVER ()` tidak supported di SQL Server. Fix: `MAX(emp_rn)` subquery.

### 2. monthly-matrix datamesin mode (30-50s → 2.6s)
- **Root cause:** Correlated subqueries `resolvedEmployeeCodeSql()` + `resolvedMappingReasonSql()` per row di 800k scan_logs.
- **Fix:** Pakai kolom langsung: `COALESCE(current_emp_code, parsed_employee_code)`, `s.mapping_reason`, `e.employee_name` via JOIN. (FR-003)

### 3. machine-employees (500 → 200)
- **Root cause:** `mappedStats` query select `resolvedEmployeeNameSql()` (ref `s.zkteco_user_name`) tanpa GROUP BY/aggregate → SQL error. Plus correlated subqueries slow.
- **Fix:** Rewrite: query `machine_user_raw` base + LEFT JOIN scan_logs aggregates. JS split ke machine_raw/database_mapped/unmapped. Try/catch guard. (FR-007)

### 4. employees-comprehensive (500 → 200, both modes)
- **Root cause:** Service query `e.division_code`, `e.gang_code`, `e.machine_count`, `e.parsed_employee_code` di table `employees` — kolom tidak ada (employees punya `division_id`/`gang_id`, bukan `division_code`/`gang_code`; no `machine_count`/`parsed_employee_code`). Plus missing `@mappingStatus` param.
- **Fix:** LEFT JOIN divisions (use `d.division_code`), NULL AS aliases, add `@mappingStatus` param. (FR-008)

## Frontend Fixes

| Bug | Fix | FR |
|-----|-----|----|
| duplicate key `undefined` | `EmployeeComprehensiveTable.tsx`: `key={col.id ?? col.accessorKey ?? col-${index}}` | FR-010 |
| employees-comprehensive stuck/empty | `employee-comprehensive.service.ts`: drop `ApiResponse<>` wrapper (api() sudah unwrap) | FR-008 |
| nested `<button>` in `<button>` | `MachinesPage.tsx`: outer → `<article role="button">` | FR-011 |
| no error state | `EmployeeComprehensivePage.tsx`: isError + error/retry banner | FR-009 |
| null/undefined in UI | new `frontend/src/utils/display.ts`: `safeText()` + `resolveDisplayName()` | FR-012 |

## Files Changed

**Backend:**
- `src/modules/attendance/monthly-matrix.service.ts` (NEW)
- `src/api/routes/attendance.routes.ts` (database early-return + datamesin direct columns)
- `src/api/routes/machine-employee.routes.ts` (machine_user_raw rewrite + try/catch)
- `src/modules/employees/employee-comprehensive.service.ts` (column fixes + param)

**Frontend:**
- `frontend/src/utils/display.ts` (NEW)
- `frontend/src/services/employee-comprehensive.service.ts`
- `frontend/src/components/features/employees-comprehensive/EmployeeComprehensiveTable.tsx`
- `frontend/src/components/features/employees-comprehensive/EmployeeComprehensivePage.tsx`
- `frontend/src/components/features/machines/MachinesPage.tsx`

## DB State (2026-06-26)

- `attendance_scan_logs`: 808,093 rows
- `attendance_imports`: 55,051 rows
- `machine_user_raw`: 6,293 rows
- `employees`: 8,005 rows

## ⚠️ Warnings for future work

- JANGAN re-introduce `resolvedEmployeeCodeSql()`/`resolvedMappingReasonSql()`/`resolvedEmployeeNameSql()` di matrix/machine queries. Sebab 30-50s timeout.
- JANGAN query `vw_attendance_monthly_matrix` untuk matrix database mode. Pakai `attendance_imports` langsung.
- `vw_attendance_monthly_matrix` masih reference `zkteco_hr_employee_map` (dropped). View perlu di-rebuild (migration 072 seharusnya tapi belum effective).
- `employees` table: tidak ada `division_code`/`gang_code`/`machine_count`/`parsed_employee_code`. Pakai `division_id` → JOIN divisions.