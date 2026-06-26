
# CHORD Comprehensive Monitoring Plan
**Author:** Chord (Senior System Architect)
**Date:** 2026-06-19
**Project:** PT Rebinmas Jaya Attendance Monitoring System

---

## Executive Summary

This document provides a complete execution plan for enhancing the PT Rebinmas Jaya Attendance Monitoring System.

**Requirements Addressed:**
1. Switch between machine data and database data
2. Employee ID parsing - Machine device ID -> Database employee code
3. Conflict monitoring - Attendance scheduling conflicts
4. Division-based monthly monitoring with charts
5. Live Machine Monitor - Real-time machine status

---

## Phase 1: Database Deep Dive - FINDINGS

### A. Database Tables (rebinmas_absensi_monitoring)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| attendance_machines | Machine inventory | id, machine_code, location_name, ip_address, port, access_status, loc_code, scanner_code, data_source, last_sync_at |
| attendance_scan_logs | Raw scan data | id, machine_id, machine_code, raw_device_user_id, parsed_employee_code, parsed_division_code, mapping_status, scan_time, scan_date, event_type, verify_type |
| attendance_imports | Processed attendance | employee_id, employee_code, division_code, attendance_date, attendance_status, check_in_at, check_out_at, is_sick, is_leave, is_holiday |
| attendance_raw_log | Raw machine logs | raw_log_id, machine_id, machine_user_id, record_time, record_date, verify_mode, is_processed |
| employees | Employee master | id, employee_code, employee_name, division_id, is_active |
| divisions | Division master | id, division_code, division_name, loc_code |
| machine_user_map | Device to Employee mapping | map_id, machine_id, machine_user_id, emp_code, loc_code, scanner_code, confidence_score, is_active |
| attendance_import_batches | Import job tracking | id, batch_code, machine_id, status, records_total, records_success, records_failed, started_at, finished_at |
| attendance_sync_logs | Sync job tracking | id, machine_code, status, records_synced, duration_ms, started_at, finished_at, error_message |

### B. Existing API Endpoints (Working)

| Endpoint | Method | Purpose | Response Sample |
|----------|--------|---------|-----------------|
| /api/monitoring/dashboard | GET | Dashboard stats | {totalMachines: 16, todayTotalScans: 592} |
| /api/monitoring/machines | GET | All machines with status | 16 machines |
| /api/monitoring/quality | GET | Data quality metrics | {totalScanLogs: 182491, unmappedCount: 1045} |
| /api/monitoring/batches | GET | Import batches | Paginated list |
| /api/monitoring/division-summary | GET | Monthly division stats | EMPTY - needs data |
| /api/monitoring/machine/:code/employees | GET | Machine vs DB comparison | Raw IDs, mapped, unmapped |
| /api/monitoring/machine/:code/raw-data | GET | Raw scan logs | Paginated |
| /api/monitoring/machine-ping | POST | Ping all machines | TCP test results |
| /api/quality/summary | GET | Quality checks | {overall_status: WARNING} |
| /api/divisions/:code/attendance | GET | Division attendance | Per-month breakdown |

### C. 16 ZKTeco Machines

| Machine | IP | Port | locCode | scannerCode | Status |
|---------|-----|------|---------|-------------|--------|
| PGE | 223.25.98.220 | 4370 | A | null | ACCESSIBLE |
| OFFICE_APE | 103.144.208.154 | 4370 | null | null | ACCESSIBLE |
| MILL | 103.127.66.32 | 4370 | null | null | ACCESSIBLE |
| IJL | 103.144.211.226 | 4370 | L | null | ACCESSIBLE |
| AB2 | 103.144.208.154 | 4400 | H | 400 | ACCESSIBLE |
| P1A | 10.0.0.90 | 4100 | A | 100 | ACCESSIBLE |
| P1B | 10.0.0.91 | 4300 | B | 300 | ACCESSIBLE |
| ARE | 103.144.208.154 | 4370 | A | null | ACCESSIBLE |
| DME_01 | 103.144.228.42 | 4700 | E | 700 | ACCESSIBLE |
| DME_02 | 103.144.228.42 | 4701 | E | 700 | ACCESSIBLE |
| AB1 | 103.144.208.154 | 4900 | G | 900 | ACCESSIBLE |
| ARA | 103.144.208.154 | 4800 | F | 800 | ACCESSIBLE |
| ARC_01 | 103.144.208.154 | 4200 | J | 200 | ACCESSIBLE |
| ARC_02 | 103.144.208.154 | 4201 | J | 200 | ACCESSIBLE |
| P2A | 10.0.0.92 | 4500 | C | 500 | ACCESSIBLE |
| P2B | 10.0.0.93 | 4600 | D | 600 | ACCESSIBLE |

### D. Employee ID Parsing Logic

Scanner Code -> Division: 100:P1A, 200:ARC, 300:P1B, 400:AB2, 500:P2A, 600:P2B, 700:DME, 800:ARA, 900:AB1
Division -> locCode: P1A:A, P1B:B, P2A:C, P2B:D, DME:E, ARA:F, AB1:G, AB2:H, ARC:J, IJL:L, PGE:A
Example: ID "10129" + scannerCode 100 -> "A0129"

---

## Phase 2: Analysis Summary

### Q1: Machine vs Database Switch
- Machine Data = attendance_scan_logs (raw, 182K records)
- Database Data = attendance_imports (processed, currently EMPTY)
- Need toggle component + comparison API

### Q2: Employee ID Parsing
- Format: {locCode}{4digits} (e.g., "A0129")
- Machine returns: numeric (e.g., "10129")
- Current: 9% mapped rate (1045 unmapped)

### Q3: Conflict/Scheduling
- No scheduling table exists
- attendance_imports has: is_sick, is_leave, is_holiday flags
- Need: attendance_scheduling + attendance_conflicts tables

### Q4: Division Monthly Metrics Needed
- Attendance Rate = HADIR / (HADIR + TIDAK_HADIR) x 100
- Daily trend per division
- Employee breakdown

### Q5: Charts
- Line: Daily attendance trend
- Bar: Division comparison
- Pie: Status distribution

---

## Phase 3: EXECUTION PLAN

### Section 1: Data Architecture

#### 1.1 Live Machine Monitor
Endpoint: GET /api/machines/real-time-status (existing)
Shows: machine_code, ip, port, access_status, records_today, employees_today, is_online, last_sync_at

#### 1.2 Machine->DB Switch Panel
New Endpoint: POST /api/monitoring/machine/:code/compare
Modes: Machine Data / Database Data / Compare Both
Returns raw_summary + processed_summary + comparison stats

#### 1.3 Employee ID Parser
Endpoint: POST /api/mapping/parse
Input: rawDeviceUserId, scannerCode, machineCode
Returns: employee_code, loc_code, mapping_status, confidence_score, suggested_actions

#### 1.4 Division Monthly Dashboard
Endpoint: GET /api/divisions/:code/attendance?year=2026&month=6
Returns: summary (total, hadir, tidak_hadir, sick, leave, holiday, hadir_rate)
+ by_date[], by_employee[], by_status[]

#### 1.5 Conflict/Schedule Monitor
New Table: attendance_scheduling
New Table: attendance_conflicts
Endpoint: GET /api/monitoring/conflicts?date=2026-06-19
Returns: conflicts[] with type, employee, severity, status

---

### Section 2: API Endpoints to Create

| # | Endpoint | Method | File | Priority |
|---|----------|--------|------|----------|
| 1 | /api/monitoring/machine/:code/compare | POST | machine-employee.routes.ts (extend) | P1 |
| 2 | /api/mapping/parse | POST | mapping.routes.ts (extend) | P1 |
| 3 | /api/divisions/:code/attendance | GET | division.routes.ts (extend) | P0 |
| 4 | /api/monitoring/conflicts | GET | conflict.routes.ts (new) | P1 |
| 5 | /api/quality/charts | GET | charts.routes.ts (new) | P1 |

---

### Section 3: Database Changes

#### New Tables

**attendance_scheduling**
```sql
CREATE TABLE attendance_scheduling (
  schedule_id INT IDENTITY(1,1) PRIMARY KEY,
  employee_id INT NOT NULL,
  employee_code NVARCHAR(20) NOT NULL,
  division_id INT,
  schedule_date DATE NOT NULL,
  schedule_type NVARCHAR(50) NOT NULL,
  status NVARCHAR(20) DEFAULT 'PLANNED',
  notes NVARCHAR(500),
  created_at DATETIME2 DEFAULT SYSUTCDATETIME()
);
```

**attendance_conflicts**
```sql
CREATE TABLE attendance_conflicts (
  conflict_id INT IDENTITY(1,1) PRIMARY KEY,
  employee_id INT,
  employee_code NVARCHAR(20) NOT NULL,
  conflict_type NVARCHAR(50) NOT NULL,
  conflict_date DATE NOT NULL,
  details NVARCHAR(MAX),
  severity NVARCHAR(20) DEFAULT 'MEDIUM',
  status NVARCHAR(20) DEFAULT 'OPEN',
  resolution_notes NVARCHAR(500),
  created_at DATETIME2 DEFAULT SYSUTCDATETIME()
);
```

#### New Columns

attendance_machines: last_ping_at, ping_status, total_users
attendance_scan_logs: scan_hour, scan_day_of_week

---

### Section 4: Frontend Components

1. **MachineStatusPanel** - Grid of machine cards with status indicators
2. **DataSourceToggle** - Toggle: Machine Data / Database Data / Compare Both
3. **EmployeeIdParser** - Input field + Parse button + Result card
4. **DivisionMonthlyDashboard** - Summary cards + Charts + Employee table
5. **ConflictAlert** - Alert banner + Conflict list with severity badges
6. **QualityChart** - Line/Bar/Pie/Heatmap charts

---

### Section 5: Implementation Order

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 1 | Create attendance_scheduling table | P0 | None |
| 2 | Create attendance_conflicts table | P0 | Task 1 |
| 3 | Extend Division Attendance API | P0 | Requires data in attendance_imports |
| 4 | Create Conflict Detection Service | P1 | Task 2 |
| 5 | Create Conflict API Endpoints | P1 | Task 4 |
| 6 | Create Machine Compare API | P1 | None |
| 7 | Create Quality Charts API | P1 | None |
| 8-13 | Frontend Components | P1-P2 | Depends on APIs |
| 14 | Add Conflict Detection to Sync | P1 | Task 4 |
| 15 | Integration Testing | P1 | Tasks 1-14 |

---

### Key Files Reference

| Purpose | File |
|---------|------|
| Machine config | _dev_utils/src/machine-config.ts |
| ZKTeco service | src/modules/machines/zkteco.service.ts |
| Employee mapper | src/modules/mapping/employee-code-mapper.ts |
| Database client | src/lib/db.ts |
| Monitoring routes | src/api/routes/monitoring.routes.ts |

### CRITICAL REMINDER

**attendance_imports is EMPTY** - All dashboards will show no data until the sync/import pipeline populates it. Priority fix: get scan_logs -> attendance_imports data flowing.

---

**Document End - Chord, 2026-06-19**
