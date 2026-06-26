# Data Privacy Documentation

> **Classification:** Internal Use Only  
> **Version:** 1.0.0  
> **Last Updated:** 2026-06-07

---

## Overview

This document describes how employee personal data is handled, stored, and protected in the Absensi PT Rebinmas Jaya system.

---

## Data Classification

### Data Categories

| Category | Description | Examples | Sensitivity |
|----------|-------------|----------|-------------|
| **Personal Identifiers** | Directly identifies employee | emp_code, emp_name, NIK | High |
| **Employment Data** | Employment relationship | division, gang_code, task_code | Medium |
| **Attendance Records** | Time and attendance data | has_work, is_sunday, ot_hours | Medium |
| **System Data** | Infrastructure data | machine_ip, sync logs | Low |

---

## Personal Data Elements

### Employee Identifiers

| Field | Description | Format | Example |
|-------|-------------|--------|---------|
| `emp_code` | Employee code | `{LocCode}{4-digit}` | A0039, L10002 |
| `emp_name` | Employee name | Full name | Budi Santoso |
| `nik` | National ID number | Not stored | - |

### Employment Information

| Field | Description | Source |
|-------|-------------|--------|
| `division` | Work division | API / Machine |
| `gang_code` | Work group | API / Machine |
| `task_code` | Task assignment | API / Machine |

### Attendance Data

| Field | Description | Notes |
|-------|-------------|-------|
| `has_work` | Worked that day | Boolean |
| `is_sunday` | Sunday flag | Boolean |
| `is_holiday` | Holiday flag | Boolean |
| `is_cuti` | Leave (cuti) flag | Boolean |
| `is_sakit` | Sick leave flag | Boolean |
| `ot_hours` | Overtime hours | Decimal |
| `attendance_date` | Date of attendance | Date |

---

## Data Flow

### Source to Storage Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA FLOW │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐      ┌─────────────┐      │
│  │ ZKTeco    │      │ IT Solution │      │   Manual    │      │
│  │   Machines  │      │     API     │      │   Input     │      │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘      │
│ │                    │                    │              │
│         ▼ ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ ABSENSI SYNC SERVICE │     │
│  │                                                          │     │
│  │  1. Fetch data from sources │     │
│  │  2. Transform to standard format                       │     │
│  │  3. Insert into database │     │
│  │  4. Log sync operation │     │
│  └─────────────────────────────────────────────────────────┘     │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                   SQL SERVER                             │     │
│  │                                                          │     │
│  │  absen_import (IMUTABLE)                                 │     │
│  │  absen_machine_input (MUTABLE)                           │     │
│  │  absen_change_log (AUDIT)                               │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Immutability

### absen_import Table (Immutable)

Records in `absen_import` are **locked** and cannot be modified:

```sql
-- Records are marked as locked
is_locked BIT DEFAULT 1

-- No UPDATE or DELETE operations allowed
-- Only batch INSERT permitted
```

### absen_machine_input Table (Mutable)

Manual corrections are stored in `absen_machine_input`:

```sql
-- Can be inserted, updated, or deleted
-- Changes are logged in absen_change_log
-- Original import data remains unchanged
```

---

## Data Minimization

### Principles Applied

1. **Collection Minimization**
   - Only collect data required for attendance tracking
   - NIK not stored (uses emp_code instead)

2. **Storage Minimization**
   - Aggregated daily records, not raw timestamps
   - Machine IPs stored for debugging only

3. **Retention Minimization**
   - Recommend 2-year retention for change logs
   - Archive historical data after 6 months

---

## Access Control

### Database-Level Access

| Role | Tables | Permissions |
|------|--------|-------------|
| SYSTEM | absen_import | INSERT only |
| SYSTEM | absen_machine_input | Full CRUD |
| SYSTEM | absen_change_log | INSERT only |
| SYSTEM | absen_sync_log | INSERT only |
| ADMIN | All tables | Full access |
| AUDITOR | All tables | SELECT only |

### Application-Level Access

```typescript
// Access control checks
async function checkAccess(user: string, action: string, table: string): Promise<boolean> {
  const permissions = {
    "SYSTEM": {
      "absen_import": ["INSERT"],
      "absen_machine_input": ["INSERT", "UPDATE", "DELETE"],
      "absen_change_log": ["INSERT"],
    },
    "ADMIN": {
      "*": ["INSERT", "UPDATE", "DELETE", "SELECT"],
    },
    "AUDITOR": {
      "*": ["SELECT"],
    },
  };

  const userPerms = permissions[user];
  if (!userPerms) return false;

  const tablePerms = userPerms[table] || userPerms["*"];
  return tablePerms?.includes(action) || false;
}
```

---

## Data Protection Measures

### 1. Network Security

| Measure | Implementation |
|---------|----------------|
| Firewall | Internal network only access |
| VPN | Required for remote access |
| TLS | HTTPS for external communication |

### 2. Database Security

| Measure | Implementation |
|---------|----------------|
| Authentication | SQL Gateway API key |
| Authorization | Server profile permissions |
| Encryption | At-rest encryption (SQL Server TDE) |

### 3. Application Security

| Measure | Implementation |
|---------|----------------|
| Input Validation | Division/year/month validation |
| SQL Injection | Parameterized queries (recommended) |
| Audit Logging | All changes logged |

---

## Employee Rights

### Data Subject Rights

| Right | Implementation | Notes |
|-------|----------------|-------|
| Access | getVerificationData() | View own records |
| Correction | upsertMachineInput() | Request corrections |
| Deletion | Not supported | Historical records immutable |
| Portability | Export API | Export to CSV/JSON |

### Request Handling

```typescript
// Employee data access request
async function handleDataAccessRequest(empCode: string): Promise<any> {
  // Verify requester identity
  const requester = getCurrentUser();
  if (!canAccessEmployeeData(requester, empCode)) {
    throw new Error("Unauthorized access");
  }

  // Fetch all records for employee
  const records = await sqlClient.query(`
    SELECT * FROM absen_import
    WHERE emp_code = '${empCode}'
    ORDER BY year DESC, month DESC
 `);

  return {
    emp_code: empCode,
    records: records.recordset,
    exported_at: new Date().toISOString(),
  };
}
```

---

## Data Anonymization

### For Testing/Development

```typescript
// Anonymize employee data for testing
function anonymizeRecords(records: any[]): any[] {
  return records.map(record => ({
    ...record,
    emp_code: `EMP${hashString(record.emp_code).substring(0, 8)}`,
    emp_name: "ANONYMIZED",
    gang_code: record.gang_code ? `GANG${hashString(record.gang_code).substring(0, 4)}` : null,
  }));
}

// Simple hash function
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
```

### For Analytics

```typescript
// Aggregate data without personal identifiers
async function getDivisionStatistics(division: string, year: number, month: number) {
  const result = await sqlClient.query(`
    SELECT
      COUNT(DISTINCT emp_code) as total_employees,
      SUM(CASE WHEN has_work = 1 THEN 1 ELSE 0 END) as work_days,
      SUM(ot_hours) as total_overtime,
      AVG(ot_hours) as avg_overtime
    FROM absen_import
    WHERE division = '${division}'
      AND year = ${year}
      AND month = ${month}
  `);

  return result.recordset[0];
}
```

---

## Breach Response

### Incident Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| Critical | Personal data exposed | Immediate |
| High | Unauthorized access | 24 hours |
| Medium | System vulnerability | 72 hours |
| Low | Minor security issue | 1 week |

### Response Procedure

1. **Contain** - Isolate affected systems
2. **Assess** - Determine scope of breach
3. **Notify** - Inform affected employees
4. **Remediate** - Fix security issues
5. **Document** - Record incident details

---

## Compliance Checklist

- [ ] Data minimization implemented
- [ ] Access controls configured
- [ ] Audit logging enabled
- [ ] Encryption in transit
- [ ] Encryption at rest
- [ ] Retention policy defined
- [ ] Data subject rights supported
- [ ] Incident response plan documented
- [ ] Regular security reviews conducted

---

## Related Documentation

- [05_CHANGE_AUDIT.md](./05_CHANGE_AUDIT.md) - Audit trail implementation
- [07_CONFIGURATION_REFERENCE.md](./07_CONFIGURATION_REFERENCE.md) - Full config reference
- [09_DEPLOYMENT_STEPS.md](./09_DEPLOYMENT_STEPS.md) - Secure deployment practices