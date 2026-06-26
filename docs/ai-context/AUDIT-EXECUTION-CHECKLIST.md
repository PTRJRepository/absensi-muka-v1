# AUDIT EXECUTION CHECKLIST
## Sistematis Debugging Workflow

**Parent Document:** `docs/AUDIT-REQUEST.md`  
**Project:** Sistem Absensi PT Rebinmas Jaya  
**Date:** 2026-06-21

---

## Prinsip Debugging Sistematis

```
IRON LAW: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

### Four Phases

| Phase | Aktiviti | Selesai |
|-------|----------|---------|
| **Phase 1** | Root Cause Investigation | ⬜ |
| **Phase 2** | Pattern Analysis | ⬜ |
| **Phase 3** | Hypothesis and Testing | ⬜ |
| **Phase 4** | Implementation | ⬜ |

---

## Phase 1: Root Cause Investigation

### A1: Source of Truth Data

```bash
# Check if IT Solution API is used
grep -r "api-attendance" src/
grep -r "IT Solution" src/

# Check actual data flow
grep -r "attendance_scan_logs" src/
grep -r "attendance_imports" src/
```

**Output yang harus ada:**
- [ ] Confirmed: IT Solution API is DEPRECATED
- [ ] Confirmed: Direct ZKTeco is PRIMARY source
- [ ] Source of truth table identified

### A2: Database Active Schema

```bash
# Run environment check
npm run db:check

# Connect to database and run queries
sqlcmd -S 10.0.0.110 -d rebinmas_absensi_monitoring -Q "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'"
```

**Output yang harus ada:**
- [ ] Active database: `rebinmas_absensi_monitoring`
- [ ] Table list with row counts
- [ ] View list
- [ ] Migration status

### A3: ZKTeco Reading Audit

```bash
# Test single machine
npx ts-node -e "
  import ZKLib from 'node-zklib';
  const zk = new ZKLib('10.0.0.90', 4100, 30000, 4000, '12345');
  await zk.createSocket();
  const users = await zk.getUsers();
  const attendances = await zk.getAttendances();
  console.log(JSON.stringify({ users, attendances }));
  await zk.disconnect();
"
```

**Output yang harus ada:**
- [ ] Machine connectivity status for all 16 machines
- [ ] Sample users from each machine
- [ ] Sample attendance from each machine
- [ ] Error log per machine

### A4: Employee Mapping Audit

```bash
# Run unmapped query
sqlcmd -S 10.0.0.110 -d rebinmas_absensi_monitoring -Q "
  SELECT TOP 100 machine_code, raw_device_user_id, parsed_employee_code, mapping_status, scan_time
  FROM attendance_scan_logs
  WHERE mapping_status = 'UNMAPPED'
  ORDER BY scan_time DESC;
"
```

**Output yang harus ada:**
- [ ] Mapping rule in code identified
- [ ] Unmapped records count and sample
- [ ] Potential mapping bugs identified
- [ ] Files containing mapping logic

### A5: Sync to Database Audit

```bash
# Check recent batches
sqlcmd -S 10.0.0.110 -d rebinmas_absensi_monitoring -Q "
  SELECT TOP 50 * FROM attendance_import_batches
  ORDER BY started_at DESC;
"

# Check stuck batches
sqlcmd -S 10.0.0.110 -d rebinmas_absensi_monitoring -Q "
  SELECT * FROM attendance_import_batches
  WHERE status = 'RUNNING'
  ORDER BY started_at DESC;
"
```

**Output yang harus ada:**
- [ ] Sync flow diagram
- [ ] Active sync files identified
- [ ] Recent batches status
- [ ] Stuck batches (if any)
- [ ] Duplicate prevention mechanism

### A6: Attendance Processing Audit

**Code files to trace:**
- `src/modules/attendance/attendance-process-import.service.ts`
- `src/modules/attendance/attendance-process.service.ts`

```bash
# Trace check-in logic
grep -n "MIN(" src/modules/attendance/
grep -n "MAX(" src/modules/attendance/
grep -n "check_in" src/modules/attendance/
grep -n "check_out" src/modules/attendance/
```

**Output yang harus ada:**
- [ ] Flow diagram: raw log → processed attendance
- [ ] Check-in/check-out logic confirmed
- [ ] Status determination rules documented
- [ ] Gap in rules identified

### A7: Cross-Location Audit

```bash
# Run cross-location query
sqlcmd -S 10.0.0.110 -d rebinmas_absensi_monitoring -Q "
  SELECT machine_code, LEFT(parsed_employee_code, 1) AS prefix, COUNT(*) AS total
  FROM attendance_scan_logs
  WHERE parsed_employee_code IS NOT NULL
  GROUP BY machine_code, LEFT(parsed_employee_code, 1)
  ORDER BY machine_code, total DESC;
"
```

**Output yang harus ada:**
- [ ] Expected vs actual prefixes per machine
- [ ] Cross-location employees list
- [ ] Root cause identified
- [ ] Recommendation for fix

### A8: API Backend Audit

```bash
# Start backend first
npm run dev &

# Test endpoints
curl -s http://localhost:8004/api/monitoring/dashboard | jq .
curl -s http://localhost:8004/api/monitoring/machines | jq .
curl -s "http://localhost:8004/api/attendance/daily?date=2026-06-20" | jq .
curl -s "http://localhost:8004/api/attendance/monthly?year=2026&month=6" | jq .
```

**Output yang harus ada:**
- [ ] HTTP status for each endpoint
- [ ] Response sample for each endpoint
- [ ] Bugs identified per endpoint
- [ ] Priority fix list

### A9: Frontend Audit

```bash
# Start frontend
cd frontend && npm run dev &

# Open browser devtools and check:
# 1. Network tab for API calls
# 2. Console for errors
# 3. Components rendering state
```

**Output yang harus ada:**
- [ ] Components list with API calls
- [ ] Console errors
- [ ] Type mismatches
- [ ] Fix required

---

## Phase 2: Pattern Analysis

After collecting evidence from Phase 1:

1. **Find Working Examples**
   - Identify similar working code
   - Document why it works

2. **Compare Against References**
   - What works vs what's broken
   - List every difference

3. **Identify Differences**
   - Small differences matter
   - Don't assume

---

## Phase 3: Hypothesis and Testing

1. **Form Single Hypothesis**
   ```
   Format: "I think [X] is the root cause because [Y]"
   ```

2. **Test Minimally**
   - One variable at a time
   - Smallest possible change

3. **Verify Before Continuing**
   - Worked? → Phase 4
   - Didn't work? → New hypothesis

---

## Phase 4: Implementation

1. **Create Failing Test Case**
   ```bash
   # Create test script
   npx ts-node src/scripts/test-[feature].ts
   ```

2. **Implement Single Fix**
   - Address root cause
   - One change at a time

3. **Verify Fix**
   - Test passes?
   - Other tests broken?

---

## Red Flags - STOP

If you catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "I'll write test after confirming fix works"
- **"One more fix attempt" (when already tried 2+)**

---

## If 3+ Fixes Failed

STOP and question architecture:
- Is this pattern fundamentally sound?
- Are we "sticking with it through sheer inertia"?
- Should we refactor architecture vs. continue fixing?

**Discuss with human partner before attempting more fixes**

---

## Quick Commands Reference

```bash
# Database queries
npm run db:check
sqlcmd -S 10.0.0.110 -d rebinmas_absensi_monitoring

# Backend
npm run dev
npm run build
npm run sync:machines

# Frontend
cd frontend && npm run dev

# Testing
npx ts-node src/scripts/audit-cross-location.ts
npx ts-node src/scripts/query-cross-location.ts

# Git
git status
git diff --stat
git log --oneline -20
```

---

## Evidence Collection Templates

### Machine Test Result
```json
{
  "machineCode": "",
  "ip": "",
  "port": "",
  "connectionStatus": "",
  "usersCount": 0,
  "attendanceCount": 0,
  "sampleUser": {},
  "sampleAttendance": {},
  "error": null
}
```

### API Test Result
```json
{
  "endpoint": "",
  "method": "GET",
  "statusCode": 200,
  "responseValid": true,
  "sampleResponse": {},
  "issues": [],
  "filesUsed": []
}
```

### Mapping Analysis
```json
{
  "input": "",
  "expectedOutput": "",
  "actualOutput": "",
  "mappingRuleUsed": "",
  "file": "",
  "line": 0
}
```

---

**END OF CHECKLIST**
