# ZKTeco Machine Passwords Documentation

> **Classification:** Internal Use Only  
> **Version:** 1.0.0  
> **Last Updated:** 2026-06-07

---

## Overview

This document describes the authentication mechanism for ZKTeco biometric attendance machines, including password configuration and access procedures.

---

## ZKTeco Authentication Model

### Communication Protocol

ZKTeco machines use TCP-based communication with the following security model:

1. **Device Disable:** Before any data access, device must be disabled
2. **Authentication:** Optional command-level authentication with password
3. **Data Access:** Read users, attendance logs, or configurations
4. **Device Enable:** Re-enable device after operations

### Default Credentials

| Parameter | Value | Notes |
|-----------|-------|-------|
| Communication Password | `12345` | All machines share this password |
| Protocol | TCP | Not UDP (which uses different library) |
| Default Port | 4370 | May vary per machine |
| Timeout | 20000ms | Minimum for large datasets |

---

## Authentication Code Implementation

### Basic Connection Pattern

```typescript
import ZKLib from "node-zklib";

async function connectToMachine(ip: string, port: number): Promise<ZKLib> {
  const zk = new ZKLib(ip, port, 20000, port);
  await zk.createSocket();
  return zk;
}

async function authenticateAndAccess(zk: ZKLib): Promise<void> {
  // Authenticate with password
  const { COMMANDS } = require("node-zklib/constants");
  await zk.zklibTcp.executeCmd(
    COMMANDS.CMD_AUTH,
    Buffer.from("12345")
  );
}

async function disableDevice(zk: ZKLib): Promise<void> {
  await zk.zklibTcp.disableDevice();
}

async function enableDevice(zk: ZKLib): Promise<void> {
  await zk.zklibTcp.enableDevice();
}
```

### Full Data Fetch Pattern

```typescript
import ZKLib, { ZKLibOptions } from "node-zklib";

interface MachineConfig {
  ip: string;
  port: number;
  password?: string;
  timeout?: number;
}

async function fetchMachineData(config: MachineConfig) {
  const {
    ip,
    port,
    password = "12345",
    timeout = 20000
  } = config;

  const zk = new ZKLib(ip, port, timeout, port);

  try {
    // Step 1: Create socket connection
    await zk.createSocket();

    // Step 2: Authenticate
    const { COMMANDS } = require("node-zklib/constants");
    await zk.zklibTcp.executeCmd(
      COMMANDS.CMD_AUTH,
      Buffer.from(password)
    );

    // Step 3: Disable device (critical for data access)
    await zk.zklibTcp.disableDevice();

    // Step 4: Get device info
    const deviceInfo = await zk.zklibTcp.getInfo();

    // Step 5: Get users
    const users = await zk.zklibTcp.getUsers();

    // Step 6: Get attendance records
    const attendance = await zk.zklibTcp.getAttendances();

    // Step 7: Re-enable device
    await zk.zklibTcp.enableDevice();

    return {
      info: deviceInfo,
      users: users,
      attendance: attendance
    };

  } catch (error) {
    console.error(`Error accessing ${ip}:${port}:`, error);
    throw error;

  } finally {
    // Always ensure device is re-enabled
    try {
      await zk.zklibTcp.enableDevice();
      await zk.disconnect();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}
```

---

## Machine Password Configuration

### Current Configuration

All machines use the same default password: **`12345`**

This is defined in the code but not configurable via external config:

```typescript
// In absensi-client.ts or direct ZKTeco access code
const MACHINE_PASSWORD = "12345";
```

### Password Storage

The password is:
- **Hardcoded** in source code
- **Not stored** in `config.ts`
- **Shared** across all 15 machines
- **Never logged** in any output

---

## Changing Machine Passwords

### When to Change

- Security incident suspected
- Quarterly rotation schedule
- Employee with access leaves
- Compliance requirements

### Change Procedure

1. **Connect to machine** using current password
2. **Access admin menu** on machine panel
3. **Navigate to:** Settings → Communication → Password
4. **Enter new password** (max 8 characters)
5. **Confirm new password**
6. **Update source code** with new password

### Code Update for New Password

```typescript
// _dev_utils/src/zkteco-access.ts

// Single point of change for machine password
export const MACHINE_PASSWORD = "NEW_PASSWORD_HERE";

// Or make it configurable via environment
export const MACHINE_PASSWORD = process.env.ZKTECO_PASSWORD || "12345";
```

---

## Password Security Considerations

### Current Weaknesses

1. **Shared Password:** All machines use same password
2. **No Per-Machine Passwords:** Cannot differentiate access
3. **Plain Text in Code:** Password visible in source files
4. **No Password History:** Cannot track password changes

### Recommended Hardening

#### Option 1: Per-Machine Passwords

```typescript
// machine-config.ts enhancement
export const machineServers: Record<string, {
  ip: string;
  port: number;
  password?: string;  // Add password field
  // ... other fields
}> = {
  "PGE":   { ip: "10.0.0.232", port: 4370, password: "PGE2024!" },
  "MILL":  { ip: "103.127.66.32", port: 4370, password: "MILL2024!" },
  "DME_01": { ip: "103.144.228.42", port: 4700, password: "DME2024!" },
  // ... other machines
};

// Secure password storage (encrypted)
export function getMachinePassword(machineCode: string): string {
  const encrypted = machineServers[machineCode]?.password || "";
  return decryptPassword(encrypted);  // Implement encryption
}
```

#### Option 2: Password Vault Integration

```typescript
// Secure password retrieval
async function getMachinePassword(machineCode: string): Promise<string> {
  // Use Azure Key Vault, HashiCorp Vault, or AWS Secrets Manager
  const secret = await vaultClient.read(`secret/zkteco/${machineCode}`);
  return secret.data.data.password;
}
```

---

## Access Control Matrix

| Role | View Password | Change Password | Access Machines |
|------|---------------|-----------------|-----------------|
| Developer | Source Code | No | Read Only |
| IT Admin | Admin Panel | Yes | Full Access |
| Security Officer | Audit Log | With Approval | Monitoring |
| Auditor | Report Only | No | No |

---

## Audit Log for Machine Access

All machine access should be logged:

```typescript
interface MachineAccessLog {
  timestamp: Date;
  machineCode: string;
  machineIp: string;
  action: "CONNECT" | "AUTHENTICATE" | "DISABLE" | "ENABLE" | "READ_DATA";
  user?: string;
  success: boolean;
  error?: string;
}

async function logMachineAccess(log: MachineAccessLog): Promise<void> {
  await sqlClient.execute(`
    INSERT INTO absen_machine_access_log (
      timestamp, machine_code, machine_ip, action,
      user_name, success, error_message
    ) VALUES (
      '${log.timestamp.toISOString()}',
      '${log.machineCode}',
      '${log.machineIp}',
      '${log.action}',
      ${log.user ? `'${log.user}'` : 'NULL'},
      ${log.success ? 1 : 0},
      ${log.error ? `'${log.error}'` : 'NULL'}
    )
  `);
}
```

---

## Troubleshooting Authentication

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Connection refused` | Wrong IP/Port | Verify network connectivity |
| `Authentication failed` | Wrong password | Check password in code |
| `Device busy` | Another connection active | Wait and retry |
| `Timeout` | Network latency | Increase timeout value |
| `Socket error` | Firewall blocking | Check firewall rules |

### Debug Commands

```bash
# Test TCP connection
nc -zv 10.0.0.232 4370

# Test with timeout
timeout 5 nc -zv 10.0.0.232 4370

# Check if port is listening
netstat -an | grep 4370

# Monitor connection attempts
tcpdump -i eth0 port 4370
```

---

## Related Documentation

- [02_NETWORK_TOPOLOGY.md](./02_NETWORK_TOPOLOGY.md) - Network connectivity
- [04_SQL_GATEWAY_SECURITY.md](./04_SQL_GATEWAY_SECURITY.md) - Gateway authentication
- [05_CHANGE_AUDIT.md](./05_CHANGE_AUDIT.md) - Audit logging