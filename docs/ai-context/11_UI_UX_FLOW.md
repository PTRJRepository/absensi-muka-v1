---
tags: [ai-context, ui-ux]
created: 2026-06-07
---

# UI/UX Flow

## Overview

**This project does not have a UI/UX component.**

The Sistem Absensi PT Rebinmas Jaya is a backend data pipeline system. There is no user interface for end users.

## Current Interface

The "interface" consists of:
1. **CLI Commands** - Node.js script execution
2. **Console Output** - Progress and status logging
3. **SQL Queries** - Direct database access

## CLI Operations

### Run Manual Sync
```bash
bun run src/sync.ts
```

### Run Scheduled Sync
```bash
bun run src/scheduler.ts
```

### Run Import
```bash
bun run src/absensi-import.ts --division PG1A --year 2026 --month 6
```

### Test Machine Connection
```bash
bun run src/machine-sync.ts
```

## Console Output Example

```
==================================================
🚀 Starting Absensi Sync
==================================================

📅 Target: 2026-06
📂 Divisions: PG1A, PG1B, PG2A, DME, ARA...

📥 Syncing: PG1A - 6/2026 (mode: hk)
  📡 Fetching from API...
  ✅ Got 204 employees
  📊 Parsed 6324 records
  ✅ Synced 6324 records in 2341ms

📥 Syncing: PG1B - 6/2026 (mode: hk)
  ...

==================================================
✅ Sync completed! Total: 45000 records in 45000ms
==================================================
```

## Future UI Considerations

If a frontend is added in the future:

### Dashboard (Monitoring)
- Real-time sync status
- Division attendance summary
- Error alerts

### Admin Panel (Management)
- Machine configuration
- Manual data entry
- Sync history

### Reports (Analytics)
- Employee attendance
- Overtime tracking
- Leave management

## Related Documentation

- `05_FRONTEND_CONTEXT.md` - Frontend considerations
- `10_BUSINESS_FLOW.md` - Business process flows
- `06_BACKEND_CONTEXT.md` - Backend architecture
