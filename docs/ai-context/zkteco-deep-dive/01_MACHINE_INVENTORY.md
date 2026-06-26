---
tags: [ai-context, machine, inventory, post-recovery]
created: 2026-06-07
updated: 2026-06-26
---

# Machine Inventory — All 16 Attendance Machines

## Post-Recovery Status (2026-06-25)

PT Rebinmas Jaya operates 16 ZKTeco attendance machines across multiple plantation locations. 10 are currently accessible via ZKTeco TCP protocol. 6 require network remediation.

## Complete Machine List

| Code | Estate | Local IP | Port | Public IP | Accessible | LocCode |
|------|--------|----------|------|-----------|-----------|---------|
| OFFICE_PGE | PGE Office | 10.0.0.232 | 4370 | — | YES | A |
| P1A | PGE Estate 1A | 10.0.0.90 | 4100 | — | YES | A |
| P1B | PGE Estate 1B | 10.0.0.91 | 4300 | — | YES | B |
| MILL | Mill | 103.127.66.32 | 4370 | — | YES | — |
| OFFICE_APE | ARE Estate | 103.144.208.154 | 4370 | — | YES | — |
| IJL | IJL Estate | 103.144.211.226 | 4370 | — | YES | L |
| AB2 | Air Ruak Estate B2 | 103.144.208.154 | 4400 | — | YES | H |
| DME_01 | DME Estate | 103.144.228.42 | 4700 | 103.144.228.42 | YES | E |
| DME_02 | DME Estate | 103.144.228.42 | 4701 | 103.144.228.42 | YES | E |
| ARA | ARA Estate | 103.144.208.154 | 4800 | 103.144.208.154 | YES | F |
| AB1 | Air Ruak Estate B1 | 103.144.208.154 | 4900 | 103.144.208.154 | NO (port fwd) | G |
| ARC_01 | Air Ruak Estate A/C | 103.144.208.154 | 4200 | 103.144.208.154 | NO (port fwd) | J |
| ARC_02 | Air Ruak Estate A/C | 103.144.208.154 | 4201 | 103.144.208.154 | NO (port fwd) | J |
| P2A | PGE Estate 2A | 10.0.0.92 | 4500 | — | NO (network) | C |
| P2B | PGE Estate 2B | 10.0.0.93 | 4600 | — | NO (network) | D |

**Total: 16 machines | 10 accessible | 3 need port forwarding | 2 unreachable (PGE network)**

## Accessible Machines Detail

### 1. OFFICE_PGE (PGE Office)
- **IP:** 10.0.0.232:4370
- **Network:** Local PGE estate (same as DB server)
- **Type:** Office
- **Scanner Code:** None
- **LocCode:** A (same as P1A)
- **ZKTeco Protocol:** Confirmed working
- **Known Users:** ~1,653 (synced via getUsers)
- **Notes:** Main office machine. emp_code prefix "A".

### 2. P1A (Parit Gunung Estate 1A)
- **IP:** 10.0.0.90:4100
- **Network:** Local PGE estate
- **Scanner Code:** 100
- **LocCode:** A
- **ZKTeco Protocol:** Confirmed working (2026-06-25)
- **Known Users:** ~793 (synced via getUsers)
- **Notes:** Confirmed accessible 2026-06-25. Previously marked as "not ZKTeco".

### 3. P1B (Parit Gunung Estate 1B)
- **IP:** 10.0.0.91:4300
- **Network:** Local PGE estate
- **Scanner Code:** 300
- **LocCode:** B
- **ZKTeco Protocol:** Confirmed working (2026-06-25)
- **Known Users:** ~155 (synced via getUsers)
- **Notes:** Confirmed accessible 2026-06-25. Previously marked as "not ZKTeco".

### 4. MILL (Mill Office)
- **IP:** 103.127.66.32:4370
- **Network:** Public direct
- **Type:** Office
- **Known Records:** ~8,183 attendance records
- **Known Users:** ~565
- **Notes:** Accessible via public IP.

### 5. OFFICE_APE (ARE Estate)
- **IP:** 103.144.208.154:4370
- **Network:** Public (APE estate)
- **Type:** Absensi
- **Scanner Code:** None
- **LocCode:** None
- **Notes:** Part of APE network. Not in scannerCode/locCode mapping.

### 6. IJL (IJL Estate)
- **IP:** 103.144.211.226:4370
- **Network:** Public direct
- **Scanner Code:** None
- **LocCode:** L
- **Known Records:** ~2,894 attendance_imports records
- **Known Users:** ~162
- **Notes:** emp_code format: `L{raw_id}` (no scanner code).

### 7. AB2 (Air Ruak Estate B2)
- **IP:** 103.144.208.154:4400
- **Network:** Public (APE estate network)
- **Scanner Code:** 400
- **LocCode:** H
- **Known Records:** ~3,989 attendance_imports records
- **Notes:** Shares IP with ARE/ARA/ARC machines on different ports.

### 8. DME_01 (DME Estate Primary)
- **IP:** 103.144.228.42:4700
- **Network:** Public (DME estate)
- **Scanner Code:** 700
- **LocCode:** E
- **Known Records:** ~8,183 attendance records (combined DME)
- **Known Users:** ~542
- **Notes:** Shares IP with DME_02 on different port.

### 9. DME_02 (DME Estate Secondary)
- **IP:** 103.144.228.42:4701
- **Network:** Public (DME estate)
- **Scanner Code:** 700
- **LocCode:** E
- **Known Records:** ~1,797 attendance records
- **Known Users:** ~227
- **Notes:** Same LocCode "E" as DME_01.

### 10. ARA (ARA Estate)
- **IP:** 103.144.208.154:4800
- **Network:** Public (APE estate network)
- **Scanner Code:** 800
- **LocCode:** F
- **Known Records:** ~94 attendance_imports records
- **Known Users:** ~554
- **Notes:** Very few records. May need enrollment check.

## Inaccessible Machines

### 11. AB1 (Air Ruak Estate B1)
- **IP:** 103.144.208.154:4900
- **Scanner Code:** 900
- **LocCode:** G
- **Issue:** Port forwarding not active on 103.144.208.154 router
- **Records in scan_logs:** ~4,934 rows (historical, from backup)
- **Notes:** 22 NEED_REVIEW rows with empty raw_device_user_id.

### 12. ARC_01 (Air Ruak Estate A/C Primary)
- **IP:** 103.144.208.154:4200
- **Scanner Code:** 200
- **LocCode:** J
- **Issue:** Port forwarding not active
- **Records:** ~12,096 rows (ARC division, J prefix)
- **Notes:** Shares public IP with multiple machines.

### 13. ARC_02 (Air Ruak Estate A/C Secondary)
- **IP:** 103.144.208.154:4201
- **Scanner Code:** 200
- **LocCode:** J
- **Issue:** Port forwarding not active
- **Notes:** Same LocCode "J" as ARC_01.

### 14. P2A (Parit Gunung Estate 2A)
- **IP:** 10.0.0.92:4500
- **Scanner Code:** 500
- **LocCode:** C
- **Issue:** Network unreachable (PGE estate internal)
- **Records:** ~31 rows only (barely active)
- **Notes:** PGE network routing needs to be fixed.

### 15. P2B (Parit Gunung Estate 2B)
- **IP:** 10.0.0.93:4600
- **Scanner Code:** 600
- **LocCode:** D
- **Issue:** Network unreachable (PGE estate internal)
- **Records:** ~38 rows only (barely active)
- **Notes:** PGE network routing needs to be fixed.

## Network Groupings

### Group 1: PGE Estate (10.0.0.x) — Local
```
10.0.0.232:4370  → OFFICE_PGE  (accessible)
10.0.0.90:4100   → P1A         (accessible)
10.0.0.91:4300   → P1B         (accessible)
10.0.0.92:4500   → P2A         (INACCESSIBLE)
10.0.0.93:4600   → P2B         (INACCESSIBLE)
```

### Group 2: APE Estate (103.144.208.154) — Public
```
103.144.208.154:4200 → ARC_01   (port fwd needed)
103.144.208.154:4201 → ARC_02   (port fwd needed)
103.144.208.154:4370 → OFFICE_APE (accessible)
103.144.208.154:4400 → AB2       (accessible)
103.144.208.154:4800 → ARA       (accessible)
103.144.208.154:4900 → AB1       (port fwd needed)
```

### Group 3: DME Estate (103.144.228.42) — Public
```
103.144.228.42:4700 → DME_01   (accessible)
103.144.228.42:4701 → DME_02   (accessible)
```

### Group 4: IJL Estate — Public Direct
```
103.144.211.226:4370 → IJL     (accessible)
```

### Group 5: MILL — Public Direct
```
103.127.66.32:4370  → MILL     (accessible)
```

## Scanner Code Reference

| Machine | Suffix | LocCode | EmpCode Prefix | Example |
|---------|--------|---------|----------------|---------|
| P1A | 100 | A | A | `10044` → `A0044` |
| ARC | 200 | J | J | `20015` → `J0015` |
| P1B | 300 | B | B | `30232` → `B0232` |
| AB2 | 400 | H | H | `40001` → `H0001` |
| P2A | 500 | C | C | `50001` → `C0001` |
| P2B | 600 | D | D | `60010` → `D0010` |
| DME | 700 | E | E | `70088` → `E0088` |
| ARA | 800 | F | F | `80001` → `F0001` |
| AB1 | 900 | G | G | `90001` → `G0001` |
| IJL | — | L | L | `0010022` → `L0022` |

## Statistics Summary

| Category | Count |
|----------|-------|
| Total Machines | 15 |
| Accessible (ZKTeco) | 10 |
| Port Forwarding Needed | 3 (AB1, ARC_01, ARC_02) |
| Network Unreachable | 2 (P2A, P2B) |
| Total Users (synced) | ~5,500 |
| Total Attendance Records | ~788,915 scan_logs |
