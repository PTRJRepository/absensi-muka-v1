# 06_SQL_CLIENT_USAGE.md

# SQL Client Usage Guide - PT Rebinmas Jaya Absensi System

## Overview

The `SqlClient` class provides HTTP-based access to SQL Server via the gateway at `http://10.0.0.110:8001/v1/query`.

---

## Class Definition

```typescript
// Location: _dev_utils/src/sql-client.ts

export class SqlClient {
  private baseUrl: string;
  private apiKey: string;
  private server: string;
  private database: string;

  constructor() {
    this.baseUrl = config.sqlGateway.baseUrl;
    this.apiKey = config.sqlGateway.apiKey;
    this.server = config.sqlGateway.server || "SERVER_PROFILE_1";
    this.database = config.sqlGateway.database || "extend_db_ptrj";
  }
  // ...
}

// Export singleton instance
export const sqlClient = new SqlClient();
```

---

## Configuration

```typescript
// From config.ts
sqlGateway: {
  baseUrl: "http://10.0.0.110:8001/v1/query",
  apiKey: "REDACTED",  // API key for gateway
  server: "SERVER_PROFILE_1",
  database: "extend_db_ptrj"
}
```

---

## Methods

### 1. query()

Executes a SELECT query and returns results.

```typescript
async query<T = any>(sql: string): Promise<T>
```

**Parameters:**
- `sql`: SQL SELECT statement

**Returns:** Object with `recordset` array

**Example:**
```typescript
const result = await sqlClient.query(`
  SELECT * FROM absen_import
  WHERE division = 'PG1A' AND year = 2026 AND month = 6
  ORDER BY emp_code, day
`);

const records = result?.recordset || [];
records.forEach(record => {
  console.log(record.emp_code, record.has_work);
});
```

**Error Handling:**
```typescript
try {
  const result = await sqlClient.query(sql);
  return result?.recordset || [];
} catch (e: any) {
  throw new Error(`Query failed: ${e.message}`);
}
```

---

### 2. execute()

Executes INSERT, UPDATE, DELETE, or DDL statements.

```typescript
async execute(sql: string): Promise<any>
```

**Parameters:**
- `sql`: SQL statement (INSERT/UPDATE/DELETE/CREATE)

**Returns:** Query result (usually ignored)

**Example:**
```typescript
await sqlClient.execute(`
  INSERT INTO absen_import (
    emp_code, emp_name, division, year, month, day,
    has_work, attendance_date
 ) VALUES (
    'A0001', 'JOHN DOE', 'PG1A', 2026, 6, 7,
    1, '2026-06-07'
  )
`);
```

---

### 3. getTables()

Lists all tables in the database.

```typescript
async getTables(): Promise<string[]>
```

**Returns:** Array of table names

**Example:**
```typescript
const tables = await sqlClient.getTables();
console.log(tables);
// ['absen_import', 'absen_machine_input', 'mst_division', ...]
```

---

### 4. tableExists()

Checks if a table exists.

```typescript
async tableExists(tableName: string): Promise<boolean>
```

**Parameters:**
- `tableName`: Name of table to check

**Returns:** `true` if table exists

**Example:**
```typescript
const exists = await sqlClient.tableExists('absen_import');
if (!exists) {
  console.log('Table does not exist, creating...');
  await sqlClient.execute(CREATE_TABLE_SQL);
}
```

---

### 5. getTableSchema()

Retrieves column information for a table.

```typescript
async getTableSchema(tableName: string): Promise<any[]>
```

**Returns:** Array of column definitions

**Example:**
```typescript
const schema = await sqlClient.getTableSchema('absen_import');
console.log(schema);
/*
[
  { COLUMN_NAME: 'id', DATA_TYPE: 'int', IS_NULLABLE: 'NO', ... },
  { COLUMN_NAME: 'emp_code', DATA_TYPE: 'nvarchar', ... },
  ...
]
*/
```

---

## Usage Patterns

### Pattern 1: Singleton Import

```typescript
import { sqlClient } from "./sql-client.ts";

// Use directly
const result = await sqlClient.query("SELECT COUNT(*) as cnt FROM absen_import");
```

### Pattern 2: Service Integration

```typescript
// In absensi-service.ts
import { sqlClient } from "./sql-client.ts";

export class AbsensiService {
  async getImportData(division: string, year: number, month: number) {
    const result = await sqlClient.query(`
      SELECT * FROM absen_import
      WHERE division = '${division}' AND year = ${year} AND month = ${month}
    `);
    return result?.recordset || [];
  }
}
```

### Pattern 3: Batch Operations

```typescript
// Insert multiple records
const records = [...]; // Array of records

for (const record of records) {
  try {
    await sqlClient.execute(`
      INSERT INTO absen_import (emp_code, division, year, month, day, has_work)
      VALUES ('${record.emp_code}', '${record.division}', ${record.year}, ${record.month}, ${record.day}, ${record.has_work})
    `);
  } catch (e) {
    console.error(`Failed to insert ${record.emp_code}:`, e.message);
  }
}
```

### Pattern 4: Transaction Simulation

```typescript
// Note: SQL Gateway may not support true transactions
// Simulate with batch status tracking

const batchId = uuidv4();
await sqlClient.execute(`
  INSERT INTO absen_import_batch (batch_id, status)
  VALUES ('${batchId}', 'IN_PROGRESS')
`);

let successCount = 0;
for (const record of records) {
  try {
    await sqlClient.execute(`INSERT INTO absen_import ...`);
    successCount++;
  } catch (e) {
    // Log error but continue
  }
}

await sqlClient.execute(`
  UPDATE absen_import_batch
  SET status = 'COMPLETED', imported_records = ${successCount}
  WHERE batch_id = '${batchId}'
`);
```

---

## Files Using sqlClient

| File | Usage |
|------|-------|
| `database.ts` | Table creation, schema introspection |
| `absensi-service.ts` | All CRUD operations |
| `sync.ts` | Sync logging |
| `check-tables.ts` | Table verification |
| `init-attendance-tables.ts` | Schema initialization |
| `test-writes.ts` | Write testing |
| `test-batch.ts` | Batch operations |
| `test-import.ts` | Import testing |

---

## Error Handling

### HTTP Errors

```typescript
if (!response.ok) {
  throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
}
```

### Query Errors

```typescript
if (!result.success) {
  throw new Error(result.error || "Query failed");
}
```

### Connection Errors

```typescript
try {
  const result = await sqlClient.query(sql);
} catch (e: any) {
  if (e.message.includes('fetch')) {
    console.error('Cannot connect to SQL Gateway');
  } else {
    throw e;
  }
}
```

---

## Performance Considerations

### 1. Batch Size
- Insert in batches of 100-500 records
- Larger batches may timeout

### 2. Query Timeouts
- Default gateway timeout: ~30 seconds
- For large queries, add LIMIT/TOP

### 3. Connection Pooling
- SqlClient is a singleton
- Reuse instance across requests

### 4. Index Usage
- Always filter by indexed columns
- Check EXPLAIN/execution plan for slow queries

---

## Gateway Request Format

```typescript
// POST to http://10.0.0.110:8001/v1/query
{
  "sql": "SELECT * FROM absen_import WHERE division = 'PG1A'",
  "db": "extend_db_ptrj",
  "server": "SERVER_PROFILE_1"
}

// Response
{
  "success": true,
  "data": {
    "recordset": [
      { "id": 1, "emp_code": "A0001", ... },
      ...
    ]
  }
}
```

---

## Common Issues

### Issue 1: Connection Refused
```
Error: fetch failed
```
**Solution:** Check SQL Gateway is running at `http://10.0.0.110:8001`

### Issue 2: Invalid API Key
```
Error: Unauthorized
```
**Solution:** Verify API key in config.ts

### Issue 3: Database Not Found
```
Error: Database 'extend_db_ptrj' does not exist
```
**Solution:** Verify server/database in config

### Issue 4: Query Timeout
```
Error: Query timeout expired
```
**Solution:** Reduce batch size or add TOP/LIMIT

### Issue 5: Invalid SQL Syntax
```
Error: Incorrect syntax near ...
```
**Solution:** Check SQL syntax, especially string escaping

---

## Testing sqlClient

```typescript
// test-sqlclient.ts
import { sqlClient } from "./sql-client.ts";

async function testSqlClient() {
  console.log("Testing sqlClient...");

  // Test connection
  try {
    const tables = await sqlClient.getTables();
    console.log("Tables:", tables);
  } catch (e) {
    console.error("Connection failed:", e.message);
    return;
  }

  // Test query
  try {
    const result = await sqlClient.query("SELECT GETDATE() as now");
    console.log("Server time:", result?.recordset?.[0]?.now);
  } catch (e) {
    console.error("Query failed:", e.message);
  }

  // Test table exists
  try {
    const exists = await sqlClient.tableExists('absen_import');
    console.log("absen_import exists:", exists);
  } catch (e) {
    console.error("Table check failed:", e.message);
  }

  // Test get schema
  try {
    const schema = await sqlClient.getTableSchema('absen_import');
    console.log("absen_import columns:", schema.length);
  } catch (e) {
    console.error("Schema check failed:", e.message);
  }
}

testSqlClient();
```
