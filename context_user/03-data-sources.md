# Panduan Akses Sumber Data Absensi

Ada dua cara mendapatkan data absensi: **Direct ZKTeco** (raw logs dari mesin) dan **API IT Solution** (data terstruktur).

## Sumber 1: Direct ZKTeco Connection

### Library yang Digunakan

```
node-zklib@1.3.0    → Rekomendasi utama, API async/await
```

### Install

```bash
npm install node-zklib
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

Password untuk semua mesin ZKTeco: `12345`

### Struktur Data yang Dikembalikan

**Attendance Record:**
```json
{
  "userSn": 50989,
  "deviceUserId": "10129",
  "recordTime": "2026-03-07T02:13:10.000Z",
  "ip": "10.0.0.232"
}
```

| Field | Tipe | Keterangan |
|-------|------|------------|
| userSn | number | Sequence number dari mesin |
| deviceUserId | string | ID employee di mesin (bukan emp_code) |
| recordTime | string (ISO) | Timestamp absensi |
| ip | string | IP mesin sumber |

**User Record:**
```json
{
  "uid": 1,
  "role": 0,
  "password": "",
  "name": "MUHAMMAD NAZAR",
  "cardno": 0,
  "userId": "10002"
}
```

| Field | Tipe | Keterangan |
|-------|------|------------|
| uid | number | Internal ID mesin |
| role | number | 0=user biasa, 14=admin/super |
| password | string | Password (biasanya kosong) |
| name | string | Nama employee |
| cardno | number | Nomor kartu RFID (0 jika tidak ada) |
| userId | string | User ID di mesin |

### Mesin yang Bisa Diakses (7)

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

## Sumber 2: API IT Solution

API dari pihak ketiga yang menyediakan data absensi terstruktur.

### Konfigurasi

```
Base URL: http://10.0.0.110:5176
API Key:  <API_KEY>
Header:   x-api-key
```

### Client Helper

```javascript
const API_BASE = "http://10.0.0.110:5176";
const API_KEY = "<API_KEY>";

async function apiGet(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  const res = await fetch(url.toString(), {
    headers: { "x-api-key": API_KEY }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}
```

### Endpoint 1: Get Divisions

```
GET /api/divisions
```

**Response:**
```json
{
  "success": true,
  "data": ["PG1A", "PG1B", "PG2A", "PG2B", "DME", "ARA", "ARB1", "ARB2", "INFRA", "AREC", "IJL", "STF-OFFICE", "SECURITY"]
}
```

### Endpoint 2: Get Available Months

```
GET /api/available-months-by-division?division=PG1A
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "year": 2026, "month": 5 },
    { "year": 2026, "month": 4 },
    { "year": 2026, "month": 3 }
  ]
}
```

### Endpoint 3: Get Attendance by Division

```
GET /api/attendance-by-division?division=PG1A&month=5&year=2026&mode=hk
```

**Parameter:**
| Param | Required | Keterangan |
|-------|----------|------------|
| division | Ya | Kode divisi (PG1A, PG1B, dll) |
| month | Ya | Bulan (1-12) |
| year | Ya | Tahun |
| mode | Ya | "hk" (hari kerja) atau "ot" (lembur) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "empCode": "A0039",
      "empName": "NANO ( SUTIYEM )",
      "gangCode": "A1",
      "day_1": {
        "date": "2026-05-01T00:00:00.000Z",
        "hasWork": true,
        "isSunday": false,
        "isHoliday": true,
        "holidayDesc": "Hari Buruh",
        "isCuti": false,
        "isSakit": false,
        "otHours": "0.00",
        "taskCode": ""
      }
    }
  ]
}
```

---

## Perbandingan Kedua Sumber

| Aspek | Direct ZKTeco | API IT Solution |
|-------|---------------|-----------------|
| Format | Raw logs (deviceUserId, recordTime) | Terstruktur per employee/hari |
| Data | Semua timestamp absensi | Summary harian (hasWork, cuti, sakit, dll) |
| Real-time | Ya, langsung dari mesin | Tergantung update IT Solution |
| Auth | TCP + password "12345" | API key header |
| Machines | 7 dari 16 | 13 divisi |
| Mapping | deviceUserId → emp_code (manual) | emp_code sudah jadi |

## Rekomendasi

- **Gunakan Direct ZKTeco** untuk raw logs dan data real-time (7 mesin yang accessible)
- **Gunakan API IT Solution** untuk data harian terstruktur dan mesin yang tidak bisa diakses
- **Kombinasikan keduanya** untuk data yang paling lengkap
