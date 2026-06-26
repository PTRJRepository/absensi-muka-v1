# Dokumentasi Lengkap — Sistem Absensi PT Rebinmas Jaya

## Tujuan

Dokumentasi ini dibuat untuk **transfer knowledge** — agar developer baru bisa memahami sistem secara menyeluruh tanpa harus membaca seluruh codebase.

## Konteks: Sanitasi Short Raw ID (2026-06-23)

Session ini membersihkan seluruh database dan codebase dari short raw ID mesin absensi. Masalah utama:

- **100,000+ record** dengan short raw ID yang tidak seharusnya di-auto-map
- **Cross-location contamination**: 1 kartu → multiple employee codes di mesin berbeda
- **Name mismatch**: `PAIMIN` dipaksa auto-map ke `PANJI ADITIA ROSA` (salah)

**Solusi**: SSOT parser + name validation + registry deduplication

---

## Struktur Dokumentasi

```
docs/sessions/2026-06-23-short-raw-id-sanitization/
├── README.md               ← Start here (index ini)
├── 01-OVERVIEW.md          ← Konteks & ringkasan
├── 02-ARCHITECTURE.md      ← Arsitektur & alur data
├── 03-DATABASE-SCHEMA.md   ← Tables, views, relationships
├── 04-PARSING-RULES.md     ← SSOT parser rules (Wajib baca!)
├── 05-MIGRATION-HISTORY.md ← Semua migrations (001-041)
├── 06-API-ENDPOINTS.md    ← Key API endpoints
├── 07-KNOWN-ISSUES.md      ← Known bugs & priority fixes
├── 08-CODE-PATTERNS.md     ← Patterns & anti-patterns
├── 09-TROUBLESHOOTING.md   ← Debugging guide
├── QUICK-REF.md            ← Cheat sheet untuk developer
├── GLOSSARY.md             ← Istilah & definisi
└── DATA-DICTIONARY.md      ← Kolom database lengkap
```

## Cara Baca

1. **QUICK-REF.md** — Quick overview untuk yang sudah tahu sistem
2. **01-OVERVIEW.md** — Konteks lengkap proyek
3. **04-PARSING-RULES.md** — **WAJIB** — memahami cara parse employee code
4. **02-ARCHITECTURE.md** — Alur data dari mesin ZKTeco ke frontend
5. **03-DATABASE-SCHEMA.md** — Struktur database dan relasi
6. **05-MIGRATION-HISTORY.md** — Semua perubahan database
7. **07-KNOWN-ISSUES.md** — Bug yang perlu di-fix
8. **08-CODE-PATTERNS.md** — Pattern yang benar
9. **09-TROUBLESHOOTING.md** — Kalau ada masalah

---

## Ringkasan Hasil Sanitasi

### Database State (2026-06-23)

| Table | Total | MAPPED | NEED_REVIEW | Notes |
|-------|-------|--------|-------------|-------|
| attendance_scan_logs | 1.2M | 791,907 | 365 | ✅ Semua long IDs |
| zkteco_absensi_user_registry | 1,827 | 1,825 | 2 | ✅ Canonical registry |
| zkteco_hr_employee_map | 9,486 | 6,701 | — | ✅ Short CONVERTED = 0 |

### 3 Aturan Utama

1. **Short ID (< 5 digit)** → TIDAK di-auto-map. Masukkan ke UNMAPPED.
2. **Nama harus cocok** → PAIMIN tidak boleh auto-map ke PANJI ADITIA ROSA.
3. **Registry deduplicates** → 1 card number = 1 canonical entry.

### New Tables (Migration 041)

- `zkteco_absensi_user_registry` — canonical per raw_device_user_id
- `zkteco_absensi_user_machine` — per-machine breakdown

---

## Critical Rules

1. **Jangan pernah auto-map short ID** (< 5 digit) — penyebab utama data salah
2. **Nama harus divalidasi** — gunakan `validateNameMatch()` sebelum auto-map
3. **Registry deduplicates cross-location** — 1 card di multiple mesin = 1 registry entry
4. **SSOT parser adalah satu-satunya** — jangan buat parser baru di tempat lain
5. **IT Solution API TIDAK ADA** — semua data dari ZKTeco machines saja

---

## Key Files

| File | Fungsi |
|------|--------|
| `src/modules/mapping/zkteco-employee-code-parser.ts` | SSOT parser — SATU-SATUNYA tempat parsing |
| `src/modules/import/sync-orchestrator.service.ts` | Sync dari ZKTeco machines |
| `src/modules/employees/employee-mapping.service.ts` | Mapping dengan name validation |
| `src/lib/db.ts` | Direct MSSQL (primary connection) |
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

---

## Migrations (Total: 41)

| Range | Purpose |
|-------|---------|
| 001-010 | Initial setup |
| 011-023 | Attendance processing |
| 034-041 | **Sanitasi short raw ID** ← Session ini |

---

## Next Steps

1. [TODO] Implement alert notifications (nodemailer, twilio)
2. [TODO] Fix SQL injection (employee-movement.service.ts)
3. [TODO] Entry time anomaly detection
4. [TODO] Multi-location threshold fix (≥ 2 machines)
5. [TODO] Impossible travel detection
6. [TODO] Consolidate duplicate attendance systems
