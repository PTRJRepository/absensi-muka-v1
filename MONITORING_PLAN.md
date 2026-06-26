# MONITORING_PLAN.md — Absensi Monitoring Dashboard v2

**Generated:** 2026-06-18
**Database:** rebinmas_absensi_monitoring (10.0.0.110:1433)
**App Root:** D:/Gawean Rebinmas/Absensi_Muka, Port 8004

---

## SITUASI SAAT INI

| Komponen | Status |
|----------|--------|
| 16 mesin dikonfigurasi | ✅ Semua ACCESSIBLE |
| attendance_scan_logs | ⚠️ 33,758 records, **97.3% UNMAPPED** |
| attendance_imports | ❌ kosong |
| attendance_import_batches | ⚠️ 12 records, sync gagal mostly |
| employees | ✅ 1,987 records |
| Sync script | ⚠️ Partial — data masuk tapi mapping gagal |

### Akar Masalah Mapping
- Device ID format: `9000626`, `A20020`, `50106` (various)
- Employee code format: `0010001` (7-digit zero-padded)
- TIDAK ada hubungan langsung antara device ID dan employee_code
- `card_no` di `mst_employee` = NULL semua
- Mapping logic lama expect numeric-only ID → gagal untuk prefix IDs

---

## VISI: MONITORING DASHBOARD v2

**5 halaman web profesional + API lengkap:**

### Halaman 1: `/machines.html` — Real-Time Machine Monitor
- **Fitur utama:** Status ONLINE/OFFLINE setiap mesin (ping check real-time)
- Toggle: **Mesin vs Database** — switch untuk lihat data mentah mesin vs data di DB
- Card per mesin: IP, Port, Last Sync, Error, Employee count today, Total records today
- Tabel employee yang ada di mesin (dari scan_logs) vs di database
- Color coding: 🟢 Accessible, 🔴 Offline, 🟡 Error
- Refresh otomatis setiap 30 detik

### Halaman 2: `/dashboard.html` — Command Center
- Overview: Total mesin, online, offline, sync status
- Quick stats: Scan hari ini, employee aktif, import pending
- Mini chart: Trend scan per hari (7 hari terakhir)
- Alert panel: mesin offline, sync gagal, mapping bermasalah

### Halaman 3: `/machine-compare.html` — Machine vs Database Comparator (BARU)
- Pilih mesin dari dropdown
- **3 tab view:**
  1. **Machine Raw** — semua raw_device_user_id dari scan_logs mesin ini
  2. **Database Parsed** — semua parsed_employee_code yang sudah berhasil di-map
  3. **Unmapped Review** — daftar employee ID yang belum bisa di-map (bisa manual map dari halaman ini)
- Employee ID parsing display: Tampilkan format asli mesin → suggested employee_code
- Bulk action: Export CSV, Mark as reviewed

### Halaman 4: `/division-analysis.html` — Division Monthly Analysis (BARU)
- Pilih tahun + bulan
- Tabel per divisi: Total hadir, absent, sick, leave, holiday, overtime
- **Chart:** Bar chart Hadir vs Tidak Hadir per divisi
- **Chart:** Line chart trend absensi per hari dalam sebulan
- Pie chart: Distribution of attendance status per division
- Export ke Excel

### Halaman 5: `/import-history.html` — Import Control & Scheduler
- Daftar semua batch import dengan filter (mesin, status, tanggal)
- Tombol **Trigger Sync** per mesin (panggil sync script via API)
- Tombol **Trigger All** (sync semua mesin)
- Schedule toggle: Aktifkan/nonaktifkan auto-sync per mesin
- Cron expression editor untuk scheduling

---

## API ENDPOINTS YANG PERLU DIBUAT/DIPERBAIKI

### Existing (perbaiki jika perlu):
```
GET  /api/monitoring/dashboard         ✅ sudah works
GET  /api/monitoring/machines        ✅ sudah works  
GET  /api/monitoring/batches         ✅ sudah works
GET  /api/monitoring/quality         ✅ sudah works
GET  /api/monitoring/division-summary ✅ sudah works
```

### NEW API Endpoints:

#### 1. `GET /api/monitoring/machine-ping`
Ping semua mesin atau satu mesin untuk cek online status secara real-time.
```json
Response: {
  "data": [
    { "machine_code": "AB1", "ip": "103.144.208.154", "port": 4900,
      "reachable": true, "latency_ms": 45, "checked_at": "2026-06-18T..." },
    { "machine_code": "PGE", "ip": "223.25.98.220", "port": 4370,
      "reachable": false, "latency_ms": null, "error": "timeout" }
  ]
}
```
**Implementation:** TCP socket connection test + ping. Timeout 3 detik.

#### 2. `GET /api/monitoring/machine/:code/employees`
Ambil daftar employee yang tercatat di satu mesin (dari scan_logs + employees table).
```json
Response: {
  "data": {
    "machine_code": "AB1",
    "machine_raw": [           // dari scan_logs (raw_device_user_id)
      { "raw_id": "9000626", "count": 320, "last_seen": "2026-06-18T..." },
      { "raw_id": "9000410", "count": 296, "last_seen": "2026-06-18T..." }
    ],
    "database_mapped": [       // dari employees table
      { "employee_code": "0010001", "name": "DIANA (ROBIYAH)", "division": "A", "last_scan": "..." },
      ...
    ],
    "unmapped": [             // dari scan_logs WHERE mapping_status != 'MAPPED'
      { "raw_id": "9000626", "count": 320, "last_seen": "...", "suggested_mapping": null }
    ]
  }
}
```

#### 3. `GET /api/monitoring/machine/:code/raw-data`
Data mentah dari scan_logs untuk satu mesin (pagination).
```
Query params: ?page=1&limit=50&filter=unmapped|mapped|all
```

#### 4. `POST /api/monitoring/sync/:machineCode`
Trigger sync untuk satu mesin via node-zklib.
```json
Response: {
  "data": {
    "batch_id": "123",
    "status": "RUNNING",
    "records_expected": 0
  }
}
```

#### 5. `POST /api/monitoring/sync-all`
Trigger sync semua mesin (parallel).
```json
Response: {
  "data": {
    "triggered": 16,
    "batches": [{ "machine_code": "AB1", "batch_id": "12" }, ...]
  }
}
```

#### 6. `GET /api/monitoring/sync-status/:batchId`
Cek status satu batch sync.
```json
Response: {
  "data": {
    "batch_id": "12", "status": "RUNNING|COMPLETED|FAILED",
    "records_total": 1234, "records_success": 45, "records_failed": 1189
  }
}
```

#### 7. `POST /api/monitoring/employees/:employeeCode/map`
Manual map raw_device_user_id ke employee_code (untuk unmapped review).
```json
Request: { "raw_id": "9000626", "machine_code": "AB1", "employee_code": "0010001" }
Response: { "data": { "mapped": 1, "updated_scan_logs": 320 } }
```

#### 8. `GET /api/monitoring/division/monthly`
Division monthly stats dengan breakdown per status.
```
Query: ?year=2026&month=6
Response: {
  "data": {
    "year": 2026, "month": 6,
    "divisions": [
      {
        "division_code": "A",
        "division_name": "Kebun A",
        "total_records": 4521,
        "hadir": 3200, "tidak_hadir": 800, "sick": 120, "leave": 301, "holiday": 100,
        "unique_employees": 150,
        "attendance_rate": 70.8,
        "daily_breakdown": [...]
      }
    ]
  }
}
```

---

## EMPLOYEE ID MAPPING STRATEGY

### Device ID Formats dari Mesin:

| Format | Contoh | Mesin | Pattern |
|--------|--------|-------|---------|
| `900XXXX` | 9000626 | AB1/AB2/ARA | 900 prefix + 4 digit |
| `AXXXXX` | A20020 | PGE/OFFICE | A prefix + 5 digit |
| `XXXXX` | 50106 | AB2 (some) | 5 digit numeric |
| `GXXXXX` | G10061 | AB1 | loc_code prefix |

### Employee Code Format:
- Format: `XXXXXXX` (7 digit, zero-padded)
- Prefix 2 digit = division group: 00, 10, 20, 30, 40, 50, 80, 90
- Contoh: `0010001`, `0020001`, `1020050`

### Mapping Logic (3-tier approach):

**Tier 1 — Direct Match (paling akurat):**
```sql
-- Untuk numeric device IDs (50106 → H50106 → cari H50106)
SELECT employee_code FROM employees
WHERE employee_code LIKE '%' + @numeric_suffix
AND division_code = @loc_code
```

**Tier 2 — Pattern Extraction:**
```
9000626 → strip "900" → 00626 → cari 00xxx26 atau 0062xxx
A20020  → strip "A" → 20020 → cari xxx020 atau 020020
```

**Tier 3 — HR Review Queue:**
- Semua yang tidak bisa di-map otomatis → status `NEED_REVIEW`
- Simpan di `employee_mapping_overrides` table
- UI untuk manual mapping

### Mapping Table Schema (NEW):
```sql
CREATE TABLE employee_mapping_overrides (
  id INT IDENTITY PRIMARY KEY,
  raw_device_id VARCHAR(50) NOT NULL,
  machine_code VARCHAR(20) NOT NULL,
  employee_code VARCHAR(20) NOT NULL,
  mapped_by VARCHAR(50) DEFAULT 'system',
  created_at DATETIME DEFAULT GETDATE(),
  UNIQUE(raw_device_id, machine_code)
);
```

---

## DATA FLOW DIAGRAM

```
ZKTeco Machine (ip:port)
    ↓ TCP/ZKLib
sync-machines.ts script
    ↓
attendance_scan_logs (raw_device_user_id, mapping_status=UNMAPPED)
    ↓ parsing engine (3-tier)
attendance_imports (employee_id, employee_code, attendance_date)
    ↓
Final Reports
```

### Yang terjadi sekarang:
1. Sync script konek ke mesin ✅
2. Ambil attendance data dari mesin ✅
3. Simpan raw ke scan_logs ✅
4. Parsing employee ID → GAGAL 97.3%
5. Import ke attendance_imports → KOSONG

### Yang perlu diperbaiki:
1. Fix parsing logic (3-tier approach)
2. Buat mapping_overrides table
3. Buat UI untuk manual mapping
4. Trigger re-parse setelah mapping added

---

## SCHEDULE STRATEGY

### Auto-Sync Schedule (per mesin):
```yaml
AB1, AB2:      every 15 min  (high traffic estate)
ARA, ARC_01/02: every 30 min  (office area)
DME_01/02:     every 30 min
IJL, ARE:      every 30 min
PGE:           every 15 min  (office - high traffic)
P1A/B, P2A/B:  every 60 min  (onsite - internal network)
MILL, OFFICE:  every 60 min
```

### Sync Flow:
1. Scheduler trigger → call sync script
2. Script konek ke mesin → get attendance
3. Raw data masuk ke scan_logs
4. Parsing engine process unmapped records
5. Successfully parsed → import to attendance_imports
6. Dashboard auto-refresh via polling

---

## FILE STRUCTURE YANG PERLU DIBUAT/DIPERBAIKI

```
src/
├── api/routes/
│   ├── monitoring.routes.ts     [REWRITE - fix all endpoints]
│   ├── sync.routes.ts          [NEW - trigger/result sync]
│   └── machine-employee.routes.ts [NEW - machine employee data]
├── public/
│   ├── dashboard.html          [EXISTING - enhance]
│   ├── machines.html           [EXISTING - enhance]
│   ├── machine-compare.html    [NEW]
│   ├── division-analysis.html  [NEW]
│   ├── import-history.html     [EXISTING - enhance]
│   └── scheduler.html          [EXISTING]
└── scripts/
    └── sync-machines.ts        [EXISTING - fix mapping logic]
```

---

## IMPLEMENTATION ORDER

### Phase 1: API Foundation (Haiku executes)
1. [ ] Fix monitoring.routes.ts — all endpoints return correct shape
2. [ ] Create sync.routes.ts — trigger sync, get batch status
3. [ ] Create machine-employee.routes.ts — raw vs mapped employee data
4. [ ] Create ping endpoint — real-time machine reachability
5. [ ] Create division/monthly endpoint — monthly division stats
6. [ ] Fix server.ts — add ping route, static serve machine-compare.html

### Phase 2: Sync Engine (Haiku executes)
1. [ ] Fix sync-machines.ts parsing logic (3-tier approach)
2. [ ] Create employee_mapping_overrides table
3. [ ] Rebuild sync-machines.ts import logic to use new table
4. [ ] Test sync on AB1 (reachable machine)

### Phase 3: UI Pages (Write HTML directly)
1. [ ] Rewrite dashboard.html — dark theme, chart.js, stats cards
2. [ ] Rewrite machines.html — real-time status, employee counts, machine/DB toggle
3. [ ] Write machine-compare.html — 3-tab comparator with manual map
4. [ ] Write division-analysis.html — monthly analysis with charts
5. [ ] Enhance import-history.html — trigger buttons + schedule UI

### Phase 4: Polish & Integration
1. [ ] Add chart.js CDN to all pages
2. [ ] Auto-refresh on machine pages (30s interval)
3. [ ] Toast notifications for sync events
4. [ ] Export CSV buttons
5. [ ] Test full flow end-to-end

---

## VERIFICATION COMMANDS

```bash
# Start server
cd D:/Gawean\ Rebinmas/Absensi_Muka
node dist/server.js

# Test all endpoints
curl http://localhost:8004/api/monitoring/dashboard
curl http://localhost:8004/api/monitoring/machines
curl http://localhost:8004/api/monitoring/quality
curl http://localhost:8004/api/monitoring/division-summary?year=2026&month=6

# New endpoints (after implementation)
curl http://localhost:8004/api/monitoring/machine-ping
curl http://localhost:8004/api/monitoring/machine/AB1/employees
curl http://localhost:8004/api/monitoring/sync/AB1
curl http://localhost:8004/api/monitoring/sync-status/12

# Pages
open http://localhost:8004/dashboard.html
open http://localhost:8004/machines.html
open http://localhost:8004/machine-compare.html
open http://localhost:8004/division-analysis.html
open http://localhost:8004/import-history.html
```
