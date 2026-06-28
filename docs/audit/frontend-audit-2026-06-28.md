# Frontend Audit — 2026-06-28

Scope: `frontend/src/` (React 19 + Vite + TS + React Query + React Router). ZKTeco absensi. 8-page retained refactor (Dashboard, Mesin, Absensi, Matriks, Karyawan, Quality, ClockHealth, Alert, Monitoring, Settings). READ-ONLY audit, no file edited.

Severity: P0 (crash/data loss/security) | P1 (logic bug/wrong behavior) | P2 (code smell/inconsistency) | P3 (minor/dead code/YAGNI).

Total findings: 130 (P0:3, P1:35, P2:55, P3:37).

---

## P0 — Fatal

### P0-1. `lib/api.ts:5-7,28` — JWT token di localStorage → XSS
`localStorage.getItem('token')` exposed ke skrip mana pun di halaman (termasuk dependency npm yang disusupi). Tidak ada sanitasi token.
Fix: pindahkan ke cookie httpOnly + `credentials: 'include'`.

### P0-2. `lib/api.ts:23-66` — fetch tanpa AbortController → race saat navigasi cepat
Tidak ada `signal`. Navigasi cepat → request lama tetap aktif, update state pada komponen unmounted → React 19 warning + memory leak. `api()` dipanggil langsung di banyak `useQuery` tanpa passing signal.
Fix: teruskan `signal` dari `options` ke `fetch`, atau andalkan default React Query AbortSignal.

### P0-3. `lib/api.ts:33-35` — error handler lempar status HTTP sebelum baca body
`throw new Error(HTTP ${status}: ${statusText})` sebelum baca JSON envelope. Backend kirim `{success:false, error:"..."}` informatif, hilang. 401 tidak trigger `clearToken()`/redirect → token expired = loop error tanpa logout.
Fix: baca body dulu saat !ok, ekstrak `error` dari envelope, handle 401 → `clearToken()` + redirect.

---

## P1 — Logic bugs / wrong behavior

### Cluster: Matrix + Attendance + status-mapping

#### P1-1. `services/attendance-service.ts:392` — checkInAt fallback chain reintroduce double-offset bug
`final_check_in ?? check_in_at ?? scan_time` — `scan_time` already WIB (+7). Jika prior fields null, frontend formatting WIB lagi = double-offset. Memory note "timezone-double-offset-fix" eksplisit bilang pakai `raw_record_time` (UTC).
Fix: insert `record?.raw_record_time` sebelum `record?.scan_time` di fallback chain.

#### P1-2. `services/attendance-service.ts:149-155` — dateKeyFromRecord slice UTC raw_record_time → salah hari
Fallback slice `raw_record_time` 10 char = UTC date. Dekat WIB midnight → tanggal semalam. Scan ter-group hari salah.
Fix: prefer `attendance_date`/`scan_date`; untuk time fallback pakai WIB `scan_time` bukan UTC `raw_record_time`.

#### P1-3. `components/features/attendance/AttendancePage.tsx:535,562` — isNoData konflasi missing check-in dengan NO_DATA
`isNoData = status === 'NO_DATA' || !check_in_at`. Row PRESENT tanpa check_in_at salah diklasifikasi NO_DATA → KPI "Tanpa Data" inflated.
Fix: `isNoData = status === 'NO_DATA'` saja.

#### P1-4. `components/features/attendance/AttendancePage.tsx:89-101` — getMappingStatusStyle fuzzy branch never match
`normalized.includes(key.replace(/_/g,' ').toUpperCase())` — normalized retain underscores, key spasi. Status `NEED_REVIEW_CURRENT` fall through ke default, render raw status sebagai label, bukan "Need Review".
Fix: strip underscores kedua sisi sebelum `.includes`, atau normalize via `normalizeMappingStatus`.

#### P1-5. `components/features/matrix/AttendanceMatrixPage.tsx:351-353,377-384,410,433` — alfa cell double-count di noData bukan absent
Alfa (NO_DATA past WORKDAY) display TIDAK_HADIR via `displayStatus` (line 352), tapi `status` var tetap NO_DATA → masuk counter `noData` bukan `absent`. KPI "Tidak Hadir" exclude alfa. `workedDays = days.length - noData` exclude alfa → `attendanceRate` denominator inflated.
Fix: increment `absent` (bukan `noData`) untuk alfa cell, atau apply alfa conversion ke `status` sebelum counting.

### Cluster: Machines + clock-health

#### P1-6. `components/features/machines/components/MachineDetailModal.tsx:342-343` — real_access_status/access_latency_ms never reach modal
`toLegacyMachine()` (MachinesPage.tsx:80-102) tidak map `real_access_status`/`access_latency_ms` dari `MachineOperationalStatus` ke legacy `Machine`. Modal baca `machine.real_access_status` → selalu undefined → fallback ke stale `access_status`. Memory note: frontend harus baca `real_access_status`/`display_status` bukan DB stale.
Fix: map `real_access_status`, `access_latency_ms`, `display_status` di `toLegacyMachine()`, atau pass `MachineOperationalStatus` langsung ke modal.

#### P1-7. `components/features/machines/components/MachineDetailModal.tsx:127-160,342-343` — modal status recompute staleness client-side, ignore display_status
`getStatusClass()`/`getStatusLabel()` recompute `ageMs > 60*60*1000` dari `last_sync_at`, duplikat backend logic. Backend sudah kirim `display_status`/`sync_status`/`severity`. Modal ignore `display_status` untuk badge.
Fix: drive badge dari `machine.display_status`/`machine.sync_status`; drop client-side age calc.

#### P1-8. `components/features/machines/MachinesPage.tsx:246` vs `SchedulerStatus.tsx:49-52` — scheduler status inconsistent
MachinesPage cek `scheduler?.status === 'SYNCING'`. SchedulerStatus hitung dari `data?.enabled` saja: `enabled ? 'Aktif' : 'Nonaktif'`. Scheduler `enabled=true` tapi `status='ERROR'` tetap "Aktif" hijau.
Fix: SchedulerStatus reflect `status` (ERROR → merah "Error") bukan cuma `enabled`.

#### P1-9. `components/features/machines/components/MachineDetailModal.tsx:625-678,681-716` — db-mode pagination off, double-render mapped+unmapped
`getUsersForMode()` (db mode) return `[...filteredMappedUsers, ...filteredUnmappedUsers]` (line 211), `totalUsers`/`totalUserPages`/`paginatedUsers` dari combined. Tapi render (680-757) re-filter `paginatedUsers` sebagai `MachineDbMappedUser[]` lalu `MachineUnmappedUser[]` dengan `.filter(u => u.employee_name)` / `.filter(u => !u.employee_name && u.raw_id)`. Page slice 10 mixed rows → mapped filter keep ~5, unmapped keep ~5. "10 per page" tampil < 10, pagination count off.
Fix: paginate setelah split, atau render combined slice tanpa re-filter/cast.

#### P1-10. `components/features/machines/components/MachineDetailModal.tsx:910` — log pagination no page numbers
`<button className="page-btn active">{logPage}</button>` static non-clickable. User tidak bisa jump page. Kontras user-list pagination (799-810) yang render sampai 5 tombol.
Fix: mirror user-list pagination loop.

#### P1-11. `components/features/clock-health/MachineClockHealthPage.tsx:33,39` — hardcoded date range + offset
`2026-06-01`..`2026-06-30` dan `offsetMinutes: 420` bake-in. Tidak work bulan depan. Asumsi semua mesin drift +420m (mungkin +480m). `executedBy: 'HR_ADMIN'` hardcoded.
Fix: derive date range dari selected month/today; baca offset dari `m.offsetMinutes`; pakai logged-in user.

### Cluster: Employees-comprehensive

#### P1-12. `components/features/employees-comprehensive/EmployeeIdentityDrawer.tsx:129,148-149` — detail/scans always empty (envelope unwrap regression)
`detail = detailData?.data || null` dan `scans = scansData?.data?.rows || []` — akses `.data` pada query result. Tapi `requestData<T>` (api-client.ts:13-15) return `Promise<T>` langsung (api() sudah unwrap envelope). `detailData` sudah `EmployeeIdentity`, bukan `{data: EmployeeIdentity}`. `detailData?.data` selalu undefined → detail tab selalu "Tidak ada data". Scans list selalu kosong, pagination tidak render. Same class of bug memory (FR-009) tapi resurface di drawer.
Fix: `const detail = detailData || null;` dan `const scans = scansData?.rows || []; const scansPagination = scansData?.pagination;`.

#### P1-13. `components/features/employees-comprehensive/EmployeeComprehensivePage.tsx:79-92` — over-fetch KPIs on page/search change
Two `useQuery` with separate `filters` queryKey. KPIs query pakai full `filters` (termasuk `page`/`pageSize`/`search`) padahal KPIs ignore page. Saat page/search change, KPIs refetch unnecessarily.
Fix: split queryKey — KPIs `{mode, divisionCode, machineCode}` only; list full filters.

#### P1-14. `components/features/employees-comprehensive/EmployeeComprehensivePage.tsx:60-63,68-71` — type lie: filters Omit mode tapi smuggle mode
`filters` typed `Omit<EmployeeComprehensiveFilters,'mode'>` (no mode) tapi `handleModeChange` inject `mode` via spread. `getEmployees` spread `{...filters, mode}` (mode passed twice). Type lie; works by accident. KPIs query pass `filters` (smuggled mode) ke `getKPIs`.
Fix: type `filters` sebagai `EmployeeComprehensiveFilters` (include mode), drop spread di `getEmployees` call.

#### P1-15. `components/features/employees-comprehensive/EmployeeComprehensiveToolbar.tsx:49-53` — useEffect stale closure missing deps
Sync debounced search → `onFiltersChange`, dep array `[debouncedSearch]` saja. `filters` dan `onFiltersChange` excluded (eslint-react-hooks/exhaustive-deps violation). `onFiltersChange` inline arrow parent (new each render), effect capture stale `filters`. Concurrent filter changes lost.
Fix: include `[debouncedSearch, filters, onFiltersChange]` atau `useRef` untuk `filters` di dalam effect.

#### P1-16. `components/features/employees-comprehensive/EmployeeIdentityDrawer.tsx:121-127,138-146` — query enabled guard lemah, malformed URL on null identifier
`queryFn` call `getEmployeeDetail(employee?.employeeCode || employee?.parsedEmployeeCode || employee?.rawDeviceUserId || '', ...)`. Jika semua null, pass empty string `''` sebagai code. `enabled: !!employee && open` true (employee object exists) tapi identifier `''`. Service encode `''` ke URL `/api/employees-comprehensive//detail` (double slash, malformed). Same pattern `getScans`.
Fix: tighten `enabled`: `!!employee && open && !!(employee.employeeCode || employee.parsedEmployeeCode || employee.rawDeviceUserId)`.

#### P1-17. `components/features/employees-comprehensive/EmployeeDetailModal.tsx:351` — null `.length` crash risk
`detail.codeHistory.length > 0` access `.length` pada `codeHistory`. Type `EmployeeDetail.codeHistory: CodeHistoryEntry[]` non-optional, tapi jika API return null/undefined (backend omission), throw "Cannot read properties of null". Same pattern line 421, 428, 508, 512, 519.
Fix: default saat destructure: `codeHistory: rawDetail?.codeHistory ?? [], machineEnrollments: rawDetail?.machineEnrollments ?? []`.

#### P1-18. `components/features/employees-comprehensive/EmployeeIdentityDrawer.tsx:575` — machineCodes empty string render empty Badge
`(detail as any).machineCodes.split(',')` — truthy check pass untuk `''`, `.split(',')` return `['']`, render satu empty Badge. Juga `key={code}` where `code=''` → duplicate-key warning.
Fix: `machineCodes?.split(',').filter(Boolean).map(...)` dengan stable key.

### Cluster: Dashboard + Quality + Monitoring + Alert + ops-service + quality-service

#### P1-19. `components/common/ErrorBoundary/ErrorBoundary.tsx:13-40` — tidak catch async error
Class boundary hanya catch sync render error. Async error (useQuery fail, `await api()`) tidak tertangkap → white screen / broken UI. Juga `router.tsx:19` set `errorElement: <ErrorBoundary/>` tapi boundary bungkus `children` dan return `this.props.children`; saat dipakai sebagai `errorElement`, render failed route subtree, bukan reset. `handleReset` clear local state saja, route nav tidak reset.
Fix: untuk async error, andalkan router `errorElement` + `useRouteError`; handle reset queryClient / `navigate(-1)`.

#### P1-20. `main.tsx:7-15` — refetchInterval global 30s → polling storm
Setiap query (termasuk matrix 800k rows) refetch tiap 30s. `staleTime: 10000` = hampir selalu stale. Matrix 2.6s × banyak user = beban backend serius. Tidak ada `gcTime`. StrictMode double-fetch di dev.
Fix: set `refetchInterval` per-query (dashboard saja), disable global default, set `gcTime`.

#### P1-21. `components/common/DataTable/DataTable.tsx:69` — key fallback numeric index → render bug
`key={String(row[keyField]) ?? i}` — bila `keyField` undefined/null, fall to index `i`. Saat data sort/filter, index reuse → React recycle wrong DOM → baris salah tercampur. `keyField` default `'id'` tapi banyak tipe (RawScanLog optional id, MachineRawUser tanpa id) = undefined.
Fix: require `keyField`, atau composite stable key; never fall to index.

#### P1-22. `lib/api.ts:38-41` — `null as T` untuk empty response, unsafe
Empty 204 → `null as T`, tapi caller type `T = Foo[]` expect array → `null.length` crash runtime. `as T` silence TS.
Fix: return `[] as unknown as T` bila T array, atau `api<T>` throw on empty vs explicit contract.

#### P1-23. `services/api-client.ts:13-15` — requestData no-op alias dari api — duplikasi
`export async function requestData<T>(...){ return api<T>(path, options); }` wrapper tanpa operasi. CLAUDE.md: "ApiResponse<> dropped karena api() sudah unwrap" → requestData tidak tambah unwrap. Dua fungsi sama, konvensi panggil inconsistent (`api` vs `requestData`).
Fix: hapus `requestData`, ganti pemanggilan dengan `api`.

#### P1-24. `lib/api.ts:102-196` — domain functions (machine/employee) bocor ke generic HTTP client
`getMachineEmployees`, `getMachineRawScanLogs`, `getEmployeeAttendance`, `getMachineUserAttendance` — domain logic di `lib/api.ts`, seharusnya generic HTTP client. Tapi `services/api-client.ts`/`services/machine-service.ts` juga ada. Tiga lapisan satu konsep → inconsistent. `getEmployeeAttendance` return `any[]` (line 134, 139) → type safety hilang.
Fix: pindah ke `services/machine-service.ts`, return tipe benar, hapus `any`.

#### P1-25. `components/layout/Sidebar/Sidebar.tsx:35-43` — NavLink tanpa `end` prop, active ambiguous
`NavLink` React Router 6+ auto `aria-current="page"` saat aktif, TAPI tanpa `end` pada `to="/dasbor"` prefix match bisa buat `absensi` dan `absensi/matriks` keduanya aktif.
Fix: add `end` pada parent route, atau exact match.

#### P1-26. `components/common/FilterBar/FilterBar.tsx:47,114-150` — dropdown status no a11y, Clear tidak reset date
`statusDropdownOpen` toggle click, overlay close, tapi tidak ada `onKeyDown` Escape, tidak `aria-expanded`, tidak focus trap. Keyboard user stuck. `hasActiveFilters` tidak include `date` (line 49) → Clear button tidak reset date.
Fix: add `aria-expanded`, `onKeyDown` Escape, include date di `hasActiveFilters` + `handleClear`.

#### P1-27. `components/features/settings/SettingsPage.tsx:9-29` — inline dup type SchedulerInfo/Division
`useQuery<{enabled...;status:string}>` re-type `SchedulerInfo` inline (tanpa jobs, tanpa union status). `useQuery<{id...;is_active}>` re-type `Division` inline. Backend add field, UI tidak lihat. Ignore `types/index.ts` yang sudah ada.
Fix: import `SchedulerInfo` & `Division` dari `types`.

#### P1-28. `components/features/employees-comprehensive/EmployeeComprehensivePage.tsx:88-92,114-118` — error banner misleading blame
`error: empError` destructured tapi `empError` hanya dipakai di combined `(employeesError || kpisError)` banner. Bila hanya KPIs fail (employees OK), banner "Gagal memuat data karyawan" dengan `empError.message` — tapi `empError` null saat employees success → message "Unknown error". KPI failure disalahkan ke employee data.
Fix: separate banners, atau pick error matching query yang fail.

#### P1-29. `components/features/dashboard/DashboardPage.tsx:95-99` — KPI fallback inconsistent
`displayAccessible` gate `stats?.totalMachines` (truthy check), tapi `displayLiveOnline`/`displayBlocked`/`displayUnreachable`/`displayStale` gate `count > 0`. `liveOnlineCount===0` tapi machines loaded → fallback `stats?.onlineMachines` yang `normalizeOpsSummary` (ops-service.ts:77) alias ke `accessible_machines`. "Live Online" card show accessible count, bukan live.
Fix: gate semua lima di condition sama, atau selalu pakai server-side `stats.*`.

#### P1-30. `components/features/dashboard/components/KpiCard.tsx:58` — `var(--success)15` invalid CSS
`backgroundColor: \`${getVariantColor()}15\`` produces `var(--success)15` — invalid. `var()` tidak bisa trailing hex-alpha; 8-digit hex hanya works pada literal hex. Background color silently dropped.
Fix: `color-mix(in srgb, ${getVariantColor()} 15%, transparent)` atau wrap rgba.

#### P1-31. `components/features/dashboard/components/MachineStatusGrid.tsx:163` — same var+hex-alpha bug
`backgroundColor: \`${getStatusColor(status)}20\`` — `getStatusColor` return `var(--success)` untuk ONLINE/WARNING/BLOCKED → `var(--success)20` invalid. Hanya hex-returning (UNREACHABLE/OFFLINE/STALE) work.
Fix: color-mix atau rgba wrapper.

#### P1-32. `components/features/alerts/AlertPage.tsx:119` — same var+hex-alpha bug
`border: \`1px solid ${alert.severity === 'CRITICAL' ? 'var(--error)' : ...}30\`` — `var(--error)30` invalid, border silently dropped untuk CRITICAL/WARNING/INFO.
Fix: color-mix atau drop alpha.

#### P1-33. `services/ops-service.ts:78` — `liveOnlineMachines ?? liveOnlineMachines` typo, snake_case fallback missing
`liveOnlineMachines: toNumber(raw.liveOnlineMachines ?? raw.liveOnlineMachines)` — kedua sisi `??` identik. Snake-case fallback `raw.live_online_machines` missing (pattern dipakai everywhere else line 76,77,79-85). API return snake_case → field selalu 0.
Fix: `raw.liveOnlineMachines ?? raw.live_online_machines`.

#### P1-34. `services/quality-service.ts:4-9 vs 43-48` — threshold inconsistency
`qualityStatus`: score>=90 EXCELLENT, >=80 GOOD, >=60 WARNING. `toQualityReport`: >=90 healthy, >=60 warning, else critical. Score 80 → `qualityStatus` GOOD tapi `toQualityReport` warning. Same score, status beda tergantung fungsi.
Fix: unify threshold ke single `scoreToStatus()`.

#### P1-35. `components/features/quality/QualityPage.tsx:96-100` — refreshAll incomplete
`refreshAll` hanya refetch 3 dari 6 query (`summary`, `unmapped`, `duplicates`). Skip `report`, `drift`, `machines`. Refresh button → stale batch/drift data.
Fix: add `refetchReport`, `refetchDrift`, `refetchMachines`.

---

## P2 — Code smells / inconsistencies

### Cluster: Matrix + Attendance + status-mapping

#### P2-1. `components/features/matrix/AttendanceMatrixPage.tsx:365-373` — qualityFlags cek NO_DATA tapi cell display TIDAK_HADIR
`qualityFlags` cek `status === 'NO_DATA'` (normalized) sementara cell render `displayStatus` ('TIDAK_HADIR' untuk alfa) → flag bilang NO_DATA tapi cell tampil TIDAK_HADIR.
Fix: compute flags dari `displayStatus`.

#### P2-2. `services/attendance-service.ts:23-36` vs `utils/display.ts:15-25` — duplicate display-name resolution
`getDisplayName` vs `resolveDisplayName` dengan fallback chain beda dan N/A filtering beda. `getDisplayName` tidak filter 'null'/'NaN' strings, `safeText` filter.
Fix: collapse ke satu helper.

#### P2-3. `AttendancePage.tsx:49-59` vs `AttendanceMatrixPage.tsx:31-46` vs `services/status-mapping.ts:44-61` — tiga status vocabulary coexist
AttendancePage PRESENT/ABSENT/NO_DATA, matrix HADIR/TIDAK_HADIR, status-mapping normalize antara. AttendancePage `getStatusInfo` tidak ada case INCOMPLETE_SCAN/MANUAL_CORRECTION/SCAN_ON_* → render raw status string.
Fix: satu canonical status→label map keyed on `IntelligenceAttendanceStatus`.

#### P2-4. `AttendancePage.tsx:407-410,671-674` — source badge logic duplicated inline twice
Source badge (ZKTeco/API/Manual ternary) duplicated.
Fix: extract `<SourceBadge source={...}/>` helper.

#### P2-5. `AttendancePage.tsx:61-66,275-283; AttendanceMatrixPage.tsx:119-121,419-420,449` — time formatting no timeZone option
`toLocaleTimeString('id-ID')`/`toLocaleString('id-ID')` tanpa `timeZone`. Correct hanya jika client TZ=WIB. Non-WIB client show shifted times. Memory note claim "WIB benar" tapi rely on client tz.
Fix: pass `timeZone:'Asia/Jakarta'` explicitly.

#### P2-6. `AttendanceMatrixPage.tsx:119-121` — formatTimeWib misleading name
`formatTimeWib` name assert WIB tapi implementation plain `toLocaleTimeString('id-ID')` (no timeZone). Behavior diverge dari name pada non-WIB client.
Fix: add `timeZone:'Asia/Jakarta'` atau rename `formatTimeLocal`.

#### P2-7. `AttendancePage.tsx:269,449` — scan_date slice + date+time concat parse
`scan.scan_date.slice(0,10)` dan `new Date(\`${date}T${time}\`)`: bila `scan_date` UTC datetime, slice = UTC date (off-by-one near WIB midnight); date+time concat parse as local.
Fix: use explicit WIB date field atau parse dengan timeZone.

#### P2-8. `AttendancePage.tsx:560-563` — KPI stats dari data unfiltered, subtitle dari filtered
`presentCount`/`absentCount`/`noDataCount`/`leaveCount` derive dari `data` (unfiltered) sementara subtitle pakai `filtered.length`. Status/search filter update table tapi tidak KPIs.
Fix: derive dari `filtered`.

#### P2-9. `AttendancePage.tsx:251-261` — EmployeeDetailModal useQuery no enabled guard
`useQuery` hooks no `enabled` guard; fire saat `employeeCode` empty (parent pass empty string saat `r.employee_code` blank) → request `/api/attendance/employee/` → 404.
Fix: `enabled: !!employeeCode`.

#### P2-10. `AttendancePage.tsx:636` — row onClick open modal dengan employee_code kosong
`r.employee_code` mungkin empty string → modal open, query 404.
Fix: guard `if (!r.employee_code) return;` atau pass `current_emp_code` fallback.

#### P2-11. `services/attendance-service.ts:354` — normalizeSource default ZKTECO for any present record
`normalizeSource(record?.source ?? record?.data_source ?? (record ? 'ZKTECO' : 'NO_DATA'))` default any present record ke ZKTECO. MANUAL_CORRECTION/HYBRID record missing source field mislabeled.
Fix: default 'NO_DATA' saat source absent, atau hanya default saat `hasRawScan`.

### Cluster: Machines + clock-health

#### P2-12. `MachineDetailModal.tsx:139,1003,1034-1047` — `any` types
`(machine as any).quality_score` (139), `(record: any, idx: number)` (1003). Bypass type system.
Fix: type `record` sebagai attendance record interface; add `quality_score` ke `Machine` type.

#### P2-13. `MachineDetailModal.tsx:1-30` — unused imports
`CheckCircle`, `XCircle`, `ShieldCheck`, `ShieldOff`, `WifiOff`, `RefreshCwAlt` (aliased), `Eye`, `Loader` (re-imported), `Download` — mayoritas never referenced di JSX. Dead imports inflate bundle.
Fix: remove unused; run `tsc --noUnusedLocals`.

#### P2-14. `MachinesPage.tsx:80-102` — toLegacyMachine adapter code smell
Dua shape (`Machine` legacy vs `MachineOperationalStatus`) untuk same concept; modal consume legacy, page pakai new. Force field-by-field copy, root cause P1-6 (fields dropped).
Fix: migrate `MachineDetailModal` consume `MachineOperationalStatus` langsung; delete adapter.

#### P2-15. `MachineDetailModal.tsx:799-810` — user pagination only first 5 pages always
`Array.from({length: Math.min(totalUserPages, 5)}, (_, i) => i+1)` selalu start page 1. User di page 12, tidak bisa lihat/jump.
Fix: window around current page (`userPage-2 .. userPage+2`).

#### P2-16. `MachineDetailModal.tsx:184-203` — search filters not memoized
`filteredMappedUsers`/`filteredUnmappedUsers`/`filteredRawUsers` computed inline each render (no `useMemo`). Large user lists + typing → re-filter repeatedly.
Fix: `useMemo` on `[employeesData, searchQuery]`.

#### P2-17. `SchedulerStatus.tsx:55-61` — saveInterval swallow invalid input
`intervalInput` empty atau `<=0` → `saveInterval` no-op tanpa feedback. User click "Simpan", nothing happens.
Fix: show validation error atau disable button.

#### P2-18. `MachineDetailModal.tsx:86-89,117-125` — `machine!` non-null assertion saat enabled guard on machine
`queryFn: () => getMachineEmployees(machine!.machine_code)` — bila `machine` jadi null antara enable dan run, runtime crash. `enabled: !!machine && isOpen` unlikely tapi tidak impossible under React Query refetch races.
Fix: return early di `queryFn` if `!machine`.

### Cluster: Employees-comprehensive

#### P2-19. `EmployeeComprehensiveToolbar.tsx:45` — searchInput tidak sync dari parent
`searchInput` init dari `filters.search` once. Parent reset `filters.search` externally (clear button, URL sync) → `searchInput` tidak follow → input stale text.
Fix: `useEffect([filters.search]) => setSearchInput(filters.search || '')`.

#### P2-20. `EmployeeComprehensiveToolbar.tsx:92-125` — cross-mode filter leakage
Machine dropdown render hanya `datamesin` mode, division dropdown hanya `database` mode. Switch mode unmount dropdown lain, selected value persist di `filters` (e.g. `machineCode` setelah switch ke database) dan dikirim ke API. Backend `getKPIs` juga terima leaked filter.
Fix: on `handleModeChange`, clear mode-specific filter.

#### P2-21. `EmployeeComprehensivePage.tsx:79-83` — machines/divisions props never passed
`machines` dan `divisions` props never passed ke `EmployeeComprehensiveToolbar` — toolbar default `[]`. Dropdown render zero options. Feature broken / dead UI.
Fix: fetch machines+divisions di page dan pass through.

#### P2-22. `EmployeeIdentityDrawer.tsx:120,137` — query key `identityKey` mungkin undefined
Query key pakai `employee?.identityKey` tapi `identityKey` ada di `EmployeeComprehensiveRow` (types:159) yet never populated. Backend omit → key `undefined` untuk semua employee → cache collision antar employee.
Fix: pakai guaranteed-unique key: `employee?.rawDeviceUserId + ':' + employee?.machineCode`.

#### P2-23. `EmployeeIdentityDrawer.tsx:155,160,163` — modal a11y gaps
`if (!open) return null` tapi hooks called sebelum early return (correct), TAPI: tidak ada Escape key handler, tidak focus trap, tidak body scroll lock, overlay `onClick` close tapi panel tidak trap focus. Keyboard user stuck. Same gaps `EmployeeDetailModal.tsx:132-140`.
Fix: `useEffect` on `open`: Escape→close, `document.body.style.overflow='hidden'` dengan cleanup restore, focus-trap panel.

#### P2-24. `EmployeeIdentityDrawer.tsx:278,284,534,546,568,574` — `as any` casts hide type drift
`(detail as any).currentEmpCode`, `.nik`, `.batchImport`, `.machineCodes` — tapi `EmployeeIdentity` type sudah declare `currentEmpCode`/`nik`. `as any` hide bahwa `batchImport`/`machineCodes` real field not in type. Type drift: backend return field TS type omit.
Fix: add `batchImport?`/`machineCodes?` ke `EmployeeIdentity` interface; drop `as any`.

#### P2-25. `EmployeeIdentityDrawer.tsx:402-403` — key fallback to index
`key={scan.id || index}` — fallback array index saat `scan.id` missing. List reorder/insert → wrong DOM reuse. `ScanRecord.id` typed `number` (non-optional) → fallback dead defensive code.
Fix: `key={scan.id}`; bila unsure, string key `key={\`scan-${scan.id}-${index}\`}`.

#### P2-26. `EmployeeDetailModal.tsx:115-118` — query key `?? ''` vs queryFn `!` inconsistent null handling
Key `employeeDetailKeys.byIdentifier(employeeIdentifier ?? '')` tapi `queryFn` pakai `employeeIdentifier!`. `enabled: !!employeeIdentifier && open` guard, tapi key `?? ''` sementara queryFn assert non-null. `?? ''` suggest author expect undefined only; bila `0` (valid numeric id) `?? ''` return 0 (correct).
Fix: align: key dan queryFn both pakai `employeeIdentifier` dengan `enabled` guard; drop `?? ''` dan `!`.

#### P2-27. `employee-detail.service.ts:34-45` — dead branch logic
`getDetail(identifier)` branch: number→`getById`, else if `/^\d{6,}$/`→`getByNik`, else→`getByNik` (same call). Comment "employee code by ID lookup" (line 43) salah — both branch call `getByNik`.
Fix: bila both path truly `getByNik`, collapse ke one call; otherwise implement code-lookup path.

#### P2-28. `EmployeeComprehensiveTable.tsx:204-205,371` — isDiff truthy check pada empty string
`const isDiff = val && row.original.parsedEmployeeCode && val !== row.original.parsedEmployeeCode;` — `val` `string | null`; truthy check pada `null` work, tapi `val === ''` (empty string, falsy) short-circuit padahal `''` bisa beda dari `parsedEmployeeCode`. Juga `parsedEmployeeCode` truthy check → saat parsed null tapi `currentEmpCode` set, tidak ada highlight.
Fix: `const isDiff = !!val && val !== (row.original.parsedEmployeeCode ?? null);`.

#### P2-29. `EmployeeComprehensiveTable.tsx:75-312,315-532` — column defs massive duplication
Dua column definitions (~240 lines each) dengan duplication: NIK masking, mapping badge, current-emp diff highlight, machine badge semua repeated. `useMemo([], [])` empty deps.
Fix: extract shared cell renderers (`nikCell`, `mappingBadgeCell`, `currentEmpCell`).

#### P2-30. `EmployeeComprehensivePage.tsx:114` — empError instanceof Error always true
`empError instanceof Error ? empError.message : 'Unknown error'` — `error` dari react-query `Error | null`, `instanceof` always true saat truthy. Dead branch.
Fix: `empError?.message ?? 'Unknown error'`.

#### P2-31. `EmployeeComprehensiveToolbar.tsx:131` — `as` cast no runtime validation
`e.target.value === 'ALL' ? undefined : e.target.value as 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW'` — `as` cast no runtime check. Backend return new status, cast silently widen. `mappingStatus` type include `'ALL'` (types:151) tapi toolbar emit `undefined` untuk ALL — inconsistent.
Fix: pick one representation; zod schema atau runtime check.

#### P2-32. `EmployeeComprehensivePage.tsx:60-63,68-71,74-76` — page tidak reset on filter/mode change
`handleModeChange`/`handleFiltersChange` both `setFilters` spread, tapi tidak reset `page` ke 1. Change `divisionCode` saat page 5 → tetap page 5 filter baru → likely out-of-range, backend return empty, table empty state confusing.
Fix: in `handleFiltersChange`, bila filter lain (non-page) change, reset `page: 1`.

### Cluster: Dashboard + Quality + Monitoring + Alert + services

#### P2-33. `DashboardPage.tsx:36-64` — 5 useQuery none consume isError
Fetch errors silently swallowed — cards show `'—'`/skeleton tanpa error banner.
Fix: destructure `isError`, render error state.

#### P2-34. `DashboardPage.tsx:147` vs `QualityMetrics.tsx:93` — two sources of truth quality score
Dashboard KPI show `stats?.qualityScore` (ops-summary), QualityMetrics ring show `quality.score` (quality-service `getQualityReport`). Values dapat diverge.
Fix: pick one source, pass through props.

#### P2-35. `DashboardPage.tsx:153-164` — groupedMachines BLOCKED/UNREACHABLE/DISABLED ke 'Offline' bucket
Map hanya ONLINE/STALE/WARNING ke named groups; BLOCKED/UNREACHABLE/DISABLED fall ke 'Offline' bucket — misleading label.
Fix: add explicit cases untuk BLOCKED/UNREACHABLE/DISABLED.

#### P2-36. `components/features/dashboard/components/KpiCard.tsx:54-55` — role=button tabIndex=0 tapi no onKeyDown
Keyboard user focus tapi tidak activate.
Fix: add `onKeyDown` handling Enter/Space.

#### P2-37. `MachineStatusGrid.tsx:90,92,96` — hardcoded hex untuk beberapa status, CSS vars untuk lain
`#dc2626`, `#991b1b`, `#f97316` untuk UNREACHABLE/OFFLINE/STALE, CSS vars untuk ONLINE/WARNING/BLOCKED. Inconsistent theming — tidak follow dark mode.
Fix: define `var(--error-dark)` etc.

#### P2-38. `QualityPage.tsx:48-79` — inconsistent polling
`summary`+`drift` `refetchInterval:60000`; `unmapped`/`duplicates`/`report` no interval; `machines` only `staleTime`. Same page, different refresh policies.
Fix: uniform policy atau document per-query rationale.

#### P2-39. `QualityPage.tsx:108` — isRefreshing reflect only summary query
`isRefreshing={isLoading}` only `summary`. 5 query lain ignored.
Fix: `isLoading || isUnmappedLoading || ...`.

#### P2-40. `QualityPage.tsx:221` vs `178,197` — number formatting inconsistent
`batch.total_records` pakai `.toLocaleString('id-ID')`; `occurrence_count`/`scan_count` pakai bare `numberValue()`.
Fix: wrap all counts di shared `formatNumber()`.

#### P2-41. `MonitoringDashboard.tsx:86-91` vs `DashboardPage.tsx:67-99` — KPI source inconsistency
MonitoringDashboard pakai server-side `stats.totalMachines`/`stats.onlineMachines` langsung; DashboardPage compute client-side via `machines.filter(...)`. Same metric, dua calculation path, dapat disagree.
Fix: standardize satu path.

#### P2-42. `MonitoringDashboard.tsx:21-26,63-68` vs `DashboardPage.tsx:153-164` — different machine grouping
Monitoring groups Healthy/Critical/Disabled/Warning; Dashboard groups Online/Stale/Warning/Offline. Same data, different buckets.
Fix: shared `groupMachine()` util.

#### P2-43. `quality-service.ts:54-57` — `healthy_count: summary.mappedRate` semantic mismatch
Assign percentage (0-100) ke field named `count`. `warning_count`/`critical_count` mix counts too.
Fix: rename field atau pass actual counts.

#### P2-44. `quality-service.ts:19` — syncSuccessRate return 100 saat no batches
Return 100 saat no batches exist (no failures). Misleading — 100% success dengan zero batches.
Fix: return `null`/`-1` atau `0` saat `batchTotal === 0`.

#### P2-45. `quality-service.ts:9-33` (ops-service getOpsSummary catch) — catch block fire 2 more requests
Catch block fire `/api/dashboard/stats` + `getOperationalMachines` via `Promise.all`. Bila salah reject, entire fallback fail uncaught. Cascading failure pada partial outage.
Fix: `Promise.allSettled`, default missing side.

### Cluster: router + api-client + types + layout

#### P2-46. `services/api-client.ts:9-11` — `isEnvelope` never called
Grep: no call site except definition. Dead export.
Fix: hapus.

#### P2-47. `services/api-client.ts:4-7` — `NormalizedResponse` never used
Grep: only definition. Dead type.
Fix: hapus.

#### P2-48. `types/index.ts:250-255` — legacy `ApiResponse<T>` still exported
CLAUDE.md: "ApiResponse<> dropped karena api() sudah unwrap". Type still exported. `api-client.ts` redefine private `ApiResponse` (line 21) — dua type sama nama, shadow. Confusing.
Fix: hapus `ApiResponse` dari `types/index.ts`.

#### P2-49. `types/index.ts:116-124 vs 365-374` — `AlertRule` re-declaration
`AlertRule` declared twice dengan field beda (kedua add `checkType`, `channels`). TS interface merge → silent combined. `type` vs `checkType` semantic overlap.
Fix: merge explicit ke satu interface.

#### P2-50. `types/index.ts:38-44 vs FilterBar.tsx:6-10` — dua tipe `Division`
`types/index.ts`: `Division {id;division_code;division_name;location;is_active}`. `FilterBar`: `Division {division_code;division_name;active_employees}` (no id, no is_active, with active_employees). Field beda.
Fix: satukan, buat field optional.

#### P2-51. `types/index.ts:68-78,80-86,88-95,97-114` — banyak tipe statistik overlapping dan sebagian dead
`DashboardStats`, `DashboardSummary`, `DivisionSummary`, `SyncBatch`, `SyncStatus` — grep: `SyncBatch`, `SyncStatus`, `DivisionSummary`, `DashboardSummary` tidak digunakan kecuali definisi. `DashboardStats` dipakai (ops-service). Klien kemungkinan pakai `OpsSummary` baru.
Fix: hapus yang unused, konsolidasi.

#### P2-52. `lib/api.ts:5-7` — `setToken`/`clearToken` never called
Grep: `setToken`/`clearToken` tidak digunakan. `getToken` dipakai 2x. Tidak ada login page → token functions dead code / half-baked.
Fix: hapus bila tidak ada auth flow, atau implement login.

#### P2-53. `components/features/settings/SettingsPage.tsx:6` — unused imports `Shield`, `Bell`
`Shield`, `Bell` diimpor tapi tidak di JSX (hanya `Settings`, `Clock`, `Database` dipakai).
Fix: hapus unused imports.

#### P2-54. `router.tsx:1-13` — no Suspense/lazy-loading → initial bundle freeze
All page components imported statically (eager) → initial bundle besar, FCP lambat. Tidak ada `lazy()`/`Suspense` fallback.
Fix: `lazy(() => import(...))` per page + `<Suspense fallback={...}>`.

#### P2-55. `Header.tsx:1,9` — `React.ReactNode` tanpa import React
`React.ReactNode` di line 9 tanpa `import React`. Setup TS dengan `jsx: react-jsx` bisa fail tergantung config. Rapuh.
Fix: `import type { ReactNode } from 'react'` dan pakai `ReactNode`.

---

## P3 — Minor / dead code / YAGNI

### Cluster: Matrix + Attendance + status-mapping

#### P3-1. `AttendancePage.tsx:389,435,632` — React keys fallback to index
`key={idx}`, `key={scan.scan_log_id || idx}`, `key={\`${r.employee_code}-${idx}\`}`. `employee_code` mungkin empty string → collisions.
Fix: stable unique id atau composite multiple fields.

#### P3-2. `AttendancePage.tsx:79` — typo `'Ambigious'` should be `'Ambiguous'`
Fix: spelling.

#### P3-3. `AttendancePage.tsx:76-87` — `MAPPING_STATUS_COLORS` include entries not in type
`'MANUAL'` dan `'EXACT_LONG_RAW_ID'` tidak di `MappingStatus` type union (MAPPED/UNMAPPED/NEED_REVIEW/INVALID). Dead/mismatched entries vs type.
Fix: align entries dengan type atau widen type.

#### P3-4. `services/attendance-service.ts:392-393` — asymmetric fallback checkIn vs checkOut
`checkInAt` fallback include `scan_time` tapi `checkOutAt` chain (`final_check_out ?? check_out_at ?? null`) tidak; asymmetric.
Fix: mirror chain (add scan_time atau raw_record_time consistently).

#### P3-5. `AttendanceMatrixPage.tsx:322` — row key fallback rowIndex
`${row.machineCode ?? 'row'}-${rowIndex}` saat `identityKey`/`employeeCode`/`rawDeviceUserId` all empty; rowIndex-based collisions possible.
Fix: require non-empty `identityKey` dari backend grouping.

#### P3-6. `AttendancePage.tsx:516-554` — `filtered` array rebuilt every render without useMemo
Re-filter full dataset each render (e.g. pagination state change).
Fix: `useMemo(() => data?.filter(...) ?? [], [data, search, statusFilter])`.

#### P3-7. `services/status-mapping.ts:92-93` — duplicate cell codes
`SCAN_ON_OFFDAY_INCOMPLETE`→'X' duplicates `SCAN_ON_OFFDAY`→'X'; `SCAN_ON_HOLIDAY_INCOMPLETE`→'Z' duplicates `SCAN_ON_HOLIDAY`→'Z'. Loses incomplete distinction.
Fix: distinct codes (e.g. 'x'/'z') atau document intentional collapse.

#### P3-8. `AttendanceMatrixPage.tsx:124` — `const today = new Date()` in render body
Recomputed each render, used for `isCurrentMonth` and year `<option>` list. Harmless tapi non-deterministic across renders near midnight.
Fix: `useState(() => new Date())` atau module-level const.

#### P3-9. `AttendancePage.tsx:104-110` — maskNik edge case length 8
`nik.length === 8` → `maskLength = 0` → return original nik, no masking.
Fix: require `nik.length > 8` untuk mask, else show masked-with-min-4-stars atau '—'.

### Cluster: Machines + clock-health

#### P3-10. `MachineDetailModal.tsx:231-250` — modal a11y gaps
No Escape-to-close, no focus trap, no `role="dialog"`/`aria-modal`, no `aria-labelledby`, no body scroll lock. `MachineClockHealthPage` modal (112-184) same gaps + overlay div no onClick.
Fix: `useEffect` Escape key + `role="dialog"`; overlay `onClick={onClose}` (clock-health).

#### P3-11. `MachinesPage.tsx:119-121,126-127` — `refetchIntervalInBackground: true` polling 16 machines 60s tab hidden
Background polling wasteful; scheduler poll (15s) no `refetchIntervalInBackground` → stop saat hidden — inconsistent.
Fix: drop `refetchIntervalInBackground` (default false) untuk both, atau set both true deliberately.

#### P3-12. `MachineDetailModal.tsx:855` — `new Date(log.scan_time)` tanpa timezone
Memory note "timezone-double-offset-fix" bilang display must use `raw_record_time` (UTC) + WIB conversion; here `log.scan_time` parse as local. Potential double-offset.
Fix: use `raw_record_time` field + explicit WIB format.

#### P3-13. `MachinesPage.tsx:246,441` — scheduler queried twice
MachinesPage (123-127) dan SchedulerStatus (22-26) both poll `/api/scheduler/status` under same `queryKey` `['scheduler-status']` — tapi different `refetchInterval` (15s vs 10s). React Query dedupe by key, intervals conflict; last mount wins.
Fix: single `refetchInterval` source.

#### P3-14. `MachineClockHealthPage.tsx:21-25` — `refetchInterval: 60000` no inBackground, no error state
`isLoading` only true on first load; on refetch error, table silently keep stale data, no error banner. Same pattern `MachinesPage` (no `isError` on operational-machines query).
Fix: surface `isError` dengan retry banner.

#### P3-15. `MachineDetailModal.tsx:1072-1555` — ~480 lines `<style>{`...`}</style>` per modal mount
Re-inject same CSS blob every modal open / re-render.
Fix: move to `.css` file atau CSS module.

#### P3-16. `services/machine-service.ts:5-22` — `NETWORK_GROUPS` hardcoded magic map
16 machine codes → network labels duplicated dari backend config. Drift bila backend add machine.
Fix: have `/api/machines` return `network_group`; drop map.

### Cluster: Employees-comprehensive

#### P3-17. `EmployeeComprehensiveToolbar.tsx:26-35,46` — magic numbers
`300` (debounce ms) appear twice (hook default + call site). Page size `50` magic di `EmployeeComprehensivePage.tsx:62` dan service `employee-comprehensive.service.ts:25,74`. Scan page size `20` magic di `EmployeeIdentityDrawer.tsx:112`.
Fix: extract named consts `DEBOUNCE_MS=300`, `PAGE_SIZE=50`, `SCAN_PAGE_SIZE=20`.

#### P3-18. `EmployeeDetailModal.tsx` (whole file) + `index.ts:5` — dead export
`EmployeeDetailModal` exported dari barrel tapi never imported/rendered. `AttendancePage.tsx` punya local component coincidentally named `EmployeeDetailModal`. Dead export. Also duplicate logic dengan `EmployeeIdentityDrawer`.
Fix: delete `EmployeeDetailModal.tsx` + barrel line; consolidate on `EmployeeIdentityDrawer`.

#### P3-19. `employee-comprehensive.service.ts:90-98 vs employee-detail.service.ts:49-55` — dua query-key factories
`employeeComprehensiveKeys`, `employeeDetailKeys` untuk overlapping "employee detail" domain. `EmployeeDetailModal` (if used) pakai `employeeDetailKeys`, `EmployeeIdentityDrawer` pakai inline keys `['employee-comprehensive','detail',...]` bukan exported `employeeComprehensiveKeys.detail`. Key factory exported tapi unused — drawer hand-rolls keys.
Fix: pakai `employeeComprehensiveKeys.detail(...)` di drawer; delete unused `employeeDetailKeys` bila `EmployeeDetailModal` deleted.

#### P3-20. `EmployeeComprehensiveTable.tsx:552,558,560,578` — skeleton key fallback noisy
`key={col.id ?? col.accessorKey ?? \`col-${index}\`}`. Column defs here no `id` dan `accessorKey` string → fallback `col-${index}` never trigger, tapi chain noisy. Index as key flagged react-hooks lint.
Fix: simplify `key={col.id ?? col.accessorKey}`; drop index fallback.

#### P3-21. `EmployeeComprehensiveTable.tsx:626-771` — ~145 lines inline `<style>` per render
Same pattern di `EmployeeComprehensivePage.tsx:209-311`, `EmployeeComprehensiveToolbar.tsx:172-320`, `EmployeeDetailModal.tsx:598-1244`, `EmployeeIdentityDrawer.tsx:603-1073`. Massive CSS duplication across files (`badge`, `mono`, `info-label`, `info-value`, `animate-spin`, `tab-count` defined 3-5x each).
Fix: move ke single `employees-comprehensive.css` imported once; atau CSS modules.

#### P3-22. `employee-comprehensive.service.ts:9` — dead import `ApiResponse`
Imported tapi never used di service file.
Fix: remove `ApiResponse` dari import list.

#### P3-23. `EmployeeIdentityDrawer.tsx:110-112` — scanPage not reset on employee change
Open employee A → navigate scan page 3 → close → open employee B → `scanPage` still 3, tapi employee B mungkin < 3 pages → `getScans` fetch page 3, empty, show "Tidak ada scan history" padahal page 1 ada data.
Fix: `useEffect([employee?.identityKey, employee?.machineCode]) => setScanPage(1)`, juga reset `activeTab` ke `'identity'`.

### Cluster: Dashboard + Quality + Monitoring + Alert + services

#### P3-24. `DashboardPage.tsx:107` — magic number `16` hardcoded
Machine count fallback.
Fix: const `TOTAL_MACHINES_EXPECTED = 16` atau drop fallback.

#### P3-25. `DashboardPage.tsx:181,245` — `key={i}` dan `key={index}`
Index as React key.
Fix: stable keys (card.label, item string).

#### P3-26. `components/features/dashboard/components/MachineStatusGrid.tsx` (whole file) — dead code
Exported via barrel `index.ts` tapi never imported (grep: only self + barrel ref). No page render.
Fix: delete file + barrel export, atau wire into page.

#### P3-27. `MachineStatusGrid.tsx:45,55,49` — magic numbers
`60*60*1000` (stale threshold, duplicated) dan `80` (quality threshold) inline.
Fix: named consts `STALE_MS`, `QUALITY_WARN_THRESHOLD`.

#### P3-28. `QualityMetrics.tsx:30-61` — tiga switch statements same field
`getOverallIcon`/`getOverallColor`/`getOverallLabel` on same `overall_status` — code smell, O(n) branches × 3.
Fix: single lookup table `{healthy:{icon,color,label}, ...}`.

#### P3-29. `QualityMetrics.tsx:112` — `key={index}` metrics list
Fix: `key={metric.name}`.

#### P3-30. `QualityMetrics.tsx:131` — `m.recommendations![0]` redundant non-null assertion
After `.filter(m => m.recommendations && m.recommendations.length > 0)` — assertion redundant.
Fix: `m.recommendations[0]` (filter guarantees).

#### P3-31. `QualityPage.tsx:83,92` — `as Array<Record<string, unknown>>` casts
Weak typing, no shape safety.
Fix: define `UnmappedItem`/`DuplicateItem` types.

#### P3-32. `AlertPage.tsx:14,21` — inline `api<Alert[]>` in queryFn
Other pages delegate ke service modules. Inconsistent layering.
Fix: move ke `alert-service.ts`.

#### P3-33. `AlertPage.tsx:24-52` — helpers defined inside component
`getSeverityIcon`/`getSeverityVariant`/`formatDate` recreated every render.
Fix: hoist ke module scope.

#### P3-34. `AlertPage.tsx:190-198` — global `<style>` inject `.spin` class
Leaks globally, collision risk.
Fix: move ke CSS file atau scope class name.

#### P3-35. `quality-service.ts:234,242` — `Promise<any>` return types
`applyCorrection`/`rollbackCorrection`.
Fix: define `CorrectionResult` type.

#### P3-36. `quality-service.ts:24` — quality score weights inline magic numbers
`0.5 + 0.25 + 0.15 + 0.1` inline.
Fix: `const W = { mapped:0.5, sync:0.25, online:0.15, dup:0.1 }`.

#### P3-37. `dashboard/components/index.ts` — barrel unused
Exports `KpiCard`/`MachineStatusGrid`/`QualityMetrics`, tapi semua 3 imported directly (`./components/KpiCard` etc.). `MachineStatusGrid` sendiri never rendered.
Fix: delete barrel + dead `MachineStatusGrid.tsx`.

### Cluster: router + api-client + types + layout

#### P3-38. `types/index.ts:349-350` — `MachineStatusVariant` unused
`BadgeVariant` dipakai (Badge.tsx), `MachineStatusVariant` tidak.
Fix: hapus `MachineStatusVariant`.

#### P3-39. `types/index.ts:316-348` — `UnmappedRecord`, `DuplicateRecord`, `LiveFeedItem`, `SyncMachineStatus` sebagian dead
`SyncMachineStatus` mirip `SyncStatus` (duplikasi). `UnmappedRecord`/`DuplicateRecord`/`LiveFeedItem` — grep tidak menemukan penggunaan di komponen.
Fix: hapus yang dead.

#### P3-40. `types/index.ts:188-218` — `ScanRecord` vs `RawScanLog` overlapping
Dua tipe record scan dengan field hampir identik. Satu camelCase, satu snake_case.
Fix: konsolidasi, pilih satu konvensi.

#### P3-41. `Sidebar.tsx:57` vs `SettingsPage.tsx:76` — version hardcoded berbeda
Sidebar "v1.0" vs SettingsPage "v1.0.0".
Fix: satukan sumber versi.

#### P3-42. `services/api-client.ts:17-21` — `normalizeArray` unused
Grep: no call site.
Fix: hapus.

#### P3-43. `services/api-client.ts:23-26` — `toNumber` redundant bila semua caller aman
YAGNI bila semua pemanggilan sudah aman.
Fix: pertahankan bila banyak yang pakai, bila tidak hapus.

#### P3-44. `router.tsx:21-22` — `index: true` dan `path: 'dasbor'` render DashboardPage twice
Rute ganda untuk same page. Tidak merusak, YAGNI.
Fix: redirect salah satu.

#### P3-45. `SettingsPage.tsx:76` — version hardcoded "v1.0.0"
Fix: baca dari `package.json` / konstanta.

#### P3-46. `types/index.ts:8` — `Machine.access_status: string` too loose
Padahal ada `MachineOperationalStatusCode` union. Field status tidak pakai.
Fix: pakai union.

#### P3-47. `lib/api.ts:69-89` — `downloadFile` no envelope unwrap, no error handling
Cuma cek `response.ok`, tidak handle JSON envelope, error message hilang. Tidak call `clearToken` saat 401.
Fix: sama seperti `api()`.

#### P3-48. `lib/api.ts:24-31` — `Content-Type: application/json` always set even for GET (no body)
Header hardcode, bahkan untuk GET tanpa body. Misleading.
Fix: only set saat ada `body`.

#### P3-49. `types/index.ts:594-613` — `ApiEnvelope.meta` index signature overlap
`meta` punya field spesifik (page, total, source, quality_score) DAN `[key:string]:unknown` → TS tidak bisa distinguish, akses `.page` bisa unknown.
Fix: pisah `meta known` vs `extra: Record<string,unknown>`.

#### P3-50. `main.tsx:25-29` — `document.getElementById('root')!` non-null assertion
`!` silence kemungkinan root null. Aman praktik tapi tidak verified.
Fix: cek explicit atau pesan error jelas.

#### P3-51. `DataTable.tsx:4-9` — `Column.key: keyof T | string` weakens typing
`key` bisa `string` apa pun → `row[col.key as keyof T]` unsafe cast. Bila key tidak ada di T, undefined silent.
Fix: generic `Column<T, K extends keyof T = keyof T>`.

#### P3-52. `Sidebar.tsx:57` — version hardcoded "v1.0"
Fix: same source dengan SettingsPage.

#### P3-53. `FilterBar.tsx:196-471` — CSS inline via `<style>` tag every render
275 lines CSS inject ke `<style>` setiap render FilterBar → DOM repeated, tidak memo.
Fix: move ke `styles.css` / CSS module.

#### P3-54. `MonitoringDashboard.tsx:151` — `key={item}` recommendation string as key
Duplicate strings collide.
Fix: `key={index + '-' + item}` atau `key={item + index}`.

#### P3-55. `SettingsPage.tsx:68` — `localhost:8004` hardcoded di UI label
Label "API Backend: localhost:8004" hardcoded, tidak baca `VITE_API_BASE_URL`. Tampilkan URL internal ke user, salah saat production (nginx / domain). Info leak + misleading label.
Fix: baca `import.meta.env.VITE_API_BASE_URL` atau hapus label.

---

## Cross-cutting themes

1. **Timezone fragility** (P1-1, P1-2, P2-5, P2-6, P2-7, P3-12): `raw_record_time` (UTC) vs `scan_time` (already WIB) confusion still present di multiple paths. Memory note "timezone-double-offset-fix" violated di attendance-service fallback chain + matrix formatTimeWib. Fix canonical: semua display baca `raw_record_time` + explicit `timeZone:'Asia/Jakarta'` di formatter.

2. **Status vocabulary fragmentation** (P1-4, P2-3, P2-31, P3-3, P3-7): tiga status vocabulary (PRESENT/ABSENT/NO_DATA vs HADIR/TIDAK_HADIR vs normalized) coexist. `AttendanceStatus` redeclared di FilterBar vs types. Fuzzy matcher silent fail. Fix: satu canonical status→label map keyed on `IntelligenceAttendanceStatus`.

3. **No `isError` consumption anywhere** (P2-33, P3-14, cross-cutting): 4 pages, ~15 queries, zero error UI. Fetch errors silently swallowed — cards show skeleton/`'—'` forever. Fix: shared `<ErrorBanner isError={...} />` pattern.

4. **Envelope unwrap regression** (P1-12): same class of bug memory FR-009 (ApiResponse wrapper dropped) resurface di `EmployeeIdentityDrawer` — access `.data` pada already-unwrapped result. Drawer detail/scans always empty. High user-impact.

5. **CSS `var(--x) + hex-alpha` invalid** (P1-30, P1-31, P1-32): 3 components (`KpiCard`, `MachineStatusGrid`, `AlertPage`) construct `\`var(--success)15\`` — invalid CSS, background/border silently dropped. Fix: `color-mix(in srgb, var(--x) 15%, transparent)`.

6. **Type duplication / drift** (P2-49, P2-50, P2-51, P2-48, P3-38, P3-39, P3-40): `AlertRule` re-declared, `Division` dua definisi, `ApiResponse` legacy masih ada, `ScanRecord` vs `RawScanLog` overlap, banyak tipe statistik dead. Fix: konsolidasi `types/index.ts`, hapus dead.

7. **Inline `<style>` per render** (P3-15, P3-21, P3-53, P3-34): ~2000 lines CSS duplicated across 8+ files, re-injected setiap render. Fix: extract ke CSS files / modules.

8. **Dead code** (P2-46, P2-47, P2-52, P3-18, P3-26, P3-37, P3-42, P3-43): `isEnvelope`, `NormalizedResponse`, `setToken`/`clearToken`, `EmployeeDetailModal`, `MachineStatusGrid`, barrel exports, `normalizeArray`, `MachineStatusVariant` — semua unused. Fix: delete.

9. **Hardcoded values** (P1-11, P1-27, P2-37, P3-16, P3-24, P3-27, P3-36, P3-41, P3-45, P3-46, P3-55): date range, offset minutes, executedBy, inline SchedulerInfo/Division types, hex colors, machine count, network groups, weights, versions, access_status loose, localhost URL. Fix: env vars / named consts / imported types.

10. **a11y gaps** (P1-26, P2-23, P2-36, P3-10): dropdown/modal tanpa Escape, focus trap, aria-expanded, role=dialog, body scroll lock. Keyboard user stuck. Fix: standard a11y hooks.

---

## Top priority fixes (urutan impact)

1. **P0-3** — error handler lempar HTTP status sebelum baca body (user frustrasi, 401 loop)
2. **P0-1** — JWT localStorage (XSS)
3. **P0-2** — fetch tanpa AbortController (race, memory leak)
4. **P1-12** — EmployeeIdentityDrawer detail/scans always empty (envelope unwrap regression, user-facing broken)
5. **P1-1** — checkInAt fallback reintroduce double-offset timezone bug
6. **P1-5** — alfa cell double-count di noData bukan absent (KPI salah)
7. **P1-30/31/32** — CSS `var(--x)+hex-alpha` invalid di 3 components (styling broken)
8. **P1-33** — `liveOnlineMachines ?? liveOnlineMachines` typo (field selalu 0 dari snake_case API)
9. **P1-21** — DataTable key fallback numeric index (render bug saat sort/filter)
10. **P1-6/7** — MachineDetailModal ignore `real_access_status`/`display_status`, recompute staleness client-side (defeats real-time status fix)

---

Audit selesai. READ-ONLY, tidak ada file diedit. Semua temuan di atas.
