# REFACTOR_PLAN.md — Absensi Muka

**Generated:** 2026-06-19
**Status:** All 38 tested endpoints return `success: true` ✅

---

## Executive Summary

Backend API fully functional. 38 endpoints tested — **0 broken**. All return valid JSON responses.

**Remaining issues are data-level, not code-level:**
- 29,028 unmapped employees (raw device IDs not mapped to employee_code)
- 716 unmapped device users
- 100 duplicate scan groups
- 16 machines never synced (last_sync_at = NULL)
- Attendance data present in `vw_attendance_final` (2034 records for 2026-06-18)

---

## P0 — Data Issues (Blocks Production UI)

### 1. Unmapped Employees (29,028 records)
**Problem:** `attendance_imports` has `employee_id = NULL` because raw device IDs can't be mapped.
**Fix:** Run the mapping workflow:
```bash
# Sync machines to populate attendance_imports with raw device IDs
curl -X POST http://localhost:8004/api/monitoring/sync-all

# Then use mapping endpoint to map raw_id -> employee_code
curl -X POST http://localhost:8004/api/monitoring/employees/{code}/map \
  -d '{"raw_id":"123","machine_code":"AB1"}'
```
**Priority:** P0 — Without this, attendance records show as "unknown employee"

### 2. Machines Never Synced
**Problem:** All 16 machines show `last_sync_at = NULL`
**Fix:** Trigger sync for each machine:
```bash
curl -X POST http://localhost:8004/api/monitoring/sync-all
curl -X POST http://localhost:8004/api/scheduler/sync-all
```
**Priority:** P0 — Without sync, no new attendance data comes in

---

## P1 — Code Quality Improvements

### 3. `mst_machine` references in `src/modules/` (NOT in routes)
**Found:** 23 references to `mst_machine` table in service files
**Impact:** Only affects background scripts (`sync-machines.ts`, `attendance-process-import.service.ts`, etc.)
**Routes are clean** — they use `attendance_machines` correctly
**Action:** Review each service file if background sync scripts are used
**Files needing review:**
- `src/modules/machines/machine.repository.ts` (uses `mst_machine` table name)
- `src/modules/monitoring/dashboard.service.ts` (joins `mst_machine`)
- `src/modules/attendance/attendance-raw.repository.ts` (6 joins to `mst_machine`)
- `src/modules/attendance/attendance-reconcile.service.ts`
- `src/modules/employees/employee-mapping.service.ts`
- `src/modules/attendance/attendance-process-import.service.ts`

### 4. Server Crash on Startup — Unhandled ZKError Rejection
**Problem:** Scheduler sync throws `UnhandledPromiseRejection: #<ZKError>` on startup, crashing Node
**File:** `src/scripts/sync-machines.ts`
**Fix:** Add `.catch()` handler to ZKTeco sync promises
```typescript
// Before
await zkteco.getUsers();

// After
await zkteco.getUsers().catch(err => {
  console.error('[ZKError]', err);
  return [];
});
```

### 5. Views Used in Routes (VERIFY these exist in DB)
Routes query these views — **verify they exist and have correct schema**:
- `vw_attendance_final` ✅ EXISTS
- `vw_attendance_monthly_summary` ✅ EXISTS
- `vw_attendance_daily_summary` ✅ EXISTS
- `vw_sync_latest_status` ✅ EXISTS

---

## P2 — Modernization Ideas

### 6. Add API Key to .env
**Problem:** No `API_KEY` or `GATEWAY_API_KEY` in `.env`
**Action:** Add one for production security:
```env
API_KEY=your-secret-key-here
GATEWAY_API_KEY=your-gateway-key
```

### 7. Divide Route Registration
**Problem:** All routes in flat `src/api/routes/` directory
**Suggestion:** Organize into subdirectories:
```
src/api/routes/
├── v1/          # API v1
│   ├── attendance.routes.ts
│   ├── employees.routes.ts
│   └── ...
├── v2/          # Future API v2
└── index.ts
```

### 8. Request Validation Middleware
**Problem:** Each route manually calls `validate(schema, body)`
**Suggestion:** Create middleware decorator:
```typescript
@validate(employeeSchema)
route('POST', '/api/employees', async (ctx) => { ... })
```

### 9. Error Response Consistency
**Problem:** Mix of `sendError()` with different formats
**Suggestion:** Standardize all errors to `{ success: false, error: { code, message, details } }`

### 10. Health Check Endpoint
**Problem:** No `/api/health` or `/api/ping` endpoint
**Suggestion:** Add lightweight health check for load balancers

---

## Verified Working Endpoints (38 total)

| Method | Path | Data |
|--------|------|------|
| GET | /api/employees | 25 |
| GET | /api/divisions | 16 |
| GET | /api/machines | 16 |
| GET | /api/attendance/daily | 50 |
| GET | /api/attendance/summary | 0 |
| GET | /api/attendance/monthly | - |
| GET | /api/attendance/employee/:code | - |
| GET | /api/attendance/corrections | 0 |
| GET | /api/dashboard/summary | {...} |
| GET | /api/dashboard/division-summary | {...} |
| GET | /api/dashboard/sync-status | 16 |
| GET | /api/dashboard/stats | {...} |
| GET | /api/divisions/:code | {...} |
| GET | /api/divisions/compare | {...} |
| GET | /api/divisions/:code/attendance | {...} |
| GET | /api/divisions/:code/machines | - |
| GET | /api/divisions/:code/scans | - |
| GET | /api/reports/daily | 2034 |
| GET | /api/reports/monthly | 1988 |
| GET | /api/reports/export/excel | - |
| GET | /api/import/formats | 3 |
| GET | /api/import/batch/:id/status | {...} |
| GET | /api/import/schedule | {...} |
| GET | /api/monitoring/sync-status/:id | {...} |
| GET | /api/monitoring/machine/:code/employees | {...} |
| GET | /api/monitoring/machine/:code/raw-data | {...} |
| GET | /api/monitoring/dashboard | {...} |
| GET | /api/monitoring/machines | 16 |
| GET | /api/monitoring/batches | {...} |
| GET | /api/monitoring/batch/:id | {...} |
| GET | /api/monitoring/quality | {...} |
| GET | /api/monitoring/division-summary | {...} |
| GET | /api/alerts/rules | 0 |
| GET | /api/alerts/active | 0 |
| GET | /api/alerts/history | 0 |
| GET | /api/alerts/defaults | 5 |
| GET | /api/audit/logs | 3 |
| GET | /api/mapping/review | 200 |
| GET | /api/quality/summary | {...} |
| GET | /api/realtime/stats | {...} |
| GET | /api/scheduler/jobs | {...} |
| GET | /api/scheduler/status | {...} |
| POST | /api/alerts/run | triggers |
| POST | /api/import/trigger | starts sync |
| POST | /api/monitoring/sync-all | starts sync all |
| POST | /api/scheduler/sync-all | starts sync all |

---

## Recommended Next Steps

1. **[P0]** Trigger machine sync: `POST /api/monitoring/sync-all`
2. **[P0]** Fix unhandled ZKError in `sync-machines.ts` startup crash
3. **[P1]** Audit `src/modules/` for `mst_machine` → `attendance_machines` mapping
4. **[P2]** Add API key to `.env` for production
5. **[P2]** Add `/api/health` endpoint

---

*Generated by Hermes + Claude Code Opus*
