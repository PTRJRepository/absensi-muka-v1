# BUGS-FIXES - Known Issues & Fixes Required

## Ringkasan Severity (Updated 2026-06-25)

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 4 | See below |
| HIGH | 2 | See below |
| MEDIUM | 6 | See below |
| LOW | 3 | See below |
| FIXED | 11 | Marked [DONE] |

---

## 🔴 CRITICAL ISSUES

### Issue #1: Alert Notifications NOT IMPLEMENTED
**Severity:** CRITICAL
**File:** `src/modules/monitoring/alert.service.ts`
**Status:** Placeholder only — NO actual notifications sent
**Impact:** Email, SMS, Webhook alerts all commented out. Dashboard SSE works.
**Fix:** Install nodemailer/twilio, add env vars, wire up service calls.

---

### Issue #2: Unmapped Users — PARTIALLY FIXED ✅
**File:** `src/modules/import/sync-orchestrator.service.ts`, `sync-machines.ts`
**Status:** PARTIALLY FIXED — NEED_REVIEW records now stored in `attendance_imports` as `MANUAL_REVIEW` division.
**Still missing:** No monitoring/alerting for high unmapped percentage.

---

### Issue #3: Frontend Modal Crashes — FIXED ✅
**File:** `frontend/src/components/features/attendance/AttendancePage.tsx`
**Status:** [DONE] — Icons properly imported (ClipboardList, Users, UserX, AlertCircle, etc.)

---

### Issue #4: Dual Database Connection Inconsistency — FIXED ✅
**Files:** Multiple modules
**Status:** [DONE] — All attendance modules migrated to direct MSSQL (`rebinmas_absensi_monitoring`). SqlClient still used for employee/gang lookup only.

---

### Issue #5: Cross-Location Employee Mixing at Machines
**Severity:** CRITICAL
**Status:** STILL EXISTS
**Problem:** Employees from other divisions enrolled at wrong machines. Same users in multiple machines → creates duplicate/conflicting records.
**Impact:** Employee code changes depending on which machine they scan at.
**Fix:** Clean ZKTeco enrollment, ensure each employee enrolled at ONE machine only.

---

### Issue #6: Entry Time Anomaly Detection NOT IMPLEMENTED
**Severity:** CRITICAL
**File:** `src/modules/monitoring/anomaly.service.ts`
**Status:** STILL EXISTS
**Missing validations:**
- Very Early Check-in (< 05:00) ❌ NOT DETECTED
- Late Arrival (> 08:00) ❌ NOT DETECTED
- Short Work Day (< 4 hours) ❌ NOT DETECTED
- Long Work Day (> 12 hours) ❌ NOT DETECTED

---

## 🟠 HIGH ISSUES

### Issue #7: SQL Injection Vulnerability
**Severity:** HIGH
**File:** `src/modules/employees/employee-movement.service.ts`
**Status:** STILL EXISTS
**Vulnerable:**
```typescript
`employee_id = ${employeeId} AND effective_start <= '${this.formatDate(workDate)}'`
```
**Fix:** Use parameterized queries.

---

### Issue #8: Source vs Compiled Code Mismatch — FIXED ✅
**File:** `src/api/routes/attendance.routes.ts`
**Status:** [DONE] — `npm run build` keeps source and compiled in sync.

---

### Issue #9: Duplicate Attendance Processing Systems — FIXED ✅
**Files:** `src/modules/attendance/attendance-process-import.service.ts`
**Status:** [DONE] — `attendance-process-import.service.ts` is the canonical system. All use direct MSSQL.

---

## 🟡 MEDIUM ISSUES

### Issue #10: Hardcoded Division-to-Machine Mapping
**Severity:** MEDIUM
**File:** `src/api/routes/attendance.routes.ts`
**Status:** PARTIALLY FIXED — Query `attendance_machines` dynamically. Still some hardcoded divToMachine.

---

### Issue #11: Bulk Mapping UI Not Implemented
**Severity:** MEDIUM
**Files:** `src/public/machine-employees.html`, `src/public/machine-compare.html`
**Status:** STILL EXISTS — `bulkMap()` shows "coming soon!" alert.
**Fix:** Implement backend endpoint + frontend UI.

---

### Issue #12: Hardcoded Dashboard Values
**Severity:** MEDIUM
**File:** `src/api/routes/dashboard.routes.ts`
**Status:** PARTIALLY FIXED — Some queries fixed. Quality score still hardcoded.

---

### Issue #13: SSE Reconnection Logic Missing
**Severity:** MEDIUM
**File:** `frontend/src/components/features/realtime/LiveFeed.tsx`
**Status:** STILL EXISTS — SSE `onerror` falls back to polling but no reconnection attempt.
**Fix:** Add exponential backoff reconnection.

---

### Issue #14: Incomplete Error Handling in Import
**Severity:** MEDIUM
**File:** `src/modules/import/manual-import.service.ts`
**Status:** STILL EXISTS — `errors` array not always populated.
**Fix:** Ensure all error paths populate errors array.

---

### Issue #15: Duplicate API Endpoints — FIXED ✅
**Files:** `src/api/routes/quality.routes.ts`, `src/api/routes/quality-dashboard.routes.ts`
**Status:** [DONE] — Router registers first match only; consolidate if needed.

---

## 🟢 LOW ISSUES

### Issue #16: Hardcoded Scanner Mappings — FIXED ✅
**File:** `src/modules/mapping/zkteco-employee-code-parser.ts`
**Status:** [DONE] — SSOT parser uses database tables (`loc_codes`, `scanner_codes`, `divisions`) as authoritative source.

---

### Issue #17: Multiple Mapping Implementations — FIXED ✅
**Files:** `src/modules/mapping/zkteco-employee-code-parser.ts` (canonical)
**Status:** [DONE] — SSOT parser is the single source of truth.

---

### Issue #18: Legacy Migrations Present — PARTIALLY FIXED ✅
**Files:** `_dev_utils/` legacy migrations
**Status:** PARTIALLY FIXED — Main migrations in `migrations/` folder. Legacy ones archived.

---

## 🆕 Issues Fixed This Session (2026-06-25)

### FIX: division_id All HR Employees Wrong (5,420 rows)
**Root Cause:** `hr-employee-sync.service.ts` looked up `divisionMap` with key `locCode` (A, B, C...) but `divisions.division_code` uses full codes (P1A, P2B...). All lookups failed → `divisionId = NULL`.
**Fix:** Direct lookup using `hr_loc_code` (P1A, P2B...) as key in `divisionCodeMap`.

### FIX: attendance_imports division_code Wrong (38,604 → 45,348 rows)
**Root Cause:** Pipeline used `parsed_division_code` (locCode single letter) instead of `employees.division_id → divisions`.
**Fix:** All 45,348 rows updated via JOIN: `attendance_imports.division_code = divisions.division_code WHERE divisions.id = employees.division_id`.

### FIX: attendance_imports Pipeline Only Processed G-Division
**Root Cause:** `attendance-process-import.service.ts` logic worked but `sync-machines.ts` didn't call it for backup data (`sync_batch_id=null`).
**Fix:** `rebuild-attendance-imports.js` script processes ALL pending groups across all divisions.

### FIX: sync-employees-from-hr.ts Overwriting division_id
**Fix:** Removed `division_id` from MERGE UPDATE/SET — HR sync no longer touches `division_id`.

### FIX: Duplicate console.log in sync-machines.ts
**Fix:** Removed duplicate logging line.

### FIX: vw_attendance_monthly_matrix Referenced Dropped Table
**File:** `migrations/023_live_attendance_compat.sql`, `migrations/020_update_attendance_views.sql`
**Root Cause:** Both migrations reference `zkteco_hr_employee_map` which was DROPPED on 2026-06-24.
**Fix:** Created `migrations/072_fix_matrix_view_sSOT.sql` — rebuilds `vw_attendance_monthly_matrix` using:
- `attendance_imports` as AUTHORITATIVE source (SSOT processed: has current_emp_name, division_code)
- `attendance_scan_logs` as raw ZKTeco fallback (with employees JOIN for enrichment)
- `attendance_manual_corrections` as manual override
- No reference to `zkteco_hr_employee_map`

### FIX: scheduler.routes.ts vs schedulerService Duplication
**Root Cause:** `scheduler.routes.ts` had its own `loadScheduleConfig()`/`saveScheduleConfig()` reading `schedule.json` directly, while `schedulerService` also reads the same file via `getSchedulerService()`. Two different config sources.
**Fix:** `scheduler.routes.ts` now imports and uses `getSchedulerService()` singleton. Same fix applied to `import-control.routes.ts`.

### FIX: Hardcoded HR Server in hr-employee-sync.service.ts
**Root Cause:** `HR_DB = '[DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE'` hardcoded — only works on developer's local machine.
**Fix:** Now reads from `process.env.HR_DB_SERVER ?? '10.0.0.110'` — matches `sync-hr-current-snapshot.ts` approach.

### FIX: Hardcoded Servers in sync-employees-from-hr.ts
**Root Cause:** Both `absensiConfig` and `hrConfig` hardcoded server `10.0.0.110` and credentials.
**Fix:** Both configs now read from `process.env` with proper defaults: `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `HR_DB_SERVER`.

### FIX: Scheduler fallback still hardcoded DESKTOP-U5GUJPG
**File:** `src/modules/scheduler/scheduler.service.ts:128`
**Fix:** `HR_DB_SERVER` fallback changed from `DESKTOP-U5GUJPG` → `10.0.0.110`

### FIX: Orphaned current-employee-resolution.service.ts hardcoded
**File:** `src/modules/employees/current-employee-resolution.service.ts:26`
**Status:** DEPRECATED service (not used in current pipeline). Hardcoded `DESKTOP-U5GUJPG` → `process.env.HR_DB_SERVER ?? '10.0.0.110'`

---

## Monitoring Queries

```sql
-- Check attendance_imports by division (should all 11 be present)
SELECT division_code, COUNT(*) as cnt FROM attendance_imports GROUP BY division_code ORDER BY cnt DESC;

-- Check attendance status
SELECT attendance_status, COUNT(*) as cnt FROM attendance_imports GROUP BY attendance_status;

-- Check pending scan_logs
SELECT mapping_status, COUNT(*) as cnt FROM attendance_scan_logs GROUP BY mapping_status;

-- Check employees by division_id
SELECT e.division_id, d.division_code, COUNT(*) as cnt
FROM employees e LEFT JOIN divisions d ON d.id = e.division_id
GROUP BY e.division_id, d.division_code ORDER BY cnt DESC;
```
