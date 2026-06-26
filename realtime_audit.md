# Real-Time Routes Audit Report

**Project:** Absensi_Muka  
**Server:** `http://localhost:8004`  
**Database:** MSSQL `10.0.0.110/rebinmas_absensi_monitoring`  
**Date:** 2026-06-19  

---

## Summary

| File | Status |
|------|--------|
| `src/api/routes/realtime.routes.ts` | ✅ All SQL OK |
| `src/api/routes/machine-employee.routes.ts` | ⚠️ 1 Bug, 1 logic issue |
| `src/api/routes/machines.routes.ts` | ✅ All SQL OK |

---

## realtime.routes.ts — ✅ All Working

### Endpoint Tests

| Method | Path | Result | Notes |
|--------|------|--------|-------|
| GET | `/api/realtime/sync-status` | ✅ Working | SSE streams `event: connected` with `clientId` |
| GET | `/api/realtime/live-feed` | ✅ Working | SSE streams snapshot with stats, machines, batches, scans |
| GET | `/api/realtime/events` | ✅ Working | SSE streams with subscribed event types |
| GET | `/api/realtime/stats` | ✅ Working | Returns `connectedClients: 1` |
| GET | `/api/realtime/latest-scans` | ✅ Working | Returns scan records with `parsed_employee_code`, `mapping_status` |
| GET | `/api/realtime/feed-stats` | ✅ Working | Returns stats + machine status + batch data |

### SQL Query Review

| Query | Table/Columns | Status |
|-------|--------------|--------|
| `attendance_scan_logs` | `raw_device_user_id`, `machine_code`, `scan_time`, `scan_date`, `mapping_status`, `parsed_employee_code` | ✅ Correct |
| `attendance_machines` | `machine_code`, `location_name`, `access_status`, `is_active` | ✅ Correct |
| `attendance_import_batches` | `batch_code`, `status`, `records_success`, `started_at` | ✅ Correct |

---

## machine-employee.routes.ts — ⚠️ Issues Found

### Endpoint Tests

| Method | Path | Result | Notes |
|--------|------|--------|-------|
| GET | `/api/monitoring/machine/:code/employees` | ✅ Working | Returns raw, mapped, unmapped, db_employees |
| GET | `/api/monitoring/machine/:code/raw-data` | ✅ Working | Paginated scan logs |
| POST | `/api/monitoring/employees/:code/map` | ❌ **BROKEN** | `Symbol(Symbol.asyncIterator)` error |
| POST | `/api/monitoring/machine-ping` | ⚠️ **Logic bug** | Filter ignored, returns all machines |

### ❌ BROKEN: `POST /api/monitoring/employees/:code/map`

**Exact error:**
```
{"success":false,"error":{"code":"INTERNAL_ERROR","message":"Cannot read properties of null (reading 'Symbol(Symbol.asyncIterator)')"}}
```

**Root cause:** Lines 186-187 — body reading uses `req.read()` which returns `null` in Node.js HTTP streams. The `for await...of` loop fails when `req.read()` is null.

```typescript
// BROKEN (lines 185-187):
for await (const chunk of req.read ? req.read() : []) chunks.push(Buffer.from(chunk as any));
```

**Fix needed:** Use proper stream consumption:
```typescript
// FIX:
const chunks: Buffer[] = [];
for await (const chunk of req) chunks.push(Buffer.from(chunk));
```

---

### ⚠️ BUG: `POST /api/monitoring/machine-ping` — Body Filter Ignored

**Issue:** When `machine` is passed in the POST body JSON (e.g., `{"machine":"PGE"}`), the filter is **completely ignored** — all active machines are returned instead of just the filtered one. The route only reads `ctx.query.get('machine')` from the query string.

**Root cause:** Line 16 reads from query string only:
```typescript
const code = ctx.query.get('machine') ?? ''; // reads ?machine=PGE, ignores body JSON
```

**Test results:**
- `curl -X POST "http://localhost:8004/api/monitoring/machine-ping?machine=PGE"` → ✅ Returns only PGE
- `curl -X POST -d '{"machine":"PGE"}' "http://localhost:8004/api/monitoring/machine-ping"` → ❌ Returns ALL machines (PGE, MILL, DME_01, DME_02, OFFICE_APE, ARE, ARA, AB1, AB2, ARC_01…)

**Fix needed:** Also read from body if query param is empty:
```typescript
const code = ctx.query.get('machine') ?? parsedBody?.machine ?? '';
```

### SQL Query Review

| Query | Table/Columns | Status |
|-------|--------------|--------|
| `attendance_machines` | `machine_code`, `ip_address`, `port`, `is_active`, `data_source` | ✅ Correct |
| `attendance_scan_logs` | `raw_device_user_id`, `scan_time`, `parsed_employee_code`, `mapping_status`, `machine_code` | ✅ Correct |
| `employees` | `employee_code`, `employee_name`, `division_id` | ✅ Correct |
| `divisions` | `division_code`, `id` | ✅ Correct |
| `employee_mapping_overrides` | `raw_device_id`, `machine_code`, `employee_code`, `mapped_by` | ✅ Correct |

---

## machines.routes.ts — ✅ All Working

### Endpoint Tests

| Method | Path | Result | Notes |
|--------|------|--------|-------|
| GET | `/api/machines` | ✅ Working | Returns machines with sync status via `OUTER APPLY` |
| GET | `/api/machines/failures` | ✅ Working | Returns empty array (no failures currently) |
| POST | `/api/machines/:machineCode/test-connection` | ✅ Working | Returns `{success: true}` |

### SQL Query Review

| Query | Table/Columns | Status |
|-------|--------------|--------|
| `attendance_machines` | `m.*`, `machine_code`, `last_sync_at`, `last_error_message`, `is_active` | ✅ Correct |
| `attendance_sync_logs` | `machine_code`, `started_at`, `status`, `error_message` (via OUTER APPLY) | ✅ Correct |
| `machine_connection_logs` | `status`, `checked_at` | ✅ Correct |

---

## Total Results

| Category | Count |
|----------|-------|
| Total endpoints tested | 11 |
| ✅ Working | 9 |
| ❌ Broken | 1 |
| ⚠️ Logic bug | 1 |
| SQL table/column name errors | 0 |

---

## Required Fixes

### 1. `src/api/routes/machine-employee.routes.ts` — Line 186-187 (Body reading)

```typescript
// BROKEN:
for await (const chunk of req.read ? req.read() : []) chunks.push(Buffer.from(chunk as any));

// FIX:
for await (const chunk of req) chunks.push(Buffer.from(chunk));
```

### 2. `src/api/routes/machine-employee.routes.ts` — Line 16 (machine-ping body filter)

The route only reads `machine` from the query string (`ctx.query.get('machine')`), ignoring any `machine` field in the POST body JSON. When the client sends `{"machine":"PGE"}` in the body, the filter is silently dropped.

**Fix:** Also check body JSON when query param is absent:
```typescript
// After reading body JSON, merge:
const code = ctx.query.get('machine') ?? parsedBody?.machine ?? '';
```

---

## SQL Table/Column Verification

All verified tables and columns in the three route files match the actual database schema:

| Table | Columns Used | Status |
|-------|-------------|--------|
| `attendance_scan_logs` | `raw_device_user_id`, `machine_code`, `scan_time`, `scan_date`, `mapping_status`, `mapping_reason`, `parsed_employee_code`, `parsed_division_code`, `raw_user_sn`, `event_type`, `verify_type` | ✅ |
| `attendance_machines` | `machine_code`, `location_name`, `ip_address`, `port`, `is_active`, `data_source`, `access_status`, `machine_type`, `scanner_code`, `loc_code`, `local_ip`, `notes`, `last_sync_at`, `last_error_message` | ✅ |
| `attendance_import_batches` | `batch_code`, `status`, `records_success`, `started_at` | ✅ |
| `attendance_sync_logs` | `machine_code`, `started_at`, `status`, `error_message` | ✅ |
| `machine_connection_logs` | `status`, `checked_at` | ✅ |
| `employees` | `employee_code`, `employee_name`, `division_id` | ✅ |
| `divisions` | `division_code`, `id` | ✅ |
| `employee_mapping_overrides` | `raw_device_id`, `machine_code`, `employee_code`, `mapped_by` | ✅ |
