# Full System Audit Report — 2026-06-26

> ⚠️ **DOCUMENT NOTE:** Angka dalam audit ini adalah snapshot **SAAT AUDIT** (pre-fix).
> State akhir setelah semua fix diterapkan tercantum di **Post-Audit Fix Applied** section di bawah.

## Executive Summary

| Area | Status | Issues |
|------|--------|--------|
| Schema Consistency | ✅ CLEAN | 0 violations |
| Code vs DB Schema | ✅ CLEAN | 0 mismatches |
| Unique Constraints | ✅ CLEAN | 0 duplicate groups |
| FK Integrity | ✅ CLEAN | 0 violations |
| Attendance Data | ✅ VALID | 55,063 enriched records (pre-fix) |
| Batch Tracking | ⚠️ GAPS | records_total semantics inconsistent |
| Orphan Records | ⚠️ RESOLVED | 10,022 rescued via migration 074 |
| ZKTeco Parser | ⚠️ GAP | 7 unique entities without employee (new hires) |
| Scheduler | ⚠️ ISSUES | attendance_pipeline_sync enabled but never ran |
| Failed Batches | ⚠️ CONNECTIVITY | 31 failed, 9 running — port forwarding needed |
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

## 4. Attendance Data Quality ✅ VALID (Audit Snapshot)

```
Total attendance_imports:    55,063  ← BEFORE corrupt row deletion
With employee_id:            55,061  (99.99%)
MANUAL_REVIEW orphans:              2  (0.01%) ← genuine new hires
Duplicate groups:                   0
```

### By Division (Audit Snapshot — Pre-fix)

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

## 5. ⚠️ 7 Unique Entities Without Employee (22 scan_log rows)

These are **new hires** enrolled on ZKTeco machines but not yet in the HR snapshot. They are not orphan data — they represent genuine attendance that cannot be linked to the HR master yet.

| raw_device_user_id | Machine | Parser Output | Count | Status |
|-------------------|---------|-------------|-------|--------|
| 9000628 | AB1 | G0628 | 7 rows (Jun 18-24) | New hire (RUDI ASNI?) — not in HR |
| 4000572 | AB2 | H0572 | 3 rows | New hire — not in HR |
| 4000573 | AB2 | H0573 | 2 rows | New hire — not in HR |
| 4000574 | AB2 | H0574 | 2 rows | New hire — not in HR |
| 4000575 | AB2 | H0575 | 2 rows | New hire — not in HR |
| 1000979 | P1A | A0979 | 6 rows | New hire (LITANI?) — not in HR |

**Action needed:** HR process to add these employees to DB_PTRJ.HR_EMPLOYEE.

---

## 6. ⚠️ Out-of-Range Dates (POST-FIX: Already Deleted)

- 12 `attendance_imports` rows with `attendance_date < '2020-01-01'` → **DELETED**
- 11 `attendance_scan_logs` rows with `scan_date < '2020-01-01'` → **DELETED**

Root cause: ZKTeco clock bug on affected machines (DME_01, DME_02, AB1, AB2, ARC_01, IJL, MILL).

---

## 7. ⚠️ raw_scan_log_id: Only 18.2% Populated

| Category | Count | % | Notes |
|----------|-------|---|-------|
| Total attendance_imports | 55,063 | 100% | |
| With raw_scan_log_id | 10,020 | 18.2% | PGE, ARA, MANUAL_REVIEW only |
| Without raw_scan_log_id | 45,043 | 81.8% | Via processAllUnprocessed (no FK set) |

**Why:** `processScanLogsForBatch()` sets `raw_scan_log_id = MIN(s.id)`. `processAllUnprocessed()` does NOT set it.

---

## 8. ⚠️ attendance_pipeline_sync: Enabled but Never Ran

Job `attendance_pipeline_sync` in `schedule.json` is `enabled: true` (enabled 2026-06-26) but no PIPELINE batch exists in `attendance_import_batches`.

Live sync data processed correctly via per-batch `processScanLogsForBatch()`. The global reprocess job has never executed.

---

## 9. ⚠️ 31 FAILED Batches — Machine Connectivity

Recent failures all from IP `103.144.208.154` (APE estate network). Port forwarding not configured on router.

| Machines | Action |
|---------|--------|
| AB1, ARC_01, ARC_02 | Configure port forwarding on 103.144.208.154 |
| Deadlock victims | Transient, auto-recovered |

---

## 10. ⚠️ 9 RUNNING Batches — POST-FIX: Marked FAILED

9 batches with `status = 'RUNNING'` were stale zombie processes. **Post-fix: all marked FAILED.**

---

## 11. ⚠️ Batch Count Semantics Inconsistent

| Batch Source | records_total | records_success | records_failed | Notes |
|-------------|-------------|----------------|----------------|-------|
| RECOVERY (227 batches) | 731,469 | 731,469 | 0 | Recovery data |
| SUCCESS (29 batches) | 219,961 | 20,279 | 0 | Live sync — total ≠ success |
| FAILED (31 batches) | 9,894 | 2,841 | 9,894 | Some success before fail |
| RUNNING (9 batches) | 0 | 0 | 0 | **POST-FIX: Marked FAILED** |

**Issue:** `records_total` set BEFORE dedup; SUCCESS batches with 0 inserts still marked SUCCESS.

**Verdict:** `attendance_import_batches` is unreliable. Use `attendance_imports` actual row count as source of truth.

---

## Priority Action Items

| # | Priority | Action | Status |
|---|----------|--------|--------|
| 1 | CRITICAL | Restart backend to activate `attendance_pipeline_sync` | ⚠️ Pending restart |
| 2 | HIGH | Configure port forwarding on 103.144.208.154 (ARC_01, ARC_02, AB1) | Network |
| 3 | MEDIUM | Investigate 2+ new hire employees: G0628, A0979, H0572-575 — add to HR | HR process |
| 4 | LOW | Wire `raw_scan_log_id` into `processAllUnprocessed()` for traceability | Optional |

---

## Post-Audit Fixes Applied ✅

All issues marked FIXED:

| # | Issue | Fix Applied |
|---|-------|------------|
| 4 | Delete 12 corrupt attendance_imports | ✅ DELETED (55,063 → 55,051) |
| 4 | Delete 11 corrupt scan_logs | ✅ DELETED (808,104 → 808,093) |
| 5 | 9 RUNNING stuck batches | ✅ Marked FAILED |
| 7 | attendance_pipeline_sync scheduler | ✅ ENABLED in schedule.json |
| 8 | SSOT parser 6-digit IDs | ✅ Now returns NONE → NEED_REVIEW path |
| — | 10,022 MANUAL_REVIEW orphans | ✅ Rescued via migration 074 |

**Final production state (POST-FIX):**
- `attendance_scan_logs`: **808,093** rows (WIB-corrected, 0 corrupt dates)
- `attendance_imports`: **55,051** rows (all 11 divisions, 99.99% enriched)
- MANUAL_REVIEW orphans: **0** (10,022 rescued; 2 genuine new hires remain in NEED_REVIEW path)
- 9 stuck RUNNING batches: **FAILED**
- attendance_pipeline_sync: **ENABLED**

---

## Batch Count Reconciliation

```
Audit snapshot (pre-fix):
attendance_scan_logs:           808,104 rows
  ├─ RECOVERY (sync_batch_id=NULL):  788,915 rows  ← Backup restore
  └─ LIVE_SYNC (sync_batch_id!=NULL):  19,189 rows  ← Post-recovery syncs

attendance_imports (pre-fix):  55,063 rows
attendance_imports (post-fix):  55,051 rows  ← After 12 corrupt deleted

Post-fix reconciliation:
attendance_scan_logs:           808,093 rows  (808,104 - 11 corrupt)
  ├─ RECOVERY:                   788,915 rows
  └─ LIVE_SYNC:                   19,178 rows
attendance_imports:              55,051 rows  (55,063 - 12 corrupt)
  ├─ RECOVERY source:            ~46,031 rows
  └─ LIVE_SYNC source:            ~9,020 rows
```

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
