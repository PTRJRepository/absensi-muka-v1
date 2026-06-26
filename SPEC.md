# SPEC: Absensi Monitoring Dashboard & Import Control

## Context

- **App**: `D:/Gawean Rebinmas/Absensi_Muka` — Express + custom router API, port 3000
- **Database**: `rebinmas_absensi_monitoring` (SQL Server 10.0.0.110)
- **Source machines**: 16 ZKTeco biometric devices (already seeded in `attendance_machines`)
- **Raw data**: `attendance_scan_logs` → normalized → `attendance_imports`
- **Corporate colors**: dark navy `#071426`, green `#167A3A`

## Goal

Build a **professional admin dashboard** + **API endpoints** for:
1. Monitor all 16 ZKTeco machines — live status, last sync, record counts
2. Trigger sync manually per-machine or all-at-once (button)
3. Schedule auto-sync via cron (configurable per machine or global)
4. View sync history, batch status, error logs
5. Data quality overview

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no framework), professional admin panel design
- **Backend**: Existing Express-like custom router (`src/api/router.ts`)
- **Icons**: Lucide icons via CDN
- **Charts**: Chart.js via CDN
- **Auth**: Existing JWT middleware (same as app)
- **Serving**: Static files from `src/public/` served by Express

## Design Language

- Dark navy primary: `#071426`
- Green accent: `#167A3A`
- Light gray: `#F1F5F9` background
- White cards: `#FFFFFF`
- Font: Inter (Google Fonts)
- Professional admin panel — clean data tables, status badges, action buttons

## API Endpoints (new)

### Monitoring Dashboard
- `GET /api/monitoring/dashboard` → summary stats (machines online/offline, today's attendance, sync status)
- `GET /api/monitoring/machines` → all 16 machines with status, last sync, records
- `GET /api/monitoring/machine/:code` → single machine detail + recent syncs
- `GET /api/monitoring/batches` → recent import batches with pagination
- `GET /api/monitoring/batch/:id` → batch detail + raw log sample
- `GET /api/monitoring/sync-history` → last 100 sync log entries
- `GET /api/monitoring/errors` → failed syncs with error messages
- `GET /api/monitoring/quality` → data quality metrics (unmapped codes, duplicate rates)

### Import Control
- `POST /api/import/trigger` → body: `{ machineCode?: string }` — trigger sync for one or all machines
- `GET /api/import/schedule` → get current schedule config
- `PUT /api/import/schedule` → body: `{ enabled, intervalMinutes, machines?: string[] }`
- `GET /api/import/batch/:id/logs` → raw scan logs for a batch (paginated)
- `POST /api/import/batch/:id/retry` → retry failed records in a batch

### Scheduler Management
- `GET /api/scheduler/jobs` → list scheduled import jobs
- `POST /api/scheduler/jobs` → create a new scheduled job
- `DELETE /api/scheduler/jobs/:id` → remove a scheduled job
- `POST /api/scheduler/jobs/:id/run` → run job immediately

## Database Tables Used

```
attendance_machines       → machine config & status
attendance_sync_logs      → sync history
attendance_import_batches → batch records
attendance_scan_logs      → raw attendance data
attendance_imports        → normalized attendance
employees                 → employee master
divisions                 → division master
```

## Frontend Pages (Static HTML)

### 1. Dashboard (`/dashboard.html`)
- Summary cards: Total Machines, Online, Offline, Today's Attendance, Pending Syncs
- Machine status table with live indicators (green=ACCESSIBLE, red=offline)
- Recent sync activity timeline
- Quick action buttons: "Sync All", "View Logs"

### 2. Machines (`/machines.html`)
- Full machine list with: name, IP, port, location, status, last sync, record count
- Per-machine actions: Test Connection, Sync Now, Configure Schedule
- Machine detail modal

### 3. Import History (`/import-history.html`)
- Paginated batch table: batch code, machine, status, records total/success/failed, started/finished
- Click row → batch detail with raw log preview
- Filter by: machine, date range, status
- Export to CSV

### 4. Scheduler (`/scheduler.html`)
- List of scheduled jobs (global + per-machine)
- Form to create/edit schedule: interval (5min-4hr), machines selection, enable/disable
- Manual trigger button
- Job run history

### 5. Data Quality (`/data-quality.html`)
- Unmapped employee codes (raw device IDs not resolved)
- Duplicate records analysis
- Records per division chart (bar)
- Daily attendance trend (line chart)

## Implementation Notes

1. All API endpoints must check JWT auth (same as existing routes)
2. Sync trigger runs `sync-machines.js` via `child_process.spawn` — same logic as CLI
3. Scheduler uses in-memory scheduling + persists config to `src/config/schedule.json`
4. Dashboard auto-refreshes every 30 seconds
5. Machine status indicators update via API polling
6. Use existing `query()` helper from `src/lib/db.ts` for DB access in routes
7. Corporate dark navy + green color scheme throughout
