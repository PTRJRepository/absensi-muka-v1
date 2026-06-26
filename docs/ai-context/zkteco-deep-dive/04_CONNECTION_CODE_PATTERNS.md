# Connection Code Patterns

## Overview

This document provides reusable code patterns for connecting to ZKTeco attendance machines using the `node-zklib` library.

## Basic Connection Pattern

### TypeScript/ES Modules

```typescript
import ZKLib from "node-zklib";

interface MachineConfig {
  ip: string;
  port: number;
  timeout?: number;
}

async function connectToMachine(config: MachineConfig): Promise<any[]> {
  let zk: ZKLib | null = null;

  try {
    console.log(`Connecting to ${config.ip}:${config.port}...`);

    zk = new ZKLib({
      ip: config.ip,
      port: config.port,
      inport: config.port,
      timeout: config.timeout || 20000,
      connectionTimeout: 4000
    });

    await zk.createSocket();
    console.log("Connected!");

    // Get attendance data
    const attendance = await zk.getAttendances();
    console.log(`Got ${attendance.data.length} records`);

    return attendance.data;

  } catch (error: any) {
    console.error("Error:", error.message);
    return [];
  } finally {
    if (zk) {
      try {
        await zk.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
}
```

### CommonJS

```javascript
const ZKLib = require('node-zklib');

async function connectToMachine(ip, port) {
  let zk = null;

  try {
    zk = new ZKLib({
      ip: ip,
      port: port,
      inport: port,
      timeout: 20000,
      connectionTimeout: 4000
    });

    await zk.createSocket();
    const attendance = await zk.getAttendances();
    return attendance.data;

  } catch (error) {
    console.error("Error:", error.message);
    return [];
  } finally {
    if (zk) {
      try {
        await zk.disconnect();
      } catch (e) {}
    }
  }
}
```

## Pattern: Get Users and Attendance

```typescript
async function getMachineData(ip: string, port: number) {
  let zk: ZKLib | null = null;

  try {
    zk = new ZKLib({
      ip: ip,
      port: port,
      inport: port,
      timeout: 30000,
      connectionTimeout: 5000
    });

    await zk.createSocket();
    console.log("Connected!");

    // Get users
    const users = await zk.getUsers();
    console.log(`Users: ${users.data.length}`);

    // Get attendance
    const attendance = await zk.getAttendances();
    console.log(`Attendance records: ${attendance.data.length}`);

    return {
      users: users.data,
      attendance: attendance.data
    };

  } catch (error: any) {
    console.error("Error:", error.message);
    return { users: [], attendance: [] };
  } finally {
    if (zk) {
      try {
        await zk.disconnect();
      } catch (e) {}
    }
  }
}
```

## Pattern: With Device Disable/Enable

```typescript
async function connectWithDisable(ip: string, port: number) {
  let zk: ZKLib | null = null;

  try {
    zk = new ZKLib({
      ip: ip,
      port: port,
      inport: port,
      timeout: 20000,
      connectionTimeout: 4000
    });

    await zk.createSocket();
    console.log("Connected!");

    // Disable device to prevent auto-lock
    await zk.zklibTcp.disableDevice();
    console.log("Device disabled");

    // Get data
    const attendance = await zk.getAttendances();

    // Re-enable device
    await zk.zklibTcp.enableDevice();
    console.log("Device enabled");

    return attendance.data;

  } catch (error: any) {
    console.error("Error:", error.message);
    return [];
  } finally {
    if (zk) {
      try {
        await zk.disconnect();
      } catch (e) {}
    }
  }
}
```

## Pattern: With Authentication

```typescript
import { COMMANDS } from 'node-zklib/constants';

async function connectWithAuth(ip: string, port: number, password: string = '12345') {
  let zk: ZKLib | null = null;

  try {
    zk = new ZKLib({
      ip: ip,
      port: port,
      inport: port,
      timeout: 20000,
      connectionTimeout: 4000
    });

    await zk.createSocket();
    console.log("Connected!");

    // Authenticate
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_AUTH, Buffer.from(password));
    console.log("Authenticated!");

    // Disable device
    await zk.zklibTcp.disableDevice();

    // Get data
    const attendance = await zk.getAttendances();

    // Re-enable and disconnect
    await zk.zklibTcp.enableDevice();
    await zk.disconnect();

    return attendance.data;

  } catch (error: any) {
    console.error("Error:", error.message);
    return [];
  } finally {
    if (zk) {
      try {
        await zk.disconnect();
      } catch (e) {}
    }
  }
}
```

## Pattern: Callback Style (Legacy)

```typescript
function connectCallback(ip: string, port: number): Promise<any[]> {
  return new Promise((resolve) => {
    const zk = new ZKLib({
      ip: ip,
      port: port,
      inport: port,
      timeout: 15000,
      connectionTimeout: 4000
    });

    // Timeout handler
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

      zk.getAttendances((err: any, attendance: any) => {
        try { zk.disconnect(); } catch (e) {}

        if (err) {
          console.log("Error:", err.message);
          resolve([]);
          return;
        }

        resolve(attendance?.data || []);
      });
    });
  });
}
```

## Pattern: Retry with Backoff

```typescript
async function connectWithRetry(
  ip: string,
  port: number,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<any[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}...`);

      const result = await connectToMachine({ ip, port, timeout: 20000 });

      if (result.length > 0) {
        return result;
      }

      console.log("No data received, retrying...");

    } catch (error: any) {
      lastError = error;
      console.log(`Attempt ${attempt} failed:`, error.message);
    }

    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.error("All retries failed");
  return [];
}
```

## Pattern: Concurrent Machine Sync

```typescript
import { machineServers } from './machine-config';

async function syncAllMachines(): Promise<Map<string, any[]>> {
  const results = new Map<string, any[]>();

  // Get all accessible machines
  const accessibleMachines = Object.entries(machineServers).filter(([code, config]) => {
    // Filter logic based on accessibility
    return config.type === 'absensi' || config.type === 'office';
  });

  // Connect to all machines concurrently
  const promises = accessibleMachines.map(async ([code, config]) => {
    try {
      const data = await connectToMachine({
        ip: config.ip,
        port: config.port,
        timeout: 30000
      });
      results.set(code, data);
      console.log(`${code}: ${data.length} records`);
    } catch (error) {
      console.error(`${code}: Failed -`, error.message);
      results.set(code, []);
    }
  });

  await Promise.all(promises);

  return results;
}
```

## Pattern: Sequential Sync with Progress

```typescript
async function syncMachinesSequential(divisions: string[]): Promise<any[]> {
  const allData: any[] = [];

  for (let i = 0; i < divisions.length; i++) {
    const division = divisions[i];
    const progress = `[${i + 1}/${divisions.length}]`;

    console.log(`${progress} Syncing ${division}...`);

    try {
      const data = await connectToMachine(division);
      allData.push(...data);
      console.log(`${progress} ${division}: ${data.length} records`);
    } catch (error) {
      console.error(`${progress} ${division}: Failed`);
    }
  }

  console.log(`\nTotal records: ${allData.length}`);
  return allData;
}
```

## Pattern: Timeout Wrapper

```typescript
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}

async function safeConnect(ip: string, port: number): Promise<any[]> {
  try {
    const result = await withTimeout(
      connectToMachine({ ip, port }),
30000
    );
    return result;
  } catch (error) {
    console.error("Error:", error.message);
    return [];
  }
}
```

## Environment-Based Configuration

```typescript
interface Config {
  ip: string;
  port: number;
  timeout: number;
  connectionTimeout: number;
}

function getMachineConfig(env: 'production' | 'development'): Config {
  const baseConfig = {
    timeout: 20000,
    connectionTimeout: 4000
  };

  if (env === 'production') {
    return {
      ip: process.env.MACHINE_IP!,
      port: parseInt(process.env.MACHINE_PORT!),
      ...baseConfig
    };
  }

  return {
    ip: '127.0.0.1',
    port: 4370,
    ...baseConfig
  };
}
```
