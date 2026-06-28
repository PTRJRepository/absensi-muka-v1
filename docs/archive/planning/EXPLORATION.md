# Database Exploration Report

**Date:** 2026-06-18  
**Database:** 10.0.0.110:1433 / rebinmas_absensi_monitoring  
**Reference DB:** extend_db_ptrj

---

## 1. Tables Overview

### Current Record Counts

| Table | Row Count | Notes |
|-------|-----------|-------|
| `attendance_machines` | **16** | ✅ All machines configured |
| `attendance_scan_logs` | **33,758** | ⚠️ Has data but mostly UNMAPPED |
| `attendance_imports` | **0** | Empty (legacy table) |
| `attendance_import_batches` | **12** | Recent sync runs tracked |
| `employees` | **1,987** | ✅ Employee master data |
| `extend_db_ptrj.mst_employee` | **1,987** | Source employee data |

### Mapping Status Breakdown
```
MAPPED:     907 records (2.7%)
UNMAPPED: 34,851 records (97.3%)
```

---

## 2. Attendance Machines (16 machines)

| Machine Code | Location | IP Address | Port | Scanner Code | Loc Code | Status |
|--------------|----------|------------|------|--------------|----------|--------|
| AB1 | AB1 | 103.144.208.154 | 4900 | 900 | G | ACCESSIBLE |
| AB2 | AB2 | 103.144.208.154 | 4400 | 400 | H | ACCESSIBLE |
| ARA | ARA | 103.144.208.154 | 4800 | 800 | F | ACCESSIBLE |
| ARC_01 | ARC 01 | 103.144.208.154 | 4200 | 200 | J | ACCESSIBLE |
| ARC_02 | ARC 02 | 103.144.208.154 | 4201 | 200 | J | ACCESSIBLE |
| ARE | ARE | 103.144.208.154 | 4370 | NULL | A | ACCESSIBLE |
| DME_01 | DME 01 | 103.144.228.42 | 4700 | 700 | E | ACCESSIBLE |
| DME_02 | DME 02 | 103.144.228.42 | 4701 | 700 | E | ACCESSIBLE |
| IJL | IJL | 103.144.211.226 | 4370 | NULL | L | ACCESSIBLE |
| MILL | Mill Office | 103.127.66.32 | 4370 | NULL | NULL | ACCESSIBLE |
| OFFICE_APE | OFFICE APE | 103.144.208.154 | 4370 | NULL | NULL | ACCESSIBLE |
| P1A | PG1A | 10.0.0.90 | 4100 | 100 | A | ACCESSIBLE |
| P1B | PG1B | 10.0.0.91 | 4300 | 300 | B | ACCESSIBLE |
| P2A | PG2A | 10.0.0.92 | 4500 | 500 | C | ACCESSIBLE |
| P2B | PG2B | 10.0.0.93 | 4600 | 600 | D | ACCESSIBLE |
| **PGE** | OFFICE PGE | 223.25.98.220 | 4370 | NULL | A | ACCESSIBLE |

**Key Observations:**
- All machines are ZKTECO type
- Most machines accessible via public IPs (103.x.x.x, 223.x.x.x)
- Internal machines: P1A/B, P2A/B (10.0.0.x)
- Scanner codes: 100-900 (multiples of 100)
- Location codes: A-L

---

## 3. Employee Code Format & Rules

### Current Employee Code Structure

**Format:** `XXXXXXX` (7 digits, zero-padded)

**Examples from employees table:**
```
0010001  →  DIANA ( ROBIYAH )
0010002  →  ETI ROSALINA ( DAYANI )
0010003  →  EVI MALA SARI ( NURMAH )
0010006  →  MASNIARTI ( HATIA )
0010073  →  BAHARUDIN ( TEMAN )
```

### Code Distribution Pattern

| Prefix | Count | Description |
|--------|-------|-------------|
| `00` | 49 | Special/Admin codes |
| `10` | 508 | Main group |
| `20` | 317 | Division 20 |
| `30` | 252 | Division 30 |
| `40` | 147 | Division 40 |
| `50` | 175 | Division 50 |
| `80` | 172 | Division 80 |
| `90` | 148 | Division 90 |
| `A0` | 15 | Alpha-numeric codes |

### mst_employee (extend_db_ptrj)

```sql
emp_code       VARCHAR(50)   -- Same as employees.employee_code
emp_name       NVARCHAR(255) -- Full name with aliases
employee_number VARCHAR(50)  -- NULL in all records
card_no        VARCHAR(50)   -- NULL in all records
current_division_id INT
current_gang_id INT
employment_status VARCHAR(20) -- 'ACTIVE' / 'RESIGNED'
is_active      BIT
first_seen_at  DATETIME
last_seen_at   DATETIME
```

---

## 4. Raw Device Data Format

### Machine Raw Data Patterns

**AB1/AB2 Machines (prefixed scanner code):**
```
raw_device_user_id: 9000626  (prefix 900 + number)
raw_user_sn: 7191             (sequential number)
parsed_employee_code: G10061  (loc_code G + numeric suffix)
```

**PGE Machine (office machine with A-prefix):**
```
raw_device_user_id: 20020    (A-prefix format: A20020)
raw_user_sn: 61910
parsed_employee_code: A20020
mapping_status: NEED_REVIEW
mapping_reason: Office/PGE/IJL machine requires HR confirmation
```

### Raw Device User ID Ranges

Top 20 most frequent device IDs:
```
9000582 → 320 records
9000410 → 296 records
9000601 → 287 records
9000050 → 284 records
9000615 → 284 records
9000510 → 279 records
```

**Pattern:** 900XXXX format (7 digits, starts with 900)

---

## 5. Mapping Logic & Issues

### Current Mapping Status

| Status | Count | Reason |
|--------|-------|--------|
| **MAPPED** | 907 | Successfully linked to employee_code |
| **UNMAPPED** | 34,851 | Cannot parse device ID |
| **NEED_REVIEW** | (some PGE) | Requires HR confirmation |

### Why Most Records Are UNMAPPED

The scanner expects numeric `raw_device_user_id`, but machines are sending:
- Prefixed IDs like `9000626` (not numeric-only)
- A-prefixed IDs like `A20020` (not numeric-only)

### Example Unmapped Record
```json
{
  "machine_code": "AB1",
  "raw_device_user_id": "9000626",
  "raw_user_sn": "7191",
  "raw_record_time": "2026-06-18 08:36:06",
  "mapping_status": "UNMAPPED",
  "mapping_reason": "Raw device user id is not numeric"
}
```

### Successfully Mapped Example
```json
{
  "machine_code": "AB2",
  "raw_device_user_id": "50106",
  "raw_user_sn": "4154",
  "parsed_employee_code": "H50106",
  "parsed_division_code": "AB2",
  "mapping_status": "MAPPED",
  "mapping_reason": "Mapped by locCode and numeric device id"
}
```

---

## 6. Sync Batch Results

Recent sync runs show mixed success:

| Batch ID | Machine | Status | Records | Success | Failed |
|----------|---------|--------|---------|---------|--------|
| 3 | AB1 | SUCCESS | 7,191 | 14 | 7,177 |
| 5 | AB1 | SUCCESS | 7,191 | 14 | 7,177 |
| 6 | AB2 | SUCCESS | 4,154 | 42 | 4,112 |
| 7-9 | ARA, ARC_01, ARC_02 | FAILED | 0 | 0 | 0 |
| 11 | AB1 | SUCCESS | 7,191 | 14 | 7,177 |

**Issue:** Most records fail to map (~99% failure rate)

---

## 7. Scan Log Data by Machine

| Machine | Total Records | Notes |
|---------|---------------|-------|
| AB1 | 27,269 | Most active |
| AB2 | 10,843 | Second most |
| PGE | 10,790 | Office machine |
| ARE | 1,403 | Low traffic |
| P1A | 665 | Low traffic |

---

## 8. Data Flow Issues

### Problem Summary

1. **Mapping Failure Rate: 97.3%**
   - Raw device IDs don't match expected numeric format
   - Machine codes (900XXXX) not handled by parser

2. **Employee Code Mismatch**
   - Employees have format: `0010001` (7 digits, zero-padded)
   - Parsed codes: `G10061`, `H50106` (loc_code + 5 digits)
   - No direct mapping between parsed and actual codes

3. **PGE Machine Special Case**
   - Uses A-prefixed IDs (A20020, A10017, etc.)
   - Tagged as NEED_REVIEW requiring HR confirmation
   - Never automatically mapped

4. **Card Numbers Missing**
   - `mst_employee.card_no` is NULL for all records
   - No direct employee-to-fingerprint mapping available

---

## 9. Recommendations

1. **Update Parsing Logic:**
   - Handle 900XXXX device IDs
   - Extract numeric suffix (XXXX) from 900XXXX pattern
   - Match against employee codes ending with XXXX

2. **PGE Machine Handling:**
   - Remove A-prefix before parsing
   - Create separate mapping table for office machines

3. **Card Number Sync:**
   - Extract card_no from attendance devices
   - Sync with mst_employee.card_no field

4. **Batch Processing:**
   - Implement retry logic for failed mappings
   - Flag high-failure batches for review

---

## 10. Sync Script Test (PGE Machine)

**Command:** `node dist/scripts/sync-machines.js --machine=PGE`

**Result:** Connection timeout
```
ok tcp
[TIMEOUT after 15s]
```

**PGE Machine Status:**
- IP: 223.25.98.220
- Port: 4370
- Ping: ✅ Reachable (2ms latency)
- Sync: ❌ Hangs on TCP connection

**Possible Issues:**
- ZKTEKO protocol handshake timeout
- Machine firmware blocking remote connections
- Port configuration mismatch

---

## 11. Table Schemas

### attendance_machines
```sql
id, machine_code, location_name, ip_address, port, local_ip,
machine_type, scanner_code, loc_code, access_status, data_source,
notes, is_active, last_sync_at, last_error_message, created_at, updated_at
```

### attendance_scan_logs
```sql
id, machine_id, machine_code, raw_device_user_id, raw_user_sn,
raw_record_time, raw_ip, parsed_employee_code, parsed_division_code,
mapping_status, mapping_reason, scan_time, scan_date, event_type,
verify_type, work_code, sync_batch_id, created_at
```

### employees
```sql
id, employee_code, employee_name, division_id, gang_id,
employment_status, is_active, created_at, updated_at
```

### mst_employee (extend_db_ptrj)
```sql
employee_id, emp_code, emp_name, employee_number, card_no,
current_division_id, current_gang_id, employment_status,
is_active, first_seen_at, last_seen_at, created_at, updated_at
```

---

*Generated: 2026-06-18*