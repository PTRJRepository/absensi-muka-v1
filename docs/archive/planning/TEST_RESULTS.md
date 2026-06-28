# Monitoring API Test Results

**Date:** 2026-06-18
**Base URL:** http://localhost:8004

---

## SUMMARY

| # | Endpoint | Status | Double-Wrapped? | Notes |
|---|----------|--------|-----------------|-------|
| 1 | GET /api/monitoring/dashboard | 200 | No | OK |
| 2 | GET /api/monitoring/machines | 200 | **YES** (BUG) | data.data contains the array |
| 3 | GET /api/monitoring/machine/AB1/employees | 200 | No | 100 unique IDs, 0 mapped |
| 4 | GET /api/monitoring/sync-status/1 | 200 | No | Returns RUNNING batch |
| 5 | GET /api/monitoring/quality?days=30 | 200 | No | 81,724 scan logs |
| 6 | GET /api/monitoring/division-summary | 200 | No | **Empty divisions array** |
| 7 | GET /api/monitoring/batches | 200 | No | Pagination works |
| 8 | GET /api/monitoring/batch/1 | 200 | No | Shows sample logs |
| 9 | POST /api/monitoring/sync/AB1 | 200 | No | Started sync |
| 10 | POST /api/monitoring/sync-all | 200 | No | Triggered 16 machines |

**All endpoints return HTTP 200.**

---

## DATABASE STATE

| Table | Count |
|-------|-------|
| attendance_scan_logs | 251,906 |
| attendance_imports | 0 |
| attendance_sync_logs | 61 |

**Top 5 employee_code:**
```
0010001, 0010002, 0010003, 0010004, 0010006
```

---

## ENDPOINT DETAILS

### 1. GET /api/monitoring/dashboard
- **Status:** 200
- **Double-wrapped:** No
- **Notes:** Last batch has error `[object Object]` (stringified object).

---

### 2. GET /api/monitoring/machines
- **Status:** 200
- **Double-wrapped:** YES (BUG!)
- **Bug:** Response has data.success: true AND data.data: [...]. Should be data: [...] directly.

---

### 3. GET /api/monitoring/machine/AB1/employees
- **Status:** 200
- **Double-wrapped:** No
- **Notes:** All 100 IDs are UNMAPPED. Reason: "Raw device user id is not numeric" (IDs like "9000582").

---

### 4. GET /api/monitoring/sync-status/1
- **Status:** 200
- **Double-wrapped:** No
- **Notes:** Returns RUNNING batch.

---

### 5. GET /api/monitoring/quality?days=30
- **Status:** 200
- **Double-wrapped:** No
- **Notes:** Only 7% mapped rate (5,702 mapped, 1,037 unmapped).

---

### 6. GET /api/monitoring/division-summary?year=2026&month=6
- **Status:** 200
- **Double-wrapped:** No
- **Notes:** Empty divisions array - no processed data for June 2026.

---

### 7. GET /api/monitoring/batches?page=1&limit=5
- **Status:** 200
- **Double-wrapped:** No
- **Notes:** Pagination works (total: 132 batches, 27 pages).

---

### 8. GET /api/monitoring/batch/1
- **Status:** 200
- **Double-wrapped:** No
- **Notes:** Shows sample logs from batch. All sample logs are UNMAPPED.

---

### 9. POST /api/monitoring/sync/AB1
- **Status:** 200
- **Double-wrapped:** No
- **Notes:** Started sync, batch_id: 133.

---

### 10. POST /api/monitoring/sync-all
- **Status:** 200
- **Double-wrapped:** No
- **Notes:** Triggered sync for all 16 machines. No errors.

---

## ISSUES FOUND

### BUG 1: Double-Wrapped Response in /api/monitoring/machines
Response has unnecessary nesting - data.success: true AND data.data: [...] instead of data: [...] directly.

### BUG 2: Stringified Error Object
Dashboard shows `[object Object]` instead of actual error details.

### BUG 3: Empty Divisions
/api/monitoring/division-summary returns empty divisions array - no processed attendance data.

### BUG 4: Employee Mapping
All device user IDs (e.g., "9000582") are UNMAPPED because they start with "900" prefix which doesn't match expected numeric format.

---

## RECOMMENDATIONS

1. Fix double-wrapped response in machines endpoint
2. Fix error message serialization
3. Investigate empty divisions - may need to run attendance processing
4. Review employee mapping logic for prefixed device IDs (900 prefix)
