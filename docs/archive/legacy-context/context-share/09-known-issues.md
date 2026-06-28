# Known Issues - Critical Bugs

Generated: 2026-06-21  
Severity: CRITICAL (4) | HIGH (3) | MEDIUM (5) | LOW (4)

---

## 🔴 CRITICAL ISSUES

### [#1] Alert Notifications NOT IMPLEMENTED
**File:** `src/modules/monitoring/alert.service.ts`  
**Lines:** 209-258

**Problem:**
- Email notification: Only `console.log`
- SMS notification: Only `console.log`
- Webhook notification: Only `console.log`
- Dashboard: ✅ WORKING via SSE

**Impact:** Users cannot receive alert notifications

**Fix Required:**
1. Install: `npm install nodemailer twilio`
2. Create: `src/services/notification/email.service.ts`
3. Create: `src/services/notification/sms.service.ts`
4. Wire up in `alert.service.ts`

---

### [#2] Unmapped Users Silently DROPPED
**File:** `src/modules/import/sync-orchestrator.service.ts`  
**Lines:** 315-324

**Problem:**
```typescript
if (empCode) {
  await this.importAttendanceLog(...);
} else {
  // Only console.warn - NOT stored!
  unmappedCount++;
}
```

**Impact:** Cannot analyze why mapping failed, data loss

**Fix Required:** Write to `attendance_scan_logs` with status 'UNMAPPED'

---

### [#3] Frontend Modal CRASH
**File:** `frontend/src/components/features/attendance/AttendancePage.tsx`

**Problem:**
```typescript
// Used but NOT imported:
LogIn, LogOut, Activity, Fingerprint, X
```

**Impact:** Employee detail modal crashes on open

**Fix Required:** Add import statement

---

### [#4] Dual Database Inconsistency
**Files:** Multiple

**Problem:**
- 23+ modules use `SqlClient` → `extend_db_ptrj` (LEGACY)
- Migrations target `rebinmas_absensi_monitoring` (NEW)
- Data inconsistency

**Fix Required:** Migrate to single database target

---

## 🟠 HIGH ISSUES

### [#5] Duplicate Attendance Processing
**Files:**
- `src/modules/attendance/attendance-process.service.ts`
- `src/modules/attendance/attendance-process-import.service.ts`

**Problem:** Two separate implementations with different data flows

**Fix:** Choose one system, deprecate other

---

### [#6] Source vs Compiled Mismatch
**File:** `src/api/routes/attendance.routes.ts` vs `dist/`

**Problem:** Source uses different query than compiled code

**Fix:** Rebuild and sync

---

### [#7] SQL Injection Vulnerability
**File:** `src/modules/employees/employee-movement.service.ts:64`

**Problem:**
```typescript
`employee_id = ${employeeId}`  // String interpolation!
```

**Fix:** Use parameterized queries

---

## 🟡 MEDIUM ISSUES

### [#8] Hardcoded Division Mapping
**File:** `src/api/routes/attendance.routes.ts:110-124`

### [#9] Bulk Mapping Not Implemented
**File:** `src/public/machine-employees.html:319`

### [#10] Hardcoded Dashboard Values
**File:** `src/api/routes/dashboard.routes.ts:43-44`

### [#11] Duplicate API Endpoints
**File:** `quality.routes.ts` vs `quality-dashboard.routes.ts`

### [#12] SSE No Reconnection
**File:** `frontend/src/components/features/realtime/LiveFeed.tsx`

---

## 🟢 LOW ISSUES

### [#13] Hardcoded Scanner Mappings
### [#14] Multiple Mapping Implementations
### [#15] Incomplete Error Handling
### [#16] Legacy Migrations Present

---

## Quick Fix Checklist

```bash
# Issue #3: Missing icons
# Add to AttendancePage.tsx:
import { LogIn, LogOut, Activity, Fingerprint, X } from 'lucide-react';

# Issue #1: Install notification deps
npm install nodemailer twilio

# Issue #7: Audit SQL queries
grep -rn "\${" src/modules/employees/
```

---

## Priority Order

1. Issue #3 (quick fix)
2. Issue #2 (data integrity)
3. Issue #1 (notifications)
4. Issue #7 (security)
5. Issue #5 (maintenance)
