# Audit Database Schema + Migrations — 2026-06-28

Database: `rebinmas_absensi_monitoring` @ 10.0.0.110 (sa/ptrj@123). SQL Server.
Context: 3-layer RAW (`attendance_raw`) → STAGING (`scan_map`) → PROCESSED (`attendance_imports`). 12 base tables, 9 views aktif. Migration terbaru 086 (B1/B2/B3 consistency backfill).
Metode: baca docs target + migration files 075-086, cross-reference dengan query `sys.*` langsung ke DB, verifikasi data bug 086.

---

## Ringkasan Eksekutif

Database sehat struktural. 9 views semua bisa di-query (no broken ref). 12 tables + 8 FK + indexes memadai di kolom hot. Tapi ada **1 bug P0 di migration 086 B3** (sudah terlanjur dijalankan sebagian), **redundansi kolom waktu tinggi di `attendance_raw`** (P1), dan **11 nomor migration duplikat di running set** (P2 housekeeping).

| Sev | Jml | Temuan utama |
|-----|-----|--------------|
| P0 | 1 | 086 B3 JOIN pakai `resolved_at` (2026-06-28) vs `scan_date` (2026-06-27) — selisih -1 hari, tidak akan match. 229 NULL `raw_scan_log_id` tersisa. |
| P1 | 4 | `scan_time` double-offset (bug NOT NULL), kolom waktu redundant 7+6, `employees.gang_id` dead, length mismatch emp_code 40 vs 60. |
| P2 | 6 | Duplikat nomor migration (11 nomor), FK hilang di `attendance_raw_users`, index hilang di `raw_scan_log_id`+`nik`, convention `scan_log_id` vs `raw_scan_log_id` vs `id`, NULL yang harusnya NOT NULL, 077 tanpa `IF NOT EXISTS` guard. |
| P3 | 3 | Rename tabel future polish belum di-execute, `scanner_prefix`/`loc_code` scan_map kemungkinan NULL, employees 42 cols (gemuk). |

---

## Temuan Detail

### P0 — Migration 086 B3 JOIN condition bug

**Object:** `migrations/086_fix_consistency_backfill.sql` baris 8-15 (B3 backfill `attendance_imports.raw_scan_log_id`).
**Severity:** P0 (data integrity).

**Deskripsi:**
B3 backfill `raw_scan_log_id` dengan JOIN:
```sql
INNER JOIN scan_map sm
  ON sm.current_emp_code = ai.employee_code
  AND CAST(sm.resolved_at AS DATE) = ai.attendance_date
```

`resolved_at` = timestamp operasi resolve (saat 079/086 dijalankan, 2026-06-28), BUKAN scan date. `attendance_imports.attendance_date` = tanggal absensi (2026-06-27 dst). Data verifikasi:
- `resolved_at` = 2026-06-28, `scan_date` = 2026-06-27, `day_diff = -1` (5/5 sample).
- JOIN tidak akan match untuk semua row dimana resolve-date ≠ scan-date (mayoritas).

**Verifikasi DB:** `SELECT COUNT(*) FROM attendance_imports WHERE raw_scan_log_id IS NULL` = **229 row**. 086 header bilang backfill 44 NULL — artinya 086 sudah di-run, backfill 44 (yang kebetulan same-day), sisa 185 masih NULL. Total 229 NULL tersisa.

**Bandingkan dengan 079 step 3 (benar):**
```sql
INNER JOIN scan_map sm ON sm.current_emp_code = ai.employee_code
INNER JOIN attendance_raw r ON r.id = sm.scan_log_id
WHERE ai.raw_scan_log_id IS NULL
  AND CAST(r.scan_date AS DATE) = ai.attendance_date;
```
079 pakai `attendance_raw.scan_date` (sumber kebenaran). 086 B3 drop JOIN ke `attendance_raw` dan pakai `resolved_at` — regression.

**Saran fix:** rewrite B3 di migration baru (mis 087):
```sql
UPDATE ai
SET ai.raw_scan_log_id = sm.scan_log_id
FROM attendance_imports ai
INNER JOIN scan_map sm ON sm.current_emp_code = ai.employee_code
INNER JOIN attendance_raw r ON r.id = sm.scan_log_id
WHERE ai.raw_scan_log_id IS NULL
  AND sm.current_emp_code IS NOT NULL
  AND CAST(r.scan_date AS DATE) = ai.attendance_date;
```
Jangan re-run 086 (B1/B2 sudah selesai, idempotent tapi sia-sia).

---

### P1 — Kolom waktu redundant + `scan_time` double-offset bug

**Object:** `attendance_raw` (raw_record_time, scan_time, scan_date, scan_time_original, scan_date_original, scan_time_wib, scan_date_wib, time_correction_* 6 kolom).
**Severity:** P1 (data correctness + maintenance burden).

**Deskripsi:**
`attendance_raw` punya 7 kolom waktu + 6 kolom correction (13 total). Verifikasi DB:
- `raw_record_time` datetime2 NOT NULL — UTC asli, source of truth.
- `scan_time` datetime2 NOT NULL — **BUG double-offset**: `DATEDIFF(minute, raw_record_time, scan_time) = 420` (= +7h). Seharusnya `scan_time = raw_record_time` (UTC) atau di-drop. Frontend sudah pakai `raw_record_time` + toLocale (per memory `timezone-double-offset-fix-2026-06-27`).
- `scan_date` date NOT NULL — turunan `scan_time`, juga bug (date-shift +7h bisa salah hari untuk scan 17:00-24:00 UTC).
- `scan_time_wib`/`scan_date_wib` datetime2/date NULL — 086 backfill NULL→`DATEADD(hour,7,raw_record_time)`. Verifikasi: `null_wib = 0` (sudah selesai). Tapi kolom ini redundant dengan computed frontend.
- `scan_time_original`/`scan_date_original` NULL — backup pre-correction, mayoritas NULL.
- `time_correction_*` (status, offset_minutes, reason, at, by, batch_id) — 6 kolom, hanya 2 terisi post-086 (status='BACKFILL_086_WIB', offset=420).

**Saran fix:**
1. Drop `scan_time` (bug, tidak dipakai frontend lagi) ATAU set `scan_time = raw_record_time` via backfill lalu buat persisted computed column `scan_time AS raw_record_time`.
2. Drop `scan_time_wib`/`scan_date_wib` (frontend computed, kolom dead). Atau dokumentasikan sebagai cache.
3. Drop `scan_time_original`/`scan_date_original` jika 100% NULL (verifikasi dulu).
4. Konsolidasi `time_correction_*` jadi 1 JSON/`time_correction_status` saja.

Catatan: `scan_date` masih dipakai di index `(machine_code,scan_date)` dan JOIN 079/087-fix. Jangan drop sebelum ganti index + JOIN.

---

### P1 — `employees.gang_id` dead column

**Object:** `employees.gang_id` int NULL.
**Severity:** P1 (orphan column, gangs table dropped di 076).

**Deskripsi:**
076 Phase A drop `gangs` table + FK. Tapi `employees.gang_id` kolom tidak di-drop (orphan). 076 bilang "DROP FKs (gangs...)" tapi tidak `ALTER TABLE employees DROP COLUMN gang_id`. Semua row NULL (gangs tidak ada lagi).

**Saran fix:** `ALTER TABLE employees DROP COLUMN gang_id;` di migration baru.

---

### P1 — Length mismatch emp_code/nik antar tabel

**Object:** `scan_map.current_emp_code` nvarchar(40) vs `employees.current_emp_code` nvarchar(60); `hr_reference.emp_code` nvarchar(40) vs `employees.employee_code` nvarchar(60); `employees.nik` nvarchar(100) vs `hr_reference.nik` nvarchar(40).
**Severity:** P1 (convention + truncation risk).

**Deskripsi:**
Join lewat string implicit-convert OK (SQL handle). Emp code format `A0044` max 5 char, NIK 16 digit — aman saat ini. Tapi inconsistency: tabel reference (scan_map, hr_reference) pakai length 40, tabel master (employees, attendance_imports) pakai 60. Jika format code berubah >40 char, truncation silent.

**Saran fix:** standardize ke nvarchar(60) di semua tabel untuk emp_code/employee_code/current_emp_code. Untuk nik: nvarchar(20) cukup (NIK 16 digit) tapi konsisten.

---

### P1 — Convention mismatch scan_log_id vs raw_scan_log_id vs id

**Object:** `attendance_raw.id` (PK), `scan_map.scan_log_id` (FK), `attendance_imports.raw_scan_log_id` (FK).
**Severity:** P1 (convention).

**Deskripsi:**
3 nama beda untuk refer ke kolom yang sama (`attendance_raw.id`). Docs target (FINAL_CLEANUP_PLAN §4) usul rename `raw_scan_log_id`→`scan_log_id` di imports, tapi belum di-execute. Codebase + query harus hafal 2 nama.

**Saran fix:** rename `attendance_imports.raw_scan_log_id` → `scan_log_id` (match scan_map). Atau sebaliknya. Pilih satu, dokumentasikan di DATABASE_FINAL_STATE.md.

---

### P2 — Duplikat nomor migration di running set

**Object:** `migrations/*.sql` (running, bukan archive).
**Severity:** P2 (housekeeping + migration runner ambiguity).

**Deskripsi:**
11 nomor muncul 2+ kali (deteksi `ls *.sql | sed -E 's/^([0-9]+).*/\1/' | sort | uniq -d`):

| Nomor | File |
|-------|------|
| 001 | `001_create_schema.sql`, `001_create_database.sql` |
| 002 | `002_cross_division_sorting.sql`, `002_create_tables.sql` |
| 003 | `003_create_indexes.sql`, `003_add_needs_manual_review.sql` |
| 007 | `007_bulk_insert_attendance_imports.sql`, `007a_need_review.sql`, `007b_mapped_direct.sql`, `007c_mapped_fallback.sql` |
| 009 | `009_insert_imports.sql`, `009_insert_imports_from_mapped.sql` |
| 014 | `014_create_missing_tables.sql`, `014_monthly_matrix_view.sql` |
| 015 | `015_fix_ijl_unmapped.sql`, `015_create_hr_mapping.sql` |
| 041 | `041_sanitize_long_absensi_user_registry.sql`, `041_clean_invalid_employee_codes.sql` |
| 057 | `057_add_zkteco_user_name_to_scan_logs.sql`, `057_backup_scan_logs_before_schema.sql` |
| 059 | `059_add_zkteco_user_name_metadata.sql`, `059_create_machine_time_profile.sql` |
| 060 | `060_backfill_zkteco_user_names.sql`, `060_create_time_correction_tables.sql` |

Archive juga duplikat: `072` (2 file), `073` (2 file).

**Saran fix:** rename salah satu file per nomor (mis `001_create_database.sql` → `001a_create_database.sql` sudah ada prefix huruf, OK; tapi `001_create_schema.sql` konflik). Atau pindahkan yang deprecated ke archive. Migration runner (jika ada `npm run db:migrate` track nomor) bisa bingung urutan. Verifikasi `package.json`/migration runner script cara track nomor.

---

### P2 — FK hilang di `attendance_raw_users`

**Object:** `attendance_raw_users.machine_id` (int NOT NULL, no FK), `attendance_raw_users.import_batch_id` (bigint NULL, no FK).
**Severity:** P2 (referential integrity).

**Deskripsi:**
`attendance_raw_users` punya `machine_id` NOT NULL tapi tanpa FK ke `attendance_machines.id`. Bisa orphan (machine_id tidak exist). `import_batch_id` juga tanpa FK ke `attendance_import_batches.id`. Bandingkan `attendance_raw.machine_id` punya FK.

**Saran fix:**
```sql
ALTER TABLE attendance_raw_users
  ADD CONSTRAINT FK_raw_users_machine FOREIGN KEY (machine_id) REFERENCES attendance_machines(id),
  CONSTRAINT FK_raw_users_batch FOREIGN KEY (import_batch_id) REFERENCES attendance_import_batches(id);
```

---

### P2 — Index hilang di kolom join penting

**Object:** `attendance_imports.raw_scan_log_id`, `attendance_raw.raw_device_user_id`, `employees.nik`, `employees.current_emp_code`, `hr_reference.nik`.
**Severity:** P2 (performance, grow will hurt).

**Deskripsi:**
- `attendance_imports.raw_scan_log_id` — FK ada, **index tidak ada**. Join raw→imports full scan 55k rows.
- `attendance_raw.raw_device_user_id` — filter sering (parser, lookup), 808k rows, no index.
- `employees.nik`, `employees.current_emp_code`, `employees.hr_loc_code` — NIK cascade lookup, 8k rows sekarang OK, grow will hurt.
- `hr_reference.nik` — lookup NIK, 10k rows, no index.

**Saran fix:**
```sql
CREATE NONCLUSTERED INDEX IX_imports_raw_scan_log_id ON attendance_imports(raw_scan_log_id);
CREATE NONCLUSTERED INDEX IX_raw_raw_device_user_id ON attendance_raw(raw_device_user_id);
CREATE NONCLUSTERED INDEX IX_employees_nik ON employees(nik);
CREATE NONCLUSTERED INDEX IX_employees_current_emp_code ON employees(current_emp_code);
CREATE NONCLUSTERED INDEX IX_hr_reference_nik ON hr_reference(nik);
```

---

### P2 — Kolom NULL yang harusnya NOT NULL

**Object:** beberapa kolom boolean/status dengan default.
**Severity:** P2 (constraint weak).

**Deskripsi:**
| Tabel.kolom | Current | Saran |
|-------------|---------|-------|
| `attendance_work_config.is_workday` bit NULL default 1 | NULL | NOT NULL (boolean field, default 1) |
| `scanner_configs.is_active` bit NULL default 1 | NULL | NOT NULL |
| `hr_reference.is_current` bit NULL | NULL | NOT NULL (status flag) |
| `hr_reference.is_ambiguous` bit NULL | NULL | NOT NULL |
| `attendance_raw.machine_id` int NULL | NULL (FK ada) | NOT NULL (tiap scan dari mesin) — verifikasi dulu tidak ada NULL |

**Saran fix:** `ALTER TABLE ... ALTER COLUMN ... bit NOT NULL;` setelah verifikasi tidak ada NULL.

---

### P2 — Migration 077 tanpa `IF NOT EXISTS` guard

**Object:** `migrations/077_phaseE_create_scan_map.sql`.
**Severity:** P2 (idempotency).

**Deskripsi:**
077 `CREATE TABLE scan_map (...)` tanpa guard. 075/076 pakai `IF OBJECT_ID` guard. Jika 077 di-run ulang akan error "table already exists". Inkonsistensi style + tidak idempotent.

**Saran fix:** rewrite 077 pakai `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='scan_map') CREATE TABLE ...` atau `IF OBJECT_ID('scan_map') IS NULL`. Atau dokumentasikan 077 = run-once-only.

---

### P3 — Rename tabel future polish belum di-execute

**Object:** FINAL_CLEANUP_PLAN §7 usul `attendance_raw`→`zk_scan_logs`, `attendance_imports`→`attendance_daily`.
**Severity:** P3 (cosmetic).

**Deskripsi:**
Rename di-docs tapi belum di-execute (marked "future polish Phase 7"). System functional tanpa rename. Compat view `attendance_scan_logs` masih aktif (080 redefine sebagai view ke `attendance_raw`). Rename berisiko break codebase + frontend yang hardcoded nama lama.

**Saran fix:** skip sampai ada bandwidth besar. Jika dilakukan, pakai `sp_rename` + update semua reference di `src/` + `frontend/`.

---

### P3 — `scanner_prefix`/`loc_code` scan_map kemungkinan NULL

**Object:** `scan_map.scanner_prefix`, `scan_map.loc_code`.
**Severity:** P3 (data completeness).

**Deskripsi:**
077 backfill scan_map copy 9 cols dari attendance_scan_logs, tapi `scanner_prefix` + `loc_code` tidak di-backfill. 079 juga tidak isi. Verifikasi DB: kolom ada di schema, tapi perlu cek `SELECT COUNT(*) FROM scan_map WHERE scanner_prefix IS NULL`. Jika mayoritas NULL, kolom dead.

**Saran fix:** backfill dari `scanner_configs` JOIN via `attendance_raw.machine_id`→`attendance_machines.scanner_code`→`scanner_configs.code`. Atau drop kolom jika tidak dipakai query.

---

### P3 — `employees` 42 cols (gemuk)

**Object:** `employees` table.
**Severity:** P3 (maintenance).

**Deskripsi:**
42 cols: identity (5) + DB_PTRJ resolution (8: current_emp_code, current_emp_name, hr_loc_code, hr_status, resolved_nik, current_resolution_*) + ZKTeco mapping (4) + audit/data_quality (6) + denorm lain. FINAL_CLEANUP_PLAN §4 usul konsolidasi jadi ~25 cols, belum di-execute.

**Saran fix:** Phase 6 future. Drop derived/audit cols yang tidak dipakai query (verifikasi dulu via grep codebase).

---

## Inventaris Migration 075-086

| No | Judul | Aksi ringkas |
|----|-------|--------------|
| 075 | Phase 0 backup | RENAME 13 backup tables → `arch_*`. DROP 2 empty state tables. |
| 076 | Phase A drop unused | DROP 4 broken views, CREATE 3 views tanpa gangs. DROP FKs + 18 legacy tables + gangs + mst_* + zkteco_hr_employee_map. |
| 077 | Phase E scan_map | CREATE TABLE `scan_map` (12 cols, PK scan_log_id, FK→raw.id). 3 NC indexes. Backfill 9 cols dari scan_logs. |
| 078 | Fix vw_sync_latest_status | DROP+CREATE dari `attendance_import_batches`. |
| 079 | Backfill scan_map resolution | Cascade parsed_emp_code→employees(nik)→hr_reference(current). Link imports.raw_scan_log_id via raw.scan_date (BENAR). |
| 080 | Pure raw | DROP compat view `attendance_scan_logs`, recreate via JOIN scan_map. DROP 9 processed cols dari `attendance_raw`. |
| 081 | Fix legacy views | DROP 6 views cascade. RECREATE final/daily/monthly + zkteco variants. |
| 082 | Drop redundant imports cols | DROP `gang_code` + `parsed_employee_code` dari imports (30→28 cols). |
| 083 | Remove short id from imports | DELETE 5 rows MANUAL_ dengan raw_device_user_id ≤5 digit. |
| 084 | Add source_reference to vw_attendance_final | DROP+CREATE view + kolom source_reference, raw_scan_log_id. |
| 085 | Add machine_record_count | ALTER attendance_machines ADD 2 cols. |
| 086 | Fix consistency backfill | B1 (scan_time_wib NULL→+7h), B2 (resolution_status NULL→map_status), B3 (raw_scan_log_id NULL→scan_map.scan_log_id — **BUG**, lihat P0). |

**Archive** (`migrations/archive/`, 16 file): 020, 023 (ref dropped `zkteco_hr_employee_map`), 063-073 (emergency recovery post DB wipe 2026-06-25, sudah di-execute lalu di-archive).

---

## Data State Verifikasi (2026-06-28)

| Metric | Value |
|--------|-------|
| `attendance_raw` rows | 808,452 |
| `scan_map` rows | 808,452 (1:1) |
| `attendance_imports` rows | 55,053 |
| `attendance_imports.raw_scan_log_id` NULL | **229** (harusnya 0 setelah 086 B3 — bug) |
| `scan_map.resolution_status` NULL | 0 (086 B2 sukses) |
| `attendance_raw.scan_time_wib` NULL | 0 (086 B1 sukses) |
| `scan_time` vs `raw_record_time` offset | 420 menit (+7h, bug double-offset masih ada) |
| Views broken | 0 (9/9 SELECT-able) |
| FK total | 8 |

---

## Rekomendasi Prioritas Fix

1. **P0 — Fix 086 B3** di migration baru (087): rewrite JOIN pakai `attendance_raw.scan_date` (bukan `resolved_at`). Backfill 229 NULL `raw_scan_log_id`.
2. **P1 — Drop `employees.gang_id`** (dead column, gangs dropped).
3. **P1 — Standardize length** emp_code→nvarchar(60) di scan_map + hr_reference.
4. **P1 — Rename `raw_scan_log_id`→`scan_log_id`** di attendance_imports (convention).
5. **P1 — Address `scan_time` bug**: drop atau set = `raw_record_time`. Drop `scan_time_wib`/`scan_date_wib` (redundant dengan computed frontend). Verifikasi `scan_time_original`/`scan_date_original` 100% NULL → drop.
6. **P2 — Add index** `attendance_imports.raw_scan_log_id`, `attendance_raw.raw_device_user_id`, `employees.nik`, `hr_reference.nik`.
7. **P2 — Add FK** `attendance_raw_users.machine_id` + `import_batch_id`.
8. **P2 — Set NOT NULL** boolean/status cols dengan default.
9. **P2 — Resolve duplikat nomor migration** (rename atau archive salah satu per nomor).
10. **P2 — Rewrite 077** dengan `IF NOT EXISTS` guard.
11. **P3 — Backfill `scanner_prefix`/`loc_code`** scan_map atau drop.
12. **P3 — Future: rename tabel** (Phase 7) + slim `employees` (Phase 6).

---

## File Referensi

- `D:/Gawean Rebinmas/Absensi_Muka/docs/final-architecture-cleanup/DATABASE_FINAL_STATE.md`
- `D:/Gawean Rebinmas/Absensi_Muka/docs/final-architecture-cleanup/FINAL_CLEANUP_PLAN.md`
- `D:/Gawean Rebinmas/Absensi_Muka/migrations/075_phase0_backup.sql` s/d `086_fix_consistency_backfill.sql`
- `D:/Gawean Rebinmas/Absensi_Muka/migrations/079_backfill_scan_map_resolution.sql` (reference JOIN benar)
- `D:/Gawean Rebinmas/Absensi_Muka/migrations/086_fix_consistency_backfill.sql` (B3 bug)
- `D:/Gawean Rebinmas/Absensi_Muka/migrations/archive/` (16 file deprecated)

Audit read-only. Tidak ada DDL/DML/migration dijalankan. Tidak ada file/migration di-edit.
