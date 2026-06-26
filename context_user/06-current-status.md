# Status Terkini — Project Absensi

Tanggal update: 2026-06-15

## Apa yang Sudah Selesai

### ✅ 1. Testing Semua 16 Mesin
- 7 mesin berhasil connect via ZKTeco protocol
- 9 mesin blocked (port forwarding/firewall belum dikonfigurasi)
- P1A dan P1B ADALAH ZKTeco devices (bukan "NON_ZKTECO")
- File: `_dev_utils/src/machine-config.ts`

### ✅ 2. Export Data dari Mesin
- 5,289 users exported dari 7 mesin
- 51,816 attendance records dari latest export
- Data tersimpan di `attendance-all-logs.json` dan `attendance-all-users.json`

### ✅ 3. Import ke Database
- Menggunakan direct MSSQL connection ke `rebinmas_absensi_monitoring`
- Tidak menggunakan SQL Gateway HTTP
- emp_code parsing: locCode + last 4 digits of userId
- File: `_dev_utils/import-direct-mssql.ts`

### ✅ 4. Database Status
- 4,182 employees in database
- 134,037 total attendance records
- 51,816 records dari latest export
- Batch tracking di `attendance_import_batches`

### ✅ 5. Dokumentasi
- `CLAUDE.md` — Updated dengan konfigurasi terbaru
- `context_user/01-project-overview.md` — Ringkasan project
- `context_user/02-machine-configuration.md` — Detail 16 mesin
- `context_user/03-data-sources.md` — Panduan akses data
- `context_user/06-current-status.md` — Dokumen ini
- `context_user/07-api-reference.md` — API reference

## Data Export Summary (2026-06-15)

### Accessible Machines (7)

| Machine | IP:Port | Users | Attendance | Division | LocCode |
|---------|---------|-------|------------|----------|----------|
| OFFICE_PGE | 223.25.98.220:4370 | 1,653 | 19,641 | STF | A |
| OFFICE_APE | 103.144.208.154:4370 | 1,084 | 9,820 | ARA | F |
| MILL | 103.127.66.32:4370 | 569 | 4,910 | STF | A |
| IJL | 103.144.211.226:4370 | 166 | 8,007 | IJL | L |
| AB2 | 103.144.208.154:4400 | 233 | 3,962 | AB2 | H |
| P1A | 10.0.0.90:4100 | 792 | 2,739 | PG1A | A |
| P1B | 10.0.0.91:4300 | 792 | 2,737 | PG1B | B |
| **TOTAL** | | **5,289** | **51,816** | | |

### Inaccessible Machines (9)

| Machine | IP:Port | Issue |
|---------|---------|-------|
| DME_01 | 103.144.228.42:4700 | Port blocked |
| DME_02 | 103.144.228.42:4701 | Port blocked |
| ARC_01 | 103.144.208.154:4200 | Port blocked |
| ARC_02 | 103.144.208.154:4201 | Port blocked |
| ARA | 103.144.208.154:4800 | Port blocked |
| AB1 | 103.144.208.154:4900 | Port blocked |
| P2A_01 | 10.0.0.92:4500 | Network unreachable |
| P2B | 10.0.0.93:4600 | Network unreachable |
| P2A_02 | 10.0.0.94:4501 | Network unreachable |

## Yang Belum Selesai / Pending

### ⏳ 1. Port Forwarding
- 9 mesin butuh port forwarding di router
- Perlu akses ke router untuk konfigurasi
- **Alternatif:** Gunakan IT Solution API sebagai sumber data

### ⏳ 2. Auto-Sync / Scheduler
- Script sudah ada tapi belum di-test dan dijalankan
- Target: sync otomatis setiap 15 menit

## Commands

```bash
# Test all machine connections
bun run _dev_utils/test-all-machines.ts

# Export attendance data from machines
bun run _dev_utils/export-all-machines.ts

# Import data to database (direct mssql)
bun run _dev_utils/import-direct-mssql.ts

# Check database
bun run _dev_utils/check-attendance-db.ts

# Backend
npm run build
npm run start
npm run dev
```

## File Penting

| File | Lokasi | Keterangan |
|------|--------|------------|
| machine-config.ts | `_dev_utils/src/` | Mapping 16 mesin |
| config.ts | `_dev_utils/src/` | Database & API config |
| import-direct-mssql.ts | `_dev_utils/` | Import script |
| check-attendance-db.ts | `_dev_utils/` | Database checker |
| attendance-all-*.json | `_dev_utils/` | Data terekspor |
| users-all-*.json | `_dev_utils/` | User data terekspor |
