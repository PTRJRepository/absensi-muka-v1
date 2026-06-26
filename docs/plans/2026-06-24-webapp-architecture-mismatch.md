# PLAN: Ketidaksesuaian Web App vs Arsitektur Terbaru

**Tanggal:** 2026-06-24
**Status:** Draft

---

## Ringkasan Eksekutif

Setelah migrasi 056 (merge employee tables) dan sanitasi database, terdapat ketidaksesuaian antara arsitektur terbaru dengan implementasi web app frontend. Dokumen ini memetakan semua ketidaksesuaian untuk perbaikan selanjutnya.

---

## 1. Arsitektur Target (Post-Migration 056)

### 1.1 Database Schema Baru

```
┌─────────────────────────────────────────────────────────────────┐
│                    CANONICAL EMPLOYEE MODEL                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  employees (SINGLE SOURCE OF TRUTH)                            │
│  ├── id                    (PK, auto)                          │
│  ├── employee_code         (original from source)               │
│  ├── current_emp_code     (canonical: HR-verified, unique)      │
│  ├── current_emp_name     (canonical name from HR)              │
│  ├── nik                   (from db_ptrj)                       │
│  ├── hr_status             (1=active, 4=resign)                │
│  ├── hr_verified           (boolean)                             │
│  ├── hr_loc_code           (location code from HR)               │
│  ├── data_quality_status   (VALID_STANDARD_FORMAT, etc)          │
│  ├── is_active             (soft delete flag)                    │
│  ├── machine_codes         (comma-separated: "P2A,OFFICE_PGE")  │
│  └── machine_count         (INT)                                │
│                                                                  │
│  attendance_scan_logs                                          │
│  ├── id                    (PK, auto)                          │
│  ├── raw_device_user_id    (original from ZKTeco: "50066")      │
│  ├── parsed_employee_code  (via SSOT: "C0066")                  │
│  ├── current_emp_code      (resolved via employees table)        │
│  ├── employee_id          (FK → employees.id)                  │
│  ├── current_mapping_status (MAPPED, NEED_REVIEW, EXCLUDED_*)   │
│  ├── current_mapping_reason (MAPPED_VIA_EMPLOYEES_EMP_CODE, etc)│
│  └── machine_code          (which machine scanned)               │
│                                                                  │
│  attendance_imports                                            │
│  ├── employee_id           (FK → employees.id)                  │
│  ├── current_emp_code      (canonical code)                     │
│  └── final_status          (HADIR, TIDAK_HADIR, etc)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 View Baru

```sql
vw_employee_master_clean
├── employee_id
├── employee_code
├── employee_name
├── nik
├── division_code
├── hr_loc_code
├── hr_status
├── hr_verified
├── is_active
├── machine_codes        -- STRING_AGG as comma-separated
├── machine_count
├── first_seen_at
└── last_seen_at
```

### 1.3 SSOT Parser Rules (Confirmed)

| Raw ID | Length | Status | Result |
|--------|--------|--------|--------|
| `50040` | 5 | EXCLUDED | Short ID, no auto-mapping |
| `5000066` | 7 | MAPPED | `C0066` via scanner prefix 500→C |
| `500000000123` | 12 | NEED_REVIEW | Too long, manual review |
| `10044` | 5 | EXCLUDED | Short ID |

### 1.4 Data Quality Status

| Status | Meaning |
|--------|---------|
| `VALID_STANDARD_FORMAT` | Canonical employee, HR verified |
| `RAW_ID_CONTAMINATED` | Former raw ID, to be deleted |
| `SHORT_ID_EXCLUDED` | Short ID < 5 digits |
| `LONG_ID_EXCLUDED` | Long ID > 5 digits without valid prefix |
| `NEED_REVIEW` | Cannot auto-map |

---

## 2. Ketidaksesuaian Frontend

### 2.1 AttendanceMatrixPage.tsx

**File:** `frontend/src/components/features/matrix/AttendanceMatrixPage.tsx`

#### Ketidaksesuaian:

| # | Current | Target | Severity |
|---|---------|--------|----------|
| 1 | Row key: `${row.rawDeviceUserId ?? row.employeeCode}-${row.machineCode ?? ''}` | Canonical `employee_id` or `current_emp_code` | HIGH |
| 2 | `mappingStatus` uses old `mapping_status` | Should use `current_mapping_status` | HIGH |
| 3 | `LONG ID` badge shows for `rawIdLength > 5` | Already excluded in DB, may not need badge | MEDIUM |
| 4 | Status summary shows `totals.unmapped` | Should be `totals.needReview` or `totals.excluded` | MEDIUM |
| 5 | Filter options include `UNMAPPED` | Should use `NEED_REVIEW` (after sanitization) | MEDIUM |

#### Dampak:
- Row grouping mungkin salah karena menggunakan `rawDeviceUserId` sebagai key
- Mapping status tidak akurat dengan kolom lama

#### Fix Required:
```typescript
// Line 301: Change row key
// Before:
key={`${row.rawDeviceUserId ?? row.employeeCode}-${row.machineCode ?? ''}`}

// After (use canonical employee_id):
key={`${row.employeeId ?? row.employeeCode}-${row.machineCode ?? ''}`}

// Line 168: Change mapping summary
// Before:
if (row.mappingStatus === 'MAPPED') acc.mapped++;
else acc.unmapped++;

// After:
if (row.mappingStatus === 'MAPPED') acc.mapped++;
else if (row.mappingStatus === 'NEED_REVIEW') acc.needReview++;
else acc.excluded++;
```

---

### 2.2 AttendanceMatrixCell Type

**File:** `frontend/src/types/index.ts` (line 629-653)

#### Ketidaksesuaian:

| # | Current | Target | Severity |
|---|---------|--------|----------|
| 1 | `interface AttendanceMatrixRow` has `employeeCode` | Should have `employeeId` (canonical PK) | HIGH |
| 2 | No `currentEmpCode` field | Should include canonical `currentEmpCode` | HIGH |
| 3 | `mappingStatus` type doesn't include `EXCLUDED_*` | Should extend for new statuses | MEDIUM |

#### Fix Required:
```typescript
// Add to AttendanceMatrixRow interface:
export interface AttendanceMatrixRow {
  employeeId?: number;           // NEW: canonical FK
  currentEmpCode?: string;        // NEW: canonical code from HR
  employeeCode: string;           // Keep for display (old field)
  // ... existing fields
}
```

---

### 2.3 attendance-service.ts

**File:** `frontend/src/services/attendance-service.ts`

#### Ketidaksesuaian:

| # | Current | Target | Severity |
|---|---------|--------|----------|
| 1 | `groupMatrixRecords()` uses `raw_device_user_id` as primary grouping key | Should group by `employee_id` canonical | HIGH |
| 2 | Status normalization uses old status values | Should normalize to `current_mapping_status` | MEDIUM |
| 3 | `hasDirectLongMapping` logic checks old `reason` patterns | Should check `current_mapping_reason` | MEDIUM |

#### Dampak:
- Matrix display mungkin menduplikasi employee yang sama
- Grouping tidak mengikuti model canonical employee

#### Fix Required:
```typescript
// Line 213: Change grouping key
// Before:
const key = `${machineCode || 'database'}:${rawId || mappedEmployeeCode || rawEmployeeCode || 'unknown'}`;

// After:
const key = `${machineCode || 'database'}:${record.employee_id || mappedEmployeeCode || rawId || 'unknown'}`;
```

---

### 2.4 EmployeeComprehensivePage.tsx

**File:** `frontend/src/components/features/employees-comprehensive/EmployeeComprehensivePage.tsx`

#### Ketidaksesuaian:

| # | Current | Target | Severity |
|---|---------|--------|----------|
| 1 | KPI `unmapped` count | Should be `needReview` + `excluded` | MEDIUM |
| 2 | Mode toggle shows "Unmapped" in filter | Should show "Need Review" | MEDIUM |
| 3 | KPI `nameMissing` calculation | Should use `current_emp_name` availability | LOW |

#### Fix Required:
```typescript
// Line 130: Change KPI label
// Before:
value={kpis?.unmapped ?? '-'}
label="Unmapped"

// After:
value={(kpis?.unmapped ?? 0) + (kpis?.needReview ?? 0)}
label="Belum Canonical"
```

---

### 2.5 EmployeeComprehensiveRow Type

**File:** `frontend/src/types/index.ts` (line 158-175)

#### Ketidaksesuaian:

| # | Current | Target | Severity |
|---|---------|--------|----------|
| 1 | `currentEmpCode` is optional | Should be primary key for display | HIGH |
| 2 | `employeeCode` is optional | Ambiguous - which code? | HIGH |
| 3 | `identityKey` is string | Should clearly indicate source | MEDIUM |

#### Fix Required:
```typescript
export interface EmployeeComprehensiveRow {
  identityKey: string;
  
  // CANONICAL (from employees table - HR verified)
  currentEmpCode: string | null;   // PRIMARY: canonical employee code
  employeeId?: number;              // NEW: FK to employees.id
  
  // LEGACY (for reference only)
  rawDeviceUserId: string;          // Raw from ZKTeco machine
  parsedEmployeeCode: string | null; // Via SSOT parser
  employeeCode: string | null;      // Original/legacy code
  
  // NAMES
  employeeName: string | null;      // Canonical name from HR
  zktecoUserName: string | null;   // Name from machine (may differ)
  
  // METADATA
  nik: string | null;
  machineCode: string;
  divisionCode: string | null;
  gangCode: string | null;
  
  // MAPPING
  mappingStatus: 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW' | 'EXCLUDED_SHORT_ID' | 'AMBIGUOUS';
  mappingReason: string | null;
  
  // SCAN STATS
  scanCount: number;
  firstScanAt: string | null;
  lastScanAt: string | null;
}
```

---

### 2.6 Types - MappingStatus

**File:** `frontend/src/types/index.ts` (line 547)

#### Ketidaksesuaian:

| # | Current | Target |
|---|---------|--------|
| 1 | `MappingStatus = 'MAPPED' \| 'UNMAPPED' \| 'NEED_REVIEW' \| 'INVALID'` | Should add: `'EXCLUDED_SHORT_ID' \| 'EXCLUDED_LONG_ID'` |

---

### 2.7 MachineDetailModal

**File:** `frontend/src/components/features/machines/components/MachineDetailModal.tsx`

#### Ketidaksesuaian:

| # | Current | Target | Severity |
|---|---------|--------|----------|
| 1 | Shows `employee_code` from `machine_user_map` | Should use `current_emp_code` from employees | HIGH |
| 2 | Dual mode toggle | Architecture baru: 1 employee = many machines (no dual mode needed) | MEDIUM |

#### Note:
Dengan arsitektur baru, employee yang sama di banyak mesin ditampilkan sebagai 1 baris dengan `machine_codes` array, bukan duplicate rows per mesin.

---

### 2.8 Dashboard KPIs

**File:** `frontend/src/components/features/dashboard/DashboardPage.tsx`

#### Ketidaksesuaian:

| # | Current | Target | Severity |
|---|---------|--------|----------|
| 1 | Shows "Unmapped count" | Should show "Uncanonical" = unlinked to employees.id | MEDIUM |
| 2 | Quality score calculation | Should use new `data_quality_status` field | MEDIUM |

---

## 3. Ketidaksesuaian Backend API

### 3.1 attendance.routes.ts

**File:** `src/api/routes/attendance.routes.ts`

#### Sudah Benar:

✅ `resolvedEmployeeCodeSql()` - correctly resolves to `current_emp_code`
✅ `resolvedEmployeeNameSql()` - correctly resolves to `current_emp_name`
✅ `resolvedMappingReasonSql()` - uses new `current_mapping_reason`

#### Perlu Diperbaiki:

| # | Issue | Severity |
|---|-------|----------|
| 1 | `attendance_scan_logs` query di `datamesin` mode masih grouping by `raw_device_user_id` | HIGH |
| 2 | `vw_attendance_monthly_matrix` view mungkin belum updated | HIGH |

#### Verifikasi Needed:
```bash
# Cek view definition
SELECT VIEW_DEFINITION 
FROM INFORMATION_SCHEMA.VIEWS 
WHERE TABLE_NAME = 'vw_attendance_monthly_matrix'
```

---

### 3.2 employees.routes.ts

**File:** `src/api/routes/employees.routes.ts`

#### Sudah Benar:

✅ `/api/employees` - filter `data_quality_status = 'VALID_STANDARD_FORMAT'`
✅ `/api/employees/:id/detail` - includes `current_emp_code`, `current_emp_name`
✅ `/api/employees/master-clean` - uses `vw_employee_master_clean`

#### Perlu Diperbaiki:

| # | Issue | Severity |
|---|-------|----------|
| 1 | `/api/employees-comprehensive/*` endpoints belum dicek | MEDIUM |

---

## 4. Ketidaksesuaian Views

### 4.1 vw_attendance_monthly_matrix

**Issue:** View ini mungkin masih menggunakan kolom lama (`employee_code`, `mapping_status`) bukan kolom baru (`employee_id`, `current_emp_code`, `current_mapping_status`).

**Cek:**
```sql
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'vw_attendance_monthly_matrix'
ORDER BY ORDINAL_POSITION;
```

**Target Columns:**
- `employee_id` (canonical FK)
- `current_emp_code` (canonical code)
- `current_mapping_status` (MAPPED, NEED_REVIEW, EXCLUDED_*)
- `current_mapping_reason`

---

## 5. Priority Fix Order

### Phase 1: Critical (Affects Core Functionality)

1. **[HIGH] Update AttendanceMatrixPage row grouping**
   - File: `frontend/src/components/features/matrix/AttendanceMatrixPage.tsx`
   - Fix: Use `employee_id` or `current_emp_code` as row key

2. **[HIGH] Update attendance-service.ts grouping logic**
   - File: `frontend/src/services/attendance-service.ts`
   - Fix: Group by canonical employee, not raw_device_user_id

3. **[HIGH] Verify vw_attendance_monthly_matrix view**
   - File: Migration needed or view recreation
   - Fix: Ensure view uses `current_emp_code` and `employee_id`

### Phase 2: Important (Data Accuracy)

4. **[MEDIUM] Update types definitions**
   - File: `frontend/src/types/index.ts`
   - Add: `currentEmpCode`, `employeeId` to interfaces

5. **[MEDIUM] Update MappingStatus type**
   - File: `frontend/src/types/index.ts`
   - Add: `EXCLUDED_SHORT_ID`, `EXCLUDED_LONG_ID` statuses

6. **[MEDIUM] Update EmployeeComprehensivePage KPIs**
   - File: `frontend/src/components/features/employees-comprehensive/EmployeeComprehensivePage.tsx`
   - Fix: Show "Belum Canonical" instead of "Unmapped"

### Phase 3: Polish (UI/UX)

7. **[LOW] Update MachineDetailModal**
   - File: `frontend/src/components/features/machines/components/MachineDetailModal.tsx`
   - Consider: Show 1 employee = many machines pattern

8. **[LOW] Update Dashboard KPIs**
   - File: `frontend/src/components/features/dashboard/DashboardPage.tsx`
   - Fix: Use new quality metrics

---

## 6. Testing Checklist

Setelah fix diterapkan, verifikasi:

### Database Level:
```sql
-- 1. Canonical employee count
SELECT COUNT(*) FROM employees WHERE data_quality_status = 'VALID_STANDARD_FORMAT';
-- Expected: ~1788

-- 2. Scan logs linked to canonical employees
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN employee_id IS NOT NULL THEN 1 ELSE 0 END) as linked,
  SUM(CASE WHEN current_mapping_status = 'MAPPED' THEN 1 ELSE 0 END) as mapped
FROM attendance_scan_logs;

-- 3. Matrix view data
SELECT COUNT(DISTINCT employee_code) FROM vw_attendance_monthly_matrix WHERE attendance_date >= '2026-06-01';
```

### Frontend Level:
- [ ] Matrix page loads without errors
- [ ] Employee grouping is correct (1 employee = 1 row per day)
- [ ] Mapping status badges show correct values
- [ ] Search by employee code works
- [ ] Filter by mapping status works
- [ ] Employee comprehensive page KPIs are accurate

---

## 7. Related Files

### Frontend Files to Modify:
- `frontend/src/types/index.ts`
- `frontend/src/services/attendance-service.ts`
- `frontend/src/components/features/matrix/AttendanceMatrixPage.tsx`
- `frontend/src/components/features/employees-comprehensive/EmployeeComprehensivePage.tsx`
- `frontend/src/components/features/machines/components/MachineDetailModal.tsx`
- `frontend/src/components/features/dashboard/DashboardPage.tsx`

### Backend Files to Verify:
- `src/api/routes/attendance.routes.ts`
- `src/api/routes/employees.routes.ts`
- `migrations/058_backfill_scan_logs_mapping.sql`

### Database Objects to Check:
- `vw_attendance_monthly_matrix` (view)
- `vw_employee_master_clean` (view)
- `employees` table columns
- `attendance_scan_logs` columns

---

## 8. Open Questions

1. **Q: Apakah `machine_user_map` table masih digunakan?**
   - A: Setelah migration 056, table ini tidak digunakan lagi. Cek apakah ada FK masih aktif.

2. **Q: Bagaimana dengan employee yang resign (Status 4)?**
   - A: Mereka tetap ada di `employees` dengan `is_active = 0` atau `hr_status = '4'`

3. **Q: Apakah `attendance_imports` sudah menggunakan `employee_id` FK?**
   - A: Perlu diverifikasi dengan migration 046/049

---

**Last Updated:** 2026-06-24
**Next Action:** Mulai Phase 1 - Critical fixes
