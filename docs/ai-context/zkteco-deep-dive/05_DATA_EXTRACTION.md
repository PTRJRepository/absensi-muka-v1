# Data Extraction Guide

## Overview

This document explains how to extract attendance and user data from ZKTeco machines using the `node-zklib` library.

## Data Types

### Attendance Records

Raw timestamp logs when employees clock in/out.

### User Records

Employee information enrolled in the machine.

## Extracting Attendance Data

### Basic Extraction

```typescript
import ZKLib from "node-zklib";

async function getAttendance(ip: string, port: number) {
  const zk = new ZKLib({
    ip: ip,
    port: port,
    inport: port,
    timeout: 20000,
    connectionTimeout: 4000
  });

  try {
    await zk.createSocket();
    const attendance = await zk.getAttendances();
    return attendance.data;
  } finally {
    await zk.disconnect();
  }
}
```

### Response Structure

```typescript
interface AttendanceRecord {
  userSn: number; // Sequence number from machine
  deviceUserId: string;  // User ID in machine (NOT emp_code)
  recordTime: string;    // ISO timestamp (UTC)
  ip: string;            // Source machine IP
}
```

### Example Response

```json
{
  "userSn": 50989,
  "deviceUserId": "10129",
  "recordTime": "2026-03-07T02:13:10.000Z",
  "ip": "10.0.0.232"
}
```

## Extracting User Data

### Basic Extraction

```typescript
async function getUsers(ip: string, port: number) {
  const zk = new ZKLib({
    ip: ip,
    port: port,
    inport: port,
    timeout: 20000,
    connectionTimeout: 4000
  });

  try {
    await zk.createSocket();
    const users = await zk.getUsers();
    return users.data;
  } finally {
    await zk.disconnect();
  }
}
```

### Response Structure

```typescript
interface UserRecord {
  uid: number;        // Internal machine ID
  role: number;       // 0 = regular user, 14 = admin
  password: string;   // Usually empty
  name: string;       // Employee name
  cardno: number;     // RFID card number (0 if none)
  userId: string;     // User ID in machine
}
```

### Example Response

```json
{
  "uid": 1,
  "role": 0,
  "password": "",
  "name": "MUHAMMAD NAZAR",
  "cardno": 0,
  "userId": "10002"
}
```

## Combined Extraction

```typescript
interface MachineData {
  users: UserRecord[];
  attendance: AttendanceRecord[];
}

async function extractAllData(ip: string, port: number): Promise<MachineData> {
  const zk = new ZKLib({
    ip: ip,
    port: port,
    inport: port,
    timeout: 30000,
    connectionTimeout: 5000
  });

  try {
    await zk.createSocket();
    console.log("Connected!");

    // Fetch both in parallel for speed
    const [usersResult, attendanceResult] = await Promise.all([
      zk.getUsers(),
      zk.getAttendances()
    ]);

    return {
      users: usersResult.data,
      attendance: attendanceResult.data
    };

  } finally {
    await zk.disconnect();
  }
}
```

## Data Mapping

### Map to Internal Format

```typescript
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
  record: AttendanceRecord,
  division: string
): MappedAttendance {
  const machineId = record.deviceUserId || record.userId;

  return {
    machine_user_id: machineId,
    emp_code: convertMachineIdToEmpCode(machineId, division),
    division: division,
    timestamp: record.recordTime,
    event_type: record.eventType,
    verify_type: record.verifyType,
    work_code: record.workCode
  };
}
```

### Map User to Internal Format

```typescript
interface MappedUser {
  machine_user_id: string;
  emp_code: string;
  name: string;
  division: string;
  role: number;
}

function mapUserRecord(
  user: UserRecord,
  division: string
): MappedUser {
  const machineId = user.userId || user.id;

  return {
    machine_user_id: machineId,
    emp_code: convertMachineIdToEmpCode(machineId, division),
    name: user.name,
    division: division,
    role: user.role
  };
}
```

## Batch Processing

### Process Large Datasets

```typescript
interface BatchResult {
  total: number;
  processed: number;
  failed: number;
  data: MappedAttendance[];
}

async function extractWithBatching(
  ip: string,
  port: number,
  division: string,
  batchSize: number = 1000
): Promise<BatchResult> {
  const zk = new ZKLib({
    ip: ip,
    port: port,
    inport: port,
    timeout: 60000,
    connectionTimeout: 5000
  });

  const result: BatchResult = {
    total: 0,
    processed: 0,
    failed: 0,
    data: []
  };

  try {
    await zk.createSocket();
    const attendance = await zk.getAttendances();

    result.total = attendance.data.length;

    // Process in batches
    for (let i = 0; i < attendance.data.length; i += batchSize) {
      const batch = attendance.data.slice(i, i + batchSize);

      for (const record of batch) {
        try {
          const mapped = mapAttendanceRecord(record, division);
          result.data.push(mapped);
          result.processed++;
        } catch (e) {
          result.failed++;
        }
      }

      console.log(`Processed ${result.processed}/${result.total}`);
    }

    return result;

  } finally {
    await zk.disconnect();
  }
}
```

## Incremental Extraction

### Track Last Sync Point

```typescript
interface SyncState {
  lastUserSn: number;
  lastTimestamp: string;
  machineIp: string;
}

async function extractIncremental(
  ip: string,
  port: number,
  division: string,
  lastSync: SyncState | null
): Promise<{ newRecords: MappedAttendance[]; syncState: SyncState }> {
  const zk = new ZKLib({
    ip: ip,
    port: port,
    inport: port,
    timeout: 30000,
    connectionTimeout: 4000
  });

  try {
    await zk.createSocket();
    const attendance = await zk.getAttendances();

    // Filter records newer than last sync
    const newRecords: MappedAttendance[] = [];

    for (const record of attendance.data) {
      if (lastSync) {
        const recordTime = new Date(record.recordTime);
        const lastTime = new Date(lastSync.lastTimestamp);

        if (recordTime > lastTime) {
          newRecords.push(mapAttendanceRecord(record, division));
        }
      } else {
        // First sync - get all records
        newRecords.push(mapAttendanceRecord(record, division));
      }
    }

    // Update sync state
    const latestRecord = attendance.data[attendance.data.length - 1];
    const syncState: SyncState = {
      lastUserSn: latestRecord?.userSn || 0,
      lastTimestamp: latestRecord?.recordTime || new Date().toISOString(),
      machineIp: ip
    };

    return { newRecords, syncState };

  } finally {
    await zk.disconnect();
  }
}
```

## Data Export

### Export to JSON

```typescript
import * as fs from 'fs';

async function exportToJson(
  ip: string,
  port: number,
  division: string,
  outputPath: string
) {
  const data = await extractAllData(ip, port, division);

  const exportData = {
    machine: {
      ip: ip,
      port: port,
      division: division,
      exportedAt: new Date().toISOString()
    },
    users: data.users,
    attendance: data.attendance
  };

  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`Exported to ${outputPath}`);
}
```

### Export to CSV

```typescript
import * as fs from 'fs';

function exportToCsv(records: MappedAttendance[], outputPath: string) {
  const headers = [
    'machine_user_id',
    'emp_code',
    'division',
    'timestamp',
    'event_type',
    'verify_type',
    'work_code'
  ];

  const csv = [
    headers.join(','),
    ...records.map(r =>
      headers.map(h => `"${r[h as keyof MappedAttendance] || ''}"`).join(',')
    )
  ].join('\n');

  fs.writeFileSync(outputPath, csv);
  console.log(`Exported ${records.length} records to ${outputPath}`);
}
```

## Error Handling

### Handle Partial Data

```typescript
async function safeExtract(ip: string, port: number, division: string) {
  const result = {
    users: [] as UserRecord[],
    attendance: [] as AttendanceRecord[],
    errors: [] as string[]
  };

  const zk = new ZKLib({
    ip: ip,
    port: port,
    inport: port,
    timeout: 30000,
    connectionTimeout: 4000
  });

  try {
    await zk.createSocket();

    // Try users
    try {
      const users = await zk.getUsers();
      result.users = users.data;
    } catch (e: any) {
      result.errors.push(`Users: ${e.message}`);
    }

    // Try attendance
    try {
      const attendance = await zk.getAttendances();
      result.attendance = attendance.data;
    } catch (e: any) {
      result.errors.push(`Attendance: ${e.message}`);
    }

  } catch (e: any) {
    result.errors.push(`Connection: ${e.message}`);
  } finally {
    try {
      await zk.disconnect();
    } catch (e) {}
  }

  return result;
}
```
