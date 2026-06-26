# Project Overview: Sistem Absensi PT Rebinmas Jaya

## Tujuan

Sistem monitoring dan penyimpanan data absensi dari 16 mesin absensi di berbagai lokasi perkebunan kelapa sawit PT Rebinmas Jaya ke database SQL Server terpusat.

## Arsitektur

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ 16 Mesin Absensi    │────→│ Data Collection Layer│────→│ SQL Server      │
│ (ZKTeco devices)    │     │ (node-zklib)         │     │ rebinmas_       │
│                     │     │                      │     │ absensi_         │
└─────────────────────┘     └──────────────────────┘     │ monitoring      │
                                                         └─────────────────┘
```

## Connection Configuration

### Direct MSSQL Connection (RECOMMENDED - for all operations)
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

### IT Solution API (fallback for blocked machines)
```
URL: http://10.0.0.110:5176
API Key: <API_KEY>
```

## Machine Status Summary (2026-06-15)

### Accessible Machines (7) - ZKTeco protocol confirmed

| Code | IP:Port | Users | Attendance | Division | LocCode |
|------|---------|-------|------------|----------|----------|
| OFFICE_PGE | 223.25.98.220:4370 | 1,653 | 19,641 | STF | A |
| OFFICE_APE | 103.144.208.154:4370 | 1,084 | 9,820 | ARA | F |
| MILL | 103.127.66.32:4370 | 569 | 4,910 | STF | A |
| IJL | 103.144.211.226:4370 | 166 | 8,007 | IJL | L |
| AB2 | 103.144.208.154:4400 | 233 | 3,962 | AB2 | H |
| P1A | 10.0.0.90:4100 | 792 | 2,739 | PG1A | A |
| P1B | 10.0.0.91:4300 | 792 | 2,737 | PG1B | B |

### Inaccessible Machines (9) - Need firewall/router config

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

## Data Status (2026-06-15)

- ✅ 7 machines accessible via ZKTeco
- ✅ 5,289 users exported from machines
- ✅ 51,816 attendance records imported (latest export)
- ✅ 4,182 employees in database
- ✅ 134,037 total attendance records
- ⏳ 9 machines blocked (need firewall/router config)

## Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Runtime | Node.js v22 / Bun |
| ZKTeco Lib | node-zklib@1.3.0 |
| Database | SQL Server (direct MSSQL connection) |
| API | REST API IT Solution (fallback) |
| Protocol | ZKTeco TCP (port 4370+) |

## Dokumen Context Lainnya

- `02-machine-configuration.md` — Detail konfigurasi 16 mesin, mapping kode
- `03-data-sources.md` — Panduan akses kedua sumber data + contoh kode
- `04-database-schema.md` — Struktur tabel SQL Server
- `05-access-guide.md` — Troubleshooting, auth, error handling
- `06-current-status.md` — Status terkini, data yang sudah terekspor
- `07-api-reference.md` — Reference lengkap IT Solution API

## Lokasi Project

```
D:/Gawean Rebinmas/Absensi_Muka/
├── _dev_utils/
│   ├── src/
│   │   ├── machine-config.ts    ← Mapping 16 mesin (updated 2026-06-15)
│   │   ├── config.ts            ← Database & API config
│   │   ├── test-all-machines.ts ← Test ZKTeco connections
│   │   ├── export-all-machines.ts ← Export from machines
│   │   ├── import-direct-mssql.ts ← Import to database
│   │   └── check-attendance-db.ts ← Check database status
│   ├── attendance-all-*.json    ← Combined export data
│   └── users-all-*.json        ← Combined user data
├── src/
│   ├── seed/
│   │   └── seed-machine-inventory.ts ← Seed machine inventory
│   └── modules/                 ← Backend modules
├── context_user/                ← Dokumen context
└── Dokumentasi/                ← Dokumentasi tambahan
```
