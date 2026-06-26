# API Reference — IT Solution API

## IT Solution API

### Base Configuration

```
Base URL: http://10.0.0.110:5176
Auth: Header "x-api-key"
API Key: <API_KEY>
```

### Endpoint: Get All Divisions

```
GET /api/divisions
```

**Response:**
```json
{
  "success": true,
  "data": [
    "PG1A",
    "PG1B", 
    "PG2A",
    "PG2B",
    "DME",
    "ARA",
    "ARB1",
    "ARB2",
    "INFRA",
    "AREC",
    "IJL",
    "STF-OFFICE",
    "SECURITY"
  ]
}
```

### Endpoint: Get Available Months

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
    { "year": 2026, "month": 3 },
    { "year": 2026, "month": 2 }
  ]
}
```

**Notes:**
- Data diurutkan dari terbaru ke terlama
- Tidak semua divisi punya jumlah bulan yang sama

### Endpoint: Get Attendance by Division

```
GET /api/attendance-by-division?division=PG1A&month=5&year=2026&mode=hk
```

**Query Parameters:**
| Parameter | Type | Required | Values | Description |
|-----------|------|----------|--------|-------------|
| division | string | Ya | PG1A, PG1B, PG2A, PG2B, DME, ARA, ARB1, ARB2, INFRA, AREC, IJL, STF-OFFICE, SECURITY | Kode divisi |
| month | string | Ya | 1-12 | Bulan |
| year | string | Ya | 2026 | Tahun |
| mode | string | Ya | "hk" atau "ot" | "hk" = hari kerja, "ot" = lembur |

**Response Structure:**
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

**Day Object Fields:**
| Field | Type | Description |
|-------|------|-------------|
| date | string (ISO) | Tanggal (YYYY-MM-DD) |
| hasWork | boolean | Apakah employee bekerja hari itu |
| isSunday | boolean | Apakah hari Minggu |
| isHoliday | boolean | Apakah hari libur nasional |
| holidayDesc | string/null | Nama hari libur (jika isHoliday=true) |
| isCuti | boolean | Apakah employee cuti |
| isSakit | boolean | Apakah employee sakit |
| otHours | string | Jam lembur (format: "0.00") |
| taskCode | string | Kode tugas (kosong jika tidak ada) |

---

## Complete API Client

```javascript
const API_BASE = "http://10.0.0.110:5176";
const API_KEY = "<API_KEY>";

class AbsensiApiClient {
  constructor() {
    this.baseUrl = API_BASE;
    this.apiKey = API_KEY;
  }

  async request(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": this.apiKey }
    });
    if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async getDivisions() {
    const result = await this.request("/api/divisions");
    return result.data;
  }

  async getAvailableMonths(division) {
    const result = await this.request("/api/available-months-by-division", { division });
    return result.data;
  }

  async getAttendance(division, month, year, mode = "hk") {
    const result = await this.request("/api/attendance-by-division", {
      division,
      month: month.toString(),
      year: year.toString(),
      mode
    });
    return result.data;
  }

  async getAllCurrentData() {
    const divisions = await this.getDivisions();
    const allData = new Map();

    for (const div of divisions) {
      const months = await this.getAvailableMonths(div);
      if (months.length > 0) {
        const latest = months[0];
        const attendance = await this.getAttendance(div, latest.month, latest.year, "hk");
        allData.set(div, { year: latest.year, month: latest.month, data: attendance });
      }
    }

    return allData;
  }
}

// Usage:
const client = new AbsensiApiClient();
const divisions = await client.getDivisions();
const months = await client.getAvailableMonths("PG1A");
const attendance = await client.getAttendance("PG1A", 5, 2026, "hk");
const all = await client.getAllCurrentData();
```

---

## Error Codes

### IT Solution API

| HTTP Code | Meaning | Action |
|-----------|---------|--------|
| 401 | Invalid API key | Cek API key di header |
| 404 | Endpoint not found | Cek URL endpoint |
| 500 | Server error | Retry setelah beberapa detik |

### ZKTeco

| Error | Meaning | Action |
|-------|---------|--------|
| ECONNREFUSED | Port tertutup | Cek port forwarding |
| TIMEOUT | Network lambat | Tingkatkan timeout |
| offset out of range | Bukan ZKTeco | Gunakan API |
| CMD_AUTH fail | Password salah | Coba "12345" |

---

## Database Connection (Direct MSSQL)

Untuk semua operasi database, gunakan direct MSSQL connection:

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

### Common Queries

```sql
-- Count employees
SELECT COUNT(*) as total FROM employees

-- Count attendance records
SELECT COUNT(*) as total FROM attendance_scan_logs

-- Records per machine
SELECT machine_code, COUNT(*) as cnt 
FROM attendance_scan_logs 
GROUP BY machine_code

-- Latest import batch
SELECT TOP 1 * FROM attendance_import_batches 
ORDER BY created_at DESC

-- Sample employees
SELECT TOP 10 employee_code, employee_name, division_id 
FROM employees 
ORDER BY id DESC
```
