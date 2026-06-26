---
tags: [ai-context, project-overview]
created: 2026-06-07
---

# Project Overview: Sistem Absensi PT Rebinmas Jaya

## Project Name

Sistem Absensi Muka PT Rebinmas Jaya (Attendance Monitoring System)

## Project Location

```
D:/Gawean Rebinmas/Absensi_Muka/
```

## Project Purpose

Centralized monitoring and storage of attendance data from 15 biometric machines at various oil palm plantation locations into a unified SQL Server database via HTTP Gateway.

## Scope

### In Scope
- 15 biometric attendance machines (ZKTeco + others)
- 13 divisions across plantation locations
- ~4,600+ employees
- Daily attendance data sync
- Overtime tracking
- Leave and sick day management

### Out of Scope
- Payroll processing
- HR management
- Employee onboarding/offboarding
- Face recognition (future consideration)

## Key Stakeholders

| Role | Responsibility |
|------|----------------|
| IT Department | System maintenance, network infrastructure |
| HR Department | Data verification, manual corrections |
| Plantation Managers | Division-level attendance monitoring |
| Management | Reports and analytics |

## Project Duration

- **Start Date:** 2026-05-29
- **Current Phase:** Implementation
- **Target Completion:** Q2 2026

## Key Deliverables

1. **Data Collection Layer** - Node.js scripts for machine data extraction
2. **Database Schema** - SQL Server tables for attendance storage
3. **Sync Pipeline** - Automated 15-minute data synchronization
4. **API Integration** - IT Solution REST API client
5. **Documentation** - Complete technical documentation

## Constraints

- Network connectivity to remote plantation sites
- Port forwarding requirements for certain machines
- Non-ZKTeco devices (P1A, P1B) require API fallback
- SQL Gateway requires specific API key authentication

## Related Documentation

- `01_PROJECT_OVERVIEW.md` - This file
- `02_TECH_STACK.md` - Technology details
- `03_FOLDER_STRUCTURE.md` - Project structure
- `04_MODULE_MAP.md` - Module inventory
- `06_BACKEND_CONTEXT.md` - Backend architecture
- `07_DATABASE_CONTEXT.md` - Database details
- `08_API_CONTEXT.md` - API integration
