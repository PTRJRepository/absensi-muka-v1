# Multi-Machine Employee Handling - Design Document

---

## 📋 Document Info

| Field | Value |
|-------|-------|
| **Document Title** | Multi-Machine Employee Handling System Design |
| **Date** | 2026-06-22 |
| **Status** | ✅ CONFIRMED (Understanding Locked) |
| **Project** | Absensi Rebinmas Jaya |

---

## 🎯 Problem Statement

Sistem absensi Rebinmas perlu mengakomodasi employee yang clock-in di berbagai ZKTeco machines tanpa batasan home/primary location.

### Current Reality

- Database analysis menemukan **10+ employees** enroll di **5-6 mesin berbeda**
- Employee code (e.g., "A0044") **VALID dimanapun** employee clock-in
- Office machines (PGE, OFFICE_PGE, OFFICE_APE) berfungsi sebagai "catch-all"

### Business Context

- Karyawan bisa kerja di lokasi berbeda (field visit, rotate, emergency)
- Sistem **TIDAK membatasi** lokasi absen
- Yang penting: **attendance TERCAKAP**, validated via HR

---

## ✅ Requirements (Confirmed)

| ID | Requirement | Priority |
|----|-----------|----------|
| REQ-01 | Sistem mengakomodasi employee clock-in di MANA SAJA | Critical |
| REQ-02 | All machines are EQUAL - tidak ada primary/home | Critical |
| REQ-03 | Aggregate attendance by employee_code across ALL machines | Critical |
| REQ-04 | Deteksi employee-machine enrollment untuk audit | High |
| REQ-05 | Machine Breakdown report per employee | High |
| REQ-06 | Daily attendance timeline dengan machine detail | High |
| REQ-07 | Cross-machine event logging untuk analytics | Medium |

---

## 🔑 Key Decisions (Locked)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Primary Machine | **None** | All machines equal - employee bisa absen dimanapun |
| 2 | Machine Restrictions | **None** | Tidak ada batasan lokasi |
| 3 | Aggregate Method | **employee_code** | Global join across all machines |
| 4 | Cross-Machine Logging | **Yes** | Analytics/audit trail |
| 5 | Reporting Format | **Full Detail** | Summary + Machine Breakdown + Timeline |

---

## 📊 Data Flow Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ATTENDANCE FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

[ZKTeco Machine]
       │
       ▼
┌─────────────────┐
│ raw_device_user_id  │  e.g., "5000040"
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. PARSE (SSOT: zkteco-employee-code-parser.ts)                         │
│    - Short ID (<=5) → EXCLUDED                                          │
│    - Long ID (>5) with scanner prefix → Parse to employee_code          │
│    - Example: "5000040" → "C0040"                                       │
└────────┬────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. VERIFY (db_ptrj.HR_EMPLOYEE)                                        │
│    - employee_code exists AND Status='1' → MAPPED                       │
│    - Not found → NEED_REVIEW                                           │
└────────┬────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. STORE (attendance_scan_logs)                                          │
│    - raw_device_user_id + parsed_employee_code + machine_code             │
│    - mapping_status = 'MAPPED'                                           │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. AGGREGATE (by employee_code across ALL machines)                      │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. REPORT (Full Detail per Employee)                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Real Example

```
Employee A clocks in at P1A → Valid attendance
Employee A clocks in at AB2   → Valid attendance (same employee)
Employee A clocks in at OFFICE → Valid attendance (same employee)
              ↓
All aggregated by employee_code = C0044
              ↓
Machine Breakdown: P1A (20x), AB2 (15x), OFFICE_PGE (10x)
```

---

## 🗄️ Data Architecture

### Existing Tables (Leverage)

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `attendance_scan_logs` | Raw attendance | raw_device_user_id, parsed_employee_code, machine_code, scan_time |
| `zkteco_absensi_user_registry` | Canonical user registry | parsed_employee_code, machine_count, scan_count |
| `zkteco_absensi_user_machine` | Per-machine enrollment | raw_device_user_id, machine_code |
| `employees` | Employee master | employee_code, employee_name |
| `attendance_machines` | Machine master | machine_code, location_name |

### New Components Needed

#### Component 1: Attendance Aggregation View

**View:** `vw_employee_attendance_detail`

**Purpose:** Aggregate attendance by employee_code across ALL machines

**Columns:**
- employee_code
- employee_name
- work_date
- total_scans
- machines_used (JSON array)
- machine_details (JSON array of {machine, scan_count, times})
- first_scan_time
- last_scan_time

#### Component 2: Machine Breakdown View

**View:** `vw_employee_machine_breakdown`

**Purpose:** Show machine usage per employee (for analytics)

**Columns:**
- employee_code
- machine_code
- machine_location
- scan_count
- first_scan_date
- last_scan_date
- percentage_of_total

#### Component 3: Cross-Machine Events Table (Optional)

**Table:** `employee_machine_events`

**Purpose:** Log untuk analytics - employee clock-in di machine berbeda

**Columns:**
- id (PK)
- employee_code
- work_date
- machine_code
- machine_location
- scan_time
- is_cross_machine (BIT) - TRUE jika ≠ home location
- created_at

---

## 📈 Report Format Design

### Employee Attendance Report (Full Detail)

```markdown
================================================================================
ATTENDANCE REPORT - EMPLOYEE DETAIL
================================================================================
Period: June 2026
Employee Code: C0044
Employee Name: JOHN DOE
Division: P2A
--------------------------------------------------------------------------------

SUMMARY
────────────────────────────────────────────────────────────────────────────────
Total Attendance Days : 15
Total Scans           : 45
Machines Used        : 3
First Scan Date       : 2026-06-01
Last Scan Date        : 2026-06-22

MACHINE BREAKDOWN
────────────────────────────────────────────────────────────────────────────────
Machine     | Location      | Scans | %      | First Scan | Last Scan
------------|--------------|-------|--------|------------|------------
P1A        | Pabrik 1 A   |    20 |  44.4% | 2026-06-01| 2026-06-22
AB2        | Aerial Base 2|    15 |  33.3% | 2026-06-05| 2026-06-20
OFFICE_PGE | Office PGE   |    10 |  22.2% | 2026-06-10| 2026-06-22

DAILY TIMELINE
────────────────────────────────────────────────────────────────────────────────

2026-06-22 (Monday)
  07:30:00 → P1A         [Check-in]
  12:00:00 → P1A         [Lunch break]
  13:00:00 → P1A         [Resume]
  17:00:00 → P1A         [Check-out]
  
  Total Scans: 4

2026-06-21 (Sunday)
  ⚠️ No attendance recorded

2026-06-20 (Saturday)
  08:00:00 → AB2         [Field Visit]
  18:00:00 → AB2         [Field Visit End]
  
  Total Scans: 2
  🔶 Cross-machine: AB2 (Aerial Base 2)

================================================================================
```

---

## 🔄 Implementation Plan

### Phase 1: SQL Views (No Schema Changes)

#### View 1: Daily attendance with machine breakdown

```sql
CREATE OR ALTER VIEW vw_employee_attendance_detail
AS
SELECT 
    s.parsed_employee_code AS employee_code,
    e.employee_name,
    s.scan_date AS work_date,
    COUNT(*) AS total_scans,
    
    -- Machine summary as JSON
    (
        SELECT 
            s2.machine_code,
            m.location_name,
            COUNT(*) AS scan_count,
            MIN(s2.scan_time) AS first_scan,
            MAX(s2.scan_time) AS last_scan
        FROM attendance_scan_logs s2
        LEFT JOIN attendance_machines m ON s2.machine_code = m.machine_code
        WHERE s2.parsed_employee_code = s.parsed_employee_code
          AND s2.scan_date = s.scan_date
        GROUP BY s2.machine_code, m.location_name
        FOR JSON PATH
    ) AS machine_details_json,
    
    MIN(s.scan_time) AS first_scan_time,
    MAX(s.scan_time) AS last_scan_time
    
FROM attendance_scan_logs s
JOIN employees e ON s.parsed_employee_code = e.employee_code
WHERE s.mapping_status = 'MAPPED'
  AND s.parsed_employee_code IS NOT NULL
GROUP BY 
    s.parsed_employee_code,
    e.employee_name,
    s.scan_date;
```

#### View 2: Machine breakdown per employee

```sql
CREATE OR ALTER VIEW vw_employee_machine_breakdown
AS
SELECT 
    s.parsed_employee_code AS employee_code,
    e.employee_name,
    s.machine_code,
    m.location_name,
    COUNT(*) AS scan_count,
    MIN(s.scan_date) AS first_scan_date,
    MAX(s.scan_date) AS last_scan_date,
    CAST(
        COUNT(*) * 100.0 / 
        SUM(COUNT(*)) OVER (PARTITION BY s.parsed_employee_code) 
        AS DECIMAL(5,1)
    ) AS percentage
FROM attendance_scan_logs s
JOIN employees e ON s.parsed_employee_code = e.employee_code
LEFT JOIN attendance_machines m ON s.machine_code = m.machine_code
WHERE s.mapping_status = 'MAPPED'
  AND s.parsed_employee_code IS NOT NULL
GROUP BY 
    s.parsed_employee_code,
    e.employee_name,
    s.machine_code,
    m.location_name;
```

### Phase 2: API Endpoints (New Routes)

```typescript
// src/api/routes/employee-attendance.routes.ts

// GET /api/attendance/employee/:code/detail
// Returns full attendance detail with machine breakdown
router.get('/attendance/employee/:code/detail', async (ctx) => {
    const { code } = ctx.params;
    const { startDate, endDate } = ctx.query;
    
    const result = await query(`
        SELECT * FROM vw_employee_attendance_detail
        WHERE employee_code = @code
          AND work_date BETWEEN @startDate AND @endDate
        ORDER BY work_date DESC
    `, [
        { name: 'code', type: sql.NVarChar, value: code },
        { name: 'startDate', type: sql.Date, value: startDate },
        { name: 'endDate', type: sql.Date, value: endDate }
    ]);
    
    return result;
});

// GET /api/attendance/employee/:code/machines
// Returns machine usage breakdown
router.get('/attendance/employee/:code/machines', async (ctx) => {
    const { code } = ctx.params;
    
    const result = await query(`
        SELECT * FROM vw_employee_machine_breakdown
        WHERE employee_code = @code
        ORDER BY scan_count DESC
    `, [
        { name: 'code', type: sql.NVarChar, value: code }
    ]);
    
    return result;
});

// GET /api/attendance/cross-machine-report
// Returns employees with cross-machine attendance
router.get('/attendance/cross-machine-report', async (ctx) => {
    const { startDate, endDate } = ctx.query;
    
    const result = await query(`
        SELECT 
            employee_code,
            employee_name,
            COUNT(DISTINCT machine_code) AS machine_count,
            STRING_AGG(DISTINCT machine_code, ', ') AS machines
        FROM vw_employee_machine_breakdown
        WHERE scan_date BETWEEN @startDate AND @endDate
        GROUP BY employee_code, employee_name
        HAVING COUNT(DISTINCT machine_code) > 1
        ORDER BY machine_count DESC
    `, [
        { name: 'startDate', type: sql.Date, value: startDate },
        { name: 'endDate', type: sql.Date, value: endDate }
    ]);
    
    return result;
});
```

---

## ⚠️ Edge Cases & Handling

| Edge Case | Handling |
|-----------|----------|
| Empty raw_device_user_id | Mark UNMAPPED, exclude from reports |
| Short ID (<=5 digits) | EXCLUDED per convention |
| Employee not in HR | Mark NEED_REVIEW, not in reports |
| Same timestamp, different machines | Log both, flag as anomaly |
| 100+ machines per employee | Paginate machine breakdown |

---

## 📊 Acceptance Criteria

| # | Criteria | Test Method |
|---|----------|-------------|
| AC-01 | Employee attendance aggregates across ALL machines | Query test |
| AC-02 | Machine breakdown shows scan count per machine | Visual check |
| AC-03 | Daily timeline shows timestamp + machine | Visual check |
| AC-04 | Cross-machine events logged | Query cross-machine table |
| AC-05 | Empty/short ID records excluded | Query verification |
| AC-06 | Performance: 1000 employees report < 2s | Load test |

---

## 📝 Decision Log (Complete)

| # | Decision | Choice | Rationale | Status |
|---|----------|--------|-----------|--------|
| 1 | Primary Machine | None | Employee bisa absen dimanapun | ✅ Locked |
| 2 | Machine Restrictions | None | All machines equal | ✅ Locked |
| 3 | Aggregate Method | employee_code | Global join | ✅ Locked |
| 4 | Cross-Machine Logging | Yes | Analytics/audit | ✅ Locked |
| 5 | Reporting Format | Full Detail | Summary + Breakdown + Timeline | ✅ Locked |
| 6 | Data Source | attendance_scan_logs | Already contains all data | ✅ Locked |

---

## 🚀 Next Steps

| Phase | Task | Status |
|-------|------|--------|
| 1 | Create SQL Views (vw_employee_attendance_detail, vw_employee_machine_breakdown) | Pending |
| 2 | Add API Endpoints (employee-attendance.routes.ts) | Pending |
| 3 | Update Frontend Report (Employee Detail Page) | Pending |
| 4 | Add Cross-Machine Log Table (employee_machine_events) | Optional |
| 5 | Test & Verify all acceptance criteria | Pending |

---

## 📁 Related Documents

| Document | Purpose |
|---------|---------|
| `docs/EMPLOYEE-ID-MAPPING.md` | ID parsing & HR lookup flow |
| `docs/DATABASE-ANALYSIS.md` | Database analysis findings |
| `docs/DATA-DICTIONARY.md` | Table structures & columns |
| `docs/MASTER-EMPLOYEE-TABLE-PLAN.md` | Employee table deduplication plan |

---

*Document Status: ✅ CONFIRMED*
*Prepared by: Claude Code*
*Date: 2026-06-22*
