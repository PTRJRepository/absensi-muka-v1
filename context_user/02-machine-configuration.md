# Konfigurasi Lengkap 16 Mesin Absensi

Sumber: `_dev_utils/src/machine-config.ts` (terakhir update 2026-06-15)

## Daftar Mesin

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
| Status | ✅ ACCESSIBLE - ZKTeco confirmed (1,653 users, 19,641 att) |

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
| Status | ✅ ACCESSIBLE - ZKTeco confirmed (569 users, 4,910 att) |

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
| Status | ✅ ACCESSIBLE - ZKTeco confirmed (1,084 users, 9,820 att) |

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
| Status | ✅ ACCESSIBLE - ZKTeco confirmed (166 users, 8,007 att) |

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
| Status | ✅ ACCESSIBLE - ZKTeco confirmed (233 users, 3,962 att) |

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
| Status | ✅ ACCESSIBLE - ZKTeco confirmed (792 users, 2,739 att) |

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
| Status | ✅ ACCESSIBLE - ZKTeco confirmed (792 users, 2,737 att) |

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
| Status | ❌ PORT_BLOCKED - needs firewall config |

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
| Status | ❌ PORT_BLOCKED - needs firewall config |

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
| Status | ❌ PORT_BLOCKED - needs firewall config |

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
| Status | ❌ PORT_BLOCKED - needs firewall config |

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
| Status | ❌ PORT_BLOCKED - same IP as OFFICE_APE but different port |

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
| Status | ❌ PORT_BLOCKED - needs firewall config |

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
| Status | ❌ NETWORK_UNREACHABLE - needs router config |

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
| Status | ❌ NETWORK_UNREACHABLE - needs router config |

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
| Status | ❌ NETWORK_UNREACHABLE - needs router config |

---

## Mapping Scanner Code → LocCode

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

## Employee Code (emp_code) Format

Format: `{locCode}{last 4 digits of userId}`

### Contoh Konversi

| Machine | locCode | userId Input | Parsing | emp_code Result |
|---------|---------|--------------|---------|----------------|
| P1A | A | "10044" | last 4 = "0044" | "A0044" |
| P1A | A | "50001" | last 4 = "0001" (strip scanner prefix) | "A0001" |
| P1B | B | "30232" | last 4 = "0232" | "B0232" |
| IJL | L | "L0015" | already formatted | "L0015" |
| AB2 | H | "40029" | last 4 = "0029" | "H0029" |

### Logic Implementation

```typescript
function userIdToEmpCode(userId: string | number, locCode: string): string {
  const id = String(userId);

  // If already formatted (e.g., "A0044")
  if (/^[A-Z]\d+$/.test(id)) {
    return id;
  }

  // Extract last 4 digits, stripping scanner code prefix if present
  const last4Match = id.match(/\d{1,4}$/);
  if (last4Match) {
    const numPart = last4Match[0].padStart(4, '0');
    return `${locCode}${numPart}`;
  }

  return `${locCode}${id}`;
}
```

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

## Catatan Penting

1. **P1A & P1B ADALAH ZKTeco devices** - bukan "NON_ZKTECO" seperti yang tertulis di dokumentasi lama
2. **OFFICE_APE** dan **ARA** share IP publik sama (103.144.208.154) tapi port berbeda
3. **DME_01 & DME_02** share IP publik sama (103.144.228.42) tapi port berbeda
4. **Scanner code prefix** di userId perlu di-strip sebelum parsing emp_code
5. **Database:** `rebinmas_absensi_monitoring` - NOT `extend_db_ptrj`
6. **No Gateway** - Semua operasi gunakan direct MSSQL connection
