---
tags: [ai-context, ai-handoff, safe-share]
created: 2026-06-07
---

# AI Handoff Context (Safe for External Sharing)

## Project Summary

**Project:** Sistem Absensi PT Rebinmas Jaya
**Type:** Attendance data synchronization system
**Status:** Implementation in progress

A centralized system that aggregates attendance data from 15 biometric machines across oil palm plantation locations into a unified SQL Server database.

---

## Architecture (High-Level)

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA FLOW                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   15 Biometric Machines ─────┬────→ IT Solution API          │
│   (ZKTeco + others)          │              │                │
│                               │              ▼                │
│                               │      Node.js Pipeline         │
│                               │              │                │
│                               └───────→ SQL Server DB         │
│                                              │                │
│                                              ▼                │
│                                       SQL Gateway             │
│                                       (HTTP POST)              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Data Sources

| Source | Count | Data Type |
|--------|-------|-----------|
| ZKTeco Machines | 8 | Raw attendance logs |
| IT Solution API | 13 divisions | Structured daily data |

### 2. Database

| Component | Value |
|-----------|-------|
| Type | SQL Server |
| Server | SERVER_PROFILE_1 |
| Database | extend_db_ptrj |
| Tables | 6 (import, machine_input, batch, change_log, config, sync_log) |

### 3. Synchronization

- Interval: 15 minutes
- Modes: Work day (hk) and overtime (ot)
- Logging: Full audit trail

---

## Employee Code Format

Format: `{LocationPrefix}{4-digit Number}`

| Prefix | Division |
|--------|----------|
| A | PG1A, PGE |
| B | PG1B |
| C | PG2A |
| D | PG2B |
| E | DME |
| F | ARA |
| G | AB1 |
| H | AB2 |
| J | ARC |
| L | IJL |

**Example:** A0039, L10002, E0001

---

## Data Schema

### absen_import (Immutable)
Raw attendance from machines - cannot be edited.

### absen_machine_input (Mutable)
Manual corrections and overrides.

### absen_change_log (Audit)
Full audit trail of all changes.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js v22.14.0 / Bun |
| ZKTeco Library | node-zklib@1.3.0 |
| Database Driver | mssql@12.5.5 |
| Scheduling | node-cron / setInterval |

---

## Division Coverage

All 13 divisions are covered:

PG1A, PG1B, PG2A, PG2B, DME, ARA, ARB1, ARB2, INFRA, AREC, IJL, STF-OFFICE, SECURITY

Plus: PGE (Head Office), MILL (Mill Office)

---

## Key Files

| File | Purpose |
|------|---------|
| `config.ts` | Configuration (API URLs, sync settings) |
| `machine-config.ts` | Machine IP/port mappings |
| `absensi-client.ts` | IT Solution API client |
| `sql-client.ts` | SQL Gateway client |
| `sync.ts` | Main sync logic |
| `scheduler.ts` | Auto-sync scheduler |
| `database.ts` | Schema definitions |
| `schema.sql` | SQL Server schema |

---

## External Services

| Service | URL | Purpose |
|---------|-----|---------|
| IT Solution API | http://10.0.0.110:5176 | Primary data source |
| SQL Gateway | http://10.0.0.110:8001/v1/query | Database access |

---

## Development Workflow

```bash
# Run manual sync
npm run sync

# Run scheduled sync
npm run sync:schedule

# Test machine connection
bun run _dev_utils/src/machine-sync.ts

# Initialize database
bun run _dev_utils/src/init-db.ts
```

---

## Important Notes

1. **Immutability:** `absen_import` table data cannot be modified
2. **Corrections:** Use `absen_machine_input` for manual corrections
3. **Audit Trail:** All changes logged in `absen_change_log`
4. **API Fallback:** All machines have data available via API

---

## Common Operations

### Query Attendance
```sql
SELECT * FROM absen_import
WHERE division = 'PG1A' AND year = 2026 AND month = 6
ORDER BY emp_code, day;
```

### Check Sync Status
```sql
SELECT TOP 10 * FROM absen_sync_log
ORDER BY sync_date DESC;
```

### Get Verification Data
```sql
SELECT * FROM absen_verification
WHERE division = 'PG1A' AND year = 2026 AND month = 6;
```

---

## Project Location

```
D:/Gawean Rebinmas/Absensi_Muka/
```

---

## Documentation Index

| Document | Description |
|----------|-------------|
| `00_EXECUTIVE_SUMMARY.md` | Project summary |
| `01_PROJECT_OVERVIEW.md` | Project details |
| `02_TECH_STACK.md` | Technology used |
| `03_FOLDER_STRUCTURE.md` | File organization |
| `04_MODULE_MAP.md` | Module inventory |
| `06_BACKEND_CONTEXT.md` | Backend architecture |
| `07_DATABASE_CONTEXT.md` | Database schema |
| `08_API_CONTEXT.md` | API endpoints |
| `10_BUSINESS_FLOW.md` | Business processes |
| `18_CURRENT_STATUS.md` | Current status |
| `README.md` | This documentation index |

---

## Safe to Share

This document contains:
- Architecture overview
- Technology stack
- Data schema
- Common operations
- Development workflow

This document does NOT contain:
- API keys or passwords
- Personal employee data
- Internal network details
- Security vulnerabilities

---

*Generated: 2026-06-07*
*Project: Sistem Absensi PT Rebinmas Jaya*
