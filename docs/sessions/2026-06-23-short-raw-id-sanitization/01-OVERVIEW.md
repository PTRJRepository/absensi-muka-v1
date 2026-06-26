# Dokumentasi Lengkap — Sistem Absensi PT Rebinmas Jaya

## Tujuan

Dokumentasi ini dibuat untuk **transfer knowledge** — agar developer baru bisa memahami sistem secara menyeluruh tanpa harus membaca seluruh codebase.

## Struktur Dokumentasi

```
docs/
├── sessions/
│   └── 2026-06-23-short-raw-id-sanitization/   ← Cleanup session
│       └── README.md
├── 01-OVERVIEW.md               ← This file — start here
├── 02-ARCHITECTURE.md          ← System architecture & data flow
├── 03-DATABASE-SCHEMA.md       ← Database tables, views, relationships
├── 04-PARSING-RULES.md         ← SSOT employee code parsing rules
├── 05-MIGRATION-HISTORY.md     ← All migrations (001-041)
├── 06-API-ENDPOINTS.md        ← Key API endpoints
├── 07-KNOWN-ISSUES.md          ← Known bugs and fixes
├── 08-CODE-PATTERNS.md         ← Important code patterns
└── 09-TROUBLESHOOTING.md       ← Debugging guide
```

## Ringkasan Sistem

**Sistem**: Monitoring absensi 16 mesin ZKTeco di perkebunan kelapa sawit
**Backend**: Node.js v22 + TypeScript + SQL Server
**Frontend**: React 19 + Vite + TypeScript
**Port**: 8004

### Alur Data

```
Mesin ZKTeco (TCP)
    ↓ node-zklib
Direct Import Service
    ↓
attendance_scan_logs (raw)
    ↓ parse (SSOT parser)
zkteco_absensi_user_registry (canonical)
    ↓ lookup
db_ptrj.HR_EMPLOYEE
    ↓
attendance_imports (processed)
    ↓
Frontend Matrix
```

### 3 Prinsip Utama

1. **Short ID (< 5 digit)** → TIDAK di-auto-map. Masukkan ke UNMAPPED.
2. **Nama harus cocok** → PAIMIN tidak boleh auto-map ke PANJI ADITIA ROSA.
3. **Registry deduplication** → 1 card number = 1 canonical entry di registry, bukan per mesin.

## Cara Baca

1. **Mulai dari 01-OVERVIEW.md** untuk konteks lengkap
2. **02-ARCHITECTURE.md** untuk memahami alur data
3. **04-PARSING-RULES.md** untuk memahami cara parse employee code
4. **05-MIGRATION-HISTORY.md** untuk melihat semua perubahan database
5. **07-KNOWN-ISSUES.md** untuk memahami bug yang belum fixed

## Key Files

| File | Fungsi |
|------|--------|
| `src/modules/mapping/zkteco-employee-code-parser.ts` | SSOT parser — SATU-SATUNYA tempat parsing employee code |
| `src/modules/import/sync-orchestrator.service.ts` | Orchestrates sync dari ZKTeco machines |
| `src/modules/employees/employee-mapping.service.ts` | Employee mapping dengan name validation |
| `src/lib/db.ts` | Direct MSSQL connection (rebinmas_absensi_monitoring) |
| `src/lib/realtime-emitter.ts` | SSE broadcast untuk real-time updates |

## Environment Variables

```
DB_SERVER=10.0.0.110
DB_PORT=1433
DB_NAME=rebinmas_absensi_monitoring
APP_PORT=8004
JWT_SECRET=<JWT_SECRET>
ZKTECO_PASSWORD=12345
```

## Database Targets

| Database | Connection | Use |
|----------|-----------|-----|
| `rebinmas_absensi_monitoring` | Direct MSSQL (src/lib/db.ts) | Primary — semua development baru |
| `db_ptrj` | Via SQL Server linked server | HR employee source of truth |
| `extend_db_ptrj` | SqlClient (src/shared/database/sql-client.ts) | LEGACY — jangan gunakan |

## Critical Rules

1. **Jangan pernah auto-map short ID** (< 5 digit) — ini penyebab utama data salah
2. **Nama harus divalidasi** — gunakan `validateNameMatch()` sebelum auto-map
3. **Registry deduplicates cross-location** — 1 card di multiple mesin = 1 registry entry
4. **SSOT parser adalah satu-satunya** — jangan buat parser baru di tempat lain
5. **IT Solution API TIDAK ADA** — semua data dari ZKTeco machines saja
