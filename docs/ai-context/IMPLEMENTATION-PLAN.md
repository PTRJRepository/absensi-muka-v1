# Implementation Plan — Monitoring Absensi Muka PT Rebinmas Jaya

## 14-Step Implementation Order (from PRD Section 21)

---

### Step 1 — Master Tables
**Tables:** `mst_estate`, `mst_division`, `mst_gang`, `mst_machine`, `mst_employee`

- Create all 5 master tables via SQL migration
- Seed 8 estates, 13 divisions, 15 machines
- Verify FK constraints and UNIQUE indexes

**Files:** `migrations/001_create_schema.sql`

---

### Step 2 — Employee Movement Tracking
**Tables:** `employee_division_history`, `employee_daily_assignment`

- Track historical division assignments per employee
- `employee_daily_assignment` has UNIQUE(employee_id, work_date)
- `employee_division_history` tracks effective date ranges

**Files:** `src/modules/employees/employee-movement.service.ts`

---

### Step 3 — Import Layer
**Tables:** `sync_job`, `import_batch`

- `sync_job` tracks full sync operations (MANUAL or SCHEDULED)
- `import_batch` tracks per-machine or per-division import runs
- Both have status lifecycle: PENDING → RUNNING → COMPLETED/FAILED

**Files:** `src/modules/import/import-job.service.ts`

---

### Step 4 — Raw Data Layer
**Tables:** `attendance_raw_log`, `machine_user_raw`, `api_attendance_raw`

- `attendance_raw_log`: immutable ZKTeco scan records
- `machine_user_raw`: user list snapshot from each machine
- `api_attendance_raw`: structured daily records from IT Solution API
- All have UNIQUE constraints to prevent duplicates

**Files:**
- `src/modules/import/direct-zkteco-import.service.ts`
- `src/modules/import/api-attendance-import.service.ts`
- `src/modules/attendance/attendance-raw.repository.ts`

---

### Step 5 — Employee-Machine Mapping
**Table:** `machine_user_map`

- Maps `machine_user_id` (deviceUserId from ZKTeco) → `emp_code`
- Rule: `emp_code = {loc_code}{4-digit machine_user_id padded}`
- Confidence score tracks mapping quality
- UNIQUE(machine_id, machine_user_id)

**Files:** `src/modules/employees/employee-mapping.service.ts`

---

### Step 6 — Daily Attendance Processing
**Tables:** `attendance_daily_process`, `attendance_process_detail`

- Aggregate raw logs per employee per day
- Determine `jam_masuk` (first scan) and `jam_keluar` (last scan)
- Merge machine log data with API data
- Set `attendance_status`: PRESENT / ABSENT / CUTI / SAKIT / HOLIDAY

**Files:** `src/modules/attendance/attendance-process.service.ts`

---

### Step 7 — Division Reconciliation
**Table:** `attendance_division_reconcile`

- Compare expected division (from history) vs detected (from machine) vs API
- Set `match_status`: MATCH / MISMATCH / CROSS_DIVISION / UNRESOLVED
- UNIQUE(employee_id, work_date)

**Files:** `src/modules/attendance/attendance-reconcile.service.ts`

---

### Step 8 — Manual Adjustments
**Table:** `attendance_manual_adjustment`

- Allow HR to correct jam_masuk, jam_keluar, status, or division
- Requires reason and approval workflow
- Links back to `attendance_daily_process`

**Files:** *(extend `attendance-process.service.ts` or add dedicated service)*

---

### Step 9 — Anomaly Detection
**Table:** `attendance_anomaly`

- Detect: NO_CHECKIN, NO_CHECKOUT, CROSS_DIVISION, UNMAPPED_USER, DUPLICATE_SCAN
- Severity: LOW / MEDIUM / HIGH / CRITICAL
- Status lifecycle: OPEN → RESOLVED

**Files:** `src/modules/monitoring/anomaly.service.ts`

---

### Step 10 — Daily Summary
**Table:** `monitoring_daily_summary`

- Aggregate per division per day: total_present, total_absent, total_anomaly, etc.
- UNIQUE(summary_date, division_id)
- Generated after processing completes

**Files:** `src/modules/monitoring/summary.service.ts`

---

### Step 11 — Indexes
**Indexes on:** `attendance_raw_log`, `api_attendance_raw`, `attendance_daily_process`, `attendance_division_reconcile`, `attendance_anomaly`, `employee_division_history`

- All indexes defined in `migrations/001_create_schema.sql`
- Verify query plans after data load

---

### Step 12 — Views
**Views:** `vw_attendance_monitoring_daily`, `vw_attendance_anomaly_open`

- `vw_attendance_monitoring_daily`: joins process + employee + division + reconcile
- `vw_attendance_anomaly_open`: open anomalies with employee/division/machine context

**Files:** `migrations/001_create_schema.sql`

---

### Step 13 — Seed Data
**Seed:** 15 machines, 13 divisions, 8 estates, 5 app_config entries

- Run after schema is confirmed
- Verify machine access_status values match CLAUDE.md
- app_config seeds: sync_interval_minutes, machine_timeout_ms, etc.

**Files:** `migrations/001_create_schema.sql`

---

### Step 14 — TypeScript Backend Skeleton
**Structure:** `src/modules/` with all services wired to `SqlClient`

- All modules export via `src/modules/*/index.ts`
- `src/index.ts` re-exports all modules
- Entry point wires `AppConfig` → `SqlClient` → all services
- No hardcoded API keys — all from env or `_dev_utils/src/config.ts`

**Files:**
- `package.json`, `tsconfig.json`
- `src/modules/*/index.ts` (6 modules)
- `src/index.ts`

---

## Module Dependency Graph

```
AppConfig / SqlClient
       │
       ├── machines/        (no deps)
       ├── employees/       (depends on: machines)
       ├── import/          (depends on: machines, employees)
       ├── attendance/      (depends on: import, employees, machines)
       ├── monitoring/      (depends on: attendance, employees)
       └── audit/           (depends on: all — cross-cutting)
```

## Key Constraints

| Rule | Detail |
|------|--------|
| Raw data is immutable | Never UPDATE/DELETE `attendance_raw_log` or `api_attendance_raw` |
| emp_code format | `{loc_code}{4-digit number}` e.g. `A0129`, `L10002` |
| Timezone | `record_time` is UTC — convert to WIB (UTC+7) for display |
| Source priority | MACHINE > API > MANUAL (configurable via app_config) |
| ZKTeco password | `12345` for all machines |
| Timeout | >= 20000ms for large datasets |
