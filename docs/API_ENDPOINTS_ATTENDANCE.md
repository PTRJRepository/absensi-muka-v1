# API Endpoints — Data Absensi (Siap Pakai)

> Base URL: `http://10.0.0.110:8004` (atau `http://localhost:8004` lokal)
> Semua response: `{ success: boolean, data: ..., meta?: {...} }`

## Autentikasi

Dua cara akses data absensi:

### 1. API Key (never expires) — untuk integrasi data-pull
```bash
curl -H "X-API-Key: rbsk_c91465c6d79966b1352c8ca7e110d1e16d830a1faa794724" \
  http://localhost:8004/api/attendance/summary
```
- Key di env: `ATTENDANCE_API_KEY` (`.env`, gitignored)
- Header: `X-API-Key: <value>`
- Grant akses `SUPER_ADMIN` (baca semua data)
- Tidak ada expiry (static key, bukan JWT)
- Generate key baru: `node -e "console.log('rbsk_'+require('crypto').randomBytes(24).toString('hex'))"`

### 2. JWT (7 hari) — untuk web app
```bash
# Login dulu
curl -X POST http://localhost:8004/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"..."}'
# Pakai token
curl -H "Authorization: Bearer <token>" http://localhost:8004/api/attendance/summary
```

### 3. Anonymous (read-only GET)
Middleware allow anonymous access untuk GET. Tanpa header tetap bisa baca data (roles kosong). Untuk data-pull disarankan pakai API key agar ter-audit sebagai `api-key`.

---

## Endpoint Tarik Data Absensi

### Ringkasan & Ketersediaan
| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/attendance/available-months` | Daftar bulan yang punya data absensi |
| GET | `/api/attendance/summary` | Ringkasan agregat (total hadir, alpha, dll) |

### Harian
| Method | Endpoint | Params | Fungsi |
|---|---|---|---|
| GET | `/api/attendance/daily` | `date=YYYY-MM-DD` (default: hari ini) | Absensi semua karyawan per tanggal |

### Bulanan (per karyawan, list)
| Method | Endpoint | Params | Fungsi |
|---|---|---|---|
| GET | `/api/attendance/monthly` | `year`, `month`, `divisionCode?`, `employeeCode?` | List absensi bulanan per karyawan |

### Matriks Bulanan (heatmap employee × tanggal) — **Fokus**
| Method | Endpoint | Params | Fungsi |
|---|---|---|---|
| GET | `/api/attendance/monthly-matrix` | `mode=database\|datamesin`, `year`, `month`, `divisionCode?`, `machineCode?`, `status?`, `mapping?`, `source?`, `search?`, `page`, `pageSize` | Matriks heatmap. `database`=processed (attendance_imports), `datamesin`=raw (attendance_raw). Filter `machineCode` hanya efektif mode `datamesin`. |
| GET | `/api/attendance/monthly-matrix/cell` | `employeeCode`, `date`, `rawDeviceUserId?`, `machineCode?` | Detail semua scan dalam 1 cell (klik cell) |
| GET | `/api/attendance/monthly-matrix-traceable` | `year`, `month`, `machineCode?`, ... | Versi traceable (raw→processed). ⚠️ Berat, timeout 60s untuk full-month. Pakai `machineCode` + `pageSize` kecil. |

### Per Karyawan
| Method | Endpoint | Params | Fungsi |
|---|---|---|---|
| GET | `/api/attendance/employee/:employeeCode` | `limit?`, `startDate?`, `endDate?` | Riwayat absensi karyawan (processed) |
| GET | `/api/attendance/employee/:employeeCode/raw` | `limit?` | Scan raw karyawan (raw_device_user_id) |
| GET | `/api/employees-comprehensive` | `mode=datamesin\|database`, `page`, `pageSize`, `machineCode?`, `divisionCode?`, `search?`, `mappingStatus?`, `startDate?`, `endDate?` | List karyawan komprehensif (1877+ rows) |
| GET | `/api/employees-comprehensive/:employeeCode/detail` | `machineCode?` | Detail identitas karyawan (NIK, division, status mapping) |
| GET | `/api/employees-comprehensive/:employeeCode/scans` | `machineCode?`, `page`, `pageSize` | Riwayat scan karyawan (camelCase, paginated) |

### Per Mesin (raw data)
| Method | Endpoint | Params | Fungsi |
|---|---|---|---|
| GET | `/api/monitoring/machine/:code/raw-data` | `page`, `limit`, `filter=all\|mapped\|unmapped` | Scan logs raw per mesin (paginated) |
| GET | `/api/monitoring/machine/:code/employees` | — | User per mesin (raw vs DB mapped, summary mapping) |
| GET | `/api/monitoring/machine/:code/user/:rawId/attendance` | `limit?` | Absensi agregat per user per mesin (per tanggal, check-in/out) |
| GET | `/api/machines` | — | Daftar 16 mesin + status real-time TCP |

### Per Divisi
| Method | Endpoint | Params | Fungsi |
|---|---|---|---|
| GET | `/api/divisions` | — | Daftar 16 divisi |
| GET | `/api/divisions/:code/scans` | `limit?`, `date?` | Scan per divisi |
| GET | `/api/divisions/:code/attendance` | `year`, `month` | Absensi agregat per divisi |

---

## Contoh Pakai (curl)

```bash
API="rbsk_c91465c6d79966b1352c8ca7e110d1e16d830a1faa794724"
BASE="http://localhost:8004"

# Matriks bulanan mode data mesin, filter mesin P1A
curl -s -H "X-API-Key: $API" \
  "$BASE/api/attendance/monthly-matrix?mode=datamesin&year=2026&month=6&machineCode=P1A&pageSize=50" | jq '.data.rows[0]'

# Scan karyawan tertentu
curl -s -H "X-API-Key: $API" \
  "$BASE/api/employees-comprehensive/G0007/scans?pageSize=20" | jq '.data.pagination'

# Absensi user di mesin (per tanggal)
curl -s -H "X-API-Key: $API" \
  "$BASE/api/monitoring/machine/P1A/user/10044/attendance?limit=10" | jq '.data.attendance[0]'

# Detail cell (klik tanggal karyawan)
curl -s -H "X-API-Key: $API" \
  "$BASE/api/attendance/monthly-matrix/cell?employeeCode=A0044&date=2026-06-27" | jq '.data'
```

## Status Endpoint (2026-06-29)

Semua endpoint data-pull **200** kecuali `monthly-matrix-traceable` (timeout 60s untuk full-month — pakai `machineCode` + `pageSize` kecil).

Latensi:
- `/api/attendance/summary`: 0.05s
- `/api/attendance/daily`: 0.03s
- `/api/attendance/monthly-matrix?mode=datamesin`: 2.8s
- `/api/attendance/monthly-matrix?mode=database`: 1.0s
- `/api/monitoring/machine/P1A/raw-data`: 0.27s
- `/api/employees-comprehensive/G0007/scans`: 0.49s
- `/api/monitoring/machine/P1A/user/10044/attendance`: 0.10s

## Catatan Arsitektur

- `attendance_scan_logs` = **VIEW** (`attendance_raw LEFT JOIN scan_map`). Kolom processed (`current_emp_code`, `current_mapping_reason`) di-resolve saat import, bukan query time.
- 3 layer: RAW (`attendance_raw`, murni mesin) → STAGING (`scan_map`) → PROCESSED (`attendance_imports`, agregat per employee-date).
- Mode `database` = olah (attendance_imports, machine-agnostic). Mode `datamesin` = raw (attendance_raw, punya machine_code).
- Raw ID ≤ 5 digit di-exclude dari imports (mode database), tetap di raw (mode mesin). Parser SSOT tidak produce code untuk short ID.
