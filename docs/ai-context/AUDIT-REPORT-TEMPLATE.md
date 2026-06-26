# AUDIT REPORT TEMPLATE
## Sistematis Debugging Audit Report

**Instructions:** Fill this template after completing audit investigation.
**Based on:** `docs/AUDIT-REQUEST.md` and `docs/AUDIT-EXECUTION-CHECKLIST.md`

---

## 1. Executive Summary

```markdown
### Kesimpulan Utama
[Summary of findings - max 3 sentences]

### Root Cause Utama
[Primary root cause identified]

### Risiko Terbesar
[Biggest risk to business/operations]

### Prioritas Perbaikan
1. [P0 - Critical]
2. [P1 - High]
3. [P2 - Medium]
```

---

## 2. Source of Truth

```markdown
### Source Aktif
| Source | Type | Status |
|--------|------|--------|
| ... | ... | ... |

### Source Deprecated
| Source | Reason | Files to Remove |
|--------|--------|-----------------|
| ... | ... | ... |

### Database Aktif
- Database Name: _______________
- Server: _______________
- Schema Version: _______________

### Tabel Final Attendance
[Which table is the source of truth for attendance]

### Data Flow Diagram
[ASCII diagram from machine to frontend]
```

---

## 3. Bug List

```markdown
| Priority | Area | Bug | Evidence | File | Line | Recommended Fix |
|----------|------|-----|----------|------|------|----------------|
| P0 | ... | ... | ... | ... | ... | ... |
| P1 | ... | ... | ... | ... | ... | ... |
| P2 | ... | ... | ... | ... | ... | ... |
```

---

## 4. Mapping Audit

```markdown
### Machine Prefix Mapping

| Machine | Expected Prefix | loc_code | Actual Prefixes Found | Status |
|---------|----------------|----------|---------------------|--------|
| P1A | A | A | A | OK |
| P1B | B | B | A,B | CROSS-LOCATION |
| P2A | C | C | C | OK |
| ... | ... | ... | ... | ... |

### Critical Mapping Issues

#### Issue 1: [Title]
- **Input:** _______________
- **Expected Output:** _______________
- **Actual Output:** _______________
- **Root Cause:** _______________
- **File:** _______________
- **Line:** _______________
- **Fix:** _______________

#### Issue 2: [Title]
[Same format]

### Unmapped Records
- **Total Count:** _______________
- **Top Reasons:**
  1. _______________
  2. _______________
  3. _______________

### Duplicate Employee Codes
- **Count:** _______________
- **Examples:**
  - Employee "X" at P1A → "A0001", at P1B → "B0001"

### Files Containing Mapping Logic
- [ ] src/modules/employees/employee-mapping.service.ts
- [ ] src/modules/mapping/employee-code-mapper.ts
- [ ] ... (list all)
```

---

## 5. Sync Audit

```markdown
### Sync Flow Diagram

```
[ASCII diagram showing sync flow]
```

### Active Sync Files
| File | Purpose | Active? |
|------|---------|---------|
| ... | ... | ... |

### Batch Status

| Batch ID | Machine | Started | Completed | Status | Records |
|----------|---------|---------|-----------|--------|---------|
| ... | ... | ... | ... | ... | ... |

### Stuck Batches
- [ ] Batch ID: _______________ (status: RUNNING since: _______________)
- [ ] Batch ID: _______________ (status: RUNNING since: _______________)

### Duplicate Prevention
- [ ] Unique constraint exists: YES/NO
- [ ] Constraint on: _______________

### Error Handling
- [ ] Sync continues if one machine fails: YES/NO
- [ ] Error logged per machine: YES/NO
- [ ] Race condition possible: YES/NO

### Issues Found
1. _______________
2. _______________
3. _______________
```

---

## 6. Attendance Processing Audit

```markdown
### Processing Flow

```
Raw Scan → [Service] → attendance_scan_logs
                    ↓
         [Processing Service]
                    ↓
         attendance_imports
                    ↓
         [Reconciliation]
                    ↓
         Final Attendance
```

### Check-in/Check-out Logic
| Rule | Code | File | Line |
|------|------|------|------|
| First scan = check-in | ... | ... | ... |
| Last scan = check-out | ... | ... | ... |
| Single scan = NO_CHECKOUT | ... | ... | ... |

### Status Determination Rules
| Status | Condition | Implemented? |
|--------|-----------|--------------|
| HADIR | >= 2 scans | YES |
| TIDAK_HADIR | < 2 scans | YES |
| NO_CHECKOUT | 1 scan | YES |
| NO_CHECKIN | 0 scans | YES |
| LATE_ARRIVAL | check-in > 08:00 | NO ❌ |
| EARLY_CHECKIN | check-in < 05:00 | NO ❌ |
| MULTI_LOCATION | > 2 machines | NO ❌ (should be >= 2) |

### Missing Rules (Gap Analysis)
1. _______________
2. _______________
3. _______________

### Sample Employee Trace
| Employee | Date | Raw Scans | Check-in | Check-out | Status | Correct? |
|----------|------|-----------|----------|-----------|--------|----------|
| A0044 | 2026-06-20 | 08:00, 12:00, 17:00 | 08:00 | 17:00 | HADIR | YES |
| ... | ... | ... | ... | ... | ... | ... |
```

---

## 7. Cross-Location Audit

```markdown
### Cross-Location Summary

| Machine | Expected | Found | Cross-Location Count | Severity |
|---------|----------|-------|---------------------|----------|
| P1A | A | A | 0 | OK |
| P1B | B | A,B,C | 12 | CRITICAL |
| P2A | C | C | 0 | OK |

### Cross-Location Employees at P1B

| Employee Code | Employee Name | Home Division | Scan Count | Action |
|---------------|---------------|---------------|-------------|--------|
| C50001 | HADI | P2A | 25 | CLEAN |
| C50002 | ... | ... | ... | ... |

### Root Cause
- [ ] Same user enrolled at multiple machines
- [ ] Employee HADI enrolled at P1A AND P1B
- [ ] ZKTeco enrollment not cleaned

### Recommended Actions
1. Clean ZKTeco P1B enrollment
2. Implement periodic cross-location audit
3. Add alert for cross-location scans
```

---

## 8. API Audit

```markdown
### Endpoint Status

| Endpoint | Method | Status | Response Valid | Issue | Fix Priority |
|----------|--------|--------|---------------|-------|--------------|
| /api/monitoring/dashboard | GET | 200 | YES | None | - |
| /api/attendance/daily | GET | 200 | PARTIAL | Missing field X | P1 |
| ... | ... | ... | ... | ... | ... |

### Response Sample

#### /api/attendance/daily
```json
{
  "success": true,
  "data": [
    {
      "employee_code": "A0044",
      "employee_name": "...",
      "check_in": "...",
      "check_out": "...",
      "status": "..."
    }
  ]
}
```

### Issues Found
1. _______________
2. _______________

### Files Serving Each Endpoint
| Endpoint | File | Line |
|----------|------|------|
| /api/attendance/daily | src/api/routes/attendance.routes.ts | 45 |
| ... | ... | ... |
```

---

## 9. Database Audit

```markdown
### Tables

| Table Name | Row Count | Last Updated | Used By | Status |
|------------|-----------|--------------|---------|--------|
| attendance_scan_logs | 123456 | 2026-06-21 | ... | OK |
| attendance_imports | 78901 | 2026-06-21 | ... | OK |
| ... | ... | ... | ... | ... |

### Views

| View Name | Underlying Tables | Used By | Status |
|-----------|-------------------|---------|--------|
| vw_attendance_final | ... | ... | ... |
| ... | ... | ... | ... |

### Duplicate Tables (if any)
| Table A | Table B | Reason for Duplication |
|---------|---------|------------------------|
| ... | ... | ... |

### Migration Status
- [ ] Migrations applied: YES/NO
- [ ] Pending migrations: _______________
- [ ] Schema matches code: YES/NO
```

---

## 10. Recommended Fix Plan

```markdown
### P0 - Critical (Fix Immediately)

| # | Fix | File | Line | Estimated Time |
|---|-----|------|------|----------------|
| 1 | Fix database connection | ... | ... | ... |
| 2 | Fix unmapped records storage | ... | ... | ... |
| 3 | Fix batch stuck handling | ... | ... | ... |

### P1 - High (Fix Soon)

| # | Fix | File | Line | Estimated Time |
|---|-----|------|------|----------------|
| 1 | Fix attendance processing rules | ... | ... | ... |
| 2 | Fix cross-location detection | ... | ... | ... |
| 3 | Fix API response mismatch | ... | ... | ... |

### P2 - Medium (Fix When Time)

| # | Fix | File | Line | Estimated Time |
|---|-----|------|------|----------------|
| 1 | Improve alert notifications | ... | ... | ... |
| 2 | Improve UI/UX | ... | ... | ... |
| 3 | Add more anomaly detection | ... | ... | ... |
```

---

## 11. Patch Plan

```markdown
### Files to Edit
1. _______________
2. _______________
3. _______________

### Files to Delete/Deprecate
1. _______________
2. _______________

### Migrations Needed
```sql
-- Migration 1
-- Description: ...
-- Risk: LOW/HIGH

-- Migration 2
-- Description: ...
-- Risk: LOW/HIGH
```

### Test Commands
```bash
# Test 1
npx ts-node src/scripts/test-[feature].ts

# Test 2
curl http://localhost:8004/api/[endpoint]

# Test 3
npm run db:check
```

### Rollback Plan
1. _______________
2. _______________
```

---

## 12. Acceptance Test

```markdown
### Test Case 1: [Title]
- **Description:** _______________
- **Steps:**
  1. _______________
  2. _______________
  3. _______________
- **Expected Result:** _______________
- **Actual Result (before fix):** _______________
- **Actual Result (after fix):** _______________
- **Status:** PASS/FAIL

### Test Case 2: [Title]
[Same format]

### Test Case 3: [Title]
[Same format]
```

---

## 13. Evidence Attachments

```markdown
### Screenshots
- [ ] Screenshot 1: [Description]
- [ ] Screenshot 2: [Description]

### Query Results
- [ ] Query 1: [File path or inline]
- [ ] Query 2: [File path or inline]

### Log Files
- [ ] Log 1: [File path]
- [ ] Log 2: [File path]

### JSON Exports
- [ ] Machine test results: [File]
- [ ] API test results: [File]
```

---

## 14. Sign-off

```markdown
### Auditor
- Name: _______________
- Date: _______________

### Reviewed By
- Name: _______________
- Date: _______________
- Signature: _______________

### Approved For Implementation
- [ ] YES
- [ ] NO
- Notes: _______________
```

---

**END OF REPORT TEMPLATE**
