---
tags: [ai-context, architecture, deprecated]
created: 2026-06-07
updated: 2026-06-26
---

# Dual Data Source Architecture

## DEPRECATED (2026-06-25)

**IT Solution REST API is NO LONGER OPERATIONAL.** All attendance data now comes exclusively from ZKTeco machines via direct TCP connection.

This document is kept for historical reference only. The system has been converted to ZKTeco-only data source.

---

## Historical: Original Architecture (Pre-2026-06-25)

The system previously integrated two data sources:

1. **ZKTeco Direct Connection** — Raw attendance logs from accessible machines
2. **IT Solution REST API** — `http://10.0.0.110:5176` — was used to fill gaps for machines without direct access (P1A, P1B, P2A, P2B, etc.)

**Root cause of decommission:** IT Solution API became non-operational. Pipeline fallback logic silently degraded — IT Solution data was marked as source='IT_SOLUTION' but never enriched with employee_name/division_id because it bypassed the NIK cascade. Recovery confirmed: all attendance_imports rows (except ZKTeco-sourced) had NULL enrichment columns.

---

## Current: ZKTeco-Only Architecture

### Accessible Machines (10 confirmed ZKTeco)

| Machine | IP | Port | Division | LocCode | Network |
|---------|-----|------|----------|---------|---------|
| OFFICE_PGE | 10.0.0.232 | 4370 | PGE | A | Local (PGE estate) |
| P1A | 10.0.0.90 | 4100 | P1A | A | Local (PGE estate) |
| P1B | 10.0.0.91 | 4300 | P1B | B | Local (PGE estate) |
| MILL | 103.127.66.32 | 4370 | MILL | — | Public direct |
| OFFICE_APE | 103.144.208.154 | 4370 | ARE | — | Public |
| IJL | 103.144.211.226 | 4370 | IJL | L | Public direct |
| AB2 | 103.144.208.154 | 4400 | AB2 | H | Public |
| DME_01 | 103.144.228.42 | 4700 | DME | E | Public |
| DME_02 | 103.144.228.42 | 4701 | DME | E | Public |
| ARA | 103.144.208.154 | 4800 | ARA | F | Public |

### Inaccessible Machines (6)

| Machine | IP | Port | Issue | LocCode |
|---------|-----|------|--------|---------|
| AB1 | 103.144.208.154 | 4900 | Port forwarding needed | G |
| ARC_01 | 103.144.208.154 | 4200 | Port forwarding needed | J |
| ARC_02 | 103.144.208.154 | 4201 | Port forwarding needed | J |
| P2A | 10.0.0.92 | 4500 | Network unreachable (PGE estate) | C |
| P2B | 10.0.0.93 | 4600 | Network unreachable (PGE estate) | D |

### Connection Pattern

```typescript
const zk = new ZKLib({
  ip: config.ip,
  port: config.port,
  timeout: 30000,
  connectionTimeout: 5000
});

await zk.createSocket();
await zk.zklibTcp.disableDevice();

const users = await zk.zklibTcp.getUsers();        // -> machine_user_raw
const attendance = await zk.zklibTcp.getAttendances(); // -> attendance_scan_logs

await zk.zklibTcp.enableDevice();
await zk.disconnect();
```

### Employee Code Mapping (Scanner Suffix → LocCode)

| Machine | Suffix | LocCode | EmpCode Prefix |
|---------|--------|---------|----------------|
| P1A | 100 | A | A |
| ARC_01/02 | 200 | J | J |
| P1B | 300 | B | B |
| AB2 | 400 | H | H |
| P2A | 500 | C | C |
| P2B | 600 | D | D |
| DME_01/02 | 700 | E | E |
| ARA | 800 | F | F |
| AB1 | 900 | G | G |
| IJL | — | L | L |

Format: `{locCode}{last 4 digits of raw_device_user_id}`
Example: `10044` → `A0044` (P1A machine, suffix 100 → locCode A)

### NIK Resolution Cascade

```
raw_device_user_id → SSOT parser → parsed_employee_code
  └─ employees lookup (by employee_code) → current_emp_code (NIK-based)
        └─ hr_employee_current_snapshot → employee_name, division_id
```

Authority: `current_emp_code` (DB_PTRJ HR) > `parsed_employee_code` (SSOT parser)

---

## Data Source Comparison (Pre vs Post)

| Aspect | ZKTeco-Only (Current) | IT Solution API (Historical) |
|--------|----------------------|------------------------------|
| Employee Count | ~8,000 (all HR) | ~4,600 (active enrolled) |
| Division Coverage | 10 accessible | 13 (API-based) |
| Granularity | Raw timestamps | Processed daily |
| Latency | Real-time | Daily batch |
| Enrichment | Full (NIK cascade) | NULL (bypassed cascade) |

---

## Source: See Also

- `docs/ai-context/18_CURRENT_STATUS.md` — Current DB state
- `docs/SYNC-ARCHITECTURE.md` — Complete sync pipeline
- `docs/CRITICAL-INVESTIGATION-2026-06-25.md` — Root cause analysis
