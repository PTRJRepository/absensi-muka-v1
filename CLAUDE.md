# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Sistem Absensi PT Rebinmas Jaya

Sistem monitoring dan penyimpanan data absensi dari 16 mesin absensi ZKTeco di berbagai lokasi perkebunan kelapa sawit ke database SQL Server terpusat.

## ⚠️ CRITICAL: IT Solution API Does NOT Exist

**There is NO IT Solution API.** All attendance data comes from ZKTeco machines only.
The `api-attendance-import.service.ts` file is DEPRECATED and must not be used.

## ⚠️ EMERGENCY RECOVERY STATUS: COMPLETE (2026-06-26)

Recovery + orphan rescue completed. Current production state:
- `attendance_scan_logs`: 808,104 rows (WIB-corrected)
- `attendance_imports`: **55,063 rows** (all 11 divisions enriched)
- `employees`: 8,005 rows — all 6,032 HR employees have correct `division_id`
- Scheduler: **ENABLED** (`src/config/schedule.json` `enabled: true`)
- `attendance_pipeline_sync`: **ENABLED** (was DISABLED — now runs every 60 min)
- Backend port: **8004** (`APP_PORT=8004`)

**Key fixes applied (2026-06-25 to 2026-06-26):**

| Fix | Detail |
|-----|--------|
| `division_id` backfill | 5,420 employees fixed via `hr_loc_code → divisions.division_code` |
| `attendance_imports.division_code` | All rows fixed via `employees → divisions` JOIN |
| `hr-employee-sync.service.ts` | Fixed `division_id` lookup: uses `hr_loc_code` (P1A) as key |
| `attendance-process-import.service.ts` | Added direct employee_code lookup fallback for PGE/MILL/APE numeric badge IDs |
| `migrations/074` | **NEW** — Converted 10,022 MANUAL_REVIEW orphans to enriched employee records |
| `schedule.json` | `attendance_pipeline_sync` **ENABLED** (60 min interval) |

**⚠️ DEPRECATED migrations — do NOT re-run:**
- `migrations/020_update_attendance_views.sql` — references `zkteco_hr_employee_map` (DROPPED 2026-06-24)
- `migrations/023_live_attendance_compat.sql` — references `zkteco_hr_employee_map` (DROPPED 2026-06-24)

**Known remaining issues:**
- **P2A/P2B: ~69 records** — machines on PGE estate network unreachable
- **AB1/ARC_01/ARC_02: port forwarding needed** on 103.144.208.154 router (~17K records inaccessible)
- **2 true orphan records** — MANUAL_REVIEW with date=2000-01-01 and empty `raw_device_user_id` (AB1, MILL)
- J division NIK_NOT_FOUND: J0127 employees have no NIK in DB_PTRJ

## Tech Stack

- **Runtime**: Node.js v22+
- **Database**: SQL Server via `mssql` (direct connection, target: `rebinmas_absensi_monitoring`)
- **ZKTeco**: `node-zklib@1.3.0` (TCP connection, port 4370)
- **Config**: Environment variables via `zod` validation
- **Frontend**: React 19 + Vite + TypeScript + React Query + React Router + Tailwind-like CSS

## Commands

```bash
# Backend (root directory)
npm run build           # Compile TypeScript → dist/
npm run start           # Start production server
npm run dev             # Start development (ts-node)
npm run db:migrate      # Run pending migrations from migrations/
npm run db:check        # Check database connection
npm run sync:machines   # Sync all active machines (CLI)

# Standalone scripts
node dist/scripts/rebuild-attendance-imports.js      # Rebuild attendance_imports from scan_logs
node dist/scripts/sync-hr-current-snapshot.js        # Sync HR snapshot (daily, --dry-run for preview)
node dist/scripts/sync-employees-from-hr.ts           # Sync employees from HR (called by snapshot sync)

# Frontend (frontend/ directory)
cd frontend && npm run dev      # Start dev server (port 5173)
cd frontend && npm run build   # Build production bundle
```

## Architecture Overview

```
Absensi_Muka/
├── src/
│   ├── server.ts              # Entry point (calls startSchedulerService on boot)
│   ├── api/                   # HTTP API layer (custom router, NOT Express/Fastify)
│   ├── modules/
│   │   ├── machines/         # ZKTeco TCP client, machine inventory
│   │   ├── employees/        # Employee CRUD, HR sync, device-to-employee mapping
│   │   ├── import/           # ZKTeco data import, sync orchestration
│   │   ├── attendance/       # Attendance process service (scan_logs → attendance_imports)
│   │   ├── monitoring/        # Dashboard, anomaly detection, alerts
│   │   ├── audit/            # Audit logging
│   │   ├── scheduler/        # Scheduler service
│   │   └── mapping/          # SSOT employee code parser
│   ├── shared/database/        # sql-client.ts (DB connection)
│   ├── config/                # Environment validation with Zod
│   └── scripts/              # CLI scripts (sync-machines, rebuild-attendance-imports, etc.)
├── frontend/                  # React frontend
├── migrations/               # SQL migrations (NNN_description.sql)
└── docs/                     # Documentation
```

## Sync Architecture: Complete Pipeline

The system syncs attendance data from ZKTeco machines → SQL Server only (one-way, no reverse sync).

```
SCHEDULER (server startup — src/config/schedule.json)
  │
  ├─ [1] Global sync (60 min): node sync-machines.js
  │     │
  │     ├─ Step 1: connectZkteco() — TCP socket to each machine
  │     ├─ Step 2: upsertMachineUser() — machine_user_raw (getUsers)
  │     ├─ Step 3: insertRawScan() — scan_logs with SSOT parser
  │     │        parsed_employee_code, mapping_status ('MAPPED'/'NEED_REVIEW')
  │     ├─ Step 4: enrichUserNames() — from machine_user_raw
  │     ├─ Step 5: enrichCurrentEmpCode() — NIK resolution cascade
  │     └─ Step 6: processScanLogsForBatch() — per-batch → attendance_imports
  │
  ├─ [2] attendance_pipeline_sync (60 min): node rebuild-attendance-imports.js
  │     │   Processes ALL pending MAPPED groups (NOT EXISTS → idempotent)
  │     │   Uses NIK cascade: scan_logs → employees → divisions
  │     │
  │     └─ Loop per division (P1A,P1B,P2A,P2B,DME,ARA,AB1,AB2,ARC,IJL,PGE)
  │          └─ While rows inserted > 0: INSERT attendance_imports
  │
  └─ [3] hr_snapshot_sync (1440 min / daily): node sync-hr-current-snapshot.js
        │
        ├─ Step A: hr_employee_current_snapshot ← db_ptrj.HR_EMPLOYEE
        │   ROW_NUMBER() PARTITION BY nik → current_rank=1
        └─ Step B: employees ← HR via MERGE
              nik, hr_loc_code, hr_status, hr_verified
              (division_id NOT synced — resolved via hr_loc_code lookup)
```

**Key entry points:**

| Entry Point | Mechanism | Use |
|---|---|---|
| Scheduler | `setInterval` → `child_process.fork` | Auto, every 60 min |
| HTTP API | `POST /api/ops/sync` | Manual per-machine trigger |
| CLI | `node dist/scripts/sync-machines.js` | Manual full sync |

## Employee Code Mapping Rules

**SSOT Parser:** `src/modules/mapping/zkteco-employee-code-parser.ts`

Format: `{locCode}{last 4 digits of raw_device_user_id}`

### Scanner Code → LocCode Mapping

| Scanner | Division | locCode | Example raw ID | Emp Code |
|---------|----------|---------|---------------|---------|
| 100 | P1A | A | `10044` | `A0044` |
| 200 | ARC | J | `20015` | `J0015` |
| 300 | P1B | B | `30232` | `B0232` |
| 400 | AB2 | H | `40001` | `H0001` |
| 500 | P2A | C | `50001` | `C0001` |
| 600 | P2B | D | `60010` | `D0010` |
| 700 | DME | E | `70088` | `E0088` |
| 800 | ARA | F | `80001` | `F0001` |
| 900 | AB1 | G | `90001` | `G0001` |
| — | IJL | L | `0010022` | `L0022` |

### NIK Resolution Cascade (3-step)

```
raw_device_user_id → parsed_employee_code (SSOT parser)
  └─ employees lookup → current_emp_code (NIK-based)
        └─ employees lookup (current) → employee_name, division_id
```

### Division Resolution

**division_code in attendance_imports comes from `employees.division_id → divisions.division_code`** — NOT from `parsed_division_code`.

Root cause of historical bug: `hr-employee-sync.service.ts` looked up `divisionMap` with key `locCode` (A, B, C...) instead of `hr_loc_code` (P1A, P2B...). All 6,032 HR employees got `division_id = NULL` because the keys didn't match. **Fixed:** direct lookup using `hr_loc_code` (P1A, P2B) in `divisionCodeMap`.

## Machine Configuration

Config file: `_dev_utils/src/machine-config.ts`

**Accessible (7):** OFFICE_PGE, OFFICE_APE, MILL, IJL, AB2, P1A, P1B
**Inaccessible (9):** DME_01, DME_02, ARC_01, ARC_02, ARA, AB1, P2A_01, P2B, P2A_02

**Network groupings:**
- `10.0.0.x` — PGE Estate (PGE, P1A, P1B, P2A_01, P2B, P2A_02)
- `103.144.228.42` — DME Estate (DME_01, DME_02)
- `103.144.208.154` — APE Estate (APE, AB1, AB2, ARC_01, ARC_02, ARA)
- `103.144.211.226` — IJL Estate
- `103.127.66.32` — MILL

## Database Tables (Current Schema — 2026-06-25)

### `attendance_scan_logs` (788,915 rows)
```
id bigint PK, machine_id int, machine_code, raw_device_user_id,
parsed_employee_code, parsed_division_code, mapping_status ('MAPPED'/'NEED_REVIEW'),
current_emp_code, current_employee_id, current_mapping_status,
raw_record_time (UTC), scan_time (WIB), scan_date (WIB),
sync_batch_id (nullable for backup data), ...
```

### `attendance_imports` (45,348 rows)
```
id bigint PK, employee_id (FK→employees, nullable), employee_code,
division_code (from employees→divisions JOIN),
attendance_date (2026-03-07 → 2026-06-25, 108 unique dates),
check_in_at, check_out_at,
attendance_status ('HADIR'/'INCOMPLETE_SCAN'/'MANUAL_REVIEW'),
source='ZKTECO', batch_id (nullable), needs_manual_review, ...
```

### `employees` (8,005 rows)
```
id, employee_code, employee_name, division_id (CORRECT!),
nik (HR-sourced), current_emp_code, hr_loc_code, hr_status,
zkteco_user_id, data_quality_status, ...
```

### `divisions` (11 real + 5 dummy)
```
id 6=P1A, 7=P1B, 8=P2A, 9=P2B, 10=DME, 11=ARA, 12=AB1, 13=AB2, 14=ARC, 15=IJL, 16=PGE
```

## Attendance Status Types

| Status | Description |
|--------|-------------|
| `HADIR` | Present (2+ scans per day) |
| `INCOMPLETE_SCAN` | Single scan (no check-out) |
| `MANUAL_REVIEW` | Unmapped/unresolved — needs review |

## Environment Variables

```env
DB_SERVER=10.0.0.110
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=<DB_PASSWORD>
DB_NAME=rebinmas_absensi_monitoring
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
JWT_SECRET=<JWT_SECRET>
JWT_EXPIRES_IN=7d
APP_PORT=8004
ZKTECO_PASSWORD=12345
ZKTECO_TIMEOUT_MS=30000
SYNC_INTERVAL_MINUTES=60
HR_DB_SERVER=10.0.0.110
```

## ⚠️ After any DB schema change: `npm run build` then restart server

## Documentation Files

| File | Purpose |
|------|---------|
| `docs/CRITICAL-INVESTIGATION-2026-06-25.md` | P0 incident: DB wipe, pipeline collapse, clock bug |
| `docs/SYNC-ARCHITECTURE.md` | Complete sync architecture (entry points, flow) |
| `docs/EMPLOYEE-DATA-FLOW.md` | 8-layer employee data architecture |
| `docs/EMPLOYEE-CODE-RESOLUTION-FULL-FLOW.md` | 4-stage code resolution |
| `docs/BUGS-FIXES.md` | Known issues |
| `docs/API.md` | Complete API reference |
| `docs/ai-context/` | Deep-dive docs: architecture, ZKTeco, database |
