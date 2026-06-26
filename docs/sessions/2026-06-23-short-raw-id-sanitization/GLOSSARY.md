# Glossary — Istilah & Definisi

## Istilah Teknis

### Attendance-Related

| Istilah | Definisi |
|---------|---------|
| **raw_device_user_id** | ID asli dari mesin ZKTeco (nomor kartu/UID). Contoh: `50040`, `0010097` |
| **employee_code** | Kode employee format: `{locCode}{4 digit}`. Contoh: `A0044`, `C0669`, `L0097` |
| **locCode** | Kode lokasi/division (A, B, C, D, E, F, G, H, J, L) |
| **scanner_prefix** | 3 digit prefix di raw_device_user_id yang menandakan mesin/lokasi |
| **scan_log** | Record scan dari mesin ZKTeco (check-in atau check-out) |
| **check-in** | Record pertama kali scan di hari itu |
| **check-out** | Record terakhir kali scan di hari itu |

### Mapping-Related

| Istilah | Definisi |
|---------|---------|
| **SSOT** | Single Source of Truth — satu fungsi/parser yang jadi acuan satu-satunya |
| **short ID** | raw_device_user_id dengan panjang ≤ 5 digit — tidak di-auto-map |
| **long ID** | raw_device_user_id dengan panjang > 5 digit — eligible untuk parsing |
| **auto-map** | Mapping otomatis oleh sistem tanpa intervensi manusia |
| **name validation** | Proses membandingkan nama ZKTeco dengan nama HR employee |
| **name similarity** | Skor 0-1 dari Levenshtein distance antara dua nama |
| **cross-location** | 1 kartu physical yang terdaftar di multiple mesin dengan ID berbeda |
| **canonical mapping** | Mapping yang konsisten di semua mesin untuk kartu yang sama |

### Status

| Status | Arti |
|--------|------|
| `MAPPED` | Berhasil di-mapping ke employee code valid |
| `NEED_REVIEW` | Parsing berhasil tapi perlu review manusia |
| `UNMAPPED` | Tidak bisa di-mapping (short ID, tidak ada di HR, dll) |
| `EXCLUDED` | Short ID yang dikecualikan dari auto-mapping |
| `HADIR` | Hadir (2+ scan per hari) |
| `TIDAK_HADIR` | Tidak hadir (0 scan) |
| `NO_CHECKOUT` | Hanya ada check-in (tidak ada check-out) |
| `INCOMPLETE_SCAN` | Hanya 1 scan, status tidak lengkap |

### ZKTeco

| Istilah | Definisi |
|---------|---------|
| **ZKTeco** | Brand mesin absensi fingerprint/face recognition |
| **device_uid** | UID kartu di mesin ZKTeco |
| **userId** | ID user di database mesin ZKTeco |
| **machine_code** | Kode mesin di sistem. Contoh: `P1A`, `IJL`, `DME` |
| **machineScannerCode** | Kode scanner di konfigurasi mesin |
| **node-zklib** | Library Node.js untuk komunikasi TCP dengan ZKTeco |

### Database

| Istilah | Definisi |
|---------|---------|
| **db_ptrj** | Database HR (DB_PTRJ) — source of truth untuk employee |
| **rebinmas_absensi_monitoring** | Database utama sistem absensi |
| **extend_db_ptrj** | Legacy database — jangan gunakan |
| **SqlClient** | HTTP gateway untuk extend_db_ptrj — LEGACY |
| **direct MSSQL** | Connection langsung ke SQL Server — PRIMARY |
| **registry** | `zkteco_absensi_user_registry` — deduplicated canonical mapping |
| **migration** | SQL script untuk perubahan schema/data |

### Machine Codes

| Code | Division | Scanner Prefix |
|------|----------|---------------|
| P1A | P1A | 100 |
| P1B | P1B | 300 |
| P2A, P2A_01, P2A_02 | P2A | 500 |
| P2B | P2B | 600 |
| DME, DME_01, DME_02 | DME | 700 |
| ARA, OFFICE_APE | ARA | 800 |
| AB1 | AB1 | 900 |
| AB2, MILL | AB2 | 400 |
| IJL | IJL | 001 |
| ARC, ARC_01, ARC_02 | ARC | 200 |
| OFFICE_PGE, PGE | P1A | 100 |

### API

| Endpoint | Fungsi |
|----------|--------|
| `/api/attendance/monthly-matrix` | Matriks absensi bulanan |
| `/api/attendance/daily` | Absensi harian |
| `/api/machines/:code/employees` | User di mesin (dual mode) |
| `/api/quality/unmapped` | List raw ID yang belum ter-mapping |
| `/api/realtime/events` | SSE stream untuk live updates |
| `/api/sync/trigger/:code` | Trigger sync untuk mesin tertentu |

### Anomali

| Anomali | Arti |
|---------|------|
| **cross-location** | Employee scan di mesin yang bukan divisionnya |
| **impossible travel** | Employee scan di 2 mesin berbeda dalam waktu yang mustahil |
| **late arrival** | Check-in setelah jam tertentu |
| **early departure** | Check-out sebelum jam tertentu |
| **multi-location** | Employee scan di ≥ 2 mesin berbeda |
| **duplicate attendance** | Employee memiliki 2+ record HADIR di hari yang sama |

---

## Singkatan

| Singkatan | Arti |
|-----------|------|
| SSE | Server-Sent Events |
| CRUD | Create, Read, Update, Delete |
| HR | Human Resources |
| UID | User ID / Unique ID |
| SSOT | Single Source of Truth |
| MSSQL | Microsoft SQL Server |
| ZKLib | ZKTeco Library (node-zklib) |
| TTE | Time to Exit (jam pulang) |
| TTI | Time to In (jam masuk) |
