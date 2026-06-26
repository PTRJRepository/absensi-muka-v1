# Network Topology Documentation

> **Classification:** Internal Use Only  
> **Version:** 1.0.0  
> **Last Updated:** 2026-06-07

---

## Overview

This document describes the network architecture of the Absensi system, including all internal IP addresses, ports, and network zones.

---

## Network Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PT REBINMAS JAYA NETWORK                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│  │   HEAD OFFICE   │     │   MILL ESTATE   │     │  ESTATE NETWORK │        │
│  │   10.0.0.0/24    │     │  103.127.66.0/24│     │ 103.144.208.0/24│        │
│  │                 │     │                 │     │                 │        │
│  │ 10.0.0.90:P1A   │     │ 103.127.66.32   │     │ 103.144.208.154 │        │
│  │ 10.0.0.91:P1B   │     │       MILL      │     │   ARE (4370)    │        │
│  │ 10.0.0.110      │     │                 │     │   ARA (4800)    │        │
│  │   Gateway/API   │     │                 │     │   AB1 (4900)    │        │
│  │ 10.0.0.232:PGE  │     └─────────────────┘     │   AB2 (4400)    │        │
│  │                 │                             │   ARC_01(4200)  │        │
│  └─────────────────┘                             │   ARC_02(4201)  │        │
│                                                    └─────────────────┘        │
│  ┌─────────────────┐                                                        │
│  │  ESTATE (P2A)   │         ┌─────────────────┐                            │
│  │ 223.25.98.0/24   │         │  ESTATE (DME)   │                            │
│  │                 │         │ 103.144.228.0/24│                            │
│  │ 223.25.98.220   │         │                 │                            │
│  │   P2A(4500)     │         │ 103.144.228.42  │                            │
│  │   P2B(4600)     │         │   DME_01(4700)  │                            │
│  └─────────────────┘         │   DME_02(4701)  │                            │
│                             └─────────────────┘                            │
│  ┌─────────────────┐                                                        │
│  │  ESTATE (IJL)   │                                                        │
│  │ 103.144.211.0/24│                                                        │
│  │                 │                                                        │
│  │ 103.144.211.226 │                                                        │
│  │      IJL         │                                                        │
│  └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Network Zones

### Zone 1: Head Office Network

| Network | CIDR | Purpose |
|---------|------|---------|
| Internal Corporate | `10.0.0.0/24` | Main office and internal services |

**Key Servers:**
| IP | Hostname | Services | Port |
|----|----------|----------|------|
| `10.0.0.110` | gateway | SQL Gateway + IT Solution API | 5176, 8001 |
| `10.0.0.90` | p1a-mis | Machine P1A (non-ZKTeco) | 4100 |
| `10.0.0.91` | p1b-mis | Machine P1B (non-ZKTeco) | 4300 |
| `10.0.0.232` | pge-office | Machine PGE (office) | 4370 |

---

### Zone 2: Public-Facing Estate Network

| Network | CIDR | Purpose |
|---------|------|---------|
| Estate Public | `103.127.66.0/24` | External-facing estate services |
| Estate Public | `103.144.208.0/24` | External-facing estate services |
| Estate Public | `103.144.211.0/24` | External-facing estate services |
| Estate Public | `103.144.228.0/24` | External-facing estate services |
| Estate Public | `223.25.98.0/24` | External-facing estate services |

**Note:** These networks are accessible from the internet via port forwarding.

---

## Machine Network Configuration

### ZKTeco Machines (Direct TCP Access)

| Machine Code | Public IP | Port | Local IP | Type | Status |
|-------------|-----------|------|----------|------|--------|
| PGE | 10.0.0.232 | 4370 | 10.0.0.232 | office | Accessible |
| MILL | 103.127.66.32 | 4370 | - | office | Accessible |
| DME_01 | 103.144.228.42 | 4700 | 192.168.1.10 | absensi | Accessible |
| DME_02 | 103.144.228.42 | 4701 | 192.168.1.11 | absensi | Accessible |
| ARE | 103.144.208.154 | 4370 | 192.168.1.233 | absensi | Accessible |
| ARA | 103.144.208.154 | 4800 | 192.168.1.230 | absensi | Accessible |
| IJL | 103.144.211.226 | 4370 | - | absensi | Accessible |
| AB2 | 103.144.208.154 | 4400 | 192.168.1.232 | absensi | Port Open |
| AB1 | 103.144.208.154 | 4900 | 192.168.1.231 | absensi | Not Configured |
| ARC_01 | 103.144.208.154 | 4200 | 192.168.1.235 | absensi | Not Configured |
| ARC_02 | 103.144.208.154 | 4201 | 192.168.1.236 | absensi | Not Configured |

### API-Only Machines (No Direct Access)

| Machine Code | IP | Port | Data Source | Reason |
|-------------|----|------|-------------|--------|
| P1A | 10.0.0.90 | 4100 | IT Solution API | Non-ZKTeco device |
| P1B | 10.0.0.91 | 4300 | IT Solution API | Non-ZKTeco device |
| P2A | 223.25.98.220 | 4500 | IT Solution API | Port forwarding inactive |
| P2B | 223.25.98.220 | 4600 | IT Solution API | Port forwarding inactive |

---

## Firewall Rules

### Required Inbound Rules (Gateway Server)

| Source | Destination | Port | Purpose |
|--------|-------------|------|---------|
| 10.0.0.0/24 | 10.0.0.110 | 8001 | SQL Gateway HTTP |
| 10.0.0.0/24 | 10.0.0.110 | 5176 | IT Solution API |
| Any | 10.0.0.110 | 8001 | SQL Gateway (if remote admin) |

### Required Outbound Rules (Sync Server)

| Destination | Port | Purpose |
|-------------|------|---------|
| 10.0.0.110 | 8001 | SQL Gateway access |
| 10.0.0.110 | 5176 | IT Solution API access |
| 103.127.66.32 | 4370 | MILL machine access |
| 103.144.228.42 | 4700-4701 | DME machines access |
| 103.144.208.154 | 4200-4900 | ARE/ARA/AB machines |
| 103.144.211.226 | 4370 | IJL machine access |

---

## Port Reference

### Well-Known Ports

| Port | Service | Protocol | Machines |
|------|---------|----------|----------|
| 4100 | P1A Machine | TCP | P1A |
| 4200 | ARC Machine 1 | TCP | ARC_01 |
| 4201 | ARC Machine 2 | TCP | ARC_02 |
| 4300 | P1B Machine | TCP | P1B |
| 4370 | ZKTeco Default | TCP | PGE, MILL, ARE, IJL |
| 4400 | AB2 Machine | TCP | AB2 |
| 4500 | P2A Machine | TCP | P2A |
| 4600 | P2B Machine | TCP | P2B |
| 4700 | DME Machine 1 | TCP | DME_01 |
| 4701 | DME Machine 2 | TCP | DME_02 |
| 4800 | ARA Machine | TCP | ARA |
| 4900 | AB1 Machine | TCP | AB1 |

### Application Ports

| Port | Service | Location | Purpose |
|------|---------|----------|---------|
| 5176 | IT Solution API | 10.0.0.110 | Attendance data API |
| 8001 | SQL Gateway | 10.0.0.110 | HTTP SQL interface |

---

## Network Latency Considerations

### Typical Latency

| Route | Latency (ms) | Notes |
|-------|--------------|-------|
| Head Office → SQL Gateway | <1 | Local network |
| Head Office → PGE | <1 | Local network |
| Head Office → MILL | 50-100 | External estate |
| Head Office → DME | 80-150 | External estate |
| Head Office → ARE/ARA/AB | 80-150 | External estate |
| Head Office → IJL | 100-200 | External estate |

### Timeout Recommendations

```typescript
// Timeout configuration per machine type
const TIMEouts = {
  local: 20000,      // 20s - PGE, local machines
  estate: 30000,      // 30s - ARE, ARA, DME
  remote: 45000,      // 45s - MILL, IJL (higher latency)
};
```

---

## VPN Requirements

For remote access to machines:

1. **Head Office VPN:** Not required for internal network
2. **Estate VPN:** Required for remote administration
   - Connect to estate network before accessing public IPs
   - Use credentials from IT department

---

## Troubleshooting Network Issues

### Test Connectivity

```bash
# Test SQL Gateway
curl -I http://10.0.0.110:8001/v1/query

# Test IT Solution API
curl -I http://10.0.0.110:5176/api/divisions

# Test ZKTeco machine (PGE)
nc -zv 10.0.0.232 4370

# Test estate machine (DME_01)
nc -zv 103.144.228.42 4700
```

### DNS Resolution

```bash
# Add hosts entries if DNS unavailable
# Windows: C:\Windows\System32\drivers\etc\hosts
# Linux/Mac: /etc/hosts

10.0.0.110    gateway.ptrj.local
10.0.0.232    pge-office.ptrj.local
103.144.228.42 dme-estate.ptrj.local
```

---

## Related Documentation

- [01_SECRETS_MANAGEMENT.md](./01_SECRETS_MANAGEMENT.md) - API key security
- [03_MACHINE_PASSWORDS.md](./03_MACHINE_PASSWORDS.md) - ZKTeco authentication
- [04_SQL_GATEWAY_SECURITY.md](./04_SQL_GATEWAY_SECURITY.md) - Gateway access control