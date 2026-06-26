# Konfigurasi Mesin Absensi

## Daftar 16 Mesin

### ACCESSIBLE MACHINES (7) - ZKTeco connection confirmed

#### 1. OFFICE_PGE
| Field | Nilai |
|-------|-------|
| Code | OFFICE_PGE |
| IP Public | 223.25.98.220 |
| Port | 4370 |
| IP Local | 10.0.0.232 |
| Scanner Code | - |
| LocCode | A |
| Type | office |
| Division | STF |
| Users | 1,653 |
| Attendance | 19,641 |

#### 2. MILL
| Field | Nilai |
|-------|-------|
| Code | MILL |
| IP Public | 103.127.66.32 |
| Port | 4370 |
| IP Local | - |
| Scanner Code | - |
| LocCode | A |
| Type | office |
| Division | STF |
| Users | 569 |
| Attendance | 4,910 |

#### 3. OFFICE_APE
| Field | Nilai |
|-------|-------|
| Code | OFFICE_APE |
| IP Public | 103.144.208.154 |
| Port | 4370 |
| IP Local | 192.168.1.233 |
| Scanner Code | - |
| LocCode | F |
| Type | office |
| Division | ARA |
| Users | 1,084 |
| Attendance | 9,820 |

#### 4. IJL
| Field | Nilai |
|-------|-------|
| Code | IJL |
| IP Public | 103.144.211.226 |
| Port | 4370 |
| IP Local | - |
| Scanner Code | - |
| LocCode | L |
| Type | absensi |
| Division | IJL |
| Users | 166 |
| Attendance | 8,007 |

#### 5. AB2
| Field | Nilai |
|-------|-------|
| Code | AB2 |
| IP Public | 103.144.208.154 |
| Port | 4400 |
| IP Local | 192.168.1.232 |
| Scanner Code | 400 |
| LocCode | H |
| Type | absensi |
| Division | AB2 |
| Users | 233 |
| Attendance | 3,962 |

#### 6. P1A
| Field | Nilai |
|-------|-------|
| Code | P1A |
| IP Local | 10.0.0.90 |
| Port | 4100 |
| IP Public | 10.0.0.90 |
| Scanner Code | 100 |
| LocCode | A |
| Type | absensi |
| Division | PG1A |
| Users | 792 |
| Attendance | 2,739 |

#### 7. P1B
| Field | Nilai |
|-------|-------|
| Code | P1B |
| IP Local | 10.0.0.91 |
| Port | 4300 |
| IP Public | 10.0.0.91 |
| Scanner Code | 300 |
| LocCode | B |
| Type | absensi |
| Division | PG1B |
| Users | 792 |
| Attendance | 2,737 |

---

### INACCESSIBLE MACHINES (9) - Need firewall/router config

#### 8. DME_01
| Field | Nilai |
|-------|-------|
| Code | DME_01 |
| IP Public | 103.144.228.42 |
| Port | 4700 |
| IP Local | 192.168.1.10 |
| Scanner Code | 700 |
| LocCode | E |
| Type | absensi |
| Division | DME |
| Status | ❌ PORT_BLOCKED |

#### 9. DME_02
| Field | Nilai |
|-------|-------|
| Code | DME_02 |
| IP Public | 103.144.228.42 |
| Port | 4701 |
| IP Local | 192.168.1.11 |
| Scanner Code | 700 |
| LocCode | E |
| Type | absensi |
| Division | DME |
| Status | ❌ PORT_BLOCKED |

#### 10. ARC_01
| Field | Nilai |
|-------|-------|
| Code | ARC_01 |
| IP Public | 103.144.208.154 |
| Port | 4200 |
| IP Local | 192.168.1.235 |
| Scanner Code | 200 |
| LocCode | J |
| Type | absensi |
| Division | ARC |
| Status | ❌ PORT_BLOCKED |

#### 11. ARC_02
| Field | Nilai |
|-------|-------|
| Code | ARC_02 |
| IP Public | 103.144.208.154 |
| Port | 4201 |
| IP Local | 192.168.1.236 |
| Scanner Code | 200 |
| LocCode | J |
| Type | absensi |
| Division | ARC |
| Status | ❌ PORT_BLOCKED |

#### 12. ARA
| Field | Nilai |
|-------|-------|
| Code | ARA |
| IP Public | 103.144.208.154 |
| Port | 4800 |
| IP Local | 192.168.1.230 |
| Scanner Code | 800 |
| LocCode | F |
| Type | absensi |
| Division | ARA |
| Status | ❌ PORT_BLOCKED |

#### 13. AB1
| Field | Nilai |
|-------|-------|
| Code | AB1 |
| IP Public | 103.144.208.154 |
| Port | 4900 |
| IP Local | 192.168.1.231 |
| Scanner Code | 900 |
| LocCode | G |
| Type | absensi |
| Division | AB1 |
| Status | ❌ PORT_BLOCKED |

#### 14. P2A_01
| Field | Nilai |
|-------|-------|
| Code | P2A_01 |
| IP Local | 10.0.0.92 |
| Port | 4500 |
| IP Public | 10.0.0.92 |
| Scanner Code | 500 |
| LocCode | C |
| Type | absensi |
| Division | PG2A |
| Status | ❌ NETWORK_UNREACHABLE |

#### 15. P2B
| Field | Nilai |
|-------|-------|
| Code | P2B |
| IP Local | 10.0.0.93 |
| Port | 4600 |
| IP Public | 10.0.0.93 |
| Scanner Code | 600 |
| LocCode | D |
| Type | absensi |
| Division | PG2B |
| Status | ❌ NETWORK_UNREACHABLE |

#### 16. P2A_02
| Field | Nilai |
|-------|-------|
| Code | P2A_02 |
| IP Local | 10.0.0.94 |
| Port | 4501 |
| IP Public | 10.0.0.94 |
| Scanner Code | 500 |
| LocCode | C |
| Type | absensi |
| Division | PG2A |
| Status | ❌ NETWORK_UNREACHABLE |

---

## Scanner Code Mapping

| Machine | ScannerCode | LocCode | EmpCode Prefix |
|---------|------------|---------|---------------|
| P1A | 100 | A | A |
| ARC | 200 | J | J |
| P1B | 300 | B | B |
| AB2 | 400 | H | H |
| P2A | 500 | C | C |
| P2B | 600 | D | D |
| DME | 700 | E | E |
| ARA | 800 | F | F |
| AB1 | 900 | G | G |
| IJL | - | L | L |
| PGE/APE | - | A | A |

---

## Struktur IP Group

```
Group 1 — PGE Network (223.25.98.220):
  10.0.0.232:4370  → OFFICE_PGE (accessible)
  10.0.0.90:4100   → P1A (accessible)
  10.0.0.91:4300   → P1B (accessible)
  10.0.0.92:4500   → P2A_01 (unreachable)
  10.0.0.93:4600   → P2B (unreachable)
  10.0.0.94:4501   → P2A_02 (unreachable)

Group 2 — DME Network (103.144.228.42):
  192.168.1.10:4700  → DME_01 (port blocked)
  192.168.1.11:4701  → DME_02 (port blocked)

Group 3 — ARA/ARC/AB Network (103.144.208.154):
  192.168.1.230:4800  → ARA (port blocked)
  192.168.1.231:4900  → AB1 (port blocked)
  192.168.1.232:4400  → AB2 (accessible)
  192.168.1.233:4370  → OFFICE_APE (accessible)
  192.168.1.235:4200  → ARC_01 (port blocked)
  192.168.1.236:4201  → ARC_02 (port blocked)

Group 4 — IJL (103.144.211.226):
  → IJL (accessible, single machine)

Group 5 — MILL (103.127.66.32):
  → MILL (accessible, single machine)
```

---

## Notes

1. **OFFICE_APE** dan **ARA** share IP publik sama (103.144.208.154) tapi port berbeda
2. **DME_01 & DME_02** share IP publik sama (103.144.228.42) tapi port berbeda
3. **Scanner code prefix** di userId perlu di-strip sebelum parsing emp_code
4. **9 mesin blocked** butuh konfigurasi firewall/port forwarding
