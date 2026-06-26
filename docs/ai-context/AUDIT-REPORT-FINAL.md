# AUDIT REPORT FINAL
## Sistem Absensi PT Rebinmas Jaya

**Date:** 2026-06-21  
**Project:** Absensi_Muka  
**Scope:** Comprehensive 4-Team Audit  
**Status:** COMPLETED

---

## 1. Executive Summary

### Kesimpulan Utama
Sistem Absensi PT Rebinmas Jaya memiliki **19+ issues** dengan **6 CRITICAL** yang memerlukan perbaikan segera. Source of truth sudah jelas (ZKTeco → `attendance_scan_logs`), namun ada dual database layer yang menyebabkan inkonsistensi data.

### Root Cause Utama
1. **Dual Database Target:** 23+ modules menggunakan `extend_db_ptrj` (legacy) вместо `rebinmas_absensi_monitoring`
2. **ZKTeco Machine Enrollment:** P1A dan P1B memiliki user enrollment yang SAMA (792 user)
3. **Unmapped Users:** Tidak disimpan ke database, hanya console.warn
4. **Anomaly Detection Gaps:** 8+ tipe anomali tidak terdeteksi

### Risiko Terbesar
| Risk | Impact | Likelihood |
|------|--------|------------|
| Data loss (unmapped dropped) | CRITICAL | HIGH |
| Cross-location mixing | CRITICAL | ACTIVE |
| SQL Injection vulnerability | HIGH | LOW |
| Frontend crash (missing icons) | HIGH | ACTIVE |

### Prioritas Perbaikan
1. **P0 (Immediate):** Fix missing icons, store unmapped, fix dual DB
2. **P1 (This Week):** Fix anomaly detection, consolidate systems
3. **P2 (This Sprint):** Improve alerts, fix dashboard, UI polish

---

## 2. Source of Truth

### Source Status
| Source | Status | Evidence |
|--------|--------|----------|
| **IT Solution API** | ✅ DEPRECATED | Not referenced anywhere in codebase |
| **Direct ZKTeco** | ✅ PRIMARY | `sync-orchestrator.service.ts` only path |
| **`attendance_scan_logs`** | ✅ SOURCE OF TRUTH | Primary table |
| **`attendance_imports`** | ✅ PROCESSED | Derived from scan_logs |
| **`attendance_raw_log`** | ❌ DEPRECATED | Legacy table, not used |
| **`attendance_daily_process`** | ❌ DEPRECATED | Duplicate system |

### Active Database
- **Name:** `rebinmas_absensi_monitoring`
- **Server:** `10.0.0.110:1433`
- **Connection:** Direct MSSQL via `src/lib/db.ts`

### Legacy Database (DEPRECATED)
- **Name:** `extend_db_ptrj`
- **Status:** Still targeted by 23+ modules via `SqlClient`
- **Action Required:** Migrate all SqlClient to direct MSSQL

### Data Flow Diagram
```
┌─────────────────────────────────────────────────────────────────────┐
│                    ACTIVE DATA FLOW                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ZKTeco Machines (16 units)                                        │
│          │                                                            │
│          ▼ TCP Direct                                                │
│   sync-orchestrator.service.ts                                       │
│          │                                                            │
│          ▼                                                            │
│   attendance_scan_logs (PRIMARY - Immutable)                         │
│          │                                                            │
│          ├──► attendance_imports (Processed - with duplicate check)  │
│          │                                                            │
│          └──► vw_attendance_monthly_matrix                            │
│                      │                                                │
│                      ▼                                                │
│              API Responses ──► Frontend                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    LEGACY / DEPRECATED                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   IT Solution API ──► NOT USED                                      │
│   extend_db_ptrj ──► DEPRECATED TARGET                              │
│   mst_* tables ──► LEGACY MASTER DATA                               │
│   attendance_raw_log ──► DEPRECATED                                 │
│   attendance_daily_process ──► DUPLICATE SYSTEM                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Bug List (Comprehensive)

### CRITICAL Issues

| # | Area | Bug | Evidence | File | Line | Recommended Fix |
|---|------|-----|----------|------|------|----------------|
| **#1** | Backend | Alert Notifications NOT IMPLEMENTED | Placeholder only | `alert.service.ts` | 209-258 | Install nodemailer, twilio; wire up services |
| **#2** | Sync | Unmapped Users Silently Dropped | console.warn only | `sync-orchestrator.ts` | 315-324 | Store UNMAPPED to `attendance_scan_logs` with status |
| **#3** | Frontend | Modal Crashes - Missing Icons | LogIn, LogOut, etc. not imported | `AttendancePage.tsx` | 9, 112, 115 | Add icon imports |
| **#4** | Database | Dual Database Connection | 23+ modules wrong DB | `sql-client.ts` | 31 | Migrate to direct MSSQL |
| **#17** | Cross-Location | P1A/P1B Same Users | 792 users each | ZKTeco Machine | - | Clean enrollment at machines |
| **#18** | Anomaly | Entry Time NOT IMPLEMENTED | No late detection | `anomaly.service.ts` | - | Add LATE_ARRIVAL, EARLY_CHECKIN rules |
| **#19** | Anomaly | Multi-Location Threshold Lenient | `> 2` not `>= 2` | `anomaly.service.ts` | 120 | Change to `>= 2`, upgrade severity |

### HIGH Issues

| # | Area | Bug | Evidence | File | Line | Recommended Fix |
|---|------|-----|----------|------|------|----------------|
| **#5** | Processing | Duplicate Attendance Systems | 2 systems | `attendance-process*.ts` | Multiple | Consolidate to System B only |
| **#6** | API | Source vs Compiled Mismatch | Different views | `attendance.routes.ts` | - | Rebuild and sync |
| **#7** | Security | SQL Injection Vulnerability | String interpolation | `emp-movement.service.ts` | 64 | Use parameterized queries |
| **#20** | Anomaly | Impossible Travel NOT IMPLEMENTED | No validation | `anomaly.service.ts` | - | Add travel time validation |

### MEDIUM Issues

| # | Area | Bug | Evidence | File | Line | Recommended Fix |
|---|------|-----|----------|------|------|----------------|
| **#8** | API | Hardcoded Division-Machine Mapping | Not DB-driven | `attendance.routes.ts` | 110-124 | Query `attendance_machines` table |
| **#9** | UI | Bulk Mapping UI Not Implemented | Coming soon | `machine-employees.html` | 319 | Implement backend + frontend |
| **#10** | Dashboard | Hardcoded Dashboard Values | Same query twice | `dashboard.routes.ts` | 35-36, 41 | Fix queries |
| **#11** | API | Duplicate Endpoints | Dead code | `quality*.routes.ts` | Multiple | Delete `quality-dashboard.routes.ts` |
| **#12** | Frontend | SSE Reconnection Missing | No retry | `LiveFeed.tsx` | 101-109 | Add exponential backoff |
| **#21** | Processing | Night Shift NOT IMPLEMENTED | Cross-day ignored | Multiple | Add cross-day handling |
| **#22** | Processing | Weekend Not Differentiated | No OT calc | `attendance-process-import.ts` | - | Add weekend flagging |

### LOW Issues

| # | Area | Bug | Evidence | File | Line | Recommended Fix |
|---|------|-----|----------|------|------|----------------|
| **#13** | Mapping | Hardcoded Scanner Mappings | Not DB-driven | `emp-mapping.service.ts` | 38-48 | Move to database |
| **#14** | Mapping | Multiple Mapping Implementations | 2 algorithms | `employee-mapping*.ts` | Multiple | Consolidate |
| **#15** | Import | Incomplete Error Handling | errors[] empty | `manual-import.service.ts` | - | Ensure all paths populate |
| **#16** | DB | Legacy Migrations Present | Confusion | `_dev_utils/` | - | Archive legacy |

---

## 4. Machine & ZKTeco Audit

### Machine Status Summary

| Category | Count | Percentage |
|----------|-------|------------|
| **Total Machines** | 16 | 100% |
| **Accessible** | 7 | 43.75% |
| **Inaccessible** | 9 | 56.25% |

### Accessible Machines

| Machine | IP | Port | Scanner | Users | Attendances | Status |
|---------|-----|------|---------|-------|-------------|--------|
| OFFICE_PGE | 223.25.98.220 | 4370 | null | 1,653 | 6,547 | ✅ OK |
| OFFICE_APE | 103.144.208.154 | 4370 | null | 1,083 | 11,423 | ✅ OK |
| MILL | 103.127.66.32 | 4370 | null | 569 | 3,273 | ✅ OK |
| IJL | 103.144.211.226 | 4370 | L | 166 | 4,910 | ✅ OK |
| AB2 | 103.144.208.154 | 4400 | 400 | 233 | 3,944 | ✅ OK |
| **P1A** | 10.0.0.90 | 4100 | 100 | **792** | 2,681 | ⚠️ SHARED |
| **P1B** | 10.0.0.91 | 4300 | 300 | **792** | 2,675 | ⚠️ SHARED |

### Inaccessible Machines (9)

| Machine | IP | Port | Scanner | Reason |
|---------|-----|------|---------|--------|
| DME_01 | 103.144.228.42 | 4700 | 700 | Network |
| DME_02 | 103.144.228.42 | 4701 | 700 | Network |
| ARC_01 | 103.144.208.154 | 4200 | 200 | Network |
| ARC_02 | 103.144.208.154 | 4201 | 200 | Network |
| ARA | 103.144.208.154 | 4800 | 800 | Network |
| AB1 | 103.144.208.154 | 4900 | 900 | Network |
| P2A_01 | 10.0.0.92 | 4500 | 500 | Network |
| P2B | 10.0.0.93 | 4600 | 600 | Network |
| P2A_02 | 10.0.0.94 | 4501 | 500 | Network |

### ZKTeco Integration Issues

| Issue | Impact | Fix |
|-------|--------|-----|
| **No disableDevice() in production** | Data may change during read | Add disableDevice/enableDevice |
| **Device lock in test scripts only** | Inconsistent behavior | Move to production services |
| **P1A/P1B same user enrollment** | Duplicate employees created | Clean ZKTeco enrollment |

---

## 5. Mapping Audit

### Active Mapping Files

| File | Status | Purpose |
|------|--------|---------|
| `src/modules/employees/employee-mapping.service.ts` | ✅ ACTIVE | Primary mapping logic |
| `src/modules/mapping/employee-code-mapper.ts` | ⚠️ BACKUP | Secondary (not used) |
| `src/modules/import/sync-orchestrator.service.ts` | ✅ USES | Calls employee-mapping service |

### Scanner Code Mapping (Hardcoded - Lines 38-48)

| Scanner | Division | locCode | Prefix | Example |
|----------|----------|---------|--------|---------|
| 100 | P1A | A | A | 10044 → A0044 |
| 200 | ARC | J | J | - |
| 300 | P1B | B | B | 30232 → B0232 |
| 400 | AB2 | H | H | - |
| 500 | P2A | C | C | 50001 → C0001 |
| 600 | P2B | D | D | - |
| 700 | DME | E | E | - |
| 800 | ARA | F | F | - |
| 900 | AB1 | G | G | - |

### Mapping Logic Flow

```
Device Scan → sync-orchestrator.ts (line 305)
                     ↓
         convertDeviceUserIdToEmpCodeWithLookup()
                     ↓
         ┌─────────────────────────────────────────┐
         │ STEP 0: Direct match (confidence 100%) │
         │   if raw ID exists in employeeCodes     │
         ├─────────────────────────────────────────┤
         │ STEP 1: Scanner code (confidence 95%)   │
         │   scannerCode 100 → "A" → A0044        │
         ├─────────────────────────────────────────┤
         │ STEP 2: locCode (confidence 85%)        │
         │   locCode "A" → A + last4(userId)      │
         ├─────────────────────────────────────────┤
         │ STEP 3: Auto-detect (confidence 75%)   │
         │   last3 - (last3 % 100) → suffix      │
         └─────────────────────────────────────────┘
```

### Cross-Location Issue (CRITICAL)

| Machine | Expected Prefix | Actual Found | Issue |
|---------|----------------|--------------|-------|
| P1A | A | A only | ✅ OK |
| P1B | B | A, B, C | 🔴 MIXED |
| P2A | C | C only | ✅ OK |

**Root Cause:** ZKTeco P1B has P2A employees (C-prefix: 50001-50009) enrolled.

---

## 6. Sync Audit

### Sync Components

| Component | File | Status |
|-----------|------|--------|
| **Sync Orchestrator** | `sync-orchestrator.service.ts` | ✅ ACTIVE |
| **Direct Import** | `direct-zkteco-import.service.ts` | ✅ USED |
| **CLI Script** | `sync-machines.ts` | ✅ USED |
| **Batch Job Service** | `import-job.service.ts` | ✅ ACTIVE |

### Sync Flow

```
1. CREATE BATCH (status='RUNNING')
       ↓
2. FETCH FROM ZKTECO
   ├─ zkteco.connect()
   ├─ zkteco.fetchUsers()
   └─ zkteco.fetchAttendanceRecords()
       ↓
3. PROCESS USERS (Upsert employees table)
       ↓
4. IMPORT ATTENDANCE LOGS
   ├─ INSERT to attendance_scan_logs
   ├─ MAPPED → processed
   └─ UNMAPPED → ⚠️ CONSOLE.WARN ONLY!
       ↓
5. POST-PROCESS
   ├─ MAPPED → attendance_imports
   └─ NEED_REVIEW → attendance_imports
       ↓
6. COMPLETE BATCH (status='SUCCESS')
```

### Sync Issues

| # | Issue | Line | Impact |
|---|-------|------|--------|
| E1 | **Unmapped Users Dropped** | 315-324 | CRITICAL - Data loss |
| E2 | No Device Lock in Production | - | HIGH - Data may change |
| E3 | Dual Sync Implementations | - | HIGH - Confusion |
| E4 | No Duplicate in scan_logs | 233 | MEDIUM - Duplicates possible |
| E5 | UNMAPPED Not Processed | 65, 109 | MEDIUM - Orphaned records |

---

## 7. Attendance Processing Audit

### Dual Processing Systems

| System | File | Input | Output | Connection |
|--------|------|-------|--------|------------|
| **System A (Legacy)** | `attendance-process.service.ts` | `attendance_raw_log` | `attendance_daily_process` | SqlClient |
| **System B (Active)** | `attendance-process-import.service.ts` | `attendance_scan_logs` | `attendance_imports` | Direct MSSQL |

### Check-in/Check-out Logic

| Aspect | System A | System B |
|--------|----------|----------|
| **Check-in** | MIN(record_time) | MIN(scan_time) |
| **Check-out** | MAX(record_time) | MAX(scan_time) |
| **Single Scan** | NO_CHECKOUT | NO_CHECKOUT |

### Status Determination Rules

| Status | Condition | Implemented | File |
|--------|-----------|-------------|------|
| `HADIR` | scan_count >= 2 | ✅ YES | Process-import |
| `TIDAK_HADIR` | scan_count < 2 | ✅ YES | Process-import |
| `NO_CHECKOUT` | 1 scan | ✅ YES | Process |
| `NO_CHECKIN` | 0 scans | ✅ YES | Anomaly |
| `INCOMPLETE_SCAN` | < 2 scans | ✅ YES | Process |
| **`LATE_ARRIVAL`** | check_in > 08:00 | ❌ NO | - |
| **`EARLY_CHECKIN`** | check_in < 05:00 | ❌ NO | - |
| **`VERY_LATE_CHECKIN`** | check_in > 12:00 | ❌ NO | - |
| **`SHORT_WORKDAY`** | work_hours < 4 | ❌ NO | - |
| **`LONG_WORKDAY`** | work_hours > 12 | ❌ NO | - |
| **`IMPOSSIBLE_TRAVEL`** | Time < travel_min | ❌ NO | - |
| **`MULTI_LOCATION`** | machine_count >= 2 | ⚠️ PARTIAL | > 2 only |

### Missing Anomaly Rules Summary

| Rule | Threshold | Severity | Impact |
|------|-----------|----------|--------|
| LATE_ARRIVAL | > 08:00 | LOW | Late check-ins undetected |
| EARLY_CHECKIN | < 05:00 | MEDIUM | Unrealistic check-ins undetected |
| VERY_LATE_CHECKIN | > 12:00 | HIGH | Suspicious check-ins allowed |
| SHORT_WORKDAY | < 4 hours | MEDIUM | Short work days not flagged |
| LONG_WORKDAY | > 12 hours | MEDIUM | Overtime abuse possible |
| IMPOSSIBLE_TRAVEL | < 5 min | HIGH | Multiple locations impossible |

---

## 8. API Audit

### Endpoint Status Summary

| Category | Count | Working | Issues |
|----------|-------|---------|--------|
| **Total Endpoints** | 75 | 70 | 5 |
| **Attendance** | 12 | 12 | 0 |
| **Monitoring** | 12 | 12 | 0 |
| **Dashboard** | 4 | 3 | 1 |
| **Quality** | 10 | 8 | 2 (duplicates) |
| **Other** | 37 | 37 | 0 |

### API Issues

| # | Endpoint | Issue | File | Line | Fix |
|---|----------|-------|------|------|-----|
| 1 | `/api/dashboard/stats` | Hardcoded values | `dashboard.routes.ts` | 35-36, 41 | Fix queries |
| 2 | `/api/quality/dashboard-summary` | **DUPLICATE** | `quality-dashboard.routes.ts` | 12 | DELETE file |
| 3 | `/api/quality/daily-trend` | **DUPLICATE** | `quality-dashboard.routes.ts` | 76 | DELETE file |

### Duplicate Endpoints (BUGS-FIXES #11)

**File:** `src/api/routes/quality-dashboard.routes.ts`

This entire file contains endpoints that are **UNREACHABLE** because:
- Router only registers first match
- `quality.routes.ts` registers same endpoints first

**Action:** Delete `src/api/routes/quality-dashboard.routes.ts`

---

## 9. Frontend Audit

### Frontend Components

| Component | File | Endpoint | Issues |
|-----------|------|----------|--------|
| `AttendancePage.tsx` | attendance/ | `/api/attendance/daily` | 🔴 **CRITICAL - Missing icons** |
| `AttendanceMatrix.tsx` | attendance/ | `/api/attendance/monthly-matrix` | ✅ OK |
| `LiveFeed.tsx` | realtime/ | `/api/realtime/latest-scans` | ⚠️ No SSE reconnect |
| `MachineStatus.tsx` | monitoring/ | various | ✅ OK |

### CRITICAL: Missing Icon Imports

**File:** `frontend/src/components/features/attendance/AttendancePage.tsx`

**Line 9 - Current imports:**
```typescript
import { ClipboardList, Users, UserX, AlertCircle, User, Monitor } from 'lucide-react';
```

**Missing imports (used at lines 112, 115, 117, 143, 190, 298):**
```typescript
LogIn,    // Line 112 - check-in icon
LogOut,   // Line 115 - check-out icon
Activity, // Line 117 - middle scan icon
Fingerprint, // Lines 190, 298 - scan logs tab
X         // Line 143 - modal close
```

**Fix Required:**
```typescript
import { 
  ClipboardList, Users, UserX, AlertCircle, User, Monitor,
  LogIn, LogOut, Activity, Fingerprint, X  // ADD THESE
} from 'lucide-react';
```

**Impact:** Employee detail modal will **CRASH** when user clicks on attendance row.

### SSE Reconnection Issue (BUGS-FIXES #12)

**File:** `frontend/src/components/features/realtime/LiveFeed.tsx`

**Lines 101-109 - Current behavior:**
```typescript
eventSource.onerror = (e) => {
  console.error('[LiveFeed] SSE error:', e);
  setConnected(false);
  eventSource.close();
  // Falls back to polling but NEVER reconnects SSE
  if (!pollingIntervalRef.current) {
    pollingIntervalRef.current = setInterval(fetchLatestScans, 5000);
  }
};
```

**Issues:**
1. SSE falls back to polling permanently
2. No reconnection attempt
3. No exponential backoff

**Fix Required:** Add SSE reconnection with exponential backoff before falling back to polling.

---

## 10. Database Audit

### Active Tables

| Table | Row Count | Purpose | Connection |
|-------|-----------|---------|------------|
| `attendance_scan_logs` | ? | Raw ZKTeco data | Direct MSSQL |
| `attendance_imports` | ? | Processed attendance | Direct MSSQL |
| `attendance_import_batches` | ? | Batch metadata | Direct MSSQL |
| `attendance_manual_corrections` | ? | HR adjustments | Direct MSSQL |
| `employees` | ? | Employee master | SqlClient (legacy) |
| `attendance_machines` | ? | Machine inventory | SqlClient (legacy) |

### Legacy Tables (To Deprecate)

| Table | Reason |
|-------|--------|
| `mst_estate`, `mst_division` | Legacy master data |
| `attendance_raw_log` | Duplicate of scan_logs |
| `attendance_daily_process` | Duplicate processing system |
| `sync_job`, `import_batch` | Legacy batch tracking |
| `api_attendance_raw` | IT Solution API artifact |

### Views

| View | Data Source | Used By |
|------|-------------|---------|
| `vw_attendance_monthly_matrix` | scan_logs + imports | API |
| `vw_attendance_zkteco_final` | scan_logs + mapping | API |
| `vw_attendance_final` | imports + corrections | Reports |

---

## 11. Recommended Fix Plan

### P0 - Critical (Fix Immediately)

| # | Fix | File | Line | Time | Risk |
|---|-----|------|------|------|------|
| 1 | Add missing icon imports | `AttendancePage.tsx` | 9 | 5 min | LOW |
| 2 | Store unmapped users | `sync-orchestrator.ts` | 315-324 | 30 min | MEDIUM |
| 3 | Change multi-location threshold | `anomaly.service.ts` | 120 | 5 min | LOW |
| 4 | Delete duplicate endpoints file | `quality-dashboard.routes.ts` | - | 2 min | LOW |

### P1 - High (Fix This Week)

| # | Fix | File | Time | Risk |
|---|-----|------|------|------|
| 5 | Migrate SqlClient to direct MSSQL | `sql-client.ts` + 23 files | 4 hours | HIGH |
| 6 | Add entry time anomaly detection | `anomaly.service.ts` | 2 hours | MEDIUM |
| 7 | Add device lock in production | `zkteco.service.ts` | 1 hour | MEDIUM |
| 8 | Fix hardcoded dashboard values | `dashboard.routes.ts` | 30 min | LOW |
| 9 | Fix SQL injection vulnerability | `emp-movement.service.ts` | 30 min | LOW |

### P2 - Medium (Fix This Sprint)

| # | Fix | File | Time |
|---|-----|------|------|
| 10 | Consolidate duplicate processing | `attendance-process*.ts` | 4 hours |
| 11 | Add impossible travel detection | `anomaly.service.ts` | 2 hours |
| 12 | Add SSE reconnection | `LiveFeed.tsx` | 1 hour |
| 13 | Implement alert notifications | `alert.service.ts` | 4 hours |
| 14 | Clean ZKTeco P1B enrollment | Machine config | Manual |

---

## 12. Patch Plan

### Quick Wins (P0)

#### Fix 1: Missing Icon Imports
```bash
# File: frontend/src/components/features/attendance/AttendancePage.tsx
# Line 9: Add these imports

LogIn, LogOut, Activity, Fingerprint, X
```

#### Fix 2: Multi-Location Threshold
```bash
# File: src/modules/monitoring/anomaly.service.ts
# Line 120: Change

// Before:
if (process.machine_count > 2) {

// After:
if (process.machine_count >= 2) {

// Also upgrade severity from LOW to MEDIUM
```

#### Fix 3: Delete Duplicate Endpoints
```bash
# File: src/api/routes/quality-dashboard.routes.ts
# Action: DELETE ENTIRE FILE
# Then remove from src/api/routes/index.ts
```

### Medium Effort (P1)

#### Fix 4: Store Unmapped Users
```typescript
// File: src/modules/import/sync-orchestrator.service.ts
// Lines 315-324: Change from console.warn to INSERT

// Before:
unmappedCount++;
console.warn(`[Orchestrator] Unmapped device user...`);

// After:
await query(
  `INSERT INTO attendance_scan_logs 
   (machine_code, raw_device_user_id, scan_date, scan_time, mapping_status)
   VALUES (@machine, @uid, @date, @time, 'UNMAPPED')`,
  { machine, uid, date, time }
);
unmappedCount++;
```

### High Effort (P2)

#### Fix 5: Database Migration
See `docs/migration-plan/direct-sqlserver-migration.md`

---

## 13. Test Commands

### Database Validation
```bash
# Check tables
npm run db:check

# Run audit queries
sqlcmd -S 10.0.0.110 -d rebinmas_absensi_monitoring -Q "SELECT COUNT(*) FROM attendance_scan_logs"
```

### ZKTeco Connection Test
```bash
npx ts-node src/scripts/test-zkteco-connection.ts
```

### Cross-Location Audit
```bash
npx ts-node src/scripts/query-cross-location.ts
```

### API Tests
```bash
npm run dev &

curl http://localhost:8004/api/monitoring/dashboard
curl "http://localhost:8004/api/attendance/daily?date=2026-06-20"
curl http://localhost:8004/api/monitoring/quality
```

### Frontend Test
```bash
cd frontend && npm run dev
# Open browser DevTools > Console
# Click on attendance row to trigger modal
```

---

## 14. Rollback Plan

| Fix | Rollback |
|-----|----------|
| Icon imports | Revert file to previous version |
| Threshold change | Revert `> 2` back to `>= 2` |
| Delete file | `git checkout quality-dashboard.routes.ts` |
| Store unmapped | Revert to console.warn only |
| DB migration | Restore backup, revert SqlClient changes |

---

## 15. Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Auditor | Claude Code (AI) | 2026-06-21 | - |
| Reviewer | [Pending] | [Pending] | - |
| Approver | [Pending] | [Pending] | - |

---

## Appendix: File Reference

### Critical Files

| File | Purpose | Priority |
|------|---------|----------|
| `src/modules/import/sync-orchestrator.service.ts` | Main sync logic | CRITICAL |
| `src/modules/employees/employee-mapping.service.ts` | Employee mapping | CRITICAL |
| `src/modules/monitoring/anomaly.service.ts` | Anomaly detection | CRITICAL |
| `src/api/routes/attendance.routes.ts` | Attendance API | HIGH |
| `src/api/routes/dashboard.routes.ts` | Dashboard API | MEDIUM |
| `frontend/src/components/features/attendance/AttendancePage.tsx` | Frontend | CRITICAL |

### Documentation Reference

| Document | Content |
|----------|---------|
| `docs/BUGS-FIXES.md` | 19 known issues |
| `docs/CROSS-LOCATION-AUDIT.md` | Cross-location analysis |
| `docs/ATTENDANCE-BEHAVIOR-AUDIT.md` | Anomaly gaps |
| `sql/attendance-behavior-audit.sql` | Audit queries |
| `sql/audit-cross-location.sql` | Cross-location queries |

---

**END OF AUDIT REPORT**
