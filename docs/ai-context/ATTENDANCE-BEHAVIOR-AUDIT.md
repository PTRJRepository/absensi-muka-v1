# ATTENDANCE DATA BEHAVIOR AUDIT
## Analisis Pola & Deteksi Anomali Data Absensi

**Generated:** 2026-06-21  
**Project:** Sistem Absensi PT Rebinmas Jaya

---

## Ringkasan Eksekutif

| Kategori | Status | Detail |
|----------|--------|--------|
| **Check-in/Check-out Detection** | ✅ WORKING | First scan = jam_masuk, Last scan = jam_keluar |
| **Duplicate Detection** | ✅ WORKING | Deteksi scan duplikat |
| **Missing Check-out** | ✅ WORKING | Deteksi single scan |
| **Cross-division Detection** | ✅ WORKING | Via reconcile service |
| **Late Arrival Detection** | ❌ NOT IMPLEMENTED | Tidak ada threshold jam kerja |
| **Early Departure Detection** | ❌ NOT IMPLEMENTED | Tidak ada validasi jam pulang |
| **Overtime Calculation** | ⚠️ PARTIAL | Field ada tapi tidak dikalkulasi |
| **Night Shift Handling** | ❌ NOT IMPLEMENTED | Tidak ada penanganan shift malam |
| **Holiday Calendar** | ⚠️ PARTIAL | Tabel ada tapi tidak terintegrasi |

---

## 1. Pola Data Absensi Normal

### 1.1 Jam Kerja Standar

Berdasarkan analisis codebase:

```
Jam Masuk Normal: 07:00 - 08:00
Jam Pulang Normal: 17:00 - 18:00
Durasi Kerja Normal: 8 jam
```

**⚠️ ISSUE:** Tidak ada konfigurasi threshold jam kerja di sistem.

### 1.2 Status Absensi

| Status | Kondisi | Severity |
|--------|---------|----------|
| `HADIR` | ≥2 scan per hari | ✅ Normal |
| `TIDAK_HADIR` | <2 scan per hari | ⚠️ Absent |
| `NO_CHECKOUT` | Tepat 1 scan | ⚠️ Missing check-out |
| `INCOMPLETE_SCAN` | Scan tidak lengkap | ⚠️ Warning |
| `NO_CHECKIN` | Tidak ada scan | 🔴 Missing check-in |

### 1.3 Logika Check-in/Check-out

```typescript
// attendance-process-import.service.ts
MIN(s.scan_time) AS check_in_at,    // Scan pertama = jam masuk
MAX(s.scan_time) AS check_out_at   // Scan terakhir = jam pulang
```

**Catatan:** Sistem hanya mengambil scan MIN/MAX, tidak ada validasi urutan.

---

## 2. Anomali yang Dideteksi Sistem

### 2.1 Anomali Service (`anomaly.service.ts`)

| Tipe Anomali | Severity | Kondisi |
|-------------|----------|---------|
| `NO_CHECKIN` | HIGH | scan_count === 0 |
| `NO_CHECKOUT` | MEDIUM | attendance_status === 'NO_CHECKOUT' |
| `INCOMPLETE_SCAN` | MEDIUM | scan_count < 2 |
| `MULTIPLE_LOCATION_SAME_DAY` | LOW ⚠️ | machine_count > 2 |
| `CROSS_DIVISION_SCAN` | MEDIUM | reconcile_status === 'MISMATCH' |

### 2.2 Data Quality Service (`data-quality.service.ts`)

| Check | Threshold | Severity |
|-------|-----------|----------|
| UNMAPPED_EMPLOYEES | >100 | CRITICAL |
| UNMAPPED_EMPLOYEES | >10 | HIGH |
| DUPLICATE_SCANS | >1000 | HIGH |
| DUPLICATE_SCANS | >100 | MEDIUM |
| MACHINE_TIME_DRIFT | Any | MEDIUM |
| UNPROCESSED_LOGS | >10000 | HIGH |
| UNPROCESSED_LOGS | >1000 | MEDIUM |

---

## 3. ⚠️ ANOMALI YANG TIDAK DIDETEKSI (GAP)

### 3.1 Entry Time Anomalies ❌ NOT IMPLEMENTED

```
❌ Very Early Check-in (< 05:00)
❌ Late Arrival (> 08:00 default)
❌ Very Late Check-in (> 12:00 - suspicious)
❌ Very Early Check-out (< 14:00)
❌ Very Late Check-out (> 22:00)
```

### 3.2 Work Hours Anomalies ❌ NOT IMPLEMENTED

```
❌ Short Work Day (< 4 jam)
❌ Long Work Day (> 12 jam)
❌ No break detection
```

### 3.3 Multi-Location Anomalies ⚠️ TOO LENIENT

```
⚠️ Current: machine_count > 2 (3+ mesin = flag)
❌ Should be: machine_count >= 2 (2+ mesin = flag)
```

### 3.4 Pattern Anomalies ❌ NOT IMPLEMENTED

```
❌ Impossible Travel Detection
   (Employee scans at machine A at 08:00, then machine B at 08:15 - impossible if 15 min travel time)

❌ Buddy Punching Detection
   (Same timestamp, different machine)

❌ Unusual Weekend Attendance
   (Saturday/Sunday without holiday status)
```

### 3.5 Night Shift Issues ❌ NOT IMPLEMENTED

```
❌ Cross-day handling
   (Check-in 22:00, Check-out 06:00 next day)

❌ Late night scan validation
   (Scan after 23:00 - might be error)
```

---

## 4. Sample Anomali yang Perlu Diinvestigasi

### 4.1 Anomali Waktu Masuk

```sql
-- Check-in sangat pagi (< 05:00)
SELECT * FROM attendance_scan_logs
WHERE DATEPART(HOUR, scan_time) < 5
  AND scan_date >= DATEADD(day, -7, GETDATE());

-- Check-in sangat siang (> 12:00)
SELECT * FROM attendance_scan_logs
WHERE DATEPART(HOUR, scan_time) > 12
  AND scan_date >= DATEADD(day, -7, GETDATE());
```

### 4.2 Anomali Jumlah Scan

```sql
-- Single scan (missing check-out)
SELECT employee_code, COUNT(*) as scan_count, scan_date
FROM attendance_imports
WHERE scan_count = 1
  AND attendance_date >= DATEADD(day, -7, GETDATE())
GROUP BY employee_code, scan_date;

-- Excessive scans (> 10 per hari)
SELECT employee_code, scan_date, COUNT(*) as scan_count
FROM attendance_scan_logs
WHERE scan_date >= DATEADD(day, -7, GETDATE())
GROUP BY employee_code, scan_date
HAVING COUNT(*) > 10;
```

### 4.3 Anomali Multi-Lokasi

```sql
-- Scan di >1 mesin per hari
SELECT employee_code, scan_date, COUNT(DISTINCT machine_code) as machine_count
FROM attendance_scan_logs
WHERE scan_date >= DATEADD(day, -7, GETDATE())
GROUP BY employee_code, scan_date
HAVING COUNT(DISTINCT machine_code) > 1;
```

### 4.4 Anomali Weekend

```sql
-- Weekend attendance (Sabtu/Minggu)
SELECT *
FROM attendance_imports
WHERE DATEPART(WEEKDAY, attendance_date) IN (1, 7)  -- Sunday=1, Saturday=7
  AND is_holiday = 0
  AND attendance_date >= DATEADD(day, -30, GETDATE());
```

---

## 5. Rekomendasi Implementasi

### Priority 1: Entry Time Validation

```typescript
// Tambah ke anomaly.service.ts
const WORK_START_HOUR = 7;   // 07:00
const WORK_END_HOUR = 18;    // 18:00
const LATE_THRESHOLD = 60;    // 1 hour grace

// Detect: Early arrival (< 05:00)
if (hour < 5) {
  anomalies.push({ type: 'EARLY_CHECKIN', severity: 'MEDIUM' });
}

// Detect: Late arrival (> 08:00)
if (hour > 8) {
  anomalies.push({ type: 'LATE_ARRIVAL', severity: 'LOW' });
}

// Detect: Very late (> 12:00)
if (hour > 12) {
  anomalies.push({ type: 'VERY_LATE_CHECKIN', severity: 'HIGH' });
}
```

### Priority 2: Multi-Location Threshold Fix

```typescript
// Ubah dari > 2 ke >= 2
if (process.machine_count >= 2) {  // Instead of > 2
  anomalies.push({
    anomaly_type: 'MULTIPLE_LOCATION_SAME_DAY',
    severity: 'MEDIUM'  // Upgrade from LOW
  });
}
```

### Priority 3: Impossible Travel Detection

```typescript
// Check time between scans at different locations
const machineDistances: Record<string, number> = {
  'P1A-P1B': 5,  // 5 minutes by car
  'P1A-P2A': 15, // 15 minutes
  // ...
};

function validateTravelTime(scans: Scan[]) {
  for (let i = 1; i < scans.length; i++) {
    const prev = scans[i-1];
    const curr = scans[i];
    if (prev.machine_code !== curr.machine_code) {
      const timeDiff = (curr.scan_time - prev.scan_time) / 60000; // minutes
      const minTravel = machineDistances[`${prev.machine_code}-${curr.machine_code}`];
      if (minTravel && timeDiff < minTravel) {
        anomalies.push({
          type: 'IMPOSSIBLE_TRAVEL',
          details: `${prev.machine_code} -> ${curr.machine_code} in ${timeDiff} min`
        });
      }
    }
  }
}
```

---

## 6. SQL Audit Queries

Lihat file: `sql/attendance-behavior-audit.sql`

---

## 7. Action Items

| Priority | Item | Status |
|----------|------|--------|
| HIGH | Implementasi late arrival detection | TODO |
| HIGH | Fix multi-location threshold (>2 -> >=2) | TODO |
| HIGH | Investigasi cross-division mixing | IN PROGRESS |
| MEDIUM | Implementasi travel time validation | TODO |
| MEDIUM | Tambah holiday calendar integration | TODO |
| LOW | Implementasi night shift handling | TODO |

---

## Key Files

- `src/modules/monitoring/anomaly.service.ts` - Anomaly detection
- `src/modules/monitoring/data-quality.service.ts` - Data quality
- `src/modules/attendance/attendance-process-import.service.ts` - Processing logic
- `sql/attendance-behavior-audit.sql` - Audit queries
