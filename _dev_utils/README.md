# Dev Utilities - Absensi Monitoring

Script untuk sinkronisasi data absensi dari mesin ZKTeco ke database `rebinmas_absensi_monitoring`.

## Struktur Project

```
_dev_utils/
├── package.json
├── src/
│   ├── config.ts             # Konfigurasi koneksi database & API
│   ├── machine-config.ts     # Konfigurasi 16 mesin absensi
│   ├── test-all-machines.ts  # Test koneksi semua mesin
│   ├── export-all-machines.ts # Export data dari mesin
│   ├── import-direct-mssql.ts # Import data ke database
│   └── check-attendance-db.ts # Cek status database
├── attendance-all-*.json     # Data attendance terekspor
├── users-all-*.json          # Data user terekspor
└── README.md
```

## Instalasi

```bash
cd _dev_utils
bun install
```

## Konfigurasi

### Database Connection (Direct MSSQL)

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
```

### IT Solution API

```
URL: http://10.0.0.110:5176
API Key: <API_KEY>
```

## Penggunaan

### 1. Test Koneksi Semua Mesin

```bash
bun run test-all-machines.ts
```

### 2. Export Data dari Mesin

```bash
bun run export-all-machines.ts
```

### 3. Import Data ke Database

```bash
bun run import-direct-mssql.ts
```

### 4. Cek Status Database

```bash
bun run check-attendance-db.ts
```

## Machine Status (2026-06-15)

### Accessible Machines (7)

| Code | IP:Port | Users | Attendance |
|------|---------|-------|------------|
| OFFICE_PGE | 223.25.98.220:4370 | 1,653 | 19,641 |
| OFFICE_APE | 103.144.208.154:4370 | 1,084 | 9,820 |
| MILL | 103.127.66.32:4370 | 569 | 4,910 |
| IJL | 103.144.211.226:4370 | 166 | 8,007 |
| AB2 | 103.144.208.154:4400 | 233 | 3,962 |
| P1A | 10.0.0.90:4100 | 792 | 2,739 |
| P1B | 10.0.0.91:4300 | 792 | 2,737 |

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

## Employee Code Format

Format: `{locCode}{last 4 digits of userId}`

Examples:
- P1A (locCode=A), userId="10044" → "A0044"
- P1A (locCode=A), userId="50001" → "A0001"
- P1B (locCode=B), userId="30232" → "B0232"

## Database Schema

Database: `rebinmas_absensi_monitoring`

| Table | Purpose |
|-------|---------|
| `employees` | Master employee data |
| `divisions` | Division master |
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

## Catatan Penting

1. **Use direct MSSQL connection** - NOT SQL Gateway HTTP
2. **ZKTeco password**: `12345`
3. **emp_code parsing**: locCode + last 4 digits of userId
4. **Scanner code prefix** perlu di-strip sebelum parsing

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
