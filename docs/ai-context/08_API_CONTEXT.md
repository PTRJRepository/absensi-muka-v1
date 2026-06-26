---
tags: [ai-context, api]
created: 2026-06-07
updated: 2026-06-25
---

# API Context

## DEPRECATED (2026-06-25)

**IT Solution REST API:** Non-operational. All attendance data now comes from ZKTeco machines via TCP connection.

**No external API dependencies remain.** All data flows through the Node.js backend -> SQL Server path only.

## Internal HTTP API (port 8004)

### GET /api/attendance/monthly-matrix

Monthly attendance matrix for frontend display.

| Param | Type | Description |
|-------|------|-------------|
| year | number | Year (e.g. 2026) |
| month | number | Month (1-12) |
| division | string | Optional division filter |

Response: Array of employee rows with daily attendance status (HADIR, INCOMPLETE_SCAN, TIDAK_HADIR, etc.)

### POST /api/ops/sync

Manual machine sync trigger.

| Param | Type | Description |
|-------|------|-------------|
| machineCode | string | ZKTeco machine code (e.g. "P1A") |

Response: Sync result with batch_id, records count, duration.

### GET /api/ops/summary

Dashboard summary of all machine sync statuses.
