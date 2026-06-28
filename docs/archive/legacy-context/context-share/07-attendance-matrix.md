# Attendance Matrix - User Guide

## Overview

Attendance Matrix adalah fitur untuk melihat aktivitas absensi seluruh karyawan berdasarkan filter yang dipilih. Sistem menampilkan grid karyawan × tanggal dengan status kehadiran.

---

## Cara Akses

Buka browser dan akses: `http://localhost:8004`

Gunakan sidebar menu untuk navigasi ke halaman:
- **Dashboard** - Overview sistem
- **Attendance** - Matrix absensi harian/bulanan
- **Machines** - Status mesin absensi
- **Quality** - Data quality metrics

---

## Filter Options

### Filter Utama

| Filter | Description | Example |
|--------|-------------|---------|
| Division | Filter berdasarkan divisi | ARA, AB2, IJL, PG1A |
| Date/Period | Tanggal atau range bulan | 2026-06-19 atau Jun 2026 |
| Employee | Pencarian karyawan | Nama atau kode employee |
| Machine | Filter berdasarkan mesin | PGE, IJL, MILL |

### Sub-filters

| Filter | Description |
|--------|-------------|
| Gang/Team | Filter berdasarkan gang (jika ada) |
| Status | HADIR, TIDAK_HADIR, SICK, LEAVE |
| Active Only | Tampilkan hanya employee aktif |

---

## Attendance Status

| Status | Warna | Deskripsi |
|--------|-------|-----------|
| HADIR | Hijau | Employee hadir dan scan fingerprint |
| TIDAK_HADIR | Merah | Employee tidak hadir |
| SICK | Orange | Employee sakit |
| LEAVE | Biru | Employee cuti |
| HOLIDAY | Abu-abu | Hari libur nasional |
| NO_DATA | Abu-abu | Tidak ada data (belum sync) |

---

## API Endpoints untuk Matrix

### Daily Matrix (per tanggal)

```bash
# Semua division
curl "http://localhost:8004/api/attendance/daily?date=2026-06-19"

# Filter division
curl "http://localhost:8004/api/attendance/daily?date=2026-06-19&divisionCode=ARA"

# Filter + search employee
curl "http://localhost:8004/api/attendance/daily?date=2026-06-19&divisionCode=ARA&search=ARI"
```

### Monthly Matrix (summary per employee)

```bash
# Semua division
curl "http://localhost:8004/api/attendance/monthly?year=2026&month=6"

# Filter division
curl "http://localhost:8004/api/attendance/monthly?year=2026&month=6&divisionCode=ARA"
```

### Employee Detail

```bash
# Riwayat attendance employee
curl "http://localhost:8004/api/attendance/employee/0010001"
```

---

## Data Sources

### Source Priority (untuk attendance_imports)

1. **Manual Correction** - Diubah manual oleh admin (highest priority)
2. **Imported Data** - Dari ZKTeco machines atau IT Solution API
3. **NO_DATA** - Tidak ada data sama sekali

### View yang Digunakan

- `vw_attendance_final` - Data final dengan semua source
- `vw_attendance_monthly_summary` - Summary bulanan
- `vw_attendance_daily_summary` - Summary harian per division

---

## Machine Activity Matrix

Untuk melihat aktivitas per mesin:

```bash
# Semua mesin
curl "http://localhost:8004/api/monitoring/machines"

# Detail mesin tertentu
curl "http://localhost:8004/api/monitoring/machine/PGE"

# Real-time status
curl "http://localhost:8004/api/machines/real-time-status"
```

---

## Common Use Cases

### 1. Cek Siapa yang Tidak Hadir Hari Ini
```bash
# Get daily summary
curl "http://localhost:8004/api/attendance/summary?date=2026-06-19"
```

### 2. Cek Attendance Rate Division
```bash
curl "http://localhost:8004/api/monitoring/division-summary?year=2026&month=6"
```

### 3. Cek Employee dengan Attendance Buruk
```bash
# Monthly dengan total_absent tinggi
curl "http://localhost:8004/api/attendance/monthly?year=2026&month=6" | \
  jq '.data[] | select(.total_absent > 10)'
```

### 4. Cek Machine yang Tidak Aktif
```bash
curl "http://localhost:8004/api/machines/real-time-status" | \
  jq '.machines[] | select(.records_today == 0)'
```

---

## Known Issues

### Issue 1: Dual Employee Code Format
- Employee codes di database tidak konsisten
- Codes dari API: "0010001"
- Codes dari ZKTeco: "A0044"
- **Impact**: Some employees may not match in matrix

### Issue 2: Batch Jobs Stuck
- Beberapa batch import stuck di status RUNNING
- **Impact**: Data mungkin tidak up-to-date
- **Workaround**: Cek status di `/api/monitoring/batches`

---

## Tips

1. **Refresh Data**: Tunggu 15 menit setelah sync otomatis
2. **Export**: Gunakan fitur export di UI atau API
3. **Troubleshooting**: Cek `/api/monitoring/quality` untuk data quality
4. **Manual Entry**: Gunakan `/api/attendance/corrections` untuk koreksi