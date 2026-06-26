# Full System Audit Report — 2026-06-26 (FIXED)

## Executive Summary

| Area | Status | Issues |
|------|--------|--------|
| Schema Consistency | ✅ CLEAN | 0 violations |
| Code vs DB Schema | ✅ CLEAN | 0 mismatches |
| Unique Constraints | ✅ CLEAN | 0 duplicate groups |
| FK Integrity | ✅ CLEAN | 0 violations |
| Attendance Data | ✅ VALID | 55,063 enriched records |
| Batch Tracking | ⚠️ GAPS | records_total semantics inconsistent |
| Orphan Records | ⚠️ RESOLVED | 10,022 rescued, 2 remain |
| ZKTeco Parser | ⚠️ BUGS | 22 MAPPED without employee, 2 new hire gaps |
| Scheduler | ⚠️ ISSUES | attendance_pipeline_sync enabled but never ran |
| Failed Batches | ⚠️ CONNECTIVITY | 31 failed, 9 running — port forwarding |
| Traceability | ⚠️ GAP | raw_scan_log_id only 18.2% populated |

---

## 1. Schema Consistency Audit ✅ CLEAN

| Check | Result | Status |
|-------|--------|--------|
| employee_id NOT NULL + division_code=MANUAL_REVIEW | 0 | ✅ |
| employee_id NULL + enrichment columns populated | 0 | ✅ |
| division_code not in divisions table | 0 | ✅ |
| Unexpected attendance_status | 0 | ✅ |
| batch_id references non-existent batch | 0 | ✅ |
| scan_logs MAPPED but no employee match | 22 | ⚠️ (see #7) |
| scan_logs NEED_REVIEW with valid parsed_employee_code | 0 | ✅ |
| employees.division_id not in divisions table | 0 | ✅ |

**FK constraints working correctly:**
- `attendance_imports.employee_id → employees.id` (enforced)
- `attendance_imports.batch_id → attendance_import_batches.id` (enforced)
- `attendance_imports.raw_scan_log_id → attendance_scan_logs.id` (enforced, but 81.8% NULL)
- `employees.division_id → divisions.id` (enforced)
- `employees.gang_id → gangs.id` (enforced)

---

## 2. Code vs DB Schema ✅ CLEAN

All TypeScript code column references match the actual DB schema. No mismatches found between `attendance-process-import.service.ts`, `sync-machines.js`, and the DB tables.

---

## 3. Unique Constraint ✅ CLEAN — No Duplicate Groups

**Constraint:** `(employee_code, attendance_date, source, source_reference)`

**Result:** 0 duplicate groups after orphan rescue migration 074.

Previous state (before migration): 5,174 duplicate groups from overlapping MANUAL_REVIEW inserts.

---

## 4. Attendance Data Quality ✅ VALID

```
Total attendance_imports:    55,063
With employee_id:            55,061  (99.99%)
MANUAL_REVIEW orphans:              2  (0.01%)
Duplicate groups:                   0
```

### By Division

| Division | Records | Enriched | Status |
|----------|---------|---------|--------|
| ARC | 13,873 | 100% | ✅ |
| PGE | 9,936 | 100% | ✅ |
| DME | 9,249 | 100% | ✅ |
| AB1 | 6,018 | 100% | ✅ |
| AB2 | 5,954 | 100% | ✅ |
| P1A | 3,492 | 100% | ✅ |
| P1B | 3,316 | 100% | ✅ |
| IJL | 2,895 | 100% | ✅ |
| ARA | 254 | 100% | ✅ |
| P2B | 40 | 100% | ✅ |
| P2A | 34 | 100% | ✅ |
| MANUAL_REVIEW | 2 | 0% | ⚠️ |

### Enrichment Quality (on 55,061 enriched records)

| Metric | Count | Rate |
|--------|-------|------|
| employee_name populated | 54,786 | 99.5% |
| nik populated | 44,720 | 81.2% |
| hr_loc_code populated | 44,768 | 81.3% |
| current_emp_name populated | 44,768 | 81.3% |

**Note:** The ~18.7% gap in nik/enrichment is NOT a bug. PGE division (9,936 records) employees have no nik in DB_PTRJ — they are legacy PGE employees not tracked in the HR system.

---

## 5. ⚠️ 7 MAPPED Without Employee (22 rows = 7 unique entities)

**Note: Audit awal report 22 rows — revision: sebenarnya 7 unique `raw_device_user_id` entities.**

| raw_device_user_id | Machine | Parser Output | Count | Status |
|-------------------|---------|-------------|-------|--------|
| 9000628 | AB1 | G0628 | 7 rows (dates: Jun 18-24, Jun 21 missing) | New hire? Machine enrolled but not in HR |
| 4000572 | AB2 | H0572 | 3 rows | Parser bug — 6-digit raw ID |
| 4000573 | AB2 | H0573 | 2 rows | Parser bug — 6-digit raw ID |
| 4000574 | AB2 | H0574 | 2 rows | Parser bug — 6-digit raw ID |
| 4000575 | AB2 | H0575 | 2 rows | Parser bug — 6-digit raw ID |
| 1000979 | P1A | A0979 | 6 rows | New hire? Not in HR snapshot |

### Detail: G0628 on AB1

7 scan_logs dengan `raw_device_user_id = 9000628`. Nama di `machine_user_raw` (jika di-sync): RUDI (ASNI).

`G0628` beyond current max G-series employee (`G0627`). Kemungkinan:
1. **New hire** — enrolled on ZKTeco AB1 but never synced to `employees` table
2. **Phantom enrollment** — fingerprint registered but no matching HR record

### Detail: AB2 6-digit IDs (4000572-575)

Parser SSOT ambil 4-digit suffix → `H0572`. Machine enrollment mungkin 6-digit sequence → `H00572`.

### Required action:
```bash
# Sync AB1 machine to populate machine_user_raw → akan reveal nama untuk G0628
node dist/scripts/sync-machines.js --machine=AB1

# Jika RUDI (ASNI) ditemukan di machine_user_raw:
# → buat employee record baru di DB_PTRJ.HR_EMPLOYEE, atau
# → sync HR snapshot akan pick up otomatis

# Untuk AB2 6-digit IDs:
# → Fix SSOT parser: khusus AB2 (machine_code=AB2) gunakan 5-digit suffix
```

**Not inactive employees — not a bug in the pipeline. This is a sync gap (new hires not yet in HR or ZKTeco enrollment not synced).**

---

## 6. ⚠️ Out-of-Range Dates: 12 attendance_imports + 11 scan_logs

**Root cause:** ZKTeco clock bug on affected machines — timestamp returned epoch/garbage value.

**Affected machines:** DME_01, DME_02, AB1, AB2, ARC_01, IJL, MILL

**Required action:**
```sql
DELETE FROM attendance_imports WHERE attendance_date < '2020-01-01';
DELETE FROM attendance_scan_logs WHERE scan_date_wib < '2020-01-01';
```

These are corrupt rows that cannot be attributed to any real date.

---

## 7. ⚠️ raw_scan_log_id: Only 18.2% Populated

| Category | Count | % | Notes |
|----------|-------|---|------|
| Total attendance_imports | 55,063 | 100% | |
| With raw_scan_log_id | 10,020 | 18.2% | PGE, ARA, MANUAL_REVIEW only |
| Without raw_scan_log_id | 45,043 | 81.8% | All other divisions |

**Why:** `processScanLogsForBatch()` (per-batch processing) correctly sets `raw_scan_log_id = MIN(s.id)`. `processAllUnprocessed()` (global processing used for recovery) does NOT set it.

**Impact:** 81.8% of enriched attendance records cannot be traced back to the source scan_log row. The records are valid — just no FK linkage.

**Fix:** Add `raw_scan_log_id` to `processAllUnprocessed()` INSERT statement, or accept the gap.

---

## 8. ⚠️ attendance_pipeline_sync Never Ran

**What:** Job `attendance_pipeline_sync` in `schedule.json` is `enabled: true` (enabled 2026-06-26) but:
- No batch with `source = 'PIPELINE'` exists in `attendance_import_batches`
- The script `process-attendance-imports.js` has never been called by the scheduler

**The pipeline is running via `processAllUnprocessed()` from sync-machines.js per-batch, but:**
- `attendance_pipeline_sync` (global reprocess) never ran
- Live sync data (19,189 rows since recovery) was processed correctly

**Action:** Restart backend server to pick up new `schedule.json` config.

---

## 9. ⚠️ 31 FAILED Batches — Machine Connectivity

Recent failures all from IP `103.144.208.154` (APE estate network):

| Error Pattern | Machines | Action |
|---------------|---------|--------|
| Connection refused/timeout | AB1, ARC_01, ARC_02 | Configure port forwarding on 103.144.208.154 router |
| Deadlock victim | Any | Transient, auto-recovered |

**31 FAILED batches:** Port forwarding not configured on APE estate router.
- Ports needed: 4200 (ARC_01), 4201 (ARC_02), 4900 (AB1)

---

## 10. ⚠️ 9 RUNNING Batches — Stuck?

9 batches have `status = 'RUNNING'`. These may be stale — last update unknown. Check if there are zombie processes.

---

## 11. ⚠️ Batch Count Semantics Inconsistent

| Batch Source | records_total | records_success | records_failed | Notes |
|-------------|-------------|----------------|----------------|-------|
| RECOVERY (227 batches) | 731,469 | 731,469 | 0 | Recovery data, total = success |
| SUCCESS (29 batches) | 219,961 | 20,279 | 0 | Live sync — total ≠ success |
| FAILED (31 batches) | 9,894 | 2,841 | 9,894 | Some success before fail |
| RUNNING (9 batches) | 0 | 0 | 0 | Stuck/in-progress |

**Issue:** `records_total` in LIVE_SYNC batches appears to be the raw attendance record count from machine, while `records_success` is the scan_log INSERT count. These are different because of deduplication.

**Not a data loss issue** — scan_logs is the source of truth.

---

## Priority Action Items

| # | Priority | Action | Effort |
|---|----------|--------|--------|
| 1 | CRITICAL | Restart backend to activate `attendance_pipeline_sync` scheduler | 1 min |
| 2 | HIGH | Configure port forwarding on 103.144.208.154 (ARC_01, ARC_02, AB1) | Network |
| 3 | HIGH | Fix SSOT parser for AB2 6-digit IDs (4000572-575) | 30 min |
| 4 | HIGH | Delete 12+11 corrupt rows with date < 2020 | 5 min |
| 5 | MEDIUM | Investigate 9 RUNNING stuck batches | 10 min |
| 6 | MEDIUM | Investigate 2 new hire employees (G0628, A0979) — add to HR | HR process |
| 7 | LOW | Wire `raw_scan_log_id` into `processAllUnprocessed()` for traceability | 30 min |
| 8 | LOW | Populate `attendance_sync_logs` for better monitoring | 1 hour |

---

## Batch Count Reconciliation

```
attendance_scan_logs:           808,104 rows
  ├─ RECOVERY (sync_batch_id=NULL):  788,915 rows  ← Backup restore
  └─ LIVE_SYNC (sync_batch_id!=NULL):  19,189 rows  ← Post-recovery syncs

attendance_imports:             55,063 rows  ← All enriched records
  ├─ RECOVERY source:            ~46,043 rows  ← Via processAllUnprocessed
  └─ LIVE_SYNC source:            ~9,020 rows  ← Via processScanLogsForBatch (per batch)
```

**No data loss detected.** All scan_logs map to attendance_imports through the GROUP BY process.

### Batch Tracking Table Gap (196,841)

| Metric | Value |
|--------|-------|
| `SUM(records_total)` | 961,324 |
| `SUM(records_success)` | 754,589 |
| `SUM(records_failed)` | 9,894 |
| Gap (total − success − failed) | **196,841** |

**Root causes:**
1. `records_total` set BEFORE dedup — `rawCount` increments before `IF NOT EXISTS` dedup check
2. 28 batches: SUCCESS but `records_success=0` — all records had no employee match, `processScanLogsForBatch` filtered them out, yet batch status was `SUCCESS`
3. Recovery batches orphaned — 227 batches with `batch_id = NULL` in `attendance_imports`

**Verdict:** `attendance_import_batches` is unreliable as a dashboard metric. Use `attendance_imports` actual row count as source of truth.
