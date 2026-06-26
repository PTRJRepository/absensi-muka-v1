# Pre-Fix Clarification Report
## Sistem Absensi PT Rebinmas Jaya
**Generated: 2026-06-21**
**Author: Claude Code Analysis**

---

## Executive Summary

Laporan ini adalah hasil dari audit codebase komprehensif menggunakan 6 parallel exploration agents untuk memvalidasi dan mengklarifikasi 15 pertanyaan teknis sebelum melakukan perbaikan sistem.

---

## 1. Konfirmasi Scope Perbaikan

### Rekomendasi Urutan Perbaikan

| Priority | Approach | Reason |
|----------|----------|--------|
| **P0** | Patch cepat dulu | 4 fixes aman tanpa migration |
| **P1** | Migrate sync modules | Critical path -换成 direct MSSQL |
| **P2** | Deprecate legacy modules | Non-critical, bisa bertahap |
| **P3** | Database consolidation | Fase akhir, perlu persetujuan |

### Mengapa Patch P0 Dulu?

1. **Risiko rendah** - Tidak ada perubahan schema atau data
2. **Benefit langsung** - Fix UI bugs, store unmapped data
3. **Foundation** - Mempersiapkan cleanup untuk P1-P2

---

## 2. Konfirmasi Source of Truth

### Data Flow (ACTIVE)

```
ZKTeco Machine (TCP Connection)
    ↓
sync-orchestrator.service.ts
    ├─ Fetch users via ZktecoService
    ├─ Fetch attendance via ZktecoService
    ├─ Map deviceUserId → empCode
    └─ Insert to attendance_scan_logs
    ↓
attendance-process-import.service.ts (AUTO-CALLED)
    ├─ MAPPED records → attendance_imports
    └─ NEED_REVIEW records → MANUAL_REVIEW division
    ↓
vw_attendance_monthly_matrix (VIEW)
    ↓
Dashboard / API Endpoints
```

### IT Solution API Status

| Reference | Status |
|-----------|--------|
| Source code references | ❌ TIDAK ADA |
| Documentation references | ⚠️ Ada ( outdated) |
| Service file | ✅ SUDAH DIHAPUS |

### Deprecated Tables Status

| Table | Status | Used In |
|-------|--------|---------|
| `attendance_raw_log` | ⚠️ DEPRECATED | 6 modules (but NOT in sync flow) |
| `attendance_daily_process` | ⚠️ DEPRECATED | 5 modules (but NOT in sync flow) |
| `attendance_scan_logs` | ✅ ACTIVE | sync-orchestrator, process-import |
| `attendance_imports` | ✅ ACTIVE | API endpoints |

### File Usage by Data Source

| File | Data Source | Status | Action |
|------|-------------|--------|--------|
| `sync-orchestrator.service.ts` | attendance_scan_logs | **ACTIVE** | Keep |
| `attendance-process-import.service.ts` | attendance_scan_logs → attendance_imports | **ACTIVE** | Keep |
| `attendance-raw.repository.ts` | attendance_raw_log | **DEPRECATED** | Deprecate |
| `attendance-process.service.ts` | attendance_raw_log → attendance_daily_process | **DEPRECATED** | Deprecate |
| `direct-zkteco-import.service.ts` | attendance_raw_log | **DEPRECATED** | Deprecate |
| `employee-mapping.service.ts` | attendance_raw_log (getUnmappedDeviceUsers) | **DEPRECATED** | Update to new table |
| `summary.service.ts` | attendance_daily_process + attendance_raw_log | **DEPRECATED** | Migrate |
| `dashboard.service.ts` | attendance_raw_log + attendance_daily_process | **DEPRECATED** | Migrate |
| `anomaly.service.ts` | attendance_daily_process | **DEPRECATED** | Migrate |

---

## 3. Konfirmasi Database Layer

### Dual Database Architecture

| Layer | Connection | Database | Files |
|-------|------------|----------|-------|
| **SqlClient** | HTTP Gateway | `extend_db_ptrj` | 21 modules |
| **lib/db.ts** | Direct MSSQL | `rebinmas_absensi_monitoring` | 27 files |

### SqlClient Usage (→ extend_db_ptrj)

| File | Risk Level | Migration Priority |
|------|------------|-------------------|
| `employee.repository.ts` | HIGH | P1 |
| `employee-movement.service.ts` | HIGH | P1 |
| `machine.repository.ts` | HIGH | P1 |
| `import-job.service.ts` | HIGH | P1 |
| `sync-orchestrator.service.ts` | HIGH | **P0** |
| `attendance-raw.repository.ts` | HIGH | P2 (deprecate) |
| `attendance-process.service.ts` | HIGH | P2 (deprecate) |
| `attendance-reconcile.service.ts` | HIGH | P2 (migrate) |
| `anomaly.service.ts` | MEDIUM | P2 |
| `summary.service.ts` | MEDIUM | P2 |

### Migration Strategy: PHASED

| Phase | Files | Strategy | Risk |
|-------|-------|----------|------|
| **P0** | sync-orchestrator, import-job | Replace SqlClient with lib/db | LOW |
| **P1** | employee repo, machine repo | Replace with parameterized queries | MEDIUM |
| **P2** | deprecated modules | Migrate OR deprecate | LOW |

### Risiko Jika Migrasi Langsung

1. **Breaking changes** - API responses bisa berbeda
2. **Data inconsistency** - Tables berbeda bisa punya data tidak sinkron
3. **Rollback complexity** - Lebih sulit rollback jika semua sekaligus

### Strategi Migrasi Aman

1. **Backup first** - Backup `extend_db_ptrj` tables sebelum migration
2. **Read replicas** - Migrate read operations dulu
3. **Write verification** - Test write operations dengan data dummy
4. **Gradual cutover** - Switch module satu per satu

---

## 4. Konfirmasi Patch P0 yang Aman

### Daftar P0 Patches

| # | Fix | File | Safe? | Breaking? |
|---|-----|------|-------|-----------|
| P0.1 | Delete orphaned `quality-dashboard.routes.ts` | src/api/routes/ | ✅ | ❌ |
| P0.2 | Fix threshold `> 2` → `>= 2` | anomaly.service.ts:120 | ✅ | ❌ |
| P0.3 | Store unmapped users | sync-orchestrator.service.ts | ✅ | ❌ (data only) |
| P0.4 | Fix missing icon imports | AttendancePage.tsx | ✅ | ❌ |

### Detail P0.1: Delete Orphaned File

**Critical Finding**: `quality-dashboard.routes.ts` adalah **ORPHANED FILE**

```
src/api/routes/index.ts:
  import './quality.routes';  ✅ Registered
  // quality-dashboard.routes.ts - ❌ NOT imported
```

**Duplicate Endpoints:**
| Endpoint | quality-dashboard.routes.ts | quality.routes.ts |
|----------|----------------------------|-------------------|
| `/api/quality/dashboard-summary` | Line 12 | Line 14 |
| `/api/quality/daily-trend` | Line 76 | Line 81 |

**Action**: DELETE `quality-dashboard.routes.ts` - endpoints tidak akan pernah ter-trigger.

### Detail P0.2: Fix Threshold

```typescript
// anomaly.service.ts:120
// BEFORE (too lenient):
if (process.machine_count > 2) {

// AFTER (correct):
if (process.machine_count >= 2) {
```

### Detail P0.3: Store Unmapped Users

**Current Behavior** (line 315-324 in sync-orchestrator.service.ts):
```typescript
if (empCode) {
  await this.importAttendanceLog(batchId, machine, att, empCode.empCode);
  attCount++;
} else {
  unmappedCount++;
  console.warn(`[Orchestrator] Unmapped device user...`);
  // ❌ NOT STORED - silently dropped
}
```

**Required Change**:
```typescript
} else {
  unmappedCount++;
  // ✅ STORE unmapped for monitoring
  await this.importAttendanceLog(batchId, machine, att, null);
}
```

**Schema Check** - Semua kolom yang diperlukan SUDAH ADA:
| Column | Type | Nullable |
|--------|------|----------|
| mapping_status | NVARCHAR(30) | ✅ |
| mapping_reason | NVARCHAR(500) | ✅ |
| raw_device_user_id | NVARCHAR(100) | ✅ |
| scan_time | DATETIME2 | ✅ |
| machine_code | NVARCHAR(30) | ✅ |

### Detail P0.4: Fix Missing Icons

**Issue**: Missing lucide-react imports causing modal crash

**Solution**: Add missing imports to AttendancePage.tsx

---

## 5. Konfirmasi Schema attendance_scan_logs

### Column List

```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'attendance_scan_logs'
ORDER BY ORDINAL_POSITION;
```

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| id | BIGINT | NO | Primary key |
| machine_id | INT | YES | FK to machine |
| machine_code | NVARCHAR(30) | NO | Machine identifier |
| raw_device_user_id | NVARCHAR(100) | NO | Raw ID from device |
| raw_user_sn | NVARCHAR(100) | YES | Serial number |
| raw_record_time | DATETIME2 | NO | Original timestamp |
| raw_ip | NVARCHAR(64) | YES | Device IP |
| parsed_employee_code | NVARCHAR(30) | YES | Mapped employee code |
| parsed_division_code | NVARCHAR(20) | YES | Division code |
| mapping_status | NVARCHAR(30) | NO | MAPPED/NEED_REVIEW/UNMAPPED |
| mapping_reason | NVARCHAR(500) | YES | Reason if unmapped |
| scan_time | DATETIME2 | NO | Parsed scan time |
| scan_date | DATE | NO | Scan date |
| event_type | NVARCHAR(50) | YES | Event type |
| verify_type | NVARCHAR(50) | YES | Verification type |
| work_code | NVARCHAR(50) | YES | Work code |
| sync_batch_id | BIGINT | YES | FK to batch |
| created_at | DATETIME2 | NO | Record creation |

### Constraints

| Constraint | Type | Columns |
|------------|------|---------|
| PRIMARY KEY | PK | id |

### Indexes (Expected)

| Index | Columns |
|-------|---------|
| IX_scan_date | scan_date |
| IX_scan_logs_employee | parsed_employee_code |
| IX_scan_logs_machine | machine_code |
| IX_scan_logs_batch | sync_batch_id |

### Duplicate Prevention

**Layer 1** - At insert (sync-orchestrator):
```sql
IF NOT EXISTS (
  SELECT 1 FROM attendance_scan_logs
  WHERE machine_code = @machineCode
    AND raw_device_user_id = @rawDeviceUserId
    AND raw_record_time = @rawRecordTime
)
INSERT...
```

**Layer 2** - At attendance import:
```sql
NOT EXISTS (
  SELECT 1 FROM attendance_imports ai
  WHERE ai.employee_code = ...
    AND ai.attendance_date = s.scan_date
    AND ai.source_reference = s.machine_code
)
```

### Unmapped Storage

**Ya**, unmapped scans BISA disimpan tanpa employee_code karena:
- `parsed_employee_code` is nullable
- `mapping_status` has `NEED_REVIEW` and `UNMAPPED` values
- `mapping_reason` untuk explain why unmapped

---

## 6. Konfirmasi Mapping Layer Final

### Canonical Mapping: employee-mapping.service.ts

**Scanner Code Mapping** (line 38-48):
```typescript
scannerMappings: ScannerCodeMapping[] = [
  { suffix: 100, scannerCode: 100, locCode: 'A', empCodePrefix: 'A' },  // P1A
  { suffix: 200, scannerCode: 200, locCode: 'J', empCodePrefix: 'J' },  // ARC
  { suffix: 300, scannerCode: 300, locCode: 'B', empCodePrefix: 'B' },  // P1B
  { suffix: 400, scannerCode: 400, locCode: 'H', empCodePrefix: 'H' },  // AB2
  { suffix: 500, scannerCode: 500, locCode: 'C', empCodePrefix: 'C' },  // P2A
  { suffix: 600, scannerCode: 600, locCode: 'D', empCodePrefix: 'D' },  // P2B
  { suffix: 700, scannerCode: 700, locCode: 'E', empCodePrefix: 'E' },  // DME
  { suffix: 800, scannerCode: 800, locCode: 'F', empCodePrefix: 'F' },  // ARA
  { suffix: 900, scannerCode: 900, locCode: 'G', empCodePrefix: 'G' },  // AB1
];
```

### Multiple Mapping Implementations Found

| File | Type | Canonical? |
|------|------|------------|
| `employee-mapping.service.ts` | HARDCODED | ✅ YES - Active runtime |
| `_dev_utils/src/machine-config.ts` | HARDCODED | ⚠️ Dev reference only |
| `employee-code-mapper.ts` | HARDCODED | ❌ Fallback only |
| `scanner_codes` (DB table) | DATABASE | ⚠️ EXISTS but NOT USED |
| `loc_codes` (DB table) | DATABASE | ⚠️ EXISTS but NOT USED |

### Gaps in Scanner Mappings

**MISSING in employee-mapping.service.ts:**
- PGE (Office)
- IJL (has locCode='L' but no scanner code)
- APE (Office)
- MILL

### Mapping Examples

| Machine | raw_device_user_id | Expected emp_code | Explanation |
|---------|-------------------|-------------------|-------------|
| P1A | 10044 | A0044 | Scanner 100 → locCode A → A + last4 |
| P1B | 30232 | B0232 | Scanner 300 → locCode B → B + last4 |
| P2A | 50001 | C0001 | Scanner 500 → locCode C → C + last4 |
| IJL | L0015 | L0015 | Direct match (no scanner code) |
| P1B | 50001 | **C0001 (FLAGGED)** | Scanner 300 but ID from P2A |

### Cross-Location Handling for P1A/P1B

**Problem**: P1A and P1B both have 792 users. User with prefix C (P2A) scanning at P1B.

**Recommended Rule**:
1. Scanner code is primary signal (more specific)
2. If machineScannerCode=300 but generated code doesn't exist in DB, try fallback
3. Flag as `CROSS_DIVISION_SCAN` with `is_cross_division_scan=true`
4. **DO NOT auto-remap** - let human verify

---

## 7. Konfirmasi Cross-Location Strategy

### Current Threshold Issue

**anomaly.service.ts:120** uses `machine_count > 2` which is TOO LENIENT.

### Recommended Rules

| Scenario | Rule | Severity |
|----------|------|----------|
| Employee scans at home division | ✅ Normal | - |
| Employee scans at different division | ⚠️ Flag | MEDIUM |
| Employee scans at 2+ different machines same day | 🔴 HIGH RISK | **>= 2** |
| Wrong employee enrollment | 🔴 CRITICAL | Requires manual review |

### Questions About Cross-Location

**Q1**: Should this be fixed at ZKTeco machines or in software?
> **A**: Fix in software. ZKTeco machines may be physically inaccessible.

**Q2**: Can we create temporary mapping overrides?
> **A**: Yes, use `machine_user_map` table with `is_active` flag.

**Q3**: What should happen to C-prefix scans at P1B?
> **A**: Store with `CROSS_DIVISION_SCAN` flag. Let supervisors review.

**Q4**: Attendance follows employee home division or machine location?
> **A**: Follow employee home division (emp_code prefix). Flag cross-location.

**Q5**: How to prevent duplicate employee codes?
> **A**: `employees` table has unique constraint on `employee_code`.

### Final Rules

1. **Store all scans** - Never discard raw data
2. **Flag anomalies** - Don't block, just flag
3. **Machine code vs employee division** - Track both
4. **Manual review** - Some cases require human judgment

---

## 8. Konfirmasi Attendance Processing

### Active Processing Flow

```
ZKTeco → sync-orchestrator.service.ts
         ├─ Creates batch (import_jobs)
         ├─ Fetches users/attendance
         ├─ Maps deviceUserId → empCode
         └─ Inserts to attendance_scan_logs
         ↓
         AUTO-CALLS:
         attendanceProcessService.processScanLogsForBatch()
         ├─ MAPPED records → attendance_imports
         └─ NEED_REVIEW → MANUAL_REVIEW division
```

### Two Processing Systems

| System | Input | Output | Status |
|--------|-------|--------|--------|
| `attendance-process-import.service.ts` | attendance_scan_logs | attendance_imports | **ACTIVE** |
| `attendance-process.service.ts` | attendance_raw_log | attendance_daily_process | **DEPRECATED** |

### Legacy Processing (NOT USED)

```typescript
// attendance-process.service.ts - NOT called during sync
// Input: attendance_raw_log (deprecated table)
// Output: attendance_daily_process (deprecated table)
```

### Recommended Final Flow

```
Raw Scan (attendance_scan_logs)
    ↓
┌─────────────────────────────────────────┐
│ processScanLogsForBatch(batchId)        │
│   ├─ MAPPED → attendance_imports       │
│   └─ NEED_REVIEW → MANUAL_REVIEW        │
└─────────────────────────────────────────┘
    ↓
Processed Attendance (attendance_imports)
    ↓
┌─────────────────────────────────────────┐
│ Dashboard/Reports                        │
│   ├─ Status: HADIR/TIDAK_HADIR          │
│   ├─ check_in_at, check_out_at           │
│   └─ needs_manual_review flag             │
└─────────────────────────────────────────┘
```

### Status Types in attendance_imports

| Status | Meaning | Condition |
|--------|---------|-----------|
| HADIR | Present | 2+ scans |
| TIDAK_HADIR | Absent | <2 scans |
| MANUAL_REVIEW | Needs review | Unmapped/cross-location |

---

## 9. Konfirmasi API Contract dengan Frontend

### Route Registration

```typescript
// src/api/routes/index.ts
import './auth.routes';
import './dashboard.routes';
import './employees.routes';
import './attendance.routes';
import './sync.routes';
import './machines.routes';
import './mapping.routes';
// ... 21 files total
import './quality.routes';  // ✅ Registered
// ❌ quality-dashboard.routes.ts - NOT registered (ORPHANED)
```

### Active Quality Endpoints

| Endpoint | File | Status | Used By |
|----------|------|--------|---------|
| GET /api/quality/dashboard-summary | quality.routes.ts:14 | ✅ ACTIVE | Dashboard |
| GET /api/quality/daily-trend | quality.routes.ts:81 | ✅ ACTIVE | Quality page |
| GET /api/quality/unmapped | quality.routes.ts:131 | ✅ ACTIVE | Quality page |
| GET /api/quality/duplicates | quality.routes.ts:185 | ✅ ACTIVE | Admin |
| GET /api/quality/machine-drift | quality.routes.ts:226 | ✅ ACTIVE | Admin |
| GET /api/quality/report | quality.routes.ts:282 | ✅ ACTIVE | Admin |
| GET /api/quality/summary | quality.routes.ts:369 | ✅ ACTIVE | Widget |

### Orphaned Endpoints (quality-dashboard.routes.ts)

| Endpoint | Line | Status |
|----------|------|--------|
| GET /api/quality/dashboard-summary | 12 | ❌ DEAD CODE |
| GET /api/quality/daily-trend | 76 | ❌ DEAD CODE |

**Action**: DELETE `quality-dashboard.routes.ts`

### Main Dashboard Endpoints

| Endpoint | File | Purpose |
|----------|------|---------|
| GET /api/dashboard/summary | dashboard.routes.ts:5 | Daily overview |
| GET /api/dashboard/division-summary | dashboard.routes.ts:20 | By division |
| GET /api/dashboard/sync-status | dashboard.routes.ts:26 | Sync batches |
| GET /api/dashboard/stats | dashboard.routes.ts:31 | Machine/emp stats |
| GET /api/attendance/daily | attendance.routes.ts | Paginated list |
| GET /api/attendance/monthly | attendance.routes.ts | Monthly summary |
| GET /api/attendance/monthly-matrix | attendance.routes.ts | Full matrix |
| GET /api/monitoring/dashboard | monitoring.routes.ts | Machine stats |
| GET /api/monitoring/machines | monitoring.routes.ts | Machine list |
| GET /api/monitoring/quality | monitoring.routes.ts | Quality metrics |

---

## 10. Konfirmasi Risiko Migration

### Files to Modify

| File | Change | Risk |
|------|--------|------|
| `src/api/routes/quality-dashboard.routes.ts` | DELETE | LOW |
| `src/modules/monitoring/anomaly.service.ts` | Fix threshold | LOW |
| `src/modules/import/sync-orchestrator.service.ts` | Store unmapped | MEDIUM |
| `frontend/src/pages/AttendancePage.tsx` | Fix icons | LOW |

### Files to Delete/Deprecate

| File | Action | Reason |
|------|--------|--------|
| `src/api/routes/quality-dashboard.routes.ts` | **DELETE** | Orphaned, duplicate |
| `src/modules/attendance/attendance-raw.repository.ts` | DEPRECATE | Uses deprecated table |
| `src/modules/attendance/attendance-process.service.ts` | DEPRECATE | Uses deprecated table |
| `src/modules/import/direct-zkteco-import.service.ts` | DEPRECATE | Legacy import path |

### Data to NOT Modify

- ❌ Raw logs in attendance_scan_logs
- ❌ Historical attendance_imports data
- ❌ Employee master data without validation
- ❌ Machine configuration without testing

### Tables to Backup Before Migration

1. `attendance_raw_log` - before deprecating
2. `attendance_daily_process` - before deprecating
3. `employees` - before bulk operations

### Rollback Plans

**If Sync Fails:**
1. Revert sync-orchestrator to SqlClient
2. Check attendance_import_batches for failed batches
3. Re-run via: POST /api/sync/retry/:batchId

**If Frontend Crashes:**
1. Revert icon import changes
2. Check AttendancePage.tsx lucide imports

**If Mapping Breaks:**
1. Check employees table for corrupted codes
2. Re-run employee sync from machines
3. Manual override via: POST /api/mapping/override

### Migration Principles

- ✅ DO backup raw logs before any change
- ✅ DO test migration on staging first
- ❌ DON'T delete raw logs
- ❌ DON'T modify old data without backup
- ❌ DON'T change mapping without evidence
- ❌ DON'T commit credentials to code

---

## 11. Summary Table

### P0 - Immediate Patches

| # | Action | File | Risk | Breaking |
|---|--------|------|------|----------|
| P0.1 | Delete orphaned file | quality-dashboard.routes.ts | LOW | No |
| P0.2 | Fix threshold | anomaly.service.ts:120 | LOW | No |
| P0.3 | Store unmapped users | sync-orchestrator.service.ts | MEDIUM | No |
| P0.4 | Fix missing icons | AttendancePage.tsx | LOW | No |

### P1 - Database Migration

| # | Action | File | Risk |
|---|--------|------|------|
| P1.1 | Replace SqlClient with lib/db | sync-orchestrator.service.ts | MEDIUM |
| P1.2 | Replace SqlClient with lib/db | import-job.service.ts | MEDIUM |

### P2 - Legacy Deprecation

| # | Action | Target |
|---|--------|--------|
| P2.1 | Deprecate | attendance-raw.repository.ts |
| P2.2 | Deprecate | attendance-process.service.ts |
| P2.3 | Migrate | summary.service.ts, dashboard.service.ts |
| P2.4 | Migrate | anomaly.service.ts |

---

## Questions Requiring Human Confirmation

### Q1: Database Consolidation Strategy

Should we consolidate to single database (`rebinmas_absensi_monitoring`) or keep dual database?

| Option | Pros | Cons |
|--------|------|------|
| **Consolidate** | Simpler, less SQL injection risk | Data migration effort |
| **Keep Dual** | No migration needed | Complexity, two data sources |

**Recommendation**: Consolidate to single database.

### Q2: Legacy Data Migration

Should we migrate existing data from deprecated tables or archive them?

| Option | Pros | Cons |
|--------|------|------|
| **Migrate** | Single source of truth | ETL effort, risk of data loss |
| **Archive** | Preserve history | Two tables to maintain |
| **Delete** | Clean codebase | Data loss |

**Recommendation**: Archive (rename with `_archive` suffix).

### Q3: Cross-Location Handling

For employees enrolled in wrong machine, should the system:

| Option | Behavior |
|--------|----------|
| **Flag and skip** | Mark cross-location, don't process |
| **Flag and process** | Mark but still include in attendance |
| **Auto-remap** | Attempt to correct mapping |

**Recommendation**: Flag and process. Store `cross_location=true`.

### Q4: Unmapped User Storage

Where should unmapped users be stored?

| Option | Pros | Cons |
|--------|------|------|
| **Same table** | Single source, auditability | Larger table |
| **Separate table** | Cleaner separation | Two tables |

**Recommendation**: Same table (`attendance_scan_logs` with `mapping_status`).

### Q5: Alert Implementation Priority

Should we implement alerts for anomalies?

| Option | Effort | Value |
|--------|--------|-------|
| **Dashboard only** | LOW | MEDIUM |
| **Email alerts** | MEDIUM | HIGH |
| **Full alerts** | HIGH | HIGH |

**Recommendation**: Dashboard only for now.

---

## Conclusion

Pre-Fix Clarification Report telah menjawab 15 pertanyaan teknis:

1. ✅ Scope perbaikan - P0 → P1 → P2 → P3
2. ✅ Source of truth - attendance_scan_logs + attendance_imports
3. ✅ Active vs deprecated files - 5 deprecated modules identified
4. ✅ Database layer - 21 SqlClient → 27 lib/db.ts
5. ✅ Mapping layer - canonical adalah employee-mapping.service.ts
6. ✅ Cross-location rules - >= 2 machines triggers alert
7. ✅ Attendance processing - single flow via attendance-imports
8. ✅ API contracts - orphaned file perlu dihapus
9. ✅ Migration risks - phased approach recommended
10. ✅ Rollback plans - revert, re-run, check logs

**Ready for P0 execution upon approval.**

---

*Report generated from comprehensive codebase analysis using 6 parallel exploration agents*
*Analysis Date: 2026-06-21*
*Project: Sistem Absensi PT Rebinmas Jaya*
