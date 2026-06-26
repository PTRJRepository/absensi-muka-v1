# SQL Gateway Security Documentation

> **Classification:** Internal Use Only  
> **Version:** 1.0.0  
> **Last Updated:** 2026-06-07

---

## Overview

This document describes the security architecture of the SQL Gateway HTTP interface used to access the SQL Server database `extend_db_ptrj`.

---

## SQL Gateway Architecture

### Gateway Endpoint

```
http://10.0.0.110:8001/v1/query
```

### Authentication Model

The SQL Gateway uses API key authentication:

1. **API Key:** Sent via `x-api-key` HTTP header
2. **Server Profile:** Specified in request body
3. **Database:** Specified in request body

### Request Format

```typescript
// HTTP Request Structure
POST http://10.0.0.110:8001/v1/query
Headers:
  Content-Type: application/json
  x-api-key: [REDACTED]

Body:
{
  "sql": "SELECT * FROM absen_import WHERE division = 'PG1A'",
  "server": "SERVER_PROFILE_1",
  "db": "extend_db_ptrj"
}
```

### Response Format

```typescript
// Success Response
{
  "success": true,
  "data": {
    "recordset": [...],
    "rowsAffected": 0
  }
}

// Error Response
{
  "success": false,
  "error": "Error message here"
}
```

---

## Access Control Configuration

### Current Configuration

```typescript
// _dev_utils/src/config.ts
export const config = {
  sqlGateway: {
    baseUrl: "http://10.0.0.110:8001/v1/query",
    apiKey: "REDACTED",  // [REDACTED]
    server: "SERVER_PROFILE_1",
    database: "extend_db_ptrj",
  },
};
```

### Server Profile

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Profile Name | `SERVER_PROFILE_1` | Named connection profile |
| Database | `extend_db_ptrj` | Target database |
| Access Level | Full | Read/Write permitted |

---

## Security Controls

### 1. Network-Level Security

| Control | Implementation |
|---------|----------------|
| Firewall | Only internal network (10.0.0.0/24) can access |
| Port | 8001 (non-standard HTTP port) |
| Protocol | HTTPS not required (internal network) |

### 2. Application-Level Security

| Control | Implementation |
|---------|----------------|
| API Key | 64-character hex string required |
| Input Validation | SQL Gateway validates inputs |
| Parameterized Queries | Use parameterized queries in code |

### 3. Database-Level Security

| Control | Implementation |
|---------|----------------|
| Server Profile | Pre-configured connection profile |
| Database | Limited to `extend_db_ptrj` only |
| User Rights | Per SQL Server configuration |

---

## SQL Injection Prevention

### Current Implementation

The codebase uses string concatenation for SQL queries, which has potential SQL injection risks:

```typescript
// Vulnerable pattern (current implementation)
const result = await sqlClient.query(`
  SELECT * FROM absen_import
  WHERE division = '${division}' AND year = ${year} AND month = ${month}
`);
```

### Recommended: Parameterized Queries

```typescript
// Safer implementation using parameterized queries
async function safeQuery(division: string, year: number, month: number) {
  const response = await fetch(config.sqlGateway.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.sqlGateway.apiKey,
    },
    body: JSON.stringify({
      sql: "SELECT * FROM absen_import WHERE division = @division AND year = @year AND month = @month",
      params: {
        division: division,
        year: year,
        month: month
      },
      server: config.sqlGateway.server,
      db: config.sqlGateway.database,
    }),
  });

  const result = await response.json();
  return result.data;
}
```

### Input Validation

```typescript
// Validate and sanitize inputs
function validateDivision(division: string): string {
  // Allow only alphanumeric and common characters
  const allowed = /^[A-Z0-9_-]+$/;
  if (!allowed.test(division)) {
    throw new Error("Invalid division format");
  }
  return division.toUpperCase();
}

function validateYear(year: number): number {
  if (year < 2020 || year > 2100) {
    throw new Error("Invalid year");
  }
  return year;
}

function validateMonth(month: number): number {
  if (month < 1 || month > 12) {
    throw new Error("Invalid month");
  }
  return month;
}
```

---

## Rate Limiting

### Current State

No rate limiting is implemented at the application level.

### Recommended Implementation

```typescript
// Rate limiter middleware
const requestCounts = new Map<string, number[]>();

function checkRateLimit(ip: string, limit: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now();
  const requests = requestCounts.get(ip) || [];

  // Remove old requests
  const recentRequests = requests.filter(t => now - t < windowMs);

  if (recentRequests.length >= limit) {
    return false; // Rate limited
  }

  recentRequests.push(now);
  requestCounts.set(ip, recentRequests);
  return true;
}

// Usage in API handler
app.post("/v1/query", async (req, res) => {
  const ip = req.ip;

  if (!checkRateLimit(ip, 60, 60000)) {
    return res.status(429).json({
      success: false,
      error: "Rate limit exceeded"
    });
  }

  // Process request...
});
```

---

## Audit Logging

### Log All SQL Operations

```typescript
// Log to audit table
async function logSqlOperation(
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE",
  sql: string,
  success: boolean,
  user?: string
): Promise<void> {
  // Truncate SQL for logging (security)
  const truncatedSql = sql.substring(0, 1000);

  await sqlClient.execute(`
    INSERT INTO absen_sql_audit_log (
      operation, sql_text, success, user_name, logged_at
    ) VALUES (
      '${operation}',
      '${truncatedSql.replace(/'/g, "''")}',
      ${success ? 1 : 0},
      ${user ? `'${user}'` : 'NULL'},
      GETDATE()
    )
  `);
}
```

### Audit Log Schema

```sql
CREATE TABLE absen_sql_audit_log (
  id INT IDENTITY(1,1) PRIMARY KEY,
  operation NVARCHAR(20) NOT NULL,
  sql_text NVARCHAR(1000),
  success BIT DEFAULT 0,
  user_name NVARCHAR(100),
  logged_at DATETIME DEFAULT GETDATE(),
  client_ip NVARCHAR(50)
);
```

---

## Access Control Matrix

| Role | Query Database | Insert Data | Update Data | Delete Data |
|------|---------------|-------------|-------------|-------------|
| System (Sync) | Yes | Yes | Yes | No |
| Read-Only User | Yes | No | No | No |
| Admin User | Yes | Yes | Yes | Yes |
| Auditor | Yes (logs) | No | No | No |

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` | Invalid API key | Verify key in config.ts |
| `403 Forbidden` | Insufficient permissions | Check server profile |
| `404 Not Found` | Wrong endpoint URL | Verify baseUrl |
| `500 Internal Error` | SQL Gateway error | Check server logs |
| `Connection refused` | Gateway down | Check gateway service |

### Connectivity Test

```bash
# Test SQL Gateway availability
curl -X POST http://10.0.0.110:8001/v1/query \
  -H "Content-Type: application/json" \
  -H "x-api-key: [REDACTED]" \
  -d '{"sql":"SELECT 1 as test","server":"SERVER_PROFILE_1","db":"master"}'

# Expected response:
# {"success":true,"data":{"recordset":[{"test":1}]}}
```

---

## Security Best Practices

1. **Rotate API Keys** quarterly
2. **Use HTTPS** for external access
3. **Implement input validation** before queries
4. **Log all operations** for audit trail
5. **Monitor failed attempts** for intrusion detection
6. **Restrict network access** via firewall
7. **Use least privilege** for database user

---

## Related Documentation

- [01_SECRETS_MANAGEMENT.md](./01_SECRETS_MANAGEMENT.md) - API key security
- [05_CHANGE_AUDIT.md](./05_CHANGE_AUDIT.md) - Audit logging
- [07_CONFIGURATION_REFERENCE.md](./07_CONFIGURATION_REFERENCE.md) - Full config reference