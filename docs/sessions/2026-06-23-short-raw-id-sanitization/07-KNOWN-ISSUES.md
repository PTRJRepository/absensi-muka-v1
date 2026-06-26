# Known Issues & Bugs

## Ringkasan Severity

| Severity | Count | Arti |
|----------|-------|------|
| CRITICAL | 5 | Patch segera diperlukan |
| HIGH | 4 | High priority, affects correctness |
| MEDIUM | 6 | Should fix, affects UX |
| LOW | 3 | Nice to have |
| DONE | 1 | Already fixed |

---

## CRITICAL Issues

### 1. Alert Notifications — PLACEHOLDER ONLY

**File**: `src/modules/monitoring/alert.service.ts` (line 209-258)
**Severity**: CRITICAL
**Status**: NOT IMPLEMENTED

Email, SMS, dan webhook notifications semuanya di-comment out.

```typescript
// Line 209-224 — sendEmail()
await emailService.send({...});  // COMMENTED OUT

// Line 229-241 — sendSMS()
await smsService.send({...});    // COMMENTED OUT

// Line 246-258 — sendWebhook()
await fetch(rule.webhookUrl, {...});  // COMMENTED OUT
```

**Impact**: Alert hanya muncul di dashboard SSE, tidak dikirim via email/SMS/webhook.
**Fix**: Install nodemailer, twilio, buat service implementations, uncomment calls.

---

### 2. Unmapped Users Silently Dropped

**File**: `src/modules/import/sync-orchestrator.service.ts` (line 315-324)
**Severity**: CRITICAL
**Status**: KNOWN ISSUE

```typescript
if (empCode) {
  await this.importAttendanceLog(batchId, machine, att, empCode.empCode);
} else {
  // Only console.warn — NOT stored anywhere!
  unmappedCount++;
  console.warn(`[Orchestrator] Unmapped device user...`);
}
```

**Impact**: Unmapped attendance records completely lost — cannot analyze failures.
**Fix**: Write unmapped records to `attendance_scan_logs` with status 'UNMAPPED'.

---

### 3. Dual Database Connection Inconsistency

**Severity**: CRITICAL
**Status**: KNOWN ISSUE

23+ modules use `SqlClient` → `extend_db_ptrj` (LEGACY)
40+ scripts use direct `mssql` → `rebinmas_absensi_monitoring` (NEW)

**Impact**: Data inconsistency between systems.
**Fix**: Migrate all modules to direct MSSQL, point SqlClient to rebinmas_absensi_monitoring.

---

### 4. Entry Time Anomaly Detection — NOT IMPLEMENTED

**File**: `src/modules/monitoring/anomaly.service.ts`
**Severity**: CRITICAL
**Status**: NOT IMPLEMENTED

Tidak ada deteksi untuk:
- Jam masuk < 05:00 (terlalu pagi)
- Jam masuk > 08:00 (terlambat)
- Jam masuk > 12:00 (sangat terlambat)
- Work day < 4 hours
- Work day > 12 hours

**Impact**: Karyawan bisa check-in siang-siang tanpa terdeteksi.

---

### 5. Multi-Location Threshold Too Lenient

**File**: `src/modules/monitoring/anomaly.service.ts` (line ~100)
**Severity**: CRITICAL
**Status**: KNOWN ISSUE

```typescript
// Current (too lenient):
if (process.machine_count > 2) {  // Only flags 3+ machines!
```

**Should be**: `>= 2` to flag 2+ machines.

---

## HIGH Issues

### 6. Duplicate Attendance Processing Systems

**Files**:
- `attendance-process.service.ts` (System A — SqlClient → extend_db_ptrj)
- `attendance-process-import.service.ts` (System B — Direct MSSQL → rebinmas)

**Impact**: Confusing codebase, maintenance burden.
**Fix**: Choose one system, deprecate the other.

---

### 7. SQL Injection Vulnerability

**File**: `src/modules/employees/employee-movement.service.ts` (line 64)
**Severity**: HIGH
**Status**: VULNERABLE

```typescript
// VULNERABLE:
`employee_id = ${employeeId}
AND effective_start <= '${this.formatDate(workDate)}'`
```

**Fix**: Use parameterized queries:
```typescript
await db.query(
  `SELECT * FROM employee_work_history
   WHERE employee_id = @employeeId AND effective_start <= @workDate`,
  { employeeId, workDate: this.formatDate(workDate) }
);
```

---

### 8. Source vs Compiled Code Mismatch

**Files**: `src/api/routes/attendance.routes.ts` vs `dist/api/routes/attendance.routes.js`
**Severity**: HIGH

Source code uses direct SQL on `attendance_scan_logs`.
Compiled code uses `vw_attendance_zkteco_final` view.

**Fix**: Rebuild `npm run build`, verify behavior.

---

### 9. Impossible Travel Detection — NOT IMPLEMENTED

**File**: `src/modules/monitoring/anomaly.service.ts`
**Severity**: HIGH

Tidak ada validasi waktu perjalanan antar mesin.
Contoh: Karyawan scan di P1A jam 08:00, kemudian scan di P1B jam 08:15.

---

## MEDIUM Issues

### 10. Bulk Mapping UI — NOT IMPLEMENTED

**Files**: `src/public/machine-employees.html`, `src/public/machine-compare.html`
**Severity**: MEDIUM

Bulk mapping promised but only shows alert.

---

### 11. Hardcoded Division-to-Machine Mapping

**File**: `src/api/routes/attendance.routes.ts` (line 110-124)
**Severity**: MEDIUM

```typescript
const divToMachine: Record<string, string[]> = {
  'P1A': ['P1A'],
  'P2A': ['P2A_01', 'P2A_02', 'P2A'],  // Hardcoded!
};
```

**Fix**: Query `attendance_machines` table dynamically.

---

### 12. Duplicate API Endpoints

**Files**: `quality.routes.ts` and `quality-dashboard.routes.ts`
**Severity**: MEDIUM

Router only registers first match — second file is dead code.

---

### 13. Hardcoded Dashboard Values

**File**: `src/api/routes/dashboard.routes.ts` (line 43-44)
**Severity**: MEDIUM

```typescript
quality_score: 85  // HARDCODED!
```

---

### 14. SSE Reconnection Logic Missing

**File**: `frontend/src/components/features/realtime/LiveFeed.tsx`
**Severity**: MEDIUM

SSE `onerror` falls back to polling but no reconnection attempt.

---

### 15. Night Shift / Cross-Day Handling — NOT IMPLEMENTED

**Severity**: MEDIUM

Check-in jam 22:00, check-out jam 06:00 (next day) tidak ditangani.

---

### 16. Weekend Attendance Not Differentiated

**File**: `src/modules/attendance/attendance-process-import.service.ts`
**Severity**: MEDIUM

Weekend attendance tidak di-flag berbeda, tidak ada overtime calculation.

---

## LOW Issues

### 17. Hardcoded Scanner Mappings

**File**: `src/modules/employees/employee-mapping.service.ts` (line 38-48)
**Severity**: LOW

Scanner → Division mappings hardcoded in code.
**Fix**: Move to database configuration table.

---

### 18. Multiple Mapping Implementations

**Files**: `employee-mapping.service.ts` vs `employee-code-mapper.ts`
**Severity**: LOW

Two different mapping algorithms exist.
**Fix**: Consolidate into SSOT parser.

---

### 19. Legacy Migrations Still Present

**Files**: `_dev_utils/` legacy SQL files
**Severity**: LOW

Confusion about which migrations to run.
**Fix**: Archive or remove.

---

## DONE

### 20. Frontend Modal Crashes — Missing Icon Imports

**File**: `frontend/src/components/features/attendance/AttendancePage.tsx`
**Status**: ✅ FIXED 2026-06-22

Icons `LogIn, LogOut, Activity, Fingerprint, X` now properly imported.

---

## Quick Fix Checklist

```bash
# 1. Install notification deps
npm install nodemailer twilio @types/nodemailer @types/twilio

# 2. Fix SQL injection (employee-movement.service.ts line 64)
# Manual — use parameterized queries

# 3. Rebuild source
npm run build

# 4. Test attendance routes behavior
```

---

## Priority Order

1. [DONE] Icon imports — FIXED
2. [TODO] Alert notifications — IMPLEMENT
3. [TODO] Unmapped users stored in DB
4. [TODO] SQL injection fix
5. [TODO] Multi-location threshold (≥ 2)
6. [TODO] Entry time anomaly detection
7. [TODO] Impossible travel detection
8. [TODO] Consolidate duplicate processing systems
9. [TODO] Rebuilt source/compiled sync
