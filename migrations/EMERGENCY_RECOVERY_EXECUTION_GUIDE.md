# Emergency Recovery Execution Guide

## ⚠️ Prerequisites Before Starting

1. **Stop the backend server** — `npm run start` or `npm run dev` must not be running
2. **Notify HR** — attendance data is under recovery, no new sync during restore
3. **Low-traffic hours** — Phase 3 (restore 788k rows) takes 5-15 minutes

---

## Execution Order

### Phase 0 — Freeze Scheduler
```bash
# 1. Stop backend
npm run dev   # press Ctrl+C

# 2. Scheduler already disabled (src/config/schedule.json enabled=false)

# 3. Run Phase 0 in SSMS
# File: migrations/063_emergency_recovery_phase_0_3.sql
# Execute only the Phase 0 block (lines 1-28)
```
**Expected output**: "Created: attendance_*_state_before_recovery_20260625" tables

---

### Phase 1 — Discovery
```bash
# Run in SSMS
File: migrations/064_emergency_recovery_phase_1_discovery.sql
```
**Expected output**:
- `attendance_scan_logs_backup_20260623_233022` exists with ~788,915 rows
- `employees_backup_20260623` exists
- `attendance_machines_backup_20260623` exists
- `machine_user_raw` may or may not exist
- All columns from Phase 4 checklist visible

---

### Phase 2 — Restore Master Tables
```bash
# Run in SSMS
File: migrations/065_emergency_recovery_phase_2_restore_master.sql
```
**Expected output**:
- `attendance_machines` > 0 rows
- `employees` > 0 rows
- Division distribution shows multiple divisions (not only G)

**⚠️ If employees only has G**: Check if `employees_backup_20260623` had all divisions, or need to rebuild from HR source

---

### Phase 3 — Restore Scan Logs (LONG RUN ~5-15 min)
```bash
# Run in SSMS during low-traffic hours
File: migrations/066_emergency_recovery_phase_3_restore_scanlogs.sql
```
**Expected output**:
- ~788,915 rows inserted
- All machines represented
- B0193 sample shows records

**⚠️ DO NOT CANCEL this operation**

---

### Phase 4 — Schema Setup
```bash
# Run in SSMS
File: migrations/067_emergency_recovery_phase_4_schema.sql
```
**Expected output**:
- `machine_user_raw` table created
- Indexes created
- `attendance_recovery_audit_log` created
- Machine time profiles created for all machines

---

### Phase 5-8 — Enrich + Timezone + Rebuild (LONG RUN ~10-20 min)
```bash
# Run in SSMS during low-traffic hours
File: migrations/068_emergency_recovery_phase_5_8_enrich_rebuild.sql
```
**Expected output**:
- Name enrichment: FILLED, NO_RAW_USER, CONFLICT counts
- Timezone: 0 mismatches after correction
- `attendance_imports` rebuilt with ALL divisions

**⚠️ DO NOT CANCEL**

---

### Phase 9 — Backend Code Fix
```bash
# 1. Run the DB portion
File: migrations/069_emergency_recovery_phase_9_backend_harden.sql

# 2. Fix the TypeScript code
# File: src/modules/import/sync-orchestrator.service.ts
# Lines: 420-445
# Change: Replace COALESCE with explicit LTRIM(RTRIM(r.user_name))
```
**TypeScript fix**:
```typescript
// OLD (wrong):
sl.zkteco_user_name = COALESCE(
    NULLIF(LTRIM(RTRIM(sl.zkteco_user_name)), ''),
    LTRIM(RTRIM(r.user_name))
)

// NEW (correct):
sl.zkteco_user_name = LTRIM(RTRIM(r.user_name))
sl.zkteco_user_name_source = CASE
    WHEN r.user_name IS NOT NULL AND LEN(LTRIM(RTRIM(r.user_name))) > 0
    THEN 'MACHINE_USER_RAW'
    WHEN sl.zkteco_user_name IS NOT NULL THEN 'ATTENDANCE_RECORD'
    ELSE 'UNKNOWN' END
```

```bash
# 3. Rebuild backend
npm run build
```

---

### Phase 10 — Validate API
```bash
# Start backend
npm run start

# Run in SSMS
File: migrations/070_emergency_recovery_phase_10_validation.sql

# Test API (curl or browser)
curl "http://localhost:3000/api/attendance/monthly-matrix?year=2026&month=6"

# Expected: 200 OK with data array, multiple divisions
```

**Frontend checklist**:
1. Navigate to Attendance Matrix
2. Select Year: 2026, Month: 6
3. Check: Multiple divisions appear (A, B, C, D, E, F, G, H, J, L)
4. Click any cell — check-in/out times should be in WIB
5. No null/undefined/NaN displayed

---

### Phase 11 — Re-enable + Monitor
```bash
# 1. Re-enable scheduler
# Edit: src/config/schedule.json
# Change: "enabled": false → "enabled": true

# 2. Rebuild
npm run build

# 3. Start backend
npm run start

# 4. Run first manual sync
curl -X POST "http://localhost:3000/api/ops/sync" \
  -H "Content-Type: application/json" \
  -d '{"machineCode": "P1A"}'

# 5. Run in SSMS
File: migrations/071_emergency_recovery_phase_11_enable_scheduler.sql

# 6. Monitor for 3 days
```

---

## Validation Checkpoints

### After Phase 2
- [ ] `attendance_machines` > 0
- [ ] `employees` > 0
- [ ] Multiple divisions in employees

### After Phase 3
- [ ] `attendance_scan_logs` ~788,915 rows
- [ ] All machines represented
- [ ] B0193 sample exists

### After Phase 5-8
- [ ] `zkteco_user_name` FILLED > 0
- [ ] `time_correction_status` = 'CORRECTED_UTC_TO_WIB' > 0
- [ ] `attendance_imports` contains ALL divisions (not just G)
- [ ] `scan_date` = DATE of `scan_time` (no mismatch)

### After Phase 9 + Rebuild
- [ ] `npm run build` succeeds
- [ ] API returns non-empty data

### Final
- [ ] Frontend shows attendance matrix with all divisions
- [ ] No null/undefined/NaN in UI
- [ ] B0193 record shows correct WIB time (05:50 not 22:50)

---

## Rollback Commands

### If Phase 5-8 fails
```sql
-- Restore attendance_imports from backup
DELETE FROM attendance_imports;
INSERT INTO attendance_imports SELECT * FROM attendance_imports_backup_before_rebuild_20260625;
```

### If Phase 3 fails mid-way
```sql
-- Data already inserted with IDENTITY_INSERT, check counts
SELECT COUNT(*) FROM attendance_scan_logs;
-- If incomplete, DELETE and re-run Phase 3
```

### If Phase 9 backend fix causes issues
```sql
-- Reset enrichment (already done in Phase 9 migration)
-- Rebuild: npm run build
```

---

## Critical Files Changed

| File | Change |
|------|--------|
| `src/config/schedule.json` | `enabled: false` (Phase 0), revert to `true` (Phase 11) |
| `src/modules/import/sync-orchestrator.service.ts` | Fix COALESCE name priority (Phase 9) |

## Backup Tables Created

| Table | Content |
|-------|---------|
| `attendance_scan_logs_state_before_recovery_20260625` | Empty snapshot before restore |
| `attendance_imports_state_before_recovery_20260625` | Empty snapshot before rebuild |
| `employees_state_before_recovery_20260625` | Empty snapshot before restore |
| `attendance_machines_state_before_recovery_20260625` | Empty snapshot before restore |
| `attendance_imports_backup_before_rebuild_20260625` | Empty or previous imports before rebuild |

**⚠️ Do NOT drop these backup tables until 1 week after successful recovery**
