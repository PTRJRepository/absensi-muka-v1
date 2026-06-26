---
tags: [ai-context, api, deprecated]
created: 2026-06-07
updated: 2026-06-26
---

# API Endpoints Reference

## ⚠️ DEPRECATED (2026-06-25)

**IT Solution REST API is non-operational.** All endpoints below are historical only.

**Original Base URL:** `http://10.0.0.110:5176`
**All data now from ZKTeco direct TCP connection.**

---

## Historical Endpoints

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/divisions` | GET | List divisions | Non-operational |
| `/api/available-months-by-division` | GET | Available months | Non-operational |
| `/api/attendance-by-division` | GET | Attendance data | Non-operational |

### 1. GET /api/divisions

Returns: `PG1A, PG1B, PG2A, PG2B, DME, ARA, ARB1, ARB2, INFRA, AREC, IJL, STF-OFFICE, SECURITY`

### 2. GET /api/available-months-by-division

Params: `division` (required)

### 3. GET /api/attendance-by-division

Params: `division`, `month`, `year`, `mode` (hk|ot)

---

## Current Internal API (port 8004)

The Node.js backend exposes internal HTTP API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/attendance/monthly-matrix` | GET | Monthly attendance matrix |
| `POST /api/ops/sync` | POST | Manual machine sync trigger |
| `GET /api/ops/summary` | GET | Dashboard sync summary |

### GET /api/attendance/monthly-matrix

```
GET /api/attendance/monthly-matrix?year=2026&month=6&division=P1A
```

Response: Array of employee rows with daily attendance status (HADIR, INCOMPLETE_SCAN, TIDAK_HADIR, MANUAL_REVIEW)

### POST /api/ops/sync

```json
POST /api/ops/sync
Body: { "machineCode": "P1A" }
```

Response: `{ batch_id, records_count, duration_ms, machine_code }`

### GET /api/ops/summary

Returns aggregate sync status across all machines.
