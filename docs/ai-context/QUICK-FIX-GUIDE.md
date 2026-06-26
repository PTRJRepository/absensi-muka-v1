# QUICK-FIX EXECUTION GUIDE
## Immediate Actions for Critical Issues

**Based on:** `docs/AUDIT-REPORT-FINAL.md`  
**Date:** 2026-06-21

---

## P0 - Fix Immediately (Est. 15 minutes total)

### Fix 1: Missing Icon Imports (5 min)

**File:** `frontend/src/components/features/attendance/AttendancePage.tsx`

**Before (Line 9):**
```typescript
import { ClipboardList, Users, UserX, AlertCircle, User, Monitor } from 'lucide-react';
```

**After:**
```typescript
import { 
  ClipboardList, Users, UserX, AlertCircle, User, Monitor,
  LogIn, LogOut, Activity, Fingerprint, X 
} from 'lucide-react';
```

---

### Fix 2: Multi-Location Threshold (5 min)

**File:** `src/modules/monitoring/anomaly.service.ts`

**Line 120:**

**Before:**
```typescript
if (process.machine_count > 2) {
  anomalies.push({
    anomaly_type: 'MULTIPLE_LOCATION_SAME_DAY',
    severity: 'LOW',
    ...
  });
}
```

**After:**
```typescript
if (process.machine_count >= 2) {
  anomalies.push({
    anomaly_type: 'MULTIPLE_LOCATION_SAME_DAY',
    severity: 'MEDIUM',  // Upgrade from LOW
    ...
  });
}
```

---

### Fix 3: Delete Duplicate Endpoints (2 min)

**File:** `src/api/routes/quality-dashboard.routes.ts`

**Action:** DELETE the entire file

Then remove from `src/api/routes/index.ts`:
```typescript
// Remove or comment this line:
// import './quality-dashboard.routes';
```

---

### Fix 4: Store Unmapped Users (30 min)

**File:** `src/modules/import/sync-orchestrator.service.ts`

**Lines 315-324:**

**Before:**
```typescript
} else {
  // Only console.warn - NOT stored anywhere!
  unmappedCount++;
  console.warn(`[Orchestrator] Unmapped device user...`);
}
```

**After:**
```typescript
} else {
  // Store unmapped for analysis
  try {
    await query(
      `INSERT INTO attendance_scan_logs 
       (batch_id, machine_code, raw_device_user_id, scan_date, scan_time, mapping_status)
       VALUES (@batchId, @machine, @uid, @date, @time, 'UNMAPPED')`,
      {
        batchId: batchId,
        machine: machine,
        uid: deviceUserId,
        date: scanDate,
        time: scanTime,
      }
    );
  } catch (err) {
    console.error('[Orchestrator] Failed to store unmapped:', err);
  }
  unmappedCount++;
}
```

---

## P1 - Fix This Week

### Fix 5: Hardcoded Dashboard Values

**File:** `src/api/routes/dashboard.routes.ts`

**Lines 35-36 (Online/Offline machines):**

**Before:**
```typescript
online_machines: (SELECT COUNT(*) FROM ... WHERE is_active=1),
offline_machines: (SELECT COUNT(*) FROM ... WHERE is_active=1), // SAME!
```

**After:**
```typescript
online_machines: (SELECT COUNT(*) FROM ... WHERE is_online=1),
offline_machines: (SELECT COUNT(*) FROM ... WHERE is_active=1 AND is_online=0),
```

**Line 41 (Quality score):**

**Before:**
```typescript
quality_score: 85  // Hardcoded!
```

**After:**
```typescript
quality_score: (
  SELECT CAST(
    CASE 
      WHEN total_records > 0 
      THEN (mapped_records * 100.0 / total_records) 
      ELSE 0 
    END AS INT
  )
  FROM attendance_quality_metrics
  WHERE calculated_at = (SELECT MAX(calculated_at) FROM attendance_quality_metrics)
)
```

---

### Fix 6: SQL Injection Vulnerability

**File:** `src/modules/employees/employee-movement.service.ts`

**Line 64:**

**Before:**
```typescript
`employee_id = ${employeeId} 
AND effective_start <= '${this.formatDate(workDate)}'`
```

**After:**
```typescript
`employee_id = @employeeId 
AND effective_start <= @workDate`
// Then pass { employeeId, workDate } as parameters
```

---

## Verification Commands

After applying fixes, run these to verify:

```bash
# 1. Build check
npm run build

# 2. Start dev server
npm run dev

# 3. Test API endpoints
curl http://localhost:8004/api/monitoring/dashboard
curl "http://localhost:8004/api/attendance/daily?date=2026-06-21"
curl http://localhost:8004/api/monitoring/quality

# 4. Test frontend
# - Open http://localhost:5173
# - Navigate to Attendance page
# - Click on any row to test modal
# - Check browser console for errors
```

---

## Rollback Commands

If something goes wrong:

```bash
# Rollback icon imports
git checkout frontend/src/components/features/attendance/AttendancePage.tsx

# Rollback threshold change
git checkout src/modules/monitoring/anomaly.service.ts

# Restore deleted file
git checkout src/api/routes/quality-dashboard.routes.ts

# Full rollback
git checkout -- .
```

---

## Monitoring After Fix

```sql
-- Check if unmapped users are being stored
SELECT TOP 10 * FROM attendance_scan_logs 
WHERE mapping_status = 'UNMAPPED'
ORDER BY scan_time DESC;

-- Check anomaly counts
SELECT anomaly_type, severity, COUNT(*) as cnt
FROM attendance_anomalies
WHERE detected_at >= DATEADD(day, -1, GETDATE())
GROUP BY anomaly_type, severity;

-- Check dashboard stats
SELECT * FROM dashboard_stats WHERE date = CAST(GETDATE() AS DATE);
```

---

**END OF QUICK-FIX GUIDE**
