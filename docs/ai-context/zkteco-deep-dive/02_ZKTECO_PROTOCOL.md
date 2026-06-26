# ZKTeco Protocol Deep Dive

## Overview

The Absensi system uses ZKTeco attendance machines that communicate via a proprietary TCP-based protocol. This document explains how the protocol works and how `node-zklib` library interfaces with it.

## ZKTeco Communication Protocol

### Protocol Basics

ZKTeco machines use a binary TCP protocol on port 4370 (default). The protocol involves:
1. **TCP Connection** - Establish socket connection to machine IP:port
2. **Command/Response** - Send binary commands, receive binary responses
3. **Data Format** - Binary data with specific structures for each data type

### Default Settings

| Parameter | Default Value |
|-----------|---------------|
| Port | 4370 |
| Timeout | 20,000ms (recommended) |
| Connection Timeout | 4,000ms |
| Password | 12345 (all machines) |

## node-zklib Library

### Library Choice

Two libraries are available:

| Library | Version | API Style | Recommendation |
|---------|---------|-----------|----------------|
| node-zklib | 1.3.0 | async/await | **Recommended** |
| zklib | 0.2.11 | Callback-based | Legacy |

**Important:** The correct library is `node-zklib@1.3.0`, NOT `zklib@0.2.11`. The latter uses UDP-based communication.

### Installation

```bash
npm install node-zklib
```

### Constructor Options

```typescript
const zk = new ZKLib({
  ip: string; // Machine IP address
  port: number;      // TCP port (default 4370)
  inport: number;    // Internal port (usually same as port)
  timeout: number;   // Operation timeout in ms (default 10000)
  connectionTimeout: number;  // Connection timeout in ms (default 4000)
});
```

## Connection Patterns

### Pattern 1: Async/Await (Recommended)

```typescript
import ZKLib from "node-zklib";

async function connectToMachine(ip: string, port: number) {
  const zk = new ZKLib({
    ip: ip,
    port: port,
    inport: port,
    timeout: 20000,
    connectionTimeout: 4000
  });

  try {
    // Connect to machine
    await zk.createSocket();
    console.log("Connected!");

    // Optional: Authenticate if required
    const { COMMANDS } = require('node-zklib/constants');
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_AUTH, Buffer.from('12345'));

    // Disable device to prevent auto-lock
    await zk.zklibTcp.disableDevice();

    // Get data
    const users = await zk.getUsers();
    const attendance = await zk.getAttendances();

    // Re-enable device
    await zk.zklibTcp.enableDevice();

    return { users: users.data, attendance: attendance.data };

  } catch (error) {
    console.error("Error:", error.message);
    return null;
  } finally {
    // Always disconnect
    await zk.disconnect();
  }
}
```

### Pattern 2: Callback Style

```typescript
const ZKLib = require('node-zklib');

function connectToMachine(ip: string, port: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const zk = new ZKLib({
      ip: ip,
      port: port,
      inport: port,
      timeout: 15000,
      connectionTimeout: 4000
    });

    // Set up timeout
    const timeout = setTimeout(() => {
      console.log("Timeout!");
      try { zk.disconnect(); } catch (e) {}
      resolve([]);
    }, 20000);

    zk.createSocket((err: any) => {
      clearTimeout(timeout);

      if (err) {
        console.log("Connection error:", err.message);
        try { zk.disconnect(); } catch (e) {}
        resolve([]);
        return;
      }

      console.log("Connected!");

      // Get users with callback
      zk.getUsers((err: any, users: any) => {
        if (err) {
          console.log("Get users error:", err.message);
        } else if (users && users.data) {
          console.log("Got", users.data.length, "users");
        }

        // Get attendance with callback
        zk.getAttendances((err: any, attendance: any) => {
          try { zk.disconnect(); } catch (e) {}

          if (err) {
            console.log("Get attendance error:", err.message);
            resolve([]);
            return;
          }

          if (attendance && attendance.data) {
            resolve(attendance.data);
          } else {
            resolve([]);
          }
        });
      });
    });
  });
}
```

## Important Protocol Notes

### 1. Always Disable Device Before Data Fetch

Before fetching data, you MUST disable the device to prevent it from auto-locking or timing out:

```typescript
await zk.zklibTcp.disableDevice();
// Fetch data here
await zk.zklibTcp.enableDevice();
```

### 2. Timeout Handling

For machines with large datasets (10,000+ records), use longer timeouts:

```typescript
const zk = new ZKLib({
  ip: ip,
  port: port,
  inport: port,
  timeout: 30000,  // 30 seconds for large datasets
  connectionTimeout: 5000
});
```

### 3. Connection State

The library maintains connection state internally. Always disconnect properly in a finally block:

```typescript
finally {
  if (zk) {
    try {
      await zk.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
  }
}
```

### 4. Authentication

Some machines require authentication. If needed:

```typescript
const { COMMANDS } = require('node-zklib/constants');
await zk.zklibTcp.executeCmd(COMMANDS.CMD_AUTH, Buffer.from('12345'));
```

Default password for all machines: `12345`

## Data Structures

### Attendance Record

```typescript
interface AttendanceRecord {
  userSn: number;        // Sequence number from machine
  deviceUserId: string;  // User ID in machine (NOT emp_code)
  recordTime: string;    // ISO timestamp (UTC)
  ip: string;            // Source machine IP
}
```

### User Record

```typescript
interface UserRecord {
  uid: number;        // Internal machine ID
  role: number;      // 0 = regular user, 14 = admin
  password: string; // Usually empty
  name: string;      // Employee name
  cardno: number;     // RFID card number (0 if none)
  userId: string;    // User ID in machine
}
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| ECONNREFUSED | Port not open | Check port forwarding |
| ETIMEDOUT | Network unreachable | Check network/firewall |
| Socket hang up | Machine rejected connection | Check machine password |
| No protocol response | Not a ZKTeco device | Use API instead |

### Error Recovery Pattern

```typescript
async function safeConnect(ip: string, port: number, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await connectToMachine(ip, port);
      return result;
    } catch (error) {
      console.log(`Attempt ${i + 1} failed:`, error.message);
      if (i< retries - 1) {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s
      }
    }
  }
  return null; // All retries failed
}
```

## Sequence Diagram

```
Client ZKTeco Machine
  |                           |
  |--- TCP Connect ------------->|
  |                           |
  |<-- Connection Accepted ----|
  |                           |
  |--- CMD_AUTH (if needed) -->|
  |                           |
  |<-- Auth Response ----------|
  |                           |
  |--- disableDevice --------->|
  |                           |
  |<-- OK --------------------|
  |                           |
  |--- getUsers/getAttendances ->|
  |                           |
  |<-- Data Response ----------|
  |                           |
  |--- enableDevice ---------->|
  |                           |
  |<-- OK --------------------|
  |                           |
  |--- TCP Disconnect -------->|
```
