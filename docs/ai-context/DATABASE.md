# DATABASE - Struktur Database

## ⚠️ WARNING: Dual Database Target

The project has **TWO different database targets** with different schemas:

| Database | Connection | Status | Used By |
|----------|-----------|--------|---------|
| `extend_db_ptrj` | SqlClient (HTTP Gateway) | LEGACY | Most backend modules |
| `rebinmas_absensi_monitoring` | Direct MSSQL | **NEW** | Migrations, current development |

---

## db_ptrj - HR Source of Truth

**Server**: `DESKTOP-U5GUJPG`
**Database**: `DB_PTRJ`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         db_ptrj (HR SOURCE)                                 │
│                    Single Source of Truth for Employees                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        HR_EMPLOYEE Table                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Column       │ Type        │ Description                                   │
│─────────────┼─────────────┼───────────────────────────────────────────────│
│ EmpCode     │ NVARCHAR    │ Canonical employee code (e.g., 'A0044')        │
│ EmpName     │ NVARCHAR    │ Employee full name                            │
│ LocCode     │ NVARCHAR    │ Location/Division code (e.g., 'A', 'C')        │
│ Status      │ NVARCHAR    │ '1' = Active, '4' = Inactive/Other            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ SYNC (migration 018)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              rebinmas_absensi_monitoring (Local DB)                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Employee ID Lookup Flow

```
raw_device_user_id (e.g., "5000040")
         │
         ├── Short ID (≤5) → EXCLUDED
         │
         └── Long ID (>5)
                  │
                  ▼
           Parse (SSOT: zkteco-employee-code-parser.ts)
           scanner prefix "500" → locCode "C"
           suffix "0040" → padded "0040"
           Result: "C0040"
                  │
                  ▼
           Lookup db_ptrj.HR_EMPLOYEE
           WHERE EmpCode = 'C0040' AND Status = '1'
                  │
         ┌────────┴────────┐
         │                 │
      FOUND              NOT FOUND
         │                 │
         ▼                 ▼
   MAPPED (ACTIVE)    NEED_REVIEW
   (hr_verified=1)    (manual mapping)
```

---

## Database Connection Approaches

### 1. SqlClient (HTTP Gateway) - LEGACY

**File:** `src/shared/database/sql-client.ts`

```typescript
export class SqlClient {
  private readonly gatewayUrl: string;   // http://10.0.0.110:8001/v1/query
  private readonly server: string;        // SERVER_PROFILE_1
  private readonly database: string;      // extend_db_ptrj (default)
}
```

**Issues:**
- HTTP-based, not direct SQL connection
- Targets legacy database
- Stateless requests

### 2. Direct MSSQL - NEW

**File:** `src/lib/db.ts`

```typescript
const sqlConfig: sql.config = {
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};
```

**Benefits:**
- Connection pooling
- Direct SQL Server connection
- Modern approach

---

## Tables - rebinmas_absensi_monitoring (NEW)

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `roles` | User roles | id, name, description |
| `users` | User accounts | id, username, password_hash, email |
| `user_roles` | User-role mapping | user_id, role_id |
| `divisions` | Division master | id, division_code, division_name |
| `gangs` | Gang/team master | id, gang_code, gang_name, division_id |
| `employees` | Employee master | id, employee_code, employee_name, division_id |

### Scanner & Location

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `scanner_codes` | Scanner code mapping | id, scanner_code, loc_code, division_id |
| `loc_codes` | Location codes | id, loc_code, loc_name, division_id |

### Attendance Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `attendance_machines` | Machine inventory | id, machine_code, machine_name, ip_address, port, is_active |
| `attendance_scan_logs` | Raw scan logs | id, raw_device_user_id, machine_code, scan_time, mapping_status |
| `attendance_imports` | Processed attendance | id, employee_code, attendance_date, attendance_status |
| `attendance_import_batches` | Batch tracking | id, batch_code, machine_code, status, started_at |
| `attendance_manual_corrections` | Admin overrides | id, employee_code, work_date, correction_type |

### Audit & Logs

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `attendance_change_logs` | Audit trail | id, entity_type, entity_id, action, old_value, new_value, changed_by |
| `attendance_sync_logs` | Sync history | id, machine_code, sync_type, status, records_count |
| `machine_connection_logs` | Machine health | id, machine_code, connection_status, error_message |

### Configuration

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `app_configs` | Configuration storage | id, config_key, config_value, is_sensitive |
| `holidays` | Holiday calendar | id, holiday_date, holiday_name |
| `shifts` | Shift definitions | id, shift_name, start_time, end_time |
| `employee_schedules` | Employee schedules | id, employee_code, shift_id, effective_date |

### Mapping Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `zkteco_hr_employee_map` | ZKTeco to HR mapping | id, machine_code, zkteco_user_id, hr_employee_code |
| `hr_employee_mapping` | Legacy ZKTeco to HR mapping | id, zkteco_employee_code, hr_employee_id |

> **Note**: `employee_mapping_overrides` is documented but **NOT YET CREATED**. See `docs/MASTER-EMPLOYEE-TABLE-PLAN.md` for migration plan.

---

## Views

### Primary Views

| View | Purpose | Used By |
|------|---------|---------|
| `vw_attendance_monthly_matrix` | Monthly attendance grid | Daily endpoint, Summary |
| `vw_attendance_zkteco_final` | ZKTeco direct scans | Monthly matrix |
| `vw_attendance_monthly_summary_v2` | Aggregated summary | Monthly summary |
| `vw_attendance_final` | Final attendance | Reports |
| `vw_attendance_summary` | Summary stats | Dashboard |
| `vw_attendance_intelligence` | Intelligence layer | Analytics, anomaly detection |

---

## Migrations

**Location:** `migrations/`

| File | Target | Status |
|------|--------|--------|
| `001_create_database.sql` | master | ✅ |
| `002_create_tables.sql` | rebinmas_absensi_monitoring | ✅ |
| `003_create_indexes.sql` | rebinmas_absensi_monitoring | ✅ |
| `004_create_views.sql` | rebinmas_absensi_monitoring | ✅ |
| `005_seed_dummy.sql` | rebinmas_absensi_monitoring | ✅ |
| `006_machine_health_and_errors.sql` | rebinmas_absensi_monitoring | ✅ |
| `007_bulk_insert_attendance_imports.sql` | rebinmas_absensi_monitoring | ✅ |
| `010_create_zkteco_attendance_view.sql` | rebinmas_absensi_monitoring | ✅ |
| `014_create_missing_tables.sql` | rebinmas_absensi_monitoring | ✅ |
| `015_create_hr_mapping.sql` | rebinmas_absensi_monitoring | ✅ |
| `017_create_zkteco_hr_mapping.sql` | rebinmas_absensi_monitoring | ✅ |
| `018_sync_employees_from_hr.sql` | rebinmas_absensi_monitoring | ✅ |

**Migration Runners:**
- `src/scripts/run-migrations.ts` - New runner
- `run-migration.js` - Legacy runner

---

## Additional Migrations

| File | Target | Purpose |
|------|--------|--------|
| `001_create_schema.sql` | extend_db_ptrj | Legacy schema |
| `002_cross_division_sorting.sql` | extend_db_ptrj | Cross-division sorting |
| `003_add_needs_manual_review.sql` | rebinmas_absensi_monitoring | Manual review flag |
| `007a_need_review.sql` | rebinmas_absensi_monitoring | Mapping review |
| `007b_mapped_direct.sql` | rebinmas_absensi_monitoring | Direct mapping |
| `007c_mapped_fallback.sql` | rebinmas_absensi_monitoring | Fallback mapping |
| `008_rescue_unmapped.sql` | rebinmas_absensi_monitoring | Rescue unmapped |
| `009_insert_imports.sql` | rebinmas_absensi_monitoring | Insert imports |
| `009_insert_imports_from_mapped.sql` | rebinmas_absensi_monitoring | From mapped |
| `011_update_employees_to_zkteco_format.sql` | rebinmas_absensi_monitoring | ZKTeco format |
| `012_fix_scan_log_mapping.sql` | rebinmas_absensi_monitoring | Fix mapping |
| `013_optimize_views.sql` | rebinmas_absensi_monitoring | View optimization |
| `014_monthly_matrix_view.sql` | rebinmas_absensi_monitoring | Monthly matrix |
| `015_fix_ijl_unmapped.sql` | rebinmas_absensi_monitoring | IJL fix |
| `016_update_view_multi_format.sql` | rebinmas_absensi_monitoring | Multi-format views |
| `019_add_zkteco_user_id.sql` | rebinmas_absensi_monitoring | ZKTeco user ID |
| `020_update_attendance_views.sql` | rebinmas_absensi_monitoring | Updated views |
| `fix_parsed_employee_codes.sql` | rebinmas_absensi_monitoring | Parse codes fix |
| `021_attendance_intelligence_indexes.sql` | rebinmas_absensi_monitoring | Intelligence indexes |
| `022_quality_health_hardening.sql` | rebinmas_absensi_monitoring | Quality hardening |
| `023_live_attendance_compat.sql` | rebinmas_absensi_monitoring | Live compat |

---

## Schema Differences

| Aspect | rebinmas_absensi_monitoring | extend_db_ptrj |
|--------|---------------------------|-----------------|
| Employee Code | `employee_code NVARCHAR(30)` | `emp_code NVARCHAR(50)` |
| Employee ID | `id INT IDENTITY` | `employee_id INT` |
| Machine Code | `machine_code NVARCHAR(30)` | `machine_code NVARCHAR(20)` |
| Raw Scan ID | `id BIGINT` | `scan_id BIGINT` |
| Attendance Date | `attendance_date DATE` | `work_date DATE` |

---

## Recommended Indexes

```sql
-- attendance_scan_logs indexes
CREATE INDEX idx_scan_logs_date_machine 
ON attendance_scan_logs(scan_date, machine_code);

CREATE INDEX idx_scan_logs_device_user 
ON attendance_scan_logs(raw_device_user_id);

-- zkteco_hr_employee_map indexes
CREATE INDEX idx_mapping_machine_user 
ON zkteco_hr_employee_map(machine_code, zkteco_user_id);

-- attendance_imports indexes
CREATE INDEX idx_imports_employee_date 
ON attendance_imports(employee_code, attendance_date);
```

---

## Environment Variables

```env
DB_SERVER=10.0.0.110
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=<password>
DB_NAME=rebinmas_absensi_monitoring
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```
