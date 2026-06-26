---
tags: [ai-context, frontend]
created: 2026-06-07
---

# Frontend Context

## Overview

**This project does not have a frontend component.**

The Sistem Absensi PT Rebinmas Jaya is a backend/data pipeline system focused on:
- Data collection from attendance machines
- Data transformation and storage
- Automated synchronization

## Why No Frontend?

1. **Backend-only system:** The system is designed as a data pipeline that feeds into existing systems or dashboards
2. **Database-centric:** Data is stored in SQL Server for consumption by other applications
3. **Script-based:** Operations are performed via Node.js scripts, not interactive UI

## Future Frontend Considerations

If a frontend is needed in the future, potential options include:

### Option 1: Web Dashboard (React/Next.js)
- Attendance reports and statistics
- Division-level monitoring
- Sync status monitoring

### Option 2: API Backend (Express/Fastify)
- REST API for frontend consumption
- Authentication and authorization
- CRUD operations for manual corrections

### Option 3: Admin Panel
- Machine configuration management
- Sync operation monitoring
- Data export utilities

## Data Access Patterns

Currently, data is accessed via:
1. **Direct SQL queries** through SQL Gateway
2. **CLI scripts** for batch operations
3. **API endpoints** for IT Solution data

## Recommendations for Future Frontend

If implementing a frontend:

1. **Use existing API:** Consume data from SQL Gateway or create REST endpoints
2. **Reuse schema:** Leverage existing `absen_import` and `absen_machine_input` tables
3. **Auth integration:** Add authentication layer if exposing externally
4. **Real-time updates:** Consider WebSocket for sync status updates

## Related Files

- `_dev_utils/src/absensi-service.ts` - Data access service (can be REST-ified)
- `_dev_utils/schema.sql` - Database schema for reference
- `_dev_utils/src/sql-client.ts` - SQL Gateway client
