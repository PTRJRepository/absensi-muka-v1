# Sistem Absensi PT Rebinmas Jaya - Project Context

> **Purpose**: This file provides comprehensive project understanding for AI agents.
> **Last Updated**: 2026-06-19

---

## 1. Architecture Overview

### Tech Stack
- **Runtime**: Node.js v22+
- **Language**: TypeScript
- **Database**: SQL Server via `mssql` (direct connection)
- **ZKTeco Integration**: `node-zklib@1.3.0` (TCP connection to biometric machines)
- **API Fallback**: IT Solution REST API (for blocked machines)
- **Configuration**: Environment variables via `zod` validation
- **Frontend**: React 19 + TypeScript + Vite + TanStack Query v5

### System Context
```
┌─────────────────────────────────────────────────────────────────┐
│                    PT Rebinmas Jaya Attendance System             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ZKTeco Machines (7 accessible) ──TCP──► Node.js Backend        │
│  │ P1A, P1B, OFFICE_PGE, OFFICE_APE    │                        │
│  │ MILL, IJL, AB2                       │                        │
│                                          ▼                        │
│  IT Solution API ◄───────────────────► Import Service            │
│  (Fallback for blocked machines)         │                        │
│                                          ▼                        │
│                                   SQL Server                      │
│                                   (rebinmas_absensi_monitoring)   │
│                                          │                        │
│                                          ▼                        │
│                                   React Frontend                  │
│                                   (Port 3001)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure
```
Absensi_Muka/
├── src/
│   ├── api/                    # HTTP API layer
│   │   ├── router.ts          # Route registration & request handling
│   │   └── routes/           # API endpoint definitions
│   │       ├── auth.routes.ts
│   │       ├── dashboard.routes.ts
│   │       ├── attendance.routes.ts
│   │       ├── machines.routes.ts
│   │       ├── monitoring.routes.ts
│   │       ├── quality.routes.ts
│   │       ├── realtime.routes.ts
│   │       ├── scheduler.routes.ts
│   │       └── ...
│   ├── modules/              # Business logic
│   │   ├── machines/         # Machine management & ZKTeco
│   │   ├── employees/        # Employee data & mapping
│   │   ├── import/           # Data import (ZKTeco & API)
│   │   ├── attendance/       # Attendance processing
│   │   ├── monitoring/       # Dashboard & anomaly detection
│   │   └── audit/            # Audit logging
│   ├── lib/                  # Shared utilities
│   │   ├── db.ts            # SQL Server connection
│   │   └── realtime-emitter.ts # SSE event emitter
│   ├── config/              # Environment validation
│   └── scripts/             # CLI scripts
├── frontend/               # React frontend
│   └── src/
│       ├── components/     # UI components
│       ├── lib/api.ts     # API client
│       └── ...
├── _dev_utils/           # Development utilities
└── migrations/           # Database migrations
```

---

## 2. API Endpoints (Complete Reference)

### Authentication
| Method | Path | Description | Protected |
|--------|------|-------------|-----------|
| POST | `/api/auth/login` | User login | No |
| POST | `/api/auth/logout` | User logout | No |
| GET | `/api/auth/me` | Get current user | Yes |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/summary` | Dashboard summary with present/absent counts |
| GET | `/api/dashboard/division-summary` | Attendance by division |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/dashboard/sync-status` | Sync status |

### Machines
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/machines` | List all machines |
| GET | `/api/machines/failures` | Get machine failures |
| GET | `/api/machines/real-time-status` | Real-time machine status |
| POST | `/api/machines/:machineCode/test-connection` | Test machine connection |

### Attendance
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/attendance/daily` | Daily attendance view |
| GET | `/api/attendance/monthly` | Monthly summary |
| GET | `/api/attendance/summary` | Daily summary |
| GET | `/api/attendance/employee/:employeeCode` | Employee attendance |
| POST | `/api/attendance/process-scan-logs` | Process batch scan logs |
| GET | `/api/attendance/import-count` | Get import counts |

### Monitoring
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/monitoring/dashboard` | Monitoring dashboard |
| GET | `/api/monitoring/machines` | Machine list |
| GET | `/api/monitoring/machine/:code` | Machine detail |
| GET | `/api/monitoring/batches` | Import batches |
| GET | `/api/monitoring/quality` | Data quality metrics |
| GET | `/api/monitoring/division-summary` | Division summary |

### Quality
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/quality/dashboard-summary` | Quality summary |
| GET | `/api/quality/daily-trend` | Daily trend |
| GET | `/api/quality/unmapped` | Unmapped codes |
| GET | `/api/quality/duplicates` | Duplicate scans |
| GET | `/api/quality/machine-drift` | Machine time drift |
| GET | `/api/quality/report` | Quality report |
| GET | `/api/quality/summary` | Quick summary |

### Real-time (SSE)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/realtime/sync-status` | SSE sync status stream |
| GET | `/api/realtime/live-feed` | SSE live attendance feed |
| GET | `/api/realtime/events` | SSE all events stream |
| GET | `/api/realtime/stats` | Connection stats |
| GET | `/api/realtime/latest-scans` | Latest scans (polling) |

### Sync
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/monitoring/sync/:machineCode` | Trigger sync for one machine |
| POST | `/api/monitoring/sync-all` | Sync all machines |
| POST | `/api/monitoring/sync/:machineCode/ping` | Ping machine |
| GET | `/api/monitoring/sync-status/:id` | Get batch status |

### Scheduler
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scheduler/jobs` | List jobs |
| POST | `/api/scheduler/jobs` | Create job |
| PUT | `/api/scheduler/jobs/:name` | Update job |
| DELETE | `/api/scheduler/jobs/:name` | Delete job |
| POST | `/api/scheduler/jobs/:name/run` | Run job immediately |
| GET | `/api/scheduler/status` | Scheduler status |

### Alerts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/alerts/rules` | List alert rules |
| POST | `/api/alerts/rules` | Create alert rule |
| PUT | `/api/alerts/rules/:id` | Update alert rule |
| DELETE | `/api/alerts/rules/:id` | Delete alert rule |
| POST | `/api/alerts/run` | Run alerts manually |
| GET | `/api/alerts/history` | Alert history |
| GET | `/api/alerts/active` | Active alerts |

### Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reports/daily` | Daily report |
| GET | `/api/reports/monthly` | Monthly report |
| GET | `/api/reports/export/excel` | Export to Excel |

---

## 3. Database Schema

### Core Tables
```sql
-- Machine inventory
mst_machine (machine_code, machine_name, ip_address, port, scanner_code, loc_code, is_accessible)

-- Employee master
mst_employee (emp_code, emp_name, division_code, is_active)

-- Raw attendance logs from ZKTeco
attendance_raw_log (id, machine_code, user_id, timestamp, type, emp_code, processed)

-- Import batches
import_batch (batch_id, source, machine_code, records_total, records_success, status, started_at, completed_at)

-- Processed daily attendance
attendance_daily_process (id, emp_code, work_date, check_in, check_out, work_hours, status, division_code)

-- Cross-division reconciliation
attendance_division_reconcile (id, emp_code, work_date, original_division, reconciled_division, reason)
```

### Views (Required)
```sql
vw_attendance_final        -- Final attendance after reconciliation
vw_attendance_monthly_summary  -- Monthly aggregations
vw_attendance_daily_summary    -- Daily summaries
vw_sync_latest_status        -- Latest sync status per machine
```

---

## 4. Employee Code Format

Format: `{locCode}{last 4 digits of userId}`

| Machine | locCode | userId Input | emp_code |
|---------|---------|--------------|----------|
| P1A | A | "10044" | "A0044" |
| P1B | B | "30232" | "B0232" |
| IJL | L | "L0015" | "L0015" |

**Important**: Scanner code prefix (e.g., "100" in "10044") must be stripped before parsing.

---

## 5. Machine Configuration

### Accessible Machines (7)
- OFFICE_PGE, OFFICE_APE, MILL, IJL, AB2, P1A, P1B

### Blocked Machines (9) - Use API fallback
- DME_01, DME_02, ARC_01, ARC_02, ARA, AB1, P2A_01, P2B, P2A_02

**Config file**: `_dev_utils/src/machine-config.ts`

---

## 6. IT Solution API (Fallback)

```javascript
Base URL: http://10.0.0.110:5176
Header: x-api-key

GET /api/divisions
GET /api/available-months-by-division?division=PG1A
GET /api/attendance-by-division?division=PG1A&month=5&year=2026&mode=hk
```

---

## 7. Known Issues & Fixes Applied

### Fixed Issues (2026-06-19)
1. **Duplicate Routes**: Removed `quality-dashboard.routes.ts` import (duplicates `quality.routes.ts`)
2. **Silent Error Handling**: Fixed all `catch (e) {}` blocks to log errors properly
   - `realtime.routes.ts` - 3 blocks fixed
   - `alert.routes.ts` - 2 blocks fixed
3. **Division Mapping**: Added null/empty emp_code handling in `getHomeDivisionFromEmpCode`
4. **Unmapped Users Logging**: Now logs unmapped device users instead of silent skipping

### Frontend Fixes (2026-06-19)
1. **API Client**: Fixed type definitions and added `downloadFile` helper
2. **AttendancePage**: Fixed export link, added proper types, status badges
3. **RealtimePage**: Fixed React key issues, centralized data transformation
4. **QualityPage**: Added proper types for unmapped/duplicates
5. **Dashboard Components**: Created `KpiCard`, `MachineStatusGrid`, `QualityMetrics`
6. **LiveFeed**: SSE + polling fallback for real-time data
7. **MonitoringDashboard**: New comprehensive monitoring page

### Known Limitations
1. **Dual Database Config**: Import service uses different DB (`extend_db_ptrj`) than main app
2. **Auth Disabled**: Auth middleware allows anonymous access for all routes
3. **No Role-Based Access**: No granular permissions system
4. **Division Inferred from emp_code**: First character of emp_code determines division

### Required Database Views
```sql
-- Run these migrations to ensure views exist:
-- migrations/001_create_schema.sql
-- migrations/002_cross_division_sorting.sql

-- If views are missing, create them manually:
-- vw_attendance_final, vw_attendance_monthly_summary,
-- vw_attendance_daily_summary, vw_sync_latest_status
```

---

## 8. Environment Variables

```bash
# Database
DB_SERVER=10.0.0.110
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=<password>
DB_NAME=rebinmas_absensi_monitoring

# Auth
JWT_SECRET=<secret>

# ZKTeco
ZKTECO_PASSWORD=12345
ZKTECO_TIMEOUT_MS=30000

# Frontend
VITE_API_BASE_URL=/
```

---

## 9. Commands

```bash
# Backend
npm run build          # Compile TypeScript
npm run start          # Start production server
npm run dev           # Start development (ts-node)

# Database
npm run db:migrate    # Run migrations
npm run db:check      # Check database status

# Sync
npm run sync:machines  # Sync from all machines

# Frontend
npm run frontend:dev   # Start frontend dev server (port 3001)
```

---

## 10. Key Patterns

### Route Registration
```typescript
// src/api/routes/index.ts
route('GET', '/api/machines', getMachinesHandler, { protected: true });
```

### SQL Client Usage
```typescript
import { query } from '../../lib/db';
const results = await query<any>('SELECT * FROM mst_machine WHERE is_active = 1');
```

### ZKTeco Service
```typescript
import { ZktecoService } from '../../modules/machines/zkteco.service';
const zkteco = new ZktecoService({ machineCode, ipAddress, port, password });
const result = await zkteco.connect();
if (result.success) {
  const users = await zkteco.fetchUsers();
  const records = await zkteco.fetchAttendanceRecords();
}
```

---

## 11. For New Agents

When working on this codebase:

1. **Start Here**: Read this file first for project overview
2. **API Issues**: Check `src/api/routes/` for route handlers
3. **Database**: All DB queries go through `src/lib/db.ts`
4. **ZKTeco Problems**: Check `_dev_utils/src/machine-config.ts` for machine IPs
5. **Frontend Issues**: Check `frontend/src/lib/api.ts` for API client config
6. **Real-time**: SSE endpoints use `src/lib/realtime-emitter.ts`

**Emergency Contacts**:
- Database Admin: Check `src/lib/db.ts` for connection details
- Machine Issues: Check `_dev_utils/src/machine-config.ts`
