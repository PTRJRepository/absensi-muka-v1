---
tags: [ai-context, security, audit]
created: 2026-06-07
---

# Security& Privacy Audit

## Overview

This document provides a security and privacy audit for the Sistem Absensi PT Rebinmas Jaya system.

## Security Analysis

### High Sensitivity Items

| Item | Sensitivity | Risk | Status |
|------|-------------|------|--------|
| API Keys | HIGH | Credential exposure | ⚠️ In source code |
| ZKTeco Password | MEDIUM | Machine access | ⚠️ Hardcoded |
| SQL Gateway URL | MEDIUM | Database access | ✅ In config |
| Employee Names | LOW | Personal data | ✅ In database |

### API Key Exposure

**Issue:** API keys are stored in `config.ts` source file.

**Current State:**
```typescript
// _dev_utils/src/config.ts
export const config = {
  sqlGateway: {
    apiKey: "<API_KEY>",
  },
  absensiApi: {
    apiKey: "<API_KEY>",
  },
};
```

**Risk:** If repository is public or compromised, credentials are exposed.

**Recommendation:**
1. Move to `.env` file
2. Add `.env` to `.gitignore`
3. Use environment variable loading
4. Consider rotating keys periodically

---

### ZKTeco Machine Password

**Issue:** Default password "12345" is hardcoded.

**Current State:**
```typescript
// In machine-sync.ts or similar
await zk.zklibTcp.executeCmd(COMMANDS.CMD_AUTH, Buffer.from('12345'));
```

**Risk:** Low - this is standard ZKTeco default password.

**Recommendation:**
1. Move to configuration
2. Use unique passwords per machine
3. Change default passwords on machines

---

### SQL Injection Risk

**Issue:** Direct string interpolation in SQL queries.

**Current State:**
```typescript
// Vulnerable pattern (used throughout)
await sqlClient.query(`
  SELECT * FROM absen_import
  WHERE division = '${division}' AND year = ${year}
`);
```

**Risk:** MEDIUM - if division/year come from untrusted sources.

**Mitigation:**
- Division values are from controlled config
- Year/month are generated internally
- SQL Gateway may have additional sanitization

**Recommendation:**
1. Use parameterized queries where possible
2. Validate all input values
3. Add input sanitization layer

---

### Network Security

**Exposed Services:**

| Service | URL | Exposure |
|---------|-----|----------|
| IT Solution API | http://10.0.0.110:5176 | Internal network |
| SQL Gateway | http://10.0.0.110:8001/v1/query | Internal network |
| ZKTeco Machines | Various IPs | Plantation network |

**Risk:** Internal network only - acceptable for internal system.

**Recommendation:**
1. Firewall IT Solution API to internal IPs only
2. Firewall SQL Gateway to application server only
3. Use VPN for remote access

---

## Privacy Analysis

### Personal Data Collected

| Data | Type | Storage | Sensitivity |
|------|------|---------|-------------|
| Employee Code | Identifier | Database | LOW |
| Employee Name | Personal | Database | MEDIUM |
| Gang Code | Group | Database | LOW |
| Division | Organization | Database | LOW |
| Attendance Date | Activity | Database | LOW |
| Work Status | Activity | Database | LOW |
| Overtime Hours | Activity | Database | LOW |

### Data Protection Measures

**Current State:**
- No encryption at rest (SQL Server default)
- No encryption in transit (HTTP)
- No access control (no auth system)
- No data masking

**Recommendation:**
1. Enable TDE (Transparent Data Encryption) on SQL Server
2. Use HTTPS for all API communications
3. Implement row-level security for divisions
4. Mask employee names in logs

---

### Data Retention

**Current Policy:** Not defined.

**Recommendation:**
- Define retention period (e.g., 7 years for attendance)
- Implement archival strategy
- Add purge/cleanup jobs

---

## Audit Trail

### Change Logging

The system implements change logging in `absen_change_log`:

```sql
CREATE TABLE absen_change_log (
  emp_code NVARCHAR(50),
  division NVARCHAR(50),
  year INT, month INT, day INT,
  field_name NVARCHAR(50),
  old_value NVARCHAR(MAX),
  new_value NVARCHAR(MAX),
  change_type NVARCHAR(20), -- ADD, EDIT, DELETE
  source_table NVARCHAR(50),
  changed_by NVARCHAR(100),
  changed_at DATETIME
);
```

**Coverage:** Only `absen_machine_input` changes are logged.

**Recommendation:**
1. Log all changes including imports
2. Add IP address tracking
3. Add session/user context

---

### Sync Logging

```sql
CREATE TABLE absen_sync_log (
  sync_date DATETIME,
  division NVARCHAR(50),
  year INT, month INT,
  mode NVARCHAR(10),
  records_synced INT,
  status NVARCHAR(50),
  error_message NVARCHAR(MAX),
  duration_ms INT
);
```

---

## Compliance Considerations

### Indonesian Data Protection (UU PDP)

**Not Applicable:** This is an internal system, not a public service.

**If applicable in future:**
1. Register with authorities
2. Implement consent mechanisms
3. Add data subject rights (access, correction, deletion)
4. Appoint data protection officer

---

## Security Recommendations

### Immediate Actions

1. **Move API keys to .env**
   ```bash
   # .env
   API_KEY=your-secret-key
   ```

2. **Add .gitignore entry**
   ```
   .env
   ```

3. **Enable HTTPS**
   - Configure reverse proxy with SSL
   - Update config URLs to https://

### Short-term Actions

1. **Rotate API keys** - Generate new keys and update
2. **Change ZKTeco passwords** - Use unique passwords
3. **Add input validation** - Validate all user inputs
4. **Enable SQL Server audit** - Track all database access

### Long-term Actions

1. **Implement authentication** - Add user login system
2. **Add role-based access** - Restrict by division
3. **Enable encryption** - TDE and TLS
4. **Add monitoring** - SIEM integration

---

## Related Files

- `_dev_utils/src/config.ts` - Contains API keys
- `_dev_utils/src/machine-sync.ts` - Contains ZKTeco password
- `_dev_utils/src/absensi-service.ts` - Change logging
- `_dev_utils/src/sync.ts` - Sync logging
