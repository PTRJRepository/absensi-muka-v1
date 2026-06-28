# Sistem Absensi PT Rebinmas Jaya

## Gambaran Project

Sistem monitoring dan penyimpanan data absensi dari **16 mesin absensi ZKTeco** di berbagai lokasi perkebunan kelapa sawit ke database SQL Server terpusat.

### Tujuan
- Mengumpulkan data absensi dari mesin fingerprint di lapangan
- Menyimpan ke database terpusat untuk analisis dan pelaporan
- Monitoring kehadiran karyawan real-time

### Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Runtime | Node.js / Bun |
| ZKTeco Lib | node-zklib (TCP connection) |
| Database | SQL Server |
| API | REST API IT Solution (fallback) |
| Protocol | ZKTeco TCP (port 4370+) |

### Lokasi Project
```
D:/Gawean Rebinmas/Absensi_Muka/
├── _dev_utils/           # Script development & utilities
├── src/                  # Backend source code
├── context_user/         # Internal documentation
├── context-share/        # Shareable documentation (this folder)
└── Dokumentasi/          # Additional docs
```

---

## Status Mesin (Juni 2026)

### Mesin yang Bisa Diakses (7)

| Code | IP:Port | Division | LocCode |
|------|---------|----------|----------|
| OFFICE_PGE | 223.25.98.220:4370 | STF | A |
| OFFICE_APE | 103.144.208.154:4370 | ARA | F |
| MILL | 103.127.66.32:4370 | STF | A |
| IJL | 103.144.211.226:4370 | IJL | L |
| AB2 | 103.144.208.154:4400 | AB2 | H |
| P1A | 10.0.0.90:4100 | PG1A | A |
| P1B | 10.0.0.91:4300 | PG1B | B |

### Mesin yang Belum Bisa Diakses (9)

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

---

## Arsitektur Sistem

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ 16 Mesin Absensi    │────→│ Data Collection Layer │────→│ SQL Server      │
│ (ZKTeco devices)    │     │ (node-zklib TCP)      │     │ Database        │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
                                    │
                                    ▼
                          ┌──────────────────────┐
                          │ IT Solution API      │
                          │ (fallback data)      │
                          └──────────────────────┘
```

### Data Flow

1. **Direct ZKTeco** (7 mesin accessible)
   - Koneksi TCP langsung ke mesin
   - Export raw attendance logs
   - Parse userId → employee code

2. **IT Solution API** (fallback)
   - REST API untuk data terstruktur
   - Cover semua 13 divisi
   - Tidak perlu akses langsung ke mesin

---

## Employee Code Format

Setiap employee punya unique code dengan format: `{locCode}{nomor}`

### Contoh

| Division | locCode | userId di Mesin | emp_code |
|----------|---------|-----------------|----------|
| PG1A | A | 10044 | A0044 |
| PG1A | A | 50001 | A0001 |
| PG1B | B | 30232 | B0232 |
| IJL | L | L0015 | L0015 |
| AB2 | H | 40029 | H0029 |

### Logic Parsing

```typescript
function userIdToEmpCode(userId: string, locCode: string): string {
  const id = String(userId);
  
  // Jika sudah dalam format (e.g., "A0044")
  if (/^[A-Z]\d+$/.test(id)) return id;
  
  // Ambil 4 digit terakhir, strip scanner prefix jika ada
  const last4Match = id.match(/\d{1,4}$/);
  if (last4Match) {
    const numPart = last4Match[0].padStart(4, '0');
    return `${locCode}${numPart}`;
  }
  
  return `${locCode}${id}`;
}
```

### LocCode Mapping

| Machine | LocCode | Division |
|---------|---------|----------|
| P1A | A | PG1A |
| P1B | B | PG1B |
| P2A | C | PG2A |
| P2B | D | PG2B |
| DME | E | DME |
| ARA | F | ARA |
| AB1 | G | AB1 |
| AB2 | H | AB2 |
| ARC | J | ARC |
| IJL | L | IJL |
| PGE/APE | A | STF |

---

## Database Schema

Database: `rebinmas_absensi_monitoring`

### Main Tables

| Table | Purpose |
|-------|---------|
| `employees` | Master employee (emp_code, emp_name, division_id) |
| `divisions` | Division master (division_code, division_name) |
| `attendance_scan_logs` | Raw attendance scan records |
| `attendance_imports` | Processed attendance records |
| `attendance_import_batches` | Import batch tracking |
| `attendance_machines` | Machine inventory |

### Divisions

| ID | Code | Name |
|----|------|------|
| 2 | PG1A | Kebun PG1A |
| 3 | PG1B | Kebun PG1B |
| 7 | ARA | Afdeling ARA |
| 9 | AB2 | Afdeling AB2 |
| 13 | IJL | Ijuk Langsung |
| 14 | STF | Staff / Office |

---

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

### Data Structures

**Attendance Record:**
```json
{
  "userSn": 50989,
  "deviceUserId": "10129",
  "recordTime": "2026-03-07T02:13:10.000Z",
  "ip": "10.0.0.232"
}
```

**User Record:**
```json
{
  "uid": 1,
  "role": 0,
  "name": "MUHAMMAD NAZAR",
  "userId": "10002"
}
```

---

## IT Solution API (Fallback)

### Base URL
```
http://10.0.0.110:5176
```

### Endpoints

#### Get Divisions
```
GET /api/divisions
```

#### Get Available Months
```
GET /api/available-months-by-division?division=PG1A
```

#### Get Attendance by Division
```
GET /api/attendance-by-division?division=PG1A&month=5&year=2026&mode=hk
```

Parameters:
- `division`: PG1A, PG1B, PG2A, PG2B, DME, ARA, ARB1, ARB2, INFRA, AREC, IJL, STF-OFFICE, SECURITY
- `month`: 1-12
- `year`: Tahun
- `mode`: "hk" (hari kerja) atau "ot" (lembur)

---

## Data Status (Juni 2026)

| Metric | Value |
|--------|-------|
| Machines accessible | 7 / 16 |
| Users exported | 5,289 |
| Attendance records (latest export) | 51,816 |
| Employees in database | 4,182 |
| Total attendance records | 134,037 |

---

## Key Files

| File | Purpose |
|------|---------|
| `_dev_utils/src/machine-config.ts` | Machine configurations |
| `_dev_utils/src/config.ts` | Database & API config |
| `_dev_utils/test-all-machines.ts` | Test ZKTeco connections |
| `_dev_utils/export-all-machines.ts` | Export from machines |
| `_dev_utils/import-direct-mssql.ts` | Import to database |
| `_dev_utils/check-attendance-db.ts` | Check database status |

---

## Quick Reference

- **ZKTeco password**: `12345`
- **Always**: `disableDevice()` before fetch, `enableDevice()` after
- **Timeout**: >= 30000ms for large datasets
- **emp_code**: locCode + last 4 digits of userId
- **Scanner prefix**: perlu di-strip sebelum parsing
