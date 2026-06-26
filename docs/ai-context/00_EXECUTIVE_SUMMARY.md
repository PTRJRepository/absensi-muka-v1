---
tags: [ai-context, executive-summary, documentation]
created: 2026-06-07
---

# Executive Summary: Sistem Absensi PT Rebinmas Jaya

## Project Overview

A centralized attendance monitoring system that aggregates data from 15 biometric machines across multiple oil palm plantation locations into a unified SQL Server database.

## Key Metrics

| Metric | Value |
|--------|-------|
| Machines Monitored | 15 |
| Divisions | 13 |
| Employees | ~4,600+ |
| Attendance Records | 54,000+ |
| Sync Interval | 15 minutes |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ATTENDANCE DATA FLOW                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐          ┌──────────────┐         ┌────────────┐ │
│   │ 8 ZKTeco    │──────────│ node-zklib   │─────────│ SQL Server │ │
│   │ Machines    │  TCP     │ (Direct)     │ HTTP    │ Gateway    │ │
│   └─────────────┘          └──────────────┘         └────────────┘ │
│                                                                     │
│   ┌─────────────┐          ┌──────────────┐         ┌────────────┐ │
│   │ 7 Machines  │──────────│ IT Solution  │─────────│ extend_   │ │
│   │ (API only)  │  REST    │ API          │ POST    │ db_ptrj    │ │
│   └─────────────┘          └──────────────┘         └────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Sources

1. **Direct ZKTeco (8 machines):** PGE, MILL, DME_01, DME_02, ARE, IJL, ARA, AB2
2. **API Only (7 machines):** P1A, P1B, P2A, P2B, AB1, ARC_01, ARC_02

## Database Schema

| Table | Purpose | Type |
|-------|---------|------|
| `absen_import` | Raw attendance data | IMMUTABLE |
| `absen_machine_input` | Manual corrections | MUTABLE |
| `absen_import_batch` | Batch tracking | AUDIT |
| `absen_change_log` | Change audit trail | AUDIT |
| `absen_sync_log` | Sync operation logs | AUDIT |
| `absen_config` | System configuration | CONFIG |

## Tech Stack

- **Runtime:** Node.js v22.14.0 / Bun
- **Libraries:** node-zklib@1.3.0, mssql@12.5.5, node-cron
- **Database:** SQL Server via HTTP Gateway
- **Protocol:** ZKTeco TCP (port 4370+), REST API

## Current Status (2026-06-07)

- 15 machines identified and configured
- 8 machines accessible via direct ZKTeco
- 7 machines accessible via IT Solution API
- Database schema deployed
- Initial data imported
- Auto-sync scheduler implemented

## Key Files

- `D:/Gawean Rebinmas/Absensi_Muka/_dev_utils/src/config.ts` - Configuration
- `D:/Gawean Rebinmas/Absensi_Muka/_dev_utils/src/machine-config.ts` - Machine mapping
- `D:/Gawean Rebinmas/Absensi_Muka/_dev_utils/src/sync.ts` - Sync logic
- `D:/Gawean Rebinmas/Absensi_Muka/_dev_utils/schema.sql` - Database schema

## Next Development Phase

1. Complete full data import pipeline
2. Set up monitoring dashboard
3. Implement alerting for sync failures
4. Add data validation and reconciliation
