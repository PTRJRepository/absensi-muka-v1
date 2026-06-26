# Dokumen Perancangan Aplikasi Absensi PT Rebinmas Jaya

**Source:** `C:\Users\nbgmf\Downloads\Dokumen_Perancangan_Aplikasi_Absensi_PT_Rebinmas_Jaya.docx`

## Ringkasan Eksekutif

Aplikasi monitoring, import absensi, dan real-time attendance control untuk PT REBINMAS JAYA - Perkebunan Kelapa Sawit.

**Target:** World-class operational attendance platform untuk kebun, mill, office, HR, payroll, dan IT operations.

Sistem harus mendukung dua jalur data:
- Direct raw log dari mesin ZKTeco untuk real-time
- API IT Solution untuk fallback/rekonsiliasi data terstruktur

**Status mesin:** 7 dari 16 mesin accessible, 9 mesin blocked/unreachable.

---

## 1. Kondisi Saat Ini

### Baseline Sistem
- 16 mesin ZKTeco/Solution X601
- Direct TCP connection menggunakan node-zklib
- Database SQL Server: `rebinmas_absensi_monitoring`
- API IT Solution sebagai fallback

### Status Mesin
- **Accessible:** 7 mesin
- **Blocked/Unreachable:** 9 mesin

### Machine Status Types
- `ACCESSIBLE` - mesin dapat diakses langsung
- `PORT_BLOCKED` - port diblokir firewall/NAT
- `NETWORK_UNREACHABLE` - tidak dapat dijangkau jaringan
- `DEGRADED` - koneksi tidak stabil
- `API_ONLY` - hanya dapat diakses via API fallback

---

## 2. Visi Produk

Platform pusat kendali absensi operasional yang:
- Reliable dan auditable
- Observable dan secure
- Resilient terhadap network kebun
- Mudah digunakan HR/payroll
- Aman untuk produksi

---

## 3. Scope dan Batasan

### 3.1 In Scope
- Monitoring status 16 mesin: online/offline, reachable/unreachable, last sync, total users, total logs, latency, error terakhir
- Import absensi dari Direct ZKTeco untuk mesin accessible
- Import absensi dari IT Solution API untuk data harian dan fallback
- Realtime monitoring via polling dan event stream
- Mapping raw deviceUserId menjadi employee_code
- Batch tracking dan audit trail
- Dashboard untuk management, HR, payroll, IT, dan admin
- Data quality: unmapped employee, duplicate scan, missing check-in/out, machine time drift, stale sync, division mismatch

### 3.2 Out of Scope Tahap Awal
- Mengubah firmware mesin absensi
- Menghapus log langsung dari mesin produksi
- Menggantikan total software IT Solution sejak hari pertama
- Integrasi otomatis final payroll tanpa validasi manual
- Mobile native app (responsive web dashboard sudah cukup)

---

## 4. Role Pengguna dan Hak Akses

| Role | Deskripsi |
|------|-----------|
| Admin | Full access, machine inventory management |
| IT Operations | Device management, troubleshooting |
| HR | Data validation, import approval |
| Payroll | Report access, data export |
| Management | Executive dashboard, KPI |
| Plantation Manager | Division-specific monitoring |

---

## 5. Arsitektur Target

### Layered Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Dashboard                             │
│  Executive KPI • Device Health • Import Center • Live Feed      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST + WebSocket/SSE
┌───────────────────────────────┴─────────────────────────────────┐
│                       Backend API Layer                          │
│  Auth/RBAC • Query API • Import API • Device API • Report API   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Service Calls
┌───────────────────────────────┴─────────────────────────────────┐
│                     Domain Service Layer                         │
│  Attendance Processor • Employee Mapper • Batch Manager          │
│  Quality Engine • Reconciliation Engine • Alert Engine           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Normalized Events
┌───────────────────────────────┴─────────────────────────────────┐
│                    Data Collection Layer                         │
│  Direct ZKTeco Collector • IT Solution API Collector            │
│  Manual/USB Import                                              │
└───────────────────────────────┬─────────────────────────────────┘
                                │ TCP / HTTP / File
┌───────────────────────────────┴─────────────────────────────────┐
│     16 Machines + IT Solution API + Legacy Data Source          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Strategi Data Source

### 6.1 Direct ZKTeco

**Kegunaan:** Raw attendance logs dan real-time monitoring

**Implementasi:**
```typescript
const zk = new ZKLib(ip, port, 30000, 4000, '12345');
await zk.createSocket();
await zk.disableDevice();
const users = (await zk.getUsers())?.data || [];
const logs = (await zk.getAttendances())?.data || [];
await zk.enableDevice();
await zk.disconnect();
```

**Catatan:**
- Timeout minimal 30000ms untuk dataset besar
- Password: `12345`
- Selalu enable device dan disconnect di blok finally

### 6.2 IT Solution API

**Kegunaan:** Fallback untuk mesin blocked/unreachable, rekonsiliasi data harian

**Endpoints:**
- `/api/divisions`
- `/api/available-months-by-division`
- `/api/attendance-by-division`

**Header:** `x-api-key: <API_KEY>`

---

## 7. Desain Database

### 7.1 Tabel Existing/Fondasi
- `employees` - Master employee data
- `divisions` - Division master
- `attendance_scan_logs` - Raw attendance scan records
- `attendance_imports` - Processed attendance records
- `attendance_import_batches` - Import batch tracking
- `attendance_machines` - Machine inventory

### 7.2 Tabel Tambahan

**machine_health_checks:**
```sql
CREATE TABLE machine_health_checks (
  id BIGINT IDENTITY PRIMARY KEY,
  machine_id INT NOT NULL,
  machine_code NVARCHAR(50) NOT NULL,
  checked_at DATETIME NOT NULL DEFAULT GETDATE(),
  ping_ok BIT NULL,
  tcp_ok BIT NULL,
  zk_ok BIT NULL,
  latency_ms INT NULL,
  error_code NVARCHAR(100) NULL,
  error_message NVARCHAR(1000) NULL
);
```

**attendance_import_errors:**
```sql
CREATE TABLE attendance_import_errors (
  id BIGINT IDENTITY PRIMARY KEY,
  batch_id BIGINT NOT NULL,
  raw_data NVARCHAR(MAX),
  error_type NVARCHAR(50),
  error_message NVARCHAR(MAX),
  created_at DATETIME DEFAULT GETDATE()
);
```

**Deduplication Index:**
```sql
CREATE UNIQUE INDEX UX_attendance_scan_dedupe
ON attendance_scan_logs(machine_code, raw_device_user_id, raw_record_time);
```

---

## 8. Employee Mapping Strategy

### userIdToEmpCode Logic
```typescript
function userIdToEmpCode(userId: string, locCode: string): string {
  const id = String(userId).trim();
  if (/^[A-Z]\d+$/.test(id)) return id;  // Sudah dalam format huruf+angka
  const last4Match = id.match(/\d{1,4}$/);
  if (last4Match) return `${locCode}${last4Match[0].padStart(4, '0')}`;
  return `${locCode}${id}`;
}
```

### LocCode Mapping

| Machine | LocCode | Division | ScannerCode |
|---------|---------|----------|-------------|
| OFFICE_PGE | A | STF | - |
| MILL | A | STF | - |
| OFFICE_APE | F | ARA | - |
| IJL | L | IJL | - |
| AB2 | H | AB2 | 400 |
| P1A | A | PG1A | 100 |
| P1B | B | PG1B | 300 |

---

## 9. Functional Requirements

### 9.1 Machine Monitoring Center
- Real-time device health status
- Last sync timestamp dan latency
- Total users dan logs per mesin
- Error tracking dan alerting
- Network remediation tracking

### 9.2 Attendance Import Center
- Batch-based import dari ZKTeco direct
- API-based import dari IT Solution
- Manual/USB import untuk data cadangan
- Preview sebelum commit
- Import history dan audit trail

### 9.3 Real-Time Attendance Control
- Live feed scan terbaru
- Polling interval configurable
- WebSocket/SSE untuk update real-time
- Trigger-based alerting

### 9.4 Data Quality Center
- Unmapped employee detection
- Duplicate scan identification
- Missing check-in/out analysis
- Machine time drift detection
- Division mismatch alerts
- Stale sync warnings

### 9.5 Audit Platform
- Comprehensive audit trail
- Role-based access control
- Division-scoped permissions
- Data export logging
- Compliance-ready reports

---

## 10. Non-Functional Requirements

| Aspek | Requirement |
|-------|-------------|
| Reliability | 99.5% uptime untuk core services |
| Performance | Response time < 2 detik untuk dashboard |
| Scalability | Support 16+ mesin, 10,000+ employees |
| Security | JWT auth, RBAC, encrypted secrets |
| Observability | Structured logging, metrics, tracing |
| Resilience | Graceful degradation saat mesin offline |

---

## 11. Workflow Utama

### 11.1 Realtime Machine Sync Workflow
```
Scheduler → Health Check → ZKTeco Collector → Normalize → 
Employee Mapper → Idempotent Insert → Batch Complete → Realtime Event
```

**Error Handling:**
```typescript
try {
  markJobRunning(machine);
  await healthCheck(machine);
  const raw = await zktecoCollector.pull(machine);
  const batch = await batchManager.create('DIRECT_ZKTECO', machine.code);
  const normalized = normalize(raw, machine);
  const mapped = await employeeMapper.mapMany(normalized);
  await attendanceRepository.insertIdempotent(mapped, batch.id);
  await batchManager.complete(batch.id, stats);
  publishRealtimeEvent('sync.completed', { machine, stats });
} catch (error) {
  await batchManager.fail(batch.id, error);
  publishRealtimeEvent('sync.failed', { machine, error });
} finally {
  await safeEnableAndDisconnect(machine);
}
```

### 11.2 API Import Workflow
1. User pilih division, month, year, mode (HK/OT)
2. Fetch data dari IT Solution API
3. Display preview (total employee, day records, holiday/cuti/sakit/OT)
4. Validate employee_code terhadap master
5. User commit atau download error list
6. Batch source: `IT_SOLUTION_API`

### 11.3 Manual/USB Import Workflow
1. User upload file export dari mesin
2. Parser detect format dan display preview
3. User pilih machine_code/source
4. Staging, validation, commit
5. Errors masuk attendance_import_errors

---

## 12. UX/UI Specification

### Visual Theme
- Profesional, gelap-modern untuk command center
- Warna status konsisten:
  - Hijau: online/success
  - Kuning: degraded/warning
  - Merah: offline/failed
  - Biru: running/syncing

### Dashboard Structure
- Card-based dan table dengan drill-down
- Summary → Division → Machine → Employee → Raw Log

### Error Handling
- Setiap error dengan recommended action
- Contoh: "Port blocked: cek NAT/firewall untuk 103.144.208.154:4800"

### Status Badges
- `ACCESSIBLE`, `PORT_BLOCKED`, `NETWORK_UNREACHABLE`, `API_ONLY`, `SYNCING`, `STALE`, `DEGRADED`

### Data Source Indicators
- `DIRECT_ZKTECO`, `IT_SOLUTION_API`, `MANUAL_USB`

### Data Quality Severity
- Critical, Warning, Info

---

## 13. Security Design

- Authentication: Session/JWT dengan RBAC granular
- Division scope untuk multi-tenant isolation
- Secrets di environment variables
- Least privilege database account
- HTTPS untuk cross-network access
- Audit logging untuk data export
- No internal IPs/credentials di frontend response untuk non-IT role

---

## 14. Deployment dan Infrastruktur

### Production Setup
```
Windows/Linux Server
├── Backend API Service
├── Attendance Worker Service
├── Realtime Gateway
├── SQL Server Database
├── Log Directory
└── Backup Job
```

### Network Access Required
- Backend/Worker → Machine IP:port
- Backend → IT Solution API (http://10.0.0.110:5176)
- Backend → SQL Server 1433
- Users → Web Dashboard HTTPS

---

## 15. Rencana Perbaikan Network

### PowerShell Checks
```powershell
Test-NetConnection 10.0.0.90 -Port 4100
Test-NetConnection 10.0.0.91 -Port 4300
Test-NetConnection 10.0.0.92 -Port 4500
Test-NetConnection 10.0.0.93 -Port 4600
Test-NetConnection 10.0.0.94 -Port 4501
```

### Command
```bash
bun run _dev_utils/test-all-machines.ts
```

---

## 16. Roadmap Implementasi

### Phase 1: Stabilisasi & Ingestion
- Machine inventory service
- Raw logs ingestion
- Import batch manager
- Idempotency dan health checks

### Phase 2: Data Quality
- Unmapped employee detection
- Duplicate scan identification
- Missing check-in/out analysis

### Phase 3: Real-Time Monitoring
- Live feed dashboard
- WebSocket/SSE integration
- Alert engine

### Phase 4: API Integration
- IT Solution API collector
- Rekonsiliasi data
- Fallback mechanism

### Phase 5: Advanced Features
- Report builder
- Payroll integration ready
- Mobile-responsive optimization

---

## 17. SQL Query Operasional

### Status Semua Mesin
```sql
SELECT machine_code, ip_address, port, loc_code, access_status, 
       data_source, is_active, updated_at
FROM attendance_machines
ORDER BY machine_code;
```

### Records per Machine
```sql
SELECT machine_code, COUNT(*) AS total_records, MAX(scan_time) AS last_scan
FROM attendance_scan_logs
GROUP BY machine_code
ORDER BY machine_code;
```

### Unmapped Raw Logs
```sql
SELECT TOP 100 machine_code, raw_device_user_id, raw_record_time, 
       parsed_employee_code, mapping_status, mapping_reason
FROM attendance_scan_logs
WHERE mapping_status <> 'MAPPED'
ORDER BY raw_record_time DESC;
```

### Latest Import Batches
```sql
SELECT TOP 20 batch_code, source, machine_code, records_total, 
       records_success, status, started_at, finished_at
FROM attendance_import_batches
ORDER BY started_at DESC;
```

### Duplicate Scan Candidates
```sql
SELECT machine_code, raw_device_user_id, raw_record_time, COUNT(*) AS duplicate_count
FROM attendance_scan_logs
GROUP BY machine_code, raw_device_user_id, raw_record_time
HAVING COUNT(*) > 1;
```

---

## 18. Risiko dan Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Network instability | API fallback, graceful degradation |
| Duplicate data | Idempotent inserts, deduplication |
| Unmapped employees | Quality engine, alert system |
| Security breach | RBAC, least privilege, audit trail |
| Data loss | Backup jobs, import history |

---

## 19. Rekomendasi Final

1. **Hybrid Platform:** Bangun aplikasi sebagai platform hybrid: Direct ZKTeco + IT Solution API
2. **Start dengan Stabilisasi:** Database dan ingestion sebagai fondasi
3. **Pilot P1A/P1B:** Sudah accessible, mewakili pola kebun
4. **Jangan tunggu network:** Support API fallback untuk mesin blocked
5. **Dashboard Operasional:** Jawab 3 pertanyaan: mesin mana bermasalah, data mana belum masuk, employee mana belum termapping
6. **Audit Trail:** Wajib ada sebelum payroll integration
7. **Division-scoped access:** Multi-tenant isolation

---

## 20. Referensi Dokumen Internal

1. `01-project-overview.md` - Project overview, architecture, machine status
2. `02-machine-configuration.md` - 16 machine configurations
3. `03-api-reference.md` - IT Solution API endpoint
4. `04-database-schema.md` - SQL Server tables
5. `05-data-sources.md` - Data source comparison
6. `06-commands.md` - Commands untuk troubleshooting