# Project: Sistem Absensi PT Rebinmas Jaya

Sistem monitoring dan penyimpanan data absensi dari 16 mesin absensi ZKTeco ke database SQL Server terpusat.

## Project Root
`D:/Gawean Rebinmas/Absensi_Muka/`

## Tech Stack
- Node.js v22 / Bun
- ZKTeco: `node-zklib@1.3.0` (TCP)
- Database: SQL Server (direct MSSQL connection)
- API: IT Solution REST API (`http://10.0.0.110:5176`)
- Config: `_dev_utils/src/config.ts`

## Connection Configuration

### Direct MSSQL Connection (RECOMMENDED)
```typescript
import mssql from 'mssql';

const dbConfig = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

const pool = await mssql.connect(dbConfig);
```

### IT Solution API
```
URL: http://10.0.0.110:5176
API Key: <API_KEY>
```

## Machine Status (2026-06-15)

### Accessible Machines (7)

| Code | IP:Port | Users | Attendance | Division |
|------|---------|-------|------------|----------|
| OFFICE_PGE | 223.25.98.220:4370 | 1,653 | 19,641 | STF |
| OFFICE_APE | 103.144.208.154:4370 | 1,084 | 9,820 | ARA |
| MILL | 103.127.66.32:4370 | 569 | 4,910 | STF |
| IJL | 103.144.211.226:4370 | 166 | 8,007 | IJL |
| AB2 | 103.144.208.154:4400 | 233 | 3,962 | AB2 |
| P1A | 10.0.0.90:4100 | 792 | 2,739 | PG1A |
| P1B | 10.0.0.91:4300 | 792 | 2,737 | PG1B |

### Inaccessible Machines (9)

| Code | IP:Port | Issue |
|------|---------|-------|
| DME_01 | 103.144.228.42:4700 | Port blocked |
| DME_02 | 103.144.228.42:4701 | Port blocked |
| ARC_01 | 103.144.208.154:4200 | Port blocked |
| ARC_02 | 103.144.208.154:4201 | Port blocked |
| ARA | 103.144.208.154:4800 | Port blocked |
| AB1 | 103.144.208.154:4900 | Port blocked |
| P2A_01 | 10.0.0.92:4500 | Network unreachable |
| P2B | 10.0.0.93:4600 | Network unreachable |
| P2A_02 | 10.0.0.94:4501 | Network unreachable |

## Employee Code (emp_code) Format

Format: `{locCode}{last 4 digits of userId}`

Examples:
- P1A (locCode=A), userId="10044" → "A0044"
- P1A (locCode=A), userId="50001" → "A0001" (strip scanner prefix)
- P1B (locCode=B), userId="30232" → "B0232"
- IJL (locCode=L), userId="L0015" → "L0015"

## ZKTeco Connection Pattern

```typescript
import ZKLib from 'node-zklib';

const zk = new ZKLib(ip, port, 30000, 4000, '12345');
await zk.createSocket();
await zk.disableDevice();

const usersResult = await zk.getUsers();
const users = usersResult?.data || [];

const attResult = await zk.getAttendances();
const attendances = attResult?.data || [];

await zk.enableDevice();
await zk.disconnect();
```

## Commands

```bash
# Test all machine connections
bun run _dev_utils/test-all-machines.ts

# Export attendance data from machines
bun run _dev_utils/export-all-machines.ts

# Import data to database (direct mssql)
bun run _dev_utils/import-direct-mssql.ts

# Check database
bun run _dev_utils/check-attendance-db.ts

# Backend
npm run build
npm run start
npm run dev
```

## Key Directories

```
_dev_utils/
├── src/
│   ├── machine-config.ts     # 16 machines + scanner mapping
│   ├── config.ts             # Database & API config
│   ├── test-all-machines.ts  # Test ZKTeco connections
│   ├── export-all-machines.ts # Export from machines
│   ├── import-direct-mssql.ts # Import to database
│   └── check-attendance-db.ts # Check database status
├── attendance-all-*.json      # Exported attendance data
└── users-all-*.json           # Exported users data
context_user/                  # Detailed documentation
```

## Database Schema

Database: `rebinmas_absensi_monitoring`

| Table | Purpose |
|-------|---------|
| `employees` | Master employee data (emp_code, emp_name, division_id) |
| `divisions` | Division master (division_code, division_name) |
| `attendance_scan_logs` | Raw attendance scan records |
| `attendance_imports` | Processed attendance records |
| `attendance_import_batches` | Import batch tracking |
| `attendance_machines` | Machine inventory |

## Data Status (2026-06-15)

- ✅ 7 machines accessible via ZKTeco
- ✅ 5,289 users exported from machines
- ✅ 51,816 attendance records imported
- ✅ 4,182 employees in database
- ✅ 134,037 total attendance records
- ⏳ 9 machines blocked (need firewall/router config)

## Quick Reference

- ZKTeco password: `12345`
- Always `disableDevice()` before fetch, `enableDevice()` after
- Timeout >= 30000ms for large datasets
- `deviceUserId` → `emp_code` via locCode + last 4 digits
- Database: `rebinmas_absensi_monitoring` - NOT `extend_db_ptrj`
- No Gateway - All operations use direct MSSQL connection

## Important Notes

1. **Use direct MSSQL connection** for all database operations
2. **P1A & P1B ARE ZKTeco devices** - not "NON_ZKTECO" as documented before
3. **emp_code parsing** - Use locCode prefix + last 4 digits of userId
4. **Scanner code prefix** in userId needs to be stripped before parsing

## Detailed Docs
See `context_user/` for full machine configs, data sources, API reference, and current status.
