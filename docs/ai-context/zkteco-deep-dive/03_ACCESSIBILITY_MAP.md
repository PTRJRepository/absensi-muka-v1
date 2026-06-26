---
tags: [ai-context, machine, accessibility, post-recovery]
created: 2026-06-07
updated: 2026-06-26
---

# Machine Accessibility Map

## Post-Recovery Summary (2026-06-25)

| Status | Count | Machines |
|--------|-------|----------|
| Accessible (ZKTeco confirmed) | 10 | OFFICE_PGE, P1A, P1B, MILL, OFFICE_APE, IJL, AB2, DME_01, DME_02, ARA |
| Port Forwarding Needed | 3 | AB1, ARC_01, ARC_02 |
| Network Unreachable | 2 | P2A, P2B |

**Previously marked as "API Only" (P1A, P1B) — NOW ACCESSIBLE via ZKTeco TCP.**
Recovery confirmed both machines respond to ZKTeco protocol.

---

## Accessible Machines (10)

### Criteria

A machine is accessible if:
1. TCP socket connects to IP:port
2. ZKTeco protocol handshake succeeds
3. getUsers() and getAttendances() return data
4. No firewall blocking

### Confirmed Accessible

| Machine | IP:Port | Network | LocCode | Scanner | Verified |
|---------|---------|---------|---------|---------|---------|
| OFFICE_PGE | 10.0.0.232:4370 | Local PGE | A | — | 2026-06-25 |
| P1A | 10.0.0.90:4100 | Local PGE | A | 100 | 2026-06-25 |
| P1B | 10.0.0.91:4300 | Local PGE | B | 300 | 2026-06-25 |
| MILL | 103.127.66.32:4370 | Public | — | — | Pre-recovery |
| OFFICE_APE | 103.144.208.154:4370 | Public APE | — | — | Pre-recovery |
| IJL | 103.144.211.226:4370 | Public direct | L | — | Pre-recovery |
| AB2 | 103.144.208.154:4400 | Public APE | H | 400 | Pre-recovery |
| DME_01 | 103.144.228.42:4700 | Public DME | E | 700 | Pre-recovery |
| DME_02 | 103.144.228.42:4701 | Public DME | E | 700 | Pre-recovery |
| ARA | 103.144.208.154:4800 | Public APE | F | 800 | Pre-recovery |

### P1A / P1B — Previously Misclassified

**Before recovery:** Marked as "Not ZKTeco (API)" — TCP connected but no protocol response.
**After recovery:** Confirmed ZKTeco protocol works. getUsers() returned 793 (P1A) and 155 (P1B) users.

**Why the confusion:** Earlier testing may have had wrong port numbers or timeout settings. Port 4100 (P1A) and 4300 (P1B) are the correct ZKTeco ports.

---

## Port Forwarding Needed (3)

### Root Cause

Router at 103.144.208.154 (APE estate network) does not forward external ports to internal machines. TCP SYN reaches router but gets no response.

### Required Port Forwarding Rules

| Machine | External Port | Internal IP | Internal Port | Protocol |
|---------|--------------|-------------|---------------|----------|
| ARC_01 | 4200 | 192.168.1.235 | 4200 | TCP |
| ARC_02 | 4201 | 192.168.1.236 | 4201 | TCP |
| AB1 | 4900 | 192.168.1.231 | 4900 | TCP |

**Router management:** Access 103.144.208.154 → NAT/Virtual Server → add rules above.

### Impact

| Machine | Division | LocCode | Historical Records Lost |
|---------|----------|---------|------------------------|
| ARC_01 | ARC | J | ~12,096 rows |
| ARC_02 | ARC | J | Same division as ARC_01 |
| AB1 | AB1 | G | ~4,934 rows |

---

## Network Unreachable (2)

### Root Cause

P2A (10.0.0.92) and P2B (10.0.0.93) are on the PGE estate internal network but routing/firewall blocks access from the application server (10.0.0.110).

### Diagnosis

```
telnet 10.0.0.92 4500  → Connection refused/timeout
ping 10.0.0.92         → No response
```

### Solution

Fix PGE estate network routing. Options:
1. Check if machines are powered on and connected
2. Verify switch configuration for 10.0.0.92/93 ports
3. Check firewall rules on 10.0.0.x gateway

### Impact

| Machine | Division | LocCode | Current Records |
|---------|----------|---------|----------------|
| P2A | P2A | C | ~31 rows |
| P2B | P2B | D | ~38 rows |

Both have very few records — may not be actively used or enrollment is minimal.

---

## Scanner Code Mapping

| Machine | Scanner Suffix | LocCode | EmpCode | raw_device_user_id example |
|---------|--------------|---------|---------|--------------------------|
| P1A | 100 | A | Axxxx | `10044` → `A0044` |
| ARC | 200 | J | Jxxxx | `20015` → `J0015` |
| P1B | 300 | B | Bxxxx | `30232` → `B0232` |
| AB2 | 400 | H | Hxxxx | `40001` → `H0001` |
| P2A | 500 | C | Cxxxx | `50001` → `C0001` |
| P2B | 600 | D | Dxxxx | `60010` → `D0010` |
| DME | 700 | E | Exxxx | `70088` → `E0088` |
| ARA | 800 | F | Fxxxx | `80001` → `F0001` |
| AB1 | 900 | G | Gxxxx | `90001` → `G0001` |
| IJL | — | L | Lxxxx | `0010022` → `L0022` (no prefix) |

---

## IT Solution API — DEPRECATED

**There is NO IT Solution API fallback.** All data must come from ZKTeco direct connection.

- IT Solution REST API at 10.0.0.110:5176 is non-operational
- No alternative data source for inaccessible machines
- Solution: Fix network infrastructure (port forwarding, PGE estate routing)
