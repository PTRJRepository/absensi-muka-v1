# API Reference

## Local App API (Port 8004)

Aplikasi ini berjalan di `http://localhost:8004` dan menyediakan API untuk attendance monitoring.

### Authentication
```
Authorization: Bearer <jwt_token>
```

### Monitoring Endpoints

#### Dashboard Summary
```
GET /api/monitoring/dashboard
```
Returns machine stats, today's scans, pending batches.

#### Machine List
```
GET /api/monitoring/machines
```
Returns all active machines with today's scan stats.

#### Machine Detail
```
GET /api/monitoring/machine/:code
```
Returns detailed info for a specific machine.

#### Import Batches
```
GET /api/monitoring/batches?status=RUNNING&machine=PGE&page=1&limit=20
```
Returns import batch history with filters.

#### Batch Detail
```
GET /api/monitoring/batch/:id
```
Returns batch details and sample logs.

#### Data Quality
```
GET /api/monitoring/quality?days=30
```
Returns mapping quality metrics and unmapped codes.

#### Division Summary
```
GET /api/monitoring/division-summary?year=2026&month=6
```
Returns attendance summary per division for a month.

---

## Attendance Matrix Endpoints

#### Daily Attendance (Full Matrix)
```
GET /api/attendance/daily?date=2026-06-19&divisionCode=ARA&pageSize=50
```
Returns attendance records for a specific date with employee detail.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "employee_code": "0010001",
      "employee_name": "DIANA ( ROBIYAH )",
      "division_code": "IJL",
      "attendance_date": "2026-06-19",
      "attendance_status": "PRESENT",
      "has_work": true,
      "is_leave": false,
      "is_sick": false,
      "is_holiday": false
    }
  ]
}
```

#### Monthly Summary
```
GET /api/attendance/monthly?year=2026&month=6&divisionCode=ARA
```
Returns monthly summary per employee (present, absent, leave, sick counts).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "attendance_year": 2026,
      "attendance_month": 6,
      "employee_code": "10205",
      "employee_name": "ARI ANUGRAH",
      "division_code": "ARA",
      "total_present": 0,
      "total_absent": 18,
      "total_leave": 0,
      "total_sick": 0,
      "total_overtime_hours": 0
    }
  ]
}
```

#### Employee Attendance History
```
GET /api/attendance/employee/:employeeCode
```
Returns attendance history for a specific employee (last 120 records).

#### Daily Summary by Division
```
GET /api/attendance/summary?date=2026-06-19
```
Returns summary stats (present, absent, leave, sick) per division for a date.

---

## Machine & Division Endpoints

#### All Divisions
```
GET /api/divisions
```
Returns all divisions with employee counts.

#### Division Attendance (Detail)
```
GET /api/divisions/:code/attendance?year=2026&month=6
```
Returns detailed attendance data for a division including:
- Summary stats
- Daily breakdown
- Employee breakdown
- Status summary

#### Real-Time Machine Status
```
GET /api/machines/real-time-status
```
Returns live machine status with today's scan counts.

#### Division Machine Activity
```
GET /api/divisions/:code/machines
```
Returns machines that logged scans for a division.

#### Division Raw Scan Logs
```
GET /api/divisions/:code/scans?days=7&page=1&limit=50
```
Returns raw scan logs for a division with pagination.

---

## IT Solution API (External Fallback)

### Base Configuration

```
Base URL: http://10.0.0.110:5176
Auth: Header "x-api-key"
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

### Endpoint: Get Attendance by Division

```
GET /api/attendance-by-division?division=PG1A&month=5&year=2026&mode=hk
```

**Query Parameters:**
| Parameter | Type | Required | Values | Description |
|-----------|------|----------|--------|-------------|
| division | string | Ya | 13 division codes | Kode divisi |
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

## API Client Example

```javascript
const API_BASE = "http://10.0.0.110:5176";
const API_KEY = "YOUR_API_KEY_HERE";

class AbsensiApiClient {
  constructor(apiKey) {
    this.baseUrl = API_BASE;
    this.apiKey = apiKey;
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
}

// Usage:
const client = new AbsensiApiClient("YOUR_API_KEY");
const divisions = await client.getDivisions();
const attendance = await client.getAttendance("PG1A", 5, 2026, "hk");
```

---

## Database Connection

### Direct MSSQL Connection

```typescript
import mssql from 'mssql';

const dbConfig = {
  server: 'YOUR_SERVER',
  port: 1433,
  user: 'YOUR_USER',
  password: 'YOUR_PASSWORD',
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
