# 02_TABLE_RELATIONSHIPS.md

# Table Relationships - PT Rebinmas Jaya Absensi System

## Entity Relationship Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MASTER TABLES                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    1:N     ┌──────────────────┐                     │
│  │ mst_division   │◄────────────│ mst_machine │                     │
│  │ │             │                  │                     │
│  │ division_id (PK) │ │ machine_id (PK)  │                     │
│  │ division_code    │             │ division_id (FK) │ │
│  │ division_name   │             │ machine_code     │                     │
│  │ loc_code        │             │ ip_address       │                     │
│  │ emp_code_prefix │             │ port             │                     │
│  └──────────────────┘             └────────┬─────────┘                     │
│         ▲ │                               │
│         │1:N │ 1:N                           │
│         │                                   │                               │
│  ┌──────┴──────────┐                       │                               │
│  │  mst_employee   │                       │                               │
│  │                 │                       │                               │
│  │ employee_id(PK) │                       │                               │
│  │ emp_code        │                       │                               │
│  │ home_division   │────────────────────────┘                               │
│  │ (FK)           │                                                       │
│  │ machine_id (FK)│                                                       │
│  └───────┬─────────┘                                                       │
│          │ 1:N                                                             │
│          │                                                                 │
│  ┌───────┴──────────────┐                                                 │
│  │ mst_employee_family  │                                                 │
│  │                      │                                                 │
│  │ family_id (PK)       │                                                 │
│  │ employee_id (FK)─────┘                                                 │
│  │ family_name         │                                                   │
│  │ relationship        │                                                   │
│  └─────────────────────┘                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           ATTENDANCE TABLES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ │
│         ┌──────────────────────┐                                          │
│         │  attendance_scan_log │ │
│         │                      │                                          │
│         │ scan_id (PK)         │                                          │
│         │ emp_code             │◄─────────────────────┐                   │
│         │ machine_id (FK)──────┼──────────────────────┤                   │
│         │ scan_division_id(FK)─┘                      │                   │
│         │ work_date            │                      │                   │
│         │ scan_time           │                      │                   │
│         └──────────────────────┘                      │                   │
│                                                       │                   │
│  ┌───────────────────────────────────────────────────┴───────────────┐   │
│  │ employee_attendance_daily                              │   │
│  │                                                              (v2)  │   │
│  │  daily_id (PK)                                                 │   │
│  │  employee_id (FK)──────────────────────────────────────────────┘   │
│  │  emp_code                                                      │   │
│  │  work_date │   │
│  │  first_scan_time                                               │   │
│  │  last_scan_time                                                │   │
│  │  scan_count                                                    │   │
│  │  work_duration_minutes                                         │   │
│  │  overtime_minutes                                              │   │
│  │  home_division_id (FK)─────────────────────────────────────────┘   │
│  │  final_division_id (FK)────────────────────────────────────────────┘
│  │  scan_division_id (FK)                                          │
│  │  attendance_status                                              │
│  │  is_cross_division_scan                                         │
│  └────────────────────────┬────────────────────────────────────────┘   │
│                           │ 1:1 (or 0..1)                                 │
│                           ▼                                                │
│ ┌────────────────────────────────────────────────────────────────┐     │
│  │           attendance_sorting_result                              │     │
│  │ │     │
│  │  sorting_id (PK)                                               │     │
│  │  daily_id (FK)─────────────────────────────────────────────────┘     │
│  │  employee_id (FK)                                               │     │
│  │  emp_code                                                      │     │
│  │  work_date                                                     │     │
│  │  machine_id (FK)                                                │     │
│  │  scan_division_id (FK)                                         │     │
│  │  home_division_id (FK)                                          │     │
│  │  final_division_id (FK)                                         │     │
│  │  sorting_status                                                │     │
│  │  sorting_rule                                                  │     │
│  │  is_cross_division_scan                                        │     │
│  │  need_review                                                   │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ CONFIGURATION TABLES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────┐  ┌──────────────────────┐  ┌────────────────┐ │
│  │ attendance_work_config │  │  attendance_holiday  │  │  absen_config  │ │
│  │                         │  │                      │  │                │ │
│  │ config_id (PK)          │  │ holiday_id (PK)      │  │ id (PK)        │ │
│  │ day_of_week             │  │ holiday_date         │  │ config_key     │ │
│  │ standard_hours          │  │ holiday_name         │  │ config_value   │ │
│  │ description            │  │ is_national          │  │ description    │ │
│  │ is_active              │  │ division_id (FK)     │  │ updated_at     │ │
│  └─────────────────────────┘  └──────────────────────┘  └────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      IMMUTABLE vs MUTABLE TABLES                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ┌─────────────────────┐         ┌──────────────────────────┐               │
│  │   absen_import     │         │  absen_machine_input     │               │
│  │   (IMUTABLE)       │         │  (MUTABLE)               │               │
│  │                    │         │                          │               │
│  │ - Cannot UPDATE │         │ - Can INSERT │               │
│  │ - Cannot DELETE    │         │ - Can UPDATE │               │
│  │ - Cannot EDIT │         │ - Can DELETE             │               │
│  │                    │         │                          │               │
│  │ id (PK)            │         │ id (PK)                  │               │
│  │ emp_code           │ │ emp_code                 │               │
│  │ division           │         │ division │               │
│  │ year, month, day   │         │ year, month, day         │               │
│  │ has_work           │         │ has_work                 │               │
│  │ is_holiday         │         │ is_holiday               │               │
│  │ is_cuti            │         │ is_cuti                  │               │
│  │ is_sakit           │         │ is_sakit                 │               │
│  │ import_batch_id    │         │ input_type               │               │
│  │ is_locked = 1      │         │ created_by              │               │
│  └─────────┬───────────┘         │ notes                   │               │
│            │                     │ updated_at              │               │
│            │ MERGE               └───────────┬────────────┘               │
│            ▼                             │ │
│  ┌─────────────────────────────────────┴──────────────────────┐ │
│  │           getVerificationData() Query                     │           │
│  │                                                              │           │
│  │  FULL OUTER JOIN on (emp_code, division, year, month, day)  │           │
│  │  Priority: machine_input > import │           │
│  │  Returns: AbsenVerificationRecord[]                        │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           MANUAL INPUT TABLES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────┐                                        │
│  │ attendance_manual_input       │                                        │
│  │                                 │                                        │
│  │  input_id (PK)                 │                                        │
│  │  employee_id (FK)───────────────┼─────────────────┐                      │
│  │  emp_code                      │                 │                      │
│  │  work_date                     │                 │                      │
│  │  attendance_type               │                 │                      │
│  │  start_time                    │                 │                      │
│  │  end_time                      │                 │                      │
│  │  duration_minutes              │                 │                      │
│  │  note                          │                 │                      │
│  │  approved_by                  │                 │                      │
│  │  is_approved                   │                 │                      │
│  │  created_by                    │                 │                      │
│  │  is_active                     │                 │                      │
│  └─────────────────────────────────┘                 │                      │
│                                                       │                      │
│                        1:N │                      │
│                        ┌──────┴──────┐                │                      │
│                        │ (via daily) │                │                      │
│                        └─────────────┘                │                      │
│                                                       │                      │
│ ┌─────────────────────────────────────────────────────┴───────────────┐   │
│  │           employee_attendance_daily │   │
│  │                                                              (v2)  │   │
│  │  manual_input_id (FK) ─────────────────────────────────────────────┘   │
│  │  attendance_status (may be MANUAL_INPUT) │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          AUDIT TABLES                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────┐         ┌──────────────────────┐               │
│  │ absen_change_log    │         │  absen_import_batch  │               │
│  │                      │         │                      │               │
│  │ id (PK)             │         │ id (PK)              │               │
│  │ emp_code            │         │ batch_id (UNIQUE)    │               │
│  │ division            │         │ division             │               │
│  │ year, month, day    │         │ year, month          │               │
│  │ field_name          │         │ total_records        │               │
│  │ old_value           │         │ imported_records     │               │
│  │ new_value           │         │ status               │               │
│  │ change_type         │         │ import_started_at    │               │
│  │ source_table        │         │ import_completed_at  │               │
│  │ changed_by          │         │ error_message        │               │
│  │ changed_at          │         │ imported_by          │               │
│  └──────────────────────┘         └──────────────────────┘               │
│                                                                             │
│  ┌──────────────────────┐                                                   │
│  │  absen_sync_log     │                                                   │
│  │                      │                                                   │
│  │ id (PK)             │                                                   │
│  │ sync_date           │                                                   │
│  │ division            │                                                   │
│  │ year, month         │                                                   │
│  │ mode                │                                                   │
│  │ records_synced      │                                                   │
│  │ status              │                                                   │
│  │ error_message       │                                                   │
│  │ duration_ms         │                                                   │
│  └──────────────────────┘                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Relationship Summary

### Master Tables (No FK dependencies)
| Table | Primary Key | Referenced By |
|-------|-------------|---------------|
| mst_division | division_id | mst_machine, mst_employee, attendance_scan_log, employee_attendance_daily, attendance_sorting_result, attendance_holiday |
| mst_machine | machine_id | mst_employee, attendance_scan_log, attendance_sorting_result |

### Data Tables (FK dependencies)
| Table | Foreign Keys | Purpose |
|-------|-------------|---------|
| mst_employee | division_id, machine_id | Employee master with home division |
| attendance_scan_log | machine_id, scan_division_id | Raw scan events |
| employee_attendance_daily | employee_id, home_division_id, final_division_id, scan_division_id | Daily aggregated attendance |
| attendance_sorting_result | daily_id, employee_id, machine_id, scan_division_id, home_division_id, final_division_id | Division sorting audit |
| attendance_manual_input | employee_id | Manual attendance entries |
| mst_employee_family | employee_id | Employee family members |

### Configuration Tables (Standalone)
| Table | Purpose |
|-------|---------|
| attendance_work_config | Standard work hours per day of week |
| attendance_holiday | Holiday schedule |
| absen_config | System configuration key-value store |

### Audit/Log Tables (Standalone)
| Table | Purpose |
|-------|---------|
| absen_change_log | Change audit trail |
| absen_import_batch | Import batch tracking |
| absen_sync_log | Sync operation logs |

---

## Key Relationship Patterns

### Pattern 1: Division Hierarchy
```
mst_division (1) ──< mst_machine (N)
mst_division (1) ──< mst_employee (N)
mst_division (1) ──< attendance_scan_log (N)
mst_division (1) ──< employee_attendance_daily (N)
```

### Pattern 2: Employee -> Attendance
```
mst_employee (1) ──< attendance_scan_log (N)
mst_employee (1) ──< employee_attendance_daily (N)
mst_employee (1) ──< attendance_manual_input (N)
mst_employee (1) ──< mst_employee_family (N)
```

### Pattern 3: Daily Aggregation
```
attendance_scan_log (N) ──> employee_attendance_daily (1)
 │
                                          └──< attendance_sorting_result (1)
```

### Pattern 4: Immutable + Mutable Merge
```
absen_import (N) + absen_machine_input (N) ──> getVerificationData() ──> MERGED VIEW
                                                    Priority: machine_input > import
```

---

## Cardinality Summary

| Relationship | Type | Description |
|--------------|------|-------------|
| division : machine | 1:N | One division has many machines |
| division : employee | 1:N | One division has many employees |
| employee : scan_log | 1:N | One employee has many scan events |
| employee : daily |1:1 | One employee has one daily record per day |
| employee : manual_input | 1:N | One employee has many manual inputs |
| daily : sorting | 1:1 | One daily record has one sorting result |
| machine : scan_log | 1:N | One machine records many scans |
