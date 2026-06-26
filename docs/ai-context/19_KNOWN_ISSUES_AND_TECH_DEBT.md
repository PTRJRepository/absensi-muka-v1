---
tags: [ai-context, issues, tech-debt]
created: 2026-06-07
updated: 2026-06-26
---

# Known Issues and Technical Debt

## Post-Recovery Issues (2026-06-25)

| # | Issue | Impact | Priority |
|---|-------|--------|----------|
| 1 | 22 NEED_REVIEW rows (AB1) | Cannot auto-map | MEDIUM |
| 2 | machine_user_raw low coverage | Name enrichment partial | MEDIUM |
| 3 | P2A/P2B network unreachable | 69 records lost | LOW |
| 4 | AB1/ARC port forwarding needed | ~17K records inaccessible | HIGH |
| 5 | J division NIK_NOT_FOUND | J0127 employees unresolved | MEDIUM |
| 6 | attendance_imports rebuild needed | Pipeline not auto-populating | HIGH |

### Issue 1: 22 NEED_REVIEW rows (AB1 machine)

**What:** 22 rows from AB1 machine have `mapping_status = 'NEED_REVIEW'` with empty `raw_device_user_id`.
**Impact:** Cannot auto-map employee codes for these records.
**Action:** Investigate AB1 badge enrollment — why are raw IDs empty?

```sql
SELECT machine_code, COUNT(*) FROM attendance_scan_logs
WHERE mapping_status = 'NEED_REVIEW'
GROUP BY machine_code;
```

### Issue 2: machine_user_raw Low Coverage

**What:** machine_user_raw has ~1,228 pre-existing rows. Only P1A (793), OFFICE_PGE (1,653), P1B (155) have been synced.
**Impact:** Name enrichment (`zkteco_user_name`) is partial — 788,915 scan_logs but only ~192K enriched.
**Action:** Run `sync-machines.js` on all 10 accessible machines to refresh getUsers() data.

### Issue 3: P2A/P2B Network Unreachable

**What:** P2A and P2B machines (10.0.0.92, 10.0.0.93) are on PGE estate internal network but unreachable from app server (10.0.0.110).
**Impact:** Only ~69 combined records (38 + 31). Very low usage.
**Action:** Check PGE estate switch/firewall configuration.

### Issue 4: AB1/ARC Port Forwarding Needed

**What:** Router at 103.144.208.154 (APE estate) doesn't forward ports 4200/4201/4900 to ARC_01/ARC_02/AB1.
**Impact:** ~17,030 records inaccessible (ARC ~12,096 + AB1 ~4,934).
**Action:** Configure port forwarding rules on APE estate router.

### Issue 5: J Division NIK_NOT_FOUND

**What:** J0127 employees have no NIK in DB_PTRJ.HR_EMPLOYEE. HR must populate.
**Impact:** These employees can't be enriched via NIK cascade.
**Action:** HR team to populate NIK for J0127 in DB_PTRJ.

### Issue 6: Pipeline Not Auto-Populating attendance_imports

**What:** sync-machines.ts generates scan_logs but does NOT automatically populate attendance_imports. The rebuild script must be run separately.
**Fix applied:** Added `attendance_pipeline_sync` job (60 min) to `src/config/schedule.json` — calls `rebuild-attendance-imports.js` per division.
**Action:** Monitor scheduler — verify imports grow after each sync cycle.

---

## Pre-Existing Issues (unchanged)

### 1. ZKTeco Password Hardcoded

**Location:** `_dev_utils/src/machine-sync.ts` or `ZKTECO_PASSWORD` env var
**Risk:** Low (standard default)
**Fix:** Moved to env var `ZKTECO_PASSWORD=12345`

### 2. SQL Injection Patterns

**Location:** Some legacy query files in `_dev_utils/`
**Risk:** MEDIUM — string interpolation in SQL
**Fix:** Use parameterized queries in mssql client

### 3. No Error Recovery / Retry

**Current:** Failed sync logs error and continues
**Fix:** Implement retry with exponential backoff

### 4. No Authentication System

**Current:** No login / JWT / roles
**Note:** Backend is internal-only (port 8004, behind VPN/network). Risk is low.

### 5. Limited Testing

**Current:** No unit/integration tests
**Fix:** Add test coverage

---

## Tech Debt Priority Matrix

| Priority | Debt | Effort | Impact |
|----------|------|--------|--------|
| HIGH | attendance_imports auto-rebuild | Low | Data gaps |
| HIGH | Port forwarding AB1/ARC | Network config | 17K records |
| MEDIUM | machine_user_raw refresh | Low | Name enrichment |
| MEDIUM | P2A/P2B network fix | Network config | 69 records |
| MEDIUM | J division NIK fix | HR process | J0127 unresolved |
| LOW | Unit tests | High | Bug detection |
| LOW | Auth system | Medium | Security |
| LOW | Error retry logic | Medium | Resilience |
