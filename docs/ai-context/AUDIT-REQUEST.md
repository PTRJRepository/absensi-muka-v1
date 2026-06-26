# REQUEST DOCUMENT UNTUK AGENT
## Audit dan Perbaikan Sistem Absensi ZKTeco PT Rebinmas Jaya

**Document Version:** 1.0  
**Date:** 2026-06-21  
**Project:** Sistem Absensi PT Rebinmas Jaya  
**Status:** ACTIVE AUDIT REQUEST

---

## 1. Tujuan Utama

Agent melakukan **audit dan perbaikan** fitur sistem absensi secara menyeluruh, khususnya pada bagian:

1. Backend API dan service layer
2. Mapping employee dari ZKTeco ke database
3. Data sync dari mesin ZKTeco ke database
4. Pembacaan data user dan attendance dari mesin ZKTeco
5. Attendance matrix harian dan bulanan
6. Cross-location / cross-division scan
7. Batch import yang stuck, gagal, atau tidak konsisten
8. Data quality, unmapped records, duplicate scan, dan invalid mapping
9. Endpoint yang sudah ada tetapi belum sesuai dengan data aktual
10. Perbedaan antara data mesin, raw logs, processed attendance, dan tampilan frontend

> **PRINSIP UTAMA:** Agent TIDAK boleh langsung mengubah kode tanpa audit awal. Agent harus memberikan diagnosis berbasis file, query, log, dan hasil test.

---

## 2. Pertanyaan Kritis yang Harus Dijawab Agent

### A. Source of Truth Data

Tolong pastikan **sumber data absensi yang benar**:

| # | Pertanyaan | Jawaban yang Diharapkan |
|---|-----------|------------------------|
| 1 | Apakah sistem hanya memakai Direct ZKTeco? | Ya/Tidak + Evidence |
| 2 | Apakah IT Solution API masih dipakai? | Ya/Tidak + Evidence |
| 3 | Jika IT Solution API tidak dipakai, file/service apa saja yang harus dinonaktifkan? | Daftar file |
| 4 | Jika IT Solution API masih dipakai, endpoint, API key (sensor), response sample? | Detail lengkap |
| 5 | Tabel mana yang menjadi **sumber final** untuk attendance? | Tabel + Flow diagram |

**Tabel yang harus dianalisis:**
- `attendance_scan_logs`
- `attendance_imports`
- `attendance_raw_log`
- `attendance_daily_process`
- `vw_attendance_final`
- `vw_attendance_monitoring_daily`

**Output:**
- [ ] Daftar source aktif
- [ ] Daftar source deprecated
- [ ] Diagram data flow aktual dari mesin sampai frontend
- [ ] Rekomendasi source of truth final

---

### B. Database Aktif dan Schema Aktif

Tolong identifikasi **database yang benar-benar dipakai** aplikasi saat ini:

| # | Pertanyaan | Jawaban yang Diharapkan |
|---|-----------|------------------------|
| 1 | Apakah backend memakai direct MSSQL atau HTTP SQL Gateway? | Direct MSSQL / HTTP Gateway |
| 2 | Database aktif apa yang dipakai? | Database name |
| 3 | Apakah aplikasi memakai schema lama atau schema refactor? | Schema version |
| 4 | Tabel mana yang benar-benar ada di database? | Daftar + Row count |
| 5 | Apakah ada tabel duplikat dengan fungsi sama? | Daftar + Comparison |
| 6 | Apakah migration sudah sinkron dengan kode backend? | Status |

**Minimal query yang harus dijalankan:**

```sql
-- Daftar tabel
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- Daftar view
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.VIEWS
ORDER BY TABLE_NAME;

-- Row count utama
SELECT COUNT(*) AS total FROM attendance_scan_logs;
SELECT COUNT(*) AS total FROM attendance_imports;
SELECT COUNT(*) AS total FROM attendance_import_batches;
SELECT COUNT(*) AS total FROM employees;
SELECT COUNT(*) AS total FROM divisions;
SELECT COUNT(*) AS total FROM attendance_machines;
```

**Output:**
- [ ] Hasil query daftar tabel
- [ ] Hasil query daftar view
- [ ] Hasil query jumlah row per tabel utama
- [ ] Mapping antara file backend dan tabel yang dipakai

---

### C. Audit ZKTeco Reading

Tolong audit **pembacaan mesin ZKTeco**:

| # | Pertanyaan | Jawaban yang Diharapkan |
|---|-----------|------------------------|
| 1 | Mesin mana yang bisa terkoneksi saat ini? | Daftar + Status |
| 2 | Mesin mana yang timeout, port blocked, auth failed, atau unreachable? | Daftar + Error type |
| 3 | Apakah `getUsers()` berhasil? | Ya/Tidak per mesin |
| 4 | Apakah `getAttendances()` berhasil? | Ya/Tidak per mesin |
| 5 | Apakah field dari library sama dengan field yang dipakai kode? | Comparison |
| 6 | Apakah timestamp dari mesin sudah benar timezone-nya? | Timezone analysis |
| 7 | Apakah mesin perlu `disableDevice()` dan `enableDevice()` saat sync? | Best practice |
| 8 | Apakah ada risiko device tidak di-enable kembali saat error? | Risk assessment |

**Format output:**

```json
{
  "machineCode": "P1A",
  "ip": "10.0.0.90",
  "port": 4100,
  "connectionStatus": "SUCCESS|FAILED|TIMEOUT",
  "usersCount": 792,
  "attendanceCount": 2739,
  "sampleUser": {},
  "sampleAttendance": {},
  "error": null
}
```

**Output:**
- [ ] Hasil test semua mesin
- [ ] Sample raw users dari setiap mesin
- [ ] Sample raw attendance dari setiap mesin
- [ ] Error log per mesin
- [ ] Rekomendasi handling timeout, retry, dan finally block

---

### D. Audit Mapping Employee

Tolong audit **mapping** dari `raw_device_user_id` / `deviceUserId` menjadi `emp_code`.

| # | Pertanyaan | Jawaban yang Diharapkan |
|---|-----------|------------------------|
| 1 | Mapping rule mana yang aktif di kode? | File + Line |
| 2 | Apakah mapping masih hardcoded? | Ya/Tidak |
| 3 | Apakah mapping sudah database-driven? | Ya/Tidak |
| 4 | Apakah ada dua implementasi mapping yang berbeda? | Daftar file |
| 5 | Bagaimana kode menangani `10044` → `A0044`? | Code trace |
| 6 | Bagaimana kode menangani `30232` → `B0232`? | Code trace |
| 7 | Bagaimana kode menangani `50001` → `C0001`? | Code trace |
| 8 | Bagaimana kode menangani kode 7 digit seperti `0010001`? | Code trace |
| 9 | Apakah mapping cocok dengan employee master? | Comparison result |
| 10 | Apa penyebab terbesar unmapped records? | Root cause |
| 11 | Apakah unmapped records disimpan atau dibuang? | Evidence |

**Critical mapping cases yang harus diverifikasi:**

| Input | Expected Output | Potential Bug |
|-------|-----------------|---------------|
| `10044` | `A0044` | Bisa salah jadi `B0044`? |
| `30232` | `B0232` | Bisa salah jadi `A0232`? |
| `50001` | `C0001` | Bisa salah jadi `A0001`/`B0001`? |
| `L0015` | `L0015` | Apakah tetap atau berubah? |
| `0010001` | ??? | Bagaimana 7-digit diparse? |

**Minimal query:**

```sql
-- Unmapped records terbaru
SELECT TOP 100
  machine_code,
  raw_device_user_id,
  parsed_employee_code,
  mapping_status,
  scan_time
FROM attendance_scan_logs
WHERE mapping_status = 'UNMAPPED'
ORDER BY scan_time DESC;

-- Prefix distribution per mesin
SELECT
  machine_code,
  LEFT(parsed_employee_code, 1) AS prefix,
  COUNT(*) AS total
FROM attendance_scan_logs
WHERE parsed_employee_code IS NOT NULL
GROUP BY machine_code, LEFT(parsed_employee_code, 1)
ORDER BY machine_code, total DESC;
```

**Output:**
- [ ] Tabel mapping rule aktual
- [ ] Daftar file yang mengandung mapping logic
- [ ] Daftar unmapped records terbaru
- [ ] Daftar employee yang sama tetapi muncul dengan kode berbeda

---

### E. Audit Sync ke Database

Tolong audit **proses sync** dari mesin ke database:

| # | Pertanyaan | Jawaban yang Diharapkan |
|---|-----------|------------------------|
| 1 | File service mana yang menjalankan sync utama? | File path |
| 2 | Apakah sync memakai direct-zkteco-import, sync-orchestrator, atau script? | File trace |
| 3 | Apakah raw logs selalu disimpan sebelum diproses? | Ya/Tidak |
| 4 | Apakah data duplicate dicegah dengan unique constraint? | Constraint check |
| 5 | Apakah batch selalu ditutup menjadi COMPLETED/FAILED/PARTIAL_SUCCESS? | Status analysis |
| 6 | Apakah ada batch yang stuck RUNNING? | Query result |
| 7 | Apakah error per mesin tercatat? | Log table |
| 8 | Apakah sync all tetap lanjut jika satu mesin gagal? | Error handling |
| 9 | Apakah sync hanya mengambil data baru atau seluruh data? | Mode analysis |
| 10 | Apakah ada race condition saat scheduler dan manual sync berjalan bersamaan? | Risk assessment |

**Minimal query:**

```sql
-- Batch terakhir
SELECT TOP 50 *
FROM attendance_import_batches
ORDER BY started_at DESC;

-- Batch stuck
SELECT *
FROM attendance_import_batches
WHERE status = 'RUNNING'
ORDER BY started_at DESC;

-- Summary per mesin
SELECT
  machine_code,
  COUNT(*) AS total_scan,
  MIN(scan_time) AS first_scan,
  MAX(scan_time) AS last_scan
FROM attendance_scan_logs
GROUP BY machine_code
ORDER BY machine_code;
```

**Output:**
- [ ] Flow sync aktual (diagram)
- [ ] Daftar file sync aktif
- [ ] Daftar batch terakhir
- [ ] Daftar batch stuck
- [ ] Penyebab sync tidak masuk database

---

### F. Audit Attendance Processing

Tolong audit **pemrosesan attendance** harian:

| # | Pertanyaan | Jawaban yang Diharapkan |
|---|-----------|------------------------|
| 1 | Dari raw scan, bagaimana sistem menentukan jam masuk? | Logic trace |
| 2 | Dari raw scan, bagaimana sistem menentukan jam keluar? | Logic trace |
| 3 | Apakah first scan = check-in dan last scan = check-out? | Verification |
| 4 | Bagaimana jika hanya ada satu scan? | Logic trace |
| 5 | Bagaimana jika scan lintas hari? | Logic trace |
| 6 | Bagaimana jika shift malam? | Logic trace |
| 7 | Bagaimana jika employee scan di dua mesin? | Logic trace |
| 8 | Bagaimana cuti, sakit, libur, dan no data ditentukan? | Logic trace |
| 9 | Apakah manual correction menimpa data mesin? | Behavior |
| 10 | Apakah processed attendance dibuat ulang setelah raw sync? | Process trace |

**Output:**
- [ ] Flow raw log ke processed attendance
- [ ] Rule status attendance aktual
- [ ] Daftar gap rule yang belum ada
- [ ] Sample 10 employee dari raw log sampai final attendance

---

### G. Audit Cross-Location / Cross-Division

Tolong audit **masalah cross-location**, terutama P1A dan P1B:

| # | Pertanyaan | Jawaban yang Diharapkan |
|---|-----------|------------------------|
| 1 | Apakah benar P1A dan P1B memiliki user enrollment yang sama? | Query result |
| 2 | Apakah P1B berisi employee prefix C / P2A? | Query result |
| 3 | Apakah employee yang sama muncul sebagai kode berbeda di mesin berbeda? | Comparison |
| 4 | Apakah sistem mendeteksi cross-division scan? | Detection status |
| 5 | Apakah cross-location scan memengaruhi attendance final? | Impact analysis |
| 6 | Apakah masalah harus diselesaikan di kode, database mapping, atau mesin ZKTeco? | Recommendation |

**Critical query:**

```sql
-- Prefix distribution per mesin
SELECT
  machine_code,
  LEFT(parsed_employee_code, 1) AS prefix,
  COUNT(*) AS total
FROM attendance_scan_logs
WHERE parsed_employee_code IS NOT NULL
GROUP BY machine_code, LEFT(parsed_employee_code, 1)
ORDER BY machine_code, total DESC;

-- Cross-location di P1B
SELECT DISTINCT
  machine_code,
  raw_device_user_id,
  parsed_employee_code,
  scan_time
FROM attendance_scan_logs
WHERE machine_code = 'P1B'
  AND LEFT(parsed_employee_code, 1) <> 'B'
ORDER BY scan_time DESC;
```

**Output:**
- [ ] Report cross-location per mesin
- [ ] Daftar employee bermasalah
- [ ] Expected prefix per mesin
- [ ] Actual prefix per mesin
- [ ] Rekomendasi tindakan

---

### H. Audit API Backend

Tolong audit **semua endpoint** backend yang dipakai frontend:

| # | Endpoint | Jawaban yang Diharapkan |
|---|----------|------------------------|
| 1 | `GET /api/monitoring/dashboard` | Status + Response |
| 2 | `GET /api/monitoring/machines` | Status + Response |
| 3 | `GET /api/machines/real-time-status` | Status + Response |
| 4 | `GET /api/attendance/daily?date=YYYY-MM-DD` | Status + Response |
| 5 | `GET /api/attendance/monthly?year=YYYY&month=M` | Status + Response |
| 6 | `GET /api/monitoring/quality` | Status + Response |
| 7 | `GET /api/monitoring/batches?status=RUNNING` | Status + Response |
| 8 | `GET /api/divisions` | Status + Response |

**Endpoint tambahan yang harus dicek:**

```bash
# Attendance matrix
curl "http://localhost:8004/api/attendance/monthly-matrix?year=2026&month=6"

# Cross-location
curl "http://localhost:8004/api/monitoring/cross-location"
curl "http://localhost:8004/api/monitoring/cross-location/P1B"

# Employee detail
curl "http://localhost:8004/api/attendance/employee/A0044?startDate=2026-06-01&endDate=2026-06-21"
```

**Output:**
- [ ] Status HTTP setiap endpoint
- [ ] Response sample
- [ ] Tabel/query yang dipakai endpoint
- [ ] Bug per endpoint
- [ ] Rekomendasi prioritas fix

---

### I. Audit Frontend dan Matrix

Tolong audit **bagian frontend** yang menampilkan attendance:

| # | Pertanyaan | Jawaban yang Diharapkan |
|---|-----------|------------------------|
| 1 | Attendance page mengambil endpoint yang mana? | Endpoint + Component |
| 2 | Matrix page mengambil endpoint yang mana? | Endpoint + Component |
| 3 | Apakah field response backend sesuai dengan TypeScript type frontend? | Type check |
| 4 | Apakah employee detail modal error? | Error trace |
| 5 | Apakah filter division, search, status, date bekerja? | Functionality check |
| 6 | Apakah matrix membaca data final atau raw? | Source verification |
| 7 | Apakah source compiled dan source code match? | Diff result |

**Frontend components yang harus dicek:**

```typescript
// Attendance components
frontend/src/components/features/attendance/
├── AttendancePage.tsx      // Daily attendance
├── AttendanceMatrix.tsx    // Monthly matrix
└── AttendanceDetail.tsx    // Employee detail modal

// Related components
frontend/src/components/features/monitoring/
frontend/src/components/features/realtime/
```

**Output:**
- [ ] Daftar komponen frontend terkait absensi
- [ ] Endpoint yang dipanggil setiap komponen
- [ ] Error console browser
- [ ] Patch yang diperlukan

---

## 3. Format Laporan yang Diminta dari Agent

Agent **HARUS** mengembalikan laporan dengan format berikut:

```md
# Audit Report Sistem Absensi

## 1. Executive Summary
- Kesimpulan utama:
- Root cause utama:
- Risiko terbesar:
- Prioritas perbaikan:

## 2. Source of Truth
- Source aktif:
- Source deprecated:
- Database aktif:
- Tabel final attendance:

## 3. Bug List
| Priority | Area | Bug | Evidence | File | Recommended Fix |
|---|---|---|---|---|---|

## 4. Mapping Audit
| Machine | Expected Prefix | Actual Prefixes | Issue | Fix |
|---|---|---|---|---|

## 5. Sync Audit
| Machine | Connection | Users | Logs | Inserted | Duplicate | Error |
|---|---|---|---|---|---|---|

## 6. API Audit
| Endpoint | Status | Response Valid | Issue | Fix |
|---|---|---|---|---|

## 7. Database Audit
| Table/View | Exists | Row Count | Used By | Issue |
|---|---|---|---|---|

## 8. Recommended Fix Plan

### P0 (Critical - Fix Immediately)
- Fix source of truth
- Fix database connection inconsistency
- Fix mapping layer
- Fix sync raw log storage
- Fix batch stuck handling

### P1 (High - Fix Soon)
- Fix attendance processing
- Fix cross-location detection
- Fix frontend matrix response mismatch

### P2 (Medium - Fix When Time)
- Improve anomaly detection
- Improve alert system
- Improve export functionality
- UI polish

## 9. Patch Plan
- Files to edit:
- Files to delete/deprecate:
- Migrations needed:
- Test commands:
- Rollback plan:

## 10. Acceptance Test
- Test case:
- Expected result:
- Actual result after fix:
```

---

## 4. Larangan untuk Agent

Agent **TIDAK boleh:**

| # | Larangan | Alasan |
|---|----------|--------|
| 1 | Mengubah banyak file tanpa menjelaskan root cause | Ganggu traceability |
| 2 | Menghapus data raw absensi | Data loss risk |
| 3 | Menghapus tabel tanpa backup | Schema integrity |
| 4 | Mengubah mapping tanpa evidence dari data mesin dan employee master | Mapping corruption |
| 5 | Menganggap IT Solution API aktif sebelum dibuktikan | Wrong assumption |
| 6 | Menganggap semua employee code bisa dikonversi hanya dengan last 4 digit | Not always true |
| 7 | Mengabaikan cross-location scan | Data quality issue |
| 8 | Menyelesaikan bug frontend sebelum memastikan backend response benar | Wasted effort |
| 9 | Menyimpan credential asli di laporan | Security risk |
| 10 | Membuat asumsi tanpa query, log, atau sample data | Unverified claim |

---

## 5. Prioritas Perbaikan yang Diminta

**Urutan kerja yang diminta:**

```
1. Pastikan source of truth data
2. Pastikan database aktif dan schema aktif
3. Audit koneksi dan pembacaan ZKTeco
4. Fix raw sync agar semua data masuk database
5. Fix unmapped agar tidak dibuang diam-diam
6. Buat mapping layer tunggal dan konsisten
7. Fix attendance processing dari raw ke final
8. Fix cross-location / cross-division detection
9. Fix API response agar sesuai frontend
10. Fix frontend matrix dan attendance display
11. Tambahkan test dan query validasi
```

---

## 6. Data yang Harus Agent Minta Jika Belum Ada

Jika agent belum punya akses, minta:

| # | Data yang Dibutuhkan | Format |
|---|---------------------|--------|
| 1 | Isi `.env` yang sudah disensor | .env sample |
| 2 | Struktur folder terbaru | Tree output |
| 3 | Daftar branch Git aktif | `git branch -a` |
| 4 | Hasil `npm run build` | Build log |
| 5 | Hasil `npm run dev` | Dev log |
| 6 | Hasil `npm run db:check` | DB status |
| 7 | Hasil `npm run sync:machines` | Sync log |
| 8 | Log backend saat sync | Log file |
| 9 | Screenshot error frontend | PNG/JPG |
| 10 | Sample raw ZKTeco user dan attendance | JSON |
| 11 | Dump schema database | SQL script |
| 12 | Sample 20 row dari tabel utama | CSV/JSON |
| 13 | Daftar mesin yang bisa diakses dari jaringan | Network scan |
| 14 | Konfirmasi: IT Solution API dipakai atau tidak | Yes/No |

---

## 7. Output Akhir yang Diharapkan dari Agent

Agent harus menghasilkan:

| # | Output | Status |
|---|--------|--------|
| 1 | [ ] Audit report lengkap | TODO |
| 2 | [ ] Root cause list | TODO |
| 3 | [ ] Patch plan | TODO |
| 4 | [ ] File yang perlu diubah | TODO |
| 5 | [ ] SQL migration jika diperlukan | TODO |
| 6 | [ ] Query validasi | TODO |
| 7 | [ ] Test command | TODO |
| 8 | [ ] Acceptance checklist | TODO |
| 9 | [ ] Risiko dan rollback plan | TODO |
| 10 | [ ] Rekomendasi urutan implementasi | TODO |

---

## 8. Quick Reference Links

Dokumentasi terkait yang sudah ada:

| File | Description |
|------|-------------|
| `docs/BUGS-FIXES.md` | Known issues list (18+ critical issues) |
| `docs/CROSS-LOCATION-AUDIT.md` | Cross-location problem analysis |
| `docs/ATTENDANCE-BEHAVIOR-AUDIT.md` | Anomaly detection gaps |
| `docs/API.md` | Complete API reference |
| `sql/attendance-behavior-audit.sql` | Audit queries |
| `sql/audit-cross-location.sql` | Cross-location queries |
| `src/api/routes/cross-location.routes.ts` | New cross-location API |

---

## 9. Checklist Sebelum Mulai Audit

- [ ] Baca CLAUDE.md untuk context project
- [ ] Baca BUGS-FIXES.md untuk known issues
- [ ] Baca ATTENDANCE-BEHAVIOR-AUDIT.md untuk gap analysis
- [ ] Identifikasi environment (production/development)
- [ ] Dapatkan database access credentials
- [ ] Dapatkan ZKTeco machine credentials
- [ ] Set up testing environment
- [ ] Backup database sebelum any changes

---

## 10. Escalation Path

Jika agent menemukan issues yang tidak bisa diselesaikan sendiri:

1. **Technical Blocker** → Document clearly with evidence, escalate to human
2. **Security Issue** → Document and escalate immediately
3. **Data Loss Risk** → STOP, document, escalate
4. **Unknown System** → Document assumption, request verification

---

**END OF AUDIT REQUEST DOCUMENT**
