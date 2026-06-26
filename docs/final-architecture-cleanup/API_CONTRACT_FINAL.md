# API_CONTRACT_FINAL — Kontrak Endpoint Final

> Basis: source code audit 2026-06-26 (`src/api/routes/*`, `src/modules/attendance/monthly-matrix.service.ts`, `src/modules/employees/employee-comprehensive.service.ts`, `src/api/response.ts`).
> Related: [[ARCHITECTURE_FINAL]] [[FRONTEND_RENDERING_CONTRACT]] [[DATA_DICTIONARY_FINAL]]

---

## 0. Response Wrapper (TIDAK konsisten saat ini — target final)

Backend punya **3 helper** di `src/api/response.ts`:

| Helper | Shape | Dipakai oleh |
|--------|-------|--------------|
| `sendJson(res,status,data,message='OK')` | `{success, data, message}` | machine-employee, dashboard |
| `sendError(res,status,code,message)` | `{success:false, error:{code, message}}` | semua error |
| `sendEnvelope(res,status,data,meta={},errors=[])` | `{success, data, meta:{generated_at,...}, errors}` | attendance (matrix+cell), employees-comprehensive |

### Target FINAL (konsisten)

Semua endpoint **wajib** return:
```json
{
  "success": boolean,
  "data": <array|object>,
  "summary"?: <object>,          // KPI/agregat (opsional)
  "pagination"?: { "page", "pageSize", "total", "totalPages" },
  "meta"?: { "generated_at", "source", "mode", "period" },
  "error"?: { "code": string, "message": string, "detail"?: string }
}
```

Aturan:
- **Empty data → 200** dengan `data: []` (atau zeroed object), `pagination.total: 0`. **Bukan 500/404.**
- **Query error → 500** dengan `error.code` + `error.detail` (stack/pesan).
- **Not found (by code) → 404** `error.code: 'NOT_FOUND'`.
- **Validation error → 400** `error.code: 'INVALID_*'`.

### Gap saat ini (perlu fix — lihat [[MIGRATION_ROADMAP]] Phase 2)
- 3 dari 6 endpoint group **tidak punya try/catch** → error propagasi ke router-level handler tanpa `error.code`/`error.detail`.
- `sendError` tidak punya field `detail`.
- Wrapper tidak seragam (`sendJson` vs `sendEnvelope`). Target: semua pakai envelope.

---

## 1. `GET /api/attendance/monthly-matrix?mode=database`

| Aspek | Detail |
|-------|--------|
| **Source** | `attendance_imports` (direct via service) — **BUKAN** `vw_attendance_monthly_matrix` (view broken) |
| **Service** | `monthly-matrix.service.ts` → `getProcessedMatrix()` |
| **Query strategy** | CTE filter `attendance_imports` by `attendance_year`/`attendance_month`/`division_code`/`status`/`source`/search; `DENSE_RANK() OVER (ORDER BY employee_code)` untuk employee-level pagination; LEFT JOIN employees+divisions untuk name resolution. |
| **Query params** | `year, month, divisionCode, machineCode, status, mapping, source, mode, activeOnly, search, page (def 1), pageSize (def 100, clamp 1–500, alias limit)` |
| **Response 200** | `{ success, data: { rows: [...], pagination: {page,pageSize,total,totalPages} }, meta: {generated_at, source:'final_attendance_matrix', mode, period} }` |
| **Row fields** | `identity_key, current_emp_code, employee_code, employee_name, display_name, division_code, attendance_date, final_status, ui_status, final_check_in, final_check_out, source, scan_count, needs_manual_review, has_manual_correction, is_leave, is_sick, is_holiday, mapping_status, total_rows` |
| **Empty** | 200 `rows: []`, `total: 0` |
| **Error** | ❌ **no try/catch** → router 500 tanpa `error.code`. **PERLU FIX.** |
| **Pagination** | Ya, `page`+`pageSize`, DENSE_RANK offset. |

> ⚠️ **Wajib sertakan** (per [[ARCHITECTURE_FINAL]] §6): `parsed_employee_code`, `current_emp_code`, `current_resolution_status`, `current_resolution_method`, `resolved_nik` di row. Saat ini `current_emp_code` ada, lainnya perlu tambah.

---

## 2. `GET /api/attendance/monthly-matrix?mode=datamesin`

| Aspek | Detail |
|-------|--------|
| **Source** | `attendance_scan_logs` (direct) LEFT JOIN `employees` + `divisions` |
| **Query strategy** | CTE: `scan_rows` (filter date+machineCode+search on `raw_device_user_id`/`parsed_employee_code`/`current_emp_code`/`zkteco_user_name`) → `raw_daily` (GROUP BY raw_id+emp_code+machine+date, MIN/MAX scan_time) → `raw_keys` (ROW_NUMBER + COUNT OVER) → paged JOIN. **Pakai direct columns `s.current_emp_code`/`s.mapping_status`/`s.mapping_reason` — NO correlated subqueries.** |
| **Query params** | sama dengan mode=database |
| **Response 200** | `{ success, data: {rows, pagination}, meta: {generated_at, source:'attendance_scan_logs', mode:'datamesin', period} }` |
| **Row fields** | `raw_device_user_id, employee_code, parsed_employee_code, employee_name, division_code, division_name, machine_code, mapping_status, mapping_reason, raw_id_length, attendance_date, final_status, source:'ZKTECO', final_check_in, final_check_out, scan_count, total_rows` |
| **Empty** | 200 `rows: []` |
| **Error** | ❌ no try/catch → router 500. **PERLU FIX.** |
| **Pagination** | Ya, ROW_NUMBER. |

> Performance: ~2.6s (optimized, no correlated subquery). CLAUDE.md: JANGAN re-introduce `resolvedEmployeeCodeSql()` dkk.

---

## 3. `GET /api/attendance/monthly-matrix/cell`

| Aspek | Detail |
|-------|--------|
| **Path** | `/api/attendance/monthly-matrix/cell` |
| **Source** | `attendance_scan_logs` (TOP 100) + `employees`+`divisions` + `attendance_manual_corrections` + `attendance_imports` + holiday/work-config |
| **Query params** | `date (def today), employeeCode, rawDeviceUserId, machineCode` |
| **Query strategy** | 4 sequential queries (raw scans, employee master, manual correction latest, imported row) → JS-side provenance synthesis: dedup scan by minute, `finalStatus` cascade (correction → HADIR if ≥2 scans → INCOMPLETE_SCAN → imported → NO_DATA), `expectedStatus` dari holiday/work calendar. |
| **Response 200** | `{ success, data: { employee, date, final_status, source, expected_status, holiday_name, workday_label, trace_state, provenance (JSON string), reason, check_in_at, check_out_at, scan_count, single_scan_at, raw_logs, correction, imported, quality_flags }, meta: {generated_at, source:'attendance_cell_detail'} }` |
| **`quality_flags`** | array: `NO_RAW_SCAN`, `INCOMPLETE_SCAN`, `MAPPING_REVIEW`, `HIGH_SCAN_COUNT`, `HOLIDAY`, `OFF_DAY`, ... |
| **Empty** | 200 `raw_logs: []`, `correction: null`, `imported: null`, `final_status: 'NO_DATA'` |
| **Error** | ❌ no try/catch. **PERLU FIX.** |
| **Pagination** | Tidak. |

---

## 4. `GET /api/monitoring/machine/:code/employees`

| Aspek | Detail |
|-------|--------|
| **Path** | `/api/monitoring/machine/:code/employees` (param `code` = machine_code) |
| **Source** | `attendance_machines` + `machine_user_raw` (base ~6k) LEFT JOIN `attendance_scan_logs` (aggregate) + `employees` INNER JOIN scan_logs (db_employees seen) |
| **Query strategy** | Lookup machine → query `machine_user_raw` TOP 500 LEFT JOIN scan_logs aggregates (occurrence_count, last_seen, parsed_employee_code, mapping_status) GROUP BY user → split mapped/unmapped JS → query DB employees seen on machine. |
| **Response 200** | `{ success:true, data: { machine, summary:{total_unique_ids, mapped_count, unmapped_count, db_employees_seen}, machine_raw, database_mapped, unmapped, db_employees }, message:'OK' }` |
| **`machine_raw` row** | `raw_id, zkteco_user_name, role, card_no, first_seen_at, last_seen_at, occurrence_count, last_seen, parsed_employee_code, mapping_status, raw_id_length` |
| **Empty** | Machine not found → 404 `{success:false, error:{code:'NOT_FOUND', message:'Machine not found'}}`. Empty machine → 200 empty arrays + zeroed summary. |
| **Error** | ✅ **try/catch** → 500 `{success:false, error:{code:'MACHINE_EMPLOYEES_FAILED', message:<err>}}`. |
| **Pagination** | Tidak (TOP 500 / TOP 50 hardcoded). |
| **Wrapper** | `sendJson` (no `meta`) — perlu migrasi ke envelope. |

> Offline machine (ARC_01 dll): return 200 dengan data imported (bukan 500). Fix sudah diterapkan.

---

## 5. `GET /api/employees-comprehensive` (both modes)

| Aspek | Detail |
|-------|--------|
| **Path** | `/api/employees-comprehensive` |
| **Query params** | `mode (def 'datamesin'), divisionCode, machineCode, search, mappingStatus (ALL/MAPPED/UNMAPPED/NEED_REVIEW/AMBIGUOUS), startDate, endDate (def last 30 days), page (def 1), pageSize (def 50, clamp 1–200)` |
| **Source (datamesin)** | `attendance_scan_logs` GROUP BY raw_user LEFT JOIN `employees`+`divisions` |
| **Source (database)** | `employees` LEFT JOIN `divisions` (master, no scan) |
| **Service** | `employee-comprehensive.service.ts` → `getEmployeesComprehensive(mode, ...)` |
| **Query strategy** | Datamesin: CTE scan_source→raw_users→mapped_users ROW_NUMBER paging + COUNT OVER. Database: CTE ranked employees ROW_NUMBER + COUNT OVER. Return `{rows, total}` → wrapped `{rows, pagination, meta}`. |
| **Response 200** | `{ success, data: { rows, pagination:{page,pageSize,total,totalPages}, meta:{mode,startDate,endDate,machineCode,divisionCode,mappingStatus} }, meta:{generated_at, source:'employees_comprehensive', mode} }` |
| **Row (datamesin)** | `identity_key, raw_device_user_id, parsed_employee_code, current_emp_code, nik, employee_code, zkteco_user_name, employee_name, machine_code, division_code, gang_code, mapping_status, mapping_reason, scan_count, first_scan_at, last_scan_at, machine_codes, machine_count, batch_import, total` |
| **Row (database)** | sama, tapi `scan_count:0`, `first/last_scan_at:null`, `machine_code:''` |
| **Empty** | 200 `rows: []`, `total: 0` |
| **Error** | ✅ try/catch → 500 `{success:false, error:{code:'INTERNAL_ERROR', message:'Failed to fetch employee comprehensive data'}}`. ⚠️ `error.detail` TIDAK disertakan — perlu fix. |
| **Validation** | `startDate > endDate` → 400 `INVALID_DATE_RANGE`. |
| **Pagination** | Ya, ROW_NUMBER. |

Endpoint terkait: `/api/employees-comprehensive/kpis`, `/:employeeCode/detail`, `/:employeeCode/scans` — semua envelope + try/catch 500 `INTERNAL_ERROR`.

---

## 6. `GET /api/dashboard/stats`

| Aspek | Detail |
|-------|--------|
| **Path** | `/api/dashboard/stats` (no params) |
| **Source** | `attendance_machines` + `employees` + `attendance_scan_logs` + `attendance_import_batches` (scalar subqueries) |
| **Query strategy** | Single SELECT scalar subqueries: count active machines, active employees, today's scans (CAST scan_time AS DATE = GETDATE()), unmapped scan_logs, latest batch started_at. `quality_score` **HARDCODED 85**. |
| **Response 200** | `{ success:true, data: { total_machines, online_machines, offline_machines, total_employees, total_scans_today, unmapped_count, last_sync, quality_score:85, today_date }, message:'OK' }` |
| **Bug** | `online_machines` == `total_machines` (query sama) — offline_machines juga identik. **PERLU FIX.** |
| **Empty** | 200 zeroed fallback object. |
| **Error** | ❌ no try/catch. **PERLU FIX.** |
| **Pagination** | Tidak. |
| **Wrapper** | `sendJson` (no `meta`). |

> `quality_score` hardcoded — perlu compute dari data quality actual (mapping_status ratio, NULL raw_scan_log_id ratio, dll).

Endpoint terkait: `/api/dashboard/summary?date=` (→ `vw_attendance_monthly_matrix`), `/api/dashboard/division-summary?date=` (→ `vw_attendance_daily_summary`), `/api/dashboard/sync-status` (→ `vw_sync_latest_status`).

---

## 7. Cross-Cutting Issues & Fix Priorities

| Issue | Endpoint | Priority | Fix |
|-------|----------|----------|-----|
| No try/catch | matrix DB, matrix datamesin, cell, dashboard | **P1** | Bungkus try/catch, emit `error.code`+`error.detail` |
| Inconsistent wrapper | machine-employee, dashboard (sendJson) | P2 | Migrasi ke `sendEnvelope` |
| `error.detail` missing | employees-comprehensive, sendError | P2 | Tambah field `detail` |
| `quality_score` hardcoded | dashboard | P2 | Compute dari DQ metrics |
| `online==total_machines` bug | dashboard | P2 | Query `last_sync_at` recency |
| Missing resolution fields | matrix database | P2 | Tambah `parsed_employee_code`/`current_resolution_status`/`current_resolution_method`/`resolved_nik` |
| `SELECT *` di routes | attendance:61, dashboard:22, employees:251, reports:8/15/26/33 | P2 | Ganti explicit column list |
| SQL string interpolation | attendance-raw.repository, employee-mapping.service, attendance-reconcile.service:258, import-job.service:154 | **P1 (security)** | Parameterize (`@param`) — lihat [[DEPENDENCY_AUDIT]] |

---

## 8. Empty State & Error Reference

| Skenario | HTTP | Body |
|----------|------|------|
| Query return 0 rows | 200 | `{success:true, data:[], pagination:{total:0,...}}` |
| Machine not found | 404 | `{success:false, error:{code:'NOT_FOUND', message:'Machine not found'}}` |
| Invalid date range | 400 | `{success:false, error:{code:'INVALID_DATE_RANGE', message:'startDate must be <= endDate'}}` |
| DB query error | 500 | `{success:false, error:{code:'<UPPER_SNAKE>', message:'<human>', detail:'<stack/cause>'}}` |
| Offline machine (matrix/machine-employees) | 200 | data dari imported (bukan error) |
