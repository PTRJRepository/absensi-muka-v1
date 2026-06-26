# DEPENDENCY_AUDIT — Mapping Dependency Repo

> Basis: repo scan 2026-06-26 (ripgrep active source `.ts/.tsx/.js/.mjs/.sql`, skip node_modules/dist).
> Related: [[LEGACY_DEPRECATION_LIST]] [[DATABASE_CLEANUP_PLAN]] [[API_CONTRACT_FINAL]]

---

## 1. Tabel/View → File yang Membaca

### 1.1 Active tables (KEEP — dependency ke code aktif)

| Tabel/View | Dibaca oleh (file) |
|-----------|-------------------|
| `attendance_scan_logs` | `attendance.routes.ts`, `machine-employee.routes.ts`, `monthly-matrix.service.ts`, `employee-comprehensive.service.ts`, `dashboard.routes.ts`, `attendance-raw.repository.ts`, `live-feed.service.ts`, `data-quality.service.ts`, `sync-machines.ts`, `rebuild-attendance-imports.ts`, `attendance-process-import.service.ts` |
| `attendance_imports` | `attendance.routes.ts`, `monthly-matrix.service.ts`, `employee-comprehensive.service.ts`, `dashboard.routes.ts`, `reports.routes.ts`, `rebuild-attendance-imports.ts`, `attendance-process-import.service.ts` |
| `employees` | `attendance.routes.ts`, `machine-employee.routes.ts`, `employees-comprehensive.routes.ts`, `monthly-matrix.service.ts`, `employee-comprehensive.service.ts`, `dashboard.routes.ts`, `hr-employee-sync.service.ts`, `employee.repository.ts`, `employee-movement.service.ts`, `employee-mapping.service.ts`, `sync-hr-current-snapshot.ts`, `sync-employees-from-hr.ts` |
| `divisions` | `attendance.routes.ts`, `machine-employee.routes.ts`, `monthly-matrix.service.ts`, `employee-comprehensive.service.ts`, `hr-employee-sync.service.ts`, `division.routes.ts` |
| `machine_user_raw` | `machine-employee.routes.ts`, `sync-machines.ts`, `fetch-zkteco-users.ts` |
| `attendance_machines` | `machines.routes.ts`, `machine-employee.routes.ts`, `dashboard.routes.ts`, `sync-machines.ts`, `check-attendance-machines.ts` |
| `hr_employee_current_snapshot` | `hr-employee-sync.service.ts`, `sync-hr-current-snapshot.ts`, `current-employee-resolution.service.ts`, `monthly-matrix.service.ts` (via view), `employee-comprehensive.service.ts` |
| `attendance_manual_corrections` | `attendance.routes.ts` (cell), `monthly-matrix.service.ts` (via view) |
| `attendance_import_batches` | `attendance.routes.ts`, `dashboard.routes.ts`, `scheduler.service.ts`, `attendance-process-import.service.ts` |
| `vw_attendance_final` | `reports.routes.ts:8,33`, `vw_attendance_daily_summary`, `vw_attendance_monthly_summary` |
| `vw_attendance_monthly_summary_v2` | `attendance.routes.ts:61` |
| `vw_attendance_daily_summary` | `dashboard.routes.ts:22` |
| `vw_sync_latest_status` | `dashboard.routes.ts` (sync-status) |

### 1.2 Legacy tables — DROPPED/0-rows tapi masih diref code ⚠️

| Legacy tabel | Dibaca oleh (file:line) | Status code | Flag |
|--------------|------------------------|-------------|------|
| `zkteco_hr_employee_map` | `vw_attendance_monthly_matrix` (view, BROKEN), scripts: `analyze-database.ts`, `audit-employee-master.ts`, `audit-long-raw-device-id-cases.ts:292`, `repair-long-raw-device-id-mappings.ts:59,103,186,200,203`, `run-employee-master-migrations.ts:165,166,168,289,320`, `run-migration-030.ts`, `sync-zkteco-hr-mapping.ts:155,157,168,194,206`, `sql/diagnostic-intermittent-data.sql` | View broken (backend bypass). Scripts = diagnostic/CLI (low). `employee-comprehensive.service.ts:85` comment "no more". | 🟡 view-broken, scripts-OK-to-leave |
| `machine_user_map` | **`attendance-raw.repository.ts:72,78,117,138,148,166`**, **`employee-mapping.service.ts:377,391,399,414,430,456,476`**, **`summary.service.ts:200`**, `check-machine-user-mapping.ts`, `sql-client.ts:181` (PK map) | **AKTIF di 3 service** ⚠️ — stop usage dulu | 🔴 active-dep, must migrate before drop |
| `zkteco_absensi_user_registry` | **`quality.routes.ts:450,461,563,575`** (ACTIVE route ⚠️), scripts: `analyze-database.ts`, `analyze-db-stats.ts`, `audit-employee-master.ts`, `backfill-current-empcode-registry.ts`, `backfill-current-empcode-scan-logs.ts`, `check-schema.ts`, `investigate-record.ts`, `test-current-empcode.ts`, `sql/rollback-current-empcode.sql`, `sql/validate-current-empcode.sql` | Tabel DROPPED → `quality.routes.ts` akan 500 | 🔴 active-broken, must fix |
| `zkteco_absensi_user_machine` | `investigate-record.ts:155`, `analyze-database.ts`, `analyze-db-stats.ts` | Dropped, scripts only | 🟡 scripts-OK |
| `employee_machine_enrollments` | **`vw_employee_master_clean`** (view BROKEN), `run-employee-master-migrations.ts`, `sanitize-employee-master.ts` | View broken | 🔴 view-broken |
| `mst_employee` | `vw_attendance_anomaly_open`, `vw_attendance_monitoring_daily`, FK target legacy | 0 rows, view legacy | 🟡 |
| `mst_division` | same legacy views + FK target | 13 rows | 🟡 |
| `mst_machine` | FK target `machine_user_raw`, `import_batch`, legacy | 15 rows | 🟡 FK-blocks-drop |
| `import_batch` | FK target `machine_user_raw`, `api_attendance_raw` | 0 rows | 🟡 |
| `extend_db_ptrj` (DB name) | **`sql-client.ts:6,31`**, **`app-config.ts:39`**, `sync-orchestrator.service.ts:10,71`, + dev_utils | Hardcoded default DB name | 🔴 config-bug |

---

## 2. Endpoint → Tabel yang Dibaca

| Endpoint | Tabel/View | Legacy flag |
|----------|-----------|-------------|
| `GET /api/attendance/monthly-matrix?mode=database` | `attendance_imports`, `employees`, `divisions`, `hr_employee_current_snapshot` (via view) | — |
| `GET /api/attendance/monthly-matrix?mode=datamesin` | `attendance_scan_logs`, `employees`, `divisions` | — |
| `GET /api/attendance/monthly-matrix/cell` | `attendance_scan_logs`, `employees`, `attendance_manual_corrections`, `attendance_imports`, holiday/work_config | — |
| `GET /api/monitoring/machine/:code/employees` | `attendance_machines`, `machine_user_raw`, `attendance_scan_logs`, `employees` | — |
| `GET /api/employees-comprehensive` | `attendance_scan_logs` (datamesin) / `employees` (database), `divisions` | — |
| `GET /api/dashboard/stats` | `attendance_machines`, `employees`, `attendance_scan_logs`, `attendance_import_batches` | ⚠️ batches tidak reliable |
| `GET /api/dashboard/summary` | `vw_attendance_monthly_matrix` (BROKEN ⚠️) | 🔴 needs fix |
| `GET /api/dashboard/division-summary` | `vw_attendance_daily_summary` | — |
| `GET /api/reports/*` | `vw_attendance_final`, `vw_attendance_monthly_summary` | — |
| `GET /api/quality/*` | `zkteco_absensi_user_registry` (DROPPED ⚠️) | 🔴 500 error |
| `SELECT *` di routes | `attendance.routes.ts:61,513,529,627,839,858,919,986,1131`, `dashboard.routes.ts:22`, `employees.routes.ts:251`, `reports.routes.ts:8,15,26,33` | 🟡 column-drift risk |

---

## 3. Frontend Page → Endpoint

| Frontend page | Endpoint call |
|---------------|--------------|
| `AttendanceMatrixPage.tsx` | `/api/attendance/monthly-matrix?mode=` |
| `EmployeeComprehensivePage.tsx` | `/api/employees-comprehensive?mode=` |
| `EmployeeDetailModal.tsx` | `/api/employees-comprehensive/:code/detail` |
| `EmployeeIdentityDrawer.tsx` | `/api/employees-comprehensive/:code/scans` |
| `MachinesPage.tsx` | `/api/machines`, `/api/monitoring/machine/:code/employees` |
| `MachineDetailModal.tsx` | `/api/monitoring/machine/:code/employees` |
| `DashboardPage.tsx` | `/api/dashboard/stats`, `/api/dashboard/summary` |
| `AttendancePage.tsx` | `/api/attendance/...` |
| `QualityPage.tsx`, `CurrentEmpCodeDashboard.tsx` | `/api/quality/*` (⚠️ broken backend) |
| `MonitoringDashboard.tsx` | `/api/monitoring/*` |
| `BatchHistoryPage.tsx` | `/api/batches/*` (attendance_import_batches) |

Service layer: `api-client.ts` (unwrap `ApiResponse<>`), `attendance-service.ts`, `employee-comprehensive.service.ts`, `machine-service.ts`, `ops-service.ts`, `quality-service.ts`, `status-mapping.ts`.

---

## 4. Scheduler/Script → Tabel yang Ditulis

| Script | Write ke | Baca dari |
|--------|---------|-----------|
| `sync-machines.ts` (scheduler [1]) | `machine_user_raw`, `attendance_scan_logs`, `attendance_import_batches`, `attendance_sync_logs` | mesin ZKTeco, `attendance_machines`, `employees` |
| `rebuild-attendance-imports.ts` (scheduler [2]) | `attendance_imports` | `attendance_scan_logs`, `employees`, `divisions` |
| `sync-hr-current-snapshot.ts` (scheduler [3]) | `hr_employee_current_snapshot`, `employees`, `employee_code_history` | `DB_PTRJ.HR_EMPLOYEE` |
| `sync-employees-from-hr.ts` | `employees` | DB_PTRJ |
| `attendance-process-import.service.ts` | `attendance_imports` | `attendance_scan_logs`, `employees` |
| `hr-employee-sync.service.ts` | `employees` | `hr_employee_current_snapshot`, `divisions` |
| `current-employee-resolution.service.ts` | `employees` (current_emp_code) | `hr_employee_current_snapshot`, DB_PTRJ |
| `backfill-current-empcode-*.ts` (3 scripts) | `attendance_imports`, `attendance_scan_logs`, `employees` | `hr_employee_current_snapshot` |
| `sync-zkteco-hr-mapping.ts` | `zkteco_hr_employee_map` (⚠️ legacy, 0 rows) | — |
| `employee-mapping.service.ts` | `machine_user_map` (⚠️ legacy), `employees` | mesin |
| `import-job.service.ts` | `attendance_import_batches`, `attendance_sync_logs` | — |

---

## 5. Risky SQL Patterns (injection + perf)

### 5.1 SQL string interpolation (HIGH RISK — user/external values, non-parameterized)

| File:line | Interpolated value | Risk |
|-----------|-------------------|------|
| `attendance-raw.repository.ts:75,112,133,222,247,269,306` | `${empCode}`, `${machineCode}`, `${machineUserId}`, `${recordTime.toISOString()}`, `${limit}` | 🔴 empCode/machineCode string-interpolated |
| `employee-mapping.service.ts:159,171,188` | `${escapedMachineCode}`, `${escapedUserId}` (manual escape `'`→`''`) | 🔴 manual escape, not parameterized |
| `attendance-reconcile.service.ts:258` | `${empCode}` in `WHERE emp_code = '${empCode}'` | 🔴 direct interpolation |
| `import-job.service.ts:154,170` | `${statusVal}`, `${errorVal}`, `${batchId}`, `${syncJobId}` | 🔴 status/error interpolated |
| `dashboard.service.ts:68,93,122,148,180,224,265` | `${empCode}`, `${formatDate}` | 🟡 formatDate internal, empCode interpolated |
| `live-feed.service.ts:35,58,82,112,127` | `${limit}`, `${since.toISOString()}`, `${lastId}` | 🟡 limit ISO |
| `summary.service.ts:173,176,197,214` | `${estateId}`, `${whereClause}`, `${anomalyWhereClause}` | 🟡 where built from filters |
| `monitoring.routes.ts:234,239`, `quality.routes.ts:102,115,152,167,205`, `machine-employee.routes.ts:93,224,231,262,283`, `employees.routes.ts:37,53,107,128,211,578` | `${where}`, `${whereClause}`, `${placeholders}`, `${selectCols}` | 🟡 dynamic fragments |
| `alert.routes.ts:135`, `cross-location.routes.ts:68,157,234`, `division.routes.ts:53,88,368` | `${limit}`, `${days}`, `${dateFilter}` | 🟡 numeric/date |
| `attendance-process-import.service.ts:314,354,426` | `${batchSize}`, `${allCodes.map}` | 🟡 numeric + placeholder list |
| CLI scripts (`check-employee-codes.ts`, `check-hr-codes.ts`, `compare-*.ts`, `sync-employees-from-hr.ts`, `sync-zkteco-hr-mapping.ts`, `sync-hr-current-snapshot.ts`, `backfill-*.ts`, `repair-long-raw-device-id-mappings.ts`, `run-migration-024/025.ts`) | `${code}`, `${dbName}`, `${values}` | 🟡 CLI (lower risk, but direct interpolation) |

> **No `sql` tagged helper exists.** All 154 template-literal interpolations are raw. Bulk are internal helper-fragment builders (lower injection risk). High-risk = `attendance-raw.repository`, `employee-mapping.service`, `attendance-reconcile.service:258`, `import-job.service:154`.

### 5.2 `SELECT *` (column drift) — 26 hits

HTTP routes (P2 fix): `attendance.routes.ts:61,513,529,627,839,858,919,986,1131`, `dashboard.routes.ts:22`, `employees.routes.ts:251`, `reports.routes.ts:8,15,26,33`.
Scripts (P3): `audit-long-raw-device-id-cases.ts`, `check-attendance-machines.ts`, `deep-mapping-analysis.ts`, `run-057-migration.ts`, `run-employee-master-migrations.ts`, `sync-hr-current-snapshot.ts:382`.

### 5.3 Correlated subquery perf hazard (CLAUDE.md warns)

`resolvedEmployeeCodeSql()`, `resolvedEmployeeNameSql()`, `resolvedMappingReasonSql()` — dipakai di `attendance.routes.ts:104,133,317,675,944,1361,1555`, `employee-comprehensive.service.ts:94,115`, `machine-employee.routes.ts` (calls). **Sudah di-bypass di matrix/machine query** (pakai direct column `current_emp_code`/`mapping_status`). Jangan re-introduce.

### 5.4 Hardcoded division/code filters
- `division.routes.ts:55,96` — parameterized dynamic IN (OK)
- `analyze-mapping-pattern.ts:74`, `check-employee-codes.ts:20`, `check-hr-codes.ts:30,39`, `compare-codes-full.ts:64`, `deep-mapping-analysis.ts:32` — `LIKE 'A%'`/`'H%'` (CLI only, OK)

### 5.5 `parsed_division_code` usage (deprecated field)
- `attendance-service.ts:317,318` (frontend fallback), `types/index.ts:411` (frontend type), many migrations. **Final division lewat `employees.division_id`.** Frontend `firstMatrixToken(record.division_code, record.parsed_division_code, ...)` — drop `parsed_division_code` fallback.

---

## 6. Frontend Rendering Issues

### 6.1 Key anti-patterns
- **Index keys (14 spots):** `DataTable.tsx:53`, `Skeleton.tsx:25`, `AttendancePage.tsx:392`, `BatchHistoryPage.tsx:181`, `MachineClockHealthPage.tsx:82,144`, `QualityMetrics.tsx:112,129`, `DashboardPage.tsx:179,181,245`, `EmployeeComprehensiveTable.tsx:558`, `MachineDetailModal.tsx:1039`, `MachinesPage.tsx:313`.
- **Duplicate/undefined keys (10 spots):** `DataTable.tsx:69` (dead `??` fallback → `"undefined"`), `QualityPage.tsx:218` (`key={batch.status}`), `MonitoringDashboard.tsx:151` (`key={item}` object), `MachinesPage.tsx:300,435` (`key={status}`, `key={network}`), `AttendanceMatrixPage.tsx:301,404,422`.

### 6.2 Nested button
- **0 hits** (FR-011 fix applied). ✅

### 6.3 mode=datamesin/database
- Threaded consistently 11 sites: `attendance-service.ts:82,246`, `employee-comprehensive.service.ts:8` (backend), `types/index.ts:147`, `AttendanceMatrixPage.tsx:29`, `EmployeeComprehensivePage.tsx:68`, `EmployeeComprehensiveTable.tsx:17`, `EmployeeComprehensiveToolbar.tsx:6,7`, `MachineDetailModal.tsx:694,732`.

---

## 7. Summary — Dependency Risk Matrix

| Dependency | Type | Severity | Phase to resolve |
|-----------|------|----------|-----------------|
| `machine_user_map` di 3 active service | active-dep legacy | 🔴 HIGH | Phase 2 (stop usage) → Phase 4 (drop) |
| `zkteco_absensi_user_registry` di `quality.routes.ts` | active-broken | 🔴 HIGH | Phase 2 (fix query) |
| `vw_attendance_monthly_matrix` BROKEN | view-broken | 🟡 MED | Phase 2 (bypass done) → Phase 3 (drop view) |
| `vw_employee_master_clean` BROKEN | view-broken | 🟡 MED | Phase 3 (drop/fix) |
| `extend_db_ptrj` hardcoded default | config-bug | 🟡 MED | Phase 2 (fix default) |
| SQL interpolation (4 high-risk files) | injection | 🔴 HIGH | Phase 2 (parameterize) |
| `SELECT *` di 16 route hits | column-drift | 🟡 LOW-MED | Phase 2 (explicit cols) |
| Frontend duplicate keys (10 spots) | render-bug | 🟡 MED | Phase 2 (fix keys) |
| `parsed_division_code` frontend fallback | deprecated-field | 🟢 LOW | Phase 2 (drop fallback) |
| Backup tables 3.9M rows | storage | 🟡 MED | Phase 4 (archive+drop) |
| 0-row legacy tables (22) | clutter | 🟢 LOW | Phase 4 (drop) |
