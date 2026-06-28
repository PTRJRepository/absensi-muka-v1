# Routes & HTTP Layer Audit — 2026-06-28

Scope: `src/api/` (router.ts, response.ts, middleware/auth.ts, routes/index.ts, 20 route files). Backend port 8004. Custom HTTP router (bukan Express/Fastify). Audit-only, no edits.

## Summary

- Total routes: ~99 across 20 files.
- Response helpers konsisten di mayoritas (`sendJson`/`sendError`/`sendEnvelope`), tapi 3 file manual `res.writeHead`+`res.end` (alert, import, realtime).
- Auth: all routes default `protected:true` via router.ts line 29, tapi `authMiddleware` (auth.ts line 13-23) **allow anonymous access** saat token invalid/missing — effectively no auth enforcement.
- Critical: `gangs` table DROPPED (migration 076 line 142) tapi masih di-JOIN 5 query → 500 saat dipanggil.
- Critical: SQL injection di `division.routes.ts` line 92-94 (string interpolation `${code}` langsung ke SQL).
- Critical: command injection di `sync.routes.ts` line 158 + `machine-employee.routes.ts` line 108 (PowerShell string interpolation dengan DB-sourced IP, tapi IP bisa tampered via DB).
- CLAUDE.md violation: correlated subquery helpers masih defined di `attendance.routes.ts` (dead code, tapi `rawDeviceUserIdLengthSql()` + `normalizeMatrixStatusSql()` masih aktif dipakai line 675/1017).

---

## P0 — Critical (fix segera, data loss/security/permanent 500)

### P0-1: `gangs` table DROPPED tapi masih di-JOIN → query 500

Table `gangs` di-drop migration `076_phaseA_drop_unused.sql` line 142. Tapi query berikut masih `LEFT JOIN gangs g ON g.id=e.gang_id`:

| File:Line | Route | Impact |
|---|---|---|
| `src/api/routes/attendance.routes.ts:1070` | `GET /api/attendance/monthly-matrix-traceable` | 500 saat dipanggil |
| `src/api/routes/attendance.routes.ts:1603` | `POST /api/attendance/corrections` | 500 saat insert correction |
| `src/api/routes/employees.routes.ts:41` | `GET /api/employees` | 500 list employees |
| `src/api/routes/employees.routes.ts:107` | `GET /api/employees/:id` | 500 detail |
| `src/api/routes/employees.routes.ts:168` | `POST /api/employees` | 500 insert (JOIN di SELECT subquery) |
| `src/api/routes/employees.routes.ts:176` | `PUT /api/employees/:id` | 500 update (gang_id lookup) |
| `src/api/routes/employees.routes.ts:365` | `GET /api/employees/:id/detail` (idType=id branch) | 500 detail |

Frontend pakai `/api/employees` + `/api/employees/:id/detail` + `/api/attendance/corrections` (employee-detail.service.ts, attendance-service.ts) → user-facing 500.

Fix: drop `LEFT JOIN gangs g ON g.id=e.gang_id` + `g.gang_code` dari SELECT. `gang_code` sudah deprecated (CLAUDE.md: gangs dropped phase 0A). Return `NULL AS gang_code` jika kolom masih diharapkan frontend.

### P0-2: SQL injection — `division.routes.ts:92-94`

```ts
${divisionCodes.map((code, i) => `
  SUM(CASE WHEN division_code = '${code}' THEN 1 ELSE 0 END) AS div_${i}_total,
  SUM(CASE WHEN division_code = '${code}' AND attendance_status = 'HADIR' THEN 1 ELSE 0 END) AS div_${i}_hadir
`).join(',')}
```

`code` dari `ctx.query.get('divisions')` (user input) di-interpolasi langsung ke SQL string. Walaupun `divisionCodes` sudah di-split+trim, tidak ada sanitasi terhadap `'` atau `;`. Attacker bisa inject via `?divisions=P1A',1);DROP TABLE--`.

Fix: pakai parameterized `@div${i}` di CASE WHEN (sudah dilakukan di WHERE clause line 96, tapi CASE WHEN line 92-94 lupa). Atau pivot di JS post-query.

### P0-3: Command injection — `sync.routes.ts:158` + `machine-employee.routes.ts:108`

`sync.routes.ts:158`:
```ts
`$connect = $tcp.BeginConnect('${host}', ${port}, $null, $null);`
```
`host` dari `machines.ip_address` (DB-sourced). Bukan user-input langsung, tapi jika DB compromised atau machine record di-tamper, IP bisa contain `'` → PowerShell injection. Same pattern `machine-employee.routes.ts:108`.

Risk: lower than P0-2 (DB-sourced, bukan user langsung), tapi tetap vulnerability. Escalate ke P0 karena command execution.

Fix: pass IP/port via PowerShell environment variables atau `-ArgumentList`, bukan string interpolation. Atau pakai `TcpAccessibilityService` (sudah ada di `tcp-accessibility.service.ts`, dipakai `ops.routes.ts` + `machines.routes.ts` — sudah benar).

---

## P1 — High (500 risk, inconsistency, dead code aktif)

### P1-1: `attendance.routes.ts` 72KB — pecah perlu?

72KB, 1658 baris, 13 route, ~30 helper function. Bukannya pecah file, tapi:
- 7 helper SQL builder (`resolvedEmployeeCodeSql`, `resolvedEmployeeNameSql`, `resolvedMappingReasonSql`, `matrixCurrentEmployeeCodeSql`, `matrixCurrentEmployeeNameSql`, `matrixCurrentHrLocCodeSql`, `resolvedHrLocCodeSql`) = **DEAD CODE** (defined line 103-200, hanya saling memanggil di `resolvedMappingReasonSql` def, tidak pernah dipanggil route — grep konfirmasi hanya line 192-193 internal).
- 2 helper masih aktif: `normalizeMatrixStatusSql` (line 675), `rawDeviceUserIdLengthSql` (line 1017).

Fix: hapus 7 dead helper (~100 baris). Recommend split `attendance.routes.ts` jadi `attendance-matrix.routes.ts` (matrix+traceable+cell, ~1200 baris) + `attendance.routes.ts` (daily+monthly+corrections+employee, ~450 baris) — defer, bukan P0.

### P1-2: Dead code branch — `attendance.routes.ts:396`

```ts
if (mode === 'database') {
  const result = await getProcessedMatrix(...);
  sendEnvelope(...);
  return;  // line 393
}
if ((mode as string) === 'database' && searchRaw.trim() !== '') {  // line 396 — UNREACHABLE
```

Branch line 396-559 tidak pernah dieksekusi (mode sudah pasti bukan 'database' di line 396 karena return di 393). 163 baris dead code.

Fix: hapus block 396-559, atau pindahkan search logic ke `getProcessedMatrix` service.

### P1-3: CLAUDE.md violation — correlated subquery masih dipakai

CLAUDE.md: "DO NOT re-introduce correlated subqueries (`resolvedEmployeeCodeSql()`, `resolvedMappingReasonSql()`, `resolvedEmployeeNameSql()`) di matrix/machine queries."

Status:
- `attendance.routes.ts`: helper DEFINED tapi tidak dipanggil route (dead, see P1-1). Tidak violasi aktif, tapi code presence = risk re-introduce.
- `machine-employee.routes.ts:29-87`: helper DEFINED + DIPANGGILL di route line 224-225, 241-245, 273-275, 294-298 (`resolvedEmployeeCodeSql()`, `resolvedEmployeeNameSql()`, `resolvedMappingReasonSql()`). **AKTIF VIOLASI**. Query `raw-data` + `user/:rawId/attendance` akan 30-50s timeout di 800k scan_logs.

Fix: pakai kolom langsung `sm.parsed_emp_code`/`sm.current_emp_code`/`sm.map_status` (sudah resolved saat import, per CLAUDE.md). Hapus 3 helper + 5 pemanggilan.

### P1-4: `quality-dashboard.routes.ts` — duplikat path + bug param type

Dua route duplikat dengan `quality.routes.ts`:
- `GET /api/quality/dashboard-summary` (quality-dashboard:12 vs quality:21)
- `GET /api/quality/daily-trend` (quality-dashboard:76 vs quality:88)

Router `routes.find()` (router.ts:51) return **first match**. `index.ts` import order: quality.routes.ts (line 7) sebelum ... tunggu, quality-dashboard.routes.ts TIDAK di-import di `index.ts`. File orphan — tidak pernah register route. Tapi kalau di-import, conflict.

Bug terpisah: `quality-dashboard.routes.ts:27,95` pakai `type: "NVarChar"` (string) bukan `sql.NVarChar` (mssql type object). Akan throw saat query dijalankan.

Fix: hapus `quality-dashboard.routes.ts` (orphan + duplikat). Servis sudah di `quality.routes.ts`.

### P1-5: `realtime.routes.ts` — response format inkonsisten + stat fetch salah

- 6 route SSE pakai manual `res.writeHead`+`res.write` (correct untuk SSE, bukan bug).
- Tapi `realtime/routes.ts:205-216` (`/api/realtime/stats`) + `222-241` (`/api/realtime/latest-scans`) + `247-273` (`/api/realtime/feed-stats`) pakai manual `res.writeHead`+`res.end` dengan `{ success: true, data }` — berbeda dari `sendJson` (yang pakai `{ success, data, message }`).
- `realtime.routes.ts:90` + `253`: `SELECT COUNT(*) as cnt FROM attendance_scan_logs` (tanpa WHERE) untuk `last_10_minutes`/`last_30_minutes`/`last_1_hour` — semua return total yang sama (total seluruh table). Salah semantik. Frontend `realtime/feed-stats` dapat data misleading.

Fix: pakai `sendJson` untuk non-SSE route. Fix query: `WHERE scan_time >= DATEADD(minute,-10,GETDATE())` etc.

### P1-6: `alert.routes.ts` — swallow error jadi success

3 endpoint (line 36-39, 64-67, 141-144, 157-160) catch error lalu return `200` dengan `{ success: true, data: [] }`. Masking failure jadi empty success. Frontend tidak tahu ada error.

Fix: return `sendError(res, 500, ...)` di catch. Atau log + return empty dengan status 200 tapi `success: false`.

### P1-7: `import.routes.ts` — response format inkonsisten + orphan-ish

3 route pakai manual `res.writeHead`+`res.end`. Frontend grep tidak temukan pemanggilan `/api/import/preview|upload|formats` (legacy manual import UI). Kemungkinan orphan (tidak dipakai frontend React). `ManualImportService` instantiate `SqlClient` dengan `GATEWAY_URL` env — Gateway API tidak ada (CLAUDE.md: "There is NO IT Solution API").

Fix: verifikasi apakah dipakai. Kalau orphan, hapus file. Response kalau dipertahankan: pakai `sendJson`/`sendError`.

---

## P2 — Medium (missing validation, consistency, minor 500 risk)

### P2-1: `parseInt` tanpa radix + tanpa NaN guard

Beberapa file pakai `parseInt(val)` tanpa radix 10 dan tanpa `|| default`:
- `division.routes.ts:35,36,199,200,353,354,356`
- `machine-employee.routes.ts:218,219,265`
- `monitoring.routes.ts:223,224,292`
- `quality.routes.ts:22,89,139,194,234,290,377`
- `alert.routes.ts:81,102,133`
- `realtime.routes.ts:223`

Risk: `parseInt('abc')` = NaN → `OFFSET NaN ROWS` SQL error 500. `attendance.routes.ts` + `employees.routes.ts` sudah benar pakai `Number()` + `Math.max`/`Math.min` guard.

Fix: `parseInt(val, 10) || default` atau `Math.max(parseInt(val,10)||1, 1)`.

### P2-2: `ctx.params.id` ke BigInt tanpa validasi

`monitoring.routes.ts:273,285`, `import-control.routes.ts:145,158,185,219`, `sync.routes.ts:128`: `value: id` (string) ke `sql.BigInt`. Kalau `id` bukan numeric → SQL error 500.

Fix: `Number(id)` atau `parseInt(id,10)` + validasi.

### P2-3: `machines.routes.ts` — subquery di SELECT tanpa TOP

`machines.routes.ts:88-109`: 4 correlated subquery di SELECT list (`COUNT(*)`, `quality_score`, `unmapped_count_7d`) per machine. Untuk 16 mesin = 64 subquery scan `attendance_scan_logs` (800k rows). Tidak ada `TOP` di subquery, tidak ada index hint. Potential slow.

Fix: pakai LEFT JOIN aggregate (sudah dilakukan di `ops.routes.ts:67-77` — contoh benar). Atau materialize ke tabel.

### P2-4: `dashboard.routes.ts:38` — `CAST(scan_time AS DATE) = CAST(GETDATE() AS DATE)`

Non-sargable. Index di `scan_time` tidak terpakai, full scan 800k rows. Frontend `ops-service.ts:11` panggil `/api/dashboard/stats` di dashboard load.

Fix: `WHERE scan_date = CAST(GETDATE() AS DATE)` (scan_date sudah ada, lihat monitoring.routes.ts pakai scan_date).

### P2-5: `quality.routes.ts` — query `!= 'MAPPED'` tanpa index

Multiple `WHERE mapping_status != 'MAPPED'` (line 31,43,59,108,120,171,299,301,320,334,386). Non-sargable. 800k scan_logs full scan.

Fix: tambah filtered index `WHERE mapping_status != 'MAPPED'` atau pakai computed column. Defer (DBA task).

### P2-6: `monitoring.routes.ts:36-40` — `sm.parsed_emp_code` di JOIN condition

```sql
COUNT(DISTINCT sm.parsed_emp_code) AS unique_employees
FROM attendance_raw s
LEFT JOIN scan_map sm ON sm.scan_log_id = s.id
WHERE s.scan_date = @today AND sm.parsed_emp_code IS NOT NULL
```

LEFT JOIN + WHERE di right table column = effectively INNER JOIN. Bukan bug tapi misleading. Kalau `scan_map` row missing, scan tidak dihitung.

Fix: pindahkan `sm.parsed_emp_code IS NOT NULL` ke JOIN ON clause, atau eksplisit INNER JOIN.

### P2-7: `scheduler.routes.ts:148` — status selalu 'IDLE'

```ts
status: activeJobs.length > 0 && config.enabled ? 'IDLE' : 'IDLE'
```

Ternary dengan branch identik. Bug logic — seharusnya `'RUNNING'` saat ada active job.

Fix: `? 'RUNNING' : 'IDLE'`.

### P2-8: `server.ts:34` — path traversal guard lemah

```ts
const safe = path.normalize(url).replace(/^(\.\.[/\\])+/, '');
```

Hanya strip leading `../`. `path.normalize('/foo/../../etc/passwd')` = `/etc/passwd` (leading slash survive). Lalu `filePath.startsWith(PUBLIC_DIR)` guard (line 38) menahan. Tapi guard `startsWith` bisa bypass dengan symlink atau `PUBLIC_DIR\..\` di Windows.

Fix: pakai `path.resolve` + `path.relative`, reject kalau mengandung `..` atau starts with `/`.

---

## P3 — Low (style, minor inconsistency, documentation)

### P3-1: Response format inkonsisten cross-file

| Pattern | Files |
|---|---|
| `sendJson` (success: true, data, message) | mayoritas |
| Manual `{ success: true, data }` | alert, import, realtime |
| `sendEnvelope` (success, data, meta, errors) | attendance-matrix, ops, employees-comprehensive |
| Manual `{ success: false, error }` (string, bukan {code,message}) | alert.routes.ts:49,66,90,108 |

Frontend `api()` (lib/api.ts) asumsikan unwrap `{ success, data }`. `sendError` return `{ success:false, error:{code,message} }` tapi alert return `{ success:false, error: "string" }`. Inconsistent contract.

Fix: standardize semua ke `sendJson`/`sendError`/`sendEnvelope`.

### P3-2: `alert.routes.ts:53` — `id = Date.now()`

PK `app_configs.id` pakai `Date.now()` (ms epoch). Bukan auto-increment. Collision risk jika 2 insert dalam 1ms. Schema `app_configs.id` (migration 002:270) — cek apakah auto-increment. Kalau ya, `Date.now()` override identity column.

Fix: pakai `SCOPE_IDENTITY()` atau omit `id` dari INSERT.

### P3-3: `auth.routes.ts:15` — logout no-op

`POST /api/auth/logout` hanya return `{ loggedOut: true }`, tidak invalidate token. Token-based (JWT) stateless, jadi no-op acceptable, tapi sebaiknya document.

### P3-4: `import.routes.ts:16-19` — instantiate service di module load

`new SqlClient(...)` + `new ManualImportService(...)` di top-level module. Kalau env var missing, throw saat import → crash server boot. Other routes lazy-instantiate.

Fix: pindah ke dalam handler atau guard dengan try/catch.

### P3-5: Public HTML legacy (12 file) — orphan

`src/public/*.html` (dashboard, machines, data-quality, division-analysis, scheduler, import-history, machine-compare, machine-detail, machine-employees, login, index, _layout) diserved via `server.ts:serveStatic`, tapi grep tidak temukan panggilan `/api/` dari HTML. Legacy UI yang tidak terpakai (frontend React pakai Vite, port 5173, terpisah).

Fix: hapus `src/public/` kalau memang dead. Atau document sebagai fallback static.

### P3-6: `attendance.routes.ts:868` — `OPTION (MAXRECURSION 370)`

Recursive CTE `calendar_days` (line 947-952) generate 30-31 hari. MAXRECURSION 370 cukup (max 31 hari), tapi magic number. Komentar: 370 = safety margin untuk max 31 hari + buffer.

### P3-7: `quality.routes.ts:604-670` — clock correction routes tanpa auth

3 POST route (`preview-correction`, `apply-correction`, `rollback`) modify attendance data via `TimeCorrectionService`. Tidak ada `requireAnyRole` check. Default `protected:true` tapi `authMiddleware` allow anonymous (P0-4). Effective: anonymous bisa apply clock correction.

Fix: tambah `requireAnyRole(ctx, ['IT_ADMIN','HR_ADMIN'], 'clock correction')`.

### P3-8: `machine-employee.routes.ts:90-129` — PowerShell latency bug

Line 110: `$lat = $tcp.Connected ? ${Date.now()} - ${start} : $null`. `${Date.now()}` di-interpolasi saat string build (server side), bukan saat PowerShell execute. Latency always = (build time - start) ≈ 0. Frontend dapat latency 0ms palsu.

Fix: hitung latency di PowerShell: `$lat = (Get-Date) - $start` atau pakai `Stopwatch`. Atau pakai `TcpAccessibilityService` (sudah ada, benar).

---

## Dead Endpoint / Orphan Check (frontend usage)

Frontend (`frontend/src/`) grep API path:

| Endpoint | Frontend used? | Status |
|---|---|---|
| `/api/alerts/rules`, `/api/alerts/active` | Ya (AlertPage.tsx) | Aktif |
| `/api/alerts/history`, `/api/alerts/run`, `/api/alerts/defaults`, `/api/alerts/defaults/seed` | Tidak | Orphan (opsional untuk admin) |
| `/api/quality/dashboard-summary`, `/api/quality/daily-trend` | Tidak langsung (quality-service pakai `summary`/`unmapped`/`duplicates`/`report`/`machine-drift`) | `quality-dashboard.routes.ts` orphan file |
| `/api/employees-comprehensive/*` | Ya (employee-comprehensive.service.ts) | Aktif |
| `/api/attendance/monthly-matrix`, `/api/attendance/monthly-matrix/cell` | Ya (attendance-service.ts) | Aktif |
| `/api/attendance/monthly-matrix-traceable` | Tidak | Orphan (tidak dipanggil frontend) |
| `/api/attendance/corrections` (GET/POST/PUT/DELETE) | Tidak ditemukan | Orphan (opsional admin) |
| `/api/attendance/employee/:code`, `/api/attendance/employee/:code/raw` | Ya (AttendancePage, api.ts) | Aktif |
| `/api/ops/*` | Ya (ops-service.ts) | Aktif |
| `/api/realtime/*` (SSE + stats + latest-scans + feed-stats) | Tidak ditemukan | Orphan (legacy real-time, frontend pakai polling) |
| `/api/dashboard/*` | Ya (ops-service.ts:11 `/api/dashboard/stats`) | `/api/dashboard/summary`, `/div-summary`, `/sync-status` orphan |
| `/api/scheduler/status`, `/api/scheduler/config`, `/api/scheduler/sync-all`, `/api/scheduler/sync/:code` | Ya (SchedulerStatus, machine-service) | Aktif |
| `/api/scheduler/jobs` (GET/POST/PUT/DELETE), `/api/scheduler/jobs/:name/run` | Tidak ditemukan | Orphan (opsional admin) |
| `/api/import/trigger`, `/api/import/schedule`, `/api/import/batch/:id/*` | Tidak (import-control) | Orphan (opsional admin) |
| `/api/import/preview`, `/api/import/upload`, `/api/import/formats` | Tidak | Orphan (legacy manual import, ManualImportService pakai gateway yang tidak ada) |
| `/api/monitoring/machine-ping` | Tidak | Orphan |
| `/api/monitoring/machine/:code/employees`, `/raw-data`, `/user/:rawId/attendance`, `/employees/:code/map` | Ya (api.ts:103,125,194) | Aktif |
| `/api/monitoring/sync/:code`, `/sync-all`, `/sync-status/:id` | Tidak (sync.routes.ts) | Orphan (frontend pakai `/api/scheduler/sync-all`) |
| `/api/monitoring/*` (dashboard, machines, batch, quality, division-summary) | Tidak langsung | Opsional (ops-service pakai `/api/ops/*` + `/api/dashboard/stats`) |
| `/api/machines`, `/api/machines/failures`, `/api/machines/:code/test-connection`, `/test-tcp` | Ya `/api/machines` + `/test-connection` (MachinesPage) | `/api/machines/failures` + `/test-tcp` orphan |
| `/api/employees` (list, :id, POST, PUT, :code/machines, master-clean, by-nik, :id/detail) | Ya (:id/detail, by-nik) | List/POST/PUT/master-clean orphan-ish (frontend pakai employees-comprehensive) |
| `/api/divisions`, `/api/divisions/compare`, `/:code`, `/:code/attendance`, `/:code/machines`, `/:code/scans` | Tidak ditemukan | Orphan (frontend tidak ada division page) |
| `/api/auth/login`, `/logout`, `/me` | Tidak ditemukan di service file | Mungkin via direct fetch (cek login page) |

Orphan = tidak berarti hapus. Bisa admin/ops tool. Tapi kalau dead + response format inkonsisten + bug, kandidrat hapus.

---

## File Summary

| File | Size | Routes | Key issue |
|---|---|---|---|
| `router.ts` | 2.7K | (core) | OK — clean impl, body limit 1MB, Zod catch |
| `response.ts` | 1.2K | (core) | OK — 3 helper konsisten |
| `middleware/auth.ts` | 1.7K | (core) | **P0: allow anonymous on protected** |
| `routes/index.ts` | 551B | (loader) | 20 file import, `quality-dashboard` TIDAK di-import (orphan) |
| `attendance.routes.ts` | 70.5K | 13 | P0 gangs JOIN, P1 dead code 396-559 + 7 helper, P3 no-auth corrections |
| `division.routes.ts` | 15.0K | 6 | **P0 SQL injection line 92-94**, P2 parseInt |
| `machine-employee.routes.ts` | 17.5K | 4 | **P1 correlated subquery aktif**, P0 cmd injection line 108, P3 latency bug |
| `monitoring.routes.ts` | 16.5K | 7 | P2 LEFT JOIN+WHERE, P2 BigInt no validate |
| `quality.routes.ts` | 25.8K | 16 | P2 `!= 'MAPPED'` non-sargable, P3 no-auth clock correction |
| `quality-dashboard.routes.ts` | 3.9K | 2 | **P1 orphan + duplikat path + bug param type** |
| `employees.routes.ts` | 20.2K | 8 | **P0 gangs JOIN 5 titik**, P2 parseInt ok |
| `employees-comprehensive.routes.ts` | 6.7K | 4 | OK — clean, try/catch, sendEnvelope |
| `ops.routes.ts` | 11.0K | 3 | OK — TCP test real-time, sendEnvelope |
| `machines.routes.ts` | 9.4K | 4 | P2 correlated subquery di SELECT, OK |
| `dashboard.routes.ts` | 2.7K | 4 | P2 non-sargable CAST scan_time |
| `scheduler.routes.ts` | 8.1K | 8 | P2 status selalu 'IDLE' line 148 |
| `sync.routes.ts` | 6.6K | 4 | **P0 cmd injection line 158**, orphan |
| `import.routes.ts` | 3.6K | 3 | P1 orphan + gateway tidak ada + manual response |
| `import-control.routes.ts` | 6.5K | 6 | P2 BigInt no validate, OK |
| `alert.routes.ts` | 7.8K | 9 | P1 swallow error, P3 Date.now() PK, manual response |
| `realtime.routes.ts` | 8.6K | 6 | P1 stats query salah semantik, orphan, manual response |
| `auth.routes.ts` | 932B | 3 | P3 logout no-op |
| `attendance-process.routes.ts` | 1.3K | 3 | OK — thin wrapper service |

---

## Rekomendasi Prioritas

1. **P0-1 gangs JOIN**: hapus 7 titik `LEFT JOIN gangs` + `g.gang_code` → return NULL. Sekali fix, 7 endpoint 500 hilang.
2. **P0-2 SQL injection division**: parameterize CASE WHEN line 92-94.
3. **P0-3 cmd injection**: hapus PowerShell string interp di sync.routes + machine-employee, pakai `TcpAccessibilityService` (sudah ada).
4. **P1-3 correlated subquery machine-employee**: ganti `resolvedEmployeeCodeSql()` → `sm.parsed_emp_code`/`sm.current_emp_code` langsung. Fix 30-50s timeout.
5. **P1-1 + P1-2 dead code attendance**: hapus 7 helper (~100 baris) + block 396-559 (~163 baris) = -263 baris.
6. **P1-4 quality-dashboard**: hapus file orphan.
7. **P2-1 parseInt**: batch fix `parseInt(val,10) || default`.
8. **P3-5 public html**: verifikasi dead, hapus kalau ya.

Total estimasi diff: ~-400 baris dead code + ~50 baris fix. Tidak ada new file, tidak ada new dependency.
