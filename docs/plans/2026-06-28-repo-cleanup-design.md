# Repo Cleanup & Simplification Design

> Scope **B** (approved 2026-06-28). Safe cleanup + prune non-core features + merge route overlap.
> Goal: rapikan repo jadi profesional/sistematis, fokus fitur inti (Absensi, Mesin, Karyawan monitoring).
> Safety net: commit `b2040d3` pushed to origin (SSH). `git reset --hard b2040d3` = escape hatch.
> Related: [[DATABASE_FINAL_STATE]] [[FINAL_CLEANUP_PLAN]]

## 1. Current State (post-exploration)

### Bloat layers
| Layer | Count | Status |
|---|---|---|
| Root scratch (`_*.txt/.py/.js/.log/.md`, loose `.sql/.json`) | 40+ | Sampah, gitignore+hapus |
| `src/scripts/` | 90 | 8 dipakai, 82 dead |
| `src/api/routes/` | 26 files | 60% endpoint tak dipanggil frontend |
| Root planning `.md` | 17 | Konsolidasi ke `docs/archive/` |
| Migrations | 085 + dup 072/073 + deprecated 020/023/063-071 | Arsip |

### Scripts retained (verified referenced)
- `sync-machines` (scheduler, import-control, sync.routes spawn)
- `process-attendance-imports` (schedule.json job)
- `sync-hr-current-snapshot` (schedule.json job)
- `rebuild-attendance-imports` (CLI entry, scheduler fallback)
- `run-migrations` (npm db:migrate)
- `check-db` (npm db:check)
- `sync-employees-from-hr` (snapshot sync Step B)
- `seed-*` (npm seed scripts)

### Frontend wired pages (router.tsx)
Dashboard, Mesin, Absensi, Absensi/Matriks, Absensi/Live, Karyawan, Laporan(Quality), Laporan/mapping-quality, Laporan/clock-health, Notifikasi(Alert), Batch, Pengaturan.

### Frontend actual API calls (grep)
attendance, employees, employees-comprehensive, machines, monitoring/batches, monitoring/machine, quality/*, scheduler.
**Not called:** realtime, ops, dashboard, import/*, alert, reports, audit, mapping, division, cross-location, hr-sync.

## 2. Target Structure

```
Absensi_Muka/
├── src/
│   ├── api/routes/        # 12 file (1 domain = 1 file), dari 26
│   ├── modules/           # 6 domain tetap
│   ├── scripts/           # 8 CLI, dari 90
│   └── config/            # schedule.json + env
├── frontend/src/
│   ├── components/features/   # 6 page core, dari 11
│   └── services/              # 7 (sudah lean)
├── migrations/           # running 001-085 + archive/
├── docs/                 # final per topik + archive/
├── exports/              # gitignored
└── (root clean, 0 scratch)
```

## 3. Phases

### Phase 1 — Root Sampah (low risk, no behavior change)
- Gitignore: `_*.txt _*.py _*.sql _*.log _*.js _*.mjs`, loose `mig_*.sql migration_v2_*.sql`, `db-audit-results.json`, `tmp.json`, `*.log`.
- Hapus root scratch (40+ file).
- Pindah planning `.md` root (17) → `docs/archive/planning/`. Retain: `CLAUDE.md`, `AGENTS.md`, `README*`.
- Verify: `npm run build` clean, server start OK.

### Phase 2 — src/scripts (low risk)
- Hapus 82 dead script (list: semua `check-*, audit-*, backfill-*, analyze-*, compare-*, find-*, run-migration-0XX-*, test-*, verify-*, cleanup-scan-log-duplicates*, repair-*, deep-*, final-*, link-*, list-*, force-*, investigate-*, query-*, fetch-*, sanitize-*, connect-*, debug-*, run-zkteco-views-only, run-fix-mapping, run-live-compat-migration, run-current-empcode-migrations, run-employee-master-migrations, run-emergency-recovery*, run-057-migration, sync-zkteco-hr-mapping, sync-scheduler, add-imports-columns`).
- Retain 8 (section 1).
- Verify: build clean, schedule.json jobs resolve.

### Phase 3 — Route merge (medium, re-test endpoints)
Merge overlap jadi 1 file per domain:
- `realtime.routes.ts` + `realtime-status.routes.ts` → hapus (frontend tak panggil). Cek service ref dulu.
- `quality.routes.ts` + `quality-dashboard.routes.ts` → `quality.routes.ts`.
- `import.routes.ts` + `import-control.routes.ts` → `import.routes.ts`.
- `ops.routes.ts` + `monitoring.routes.ts` + `dashboard.routes.ts` → audit overlap, merge relevant ke `monitoring.routes.ts` / `dashboard.routes.ts`. Hapus `ops.routes.ts` jika tak dipanggil.
- Hapus dead route: `alert, reports, audit, mapping, division, cross-location, hr-sync` — **verify no frontend/external ref** sebelum hapus (cross-location mungkin dipakai service).
- Update `src/api/routes/index.ts` import list.
- Verify: build, hit tiap endpoint dipakai frontend → 200.

### Phase 4 — Frontend prune (medium)
Pangkas page non-inti dari router:
- Hapus `RealtimePage` + route `/absensi/live` (live feed mati, data sudah di matrix).
- Hapus `MachineClockHealthPage` + `/laporan/clock-health` (time-correlation resolve via raw_record_time).
- Hapus `BatchHistoryPage` + `/batch` (batch tracking unreliable per CLAUDE.md).
- Hapus `AlertPage` + `/notifikasi` (verify alert.routes dipanggil; jika tidak, hapus).
- Merge `MonitoringDashboard` ke `DashboardPage` (atau hapus `/monitoring` jika redundant).
- Merge `CurrentEmpCodeDashboard` ke `QualityPage`.
- Retain core: Dashboard, Mesin, Absensi, Absensi/Matriks, Karyawan, Pengaturan.
- Update `router.tsx` + nav (`Layout`).
- Verify: frontend build clean, tiap page render.

### Phase 5 — Docs + migration archive (low)
- `migrations/archive/`: pindah 020, 023, 063-071 (emergency, sudah jalan), 072/073 dup. Rename dup 072/073 ke `072b_/073b_` atau arsip.
- `docs/`: konsolidasi. Root planning → `docs/archive/planning/`. `docs/ai-context/` retain (masih relevan). `docs/final-architecture-cleanup/` retain.
- Update `CLAUDE.md`: hapus ref file/script yg sudah dihapus.

## 4. Non-Goals (YAGNI)
- Tidak pecah `attendance.routes.ts` 72KB (defer ke scope C).
- Tidak rename DB tabel (defer).
- Tidak ganti router/custom HTTP layer.
- Tidak sentuh DB schema (sudang clean via migration 077-085).
- Tidak add test framework (vitest sudah di devDeps tapi no tests — defer).

## 5. Verification Gate (per phase)
1. `npm run build` exit 0
2. `cd frontend && npm run build` exit 0
3. Server start, hit 1 endpoint per retained domain → 200
4. `git status` clean (kecuali changes phase tsb)

## 6. Rollback
Setiap phase = 1 commit. Kalau break: `git reset --hard <prev-commit>`.
Full rollback: `git reset --hard b2040d3`.
