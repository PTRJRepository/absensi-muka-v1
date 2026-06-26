# Quick Reference: Absensi Monitoring System

## Server Info

| Item | Value |
|------|-------|
| API Server | http://localhost:8004 |
| Database | 10.0.0.110:1433 |
| Database Name | rebinmas_absensi_monitoring |
| DB User | sa |

## Quick Commands

```bash
# Start server
npm run dev

# Build TypeScript
npm run build

# Run migrations
npm run db:migrate

# Sync all machines
npm run sync:machines

# Check database
npm run db:check
```

## API Endpoints Quick List

### Dashboard
```bash
curl http://localhost:8004/api/monitoring/dashboard
```

### Machines
```bash
curl http://localhost:8004/api/monitoring/machines
curl http://localhost:8004/api/machines/real-time-status
```

### Sync
```bash
# Sync single machine
curl -X POST http://localhost:8004/api/monitoring/sync/PGE

# Sync all machines
curl -X POST http://localhost:8004/api/monitoring/sync-all
```

### Attendance
```bash
# Daily attendance
curl "http://localhost:8004/api/attendance/daily?date=2026-06-20"

# Monthly summary
curl "http://localhost:8004/api/attendance/monthly?year=2026&month=6"

# Employee history
curl http://localhost:8004/api/attendance/employee/0010001
```

### Quality
```bash
curl http://localhost:8004/api/monitoring/quality
```

### Divisions
```bash
curl http://localhost:8004/api/divisions
curl "http://localhost:8004/api/divisions/ARA/attendance?year=2026&month=6"
```

### Batches
```bash
curl "http://localhost:8004/api/monitoring/batches?status=RUNNING"
```

## Employee Code Format

```
IT Solution API:  0010001  (7 digits)
ZKTeco Machine:   A0044    (letter + 4 digits)

CRITICAL: These don't match! This is why mapping fails.
```

## Machine LocCode Mapping

```
PGE  → A (STF)
MILL → A (STF)
P1A  → A (PG1A)
P1B  → B (PG1B)
P2A  → C (PG2A)
P2B  → D (PG2B)
DME  → E (DME)
ARE  → E (DME)
ARA  → F (ARA)
AB1  → G (AB1)
AB2  → H (AB2)
ARC  → J (ARC)
IJL  → L (IJL)
```

## Quality Score Formula

```
score = (mapped/total * 0.5) + (success_batches/total * 0.25) + 
        (online_machines/total * 0.15) + (non_dup/total * 0.1)
```

## Status Colors (UI)

| Status | Color |
|--------|-------|
| Healthy/Online/Present | Green |
| Good/Info | Blue |
| Warning/Tanpa Data | Orange |
| Error/Critical/Absent | Red |

## Key Files

| File | Purpose |
|------|---------|
| src/api/routes/ | All API endpoints |
| src/modules/machines/zkteco.service.ts | ZKTeco connection |
| src/lib/db.ts | SQL Server client |
| frontend/src/ | React frontend |
| migrations/ | Database schema |

## Common Issues

### Issue: Unmapped Records
```
Cause: Employee codes from ZKTeco (A0044) don't match database (0010001)
Fix: Need mapping layer to convert between formats
```

### Issue: Batch Stuck RUNNING
```
Cause: Sync started but never completed
Fix: Check machine connectivity, increase timeout
```

### Issue: Machine Offline
```
Cause: Port blocked or network unreachable
Fix: Check firewall, port forwarding, network routing
```

## Environment Variables

```
DB_SERVER=10.0.0.110
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=<DB_PASSWORD>
DB_NAME=rebinmas_absensi_monitoring
JWT_SECRET=<JWT_SECRET>
APP_PORT=8004
ZKTECO_PASSWORD=12345
ZKTECO_TIMEOUT_MS=30000
SYNC_INTERVAL_MINUTES=15
```

## Testing

```bash
# Test ZKTeco connection
node test-zkteco.js

# Check DB connection
npm run db:check

# Test API endpoints
curl http://localhost:8004/api/monitoring/dashboard
```

## Database Tables

```
employees              - Master employee data
divisions             - Division master
attendance_machines    - 16 machine inventory
attendance_scan_logs  - Raw logs from ZKTeco
attendance_imports    - Processed attendance
attendance_import_batches - Batch tracking
attendance_manual_corrections - Manual corrections
```

## Views

```
vw_attendance_final            - Final attendance (employee × date)
vw_attendance_monthly_summary  - Monthly summary per employee
vw_attendance_daily_summary     - Daily summary per division
```

---

For detailed documentation, see:
- PRD: docs/PRD-REFACTORED.md
- API Reference: context-share/03-api-reference.md
- Database Schema: context-share/04-database-schema.md
- Data Dictionary: docs/DATA-DICTIONARY.md
