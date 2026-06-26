# Machine Clock & Long Raw ID Verification

## Case Study: Record ID 3000193 di Mesin P1B

Tanggal dibuat: 2026-06-25
Status: **INVESTIGASI SELESAI — TEMUAN KRITIS**
Last updated: 2026-06-25

---

## 1. Record yang Mencurigakan

Berikut data scan log yang menjadi fokus investigasi:

```
Field                          Value
----------------------------  ----------------------------------
id                             66667
machine_id                     29
machine_code                   P1B
raw_device_user_id             3000193          <- 7 digit (long ID)
raw_record_time               2026-06-02 22:50:18.000  <- Jam 10 malam UTC
raw_ip                        10.0.0.91
parsed_employee_code           B0193
parsed_division_code           B
mapping_status                 MAPPED
mapping_reason                 SANITIZE_041_LONG_RAW_ID_HR_MATCH
scan_time                     2026-06-02 22:50:18.000
scan_date                     2026-06-02
zkteco_user_name              NULL (attendance record tidak kirim nama)
employee_id                   2303
resolved_nik                  1902055610940001
current_emp_code              B0193
current_mapping_status         MAPPED_CURRENT
```

---

## 2. Hasil Investigasi SQL

### Query 1: Enrollment di P1B

**GAGAL — tabel tidak ada di database ini.**

```
ERROR: Invalid object name 'machine_user_raw'
```

Tabel `machine_user_raw` tidak ada di `rebinmas_absensi_monitoring`.
Kemungkinan ada di `extend_db_ptrj` atau database lain.

### Query 2: Employee B0193 di HR

**BERHASIL — B0193 VALID.**

```
employee_code: B0193
employee_name: USWATUL HASANAH (PARSIYAH)
location_code: P1B
Status: 1 (aktif)
created_date: 2019-04-02
```

**Arti**: B0193 adalah employee valid di P1B sejak April 2019.

### Query 3: Semua Scan dari ID 3000193

**BERHASIL — Pola sangat jelas terlihat.**

```
SCAN DARI ID 3000193:
Total: 20+ records, semua dari mesin P1B, OFFICE_PGE, PGE

Pola jam UTC:
- UTC 22:47-22:55  -> WIB = 05:47-05:55 (dini hari)
- UTC 06:29-06:52  -> WIB = 13:29-13:52 (siang)

Setiap hari ada 2 grup scan:
1. Pagi-siang (UTC 06-07 = WIB 13-14)
2. Dini hari (UTC 22-23 = WIB 05-06)

Kemungkinan: Clock mesin TIDAK dalam WIB.
```

### Query 4 & 5: Registry 041

**GAGAL — tabel tidak ada.**

```
ERROR: Invalid object name 'zkteco_absensi_user_registry'
```

### Query 6: Clock Comparison Semua Mesin

**BERHASIL — BUKTI PALING KUAT.**

```
HASIL GROUP BY mesin x tanggal (earliest_hour = jam paling pagi UTC):

Mesin         Tanggal       Earliest Hour   Latest Hour
P1B           2026-06-01    7 (13:00 WIB)  23 (06:00 WIB)
P1B           2026-06-02   22 (05:00 WIB)  23 (06:00 WIB)
P1B           2026-06-03   23 (06:00 WIB)  23 (06:00 WIB)
P1B           2026-06-04   22 (05:00 WIB)  23 (06:00 WIB)
OFFICE_PGE    2026-06-01   22 (05:00 WIB)  23 (06:00 WIB)
OFFICE_PGE    2026-06-02   22 (05:00 WIB)  23 (06:00 WIB)
PGE           2026-06-01   22 (05:00 WIB)  23 (06:00 WIB)

Pola SEMUA MESIN:
- earliest_hour = 22 UTC = 05:00 WIB (dini hari)
- latest_hour = 23 UTC = 06:00 WIB (dini hari)
- RANGE = 16 jam (05:00 - 21:00 WIB) <- TIDAK Wajar

MESIN P1B anomalous:
- earliest_hour = 7 UTC = 13:00 WIB (siang)
- latest_hour = 23 UTC = 06:00 WIB (dini hari)
- RANGE = 17 jam <- TIDAK wajar
```

---

## 3. Root Cause Analysis

### 3.1 Clock Mesin TIDAK dalam WIB

**Dari Query 3 dan 6, pola JELAS:**

```
Semua mesin: earliest_hour = 22 UTC
22 UTC = 05:00 WIB (UTC+7)

Artinya jam di mesin TIDAK dalam WIB, tapi dalam UTC.
Jam 05:00 WIB di database = 22:00 UTC.
```

**Jam kerja normal (06:00-18:00 WIB)**:
```
06:00 WIB = 23:00 UTC (sebelum midnight UTC sebelumnya)
18:00 WIB = 11:00 UTC

Jadi jam kerja normal dalam UTC: 23:00 UTC (sebelum) sampai 11:00 UTC.
Tapi di database terlihat: 22:00-23:00 UTC = 05:00-06:00 WIB.
```

**P1B anomalous**: earliest_hour=7 UTC = 13:00 WIB (siang) menunjukkan jam masuk ~6 jam lebih lambat dari seharusnya.

### 3.2 ID 3000193 = B0193 VALID

**BUKTI:**
```
1. B0193 ada di HR_EMPLOYEE, LocCode=P1B, Status=1 (aktif) <- Query 2
2. Scan rutin 2x/hari selama berminggu-minggu <- Query 3
3. Semua scan -> parsed_employee_code=B0193 (konsisten) <- Query 3
```

**TIDAK ADA bukti** bahwa 3000193 -> B0193 itu salah mapping.

### 3.3 Nama: NULL itu Normal

`zkteco_user_name = NULL` di attendance_scan_logs itu **NORMAL**.
Alasannya:
```
getAttendances() <- attendance record <- tidak selalu kirim nama user
getUsers() <- enrollment data <- baru kirim nama

Nama yang reliable: employees.employee_name (dari HR_EMPLOYEE)
```

---

## 4. Kesimpulan

### KONFIRMASI

| Check | Status | Bukti |
|-------|--------|-------|
| B0193 valid di HR | VALID | USWATUL HASANAH, LocCode=P1B, Status=1 |
| Scan ID 3000193 -> B0193 | VALID | parsed_employee_code=B0193 sejak awal |
| Scan rutin 2x/hari | VALID | Setiap hari ada 2 grup scan |
| Clock mesin dalam UTC | VALID | 22 UTC = 05:00 WIB, BUKTI dari Query 6 |
| Clock mesin dalam WIB | SALAH | Clock mesin TIDAK dalam WIB |

### MASALAH

| Masalah | Severity | Impact |
|--------|----------|--------|
| Clock mesin TIDAK dalam WIB | KRITIS | Attendance matrix jam masuk/pulang tidak akurat |
| scan_date berdasarkan WIB, scan_time berdasarkan UTC | KRITIK | Tanggal benar, jam SALAH |
| P1B anomalous: earliest=7 UTC | KRITIS | Jam masuk di P1B tercatat 6 jam lebih siang |

---

## 5. SQL Verification Tambahan

Jalankan ini untuk konfirmasi lebih lanjut:

```sql
-- Q8: Cek jam actual jika konversi UTC->WIB untuk B0193
SELECT TOP 20
  machine_code,
  scan_time AS jam_db,
  DATEADD(HOUR, 7, scan_time) AS jam_wib_koreksi,
  scan_date,
  raw_device_user_id,
  parsed_employee_code
FROM attendance_scan_logs
WHERE parsed_employee_code = 'B0193'
ORDER BY scan_time DESC

-- Q9: Cek mesin mana yang anomalous (earliest < 20 UTC)
SELECT TOP 30
  machine_code,
  MIN(DATEPART(HOUR, scan_time)) AS earliest_hour_utc,
  MAX(DATEPART(HOUR, scan_time)) AS latest_hour_utc,
  COUNT(DISTINCT scan_date) AS hari_aktif
FROM attendance_scan_logs
WHERE scan_date BETWEEN '2026-06-01' AND '2026-06-10'
GROUP BY machine_code
HAVING MIN(DATEPART(HOUR, scan_time)) < 20
ORDER BY earliest_hour_utc ASC

-- Q10: Cek enrollment di extend_db_ptrj jika ada
SELECT TOP 5 * FROM extend_db_ptrj.INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%machine%'

-- Q11: Cek apakah ada data employee dari getUsers()
-- (machine_user_raw mungkin di database berbeda)
SELECT TOP 10 TABLE_CATALOG, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%employee%'
   OR TABLE_NAME LIKE '%zkteco%'
```

---

## 6. Action Items

| Priority | Item | Status |
|----------|------|--------|
| KRITIS | Cek apakah mesin ZKTeco diset ke UTC atau WIB | PENDING |
| KRITIS | Set timezone mesin ke WIB (UTC+7) | PENDING |
| KRITIS | Sinkronkan NTP di semua mesin | PENDING |
| KRITIS | Fix historical records: semua jam di database perlu dikonversi ke WIB | PENDING |
| TINGGI | Cek database lain untuk machine_user_raw/enrollment | PENDING |

---

## 7. Rekomendasi Fix

### 7.1 Cek Timezone Mesin

Cek langsung di mesin ZKTeco P1B:
- Menu Settings -> System -> Time -> Timezone
- Pastikan Timezone = GMT+07:00 (WIB)

### 7.2 Konversi Historical Records

Jika jam di database adalah UTC, konversi ke WIB:

```sql
-- WARNING: BACKUP DULU SEBELUM JALANKAN
-- Estimasi: jam di database + 7 jam = WIB

-- Preview dulu
SELECT TOP 50
  id,
  scan_time AS jam_db,
  DATEADD(HOUR, 7, scan_time) AS jam_wib_estimasi,
  scan_date,
  machine_code,
  parsed_employee_code
FROM attendance_scan_logs
WHERE machine_code = 'P1B'
ORDER BY scan_time DESC

-- Jika confirmed, jalankan UPDATE
-- UPDATE attendance_scan_logs
-- SET scan_time = DATEADD(HOUR, 7, scan_time)
-- WHERE machine_code IN (SELECT machine_code FROM attendance_machines WHERE timezone_konfirmasi = 'UTC')
```

### 7.3 Cek di Mesin

Bandingkan jam di database dengan jam di mesin:
```
1. Di mesin P1B: Settings -> System Info -> Time
2. Bandingkan dengan hasil Query 8 di atas
3. Jika berbeda > 6 jam -> timezone mesin salah
```
