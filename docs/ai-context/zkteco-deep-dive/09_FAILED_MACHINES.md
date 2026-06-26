# Failed Machines Analysis

## Overview

This document analyzes the 7 machines that cannot be accessed via direct ZKTeco connection, explaining the root cause of each failure and potential solutions.

## Summary of Failed Machines

| Machine | IP:Port | Issue | Severity | Data Source |
|---------|---------|-------|----------|------------|
| AB1 | 103.144.208.154:4900 | Port forwarding not active | Medium | IT Solution API (ARB1) |
| ARC_01 | 103.144.208.154:4200 | Port forwarding not active | Medium | IT Solution API (ARB2) |
| ARC_02 | 103.144.208.154:4201 | Port forwarding not active | Medium | IT Solution API (ARB2) |
| P1A | 10.0.0.90:4100 | Not ZKTeco device | High | IT Solution API (PG1A) |
| P1B | 10.0.0.91:4300 | Not ZKTeco device | High | IT Solution API (PG1B) |
| P2A | 223.25.98.220:4500 | Network unreachable | High | IT Solution API (PG2A) |
| P2B | 223.25.98.220:4600 | Network unreachable | High | IT Solution API (PG2B) |

## Machine Details

### 1. AB1 (Air Ruak Estate B1)

**Configuration:**
- **IP:** 103.144.208.154
- **Port:** 4900
- **Local IP:** 192.168.1.231
- **Scanner Code:** 900
- **LocCode:** G

**Issue:**
```
Connection refused to 103.144.208.154:4900
```

**Root Cause:**
Port forwarding rule not configured on the router at 103.144.208.154. The external port 4900 is not forwarded to internal IP 192.168.1.231.

**Evidence:**
- Port4900 does not respond to TCP probes
- Other ports on same IP (4370, 4400, 4800) work fine
- Internal IP 192.168.1.231 is reachable from local network

**Solution:**
Configure port forwarding on router 103.144.208.154:
```
External Port: 4900 → Internal IP: 192.168.1.231:4900 (TCP)
```

**Alternative:**
Use IT Solution API with division `ARB1`

---

### 2. ARC_01 (Air Ruak Estate A/C Machine 1)

**Configuration:**
- **IP:** 103.144.208.154
- **Port:** 4200
- **Local IP:** 192.168.1.235
- **Scanner Code:** 200
- **LocCode:** J

**Issue:**
```
Connection refused to 103.144.208.154:4200
```

**Root Cause:**
Port forwarding rule not configured. External port 4200 is not forwarded to internal IP 192.168.1.235.

**Evidence:**
- Port 4200 does not respond
- Other ports on same IP work
- Internal IP reachable locally

**Solution:**
Configure port forwarding:
```
External Port: 4200 → Internal IP: 192.168.1.235:4200 (TCP)
```

**Alternative:**
Use IT Solution API with division `ARB2`

---

### 3. ARC_02 (Air Ruak Estate A/C Machine 2)

**Configuration:**
- **IP:** 103.144.208.154
- **Port:** 4201
- **Local IP:** 192.168.1.236
- **Scanner Code:** 200
- **LocCode:** J

**Issue:**
```
Connection refused to 103.144.208.154:4201
```

**Root Cause:**
Same as ARC_01 - port forwarding not configured.

**Solution:**
Configure port forwarding:
```
External Port: 4201 → Internal IP: 192.168.1.236:4201 (TCP)
```

**Alternative:**
Use IT Solution API with division `ARB2`

---

### 4. P1A (Parit Gunung Estate 1A)

**Configuration:**
- **IP:** 10.0.0.90
- **Port:** 4100
- **Scanner Code:** 100
- **LocCode:** A

**Issue:**
```
TCP connection succeeds but no protocol response
Connection hangs until timeout
```

**Root Cause:**
This is NOT a ZKTeco device. The machine accepts TCP connections but does not respond to the ZKTeco binary protocol. It is likely a different attendance machine brand.

**Evidence:**
- TCP SYN handshake succeeds
- Sending ZKTeco commands results in no response
- Socket does not close, but no data received
- Timeout occurs after extended period (30+ seconds)

**Diagnosis:**
```typescript
// This will hang
const zk = new ZKLib({
  ip: "10.0.0.90",
  port: 4100,
  timeout: 30000
});

await zk.createSocket();
// Connected but zk.getUsers() will timeout
```

**Solution:**
Use IT Solution API with division `PG1A`

**Why API works:**
The IT Solution API receives data from all machines (including non-ZKTeco) through a different integration method.

---

### 5. P1B (Parit Gunung Estate 1B)

**Configuration:**
- **IP:** 10.0.0.91
- **Port:** 4300
- **Scanner Code:** 300
- **LocCode:** B

**Issue:**
Same as P1A - not a ZKTeco device.

**Root Cause:**
Non-ZKTeco attendance machine.

**Solution:**
Use IT Solution API with division `PG1B`

---

### 6. P2A (Parit Gunung Estate 2A)

**Configuration:**
- **IP:** 223.25.98.220
- **Port:** 4500
- **Local IP:** 10.0.0.92
- **Scanner Code:** 500
- **LocCode:** C

**Issue:**
```
ECONNREFUSED - Connection refused
ETIMEDOUT - Connection timed out
```

**Root Cause:**
Network unreachable. The port forwarding on router 223.25.98.220 is not configured for port 4500.

**Evidence:**
- TCP connection fails immediately
- Router responds with RST (reset)
- Other services on same IP may or may not be accessible

**Solution:**
**Option 1:** Configure port forwarding on router 223.25.98.220:
```
External Port: 4500 → Internal IP: 10.0.0.92:4500 (TCP)
```

**Option 2 (Recommended):** Use IT Solution API with division `PG2A`

---

### 7. P2B (Parit Gunung Estate 2B)

**Configuration:**
- **IP:** 223.25.98.220
- **Port:** 4600
- **Local IP:** 10.0.0.93
- **Scanner Code:** 600
- **LocCode:** D

**Issue:**
Same as P2A - network unreachable.

**Root Cause:**
Port forwarding not configured on router 223.25.98.220.

**Solution:**
**Option 1:** Configure port forwarding:
```
External Port: 4600 → Internal IP: 10.0.0.93:4600 (TCP)
```

**Option 2 (Recommended):** Use IT Solution API with division `PG2B`

---

## Network Topology

### Problematic Networks

#### Network 1: 103.144.208.154 (Air Ruak Estate Network)

```
Internet
 |
    v
Router 103.144.208.154
    |
    +-- Port 4370 → ARE (192.168.1.233) [WORKS]
    +-- Port 4400 → AB2 (192.168.1.232) [WORKS]
    +-- Port 4800 → ARA (192.168.1.230) [WORKS]
    +-- Port 4900 → AB1 (192.168.1.231) [FAILS - no forwarding]
    +-- Port 4200 → ARC_01 (192.168.1.235) [FAILS - no forwarding]
    +-- Port 4201 → ARC_02 (192.168.1.236) [FAILS - no forwarding]
```

#### Network 2: 223.25.98.220 (Parit Gunung Estate Network)

```
Internet
    |
    v
Router 223.25.98.220
    |
    +-- Port 4370 → PGE (10.0.0.232) [WORKS]
    +-- Port 4100 → P1A (10.0.0.90) [FAILS - not ZKTeco]
    +-- Port 4300 → P1B (10.0.0.91) [FAILS - not ZKTeco]
    +-- Port 4500 → P2A (10.0.0.92) [FAILS - no forwarding]
    +-- Port 4600 → P2B (10.0.0.93) [FAILS - no forwarding]
```

## Recommended Solutions

### For Port Forwarding Issues (AB1, ARC_01, ARC_02)

1. **Access router management:**
   - URL: http://103.144.208.154 (or similar)
   - Login with admin credentials

2. **Navigate to Port Forwarding / NAT / Virtual Server**

3. **Add forwarding rules:**

 | Name | External Port | Internal IP | Internal Port | Protocol |
   |------|---------------|-------------|---------------|----------|
   | AB1 | 4900 | 192.168.1.231 | 4900 | TCP |
   | ARC_01 | 4200 | 192.168.1.235 | 4200 | TCP |
   | ARC_02 | 4201 | 192.168.1.236 | 4201 | TCP |

4. **Save and test connectivity**

### For Non-ZKTeco Devices (P1A, P1B)

No direct solution available. These machines use a different protocol.

**Action:** Rely on IT Solution API for data.

### For Network Unreachable (P2A, P2B)

**Option 1:** Configure port forwarding on router 223.25.98.220

**Option 2 (Recommended):** Use IT Solution API

## IT Solution API Coverage

All7 failed machines have corresponding API divisions:

| Machine | API Division | Endpoint |
|---------|--------------|----------|
| AB1 | ARB1 | /api/attendance-by-division?division=ARB1 |
| ARC_01 | ARB2 | /api/attendance-by-division?division=ARB2 |
| ARC_02 | ARB2 | /api/attendance-by-division?division=ARB2 |
| P1A | PG1A | /api/attendance-by-division?division=PG1A |
| P1B | PG1B | /api/attendance-by-division?division=PG1B |
| P2A | PG2A | /api/attendance-by-division?division=PG2A |
| P2B | PG2B | /api/attendance-by-division?division=PG2B |

## Monitoring

### Check Machine Accessibility

```typescript
async function checkMachineAccessibility(machineCode: string): Promise<{
  accessible: boolean;
  method: 'zkteco' | 'api' | 'unavailable';
  error?: string;
}> {
  const config = machineServers[machineCode];

  if (!config) {
    return { accessible: false, method: 'unavailable', error: 'Unknown machine' };
  }

  // Try ZKTeco connection
  try {
    const zk = new ZKLib({
      ip: config.ip,
      port: config.port,
      timeout: 5000,
      connectionTimeout: 2000
    });

    await zk.createSocket();
    await zk.disconnect();

    return { accessible: true, method: 'zkteco' };
  } catch (error: any) {
    // Determine if we should use API
    const useApi = ['P1A', 'P1B', 'P2A', 'P2B'].includes(machineCode) ||
                   error.message.includes('ECONNREFUSED');

    return {
      accessible: true,
      method: useApi ? 'api' : 'unavailable',
      error: error.message
    };
  }
}
```

## Summary Action Items

| Priority | Machine | Action |
|----------|---------|--------|
| High | P1A, P1B | Use API (PG1A, PG1B) |
| High | P2A, P2B | Use API (PG2A, PG2B) |
| Medium | AB1 | Configure port forwarding OR use API (ARB1) |
| Medium | ARC_01, ARC_02 | Configure port forwarding OR use API (ARB2) |
