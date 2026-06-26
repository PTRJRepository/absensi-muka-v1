---
name: sync-architecture-session
description: Dokumentasi session sync architecture - ZKTeco to Database
type: reference
date: 2026-06-23
session_context: ZKTeco Machine Sync Architecture Documentation
---

# AI Context - Sync Architecture Session

**Date:** 2026-06-23
**Topic:** ZKTeco Machine Sync Architecture Documentation
**Session:** Claude Code Interactive Session

---

## Session Overview

Membuat dokumentasi komprehensif tentang bagaimana sistem sync dari mesin ZKTeco ke database SQL Server.

---

## Key Findings

### 1. Arsitektur One-Way Sync

```
Mesin ZKTeco → Database SQL Server (PULL ONLY)
```

**TIDAK ADA reverse sync** — sistem tidak pernah push data ke mesin ZKTeco.

### 2. 3 Entry Points

| Entry Point | Mechanism | File |
|---|---|---|
| **Scheduler** | `setInterval` spawns CLI | `src/modules/scheduler/scheduler.service.ts` |
| **HTTP API** | `POST /api/ops/sync` | `src/api/routes/ops.routes.ts` |
| **CLI Script** | `node dist/scripts/sync-machines.js` | `src/scripts/sync-machines.ts` |

### 3. Employee Code Mapping

- **Only IDs > 5 digits** eligible for auto-mapping
- Scanner prefix → LocCode:
  - `100 → A (P1A)`
  - `200 → J (ARC)`
  - `300 → B (P1B)`
  - `400 → H (AB2)`
  - `500 → C (P2A)`
  - `600 → D (P2B)`
  - `700 → E (DME)`
  - `800 → F (ARA)`
  - `900 → G (AB1)`
  - `001 → L (IJL)`

### 4. Priority Cascade

```
Raw ID masuk
  ├─ employee_mapping_overrides (MANUAL) ─→ Priority 1
  ├─ employees.zkteco_user_id exact (EXACT_LONG_RAW_ID) ─→ Priority 2
  ├─ zkteco_hr_employee_map MANUAL ─→ Priority 3
  ├─ Panjang > 5 digits ─→ NEED_REVIEW (exclude)
  ├─ Scanner prefix found ─→ CONVERTED_LONG_RAW_ID
  └─ Fallback ─→ NEED_REVIEW
```

### 5. Database Tables

| Table | Fungsi |
|-------|--------|
| `attendance_scan_logs` | Normalized scan records |
| `attendance_imports` | Processed attendance (check_in/out) |
| `machine_user_raw` | Raw enrolled users |
| `machine_user_map` | Cache mapping |
| `employee_mapping_overrides` | Manual override |
| `attendance_import_batches` | CLI batch tracking |
| `import_batch` | Orchestrator batch tracking |

---

## Complete Sync Flow

```
sync-machines.ts (standalone)
    │
    ├── connectDb() → mssql ConnectionPool
    │
    ├── Query attendance_machines WHERE is_active=1 AND data_source='DIRECT_ZKTECO'
    │
    ├── For EACH machine:
    │     │
    │     ├─ connectZkteco(ip, port, password, timeoutMs)
    │     ├─ zk.disableDevice() ─→ Prevent new scans
    │     ├─ zk.getAttendances() ─→ Pull raw log
    │     ├─ zk.enableDevice() ─→ Always runs
    │     └─ zk.disconnect()
    │     │
    │     ├─ For EACH attendance record:
    │     │     ├─ normalizeRecord()
    │     │     ├─ insertRawLog() with dedup
    │     │     └─ rawCount++
    │     │
    │     ├─ rebuildImportsForMachineDates()
    │     │     Group by (emp_code, scan_date, machine_code)
    │     │     MIN/MAX → check_in_at/check_out_at
    │     │     MERGE INTO attendance_imports
    │     │
    │     └─ Update batch + machine status
    │
    └── Summary: success=N/total
```

---

## Key Files

| File | Lines | Role |
|------|-------|------|
| `src/scripts/sync-machines.ts` | 602 | Primary CLI sync script |
| `src/modules/import/sync-orchestrator.service.ts` | 433 | HTTP API sync path |
| `src/modules/machines/zkteco.service.ts` | 125 | ZKTeco TCP wrapper |
| `src/modules/scheduler/scheduler.service.ts` | 339 | In-memory scheduler |
| `src/modules/machines/tcp-accessibility.service.ts` | 193 | Fast TCP health check |
| `src/modules/employees/employee-mapping.service.ts` | 486 | Employee code mapping cascade |
| `src/modules/mapping/zkteco-employee-code-parser.ts` | 470 | Pattern-based ID parser |

---

## Error Handling

| Error | machine.access_status |
|-------|----------------------|
| `ECONNREFUSED` | `PORT_FORWARDING_NEEDED` |
| `ETIMEDOUT` | `TIMEOUT` |
| `ENETUNREACH` | `NETWORK_UNREACHABLE` |

**No auto-retry** — scheduler interval provides natural retry.

---

## Output Documentation

Dokumentasi lengkap disimpan di:
- `docs/SYNC-ARCHITECTURE.md` — Comprehensive sync documentation

---

## Related Memory

- `sync-architecture-2026-06-23.md` — Obsidian memory reference
