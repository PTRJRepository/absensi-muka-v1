# PRD: Sistem Monitoring Absensi PT Rebinmas Jaya

**Version:** 2.0 (Refactored)
**Date:** 2026-06-20
**Status:** Draft

---

## 1. Executive Summary

### Problem Statement

PT Rebinmas Jaya mengelola 16 mesin absensi ZKTeco di berbagai lokasi perkebunan kelapa sawit. Tantangan utama:

1. **Konektivitas Terbatas** - Tidak semua mesin bisa diakses langsung (port blocked, network unreachable)
2. **Dual Employee Code Format** - IT Solution API menggunakan "0010001", ZKTeco menggunakan "A0044"
3. **Batch Import Issues** - Proses import bisa gagal atau stuck
4. **Data Quality** - Banyak employee code tidak terpetakan

### Proposed Solution

Sistem monitoring absensi terpusat yang mampu:
- Mengambil data dari mesin ZKTeco langsung
- Fallback ke IT Solution API untuk mesin yang tidak accessible
- Menyimpan raw logs dan processed attendance
- Monitoring kualitas data dan status mesin
- Memberikan visibilitas real-time kepada IT, HR, dan admin payroll

### Expected Outcomes

| Outcome | Target |
|---------|--------|
| Data masuk real-time | 15 menit setelah sync |
| Machine status accuracy | 100% |
| Employee mapping rate | >90% |
| Data quality score | >80% |
| System uptime | 99% |

### MVP Scope Boundary

**In MVP:**
- Dashboard monitoring
- Machine list & sync
- Daily attendance view
- Quality metrics display
- Basic export (Excel)

**Out of MVP:**
- Full payroll integration
- Mobile app
- Face recognition
- Advanced anomaly detection

---

## 2. User Stories

### 2.1 IT Admin

```
Sebagai IT Admin,
Saya ingin melihat status semua mesin absensi,
Agar saya bisa tahu mesin mana yang online/offline.

Sebagai IT Admin,
Saya ingin sync data dari mesin tertentu,
Agar data absensi tersimpan di database.

Sebagai IT Admin,
Saya ingin test koneksi ke mesin,
Agar saya bisa diagnosis masalah koneksi.

Sebagai IT Admin,
Saya ingin lihat error sync terakhir,
Agar saya bisa troubleshooting masalah.
```

### 2.2 HR Admin

```
Sebagai HR Admin,
Saya ingin lihat absensi harian per tanggal,
Agar saya bisa pantau kehadiran karyawan.

Sebagai HR Admin,
Saya ingin filter absensi per divisi,
Agar saya fokus ke divisi tertentu.

Sebagai HR Admin,
Saya ingin export data absensi ke Excel,
Agar saya bisa olah data lebih lanjut.

Sebagai HR Admin,
Saya ingin koreksi status absensi,
Agar data sesuai dengan实际情况.
```

### 2.3 Payroll Admin

```
Sebagai Payroll Admin,
Saya ingin pastikan data absensi sudah lengkap,
Agar proses payroll akurat.

Sebagai Payroll Admin,
Saya ingin lihat summary sakit/cuti/hadir,
Agar saya bisa hitung komponen upah.

Sebagai Payroll Admin,
Saya ingin export data untuk payroll,
Agar data siap diproses.
```

### 2.4 Manager

```
Sebagai Manager,
Saya ingin lihat ringkasan kehadiran per divisi,
Agar saya tahu performa kehadiran tim.

Sebagai Manager,
Saya ingin lihat skor kualitas data,
Agar saya tahu kapan data siap diproses.
```

---

## 3. Functional Requirements

### 3.1 Dashboard & Monitoring

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| DASH-001 | Display total machines active | Implemented | P0 |
| DASH-002 | Display machines online/offline | Implemented | P0 |
| DASH-003 | Display total employees | Implemented | P0 |
| DASH-004 | Display scans today | Implemented | P0 |
| DASH-005 | Display unmapped count | Implemented | P0 |
| DASH-006 | Display quality score | Implemented | P0 |
| DASH-007 | Display last sync timestamp | Implemented | P0 |
| DASH-008 | Refresh button reloads data | Implemented | P1 |

### 3.2 Machine Management

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| MACH-001 | Display all machines in grid | Implemented | P0 |
| MACH-002 | Display online/offline status | Implemented | P0 |
| MACH-003 | Display IP and port | Implemented | P0 |
| MACH-004 | Sync single machine | Implemented | P0 |
| MACH-005 | Sync all machines | Implemented | P0 |
| MACH-006 | Test connection per machine | Implemented | P1 |
| MACH-007 | Display sync history | Implemented | P1 |

### 3.3 Sync & Import

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| SYNC-001 | Create batch record per sync | Implemented | P0 |
| SYNC-002 | Store raw logs without delete | Implemented | P0 |
| SYNC-003 | Prevent duplicates | Implemented | P0 |
| SYNC-004 | Record success/failed counts | Implemented | P0 |
| SYNC-005 | Continue if one machine fails | Implemented | P1 |
| SYNC-006 | Manual and scheduler sync | Implemented | P1 |

### 3.4 Attendance Daily

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| ATT-001 | Display daily attendance by date | Implemented | P0 |
| ATT-002 | Filter by division | Implemented | P0 |
| ATT-003 | Search by employee name/code | Implemented | P0 |
| ATT-004 | Display status badges | Implemented | P0 |
| ATT-005 | Pagination | Implemented | P0 |
| ATT-006 | Manual correction | Implemented | P1 |

### 3.5 Quality Metrics

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| QUAL-001 | Display quality score | Implemented | P0 |
| QUAL-002 | Display mapped/unmapped counts | Implemented | P0 |
| QUAL-003 | Display duplicate detection | Implemented | P0 |
| QUAL-004 | Display daily trend | Implemented | P1 |
| QUAL-005 | Display machine drift | Implemented | P1 |

### 3.6 Secondary Features (Phase 3+)

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| MAP-001 | Unmapped records list UI | Backend only | P2 |
| MATRIX-001 | Monthly matrix visualization | Backend only | P2 |
| ALERT-001 | Alert display in UI | Backend only | P2 |
| BATCH-001 | Batch history page | Backend only | P2 |
| RBAC-001 | Role-based access | Partial | P3 |

---

## 4. Technical Specifications

### 4.1 Database Schema

**Database:** `rebinmas_absensi_monitoring`

#### Core Tables

| Table | Purpose |
|-------|---------|
| `employees` | Master employee (emp_code format: "0010001") |
| `divisions` | Division master |
| `attendance_machines` | 16 machine inventory |
| `attendance_scan_logs` | Raw logs from ZKTeco (emp_code format: "A0044") |
| `attendance_imports` | Processed attendance |
| `attendance_import_batches` | Batch tracking |
| `attendance_manual_corrections` | Manual corrections |
| `users`, `roles`, `user_roles` | Authentication |

#### Key Views

| View | Purpose |
|------|---------|
| `vw_attendance_final` | Final attendance per employee per date |
| `vw_attendance_monthly_summary` | Monthly summary |
| `vw_attendance_daily_summary` | Daily summary by division |

### 4.2 API Specification

**Base URL:** `http://localhost:8004`

#### Monitoring Endpoints

```
GET /api/monitoring/dashboard    - Dashboard summary
GET /api/monitoring/machines      - Machine list
GET /api/monitoring/machine/:code - Machine detail
GET /api/monitoring/batches     - Batch list
GET /api/monitoring/batch/:id   - Batch detail
GET /api/monitoring/quality      - Quality metrics
GET /api/monitoring/division-summary - Division summary
```

#### Attendance Endpoints

```
GET /api/attendance/daily?date=YYYY-MM-DD&divisionCode=X
GET /api/attendance/monthly?year=Y&month=M
GET /api/attendance/employee/:code
POST /api/attendance/corrections
```

#### Sync Endpoints

```
POST /api/monitoring/sync/:code     - Sync single machine
POST /api/monitoring/sync-all      - Sync all machines
GET  /api/machines/real-time-status
```

### 4.3 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ATTENDANCE SYSTEM DATA FLOW                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐     ┌──────────┐     ┌──────────────────────┐    │
│  │ ZKTeco   │────▶│  Import  │────▶│ attendance_scan_logs  │    │
│  │ Machines │     │  Layer   │     │ (raw, immutable)      │    │
│  └──────────┘     └────┬─────┘     └──────────────────────┘    │
│                          │                                       │
│                          ▼                                       │
│                 ┌────────────────┐                               │
│                 │ Employee       │                               │
│                 │ Mapping       │                               │
│                 │ (A0044→emp)  │                               │
│                 └───────┬────────┘                               │
│                         │                                        │
│                         ▼                                        │
│                 ┌────────────────┐     ┌──────────────────┐   │
│                 │ attendance_    │────▶│ vw_attendance_   │   │
│                 │ imports       │     │ final            │   │
│                 └────────────────┘     └────────┬─────────┘   │
│                                               │              │
│                                               ▼              │
│                                    ┌──────────────────┐     │
│                                    │ Dashboard /      │     │
│                                    │ Attendance View   │     │
│                                    └──────────────────┘     │
│                                                                  │
│  ┌──────────┐     ┌──────────┐     ┌──────────────────────┐    │
│  │ IT       │────▶│  API    │────▶│ attendance_imports   │    │
│  │ Solution │     │  Import  │     │ (source=API)       │    │
│  └──────────┘     └──────────┘     └──────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Business Rules

#### BR-001: Employee Code Parsing

```
RULE: ZKTeco userId → Employee Code

IF userId matches pattern [A-Z]\d{4}
THEN use userId directly as emp_code (e.g., "A0044")

IF userId is numeric only (e.g., "10044")
THEN take last 4 digits = "0044"
AND prepend loc_code from machine = "A"
AND result = "A0044"

IF userId has scanner prefix (e.g., "10044")
THEN strip prefix (e.g., "100")
AND take remaining digits = "44"
AND pad to 4 digits = "0044"
AND prepend loc_code = "A0044"
```

#### BR-002: Attendance Status Priority

```
PRIORITY: Source Selection (highest to lowest)

1. Manual Correction - Data diubah admin
2. Direct ZKTeco - Dari scan mesin
3. IT Solution API - Fallback
4. NO_DATA - Tidak ada data
```

#### BR-003: Batch Status

```
STATUS VALUES:
- RUNNING: Sedang berjalan
- COMPLETED: Selesai sukses
- FAILED: Gagal
- PARTIAL_SUCCESS: Sebagian berhasil
- STUCK: Terlalu lama RUNNING (>30 menit)
```

#### BR-004: Quality Score Formula

```
quality_score = (
  (mapped_records / total_records * 0.50) +
  (successful_batches / total_batches * 0.25) +
  (online_machines / total_machines * 0.15) +
  (non_duplicate_records / total_records * 0.10)
) * 100

STATUS:
- 90-100%: Sehat (Hijau)
- 70-89%:  : Baik (Biru)
- 50-69%  : Perlu Perhatian (Orange)
- <50%     : Kritis (Merah)
```

---

## 5. Non-Functional Requirements

### 5.1 Performance SLAs

| Metric | Target |
|--------|--------|
| Dashboard load | < 3 detik |
| Machine status check | < 10 detik per mesin |
| Daily attendance query | < 5 detik |
| Sync mesin besar | Timeout 30 detik, configurable |

### 5.2 Security

| Requirement | Implementation |
|-------------|-----------------|
| API Authentication | JWT token |
| Role-based access | Super Admin, IT Admin, HR Admin, Payroll Admin, Viewer |
| Credential storage | Environment variables |
| Audit logging | Semua perubahan tercatat |

---

## 6. MVP Delivery Plan

### Phase 1: Foundation (Week 1-2)

**Fokus:** Dashboard monitoring dan machine management

| Task | Deliverable |
|------|-------------|
| Dashboard KPIs | Total machines, online count, scans today |
| Machine List | Grid dengan status |
| Machine Sync | Sync per mesin dan semua mesin |
| Sync Status | Progress dan hasil sync |
| Quality Display | Quality score, mapped/unmapped |

**Status:** ~80% implemented

### Phase 2: Core Features (Week 3-4)

**Fokus:** Attendance dan reporting

| Task | Deliverable |
|------|-------------|
| Daily Attendance | Filterable table |
| Monthly Summary | Summary per employee |
| Export Excel | Daily dan monthly export |
| Manual Correction | Correction form |
| Division Summary | Attendance per division |

**Status:** ~60% implemented

### Phase 3: Advanced (Week 5-6)

**Fokus:** UI untuk fitur yang sudah ada di backend

| Task | Deliverable |
|------|-------------|
| Mapping UI | Form untuk unmapped records |
| Monthly Matrix | Matrix visualization |
| Alert UI | Display alerts |
| Batch History | History page |

**Status:** Backend only

### Phase 4: Polish (Week 7-8)

**Fokus:** Enterprise readiness

| Task | Deliverable |
|------|-------------|
| RBAC | Full role enforcement |
| Audit Log | Comprehensive trail |
| PDF Export | Dashboard export |
| Scheduler Config | Cron-style scheduling |

**Status:** Partial

---

## 7. Acceptance Criteria

### 7.1 Dashboard

```
AC-DASH-001: Total Machines Display
GIVEN sistem berjalan
WHEN user membuka dashboard
THEN tampil total mesin aktif
AND sama dengan jumlah di database

AC-DASH-002: Online/Offline Count
GIVEN beberapa mesin online dan beberapa offline
WHEN dashboard load
THEN online count + offline count = total machines

AC-DASH-003: Quality Score
GIVEN ada records mapped dan unmapped
WHEN quality dihitung
THEN score = formula(BR-004)
AND display dengan warna sesuai status
```

### 7.2 Machine Sync

```
AC-SYNC-001: Single Machine Sync
GIVEN mesin accessible
WHEN IT Admin klik sync pada mesin
THEN raw logs tersimpan di attendance_scan_logs
AND batch record dibuat
AND status berubah sesuai hasil

AC-SYNC-002: Sync All
GIVEN 7 mesin accessible, 9 mesin tidak accessible
WHEN IT Admin klik sync all
THEN 7 mesin accessible di-sync
AND 9 mesin tidak accessible ditandai
AND proses tidak berhenti jika satu gagal
```

### 7.3 Daily Attendance

```
AC-ATT-001: Display by Date
GIVEN ada records untuk tanggal tertentu
WHEN user pilih tanggal
THEN semua attendance untuk tanggal itu tampil
AND pagination berfungsi

AC-ATT-002: Division Filter
GIVEN ada records untuk beberapa divisi
WHEN user filter divisi ARA
THEN hanya records divisi ARA yang tampil
```

### 7.4 Quality Display

```
AC-QUAL-001: Score Calculation
GIVEN ada sample data
WHEN quality score dihitung
THEN menggunakan formula BR-004
AND hasil konsisten

AC-QUAL-002: Status Color
GIVEN quality score 95
WHEN score ditampilkan
THEN berwarna hijau (sehat)
```

---

## 8. Appendices

### A. Data Dictionary

| Term | Definition | Example |
|------|------------|---------|
| loc_code | Single letter representing division location | A, B, C, D, E, F, G, H, J, L |
| scanner_code | Machine identifier used in emp_code conversion | 100, 200, 300, ... |
| emp_code | Employee identifier: letter + 4 digits or 7 digits | A0001, 0010001 |
| jam_masuk | Check-in time (HH:MM:SS) | 07:30:00 |
| jam_keluar | Check-out time (HH:MM:SS) | 17:00:00 |
| mapping_status | Status of device user ID mapping | MAPPED, UNMAPPED, NEED_REVIEW |
| batch_status | Status of sync batch | RUNNING, COMPLETED, FAILED, STUCK |

### B. Error Codes

| Code | Category | Message | Recovery |
|------|----------|---------|----------|
| MCH_001 | Machine | Machine not found | Check machine_code |
| MCH_002 | Machine | Device unreachable | Check network/port |
| SYC_001 | Sync | Import batch failed | Retry or check logs |
| EMP_001 | Employee | Code not found | Verify format |

### C. Machine Configuration

| Code | IP | Port | LocCode | Source | Status |
|------|-----|------|---------|--------|--------|
| PGE | 223.25.98.220 | 4370 | A | DIRECT | Accessible |
| MILL | 103.127.66.32 | 4370 | A | DIRECT | Accessible |
| IJL | 103.144.211.226 | 4370 | L | DIRECT | Accessible |
| AB2 | 103.144.208.154 | 4400 | H | DIRECT | Accessible |
| ARE | 103.144.208.154 | 4700 | E | DIRECT | Accessible |
| DME_01 | 103.144.228.42 | 4700 | E | DIRECT | Blocked |
| DME_02 | 103.144.228.42 | 4701 | E | DIRECT | Blocked |
| ARA | 103.144.208.154 | 4800 | F | DIRECT | Blocked |
| AB1 | 103.144.208.154 | 4900 | G | DIRECT | Blocked |
| ARC_01 | 103.144.208.154 | 4200 | J | DIRECT | Blocked |
| ARC_02 | 103.144.208.154 | 4201 | J | DIRECT | Blocked |
| P1A | 10.0.0.90 | 4100 | A | API_ONLY | Unreachable |
| P1B | 10.0.0.91 | 4300 | B | API_ONLY | Unreachable |
| P2A_01 | 10.0.0.92 | 4500 | C | API_ONLY | Unreachable |
| P2B | 10.0.0.93 | 4600 | D | API_ONLY | Unreachable |
| P2A_02 | 10.0.0.94 | 4501 | C | API_ONLY | Unreachable |

### D. Employee Code Format Reference

| Source | Format | Example | Count |
|--------|--------|---------|-------|
| IT Solution API | 7 digits | "0010001" | ~4,182 employees |
| ZKTeco Machine | Letter + 4 digits | "A0044" | device user IDs |
| Raw Device ID | Numeric | "10044" | needs parsing |

**Critical Issue:** Format mismatch adalah root cause utama unmapped records!

---

## Quick Links

- [API Reference](context-share/03-api-reference.md)
- [Database Schema](context-share/04-database-schema.md)
- [Machine Configuration](context-share/02-machine-configuration.md)
- [Commands Reference](context-share/06-commands.md)

---

**Document Owner:** Development Team
**Last Updated:** 2026-06-20
