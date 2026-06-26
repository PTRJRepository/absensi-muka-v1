---
tags: [ai-context, error-handling, logging]
created: 2026-06-07
---

# Error Handling & Logging

## Error Handling Strategy

### 1. Network Errors

**Connection Timeout**
```typescript
// In machine-sync.ts
const zk = new ZKLib({
  ip: config.ip,
  port: config.port,
  timeout: 10000,  // 10 seconds
  connectionTimeout: 4000
});
```

**Handling:** Catch exception, log error, continue to next machine.

```typescript
try {
  await zk.createSocket();
} catch (error: any) {
  console.log(` ❌ Error: ${error.message}`);
  return [];
}
```

---

### 2. API Errors

**HTTP Error Codes**

| Code | Meaning | Handling |
|------|---------|----------|
| 401 | Invalid API key | Log error, stop sync |
| 404 | Endpoint not found | Log error, skip endpoint |
| 500 | Server error | Retry with backoff |

**Implementation:**
```typescript
// In absensi-client.ts
private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url.toString(), {
    headers: { "x-api-key": this.apiKey },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
```

---

### 3. Database Errors

**Constraint Violations**
```typescript
// In absensi-import.ts
try {
  await query(sql);
  inserted++;
} catch (e: any) {
  errors.push(`${r.emp_code} day ${r.hari}: ${e.message}`);
}
```

**Handling:** Log error, continue processing remaining records.

---

### 4. Data Validation Errors

**Missing Required Fields**
```typescript
// Validate before insert
if (!record.emp_code || !record.division) {
  errors.push(`Missing required fields for record`);
  continue;
}
```

---

## Logging Strategy

### 1. Console Logging

**Sync Progress**
```typescript
console.log(`\n📥 Syncing: ${division} - ${month}/${year}`);
console.log(` 📡 Fetching from API...`);
console.log(`  ✅ Got ${count} employees`);
console.log(`  ❌ Error: ${error.message}`);
```

**Log Levels:**
- `📥` - Operation start
- `📡` - Network activity
- `✅` - Success
- `⚠️` - Warning (no data)
- `❌` - Error

---

### 2. Database Logging

**Sync Log Table**
```sql
INSERT INTO absen_sync_log (
  division, year, month, mode,
  records_synced, status, error_message, duration_ms
) VALUES (
  'PG1A', 2026, 6, 'hk',
  6324, 'SUCCESS', NULL, 2341
);
```

**Batch Log Table**
```sql
INSERT INTO absen_import_batch (
  batch_id, division, year, month,
  total_records, imported_records, status, error_message
) VALUES (
  'batch-xxx', 'PG1A', 2026, 6,
  6324, 6324, 'COMPLETED', NULL
);
```

---

### 3. Change Log Table

```sql
INSERT INTO absen_change_log (
  emp_code, division, year, month, day,
  field_name, old_value, new_value,
  change_type, source_table, changed_by
) VALUES (
  'A0039', 'PG1A', 2026, 6, 1,
  'has_work', 0, 1,
  'EDIT', 'absen_machine_input', 'admin'
);
```

---

## Error Patterns

### Pattern 1: Connection Refused

**Error:** `ECONNREFUSED`
**Cause:** Port closed or machine offline
**Action:** Check port forwarding, verify machine is online

### Pattern 2: Timeout

**Error:** `Timeout: operation timed out`
**Cause:** Network latency or machine busy
**Action:** Increase timeout, retry later

### Pattern 3: Invalid API Key

**Error:** `API Error: 401`
**Cause:** Wrong or expired API key
**Action:** Verify API key in config.ts

### Pattern 4: SQL Constraint Violation

**Error:** `Violation of UNIQUE KEY constraint`
**Cause:** Duplicate record insertion
**Action:** Check batch_id uniqueness, use MERGE instead of INSERT

### Pattern 5: Machine Not ZKTeco

**Error:** `offset out of range`
**Cause:** Protocol mismatch (not ZKTeco device)
**Action:** Use IT Solution API instead

---

## Error Recovery

### Automatic Recovery

1. **Per-Record Errors:** Skip record, continue batch
2. **Per-Division Errors:** Skip division, continue others
3. **Critical Errors:** Log and stop sync

### Manual Recovery

1. **Failed Sync:** Re-run sync for specific division
2. **Partial Import:** Use batch_id to identify failed records
3. **Data Corruption:** Reset and re-import

---

## Monitoring

### Sync Status Monitoring

```sql
-- Recent sync operations
SELECT TOP 10 * FROM absen_sync_log
ORDER BY sync_date DESC;

-- Failed syncs
SELECT * FROM absen_sync_log
WHERE status = 'FAILED'
ORDER BY sync_date DESC;

-- Sync statistics by division
SELECT division, COUNT(*) as total,
 SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
  SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
FROM absen_sync_log
GROUP BY division;
```

---

### Batch Status Monitoring

```sql
-- Pending/in-progress batches
SELECT * FROM absen_import_batch
WHERE status IN ('PENDING', 'IN_PROGRESS');

-- Batches with errors
SELECT * FROM absen_import_batch
WHERE status = 'COMPLETED_WITH_ERRORS'
ORDER BY import_started_at DESC;
```

---

## Related Files

- `_dev_utils/src/sync.ts` - Sync error handling
- `_dev_utils/src/absensi-import.ts` - Import error handling
- `_dev_utils/src/machine-sync.ts` - Machine error handling
- `_dev_utils/src/absensi-client.ts` - API error handling
- `_dev_utils/src/sql-client.ts` - Database error handling
