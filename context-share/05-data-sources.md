# Data Sources Guide

Ada dua cara mendapatkan data absensi: **Direct ZKTeco** (raw logs dari mesin) dan **API IT Solution** (data terstruktur).

## Sumber 1: Direct ZKTeco Connection

### Library

```
node-zklib@1.3.0
```

### ZKTeco Connection Pattern

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

**Password**: `12345` (untuk semua mesin)

### Struktur Data

**Attendance Record:**
```json
{
  "userSn": 50989,
  "deviceUserId": "10129",
  "recordTime": "2026-03-07T02:13:10.000Z",
  "ip": "10.0.0.232"
}
```

| Field | Type | Description |
|-------|------|-------------|
| userSn | number | Sequence number dari mesin |
| deviceUserId | string | ID employee di mesin (bukan emp_code) |
| recordTime | string (ISO) | Timestamp absensi |
| ip | string | IP mesin sumber |

**User Record:**
```json
{
  "uid": 1,
  "role": 0,
  "name": "MUHAMMAD NAZAR",
  "userId": "10002"
}
```

| Field | Type | Description |
|-------|------|-------------|
| uid | number | Internal ID mesin |
| role | number | 0=user biasa, 14=admin |
| name | string | Nama employee |
| userId | string | User ID di mesin |

### Machines (7 accessible)

| Code | IP:Port | Users | Logs | Division |
|------|---------|-------|------|---------|
| OFFICE_PGE | 223.25.98.220:4370 | 1,653 | 19,641 | STF |
| OFFICE_APE | 103.144.208.154:4370 | 1,084 | 9,820 | ARA |
| MILL | 103.127.66.32:4370 | 569 | 4,910 | STF |
| IJL | 103.144.211.226:4370 | 166 | 8,007 | IJL |
| AB2 | 103.144.208.154:4400 | 233 | 3,962 | AB2 |
| P1A | 10.0.0.90:4100 | 792 | 2,739 | PG1A |
| P1B | 10.0.0.91:4300 | 792 | 2,737 | PG1B |

---

## Sumber 2: IT Solution API

API terstruktur dari pihak ketiga - sudah diproses per employee per hari.

### Configuration

```
Base URL: http://10.0.0.110:5176
Header:   x-api-key
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

### Divisions Available

| Division | Description |
|----------|-------------|
| PG1A | Kebun PG1A |
| PG1B | Kebun PG1B |
| PG2A | Kebun PG2A |
| PG2B | Kebun PG2B |
| DME | DME |
| ARA | Afdeling ARA |
| ARB1 | Afdeling ARB1 |
| ARB2 | Afdeling ARB2 |
| INFRA | Infra |
| AREC | Area RC |
| IJL | Ijuk Langsung |
| STF-OFFICE | Staff/Office |
| SECURITY | Security |

---

## Perbandingan

| Aspect | Direct ZKTeco | API IT Solution |
|-------|---------------|-----------------|
| Format | Raw logs (deviceUserId, recordTime) | Terstruktur per employee/hari |
| Data | Semua timestamp absensi | Summary harian |
| Real-time | Ya, langsung dari mesin | Tergantung update |
| Auth | TCP + password | API key |
| Machines | 7 dari 16 | 13 divisi |
| Mapping | deviceUserId → emp_code (manual) | emp_code sudah jadi |

## Rekomendasi

- **Direct ZKTeco** untuk raw logs dan data real-time
- **API IT Solution** untuk data harian terstruktur dan mesin yang tidak bisa diakses
- **Kombinasikan keduanya** untuk data yang paling lengkap
