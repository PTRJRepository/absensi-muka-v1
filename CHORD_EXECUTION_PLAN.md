# CHORD EXECUTION PLAN — Absensi_Muka
**Date:** 2026-06-19
**Phase:** Full System Analysis & Implementation Roadmap

---

## PHASE 1: LIVE TESTING — ROOT CAUSE ANALYSIS

### Endpoint Test Results

| Endpoint | HTTP | Status | Issue |
|---|---|---|---|
| `/api/monitoring/dashboard` | 200 | ✅ Works | Returns 16 machines, 592 scans today, but lastBatch is FAILED |
| `/api/monitoring/machines` | 200 | ✅ Works | Lists 16 machines; AB1 has most scans (1164) |
| `/api/monitoring/machine/P1A/employees` | 200 | ⚠️ Misleading | Returns 100 IDs, 0 mapped, 0 DB employees — join failing |
| `/api/monitoring/sync-status/1` | 200 | ⚠️ Stuck | Batch stuck RUNNING, 0 records, never finishes |
| `/api/monitoring/quality` | 200 | ⚠️ Low mapping | 179,720 total logs, 9% mapped rate, 1,045 unmapped codes |
| `/api/monitoring/division-summary` | 200 | ❌ Empty | `attendance_imports` table is EMPTY — no processed data |
| `/api/monitoring/batches` | 200 | ⚠️ Many FAILED | P2A, IJL, P2B all FAILED with 0 records |
| `/api/divisions` | 404 | ❌ Missing init | `division.routes.ts` imported but `initDivisions()` never called |
| `/api/quality/dashboard-summary` | 404 | ❌ Missing init | `quality-dashboard.routes.ts` imported but `initQualityDashboard()` never called |
| `/api/realtime/feed-stats` | 500 | ❌ No API key | HTTP Gateway `GATEWAY_API_KEY` env var missing |
| `/api/machines/real-time-status` | 404 | ❌ Not imported | `realtime-status.routes.ts` never imported anywhere |
| `/api/quality/daily-trend` | 404 | ❌ Not imported | Same — `quality-dashboard.routes.ts` not initialized |
| `/api/quality/summary` | 200 | ✅ Works | Reports 5 HIGH-severity checks all FAIL |

### Root Cause Breakdown

#### Bug 1: Uninitialized Route Modules
- **Files:** `division.routes.ts`, `quality-dashboard.routes.ts`
- **Problem:** Both export init functions that are never called from `api/routes/index.ts`
- **Fix:** Add `initDivisions()` and `initQualityDashboard()` calls in `index.ts`

#### Bug 2: Missing GATEWAY_API_KEY
- **File:** `realtime.routes.ts` line 25-26
- **Problem:** `GATEWAY_API_KEY` env var never set; `liveFeedService` fails on every query
- **Fix:** Add `GATEWAY_API_KEY=<key>` to `.env`, set it on the server at `10.0.0.110:8001`

#### Bug 3: `realtime-status.routes.ts` Never Imported
- **File:** `api/routes/index.ts`
- **Problem:** `realtime-status.routes.ts` defines `initRealtimeStatus()` but is not imported
- **Fix:** Add `import './realtime-status.routes';` and call `initRealtimeStatus()`

#### Bug 4: Employee Mapping Rate = 9%
- **Root Cause:** `attendance_scan_logs.parsed_employee_code` (e.g., `G10044`) doesn't match `employees.employee_code` (e.g., `A0150`)
- **Query:** `JOIN employees e ON e.employee_code = s.parsed_employee_code` returns 0 rows
- **Fix:** The mapping service needs to use `machine_user_map` table or `employee_mapping_overrides` for actual joins

#### Bug 5: `attendance_imports` Table Empty
- **Root Cause:** Batch imports all FAIL with `[object Object]` error
- **Effect:** Division summary and processed attendance data never get populated
- **Fix:** Debug the import batch creation in `direct-zkteco-import.service.ts`

#### Bug 6: Batch Jobs Never Finish (stuck RUNNING)
- **Root Cause:** Import service creates batch but never marks it complete or failed
- **Effect:** `sync-status/1` stuck RUNNING, batch records show FAILED with 0 records
- **Fix:** Ensure `importJobService.completeBatch()` or `failBatch()` is always called in try/finally

---

## PHASE 2: REAL-TIME REQUIREMENTS ANALYSIS

### A. Real-Time Machine Status (online/offline)
**Already exists:** `machine-employee.routes.ts` has `/api/monitoring/machine-ping` (POST)
- Uses PowerShell TCP ping with 3s timeout
- Returns ONLINE/TIMEOUT/UNREACHABLE per machine
- **Missing:** Periodic polling, SSE broadcast when machine goes offline
- **Gap:** No persistent machine status tracking in DB (`attendance_machines.last_sync_at` all NULL)

### B. Machine Selector View (ALL data per machine)
**Partially exists:** `/api/monitoring/machine/:code/employees` (machine-employee.routes.ts)
- Returns: raw stats, mapped/unmapped, DB employees
- **Missing:** Division breakdown per machine, monthly trend per machine, attendance processed data
- **Gap:** The endpoint joins to non-existent `employees` table (should be `mst_employee` or use `machine_user_map`)

### C. Machine vs Database View Switch
**Not implemented:** No UI toggle between:
- **Machine view:** Raw device IDs (e.g., `1000911` from P1A) — unparsed
- **Database view:** Parsed+imported records with emp_code, division
- **Needed:** UI component with radio/toggle; API needs a `?view=machine|db` param

### D. Employee ID Browser Per Machine
**Exists:** `/api/monitoring/machine/:code/employees` returns all raw IDs
- **Gaps:**
  - No pagination (returns TOP 100 only)
  - No filter by mapping status
  - No show/hide mapped IDs
  - `db_employees` join returns 0 due to emp_code mismatch

### E. Manual Mapping UI
**Exists:** `POST /api/monitoring/employees/:code/map` in machine-employee.routes.ts
- Uses `employee_mapping_overrides` table
- Updates `attendance_scan_logs` for existing records
- **Gaps:**
  - No bulk mapping UI
  - No list of unmapped IDs with suggested matches
  - No undo capability
  - No admin UI — only API

### F. Division Monitoring with Charts
**API exists:** `/api/monitoring/division-summary` but returns empty
- **Root cause:** `attendance_imports` table is empty
- **Needs:** `attendance-process.service.ts` to populate `attendance_imports` from raw logs

### G. Data Quality Dashboard with Graphs
**Partially exists:** `/api/monitoring/quality` returns trend data
- **Gaps:**
  - `/api/quality/dashboard-summary` → 404 (not initialized)
  - `/api/quality/daily-trend` → 404 (not initialized)
  - No frontend page at `/data-quality.html` is wired to these endpoints
  - Charts exist in `dashboard.html` but use different endpoints

---

## PHASE 3: EXECUTION PLAN

### P0 — CRITICAL (Blocking all monitoring)

#### P0.1: Fix Uninitialized Routes
```
File: src/api/routes/index.ts
Fix: Add calls to initDivisions() and initQualityDashboard()
Also: Add import and initRealtimeStatus()
```

#### P0.2: Fix GATEWAY_API_KEY
```
File: .env
Add: GATEWAY_API_KEY=<key from 10.0.0.110:8001>

File: src/api/routes/realtime.routes.ts
Env var: process.env.GATEWAY_API_KEY || ''
Need: The actual API key from the HTTP gateway server
```

#### P0.3: Fix Employee Mapping Join
```
File: src/api/routes/machine-employee.routes.ts
Problem: JOIN employees e ON e.employee_code = s.parsed_employee_code returns 0

Fix option A (quick): Change join to use mst_employee.emp_code instead of employees.employee_code
Fix option B (correct): Use machine_user_map table:
  INNER JOIN machine_user_map m
    ON m.machine_id = s.machine_id
    AND m.machine_user_id = s.raw_device_user_id
  INNER JOIN mst_employee e ON e.emp_code = m.emp_code
```

#### P0.4: Debug Import Batch Failures
```
File: src/modules/import/direct-zkteco-import.service.ts
Problem: errorMessage shows "[object Object]"
This means the error is a JS object being string-concatenated

Fix: Serialize error properly: String(error) or JSON.stringify(error, null, 2)
Also: Check if ZKTeco connection is actually succeeding
Check: Run import manually for one machine and inspect logs
```

---

### P1 — CORE FEATURES (Main monitoring functionality)

#### P1.1: Machine Real-Time Status Dashboard
```
File: src/api/routes/realtime-status.routes.ts (already exists, just needs import)

Add to index.ts:
  import './realtime-status.routes';
  initRealtimeStatus();

Enhancement: Poll machines every 30s, store last_seen in DB
Update: attendance_machines.last_sync_at on each successful sync
```

#### P1.2: Machine Selector + ALL Data View
```
New file: src/api/routes/machine-explorer.routes.ts
Endpoint: GET /api/machines/:code/explore?view=machine|db

machine view: Raw attendance_scan_logs with raw_device_user_id
db view: attendance_scan_logs with parsed_employee_code + employee name

Machine stats:
  - Today scans, unique IDs, mapped/unmapped
  - Monthly scan trend (chart data)
  - All employees who scanned at this machine
  - All divisions active at this machine
```

#### P1.3: Fix Attendance Processing Pipeline
```
Problem: attendance_imports is empty → division-summary is empty

Files to check:
  - src/modules/attendance/attendance-process.service.ts
  - src/modules/import/import-job.service.ts

Flow needed:
  1. Raw logs in attendance_scan_logs (EXISTS, 179K records)
  2. Process into attendance_imports (EMPTY - pipeline broken)
  3. Summarize into attendance_daily_process (may not exist)
  4. Division summary reads from attendance_imports (returns empty)

Root cause: Either attendance-process.service.ts never runs,
or attendance_imports INSERT is failing silently.
```

#### P1.4: Manual Mapping Admin UI
```
New file: src/public/manual-mapping.html

Features:
  - List all unmapped raw_device_user_id across all machines
  - Show occurrence count, machines, last_seen
  - Input field: "Map to employee code:"
  - Auto-suggest from employees table
  - Bulk select + map
  - Undo log

API already exists: POST /api/monitoring/employees/:code/map
Needs: API for listing unmapped IDs with suggestions
```

#### P1.5: Division Monitoring Page
```
File: src/public/division-analysis.html (exists)

Fix the data pipeline first (P1.3), then:
  - Monthly attendance by division (HADIR/TIDAK_HADIR/SICK/LEAVE)
  - Line chart: attendance rate over month
  - Bar chart: comparison between divisions
  - Table: per-employee breakdown
```

---

### P2 — NICE TO HAVE

#### P2.1: Quality Dashboard Page
```
Fix: P0.1 (init quality dashboard)
Enhance:
  - Wire charts to quality-dashboard-summary endpoint
  - Add unmapped ID review table
  - Add duplicate scan detection view
  - Add machine time drift view
```

#### P2.2: Real-Time SSE for Machine Status
```
File: src/lib/realtime-emitter.ts
Add: machine.online / machine.offline events

Trigger: When /api/monitoring/machine-ping returns different status than last known
Store: attendance_machines.last_known_status
Broadcast: SSE to all connected dashboard clients
```

#### P2.3: Machine vs Database Toggle UI
```
Add to machine-detail.html:
  - Radio buttons: "Machine View (Raw IDs)" | "Database View (Parsed)"
  - Toggle changes the data table and column display
  - Persists preference in URL query param
```

#### P2.4: Batch Failure Alerting
```
Problem: 77 pending batches, many FAILED
Fix:
  - Alert when batch stays RUNNING > 10 minutes
  - Alert when batch has records_failed > 0
  - Store last batch status, notify on change

File: src/modules/import/import-job.service.ts
Add: onBatchComplete() callback that emits events
```

---

## TECHNICAL NOTES

### Dual Database Layer Confusion

The codebase has TWO database layers:

1. **Direct MSSQL (`src/lib/db.ts`)**
   - Used by: `monitoring.routes.ts`, `quality.routes.ts`, `machine-employee.routes.ts`
   - Connects to: `rebinmas_absensi_monitoring` on `10.0.0.110:1433`
   - This DB HAS the required tables: `attendance_machines`, `attendance_scan_logs`, `attendance_imports`, `attendance_import_batches`, `employees`, `divisions`, etc.

2. **HTTP Gateway (`src/shared/database/sql-client.ts`)**
   - Used by: `dashboard.service.ts`, `direct-zkteco-import.service.ts`, `live-feed.service.ts`
   - Connects to: `http://10.0.0.110:8001/v1/query` → `extend_db_ptrj`
   - Different schema: `mst_machine`, `mst_employee`, `mst_division`, `attendance_scan_logs`

**The migration creates tables in `rebinmas_absensi_monitoring`. Direct MSSQL queries work. HTTP Gateway points to wrong DB.**

### Key Schema Notes

**attendance_scan_logs table:**
- `raw_device_user_id` = raw ID from machine (e.g., "10044")
- `parsed_employee_code` = auto-mapped code (e.g., "G10044")
- `mapping_status` = MAPPED / UNMAPPED / NEED_REVIEW
- `scan_time` = timestamp
- `scan_date` = date only

**employees table:**
- `employee_code` = format like "A0150", "A0234"
- No direct relation to `parsed_employee_code` (G10044 ≠ A0150)

**machine_user_map table:**
- Maps `machine_id` + `machine_user_id` → `emp_code`
- This is the correct join for employee mapping

### Import Pipeline Flow
```
ZKTeco Machine → direct-zkteco-import.service.ts
  → Creates attendance_import_batch
  → Fetches users/attendance from device
  → Stores in attendance_scan_logs
  → Creates machine_user_map entries
  → ??? → attendance_imports (EMPTY)
  → ??? → attendance_daily_process (doesn't exist)
```

The processed attendance pipeline (raw → imported → daily) is broken.
`attendance_imports` needs to be populated from `attendance_scan_logs`.

---

## RECOMMENDED EXECUTION ORDER

1. **P0.1** → Fix 3 uninitialized route modules (2 hours)
2. **P0.3** → Fix employee mapping join (1 hour)
3. **P0.4** → Debug batch failures with proper error logging (2 hours)
4. **P0.2** → Add GATEWAY_API_KEY (requires server config on 10.0.0.110)
5. **P1.3** → Fix attendance processing pipeline (4 hours)
6. **P1.1** → Import/init realtime-status (1 hour)
7. **P1.2** → Machine explorer with Machine vs DB view (6 hours)
8. **P1.4** → Manual mapping UI (8 hours)
9. **P2.1** → Quality dashboard page wiring (4 hours)
10. **P2.3** → Machine/DB toggle UI (3 hours)
11. **P1.5** → Division monitoring page (4 hours)
12. **P2.2** → SSE for machine status (6 hours)
13. **P2.4** → Batch failure alerting (4 hours)
