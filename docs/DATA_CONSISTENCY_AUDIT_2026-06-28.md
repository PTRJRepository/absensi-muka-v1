# Data Consistency Audit — 2026-06-28

> Post-refactor audit per request user "periksa semua bug data tidak konsisten".
DB: `rebinmas_absensi_monitoring` @ 10.0.0.110. Audit via direct mssql query.

## Summary

| # | Bug | Severity | Affected | Status |
|---|---|---|---|---|
| B1 | Timezone: 19.548 rows `scan_time = raw_record_time` (ZERO_OFFSET) | Medium | 7 mesin (OFFICE_PGE 8183, MILL 6548, dst) | Known — WIB-naive machines |
| B2 | `scan_map.resolution_status` NULL 359 rows; 374 MAPPED but `current_emp_code` NULL | Low | 359+374 rows | Backfill migration 079 incomplete |
| B3 | `attendance_imports.raw_scan_log_id` ALL NULL (55053/55053) | Medium | 55.053 rows | Link backfill never ran |
| B4 | `attendance_machines.machine_record_count` ALL NULL (16/16) | Low | 16 mesin | Sync belum populate (known) |
| B5 | `attendance_imports.check_out_at` NULL 2978 rows | Info | 2.978 rows | INCOMPLETE_SCAN legit (1 scan/day) |
| B6 | `attendance_machines.timezone_mode` ALL NULL (16/16) | Low | 16 mesin | Profile never set |

## Detail & Root Cause

### B1 — Timezone ZERO_OFFSET (19.548 rows)
`raw_record_time = scan_time` (offset 0). 788.904 rows OK (+420min = WIB). Sumber: 7 mesin WIB-naive (OFFICE_PGE, MILL, OFFICE_APE, P1A, AB1, AB2, P1B).
- **Root cause**: mesin ini simpan waktu lokal WIB, `raw_record_time` dan `scan_time` sama.
- **Impact**: tidak bug untuk display (frontend pakai `raw_record_time` + toLocale WIB). Tapi konsistensi kolom `scan_time` inkonsisten antar mesin (ada +7, ada +0).
- **Memory note**: `timezone-double-offset-fix-2026-06-27` sudah fix query layer pakai `raw_record_time`.

### B2 — scan_map resolution gap (359 NULL + 374 MAPPED-no-empcode)
- 359 rows `resolution_status IS NULL` (sample: scan_log_id 808105, parsed G0605, MAPPED, tapi `current_emp_code` NULL).
- 374 rows MAPPED tapi `current_emp_code` NULL — NIK resolution cascade gagal untuk kode ini (new hires tidak di HR snapshot).
- **Root cause**: migration 079 backfill pakai JOIN `hr_reference`, kode tanpa NIK match → status NULL.

### B3 — imports.raw_scan_log_id ALL NULL (critical for traceability)
55.053/55.053 imports `raw_scan_log_id IS NULL`. View `vw_attendance_final` LEFT JOIN scan_map via kolom ini → 6.031 imports (55053-49022 linked via view) tidak bisa trace ke raw scan.
- **Root cause**: `rebuild-attendance-imports.ts` INSERT tidak set `raw_scan_log_id`. Memory note `pure-raw-implemented` bilang "99.9% linked" tapi itu via view JOIN, bukan kolom `attendance_imports` langsung.

### B4 — machine_record_count NULL (16/16)
Sync `getAttendances` belum jalan sejak kolom ditambah (migration 085). Populate saat sync berikutnya.

### B5 — check_out_at NULL (2978)
`INCOMPLETE_SCAN` (1 scan/hari) = legit, bukan bug.

### B6 — timezone_mode NULL (16/16)
Mesin tidak diprofile UTC vs WIB. B1 sebabnya.

## Recommended Fix (priority order)

1. **B3 backfill imports.raw_scan_log_id** — UPDATE `attendance_imports` SET `raw_scan_log_id` via JOIN scan_map on (employee_code, attendance_date). Traceability critical.
2. **B1 + B6 machine timezone profile** — detect UTC vs WIB per machine (sample raw_record_time vs local clock), set `timezone_mode` + normalize `scan_time`.
3. **B2 backfill scan_map resolution_status NULL** — 359 rows, re-run cascade JOIN hr_reference.
4. **B4 trigger sync** — populate machine_record_count (manual `node dist/scripts/sync-machines.js` per accessible machine).

## Non-Bugs (verified)
- imports orphan employee_id: 0 (clean)
- check_in_at NULL: 0 (clean)
- attendance_status: only HADIR/INCOMPLETE_SCAN (no MANUAL_REVIEW leftover)
- raw vs imports: 808.452 raw → 55.053 imports (aggregation by date expected, not 1:1)
