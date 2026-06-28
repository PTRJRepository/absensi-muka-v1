# FINAL_CLEANUP_PLAN — Planning Pembersihan & Penyederhanaan Skema

> 📋 PLANNING ONLY — 2026-06-27. Tidak ada edit DB/code. Plan untuk eksekusi bertahap.
> Supersedes gap di [[DATABASE_FINAL_STATE]] untuk: raw purity, broken views, DB_PTRJ resolution, kolom simplifikasi.
> Related: [[ARCHITECTURE_FINAL]] [[DATABASE_CLEANUP_PLAN]] [[DATA_DICTIONARY_FINAL]] [[MIGRATION_ROADMAP]]

---

## 0. Posisi Saat Ini

| Metric | Nilai |
|--------|-------|
| Base tables | **12** (dari 65) |
| Views | 10 (2 compat + 7 legacy + 1 broken) |
| `attendance_raw` rows | 808.093 |
| `scan_map` rows | 808.093 (1:1) |
| `attendance_imports` rows | 55.057 |
| `employees` rows | 8.005 |
| Build | clean (tsc exit 0) |
| Endpoints live | all 200 |

**Tetap utuh (preserve, jangan sentuh):**
- Data mesin raw (808K scan_logs, 6.3K users)
- SSOT parser `zkteco-employee-code-parser.ts`
- Sync pipeline 3-job scheduler
- `time_correction_*` columns (user decision: alternatif nanti)

---

## 1. Masalah Inti: `attendance_raw` TIDAK Pure

User requirement: **"raw = original dari mesin, ga perlu diproses apapun, termasuk tag scan in/out"**.

Realita: `attendance_raw` (37 cols) bawa **9 processed columns** yang duplikat dengan `scan_map`:

### Kolom processed yang harus dihapus dari `attendance_raw`

| # | Kolom di `attendance_raw` | Sudah ada di `scan_map` | Sumber |
|---|---------------------------|-------------------------|--------|
| 1 | `parsed_employee_code` | `parsed_emp_code` ✅ | SSOT parser |
| 2 | `parsed_division_code` | `loc_code` ✅ | SSOT parser |
| 3 | `mapping_status` | `map_status` ✅ | parser result |
| 4 | `mapping_reason` | `map_reason` ✅ | parser result |
| 5 | `current_emp_code` | `current_emp_code` ✅ | DB_PTRJ resolution |
| 6 | `current_employee_id` | (derived via JOIN employees) | DB_PTRJ resolution |
| 7 | `current_mapping_status` | `resolution_status` ✅ | DB_PTRJ resolution |
| 8 | `current_mapping_reason` | `resolution_method` ✅ | DB_PTRJ resolution |
| 9 | `current_resolved_at` | `resolved_at` ✅ | DB_PTRJ resolution |

### Skema `attendance_raw` PURE (target, 22 cols)

```sql
-- HANYA data mesin, immutable, no processing
id                  bigint PK
machine_id          int              -- FK attendance_machines
machine_code        nvarchar         -- denormalized (mesin)
raw_device_user_id  nvarchar         -- dari mesin (zk.getAttendances)
raw_user_sn         nvarchar         -- serial number mesin
raw_record_time     datetime2        -- timestamp UTC asli mesin
raw_ip              nvarchar         -- IP mesin
scan_time           datetime2        -- waktu scan (WIB-corrected)
scan_date           date             -- tanggal scan (WIB)
event_type          nvarchar         -- CHECK_IN / CHECK_OUT tag (mesin)
verify_type         nvarchar         -- fingerprint/card/password
work_code           nvarchar         -- work code mesin
sync_batch_id       bigint           -- batch import id
created_at          datetime2        -- insert timestamp
-- time correction (preserve per user decision)
scan_time_original  datetime2
scan_date_original  date
scan_time_wib       datetime2
scan_date_wib       date
time_correction_status        nvarchar
time_correction_offset_minutes int
time_correction_reason        nvarchar
time_corrected_at             datetime2
time_corrected_by             nvarchar
time_correction_batch_id      bigint
```

### Skema `scan_map` (staging processed, sudah ada, 12 cols)

```sql
scan_log_id         bigint PK (→ attendance_raw.id, 1:1)
parsed_emp_code     nvarchar   -- SSOT parser result
scanner_prefix      nvarchar   -- prefix lokasi (A/B/C...)
loc_code            nvarchar   -- division code (P1A/P2B...)
map_status          nvarchar   -- MAPPED / NEED_REVIEW
map_reason          nvarchar   -- detail mapping
current_emp_code    nvarchar   -- DB_PTRJ resolved
current_emp_name    nvarchar   -- DB_PTRJ resolved
resolved_nik        nvarchar   -- NIK dari HR
resolution_status   nvarchar   -- MAPPED / NEED_REVIEW / AMBIGUOUS
resolution_method   nvarchar   -- cascade step
resolved_at         datetime2
```

### Manfaat pemurnian raw

1. **Naming contract jelas**: `*_raw` = mesin pure, `scan_map` = processed, `attendance_imports` = final
2. **Single source**: processed data hanya di `scan_map`, tidak duplikat di 2 tempat
3. **Storage**: -9 cols × 808K rows ≈ 7.3M cell hemat
4. **Sync cleaner**: `insertRawScanLog` hanya tulis mesin data, processed write terpisah ke `scan_map`
5. **Audit trail**: perubahan resolution tercatat di `scan_map.resolved_at`, raw tidak berubah

---

## 2. DB_PTRJ Current Emp Code Resolution Cascade (WAJIB)

User requirement: **employee final ≠ parsed_employee_code mesin**. Harus ikut current code HR.

### Flow resolution (5-step)

```
attendance_raw.raw_device_user_id
  │
  ▼ SSOT parser (zkteco-employee-code-parser.ts)
scan_map.parsed_emp_code           (contoh: A0044 — bisa kode lama)
  │
  ▼ JOIN employees e_parsed ON e_parsed.employee_code = parsed_emp_code
e_parsed.nik                      (NIK dari master employees)
  │
  ▼ JOIN hr_reference h ON h.nik = e_parsed.nik AND h.type='current'
h.emp_code                        (current_emp_code HR — kode aktif)
h.emp_name, h.loc_code, h.hr_status
  │
  ▼ JOIN employees e_current ON e_current.employee_code = h.emp_code
e_current.id                      (employee_id final)
e_current.division_id             (divisi final bila mutasi)
  │
  ▼ WRITE to scan_map
scan_map.current_emp_code  = COALESCE(h.emp_code, parsed_emp_code)
scan_map.current_emp_name  = COALESCE(h.emp_name, e_parsed.employee_name)
scan_map.resolved_nik      = e_parsed.nik
scan_map.resolution_status = CASE WHEN h.is_ambiguous=1 THEN 'AMBIGUOUS'
                                  WHEN h.emp_code IS NOT NULL THEN 'MAPPED'
                                  WHEN e_parsed.nik IS NULL THEN 'NEED_REVIEW'
                                  ELSE 'NEED_REVIEW' END
scan_map.resolution_method = 'db_ptrj_hr_nik_cascade'
```

### Fallback rules

| Kondisi | Resolution |
|---------|------------|
| NIK ada, current_emp_code HR ada, tidak ambigu | `MAPPED` → pakai current |
| NIK ada, current_emp_code ambigu (is_ambiguous=1) | `AMBIGUOUS` → NEED_REVIEW, jangan merge |
| NIK ada, current_emp_code HR NULL | `NEED_REVIEW` → fallback parsed_emp_code |
| NIK NULL (2038 employees) | `NEED_REVIEW` → fallback parsed_emp_code |
| parsed_emp_code tidak match employees manapun | `NEED_REVIEW` (raw_id 6-digit, new hire) |

### Data quality saat ini

| Metric | Count | % |
|--------|-------|---|
| employees total | 8.005 | 100% |
| missing NIK | 2.038 | 25.5% |
| current != parsed | 1.204 | 15.0% |
| hr_reference current | 4.763 | — |
| hr_reference history | 5.967 | — |
| scan_map MAPPED | 789.974 | 97.8% |
| scan_map NEED_REVIEW | 18.119 | 2.2% |

### Risiko bila hanya pakai parsed_employee_code

1. Karyawan mutasi divisi → attendance salah divisi (15% terdampak)
2. Karyawan ganti kode → data terpotong 2 identity (1204 kasus)
3. Frontend mode Database tampil kode lama, bukan current
4. Cross-location analysis salah attribution

### API response WAJIB bawa (mode database)

```
parsed_employee_code     -- dari mesin (debug)
current_emp_code         -- dari HR resolution
employee_code_final      -- COALESCE(current, parsed)
employee_name_final      -- COALESCE(current_name, parsed_name)
current_resolution_status
current_resolution_method
resolved_nik
```

---

## 3. View Cleanup

### Broken view — DROP

| View | Masalah | Aksi |
|------|---------|------|
| `vw_sync_latest_status` | ref `attendance_sync_logs` (dropped) → binding error | **DROP** (atau recreate dari `attendance_import_batches`) |

### Legacy view — audit mismatch

| View | Masalah | Status code ref | Aksi |
|------|---------|-----------------|------|
| `vw_attendance_final` | status `PRESENT/ABSENT` ≠ data `HADIR` | 22 file match | **RECREATE** atau deprecate |
| `vw_attendance_daily_summary` | layer `vw_attendance_final` (mismatch turunan) | — | **RECREATE** atau DROP |
| `vw_attendance_monthly_summary` | layer `vw_attendance_final` | — | **RECREATE** atau DROP |
| `vw_attendance_monthly_summary_v2` | layer `vw_attendance_final` | — | audit |
| `vw_attendance_zkteco_final` | status `PRESENT/NO_DATA` (OK untuk raw mode) | — | KEEP |
| `vw_attendance_zkteco_daily_summary` | layer zkteco | — | KEEP |
| `vw_attendance_zkteco_monthly_summary` | layer zkteco | — | KEEP |

### Compat view — DROP setelah code migrated

| View | Alias ke | Aksi |
|------|----------|------|
| `attendance_scan_logs` | `attendance_raw` | DROP setelah semua code pakai `attendance_raw` |
| `machine_user_raw` | `attendance_raw_users` | DROP setelah semua code pakai `attendance_raw_users` |

**Decision needed**: Apakah code sudah 100% pakai nama baru? Audit 22 file ref `attendance_scan_logs` — mayoritas mungkin masih pakai nama view lama (yang sekarang alias). Functional OK, tapi rename code perlu untuk bisa drop view.

---

## 4. Simplifikasi Nama Kolom

### `attendance_raw` — konsisten prefix

| Sekarang | Usul | Alasan |
|----------|------|--------|
| `raw_device_user_id` | `device_user_id` | prefix `raw_` redundant (table sudah `_raw`) |
| `raw_user_sn` | `device_sn` | konsisten |
| `raw_record_time` | `record_time_utc` | eksplisit timezone |
| `raw_ip` | `machine_ip` | konsisten |
| `scan_time` | `scan_time_wib` | eksplisit (sudah corrected) |
| `scan_date` | `scan_date_wib` | eksplisit |
| `scan_time_original` | `scan_time_raw` | konsisten raw layer |
| `scan_date_original` | `scan_date_raw` | konsisten |

### `attendance_imports` — drop redundant

| Kolom | Status | Aksi |
|-------|--------|------|
| `gang_code` | selalu 'N/A' (gangs dropped) | **DROP** |
| `parsed_employee_code` | duplikat employee_code | **DROP** (atau jadi audit only) |
| `employee_name` | duplikat employees.employee_name | KEEP (denormalized untuk speed) |
| `hr_status`, `hr_loc_code`, `nik` | duplikat employees | KEEP (denormalized) |
| `current_emp_name`, `current_hr_loc_code`, `current_hr_status` | duplikat hr_reference | KEEP (denormalized, DB_PTRJ) |
| `raw_scan_log_id` | 82% NULL | **FIX**: backfill dari scan_map |
| `attendance_year`, `attendance_month` | derived dari date | KEEP (partition key) |

### `employees` (42 cols) — terlalu gemuk, kategorikan

| Kategori | Cols | Aksi |
|----------|------|------|
| Identity inti | id, employee_code, employee_name, nik, division_id | KEEP |
| Status | employment_status, is_active | KEEP |
| DB_PTRJ resolution | current_emp_code, current_emp_name, hr_loc_code, hr_status, current_hr_loc_code, current_hr_create_date, current_hr_update_date, current_resolved_at, resolved_nik, current_resolution_status, current_resolution_method, current_resolution_reason | **KONSOLIDASI** ke fewer cols |
| ZKTeco mapping | raw_device_user_id, zkteco_user_id, zkteco_user_name, parsed_division_code, mapping_status, mapping_reason | KEEP (debug) |
| Audit/data quality | scan_count, first_seen_at, last_seen_at, raw_id_length, id_category, hr_verified, hr_verified_at, data_quality_status, data_quality_reason, is_raw_id, batch_import, machine_codes, identity_source, hr_employee_code | **AUDIT** — banyak bisa derived |

Usul: employees target ~25 cols (drop 17 derived/audit).

---

## 5. Execution Phases (bertahap, aman)

### Phase 1 — Fix Broken (low risk)
1. DROP `vw_sync_latest_status` (broken, no consumers critical)
2. ATAU recreate: `CREATE VIEW vw_sync_latest_status AS SELECT ... FROM attendance_import_batches ORDER BY started_at DESC` (jika masih perlu)
3. Verify: `SELECT TOP 1 * FROM vw_sync_latest_status` → OK

### Phase 2 — DB_PTRJ Resolution Backfill (med risk)
1. UPDATE `scan_map` SET `current_emp_code`, `current_emp_name`, `resolved_nik`, `resolution_status`, `resolution_method`, `resolved_at` via cascade JOIN
2. Backfill `attendance_imports.raw_scan_log_id` dari `scan_map` (link 82% null)
3. Verify: `SELECT COUNT(*) FROM scan_map WHERE current_emp_code IS NOT NULL` → naik dari baseline

### Phase 3 — Drop Redundant Cols `attendance_raw` (med risk)
1. Audit: `grep -r "parsed_employee_code\|mapping_status\|current_emp_code" src/api/routes src/modules` di file yang query `attendance_raw` langsung (bukan via scan_map JOIN)
2. Migrate code: semua query yang baca processed cols dari `attendance_raw` → JOIN `scan_map`
3. Backup DB
4. `ALTER TABLE attendance_raw DROP COLUMN parsed_employee_code, parsed_division_code, mapping_status, mapping_reason, current_emp_code, current_employee_id, current_mapping_status, current_mapping_reason, current_resolved_at`
5. Update `insertRawScanLog` (sync-orchestrator) → stop write processed cols ke raw
6. Build + test endpoint all 200

### Phase 4 — Drop View Compat (low risk, setelah Phase 3)
1. Audit code: pastikan 0 ref `attendance_scan_logs`/`machine_user_raw` (view lama)
2. DROP view `attendance_scan_logs`, `machine_user_raw`
3. Build + test

### Phase 5 — Legacy View Recreate/Drop (med risk)
1. Audit consumer `vw_attendance_final` (22 file)
2. Recreate dengan status `HADIR/INCOMPLETE_SCAN` ATAU DROP bila tidak dipakai
3. Cascade: `vw_attendance_daily_summary`, `vw_attendance_monthly_summary` ikut

### Phase 6 — Kolom Simplifikasi (low risk, polish)
1. Rename kolom `attendance_raw` (Section 4) via `sp_rename`
2. Update code ref
3. DROP `attendance_imports.gang_code`, `parsed_employee_code`
4. Konsolidasi `employees` DB_PTRJ cols

### Phase 7 — Rename Tabel (future polish, documented)
- `attendance_raw` → `zk_scan_logs`
- `attendance_raw_users` → `zk_machine_users`
- `attendance_imports` → `attendance_daily`
- Documented di [[EXECUTION_PLAN]] Phase D. System functional tanpa rename.

---

## 6. Validation Queries (pre/post setiap phase)

```sql
-- Raw purity (target: 0)
SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME='attendance_raw'
  AND COLUMN_NAME IN ('parsed_employee_code','mapping_status','current_emp_code');

-- scan_map completeness (target: 808093)
SELECT COUNT(*), COUNT(current_emp_code) FROM scan_map;

-- resolution status distribution
SELECT resolution_status, COUNT(*) FROM scan_map GROUP BY resolution_status;

-- imports linked (target: turun dari 45034 null)
SELECT COUNT(*) FROM attendance_imports WHERE raw_scan_log_id IS NULL;

-- broken view (target: OK setelah fix)
SELECT TOP 1 * FROM vw_sync_latest_status;

-- endpoint smoke (all 200)
-- /api/dashboard/stats, /api/attendance/monthly-matrix?mode=database|datamesin
-- /api/monitoring/machine/:code/employees, /api/employees-comprehensive
```

---

## 7. Rollback Plan

| Phase | Rollback |
|-------|----------|
| 1 (drop view) | Recreate view dari git/migration history |
| 2 (backfill) | `UPDATE scan_map SET current_emp_code=NULL WHERE resolution_method='db_ptrj_hr_nik_cascade'` |
| 3 (drop cols) | `RESTORE DATABASE ... FROM DISK` (pre-phase backup) |
| 4-6 | `RESTORE DATABASE` atau `sp_rename` reverse |
| 7 (rename) | `sp_rename` reverse |

**Backup WAJIB pre Phase 3**: `BACKUP DATABASE rebinmas_absensi_monitoring TO DISK = N'...\pre_pure_raw_YYYYMMDD.bak'`

---

## 8. Pre-Deployment Checklist

- [ ] Full DB backup (`.bak`)
- [ ] Build clean (`npm run build`)
- [ ] Endpoint smoke test all 200
- [ ] Audit grep: 0 code baca processed cols dari `attendance_raw` langsung
- [ ] `scan_map` rows = `attendance_raw` rows (1:1)
- [ ] HR snapshot sync fresh (hr_reference updated)

## 9. Post-Deployment Checklist

- [ ] `attendance_raw` cols = 22 (pure)
- [ ] `scan_map.current_emp_code` NOT NULL count naik
- [ ] `vw_sync_latest_status` queryable
- [ ] `attendance_imports.raw_scan_log_id` null turun
- [ ] All endpoint 200
- [ ] Build clean
- [ ] Update memory `database-consolidation-final`

---

## 10. Prioritas Rekomendasi

| Prioritas | Phase | Effort | Impact |
|-----------|-------|--------|--------|
| P0 | Phase 1 (broken view) | 5 min | Fix binding error |
| P1 | Phase 2 (DB_PTRJ backfill) | 30 min | Data accuracy 15% employee |
| P2 | Phase 3 (raw pure) | 2 jam | Naming contract + storage |
| P3 | Phase 4-5 (view cleanup) | 1 jam | Remove mismatch |
| P4 | Phase 6 (kolom simplifikasi) | 3 jam | Professional schema |
| P5 | Phase 7 (rename tabel) | future | Polish |

**Rekomendasi**: Eksekusi P0-P2 sekarang (high impact, manageable risk). P3-P6 setelah verifikasi stabil. P7 future.
