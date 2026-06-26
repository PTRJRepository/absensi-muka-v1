# FEATURES - Status Semua Fitur

## Ringkasan Status

| Status | Icon | Deskripsi |
|--------|------|-----------|
| WORKING | [OK] | Berfungsi penuh |
| PARTIAL | [W] | Berfungsi tapi ada masalah |
| BROKEN | [X] | Tidak berfungsi |
| NOT IMPLEMENTED | [  ] | Belum diimplementasi |

---

## Backend Modules

### 1. Machines Module [OK] WORKING

| Fitur | File | Status | Catatan |
|-------|------|--------|---------|
| Machine Repository | machine.repository.ts | [OK] | CRUD untuk mst_machine |
| Machine Service | machine.service.ts | [OK] | Business logic layer |
| ZKTeco Communication | zkteco.service.ts | [OK] | TCP connection to devices |
| Connection Testing | machines.routes.ts | [OK] | Test connection endpoint |

**ZKTeco Service:**
- Connect via node-zklib
- Fetch users and attendance
- Error classification (CONNECTION_REFUSED, TIMEOUT, etc.)

### 2. Employees Module [OK] WORKING

| Fitur | File | Status | Catatan |
|-------|------|--------|---------|
| Employee Repository | employee.repository.ts | [OK] | CRUD untuk mst_employee |
| Employee Mapping | employee-mapping.service.ts | [OK] | Scanner code -> emp_code |
| Employee Movement | employee-movement.service.ts | [OK] | Division history |
| Employee Code Mapper | employee-code-mapper.ts | [OK] | Lightweight mapping |

**[W] ISSUES:**
- Scanner mappings hardcoded in code (should be database-driven)
- Two different mapping implementations exist

### 3. Attendance Module [W] PARTIAL

| Fitur | File | Status | Catatan |
|-------|------|--------|---------|
| Raw Repository | attendance-raw.repository.ts | [OK] | Query attendance_raw_log |
| Process Service | attendance-process.service.ts | [OK] | Uses SqlClient pattern |
| Process Import | attendance-process-import.service.ts | [OK] | Uses direct SQL |
| Reconcile Service | attendance-reconcile.service.ts | [OK] | Division reconciliation |

**[W] CRITICAL: Duplicate Processing Systems**
Two separate implementations exist - see Known Issues.

### 4. Import Module [W] PARTIAL

| Fitur | File | Status | Catatan |
|-------|------|--------|---------|
| Import Job Service | import-job.service.ts | [OK] | Basic job management |
| Direct ZKTeco Import | direct-zkteco-import.service.ts | [W] | Pseudo-code comment at line 58 |
| Manual Import | manual-import.service.ts | [OK] | CSV/DAT parsing |
| Sync Orchestrator | sync-orchestrator.service.ts | [OK] | Coordinates sync |
| Batch Import Control | import-control.routes.ts | [OK] | Trigger/schedule/retry |

**[W] ISSUE: Unmapped users silently dropped during sync**

### 5. Monitoring Module [W] PARTIAL

| Fitur | File | Status | Catatan |
|-------|------|--------|---------|
| Anomaly Service | anomaly.service.ts | [OK] | Basic detection |
| Summary Service | summary.service.ts | [OK] | Daily stats |
| Dashboard Service | dashboard.service.ts | [OK] | Dashboard aggregation |
| Alert Service | alert.service.ts | [W] | NOTIFICATIONS ARE PLACEHOLDERS |
| Live Feed Service | live-feed.service.ts | [OK] | SSE support |
| Data Quality Service | data-quality.service.ts | [OK] | Quality checks |
| Ops Intelligence | ops.routes.ts | [OK] | Summary/incidents/recommendations |
| Cross-Location | cross-location.routes.ts | [OK] | Scanner prefix audit |

**[W] CRITICAL: Alert notifications are placeholders only**

### 6. Audit Module [OK] WORKING

| Fitur | File | Status | Catatan |
|-------|------|--------|---------|
| Change Logging | audit.service.ts | [OK] | Tracks CREATE/UPDATE/DELETE |
| Audit Query | audit.service.ts | [OK] | By entity, user, date range |
| Cleanup | audit.service.ts | [OK] | Retention policy |

### 7. Scheduler Module [OK] WORKING

| Fitur | File | Status | Catatan |
|-------|------|--------|---------|
| Job Management | scheduler.service.ts | [OK] | In-memory scheduling |
| Config Persistence | schedule.json | [OK] | Saves configuration |
| Process Spawning | scheduler.service.ts | [OK] | Runs sync-machines.js |
| Job CRUD | scheduler.routes.ts | [OK] | Full job lifecycle |
| Real-time Status | realtime-status.routes.ts | [OK] | Machine live status |

### 8. Mapping Module [OK] WORKING

| Fitur | File | Status | Catatan |
|-------|------|--------|---------|
| Scanner Division Map | employee-code-mapper.ts | [OK] | Hardcoded mappings |
| Employee Code Generation | employee-code-mapper.ts | [OK] | prefix + last4 digits |
| 7-digit Handling | employee-code-mapper.ts | [OK] | Division prefix stripping |
| Mapping Review | mapping.routes.ts | [OK] | Review & preview endpoints |

---

## Frontend Pages

### 1. Dashboard Page [OK] WORKING

**File:** `frontend/src/components/features/dashboard/DashboardPage.tsx`

| Fitur | Status | API Endpoints |
|-------|--------|---------------|
| KPI Cards | [OK] | /api/dashboard/stats |
| Machine Status Grid | [OK] | /api/machines |
| Quality Metrics | [OK] | /api/quality/summary |
| Last Sync Timestamp | [OK] | - |

### 2. Machines Page [OK] WORKING

**File:** `frontend/src/components/features/machines/MachinesPage.tsx`

| Fitur | Status | API Endpoints |
|-------|--------|---------------|
| Machine Grid View | [OK] | /api/machines |
| Status Indicators | [OK] | - |
| Search & Filter | [OK] | - |
| Sync All Button | [OK] | POST /api/scheduler/sync-all |
| Per-Machine Sync | [OK] | POST /api/scheduler/sync/:code |
| Machine Detail Modal | [OK] | /api/monitoring/machine/:code/* |

**MachineDetailModal:**
- Dual-mode toggle (Data Mesin / Database)
- User mapping summary
- Raw scan logs

### 3. Attendance Page [OK] WORKING (with BUG)

**File:** `frontend/src/components/features/attendance/AttendancePage.tsx`

| Fitur | Status | API Endpoints |
|-------|--------|---------------|
| Daily Attendance List | [OK] | /api/attendance/daily |
| Division Filter | [OK] | /api/divisions |
| Status Filter | [OK] | - |
| Employee Search | [OK] | - |
| Employee Detail Modal | [X] | BROKEN - Missing icon imports |
| Pagination | [OK] | - |

**[X] BUG: EmployeeDetailModal missing icon imports**
- `LogIn`, `LogOut`, `Activity`, `Fingerprint` not imported
- `X` not imported
- **Impact:** Modal will crash on render

### 4. Attendance Matrix Page [OK] WORKING

**File:** `frontend/src/components/features/matrix/AttendanceMatrixPage.tsx`

| Fitur | Status | API Endpoints |
|-------|--------|---------------|
| Monthly Calendar Grid | [OK] | /api/attendance/monthly-matrix |
| Monthly Matrix Traceable | [OK] | /api/attendance/monthly-matrix-traceable |
| Dual Mode Toggle | [OK] | - |
| Division Filter | [OK] | /api/divisions |
| Year/Month Selectors | [OK] | - |
| Employee Search | [OK] | - |
| Scan Indicators | [OK] | - |

**[W] ISSUES:**
- Source vs compiled code mismatch
- Hardcoded division-to-machine mapping

### 5. Realtime Page [W] PARTIAL

**File:** `frontend/src/components/features/realtime/RealtimePage.tsx`

| Fitur | Status | API Endpoints |
|-------|--------|---------------|
| SSE Live Feed | [OK] | /api/realtime/live-feed (SSE) |
| SSE Sync Status | [OK] | /api/realtime/sync-status (SSE) |
| SSE All Events | [OK] | /api/realtime/events (SSE) |
| Polling Fallback | [OK] | /api/realtime/latest-scans |
| Feed Stats Fallback | [OK] | /api/realtime/feed-stats |
| Scan Counter | [OK] | - |
| Real-time Table | [OK] | - |
| SSE Connection Stats | [OK] | /api/realtime/stats |

**[W] ISSUE:** SSE reconnection logic missing

### 6. Monitoring Dashboard [OK] WORKING

**File:** `frontend/src/components/features/monitoring/MonitoringDashboard.tsx`

| Fitur | Status | API Endpoints |
|-------|--------|---------------|
| KPI Cards | [OK] | /api/dashboard/stats |
| Machine Status | [OK] | /api/machines |
| Quality Metrics | [OK] | /api/quality/summary |
| Division Summary | [OK] | /api/dashboard/division-summary |
| Machine Cross-Location | [OK] | /api/monitoring/cross-location |

### 7. Quality Page [OK] WORKING

**File:** `frontend/src/components/features/quality/QualityPage.tsx`

| Fitur | Status | API Endpoints |
|-------|--------|---------------|
| Quality Score Display | [OK] | /api/quality/summary |
| Metrics Table | [OK] | /api/quality/summary |
| Unmapped Count | [OK] | /api/quality/unmapped |
| Duplicate Count | [OK] | /api/quality/duplicates |
| Daily Trend | [OK] | /api/quality/daily-trend |
| Machine Drift | [OK] | /api/quality/machine-drift |
| Quality Report | [OK] | /api/quality/report |

### 8. Alert Page [OK] WORKING (Display Only)

**File:** `frontend/src/components/features/alerts/AlertPage.tsx`

| Fitur | Status | API Endpoints |
|-------|--------|---------------|
| Alert Summary | [OK] | /api/alerts/active |
| Alert List | [OK] | /api/alerts/active |
| Alert Rules Display | [OK] | /api/alerts/rules |
| Alert Rules CRUD | [OK] | POST/PUT/DELETE /api/alerts/rules |
| Alert History | [OK] | /api/alerts/history |
| Run Alerts | [OK] | POST /api/alerts/run |
| Default Rules Seed | [OK] | POST /api/alerts/defaults/seed |
| Severity Filtering | [OK] | - |
| Auto-refresh (30s) | [OK] | - |

**[W] NOTE:** UI display only - notifications NOT sent (email/SMS/webhook placeholders)

### 9. Batch History Page [OK] WORKING

**File:** `frontend/src/components/features/batches/BatchHistoryPage.tsx`

| Fitur | Status | API Endpoints |
|-------|--------|---------------|
| Batch History Table | [OK] | /api/monitoring/batches |
| Status Filter | [OK] | - |
| Machine Filter | [OK] | - |
| Pagination | [OK] | - |
| Batch Detail | [OK] | /api/monitoring/batch/:id |
| Batch Logs | [OK] | /api/monitoring/batch/:id/logs |
| Batch Retry | [OK] | /api/import/batch/:id/retry |

### 10. Settings Page [OK] WORKING

**File:** `frontend/src/components/features/settings/SettingsPage.tsx`

| Fitur | Status | API Endpoints |
|-------|--------|---------------|
| Scheduler Status | [OK] | /api/scheduler/status |
| System Info | [OK] | - |
| Division List | [OK] | /api/divisions |

---

## API Endpoints Summary

**Total: 93 endpoints across 23 route files**

| Route File | Endpoints | Status |
|-----------|-----------|--------|
| auth.routes.ts | 3 | [OK] Working |
| attendance.routes.ts | 15 | [OK] Working |
| attendance-process.routes.ts | 3 | [OK] Working |
| monitoring.routes.ts | 9 | [OK] Working |
| machines.routes.ts | 3 | [OK] Working |
| employees.routes.ts | 4 | [OK] Working |
| import.routes.ts | 3 | [W] Partial |
| import-control.routes.ts | 6 | [OK] Working |
| quality.routes.ts | 7 | [OK] Working |
| quality-dashboard.routes.ts | 2 | [W] Duplicate of quality.routes.ts |
| realtime.routes.ts | 6 | [W] Partial (SSE missing reconnection) |
| realtime-status.routes.ts | 1 | [OK] Working |
| alert.routes.ts | 9 | [W] Display only |
| division.routes.ts | 8 | [OK] Working |
| dashboard.routes.ts | 4 | [W] Hardcoded values |
| ops.routes.ts | 3 | [OK] Working |
| cross-location.routes.ts | 0 | [OK] Utility functions (imported by other routes) |
| machine-employee.routes.ts | 4 | [OK] Working |
| scheduler.routes.ts | 10 | [OK] Working |
| sync.routes.ts | 4 | [OK] Working |
| reports.routes.ts | 3 | [OK] Working |
| audit.routes.ts | 1 | [OK] Working |
| mapping.routes.ts | 2 | [OK] Working |

---

## Common Components

| Component | Path | Status |
|-----------|------|--------|
| KpiCard | common/KpiCard | [OK] |
| FilterBar | common/FilterBar | [OK] |
| Badge | common/Badge | [OK] |
| Button | common/Button | [OK] |
| DataTable | common/DataTable | [OK] |
| ErrorBoundary | common/ErrorBoundary | [OK] |
| Header | layout/Header | [OK] |
| StatusDot | common/StatusDot | [OK] |
| Skeleton | common/Skeleton | [OK] |

---

## Implemented Features (New)

The following features were added and are now IMPLEMENTED:

| Feature | Route File | Endpoints | Status |
|---------|-----------|-----------|--------|
| Real-time SSE | realtime.routes.ts | 6 | [OK] Working |
| Alert Rules Management | alert.routes.ts | 9 | [W] Display only |
| Data Quality Dashboard | quality.routes.ts | 7 | [OK] Working |
| Ops Intelligence | ops.routes.ts | 3 | [OK] Working |
| Monthly Matrix Traceable | attendance.routes.ts | (part of 15) | [OK] Working |
| Batch Import Control | import-control.routes.ts | 6 | [OK] Working |
| Scheduler Jobs CRUD | scheduler.routes.ts | 5 | [OK] Working |
| Cross-Location Audit | cross-location.routes.ts | (utility) | [OK] Working |
| Machine Ping All | machine-employee.routes.ts | 1 | [OK] Working |
| Manual Employee Mapping | machine-employee.routes.ts | 1 | [OK] Working |
| Division Comparison | division.routes.ts | 1 | [OK] Working |
| Machine Real-Time Status | realtime-status.routes.ts | 1 | [OK] Working |
| Quality Machine Drift | quality.routes.ts | 1 | [OK] Working |
| Excel Export | reports.routes.ts | 1 | [OK] Working |
| Attendance Corrections CRUD | attendance.routes.ts | 4 | [OK] Working |

---

## Planned/Not Implemented Features

| Feature | Location | Status | Notes |
|---------|----------|--------|-------|
| Bulk Employee Mapping | machine-employees.html | [  ] | "Coming soon" alert |
| Email Notifications | alert.service.ts | [  ] | Placeholder only |
| SMS Notifications | alert.service.ts | [  ] | Placeholder only |
| Webhook Notifications | alert.service.ts | [  ] | Placeholder only |
| Employee Management Page | features/employees/ | [  ] | Directory doesn't exist |
| SSE Reconnection Logic | realtime.routes.ts | [  ] | Client-side reconnect missing |
| Entry Time Anomaly | anomaly.service.ts | [  ] | Late arrivals (>08:00) not validated |
| Very Early Check-in | anomaly.service.ts | [  ] | Check-ins < 05:00 not flagged |
| Cross-location Threshold Fix | anomaly.service.ts | [  ] | Currently flags >2, should be >=2 |
