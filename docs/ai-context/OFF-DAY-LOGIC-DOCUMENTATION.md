# Dokumentasi: Logika Penentuan Off Day dalam Matriks Absensi

**Versi**: 1.0
**Tanggal**: 2026-06-22
**Kategori**: Attendance System Logic

---

## 1. Overview

Sistem absensi PT Rebinmas Jaya menggunakan **tiga sumber data utama** untuk menentukan apakah suatu hari adalah **Off Day** atau bukan:

| Sumber | Tabel | Prioritas |
|--------|-------|-----------|
| Konfigurasi Work Day | `attendance_work_config` | Penentu jadwal kerja default |
| Kalender Libur | `attendance_holiday` | Hari libur nasional/tanggal penting |
| Raw Scan Logs | `attendance_scan_logs` | Data aktual dari mesin ZKTeco |

---

## 2. Konfigurasi Work Day (`attendance_work_config`)

### Struktur Tabel

```sql
CREATE TABLE attendance_work_config (
    config_id INT IDENTITY(1,1) PRIMARY KEY,
    day_of_week INT NOT NULL,      -- 0=Sunday, 1=Monday, ..., 6=Saturday
    standard_hours DECIMAL(4,2),
    description NVARCHAR(100),
    is_active BIT DEFAULT 1
);
```

### Konfigurasi Default (Seed Data)

| day_of_week | Hari | standard_hours | is_workday |
|-------------|------|----------------|------------|
| 0 | Sunday | 0 | OFF_DAY |
| 1 | Monday | 7.00 | WORKDAY |
| 2 | Tuesday | 7.00 | WORKDAY |
| 3 | Wednesday | 7.00 | WORKDAY |
| 4 | Thursday | 7.00 | WORKDAY |
| 5 | Friday | 5.00 | WORKDAY |
| 6 | Saturday | 0 | OFF_DAY |

**Konvensi**: `0 = Sunday` (standar JavaScript Date)

---

## 3. Tabel Libur (`attendance_holiday`)

### Struktur Tabel

```sql
CREATE TABLE attendance_holiday (
    holiday_id INT IDENTITY(1,1) PRIMARY KEY,
    holiday_date DATE UNIQUE NOT NULL,
    holiday_name NVARCHAR(100) NOT NULL,
    is_national BIT DEFAULT 0,
    division_id INT NULL,           -- NULL = semua divisi
    created_at DATETIME DEFAULT GETDATE()
);
```

### Contoh Data

| holiday_date | holiday_name | is_national |
|--------------|--------------|-------------|
| 2026-01-01 | Tahun Baru 2026 | 1 |
| 2026-08-17 | Hari Kemerdekaan RI | 1 |
| 2026-03-29 | Cuti Bersama | 0 |

---

## 4. Logic Penentuan Status: `/api/attendance/monthly-matrix-traceable`

### Algoritma `expectedStatusSql()` (Backend: `attendance.routes.ts:153-168`)

```typescript
function expectedStatusSql(dateExpression: string) {
  return `CASE
    WHEN EXISTS (
      SELECT 1 FROM attendance_holiday h
      WHERE h.holiday_date = ${dateExpression}
    ) THEN 'HOLIDAY'
    WHEN EXISTS (
      SELECT 1 FROM attendance_work_config wc
      WHERE wc.day_of_week = ${weekDayIndexSql(dateExpression)}
        AND COALESCE(wc.is_workday, 1) = 0
    ) THEN 'OFF_DAY'
    ELSE 'WORKDAY'
  END`;
}
```

**Flowchart:**

```
        Tanggal Input
              │
              ▼
    ┌─────────────────┐
    │ Cek Holiday?    │──YES──▶ HOLIDAY
    └────────┬────────┘
             │ NO
             ▼
    ┌─────────────────┐
    │ Cek Work Config │──is_workday=0──▶ OFF_DAY
    │ (day_of_week)   │
    └────────┬────────┘
             │ is_workday=1
             ▼
         WORKDAY
```

---

## 5. Priority Chain: NEW STATUS RESOLVER

Dalam endpoint `/api/attendance/monthly-matrix-traceable`, ada **priority chain** yang menentukan status final:

```typescript
// Source: attendance.routes.ts:686-747

// Priority: Manual > Raw Scan > Import > Calendar > No Data
// Raw scan MUST be checked BEFORE OFF_DAY/HOLIDAY pure status

1. if (hasManual)                    → MANUAL_CORRECTION
2. else if (rawScanCount >= 2 && expectedStatus === 'WORKDAY')
                                      → HADIR
3. else if (rawScanCount === 1 && expectedStatus === 'WORKDAY')
                                      → INCOMPLETE_SCAN
4. else if (rawScanCount > 0 && expectedStatus === 'OFF_DAY')
                                      → SCAN_ON_OFFDAY  ← PENTING!
5. else if (rawScanCount > 0 && expectedStatus === 'HOLIDAY')
                                      → SCAN_ON_HOLIDAY ← PENTING!
6. else if (hasImport)                → import_status
7. else if (expectedStatus === 'HOLIDAY')
                                      → HOLIDAY
8. else if (expectedStatus === 'OFF_DAY')
                                      → OFF_DAY
9. else                              → NO_DATA
```

### Catatan Penting: Kenapa "AA" Muncul?

**"AA"** adalah singkatan dari **"Alfa"** atau **"Absent"** (Tidak Hadir). Muncul ketika:

1. Tanggal tersebut adalah **WORKDAY** (bukan hari libur/off day)
2. **Tidak ada raw scan** dari mesin ZKTeco
3. **Tidak ada manual correction**
4. **Tidak ada imported data**

Jadi jika karyawan tidak memiliki scan di hari kerja, akan muncul **AA**.

---

## 6. Mengapa Sebagian Muncul Off Day, Sebagian AA?

### Skenario 1: Off Day Tertera (Misal: "O" atau "Off Day")

| Kondisi | Hasil |
|---------|-------|
| Tanggal = Saturday/Sunday | OFF_DAY |
| Tanggal = Holiday di `attendance_holiday` | HOLIDAY |
| Tidak ada scan | OFF_DAY atau HOLIDAY |

### Skenario 2: AA Muncul

| Kondisi | Hasil |
|---------|-------|
| Tanggal = Monday-Friday (workday) | TIDAK_HADIR/AA |
| Tanggal bukan holiday/off day | TIDAK_HADIR/AA |
| Tidak ada scan di hari kerja | AA |

### Contoh Praktis

```
Karyawan: B0010 (P1B)
Tanggal: 2026-06-22 (Monday)

Jika:
- Ada scan di mesin ZKTeco → HADIR
- Ada scan tapi hanya 1x → INCOMPLETE_SCAN
- Ada manual correction (cuti) → CUTI
- Tidak ada scan + bukan holiday → AA
- Tanggal = Saturday → OFF_DAY
- Tanggal = holiday nasional → HOLIDAY
```

---

## 7. Display Code di Frontend

### Status Code Mapping (`status-mapping.ts:73-87`)

```typescript
export function attendanceStatusCode(status: IntelligenceAttendanceStatus): string {
  switch (status) {
    case 'HADIR':           return 'H';      // Hadir
    case 'TIDAK_HADIR':     return 'A';      // Alfa (AA)
    case 'CUTI':            return 'C';      // Cuti
    case 'SAKIT':           return 'S';      // Sakit
    case 'HOLIDAY':         return 'L';      // Libur
    case 'OFF_DAY':         return 'O';      // Off Day
    case 'MANUAL_CORRECTION': return 'M';    // Manual
    case 'NO_DATA':         return '-';      // No Data
    case 'INCOMPLETE_SCAN': return '1';      // Scan 1x
    case 'SCAN_ON_OFFDAY':  return 'X';      // Scan di Off Day
    case 'SCAN_ON_HOLIDAY': return 'Z';      // Scan di Libur
  }
}
```

### Display Label (`AttendanceMatrixPage.tsx:31-43`)

```typescript
const STATUS_LABEL: Record<IntelligenceAttendanceStatus, string> = {
  HADIR: 'Hadir',
  TIDAK_HADIR: 'Tidak Hadir',
  CUTI: 'Cuti',
  SAKIT: 'Sakit',
  HOLIDAY: 'Libur',
  OFF_DAY: 'Off Day',
  NO_DATA: 'No Data',
  MANUAL_CORRECTION: 'Manual',
  INCOMPLETE_SCAN: 'Scan 1x',
  SCAN_ON_OFFDAY: 'Scan Off Day',
  SCAN_ON_HOLIDAY: 'Scan Libur',
};
```

---

## 8. Kode Off Day di Matriks

| Kode | Status | Warna | Kondisi |
|------|--------|-------|---------|
| **H** | Hadir | Hijau | 2+ scan di workday |
| **A** | Alfa/AA | Merah | Tidak ada scan di workday |
| **O** | Off Day | Abu-abu | Saturday/Sunday (jika tidak ada scan) |
| **L** | Libur | Abu-abu | Tanggal merah/holiday |
| **C** | Cuti | Biru | Dari manual correction |
| **S** | Sakit | Orange | Dari manual correction |
| **X** | Scan Off Day | Kuning | Ada scan di hari off |
| **Z** | Scan Libur | Kuning | Ada scan di hari holiday |
| **1** | Scan 1x | Orange | Hanya 1 scan di workday |
| **M** | Manual | Biru | Di-input manual |

---

## 9. Data Source dan Priority

### Dalam `vw_attendance_monthly_matrix`

```sql
-- Line 188-193
CASE
  WHEN c.employee_code IS NOT NULL THEN c.attendance_status  -- Manual correction
  WHEN i.employee_code IS NOT NULL THEN i.db_status          -- Imported data
  WHEN r.employee_code IS NOT NULL THEN 'PRESENT'             -- Raw ZKTeco
  ELSE 'NO_DATA'
END AS final_status
```

### Source Field

```sql
CASE
  WHEN c.employee_code IS NOT NULL THEN 'MANUAL_CORRECTION'
  WHEN i.employee_code IS NOT NULL THEN COALESCE(i.db_source, 'DATABASE')
  WHEN r.employee_code IS NOT NULL THEN 'ZKTECO'
  ELSE 'NO_DATA'
END AS source
```

---

## 10. Troubleshooting: Kenapa AA vs Off Day?

### Checklist "Kenapa AA?"

1. **Tanggal = workday?** (Monday-Friday)
   - Jika Saturday/Sunday → seharusnya OFF_DAY, bukan AA

2. **Ada data di `attendance_scan_logs`?**
   - Cek: `SELECT * FROM attendance_scan_logs WHERE employee_code = 'XXX' AND scan_date = '2026-06-22'`

3. **Ada mapping di `zkteco_hr_employee_map`?**
   - Cek: `SELECT * FROM zkteco_hr_employee_map WHERE hr_employee_code = 'XXX' AND is_active = 1`

4. **Employee aktif?**
   - Cek: `SELECT * FROM employees WHERE employee_code = 'XXX' AND is_active = 1`

### Checklist "Kenapa Off Day?"

1. **Tanggal = Saturday/Sunday?**
   - Jika ya, default OFF_DAY dari `attendance_work_config`

2. **Tanggal di `attendance_holiday`?**
   - Jika ya, HOLIDAY, bukan OFF_DAY

3. **Ada scan di Off Day?**
   - Jika ada scan, akan muncul sebagai `SCAN_ON_OFFDAY` (kode X)

---

## 11. API Endpoint untuk Debug

### Cek Status Cell Detail

```bash
GET /api/attendance/monthly-matrix/cell?date=2026-06-22&employeeCode=B0010
```

Response akan berisi:
- `expected_status`: WORKDAY/OFF_DAY/HOLIDAY
- `final_status`: Status final yang ditampilkan
- `source`: MANUAL/ZKTECO/DATABASE/NO_DATA
- `has_raw_scan`: true/false
- `has_import`: true/false
- `has_manual_correction`: true/false
- `provenance`: JSON dengan chain lengkap

### Cek Traceable Matrix

```bash
GET /api/attendance/monthly-matrix-traceable?year=2026&month=6&employeeCode=B0010
```

Response akan berisi:
- `trace_state`: Status traceable
- `quality_flags`: Array flags untuk quality check
- `reason`: Penjelasan kenapa status tertentu

---

## 12. Kesimpulan

| Pertanyaan | Jawaban |
|------------|---------|
| **Off Day ditentukan oleh apa?** | `attendance_work_config` (tabel) + `attendance_holiday` (tabel) |
| **Apakah berdasarkan absensi?** | **TIDAK**. Off day ditentukan oleh konfigurasi jadwal, bukan oleh data absensi |
| **Kenapa ada yang AA?** | Karena tidak ada scan di hari kerja (workday) |
| **Kenapa ada yang Off Day?** | Karena tanggal = Saturday/Sunday atau holiday |
| **Priority tertinggi?** | Manual Correction > Raw Scan > Import > Calendar |

---

## 13. Referensi File

| File | Deskripsi |
|------|-----------|
| `src/api/routes/attendance.routes.ts:153-168` | Fungsi `expectedStatusSql()` |
| `src/api/routes/attendance.routes.ts:686-747` | Priority chain resolver |
| `src/api/routes/attendance.routes.ts:918-950` | Cell detail status resolver |
| `frontend/src/services/status-mapping.ts:44-55` | Status normalizer |
| `frontend/src/services/status-mapping.ts:73-87` | Status code mapper |
| `frontend/src/components/features/matrix/AttendanceMatrixPage.tsx:31-58` | UI labels & filters |
| `sql/fix-attendance-work-config.sql` | SQL fix untuk work config |

---

*Generated: 2026-06-22*
