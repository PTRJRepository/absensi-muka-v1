# Backend Services Audit — 2026-06-28

Audit `src/modules/` untuk bug + inkonsistensi + code smells. Sistem absensi ZKTeco, DB SQL Server `rebinmas_absensi_monitoring`, sync mesin→DB satu arah. Post refactor cleanup + migration 086.

Metode: 6 subagent paralel per domain (attendance, employees, import, machines, scheduler+monitoring, cross-cutting). Temuan dikonsolidasi, dedup, urut severity.

---

## Ringkasan Eksekutif

| Severity | Count | Tema dominan |
|---|---|---|
| P0 | 17 | Tabel/kolom dropped masih diref; SQL injection; race condition scheduler; correlated subquery dilarang CLAUDE.md dire-intro |
| P1 | 23 | Dead code cluster query dropped tables; silent failure; deactivate logic bug; duplikasi parser SSOT |
| P2 | 28 | Hardcoded IP/secret; UTC vs WIB; SQL injection pattern; null gap |
| P3 | 30+ | YAGNI; code smell; inkonsistensi naming |

**Top 3 fix mendesak:**
1. Scheduler no PID tracking + no boot-time reaper → stuck RUNNING kambuh (P0, root cause memory "9 stuck batches").
2. `attendance-process-import.service.ts` query tabel/kolom salah (`hr_reference` tidak ada; `e_curr_hr.emp_name`/`loc_code`/`hr_status` tidak ada) → pipeline throw (P0).
3. `employee-comprehensive.service.ts` re-intro `resolvedEmployeeCodeSql()` correlated subquery dilarang CLAUDE.md + ref kolom non-existent → 500/timeout (P0).

**Verifikasi CLAUDE.md "NO IT Solution API / api-attendance-import.service.ts DEPRECATED":**
- File `api-attendance-import.service.ts` TIDAK ditemukan di `src/` (sudah dihapus dari disk). 0 kode aktif referensi.
- Residu konsep `API_ONLY`/`DIRECT_AND_API` masih di `machine.service.ts:43-45,145` + `machine.repository.ts:100` + `import-job.service.ts:257` (branch `API` dead). Hapus.

---

## P0 — Critical (produksi rusak / data salah / crash)

### Scheduler

- **scheduler.service.ts:94,143,202** | P0 | `spawn('node', args)` tanpa PID tracking + `detached:false`. `stopAll()`/`stopJob()` cuma `clearInterval`, child process tetap jalan. Scheduler restart = double-spawn (interval baru + child lama). | Fix: simpan `proc`/`pid` di `runningJobs`, `proc.kill('SIGTERM')` di stopAll/stopJob.

- **scheduler.service.ts:104-106,156-158,215-217** | P0 | `proc.on('error')` cuma log, exit code non-zero tidak update job status. Spawn failure tidak diketahui operator. = pattern memory "9 stuck RUNNING batches". | Fix: track `proc` di Map, `close` handler set job status FAILED + clear dari runningJobs + saveConfig.

- **scheduler.service.ts:230-246** | P0 | `startAll()` tidak ada reaper/timeout utk stuck RUNNING batches di `attendance_import_batches`. Root cause stuck batch tidak di-fix, akan kambuh. | Fix: boot-time reaper: `UPDATE attendance_import_batches SET status='FAILED' WHERE status='RUNNING' AND started_at < DATEADD(minute,-30,GETDATE())`.

### Attendance

- **attendance-process-import.service.ts:130,281,383** | P0 | Query tabel `hr_reference` TIDAK ADA di schema. Tabel aktual = `hr_employee_current_snapshot` (migration 051). Setiap sync pipeline throw `Invalid object name 'hr_reference'`. | Fix: Ganti `hr_reference` → `hr_employee_current_snapshot`.

- **attendance-process-import.service.ts:118-120,154-156,273-278,416-418** | P0 | Kolom salah: SELECT `e_curr_hr.emp_name`/`loc_code`/`hr_status`, `h.current_emp_name`/`current_loc_code`/`current_status` — schema 051 hanya `current_emp_name`/`current_loc_code`/`current_status`. Tidak ada `emp_name`/`loc_code`/`hr_status`/`type`. Query error. Juga SELECT vs GROUP BY kolom mismatch (L118 vs L154). | Fix: Pakai nama kolom eksak; drop filter `type='current'`.

- **attendance-rebuild.service.ts:7,13,25,38,42** | P0 | Query `WHERE machine_code = @machineCode` + INSERT `machine_code` ke `attendance_imports`. Schema 053: kolom `machine_code` TIDAK ADA (hanya `source_reference`). Seluruh `rebuildImports()` error `Invalid column name 'machine_code'`. | Fix: Ganti `machine_code` → `source_reference` di seluruh query.

- **attendance-rebuild.service.ts:41** | P0 | `OFFSET ${offset} ROWS` tanpa `ORDER BY`. SQL Server wajib ORDER BY untuk OFFSET. Query error sintaks. | Fix: Tambah `ORDER BY s.scan_date, COALESCE(s.current_emp_code, s.parsed_employee_code)` sebelum OFFSET.

### Employees

- **employee.repository.ts:5,32,44,56,79,95,113,128,139,152,164** | P0 | Seluruh repo target `mst_employee` (table dropped di konsolidasi 65→12) + kolom `employee_id`/`emp_code`/`current_division_id`/`is_active` — zero match schema `employees`. | Fix: Hapus file atau rewrite vs `employees`.

- **employee.repository.ts:35,90,142** | P0 | SQL injection: `emp_code = '${empCode}'`, `emp_name LIKE '%${name}%'` — user input concat langsung ke WHERE. | Fix: Parameterize `@empCode`/`@name`.

- **employee-comprehensive.service.ts:93-104** | P0 | `resolvedEmployeeCodeSql()` correlated subquery RE-INTRODUCED — CLAUDE.md eksplisit larang (timeout 30-50s di 800k scan_logs). Dipakai 8x: L154,168,173,174,190,195,196. | Fix: Pakai kolom resolved-at-import `s.current_emp_code`/`s.parsed_employee_code`/`s.mapping_status` langsung.

- **employee-comprehensive.service.ts:162-166,218-219,259-265,298,312-313,412-417,438-440** | P0 | Kolom `employees` non-existent masih diref: `e.machine_codes`, `e.batch_import`, `e.mapping_status`, `e.zkteco_user_name` (schema: `zkteco_user_id`), `e.raw_device_user_id`, `e.is_active`, `e.hr_employee_code` → query 500. | Fix: Drop alias atau NULL-AS-name; verify via `INFORMATION_SCHEMA.COLUMNS`.

- **employee-movement.service.ts:141-145** | P0 | `recordDivisionChange` UPDATE `mst_employee.current_division_id` — table dropped + kolom salah (employees pakai `division_id`). | Fix: Target `employees`+`division_id`, atau hapus method.

- **current-employee-resolution.service.ts:551,593** | P0 | SQL injection di IN-clause: `parsedCodes.map(code => \`'${code.replace(/'/g, "''")}'\`).join(',')` — manual quote-escape saja. | Fix: Parameterized `IN (@p0,@p1,...)` atau `string_split(@csv,',')`.

- **current-employee-resolution.service.ts:27-28** | P0 | Hardcoded `HR_DB_SERVER ?? '10.0.0.110'` + `DB_PTRJ.dbo.HR_EMPLOYEE` hardcoded. Fresh deploy tanpa env → 500. | Fix: Add `HR_DB_NAME` env; fail fast via Zod.

### Machines

- **machine.repository.ts:64** | P0 | `findByCode` interpolasi `machineCode` string langsung ke WHERE: `machine_code = '${machineCode}'`. Input `'x'; DROP TABLE mst_machine;--` dieksekusi. | Fix: Parameterize `@machineCode`.

### Monitoring

- **monitoring.routes.ts:36-41,107-111,137-145,166-178,281-285** | P0 | Dashboard endpoint query `attendance_raw` + `scan_map` — tapi quality.routes.ts:28 pakai `attendance_scan_logs`. Inkonsistensi 2 nama utk tabel sama. Kalau `attendance_raw` tabel terpisah = dual-write risk. | Fix: Verify `attendance_raw` is view over `attendance_scan_logs` (atau rename ke `attendance_scan_logs`).

### Cross-cutting

- **src/shared/database/sql-client.ts:82-160** | P0 (treat as P1 — file vestigial) | Helper SqlClient (`insert`/`update`/`delete`/`select`/`batchInsert`) build SQL via interpolasi `${table}`/`${columns}`/`${where}` — injection penuh pada nama tabel/kolom/WHERE. 0 penggunaan aktif (kode aktif pakai `src/lib/db.ts` parameterized). | Fix: Hapus file.

---

## P1 — High (bug logika / silent failure / deprecated active)

### Attendance

- **attendance-raw.repository.ts (seluruh file, 406 baris)** | P1 | Dead code cluster (file header acknowledge): query tabel DROPPED — `attendance_raw_log`, `mst_machine`, `machine_user_map`. 0 route mount. | Fix: Hapus file. Akses raw langsung ke `attendance_scan_logs`.

- **attendance-reconcile.service.ts (seluruh file, 419 baris)** | P1 | Query tabel DROPPED: `attendance_daily_process`, `attendance_process_detail`, `mst_machine`, `api_attendance_raw` (CLAUDE.md: NO IT Solution API), `mst_division`, `attendance_division_reconcile`. | Fix: Hapus file.

- **attendance-process.service.ts (seluruh file, 328 baris)** | P1 | Query tabel DROPPED: `attendance_raw_log`, `mst_employee`, `attendance_daily_process`, `attendance_process_detail`, `mst_machine`, `mst_division`. | Fix: Hapus file. Processing sekarang di `attendance-process-import.service.ts`.

- **attendance-reconcile.service.ts:68-69,119,208,250,263,399,406** | P1 | SQL injection: `${this.formatDate(...)}`, `'${empCode}'`, `'${locCode}'`, `${process.process_id}`, `${machineId}`, `${employeeId}` di string concat. | Fix: Parameterized. (Moo tetap hapus file.)

- **attendance-raw.repository.ts:64,79,92-95,132,153,264-266,292-293,327** | P1 | SQL injection: `'${empCode}'`, `'${machineCode}'`, `${machineId}`, `${sampleSize}`, `${limit}`, `${recordTime.toISOString()}`. | Fix: Parameterized. (Tetap hapus file.)

- **attendance-process.service.ts:94,119,146,287,313** | P1 | SQL injection: `'${empCode}'`, `'${this.formatDate(workDate)}'`, `${employeeId}`, `${machineId}`, `${processId}`. | Fix: Parameterized. (Tetap hapus file.)

- **attendance-process-import.service.ts:86-158,311-421** | P1 | Race condition / double-process: `NOT EXISTS` dedup check + INSERT tanpa transaction. Scheduler (60 min) + manual `POST /api/ops/sync` + `rebuild-attendance-imports` concurrent → duplicate insert / unique constraint violation. | Fix: `withTransaction` atau `MERGE`/unique constraint `UNIQUE(employee_code, attendance_date, source_reference)`.

- **attendance-process.service.ts:194,229** | P1 | `rawLogs.sort()` mutates input array in-place. Side effect ke caller. | Fix: `[...rawLogs].sort(...)`. (Tetap hapus file.)

- **attendance-process.service.ts:88** | P1 | `firstLog.emp_code` — rawLog dari `attendance_raw_log` schema punya `machine_user_id`, BUKAN `emp_code`. Property undefined → grouping gagal. | Fix: (Hapus file.)

### Employees

- **hr-employee-sync.service.ts:240-254** | P1 | Deactivate `NOT IN (SELECT LTRIM(RTRIM(EmpCode)) FROM HR_EMPLOYEE)` tanpa `WHERE EmpCode IS NOT NULL` — SQL NULL semantics bikin `NOT IN` return UNKNOWN untuk semua row → deactivate silent no-op kalau HR punya NULL EmpCode. | Fix: Tambah `WHERE EmpCode IS NOT NULL AND EmpCode != ''` atau switch `NOT EXISTS`.

- **hr-employee-sync.service.ts:251** | P1 | Deactivate compare `employee_code NOT IN (LTRIM(RTRIM(EmpCode)))` — no UPPER(), padahal L138/155 local codes di-uppercase → case mismatch → employee keliru di-deactivate. | Fix: `UPPER(LTRIM(RTRIM(EmpCode)))` di subquery.

- **current-employee-resolution.service.ts:422-432** | P1 | `parseRawDeviceUserId` duplikat parser SSOT — inline scanner→locCode map (100→A..900→G) **hilangkan IJL (001→L)** + skip 6/7-digit rules SSOT punya. IJL raw ID `0010022`→`L0022` return null → `NEED_REVIEW_CURRENT`. | Fix: Hapus fungsi, import `parseZktecoUserIdToEmployeeCode` dari `mapping/zkteco-employee-code-parser.ts`.

- **current-employee-resolution.service.ts:25-28** | P1 | Header "DEPRECATED SERVICE" tapi `lookupHrEmployeeByEmpCode`/`batchResolveFromDb` masih query live linked-server `HR_EMPLOYEE`. Pipeline sekarang pakai `hr_reference` (local synced, tapi lihat P0 — tabel salah juga). | Fix: Hapus service (dead code) atau repoint.

- **current-employee-resolution.service.ts:742-747,749-751** | P1 | `getResolutionStats` query `dbo.hr_employee_current_snapshot` + `dbo.employee_code_history` — dua-duanya sudah di-merge ke `hr_reference` (kolom type). Throw "invalid object name" runtime. | Fix: `SELECT COUNT(*) FROM hr_reference WHERE type='current'`.

- **current-employee-resolution.service.ts:287-290** | P1 | Log `status=NIK_NOT_FOUND` sebelum panggil `lookupCurrentSnapshotByNik` — NIK ketemu tapi log bilang not found. Mislead debug. | Fix: Ganti `PARSED_ONLY` + step `lookup_snapshot`.

- **current-employee-resolution.service.ts:588** | P1 | Filter `.filter(([code]) => !notFoundInHr.has(code) && hrEmployeeMap.get(code))` exclude empty-NIK codes dari `niksToLookup` → branch L617-631 (handle empty NIK) jadi unreachable. Empty-NIK codes gak dapat result row → silent data drop. | Fix: Jangan pre-filter; iterate semua `hrEmployeeMap`, branch `!nik` di dalam loop.

- **employee-comprehensive.service.ts:235,328,485** | P1 | `total = Number(rows[0]?.total ?? 0)` — total dari row pertama page current. Kalau page out-of-range (rows empty) → total 0 → frontend bilang "no data" padahal data ada di page lain. | Fix: Separate `SELECT COUNT(*)` atau clamp page.

- **employee-comprehensive.service.ts:374-400** | P1 | KPI campur unit: `mapped`/`need_review` `SUM(CASE...)` per-row, `totalUsers` `COUNT(DISTINCT machine:raw_id)`. `mappedCount` bisa > `totalUsers`, persentase salah. | Fix: `COUNT(DISTINCT CASE WHEN parsed IS NOT NULL THEN machine:raw_id END)`.

- **employee-comprehensive.service.ts:472** | P1 | `getEmployeeScans` match `s.parsed_employee_code = @employeeCode` — inkonsisten vs cascade (CLAUDE.md: pakai `current_emp_code`, resolved saat import). New hires null parsed gak match. | Fix: `WHERE s.current_emp_code = @employeeCode OR s.parsed_employee_code = @employeeCode`.

- **employee-comprehensive.service.ts:93-104** | P1 | Cascade incomplete. Comment (L89-91) dokumentasi 3-step (parsed→zkteco_user_id→current_emp_code), implementasi cuma parsed→zkteco_user_id, skip current_emp_code. | Fix: Tambah `current_emp_code` ke COALESCE.

- **employee-movement.service.ts:1-6,50,61,93,112,165,191,213** | P1 | Target `employee_division_history` + `employee_daily_assignment` — kemungkinan dropped di konsolidasi 65→12. Verifikasi; kalau gone, service mati total. | Fix: `SELECT name FROM sys.tables WHERE name IN (...)`; kalau absent, hapus.

- **employee-movement.service.ts:151-198** | P1 | `setDailyAssignment` check-then-insert tanpa transaction — race condition, concurrent call insert duplikat. | Fix: `BEGIN TRAN` / `MERGE` + `HOLDLOCK`, atau unique constraint.

### Import

- **sync-orchestrator.service.ts:471** | P1 | Bug referensi tabel: enrichment JOIN ke `attendance_raw_users`, tetapi langkah 2 (baris 400) menyimpan pengguna ke `machine_user_raw`. Nama tabel berbeda → enrichment gagal/silently dilewati. | Fix: Ubah `INNER JOIN attendance_raw_users r` → `INNER JOIN machine_user_raw r`.

- **sync-orchestrator.service.ts (seluruh file)** | P1 | Dead code: SyncOrchestrator tidak di-instantiate di mana pun (grep `SyncOrchestrator` src/ hanya file ini). Scheduler berjalan via `node dist/scripts/sync-machines.js` (script terpisah). | Fix: Hapus service, atau hubungkan ke scheduler/server.ts.

- **direct-zkteco-import.service.ts:239** | P1 | Menulis ke `attendance_raw_log` — tabel TIDAK ADA di skema konsolidasi. Ekspor `index.ts` masih expose service ini → 500 error jika dipanggil. | Fix: Hapus service (duplikasi total dengan SyncOrchestrator).

- **import-job.service.ts:128,157-159,176,194,226,238** | P1 | SQL injection: `updateBatchProgress`/`completeBatch`/`getSyncJob`/`getBatchesForJob` interpolasi `${batchId}`/`${syncJobId}`/`${errorVal}`. `errorVal` string dari error message → bisa berisi `'`. | Fix: Parameterized `@batchId`/`@syncJobId`/`@errorVal`.

- **sync-orchestrator.service.ts:355-389** | P1 | Connection leak ZKTeco: jika `fetchUsers`/`fetchAttendanceRecords` throw, `zkteco.disconnect()` baris 389 tidak tercapai. Tidak ada try/finally. TCP socket bocor. | Fix: try/finally, `disconnect()` di finally.

- **sync-orchestrator.service.ts:428-440** | P1 | Null-handling: `mssqlPool` opsional. Jika undefined → `console.warn` lalu skip insert attendance, tetapi batch tetap `completeBatch('SUCCESS')` (baris 533). Batch sukses tanpa data. | Fix: Jika mssqlPool undefined → `completeBatch('FAILED')` + return error.

### Machines

- **zkteco.service.ts:57-64** | P1 | `connect()` race condition: `setTimeout(resolve, 1000)` resolve success setelah 1s terlepas status socket. Kalo connect >1s → premature success. Timer leak (no clearTimeout). | Fix: Buang setTimeout hack, pakai event 'connect' socket native. `clearTimeout` di path error.

- **zkteco.service.ts:92-102,104-114** | P1 | `fetchUsers`/`fetchAttendanceRecords` return `{success:true, data:[]}` saat `this.client` null (connect belum/gagal) karena `this.client?.getUsers()` = undefined → fallback `[]`. Silent failure, sync report sukses datang kosong. | Fix: Guard awal: `if (!this.client) return {success:false, error:{code:'CONNECTION_REFUSED'}}`.

- **zkteco.service.ts:49-68** | P1 | Saat `connect()` gagal, `this.client` tidak di-null (line 49 assign, catch line 66 tidak null). Zombie reference dipakai fetchUsers berikutnya. | Fix: Di catch block: `this.client = null` sebelum return error.

### Monitoring

- **data-quality.service.ts (full file)** | P1 | DEPRECATED + dead (gak mount route). Tapi `AlertService` inject `DataQualityService` + `alert.service.ts:99` call `runAllChecks()` → `rawRepo.getUnmappedDeviceUsers()` query DROPPED `machine_user_map` (attendance-raw.repository.ts:178-179). AlertService 500 kalo dipanggil. | Fix: Hapus DataQualityService + AlertService + attendance-raw.repository.ts.

- **alert.service.ts:271-282** | P1 | `saveAlert` catch semua error, return 0, swallow. Alert FAILED gak persist → `getAlertHistory` return kosong. Silent data loss. | Fix: Rethrow atau log + return null.

- **summary.service.ts (full file)** | P1 | DEPRECATED + dead. Query `attendance_daily_process` (DROPPED), `mst_division`/`mst_estate`, `machine_user_map` (line 208, DROPPED). `api_record_count` field = ref IT Solution API (CLAUDE.md: NO IT Solution API). | Fix: Hapus file.

- **dashboard.service.ts (full file)** | P1 | DEPRECATED + dead. Query `mst_machine` (DROPPED, line 188), `attendance_raw_log` (DROPPED, line 197), `import_batch` (schema: `attendance_import_batches`), `attendance_division_reconcile`, `mst_employee` (schema: `employees`). Route pakai inline. | Fix: Hapus file.

- **anomaly.service.ts (full file)** | P1 | Dead (index.ts ekspor tapi gak ada route import). Query `attendance_daily_process` (DROPPED?), `mst_employee` (schema: `employees`). `detectAnomalies` N+1 query (line 57-61: loop + createAnomaly per row). | Fix: Hapus atau rewrite.

- **live-feed.service.ts:35-52,57-76** | P1 | Dead (gak ekspor index.ts, gak mount route). Query `attendance_scan_logs` + `employees` JOIN `parsed_employee_code = e.emp_code` — schema `employees.employee_code` (bukan `emp_code`). Kolom salah. | Fix: Hapus atau fix `emp_code`→`employee_code`.

- **live-feed.service.ts:166-188, dashboard.service.ts:171-205** | P1 | `getMachineStatus()` duplikat fungsi — 2 service query sama data. YAGNI. | Fix: Hapus salah (yang dead code).

- **scheduler.service.ts:281-312** | P1 | `startJob` branch `job.script` vs default — script job call `runCustomScriptJob`, default call `triggerSync`. Tapi `triggerSync` gak set `lastRun` di `close` handler (line 104-106 vs HR/script job line 160-168, 219-227). Inkonsistensi: machine sync gak persist lastRun. | Fix: Tambah `close` handler ke `triggerSync` set `job.lastRun` + saveConfig.

- **scheduler.service.ts:275** | P1 | `intervalMinutes * 60 * 1000` — setInterval drift. Job lambat > interval = overlap spawn. CLAUDE.md: 60min interval, sync bisa >60min jka 16 mesin timeout 30s. | Fix: recursive `setTimeout` atau guard `isRunning` flag sebelum spawn.

- **Schema inconsistency** | P1 | `emp_code` (live-feed.service.ts:47, dashboard.service.ts:226) vs `employee_code` (monitoring.routes.ts:159, quality.routes.ts:459, schema CLAUDE.md). 2 nama utk kolom sama. | Fix: Standardize `employee_code`.

- **employee.repository.ts:9-23** | P1 | `Employee` interface (`employee_id`, `emp_code`, `emp_name`, `employee_number`, `card_no`, `current_division_id`, `current_gang_id`, `employment_status`, `is_active`) — zero overlap schema `employees` asli. | Fix: Rewrite interface atau hapus file.

---

## P2 — Medium (timezone / hardcoded / SQL injection pattern / null gap)

### Timezone (raw_record_time UTC vs scan_time WIB)

- **time-correction.service.ts:28,99,112,116** | P2 | Double-offset bug: `applyCorrection` pakai `scan_time` untuk `DATEADD(MINUTE, @offsetMinutes, scan_time)`. CLAUDE.md + memory: `scan_time` SUDAH WIB (+7), `raw_record_time` = UTC asli. Tambah offset ke `scan_time` = double offset. | Fix: Koreksi dari `raw_record_time`, bukan `scan_time`.

- **monitoring.routes.ts:23,101,128,293** | P2 | `new Date().toISOString().split('T')[0]` — UTC date, bukan WIB. Hari bergantian UTC 00:00 = WIB 07:00. "Today" filter salah 7 jam. | Fix: WIB date helper.

- **live-feed.service.ts:106-109,171,177** | P2 | `new Date()` + `getTime() - X` utk time range — UTC, bukan WIB. Query `record_time >= '...'` banding UTC vs DB WIB. | Fix: WIB offset.

- **summary.service.ts:293, anomaly.service.ts:260-262, attendance-process.service.ts:326, attendance-raw.repository.ts:403, attendance-reconcile.service.ts:417, employee-movement.service.ts:270-272** | P2 | `formatDate` = `toISOString().split('T')[0]` — UTC. Off-by-one untuk date near midnight WIB. | Fix: Format WIB local tz.

### SQL injection pattern (string concat)

- **alert.service.ts:308, anomaly.service.ts:50,157,191, dashboard.service.ts:74,106,128,159,197,241,243,283, live-feed.service.ts:71,95,114-116,134,171,177, summary.service.ts:91,119,147,174,181,247,273, data-quality.service.ts:291-292** | P2 | Template literal `'${date}'`/`${empCode}`/`${lastId}`/`${limit}`/`${divisionId}` di SQL string. `empCode`/`lastId`/`limit` dari route. | Fix: Parameterized. (Sebagian besar di dead code — skip kalau hapus.)

- **employee-mapping.service.ts:282-296** | P2 | `verifyEmpCodeExists`: `employee_code = '${empCode}'` — no escape, no param. | Fix: Parameterize `@empCode`.

- **employee-movement.service.ts:213-222** | P2 | `SELECT TOP ${thresholdDays + 5}` + `WHERE employee_id = ${employeeId}` — number interpolation. | Fix: Validate `Number.isInteger` lalu parametrize.

- **employee-movement.service.ts:53,64-66,168,187** | P2 | Date string interpolation `work_date = '${formatDate(workDate)}'`. | Fix: Pass `sql.Date` param.

- **employee.repository.ts:47,59,120, machine.repository.ts:52,116,129,139** | P2 | Number interpolation `${employeeId}`/`${divisionId}`/`${machineId}`. Safe kalau typed, inkonsisten vs param convention. | Fix: Parametrize.

- **attendance-process-import.service.ts:317,429** | P2 | `SELECT TOP ${batchSize}` inline numeric. | Fix: Parameterized `@batchSize`.

### Hardcoded values (IP/secret/port/path)

- **zkteco.service.ts:54** | P2 | Password fallback literal `'12345'` di constructor ZKLib. Secret hardcoded di source. `env.ts:19` juga `ZKTECO_PASSWORD: z.string().optional()`. | Fix: Wajibkan env, hapus fallback.

- **src/scripts/sync-machines.ts:410** | P2 | `process.env.ZKTECO_PASSWORD ?? '12345'` — duplikasi fallback. | Fix: Hapus fallback; fail fast.

- **machine.service.ts:103** | P2 | `timeout: 30000` hardcoded. Env `ZKTECO_TIMEOUT_MS` sudah ada. | Fix: `timeout: env.ZKTECO_TIMEOUT_MS`.

- **scheduler.service.ts:128** | P2 | Hardcoded fallback `HR_DB_SERVER ?? '10.0.0.110'`. | Fix: Throw kalo `HR_DB_SERVER` undefined.

- **scheduler.service.ts:83,114** | P2 | Hardcoded path `dist/scripts/sync-machines.js` + `dist/scripts/sync-hr-current-snapshot.js`. | Fix: Konstanta top-level atau baca dari job config.

- **hr-employee-sync.service.ts:32, current-employee-resolution.service.ts:27** | P2 | `HR_DB_SERVER ?? '10.0.0.110'` hardcoded IP fallback (memory: hr-sync-hardcode-fixes noted tapi fallback masih ada). | Fix: Fail fast kalau env missing.

- **hr-employee-sync.service.ts:33** | P2 | `DB_PTRJ` hardcoded di linked-server path. | Fix: Env `HR_DB_NAME`.

- **src/config/env.ts:7,13,16** | P2 | Fallback `APP_ENV default 'development'`, `APP_PORT default 3000` (CLAUDE.md: `APP_PORT=8004` — default 3000 salah), `JWT_SECRET.min(8)` terlalu lemah. | Fix: Hapus default utk nilai sensitif; `.min(32)` utk JWT.

- **src/scripts/run-migrations.ts:27,30,32** | P2 | `dbConfig` fallback `10.0.0.110`/`1433`/password dari `DATABASE_PROFILES_*` — kredensial+host hardcode. | Fix: Hapus defaultValue, wajibkan env.

### Null-handling / silent failure

- **alert.service.ts:263-264** | P2 | `formatAlertMessage` gak handle `data.value`/`data.details` null — `undefined` string literal. | Fix: Null coalesce.

- **anomaly.service.ts:88,89,128,129** | P2 | `process.emp_code`/`process.work_date` null gap — `formatDate(process.work_date)` crash kalo null. `select('*')` return `any`. | Fix: Null check.

- **scheduler.service.ts:59-61,73-75** | P2 | `loadConfig`/`saveConfig` catch + log only, no throw. Config corrupt = scheduler silent default (enabled:true, 60min) — bahaya: 2 instance scheduler jalan. | Fix: Throw kalo JSON.parse fail.

- **attendance-process-import.service.ts:253-267,270-288** | P2 | Empty/warn-only catch: enrichment failure di-swalow dengan `console.warn`, pipeline lanjut tanpa data enrichment. Silent data gap. | Fix: Log + metric, atau throw.

- **attendance-process-import.service.ts:300-303,557-560,567,574,583** | P2 | Catch return generic `{success: false, errors: 1}` tanpa detail error. | Fix: Include `error.message`, log stack.

- **employee-mapping.service.ts:119-121,136-138,293-295** | P2 | Tiga `catch { return new Set()/Map()/{exists:false} }` swallow DB error → empty set → auto-mapping silent fail. No log. | Fix: `console.error` sebelum return empty.

- **hr-employee-sync.service.ts:303-305** | P2 | `catch { // Audit write failure is not critical }` swallow audit errors — audit = compliance trail. | Fix: `console.warn` minimum, atau surface di `result.errors`.

- **sync-orchestrator.service.ts:102-104** | P2 | `new Date(att.recordTime ?? att.timestamp ?? att.time)` — jika ketiganya undefined → Invalid Date. Fallback `new Date()` (waktu sekarang) menyembunyikan data rusak. | Fix: Skip record + log warning.

- **sync-orchestrator.service.ts:524-530** | P2 | `processScanLogsForBatch` gagal → `console.warn` lalu batch tetap `SUCCESS` (baris 533). | Fix: `completeBatch('PARTIAL', procErr.message)`.

- **machine-employee.routes.ts:209-212** | P2 | `error.message` diteruskan ke klien (`sendError(..., error.message)`) — bocor detail error internal. | Fix: Kembalikan pesan generik; log detail internal.

### Logic gap / duplikasi

- **monthly-matrix.service.ts:54** | P2 | Hardcoded `'MAPPED' AS mapping_status` — ignore status real dari `attendance_imports.needs_manual_review`. | Fix: `CASE WHEN ai.needs_manual_review = 1 THEN 'NEED_REVIEW' ELSE 'MAPPED' END`.

- **attendance-rebuild.service.ts:33** | P2 | `ISNULL(MAX(s.sync_batch_id), 0)` — batch_id=0 tapi FK `fk_imp_batch` references `attendance_import_batches(id)`. Jika id=0 tidak ada → FK violation. | Fix: `NULL` bukan `0`.

- **attendance-rebuild.service.ts:34,36** | P2 | Inkonsisten dengan process-import: hanya join `e.employee_code = s.parsed_employee_code` (1 step), tidak ikut NIK cascade `e_current`. | Fix: Samakan JOIN cascade.

- **hr-employee-sync.service.ts:67-82,159** | P2 | `mapLocCode()` reproduksi OLD buggy locCode→single-letter map (P1A→A). L159 compute `divisionCode` tapi nilai NEVER dipakai. Dead + regression trap. | Fix: Hapus `mapLocCode()` + L159.

- **hr-employee-sync.service.ts:146** | P2 | `locCodeMap` declared, never populated, never read. | Fix: Hapus L146.

- **hr-employee-sync.service.ts:256-261** | P2 | `result.skipped` = `COUNT(*) WHERE data_quality_status='NOT_IN_HR' AND updated_at >= DATEADD(MINUTE,-1,SYSUTCDATETIME())` — 1-min window race vs sync duration; field namanya `skipped` tapi count deactivated. Mislabeled. | Fix: Capture `@@ROWCOUNT` setelah UPDATE L240, assign ke `deactivated`.

- **employee-mapping.service.ts:57-68,72-83,85-106** | P2 | `scannerMappings`, `scannerPrefixLocMap`, `machineCodeLocMap` — 3 copy scanner→locCode map, duplikat `SCANNER_PREFIX_MAP` di parser. `scannerMappings` (57-68) unused total. | Fix: Hapus ketiganya; pakai parser.

- **employee-mapping.service.ts:392-498** | P2 | `upsertMapping`/`getEmpCode`/`getUnmappedDeviceUsers`/`verifyMapping` target DROPPED tables. Header confirm dead. Juga unescaped `${machineUserId}` concat (L406,423,445,496). | Fix: Hapus 4 method.

- **employee-mapping.service.ts:145-161** | P2 | `scannerPrefixLocCode`/`machineLocCode`/`hasScannerPrefixMachineConflict` — `hasScannerPrefixMachineConflict` never called, dua lain cuma feed itu. Dead. | Fix: Hapus ketiganya.

- **employee-mapping.service.ts:360-387** | P2 | `convertDeviceUserIdToEmpCode` `@deprecated`, no caller di file ini. | Fix: Hapus kecuali grep nemu caller lain.

- **current-employee-resolution.service.ts:184-763** | P2 | Whole class dead code — grep `src/` cuma nemu self-export L763. No route/script/service import. | Fix: Hapus file.

- **current-employee-resolution.service.ts:189-221** | P2 | Hand-rolled LRU yang bukan LRU. `resolutionCache` Map insertion-ordered, eviction slice "first 1000 keys" = oldest inserts bukan LRU. Read gak move entry ke end. | Fix: Pakai `lru-cache` npm atau hapus.

- **employee-comprehensive.service.ts:427,432,433** | P2 | `WHEN NULL IS NOT NULL THEN 'MAPPED'` / `WHEN NULL IS NOT NULL THEN 'Mapped...'` — dead branches, always false. | Fix: Hapus dua WHEN NULL.

- **employee-comprehensive.service.ts:155** | P2 | `e.id AS employee_id` di-SELECT tapi `employee_id` gak ada di `EmployeeComprehensiveRow` interface — dead column. | Fix: Hapus dari SELECT atau add ke interface.

- **employee-comprehensive.service.ts:300** | P2 | `ISNULL(@machineCode, '') AS machine_code` return empty string di database mode vs actual `machine_code` di datamesin — contract inkonsisten. | Fix: Return `NULL` atau `machineCode` konsisten.

- **machine.service.ts:43-45,145** | P2 | `getApiOnlyMachines()` + `source_type='API_ONLY'` + validasi `'DIRECT_AND_API'` — konsep API-only source. CLAUDE.md: NO IT Solution API. Dead code, misleading. | Fix: Hapus `getApiOnlyMachines` + branch API_ONLY.

- **machine.repository.ts:100** | P2 | `source_type IN ('DIRECT','DIRECT_AND_API')` — residu arsitektur lama. | Fix: Hapus `DIRECT_AND_API`.

- **import-job.service.ts:257** | P2 | `prefix = sourceType === 'DIRECT_MACHINE' ? 'MACH' : 'API'` — CLAUDE.md "NO IT Solution API" → branch `API` dead. | Fix: Hapus branch API.

- **manual-import.service.ts:336** | P2 | Inkonsistensi schema: tulis ke `attendance_raw`+`scan_map` (orchestrator) vs `attendance_scan_logs` (manual). Enrichment step 4-5 orchestrator tidak jalan untuk manual import. | Fix: Rutekan manual-import lewat `insertRawScanLog` sama, atau panggil `processScanLogsForBatch` setelah insert.

- **manual-import.service.ts:343** | P2 | `parsed_division_code: empCode?.empCode?.[0] ?? null` — ambil char pertama empCode. Salah untuk PGE (`P` bukan `PGE`). Inkonsistensi dengan parser SSOT. | Fix: Pakai `parsed.locCode` dari SSOT parser.

- **sync-orchestrator.service.ts:491** | P2 | Logika enrichment: `LEFT JOIN employees e_curr ON e_curr.employee_code = e_parsed.current_emp_code AND e_curr.employee_code != ISNULL(e_parsed.employee_code, '')`. Jika `current_emp_code` = `employee_code` (self-loop) → di-exclude → salah. | Fix: Verifikasi invarian data.

- **migrations/017,019,022,024,027,030,033,038,040,041,043,044 (16 file, 80 hits)** | P2 | Referensi `zkteco_hr_employee_map` (tabel DROPPED 2026-06-24). Migration runner tanpa blocklist akan memuat ulang → error di fresh DB. | Fix: Pindahkan ke `migrations/_archived/` atau blocklist di runner.

- **src/scripts/run-migrations.ts:87-96** | P2 | Migration runner menjalankan SEMUA file `.sql` alfabetis tanpa tabel tracking — menjalankan ulang seluruh skema setiap panggilan `db:migrate`. | Fix: Tambahkan tabel `__migrations_applied` + skip yang sudah berjalan.

- **src/scripts/run-migrations.ts:42** | P2 | `replaced = text.split('rebinmas_absensi_monitoring').join(dbName)` mengubah DB_NAME ke nilai env — injection teoretis via `DB_NAME` env. | Fix: Sanitasi `dbName` terhadap `[^A-Za-z0-9_]`; atau `USE [${dbName}]` bracket quoting.

---

## P3 — Low (YAGNI / code smell / inkonsistensi minor)

### YAGNI / abstraction berlebih

- **scheduler.service.ts:82-107 vs 113-169 vs 174-228** | P3 | 3 fungsi `triggerSync`/`triggerHrSnapshotSync`/`triggerScriptJob` — duplikasi 90% (spawn + stdout/stderr/error handler). | Fix: 1 fungsi `triggerScript(job, args)`.

- **scheduler.service.ts:320-326** | P3 | `runCustomScriptJob` dispatch via `job.script?.includes('sync-hr-current-snapshot')` string match. Rapuh. | Fix: Explicit `job.type` field.

- **scheduler.service.ts:78-80** | P3 | `generateJobId` pakai `Date.now()+Math.random()` — collision risk rendah tapi UUID lebih clean. | Fix: `crypto.randomUUID()`.

- **machine.service.ts:9-14** | P3 | `MachineWithStatus` interface tidak pernah dipakai — `getAllMachines` return `Machine[]`. YAGNI. | Fix: Hapus interface.

- **zkteco.service.ts:32-40 + line 6** | P3 | Dua classifier error: `classifyError` (→ZktecoErrorCode) dan re-export `classifyConnectionError` (→TcpAccessibilityStatus). Taxonomy beda. | Fix: Satu classifier, map sekali.

- **machine-time-profile.service.ts:113** | P3 | Singleton module-level `new MachineTimeProfileService()` tanpa DI. | Fix: Injek via constructor.

- **alert.service.ts:319-368** | P3 | `DEFAULT_ALERT_RULES` hardcoded array — YAGNI, gak dipakai (gak ada seeding). | Fix: Hapus atau seed di migration.

- **data-quality.service.ts:27** | P3 | `items?: any[]` — `any` type. | Fix: Proper interface.

- **monitoring.routes.ts:37,107,142,173,282** | P3 | `LEFT JOIN scan_map sm ON sm.scan_log_id = s.id` — duplikasi 5x. | Fix: Helper view atau CTE.

- **live-feed.service.ts:174, dashboard.service.ts:174** | P3 | `(SELECT COUNT(*) FROM machine_user_raw WHERE machine_id = m.machine_id)` subquery di SELECT — N+1 risk. | Fix: LEFT JOIN aggregate.

- **monthly-matrix.service.ts:71** | P3 | `(SELECT MAX(emp_rn) FROM filtered)` correlated subquery di CTE — per-row scan full `filtered`. Lambat di dataset besar. | Fix: `COUNT(*) OVER()` window function.

- **attendance-process.service.ts:208-212** | P3 | Status logic: branch `length < 2` unreachable. | Fix: (Hapus file.)

- **attendance-reconcile.service.ts:19,26,32-48** | P3 | Interface `ReconcileResult` + `SortingRule` enum untuk service yang 0 caller. | Fix: (Hapus file.)

- **attendance-rebuild.service.ts (seluruh)** | P3 | Duplikasi logic `attendance-process-import.service.ts.processAllUnprocessed`. | Fix: Hapus, pakai `processAllUnprocessed` dengan filter machine.

- **direct-zkteco-import.service.ts (seluruh)** | P3 | Redundansi: 95% duplikasi fungsi dengan SyncOrchestrator. | Fix: Hapus.

- **hr-current-snapshot.service.ts:130-131,169-170,242-243,277-278,311-312** | P3 | `NULL AS active_count, NULL AS row_count` di SELECT setiap query — interface field always null, legacy. | Fix: Hapus dari interface + SELECT.

- **zkteco-employee-code-parser.ts:145** | P3 | `void input;` — `parseNumericUserId(rawId, input)` ambil `input` param tapi discard. | Fix: Drop param, update caller L106.

- **zkteco-employee-code-parser.ts:420-492** | P3 | `validateFullMapping` exported tapi gak ada caller. | Fix: Grep caller; hapus kalau none.

- **employee-mapping.service.ts:57-68** | P3 | `scannerMappings` field (beda dari `scannerPrefixLocMap`) — never referenced. | Fix: Hapus.

- **employee-comprehensive.service.ts:89-91 vs 93-104** | P3 | Comment "employees table is SSOT, no correlated subqueries needed" lalu langsung define correlated subquery. Self-contradicting. | Fix: Align code ke comment.

### Inkonsistensi minor / magic number

- **zkteco.service.ts:80** | P3 | TTL cache hardcoded `5 * 60 * 1000` (5 menit) di `testAccessibility`, padahal tcp-accessibility default 1 menit. Memory catat fix 5min→1min belum propagate. | Fix: Pakai `DEFAULT_TTL_MS` dari tcp service.

- **zkteco.service.ts:53** | P3 | Arg ke-4 `4000` (inport node-zklib) hardcoded magic number. | Fix: Konstanta bernama atau config.

- **zkteco.service.ts:99-101,111-113,119-123** | P3 | Empty catch `catch {}` di `enableDevice`/`disconnect` cleanup. | Fix: Log minimal `console.warn`.

- **tcp-accessibility.service.ts:95** | P3 | JSDoc "default 5 minutes" stale, `DEFAULT_TTL_MS = 60 * 1000`. | Fix: Update comment.

- **tcp-accessibility.service.ts:111** | P3 | IPv4 regex `/^(\d{1,3}\.){3}\d{1,3}$/` accept `999.999.999.999`. | Fix: Validasi octet 0-255 atau `net.isIP`.

- **tcp-accessibility.service.ts:164-171** | P3 | `getCacheStats` return entry expired (tidak filter `expiresAt > now`). | Fix: Skip expired saat iterate.

- **machine.service.ts:74** | P3 | `machineData: any` hide bug: `data_source` (required di Machine interface) tidak diset di `registerMachine`. | Fix: Set `data_source: 'DIRECT_ZKTECO'`, hapus `any`.

- **machine.service.ts:52** | P3 | Status union `'NON_ZKTECO'` tidak match vocabulary tcp-accessibility (`PORT_BLOCKED`/`NETWORK_UNREACHABLE`). | Fix: Samakan taxonomy.

- **machine.service.ts:97** | P3 | `ip = machine.ip_local || machine.ip_public` prefer local. Untuk mesin cross-estate local 10.0.0.x tidak reachable dari server PGE. | Fix: Logika pilih IP berdasarkan network server vs mesin.

- **machine-time-profile.service.ts:87-92** | P3 | `SELECT TOP 30 ... GROUP BY machine_code` tanpa `ORDER BY`. Hasil non-deterministic. | Fix: Tambah `ORDER BY`.

- **current-employee-resolution.service.ts:107** | P3 | Field `loc_code`/`currentHrLocCode` — naming ambiguous vs convention `hr_loc_code` (P1A) vs `locCode` (A,B,C). Risk bug class sama kaya historical `divisionMap` mismatch. | Fix: Rename `hr_loc_code`.

- **current-employee-resolution.service.ts:23,693,713** | P3 | Import path `../../lib/db` — rest project `../../shared/database/sql-client`. Inkonsisten. | Fix: Align import.

- **current-employee-resolution.service.ts:134-136** | P3 | `normalizeNik` strip whitespace tapi SQL L559,697 juga `REPLACE(NewICNo, ' ', '')` — dual normalization, risk drift. | Fix: Normalize sekali.

- **current-employee-resolution.service.ts:141-151** | P3 | `logResolution` pakai `details || ''` — kalau omitted, log trailing empty string. | Fix: `details ? JSON.stringify(details) : ''`.

- **current-employee-resolution.service.ts:194-197** | P3 | `clearCache()` log unconditional. Noise prod. | Fix: Gate debug flag.

- **employee-movement.service.ts:23-39** | P3 | `EmployeeDailyAssignment.is_manual_override` typed `boolean` tapi SqlClient return `bit`→number. | Fix: Type `number` atau convert.

- **employee-comprehensive.service.ts:417** | P3 | `COALESCE(e.machine_codes, '')` — `machine_codes` non-existent. | Fix: Hapus bareng P0 fix.

- **employee-comprehensive.service.ts:469** | P3 | `s.scan_direction` gak ada di documented schema. | Fix: Verify atau drop.

- **employee-comprehensive.service.ts:121-123** | P3 | `s.zkteco_user_name`, `s.mapping_reason`, `s.source` di scan_logs — gak ada di documented schema. | Fix: Confirm via INFORMATION_SCHEMA.

- **employee-movement.service.ts:237-252** | P3 | `detectPotentialMovement` count assignment rows sebagai "consecutive days" — gap kalender gak di-handle. | Fix: Cek date delta aktual.

- **hr-employee-sync.service.ts:259** | P3 | `DATEADD(MINUTE, -1, ...)` magic number. | Fix: Const atau pakai `@@ROWCOUNT`.

- **hr-employee-sync.service.ts:153-237** | P3 | Per-employee loop 2 round trips (UPDATE/INSERT + writeAudit) × 6000+ HR employees = 12000+ queries. Slow. | Fix: Bulk MERGE + bulk audit insert.

- **src/scripts/run-migrations.ts:10** | P3 | Parser `.env` manual via regex tanpa penanganan multiline quote/spasi. | Fix: Pakai `dotenv`.

- **src/lib/db.ts:38-42** | P3 | `getDbPool` race condition teoretis: 2 pemanggilan konkuren saat pool null → 2x `new ConnectionPool`. | Fix: Singleton promise in-flight.

- **sync-orchestrator.service.ts:159** | P3 | `parsed.parsedEmployeeCode.charAt(0)` tanpa cek length. | Fix: Cek length dulu.

- **sync-orchestrator.service.ts:192-193** | P3 | `private profileService = new MachineTimeProfileService()` — service di-new di deklarasi field, bukan DI. | Fix: Inject via constructor.

- **manual-import.service.ts:107,154** | P3 | Silent swallow: `catch (e) { // Skip invalid lines }` di parser CSV/DAT. | Fix: Akumulasi count baris rusak.

---

## Cross-cutting verdict

- **`api-attendance-import.service.ts` DEPRECATED**: TIDAK ditemukan di `src/` (sudah dihapus dari disk). 0 kode aktif referensi. 8 file docs masih reference nama ini (LEGACY_DEPRECATION_LIST.md, dll) — hanya referensi historis. OK.
- **`zkteco_hr_employee_map` di `src/`**: 1 hit di `employee-comprehensive.service.ts:85` — itupun KOMENTAR penjelasan. 0 kode aktif. Bagian `src/` bersih. Tapi 16 file migration ref table dropped.
- **SQL injection di kode aktif (`src/lib/db.ts`): bersih** — `query()` pakai `request.input()` binding parameter. Helper `SqlClient` yang raw injection sudah vestigial.
- **Hardcoded credentials**: hanya `'12345'` (password ZKTeco) di 2 file; bukan DB password. `DB_PASSWORD` & `JWT_SECRET` lewat env tanpa fallback (bagus).
- **Duplikasi parser**: 4 copy scanner→locCode map (current-employee-resolution L422 inline, employee-mapping L57/72/85 ×3, hr-employee-sync L67 ×1) vs 1 SSOT di `zkteco-employee-code-parser.ts`. Current-employee-resolution punya copy paling bahaya (skip IJL + length rule).
- **Dead code terbesar** (total ~2000+ lines, zero function loss kalau hapus):
  - `attendance-raw.repository.ts` (406 baris)
  - `attendance-reconcile.service.ts` (419 baris)
  - `attendance-process.service.ts` (328 baris)
  - `current-employee-resolution.service.ts` (763 baris)
  - `employee.repository.ts` (whole file)
  - `employee-movement.service.ts` (kalau tables confirmed dropped)
  - `employee-mapping.service.ts` L392-498 (4 method)
  - `summary.service.ts` (full)
  - `dashboard.service.ts` (full)
  - `anomaly.service.ts` (full)
  - `live-feed.service.ts` (full)
  - `direct-zkteco-import.service.ts` (full)
  - `src/shared/database/sql-client.ts` (vestigial)

---

## Prioritas fix (urutan rekomendasi)

1. **Scheduler PID tracking + boot-time reaper** (P0, 3 file, ~30 baris) — stop stuck batch kambuh.
2. **`attendance-process-import.service.ts` fix tabel/kolom** (P0, 1 file, ~10 baris) — `hr_reference`→`hr_employee_current_snapshot`, kolom `current_*`.
3. **`attendance-rebuild.service.ts` fix `machine_code`→`source_reference` + ORDER BY** (P0, 1 file, ~5 baris).
4. **`employee-comprehensive.service.ts` hapus `resolvedEmployeeCodeSql()` + kolom non-existent** (P0, 1 file, ~20 baris) — stop 500/timeout.
5. **`employee.repository.ts` + `current-employee-resolution.service.ts:551,593` SQL injection** (P0, parameterize).
6. **`machine.repository.ts:64` SQL injection** (P0, parameterize `@machineCode`).
7. **Hapus dead code cluster** (P1, ~2000 lines) — 1 commit sweep.
8. **`hr-employee-sync.service.ts` deactivate logic** (P1, `NOT EXISTS` + `UPPER`).
9. **`sync-orchestrator.service.ts:471` fix `attendance_raw_users`→`machine_user_raw`** (P1, 1 baris).
10. **Timezone `time-correction.service.ts` double-offset** (P2, 1 file).
11. **Hardcoded `ZKTECO_PASSWORD` fallback** (P2, 2 file, fail-fast).
12. **Migration runner tracking + blocklist** (P2, 1 file + archived dir).

Audit selesai. Tidak edit file apapun.
