# Key API Endpoints

## Total: 123 endpoints across 22 route files

---

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |

---

## Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/dashboard/daily-summary` | Daily attendance summary |

---

## Attendance (Core)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attendance/daily` | Daily attendance by date |
| GET | `/api/attendance/monthly` | Monthly attendance |
| GET | `/api/attendance/monthly-matrix` | Monthly matrix grid |
| GET | `/api/attendance/employee/:code` | Employee attendance detail |
| GET | `/api/attendance/employee/:code/raw` | Raw scan logs for employee |

**Daily Query Params**:
```
?date=2026-06-23
&machine=P1A
&division=A
&status=MAPPED|UNMAPPED|NEED_REVIEW
```

**Monthly Matrix Query Params**:
```
?year=2026&month=6
&division=A
&includeStatus=true
```

---

## Machines

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/machines` | List all machines |
| GET | `/api/machines/:code` | Machine detail |
| GET | `/api/machines/:code/status` | Machine connection status |
| GET | `/api/monitoring/machine/:code/employees` | Machine users (dual mode) |
| GET | `/api/monitoring/machine/:code/user/:rawId/attendance` | User attendance at machine |
| POST | `/api/sync/trigger/:code` | Trigger sync for machine |
| POST | `/api/sync/trigger-all` | Trigger sync for all machines |

---

## Quality & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quality/summary` | Data quality summary |
| GET | `/api/quality/unmapped` | Unmapped raw IDs |
| GET | `/api/quality/duplicates` | Duplicate attendance |
| GET | `/api/monitoring/cross-location` | Cross-location report |
| GET | `/api/monitoring/cross-location/:machineCode` | Machine cross-location |
| GET | `/api/monitoring/cross-location/report` | Full cross-location report |

---

## Real-time

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/realtime/events` | SSE stream for live updates |
| GET | `/api/realtime/status` | Machine real-time status |

---

## Ops

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ops/summary` | Ops summary (machine health) |
| GET | `/api/ops/incidents` | Active incidents |
| GET | `/api/ops/recommendations` | Automated recommendations |

---

## Scheduler

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scheduler/jobs` | List scheduled jobs |
| POST | `/api/scheduler/jobs` | Create job |
| PUT | `/api/scheduler/jobs/:id` | Update job |
| DELETE | `/api/scheduler/jobs/:id` | Delete job |

---

## Sync Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync/trigger/:code` | Sync single machine |
| POST | `/api/sync/trigger-all` | Sync all machines |
| GET | `/api/sync/status` | Sync status |

---

## Import

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/import/file` | Import CSV/DAT file |
| POST | `/api/import/control/start` | Start batch import |
| POST | `/api/import/control/stop/:batchId` | Stop batch import |
| GET | `/api/import/status/:batchId` | Batch status |

---

## Response Format

### Success
```json
{
  "success": true,
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "MACHINE_NOT_FOUND",
    "message": "Machine P99 not found"
  }
}
```

---

## Attendance Status Types

| Status | Description |
|--------|-------------|
| `HADIR` | Present (2+ scans per day) |
| `TIDAK_HADIR` | Absent (0 scans) |
| `NO_CHECKOUT` | Single scan (missing check-out) |
| `NO_CHECKIN` | No attendance record |
| `CROSS_DIVISION` | Employee at wrong division machine |
| `CORRECTION` | Manually corrected record |
| `INCOMPLETE_SCAN` | Single scan, marked incomplete |

---

## Mapping Status Types

| Status | Description |
|--------|-------------|
| `MAPPED` | Successfully mapped to employee |
| `NEED_REVIEW` | Parsed but needs manual review |
| `UNMAPPED` | Could not map (short ID, no match, etc.) |
| `EXCLUDED` | Short ID excluded from auto-mapping |
| `MANUAL_OVERRIDE` | Manually overridden by admin |
