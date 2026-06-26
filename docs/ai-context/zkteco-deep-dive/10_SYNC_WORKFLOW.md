# Machine Sync Workflow

## Overview

This document describes the complete workflow for synchronizing attendance data from ZKTeco machines to the database.

## Workflow Diagram

```
+------------------+     +-------------------+     +------------------+
|  ZKTeco Machine  | --> |  node-zklib       | --> |  Data Mapping    |
|  (Raw Data)      |     |  (Connection)    |     |  (Transformation)|
+------------------+     +-------------------+     +------------------+
                                                            |
                                                            v
+------------------+     +-------------------+     +------------------+
|  SQL Server DB   | <-- |  HTTP Gateway     | <-- |  Batch Insert   |
|  (absen_import)  |     |  (10.0.0.110)    |     |  (Processing)  |
+------------------+     +-------------------+     +------------------+
```

## Step-by-Step Workflow

### Phase 1: Connection

#### 1.1 Load Machine Configuration

```typescript
import { machineServers, getMachineByDivision } from './machine-config';

function getConfig(division: string) {
  const config = getMachineByDivision(division);
  if (!config) {
    throw new Error(`Unknown division: ${division}`);
  }
  return config;
}
```

#### 1.2 Create TCP Connection

```typescript
import ZKLib from "node-zklib";

async function connectToMachine(division: string) {
  const config = getConfig(division);

  const zk = new ZKLib({
    ip: config.ip,
    port: config.port,
    inport: config.port,
    timeout: 20000,
    connectionTimeout: 4000
  });

  try {
    await zk.createSocket();
    console.log(`Connected to ${division} at ${config.ip}:${config.port}`);
    return zk;
  } catch (error) {
    console.error(`Failed to connect to ${division}:`, error.message);
    throw error;
  }
}
```

### Phase 2: Data Extraction

#### 2.1 Fetch Users

```typescript
async function fetchUsers(zk: ZKLib) {
  const users = await zk.getUsers();
  console.log(`Fetched ${users.data.length} users`);
  return users.data;
}
```

#### 2.2 Fetch Attendance

```typescript
async function fetchAttendance(zk: ZKLib) {
  const attendance = await zk.getAttendances();
  console.log(`Fetched ${attendance.data.length} attendance records`);
  return attendance.data;
}
```

#### 2.3 Combined Fetch

```typescript
async function extractMachineData(division: string) {
  let zk: ZKLib | null = null;

  try {
    zk = await connectToMachine(division);
    const [users, attendance] = await Promise.all([
      fetchUsers(zk),
      fetchAttendance(zk)
    ]);

    return { users, attendance, division };

  } finally {
    if (zk) {
      await zk.disconnect();
    }
  }
}
```

### Phase 3: Data Mapping

#### 3.1 Map Attendance Record

```typescript
import {
  getDivisionFromMachineId,
  convertMachineIdToEmpCode
} from './machine-config';

interface MappedAttendance {
  machine_user_id: string;
  emp_code: string;
  division: string;
  timestamp: string;
  event_type?: number;
  verify_type?: number;
  work_code?: number;
}

function mapAttendanceRecord(
  record: any,
  division: string
): MappedAttendance {
  const machineId = record.deviceUserId || record.userId;
  const detectedDivision = getDivisionFromMachineId(machineId) || division;
  const empCode = convertMachineIdToEmpCode(machineId, detectedDivision);

  return {
    machine_user_id: machineId,
    emp_code: empCode,
    division: detectedDivision,
    timestamp: record.recordTime,
    event_type: record.eventType,
    verify_type: record.verifyType,
    work_code: record.workCode
  };
}
```

#### 3.2 Map User Record

```typescript
interface MappedUser {
  machine_user_id: string;
  emp_code: string;
  name: string;
  division: string;
  role: number;
}

function mapUserRecord(
  user: any,
  division: string
): MappedUser {
  const machineId = user.userId || user.id;
  const detectedDivision = getDivisionFromMachineId(machineId) || division;
  const empCode = convertMachineIdToEmpCode(machineId, detectedDivision);

  return {
    machine_user_id: machineId,
    emp_code: empCode,
    name: user.name,
    division: detectedDivision,
    role: user.role
  };
}
```

#### 3.3 Batch Mapping

```typescript
function mapAttendanceBatch(
  records: any[],
  division: string
): MappedAttendance[] {
  return records.map(record => mapAttendanceRecord(record, division));
}
```

### Phase 4: Database Insert

#### 4.1 Create Import Batch

```typescript
async function createImportBatch(
  gatewayUrl: string,
  division: string,
  recordCount: number
): Promise<number> {
  const response = await fetch(`${gatewayUrl}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: `INSERT INTO absen_import_batch (division, record_count, status)
            VALUES ('${division}', ${recordCount}, 'processing');
            SELECT SCOPE_IDENTITY() as id;`
    })
  });

  const result = await response.json();
  return result.data[0].id;
}
```

#### 4.2 Insert Attendance Records

```typescript
async function insertAttendanceRecords(
  gatewayUrl: string,
  batchId: number,
  records: MappedAttendance[]
): Promise<{ inserted: number; failed: number }> {
  const values = records.map(r => `(
    '${r.emp_code}',
    '${r.machine_user_id}',
    '${r.division}',
    '${r.timestamp}',
    ${r.event_type || 0},
    ${r.verify_type || 0},
    ${r.work_code || 0},
    ${batchId}
  )`).join(',');

  const sql = `
    INSERT INTO absen_import (
      emp_code, machine_user_id, division, attendance_date,
      event_type, verify_type, work_code, import_batch_id
    )
    VALUES ${values}
  `;

  const response = await fetch(`${gatewayUrl}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });

  return {
    inserted: records.length,
    failed: 0
  };
}
```

#### 4.3 Update Batch Status

```typescript
async function updateBatchStatus(
  gatewayUrl: string,
  batchId: number,
  status: 'completed' | 'failed'
): Promise<void> {
  await fetch(`${gatewayUrl}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: `UPDATE absen_import_batch
            SET status = '${status}', completed_at = GETDATE()
            WHERE id = ${batchId}`
    })
  });
}
```

### Phase 5: Orchestration

#### 5.1 Single Machine Sync

```typescript
async function syncMachine(division: string): Promise<{
  success: boolean;
  records: number;
  batchId: number;
}> {
  const GATEWAY_URL = 'http://10.0.0.110:8001/v1/query';

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Syncing ${division}...`);
  console.log('='.repeat(50));

  try {
    //1. Extract data
    const { attendance } = await extractMachineData(division);
    console.log(`Extracted ${attendance.length} records`);

    // 2. Map data
    const mappedData = mapAttendanceBatch(attendance, division);
    console.log(`Mapped ${mappedData.length} records`);

    // 3. Create batch
    const batchId = await createImportBatch(
      GATEWAY_URL,
      division,
      mappedData.length
    );
    console.log(`Created batch ${batchId}`);

    // 4. Insert records
    const result = await insertAttendanceRecords(
      GATEWAY_URL,
      batchId,
      mappedData
    );
    console.log(`Inserted ${result.inserted} records`);

    // 5. Update batch status
    await updateBatchStatus(GATEWAY_URL, batchId, 'completed');

    return {
      success: true,
      records: result.inserted,
      batchId
    };

  } catch (error) {
    console.error(`Sync failed:`, error.message);

    if (batchId) {
      await updateBatchStatus(GATEWAY_URL, batchId, 'failed');
    }

    return {
      success: false,
      records: 0,
      batchId: 0
    };
  }
}
```

#### 5.2 Sync All Machines

```typescript
async function syncAllMachines(): Promise<{
  totalRecords: number;
  successful: number;
  failed: number;
  results: Record<string, any>;
}> {
  const GATEWAY_URL = 'http://10.0.0.110:8001/v1/query';
  const divisions = Object.keys(machineServers);

  const results: Record<string, any> = {};
  let totalRecords = 0;
  let successful = 0;
  let failed = 0;

  for (const division of divisions) {
    const result = await syncMachine(division);

    results[division] = result;
    totalRecords += result.records;

    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log('Sync Complete:');
  console.log(`  Total Records: ${totalRecords}`);
  console.log(`  Successful: ${successful}`);
  console.log(`  Failed: ${failed}`);
  console.log('='.repeat(50));

  return { totalRecords, successful, failed, results };
}
```

### Phase 6: Error Recovery

#### 6.1 Retry Logic

```typescript
async function syncWithRetry(
  division: string,
  maxRetries: number = 3
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries} for ${division}`);
      return await syncMachine(division);
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxRetries) {
        const delay = 2000 * Math.pow(2, attempt - 1);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  console.error(`All ${maxRetries} attempts failed for ${division}`);
  return { success: false, records: 0, error: lastError?.message };
}
```

#### 6.2 Partial Failure Handling

```typescript
async function syncSafe(division: string): Promise<any> {
  try {
    return await syncMachine(division);
  } catch (error) {
    console.error(`Sync error for ${division}:`, error.message);
    return {
      success: false,
      records: 0,
      error: error.message,
      partialData: null
    };
  }
}
```

## Complete Workflow Summary

| Step | Phase | Action |
|------|-------|--------|
| 1 | Connection | Load machine config |
| 2 | Connection | Create TCP socket |
| 3 | Extraction | Fetch users |
| 4 | Extraction | Fetch attendance |
| 5 | Extraction | Disconnect |
| 6 | Mapping | Map machine IDs to emp_code |
| 7 | Mapping | Batch process records |
| 8 | Database | Create import batch |
| 9 | Database | Insert records |
| 10 | Database | Update batch status |
| 11 | Orchestration | Log results |
| 12 | Orchestration | Handle errors/retry |

## Database Tables Involved

### absen_import (Target Table)

```sql
-- Stores all imported attendance records
INSERT INTO absen_import (
  emp_code, machine_user_id, division, attendance_date,
  event_type, verify_type, work_code, import_batch_id
)
VALUES ('A0129', '10129', 'PGE', '2026-03-07T02:13:10', 0, 1, 0, 1);
```

### absen_import_batch (Tracking)

```sql
-- Tracks each import operation
INSERT INTO absen_import_batch (division, record_count, status)
VALUES ('PGE', 20849, 'completed');
```

### absen_sync_log (Audit)

```sql
-- Logs sync operations
INSERT INTO absen_sync_log (machine, operation, status, records, started_at)
VALUES ('PGE', 'sync', 'completed', 20849, GETDATE());
```

## Scheduling Recommendations

### Sync Frequency

| Machine Type | Recommended Frequency | Reason |
|-------------|----------------------|--------|
| Office (PGE, MILL) | Every 15 minutes | High activity |
| Estate (DME, ARA, etc.) | Every30 minutes | Moderate activity |
| Remote (ARC, AB) | Every hour | Lower activity |

### Concurrent vs Sequential

- **Sequential:** Safer, lower resource usage
- **Concurrent:** Faster, higher resource usage

For production, use sequential with timeout to prevent resource exhaustion.
