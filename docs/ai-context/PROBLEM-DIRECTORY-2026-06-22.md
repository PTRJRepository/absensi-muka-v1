# PROBLEM DIRECTORY - 2026-06-22

## Overview
Dokumentasi problem yang ditemukan saat debugging aplikasi Absensi Muka.

---

## PRIMARY FOCUS: Matriks Absensi Bulanan - Semua Off Day

### Severity: CRITICAL

### Impact
- Semua employee menampilkan status "OFF_DAY" di matriks bulanan
- User tidak bisa melihat kehadiran aktual karyawan

### Root Cause: Convention Mismatch di `attendance_work_config`

**Backend expectation** (`src/api/routes/attendance.routes.ts` lines 108-109):
```javascript
// JavaScript standard: 0=Sunday, 1=Monday, ..., 6=Saturday
function weekDayIndexSql(dateExpression: string) {
  return `(ABS(DATEDIFF(DAY, '19000107', ${dateExpression})) % 7)`;
}
```

**Seed script reality** (`_dev_utils/src/init-attendance-tables.ts` lines 210-218):
```javascript
// WRONG! Uses 1=Monday..7=Sunday
const configs = [
  [1, "Monday",    420, 1],  // Backend expects 1=Monday ✓
  [2, "Tuesday",   420, 1],
  [3, "Wednesday", 420, 1],
  [4, "Thursday",  420, 1],
  [5, "Friday",    300, 1],
  [6, "Saturday",    0, 0],
  [7, "Sunday",      0, 0],  // WRONG! Backend expects 0 for Sunday
];
```

### Data Flow Diagram

```
User loads Matrix Page
        │
        ▼
GET /api/attendance/monthly-matrix-traceable
        │
        ▼
Backend: loadWorkConfigRows()  ──► attendance_work_config table
        │
        ▼
weekDayIndexSql(date) → day_of_week (0=Sunday..6=Saturday)
        │
        ▼
Lookup in workMap[day_of_week]
        │
        ▼
Status Logic (attendance.routes.ts lines 666-682):
  1. hasManual ? correction_status
  2. expectedStatus === 'HOLIDAY' ? 'HOLIDAY'
  3. expectedStatus === 'OFF_DAY' ? 'OFF_DAY'     ◄── THE ISSUE
  4. hasImport ? import_status
  5. rawScanCount >= 2 ? 'HADIR'
  6. rawScanCount === 1 ? 'TIDAK_HADIR'
  7. default ? 'NO_DATA'
```

### Why All Off Day?

**Fallback logic** (`attendance.routes.ts` lines 144-151):
```javascript
return [
  { day_of_week: 0, is_workday: 0, day_name: 'Sunday' },    // OFF_DAY
  { day_of_week: 6, is_workday: 0, day_name: 'Saturday' },   // OFF_DAY
];
```

Fallback hanya mendefinisikan 2 hari sebagai OFF_DAY. Jika konfigurasi salah atau kosong:
- Sunday (0) → OFF_DAY
- Saturday (6) → OFF_DAY
- Monday-Friday → WORKDAY (jika ada data scan)

**Kemungkinan kenapa semua OFF_DAY:**
1. `attendance_work_config` table kosong
2. Konvensi `day_of_week` tidak cocok (7=Sunday vs 0=Sunday)
3. Tabel tidak ada atau kolom tidak cocok

### Solution

**Step 1: Cek data di database**
```sql
-- Cek apakah tabel ada dan ada datanya
SELECT * FROM attendance_work_config ORDER BY day_of_week;

-- Cek apakah day_of_week convention benar
-- Seharusnya: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
```

**Step 2: Fix seed data**
```sql
-- Delete existing wrong data
DELETE FROM attendance_work_config;

-- Insert dengan convention yang benar (0=Sunday..6=Saturday)
INSERT INTO attendance_work_config (day_of_week, day_name, working_minutes, is_workday) VALUES
(0, 'Sunday', 0, 0),        -- OFF_DAY
(1, 'Monday', 420, 1),      -- WORKDAY
(2, 'Tuesday', 420, 1),    -- WORKDAY
(3, 'Wednesday', 420, 1),  -- WORKDAY
(4, 'Thursday', 420, 1),   -- WORKDAY
(5, 'Friday', 300, 1),     -- WORKDAY (shorter hours)
(6, 'Saturday', 0, 0);     -- OFF_DAY
```

**Step 3: Fix seed script**
File: `_dev_utils/src/init-attendance-tables.ts`
```javascript
// CORRECT convention: 0=Sunday, 1=Monday, ..., 6=Saturday
const configs = [
  [0, "Sunday",      0, 0],    // OFF_DAY
  [1, "Monday",    420, 1],    // WORKDAY
  [2, "Tuesday",   420, 1],    // WORKDAY
  [3, "Wednesday", 420, 1],    // WORKDAY
  [4, "Thursday",  420, 1],    // WORKDAY
  [5, "Friday",    300, 1],    // WORKDAY
  [6, "Saturday",    0, 0],    // OFF_DAY
];
```

### Quick Diagnostic (Browser Console)
```javascript
fetch('/api/attendance/monthly-matrix-traceable?year=2026&month=6&page=1')
  .then(r => r.json())
  .then(data => {
    console.log('expected_status values:', [...new Set(data.rows?.map(r => r.expected_status))]);
    console.log('Sample row:', data.rows?.[0]);
  });
```

Expected weekdays: `expected_status = 'WORKDAY'`
Expected weekends: `expected_status = 'OFF_DAY'`

---

## SECONDARY: API `/api/machines` - 500 Internal Server Error

### Severity: CRITICAL

### Impact
- Frontend tidak bisa fetch data mesin
- Berdampak ke mesin page saja, bukan matriks

### Root Cause: Missing Database Column

**Migration belum di-run:** Kolom `live_connected` belum ada di database.

**File terkait:**
- `src/api/routes/machines.routes.ts` (line 87) - query SELECT menggunakan `m.live_connected`
- `migrations/026_add_live_connected.sql`

### Solution
```bash
npm run db:migrate
```

---

## TERTIARY Issues

### React Hydration Error - Nested Button
**File:** `frontend/src/components/features/machines/MachinesPage.tsx` (lines 340-408)
**Solution:** Ganti outer `<button>` dengan `<div role="button">`

### Duplicate React Keys
**File:** `frontend/src/components/features/machines/components/MachineDetailModal.tsx` (line 665)
**Solution:** `key={mapped-${user.raw_id}-${machine.machine_code}}`

---

## Summary Table

| Priority | Problem | Severity | Root Cause |
|----------|---------|----------|------------|
| **1** | Matriks semua OFF_DAY | **CRITICAL** | `attendance_work_config` convention salah (7=Sunday vs 0=Sunday) |
| **2** | `/api/machines` 500 | CRITICAL | Missing `live_connected` column |
| **3** | Button Nesting | MEDIUM | `<button>` di dalam `<button>` |
| **4** | Duplicate Keys | LOW | Non-unique key generation |

---

## Investigation Details

**Tanggal**: 2026-06-22
**Focus**: Matriks Absensi Bulanan
**Investigator**: Claude Code
