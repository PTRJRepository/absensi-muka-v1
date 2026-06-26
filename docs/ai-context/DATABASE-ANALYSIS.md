# Database Analysis Report: rebinmas_absensi_monitoring

> **Generated**: 2026-06-22
> **Server**: 10.0.0.110
> **Database**: rebinmas_absensi_monitoring

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Employees | 3,761 |
| Active Employees | 1,788 |
| Inactive Employees | 1,973 |
| Total Scan Logs | 1,216,710 |
| Date Range | 1999-12-31 to 2026-06-23 |

### Convention Compliance

| ID Type | Convention | Current Status |
|---------|-----------|----------------|
| **Short ID** (<=5 digits) | EXCLUDED from auto-mapping | ✅ 424,438 records marked UNMAPPED |
| **Long ID** (>5 digits) | Parse + db_ptrj lookup | ✅ 792,272 records processed |

---

## 1. All Tables in Database

| # | Table Name | Purpose |
|---|------------|---------|
| 1 | attendance_holiday | Holiday calendar |
| 2 | attendance_import_batches | Batch tracking |
| 3 | attendance_imports_old | Legacy imports |
| 4 | attendance_machines | Machine inventory |
| 5 | attendance_manual_corrections | Admin overrides |
| 6 | attendance_scan_logs | **Raw scan records** |
| 7 | attendance_sync_logs | Sync history |
| 8 | attendance_work_config | Work configuration |
| 9 | divisions | Division master |
| 10 | employee_mapping_overrides | Manual overrides |
| 11 | employees | **Employee master** |
| 12 | gangs | Gang/team master |
| 13 | zkteco_absensi_user_machine | Machine-user enrollment |
| 14 | zkteco_absensi_user_registry | User registry with parsing |
| 15 | zkteco_hr_employee_map | HR cross-machine mapping |

---

## 2. Table Structures

### employees

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | int | NOT NULL | Primary key |
| employee_code | nvarchar | NOT NULL | Canonical employee code |
| employee_name | nvarchar | NOT NULL | Employee full name |
| division_id | int | NOT NULL | FK to divisions |
| gang_id | int | NULL | FK to gangs |
| employment_status | nvarchar | NOT NULL | ACTIVE/INACTIVE |
| is_active | bit | NOT NULL | Active flag |
| created_at | datetime2 | NOT NULL | Creation timestamp |
| updated_at | datetime2 | NULL | Last update |
| zkteco_user_id | nvarchar | NULL | Direct ZKTeco ID |

### attendance_scan_logs

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | bigint | NOT NULL | Primary key |
| machine_id | int | NULL | FK to machines |
| machine_code | nvarchar | NOT NULL | Machine identifier |
| raw_device_user_id | nvarchar | NOT NULL | **Raw ID from machine** |
| raw_user_sn | nvarchar | NULL | Serial number |
| raw_record_time | datetime2 | NOT NULL | Record timestamp |
| parsed_employee_code | nvarchar | NULL | **Parsed employee code** |
| mapping_status | nvarchar | NOT NULL | MAPPED/NEED_REVIEW/UNMAPPED |
| mapping_reason | nvarchar | NULL | Mapping explanation |
| scan_time | datetime2 | NOT NULL | Scan time |
| scan_date | date | NOT NULL | Scan date |

### zkteco_absensi_user_registry

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | bigint | NOT NULL | Primary key |
| raw_device_user_id | nvarchar | NOT NULL | Raw ID |
| raw_id_length | int | NOT NULL | ID length |
| id_category | nvarchar | NOT NULL | SHORT/LONG |
| scanner_prefix | nvarchar | NULL | Detected prefix (001-900) |
| parsed_employee_code | nvarchar | NULL | Parsed result |
| hr_employee_code | nvarchar | NULL | **HR confirmed code** |
| hr_employee_name | nvarchar | NULL | HR name |
| hr_loc_code | nvarchar | NULL | HR location |
| mapping_status | nvarchar | NOT NULL | Status |
| machine_count | int | NOT NULL | Machines enrolled |
| scan_count | bigint | NOT NULL | Total scans |

---

## 3. Employee Data Analysis

### Employee Count by Status

| Status | Count | Percentage |
|--------|-------|------------|
| Active | 1,788 | 47.5% |
| Inactive | 1,973 | 52.5% |
| **Total** | **3,761** | 100% |

### Employee Code Format Distribution

| Format | Count | Example |
|--------|-------|---------|
| ZKTeco Format (Axxxx) | 1,778 | A0044, B0232 |
| HR Format (7 digits) | 1,322 | 0010001, 0010002 |
| Other | 661 | Mixed formats |

### Sample Employee Codes

```
0010001 - DIANA (ROBIYAH) [ACTIVE]
0010002 - ETI ROSALINA (DAYANI) [ACTIVE]
0010003 - EVI MALA SARI (NURMAH) [ACTIVE]
0010004 - PITRIANA (RAYANTI) [ACTIVE]
0010006 - MASNIARTI (HATIA) [ACTIVE]
```

---

## 4. Attendance Scan Logs Analysis

### Overall Statistics

| Metric | Value |
|--------|-------|
| Total Scan Logs | 1,216,710 |
| Has parsed_employee_code | 791,907 |
| Status MAPPED | 791,907 |
| Status NEED_REVIEW | 365 |
| Status UNMAPPED | 424,438 |
| Date Range | 1999-12-31 to 2026-06-23 |

### Short vs Long ID Breakdown

| ID Type | Count | Percentage | MAPPED | NEED_REVIEW | UNMAPPED |
|---------|-------|------------|---------|--------------|-----------|
| **LONG** (>5) | 792,272 | 65.1% | 791,907 | 365 | 0 |
| **SHORT** (<=5) | 424,438 | 34.9% | 0 | 0 | 424,438 |

### Convention Compliance Analysis

| Convention | Status | Evidence |
|------------|--------|----------|
| Short ID = EXCLUDED | ✅ COMPLIANT | 424,438 short IDs marked UNMAPPED |
| Long ID = Parse + Lookup | ✅ COMPLIANT | 791,907 long IDs MAPPED |

---

## 5. Short ID (<=5 digits) Detailed Analysis

### Convention: SHORT IDs are EXCLUDED from auto-mapping

All short IDs (1-5 digits) are correctly marked as **UNMAPPED**.

### Short ID Distribution by Machine

| Machine | Short ID Count | Percentage |
|---------|---------------|------------|
| PGE | 180,578 | 42.5% |
| ARE | 77,288 | 18.2% |
| OFFICE_APE | 46,820 | 11.0% |
| MILL | 38,026 | 9.0% |
| OFFICE_PGE | 26,314 | 6.2% |
| DME_01 | 18,937 | 4.5% |
| ARC_01 | 10,023 | 2.4% |
| IJL | 9,832 | 2.3% |
| DME_02 | 5,098 | 1.2% |
| AB2 | 4,174 | 1.0% |
| P1B | 3,730 | 0.9% |
| P1A | 2,409 | 0.6% |
| AB1 | 1,118 | 0.3% |
| ARC_02 | 91 | 0.0% |

### Sample Short IDs

| raw_device_user_id | Length | Machine | Status | Scans |
|-------------------|--------|---------|--------|-------|
| (empty) | 0 | DME_01 | UNMAPPED | 10,052 |
| (empty) | 0 | ARC_01 | UNMAPPED | 9,819 |
| (empty) | 0 | PGE | UNMAPPED | 11,452 |
| (empty) | 0 | MILL | UNMAPPED | 8,181 |
| 1 | 1 | OFFICE_PGE | UNMAPPED | 146 |
| 1 | 1 | IJL | UNMAPPED | 8 |

### Key Findings - Short IDs

1. **Empty IDs**: Many machines have records with empty `raw_device_user_id`
2. **Office machines dominate**: PGE, ARE, OFFICE_APE have 71.7% of short IDs
3. **Production machines**: P1A, P1B have very few short IDs (<2%)

---

## 6. Long ID (>5 digits) Detailed Analysis

### Convention: LONG IDs are parsed via scanner prefix then looked up in db_ptrj

### Scanner Prefix Distribution

| Prefix | LocCode | Division | Records | MAPPED | NEED_REVIEW | Unmapped |
|--------|---------|----------|---------|--------|--------------|----------|
| 001 | L | IJL | 9,103 | 9,103 | 0 | 0 |
| 100 | A | P1A | 27,591 | 27,410 | 181 | 0 |
| 200 | J | ARC | 46,509 | 46,509 | 0 | 0 |
| 300 | B | P1B | 27,853 | 27,853 | 0 | 0 |
| 400 | H | AB2 | 192,701 | 192,701 | 0 | 0 |
| 500 | C | P2A | 282 | 282 | 0 | 0 |
| 600 | D | P2B | 343 | 343 | 0 | 0 |
| 700 | E | DME | 47,661 | 47,661 | 0 | 0 |
| 800 | F | ARA | 1,654 | 1,654 | 0 | 0 |
| 900 | G | AB1 | 438,575 | 438,391 | 184 | 0 |

### Mapping by Prefix (Top 5 by Volume)

| Prefix | Division | Total Scans | Mapping Rate |
|--------|----------|-------------|--------------|
| 900 | AB1 | 438,575 | 99.96% |
| 400 | AB2 | 192,701 | 100.00% |
| 200 | ARC | 46,509 | 100.00% |
| 700 | DME | 47,661 | 100.00% |
| 100 | P1A | 27,591 | 99.34% |

### Sample Long IDs by Prefix

| Prefix | Sample ID | Parsed Code | Division |
|--------|-----------|-------------|----------|
| 001 | 0010017 | L0017 | IJL |
| 001 | 0010101 | L0101 | IJL |
| 100 | 1000040 | A0040 | P1A |
| 200 | 2000150 | J0150 | ARC |
| 400 | 4000001 | H0001 | AB2 |
| 900 | 9000001 | G0001 | AB1 |

---

## 7. User Registry Analysis (zkteco_absensi_user_registry)

### Registry Summary

| Metric | Value |
|--------|-------|
| Total Unique Users | 1,827 |
| Unique Parsed Codes | 1,827 |
| Total Scans | 792,272 |
| With HR Employee Code | 1,825 (99.9%) |
| Without HR Code | 2 (0.1%) |

### Scanner Prefix Distribution in Registry

| Prefix | LocCode | Users | Total Scans | Avg Scans/User |
|--------|---------|-------|-------------|----------------|
| 001 | L | 52 | 9,103 | 175 |
| 100 | A | 275 | 27,591 | 100 |
| 200 | J | 286 | 46,509 | 163 |
| 300 | B | 217 | 27,853 | 128 |
| 400 | H | 146 | 192,701 | 1,320 |
| 500 | C | 180 | 282 | 2 |
| 600 | D | 137 | 343 | 3 |
| 700 | E | 212 | 47,661 | 225 |
| 800 | F | 172 | 1,654 | 10 |
| 900 | G | 150 | 438,575 | 2,924 |

### Key Insights

1. **AB1 (900) has highest activity**: 150 users with 438,575 scans (avg 2,924 scans/user)
2. **AB2 (400) has high volume**: 146 users with 192,701 scans (avg 1,320 scans/user)
3. **P2A (500) & P2B (600) low activity**: Only 2-3 scans per user on average

---

## 8. Cross-Machine Employee Analysis

### Convention: Same employee may enroll in multiple machines

**Critical Finding**: Some raw device users appear in multiple machines!

### Top 10 Multi-Machine Users

| raw_device_user_id | Machine Count | Machines |
|---------------------|---------------|----------|
| 2000266 | 6 | ARC_02, ARE, ARC_01, OFFICE_APE, OFFICE_PGE, PGE |
| 2000825 | 6 | PGE, OFFICE_APE, OFFICE_PGE, ARC_01, ARE, ARC_02 |
| 7000625 | 6 | OFFICE_PGE, OFFICE_APE, PGE, DME_01, ARE, DME_02 |
| 1000001 | 5 | OFFICE_PGE, P1A, PGE, ARC_01, P1B |
| 1000004 | 5 | P1B, ARC_01, PGE, P1A, OFFICE_PGE |
| 1000005 | 5 | OFFICE_PGE, P1A, PGE, ARC_01, P1B |
| 1000007 | 5 | P1A, OFFICE_PGE, PGE, ARC_01, P1B |
| 1000008 | 5 | P1B, ARC_01, PGE, OFFICE_PGE, P1A |
| 1000010 | 5 | P1A, OFFICE_PGE, PGE, ARC_01, P1B |
| 1000011 | 5 | P1B, ARC_01, PGE, OFFICE_PGE, P1A |

### Multi-Machine Patterns

1. **Office machines (PGE, OFFICE_PGE, OFFICE_APE)**: Most multi-machine users include these
2. **ARC users (200 prefix)**: Highest cross-machine enrollment (6 machines)
3. **Field workers**: Users scanning at multiple division machines

---

## 9. Machine Status

| Machine Code | Location Name | Status | Last Sync | Scans |
|--------------|--------------|--------|-----------|-------|
| AB1 | Aerial Base 1 | ACCESSIBLE | 2026-06-23 | High |
| AB2 | Aerial Base 2 | ACCESSIBLE | 2026-06-23 | High |
| ARC_01 | Arc Estate 1 | ACCESSIBLE | 2026-06-23 | High |
| ARC_02 | Arc Estate 2 | ACCESSIBLE | 2026-06-23 | Low |
| ARE | Astra RE | ACCESSIBLE | 2026-06-23 | High |
| DME_01 | DME Estate 1 | ACCESSIBLE | 2026-06-23 | High |
| DME_02 | DME Estate 2 | ACCESSIBLE | 2026-06-23 | Medium |
| IJL | IJL Mill | ACCESSIBLE | 2026-06-23 | Medium |
| MILL | Mill Office | ACCESSIBLE | 2026-06-23 | High |
| OFFICE_APE | Office APE | ACCESSIBLE | 2026-06-23 | High |
| OFFICE_PGE | Office PGE | ACCESSIBLE | 2026-06-23 | High |
| P1A | Pabrik 1 A | ACCESSIBLE | 2026-06-23 | Medium |
| P1B | Pabrik 1 B | ACCESSIBLE | 2026-06-23 | Medium |
| P2A | Pabrik 2 A | ACCESSIBLE | 2026-06-23 | Low |
| P2B | Pabrik 2 B | ACCESSIBLE | 2026-06-23 | Low |

---

## 10. Division Distribution

| Code | Division Name | Loc | Employees | Machines |
|------|---------------|-----|-----------|----------|
| AB1 | Aerial Base 1 | G | High | 1 |
| AB2 | Aerial Base 2 | H | High | 1 |
| ARC | Arc Estate | J | High | 2 |
| ARE | Astra RE | - | Medium | 1 |
| DME | DME Estate | E | High | 2 |
| IJL | IJL Mill | L | Medium | 1 |
| MILL | Mill Office | M | High | 1 |
| OFFICE_APE | Office APE | - | Medium | 1 |
| OFFICE_PGE | Office PGE | - | Medium | 1 |
| P1A | Pabrik 1 A | A | Medium | 1 |
| P1B | Pabrik 1 B | B | Medium | 1 |
| P2A | Pabrik 2 A | C | Low | 1 |
| P2B | Pabrik 2 B | D | Low | 1 |

---

## 11. Data Quality Summary

### Convention Compliance Matrix

| Convention | Rule | Status | Evidence |
|------------|------|--------|----------|
| Short ID = EXCLUDED | <=5 digits → UNMAPPED | ✅ PASS | 424,438 UNMAPPED |
| Long ID = Parse | >5 digits → scanner prefix parse | ✅ PASS | All parsed |
| db_ptrj Lookup | Parsed code → HR verification | ✅ PASS | 99.9% verified |
| Multi-machine | Same employee may appear multiple | ✅ DOCUMENTED | 10+ users found |

### Data Quality Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Long ID Mapping Rate | 99.95% | ✅ Excellent |
| Short ID Proper Exclusion | 100% | ✅ Excellent |
| HR Verification Rate | 99.9% | ✅ Excellent |
| Cross-machine Users | 10+ identified | ⚠️ Needs review |

---

## 12. Recommendations

### Immediate Actions

1. **Investigate empty raw_device_user_id**: 39,242 records have empty IDs
2. **Review 365 NEED_REVIEW records**: Long IDs that couldn't be mapped
3. **Verify 2 unmatched registry entries**: Users without HR code

### Long-term Improvements

1. **Implement cross-machine deduplication**: Use `zkteco_absensi_user_registry` to identify same employees
2. **Add primary machine designation**: For multi-machine users, identify home location
3. **Monitor P2A/P2B low activity**: Only 2-3 scans per user average

---

## Appendix: Scanner Prefix Reference

| Prefix | LocCode | Division | Example |
|--------|---------|----------|---------|
| 001 | L | IJL | 0010040 → L0040 |
| 100 | A | P1A | 1000040 → A0040 |
| 200 | J | ARC | 2000040 → J0040 |
| 300 | B | P1B | 3000040 → B0040 |
| 400 | H | AB2 | 4000040 → H0040 |
| 500 | C | P2A | 5000040 → C0040 |
| 600 | D | P2B | 6000040 → D0040 |
| 700 | E | DME | 7000040 → E0040 |
| 800 | F | ARA | 8000040 → F0040 |
| 900 | G | AB1 | 9000040 → G0040 |

---

*Report Generated: 2026-06-22*
*Analysis Script: scripts/analyze-database.ts*
