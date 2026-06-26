# Remove API Fallback - ZKTeco Only

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all IT Solution API fallback references, making ZKTeco the ONLY data source for attendance data.

**Architecture:** This is a cleanup task - we need to:
1. Remove API fallback logic from sync orchestrator
2. Remove API import service file (or mark as deprecated)
3. Remove API config from scheduler
4. Update imports and type definitions

**Tech Stack:** Node.js/TypeScript, ZKTeco integration only

---

## Context

**Problem**: 9 divisi tidak punya data absensi karena sistem mencoba fallback ke IT Solution API (yang TIDAK ADA). User confirms: ZKTeco adalah SATU-SATUNYA sumber data.

**Root Cause**:
- `syncViaApiFallback()` called when ZKTeco fails
- `machineToDivision()` maps to non-existent API divisions
- Scheduler runs API import cron job every 6 hours

---

## Files to Modify

| File | Change |
|------|--------|
| `src/modules/import/sync-orchestrator.service.ts` | Remove API fallback, update types |
| `src/modules/import/index.ts` | Remove ApiAttendanceImportService export |
| `src/scripts/sync-scheduler.ts` | Remove API import config and cron job |
| `src/api/routes/sync.routes.ts` | Remove API import endpoint |

---

## Task 1: Update Type Definitions

**Files:**
- Modify: `src/modules/import/sync-orchestrator.service.ts:25-35`

**Step 1: Remove 'API' and 'FALLBACK' from source type**

Change:
```typescript
export interface SyncResult {
  success: boolean;
  machineCode?: string;
  batchId?: number;
  usersCount?: number;
  attendanceCount?: number;
  unmappedCount?: number;
  duration?: number;
  source: 'ZKTECO' | 'API' | 'FALLBACK';
  error?: string;
}
```

To:
```typescript
export interface SyncResult {
  success: boolean;
  machineCode?: string;
  batchId?: number;
  usersCount?: number;
  attendanceCount?: number;
  unmappedCount?: number;
  duration?: number;
  source: 'ZKTECO';
  error?: string;
}
```

**Step 2: Commit**

```bash
git add src/modules/import/sync-orchestrator.service.ts
git commit -m "refactor: remove API/FALLBACK from SyncResult source type"
```

---

## Task 2: Remove API Import Service Import

**Files:**
- Modify: `src/modules/import/sync-orchestrator.service.ts:14`
- Modify: `src/modules/import/sync-orchestrator.service.ts:66-67`
- Modify: `src/modules/import/sync-orchestrator.service.ts:60-68` (constructor)

**Step 1: Remove ApiAttendanceImportService import**

Change:
```typescript
import { ApiAttendanceImportService } from './api-attendance-import.service';
```

To: (delete line)

**Step 2: Remove apiImportService from constructor**

Change:
```typescript
export class SyncOrchestrator {
  constructor(
    private machineService: MachineService,
    private machineRepo: MachineRepository,
    private importJobService: ImportJobService,
    private employeeMappingService: EmployeeMappingService,
    private employeeRepo: EmployeeRepository,
    private apiImportService: ApiAttendanceImportService,
    private sqlClient: SqlClient
  ) {}
```

To:
```typescript
export class SyncOrchestrator {
  constructor(
    private machineService: MachineService,
    private machineRepo: MachineRepository,
    private importJobService: ImportJobService,
    private employeeMappingService: EmployeeMappingService,
    private employeeRepo: EmployeeRepository,
    private sqlClient: SqlClient
  ) {}
```

**Step 3: Commit**

```bash
git add src/modules/import/sync-orchestrator.service.ts
git commit -m "refactor: remove apiImportService from SyncOrchestrator constructor"
```

---

## Task 3: Rewrite syncMachine() - Remove API Fallback

**Files:**
- Modify: `src/modules/import/sync-orchestrator.service.ts:73-127`

**Step 1: Replace syncMachine() logic**

Change the `syncMachine` method from:

```typescript
async syncMachine(machineCode: string): Promise<SyncResult> {
  // ... existing code with API fallback ...
}
```

To:
```typescript
async syncMachine(machineCode: string): Promise<SyncResult> {
  const startTime = Date.now();
  publishSyncStarted(machineCode);

  // Get machine info
  const machine = await this.machineService.getMachineByCode(machineCode);
  if (!machine) {
    const error = `Machine not found: ${machineCode}`;
    publishSyncFailed(machineCode, error);
    return { success: false, machineCode, source: 'ZKTECO', error };
  }

  // Only sync via ZKTeco - no API fallback
  if (machine.access_status !== 'ACCESSIBLE' || machine.data_source !== 'DIRECT_ZKTECO') {
    const error = `Machine not accessible: ${machine.access_status}`;
    publishSyncFailed(machineCode, error);
    return { success: false, machineCode, source: 'ZKTECO', error };
  }

  const result = await this.syncViaZkteco(machine);

  if (result.success) {
    return {
      ...result,
      source: 'ZKTECO',
      duration: Date.now() - startTime,
    };
  }

  publishSyncFailed(machineCode, result.error || 'Unknown error');
  return {
    success: false,
    machineCode,
    source: 'ZKTECO',
    error: result.error,
    duration: Date.now() - startTime,
  };
}
```

**Step 2: Commit**

```bash
git add src/modules/import/sync-orchestrator.service.ts
git commit -m "refactor: remove API fallback from syncMachine() - ZKTeco only"
```

---

## Task 4: Remove syncViaApiFallback() Method

**Files:**
- Modify: `src/modules/import/sync-orchestrator.service.ts:452-506`

**Step 1: Delete syncViaApiFallback() method**

Delete lines 450-506 (entire `syncViaApiFallback` method).

**Step 2: Delete machineToDivision() method**

Delete lines 534-555 (entire `machineToDivision` method).

**Step 3: Update file comment header**

Change:
```typescript
/**
 * Sync Orchestrator Service
 *
 * Orchestrates sync between ZKTeco and IT Solution API with fallback logic
 * Part of Phase 4: API Integration
 */
```

To:
```typescript
/**
 * Sync Orchestrator Service
 *
 * Orchestrates sync from ZKTeco machines to database
 * ZKTeco is the ONLY data source - no API fallback
 */
```

**Step 4: Commit**

```bash
git add src/modules/import/sync-orchestrator.service.ts
git commit -m "refactor: remove syncViaApiFallback() and machineToDivision() methods"
```

---

## Task 5: Remove Export from Index

**Files:**
- Modify: `src/modules/import/index.ts:3`

**Step 1: Remove ApiAttendanceImportService export**

Change:
```typescript
export { ImportJobService } from './import-job.service';
export { DirectZKTecoImportService } from './direct-zkteco-import.service';
export { ApiAttendanceImportService } from './api-attendance-import.service';
```

To:
```typescript
export { ImportJobService } from './import-job.service';
export { DirectZKTecoImportService } from './direct-zkteco-import.service';
// ApiAttendanceImportService removed - ZKTeco only
```

**Step 2: Commit**

```bash
git add src/modules/import/index.ts
git commit -m "refactor: remove ApiAttendanceImportService export - ZKTeco only"
```

---

## Task 6: Update Sync Scheduler - Remove API Config

**Files:**
- Modify: `src/scripts/sync-scheduler.ts:30-31`
- Modify: `src/scripts/sync-scheduler.ts:67` (constructor)
- Modify: `src/scripts/sync-scheduler.ts:81` (constructor)
- Modify: `src/scripts/sync-scheduler.ts:93-94`
- Modify: `src/scripts/sync-scheduler.ts:113-122`
- Modify: `src/scripts/sync-scheduler.ts:187-250` (runApiImportJob method)
- Modify: `src/scripts/sync-scheduler.ts:261-262` (getStatus)

**Step 1: Remove apiImportEnabled and apiImportIntervalHours**

Delete lines 30-31:
```typescript
apiImportEnabled: boolean;
apiImportIntervalHours: number;
```

**Step 2: Remove apiImportService from constructor**

Delete line 67:
```typescript
const apiImportService = new ApiAttendanceImportService(config);
```

And remove from constructor call:
Delete line 81:
```typescript
apiImportService,
```

**Step 3: Remove config defaults**

Delete lines 93-94:
```typescript
apiImportEnabled: config?.apiImportEnabled ?? true,
apiImportIntervalHours: config?.apiImportIntervalHours ?? 6,
```

**Step 4: Remove API cron job**

Delete lines 113-122:
```typescript
if (fullConfig.apiImportEnabled) {
  const apiCronExpression = `0 */${fullConfig.apiImportIntervalHours} * * *`; // Every X hours
  this.apiCronJob = cron.schedule(apiCronExpression, async () => {
    await this.runApiImportJob();
  });
  console.log(`[Scheduler] API import job scheduled: every ${fullConfig.apiImportIntervalHours} hours`);
} else {
  console.log(`[Scheduler] API import job disabled`);
}
```

**Step 5: Remove runApiImportJob() method**

Delete lines 187-250 (entire method).

**Step 6: Update getStatus()**

Delete lines 261-262:
```typescript
apiImportEnabled: this.apiCronJob !== null,
apiImportIntervalHours: 6,
```

**Step 7: Update console.log message**

Change:
```typescript
console.log(`[Scheduler] API import job started: every ${fullConfig.apiImportIntervalHours} hours`);
```

To:
```typescript
console.log(`[Scheduler] Sync scheduler started`);
```

**Step 8: Commit**

```bash
git add src/scripts/sync-scheduler.ts
git commit -m "refactor: remove API import from scheduler - ZKTeco only"
```

---

## Task 7: Check for Other API References

**Files:**
- Search: `src/` for any remaining references

**Step 1: Search for remaining references**

Run:
```bash
grep -r "ApiAttendance\|api-attendance\|IT_SOLUTION\|apiImportEnabled\|syncViaApiFallback\|machineToDivision" src/
```

Expected: No matches (except in git history)

**Step 2: If any found, remove them**

Contact user if unexpected references found.

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: final cleanup - verify no API references remain"
```

---

## Task 8: Verify Build

**Files:**
- Run: `npm run build` in backend

**Step 1: Run TypeScript compilation**

```bash
cd "D:/Gawean Rebinmas/Absensi_Muka"
npm run build
```

Expected: Build succeeds with no errors

**Step 2: Fix any TypeScript errors**

If errors, fix them and commit.

---

## Task 9: Update CLAUDE.md Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add warning about IT Solution API**

Add at the top of the file (after line 7):

```markdown
## ⚠️ IMPORTANT: IT Solution API Does NOT Exist

**CRITICAL**: There is NO IT Solution API. All attendance data comes from ZKTeco machines only.
The `api-attendance-import.service.ts` file is DEPRECATED and should not be used.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add warning that IT Solution API does not exist"
```

---

## Verification Checklist

After all tasks complete:

- [ ] No `ApiAttendanceImportService` references in code
- [ ] No `syncViaApiFallback()` method exists
- [ ] No `machineToDivision()` method exists
- [ ] No `apiImportEnabled` config exists
- [ ] No API import cron job in scheduler
- [ ] `npm run build` succeeds
- [ ] `SyncResult.source` only has 'ZKTECO' value

---

## Rollback Plan

If issues occur:

```bash
git log --oneline -10
git revert <commit-hash>
```

Commits in order:
1. `refactor: remove API/FALLBACK from SyncResult source type`
2. `refactor: remove apiImportService from SyncOrchestrator constructor`
3. `refactor: remove API fallback from syncMachine() - ZKTeco only`
4. `refactor: remove syncViaApiFallback() and machineToDivision() methods`
5. `refactor: remove ApiAttendanceImportService export - ZKTeco only`
6. `refactor: remove API import from scheduler - ZKTeco only`
7. `chore: final cleanup - verify no API references remain`
8. `docs: add warning that IT Solution API does not exist`
