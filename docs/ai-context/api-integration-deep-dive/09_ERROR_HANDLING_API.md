# API Error Handling Patterns

## Overview

This document covers error handling strategies for the IT Solution API integration, including HTTP errors, data validation errors, and network issues.

---

## Error Categories

### 1. HTTP Status Errors

Returned when API server responds with non-2xx status code.

```typescript
// From absensi-client.ts
private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url.toString(), {
    headers: {
      "x-api-key": this.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
```

### 2. JSON Parse Errors

Returned when API response is not valid JSON.

### 3. Application Errors

Returned in JSON response with `success: false`.

### 4. Network Errors

Connection failures, timeouts, DNS errors.

---

## HTTP Error Codes

| Code | Meaning | Handling |
|------|---------|----------|
| 400 | Bad Request | Check parameters |
| 401 | Unauthorized | Check API key |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Check endpoint |
| 500 | Server Error | Retry with backoff |
| 502 | Bad Gateway | Retry later |
| 503 | Service Unavailable | Retry later |

---

## Error Response Formats

### HTTP Error (4xx/5xx)

```json
{
  "error": "Invalid or missing API key"
}
```

### Application Error

```json
{
  "success": false,
  "error": "Invalid division parameter"
}
```

---

## Handling Patterns

### Pattern 1: Basic Try-Catch

```typescript
async function fetchWithErrorHandling() {
  try {
    const data = await absensiApi.getAttendance('PG1A', 6, 2026, 'hk');
    return data;
  } catch (error: any) {
    console.error('API call failed:', error.message);
    return null;
  }
}
```

### Pattern 2: Retry with Backoff

```typescript
async function fetchWithRetry(
  fn: () => Promise<any>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt === maxRetries) throw error;

      console.log(`Retry ${attempt}/${maxRetries} in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2;  // Exponential backoff
    }
  }
}

// Usage
const data = await fetchWithRetry(
  () => absensiApi.getAttendance('PG1A', 6, 2026, 'hk')
);
```

### Pattern 3: Graceful Degradation

```typescript
async function getAttendanceSafe(
  division: string,
  month: number,
  year: number,
  mode: "hk" | "ot" = "hk"
): Promise<any[]> {
  try {
    return await absensiApi.getAttendance(division, month, year, mode);
  } catch (error: any) {
    // Log error but don't fail entire operation
    console.warn(`Failed to fetch ${division}: ${error.message}`);
    return [];  // Return empty array for graceful continuation
  }
}

// Usage in batch processing
for (const division of divisions) {
  const data = await getAttendanceSafe(division, 6, 2026, 'hk');
  if (data.length === 0) {
    console.log(`⚠️ No data for ${division}, skipping...`);
    continue;
  }
  // Process data...
}
```

### Pattern 4: Division-Level Error Handling

```typescript
async function runImport(options: any = {}) {
  const divisions = options.division ? [options.division] : config.divisions;

  for (const division of divisions) {
    try {
      const count = await importFromApi(division, options.year, options.month);
      totalImported += count;
    } catch (e: any) {
      // Log error but continue with next division
      console.log(`  ❌ Error importing ${division}: ${e.message}`);
      // Could also log to error tracking system
    }
  }
}
```

---

## Database Error Handling

### Insert Errors

```typescript
let inserted = 0;
const errors: string[] = [];

for (let i = 0; i < records.length; i++) {
  const r = records[i];

  try {
    await query(sql);
    inserted++;
  } catch (e: any) {
    // Log error but continue with next record
    errors.push(`${r.emp_code} day ${r.hari}: ${e.message}`);
  }
}

// Update batch status based on errors
const finalStatus = errors.length > 0
  ? "COMPLETED_WITH_ERRORS"
  : "COMPLETED";
```

### Connection Errors

```typescript
// From sql-client.ts
async query<T = any>(sql: string): Promise<T> {
  try {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        sql,
        db: this.database,
        server: this.server,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Query failed");
    }

    return result.data;
  } catch (error: any) {
    console.error('Database query failed:', error.message);
    throw error;
  }
}
```

---

## Validation Errors

### Date Validation

```typescript
// Validate day exists in month
const date = new Date(year, month - 1, day);
if (date.getMonth() !== month - 1) {
  // Invalid day (e.g., day_31 in June)
  continue;
}
```

### Data Validation

```typescript
// Skip null day data
if (!dayData) continue;

// Validate required fields
if (!emp.empCode) {
  console.warn('Missing empCode, skipping record');
  continue;
}
```

---

## Error Logging

### Console Logging

```typescript
// From import pipeline
console.log(`\n📥 Importing: ${division} - ${month}/${year}`);
console.log("  📡 Fetching from API...");

if (!apiData || apiData.length === 0) {
  console.log("  ⚠️ No data from API");
  return 0;
}

console.log(`  ✅ Got ${apiData.length} employees`);
```

### Database Logging

```typescript
// From sync.ts
await logSync(
  division, year, month, mode,
  syncedCount, "SUCCESS", null, duration
);

// On failure
await logSync(
  division, year, month, mode,
  0, "FAILED", error.message, duration
);
```

---

## Complete Error Handling Example

```typescript
async function importWithFullErrorHandling(division: string, year: number, month: number) {
  const batchId = `batch-${Date.now()}`;
  let inserted = 0;
  const errors: any[] = [];

  try {
    // Step 1: Fetch from API
    console.log(`Fetching data for ${division}...`);
    const apiData = await absensiApi.getAttendance(division, month, year, 'hk');

    if (!apiData || apiData.length === 0) {
      console.log('No data returned');
      return { success: true, inserted: 0 };
    }

    // Step 2: Convert data
    const records = convertApiToDbFormat(apiData, division, year, month, batchId);

    // Step 3: Insert records
    for (const record of records) {
      try {
        await insertRecord(record);
        inserted++;
      } catch (e: any) {
        errors.push({
          emp_code: record.emp_code,
          day: record.hari,
          error: e.message
        });
      }
    }

    // Step 4: Update batch status
    const status = errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    await updateBatchStatus(batchId, status, inserted);

    return {
      success: true,
      inserted,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error: any) {
    // Log to database
    await logError({
      batch_id: batchId,
      division,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: error.message
    };
  }
}
```

---

## Error Recovery Checklist

1. **API Errors**
   - [ ] Check API key validity
   - [ ] Verify endpoint URL
   - [ ] Check network connectivity
   - [ ] Retry with exponential backoff

2. **Data Errors**
   - [ ] Validate required fields
   - [ ] Check date validity
   - [ ] Handle null/missing data
   - [ ] Log problematic records

3. **Database Errors**
   - [ ] Check connection to gateway
   - [ ] Verify table existence
   - [ ] Check permissions
   - [ ] Handle constraint violations

4. **Sync Errors**
   - [ ] Log to absen_sync_log
   - [ ] Continue with next division
   - [ ] Mark batch as failed
   - [ ] Schedule retry

---

## Monitoring Recommendations

1. **Alert on high error rates**
   - Monitor `COMPLETED_WITH_ERRORS` status
   - Alert if error rate > 5%

2. **Track failed divisions**
   - Query `absen_sync_log` for FAILED status
   - Create dashboard of problem divisions

3. **Monitor API response times**
   - Log duration for each API call
   - Alert on slow responses (> 30s)

4. **Log error details**
   - Store full error message
   - Include division, date, batch_id
   - Enable debugging