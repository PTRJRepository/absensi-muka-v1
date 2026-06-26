# Employee Code Parsing Rules — SSOT

## Single Source of Truth

**File**: `src/modules/mapping/zkteco-employee-code-parser.ts`

**KRUSIAL**: Ini adalah SATU-SATUNYA tempat untuk parsing employee code. Tidak boleh ada logic parsing duplikat di tempat lain.

---

## Scanner Prefix Map

Format raw ID dari ZKTeco: `{prefix}{number}`

| Prefix | locCode | Division | Machine | Example Input | Result |
|--------|---------|----------|---------|-------------|--------|
| `001` | L | IJL | IJL | `0010097` | `L0097` |
| `100` | A | P1A | P1A, OFFICE_PGE | `10044` | `A0044` |
| `200` | J | ARC | ARC, ARC_01, ARC_02 | `20015` | `J0015` |
| `300` | B | P1B | P1B | `30232` | `B0232` |
| `400` | H | AB2 | AB2, MILL | `40001` | `H0001` |
| `500` | C | P2A | P2A, P2A_01, P2A_02 | `50040` | `C0040` |
| `600` | D | P2B | P2B | `60010` | `D0010` |
| `700` | E | DME | DME, DME_01, DME_02 | `70088` | `E0088` |
| `800` | F | ARA | ARA, OFFICE_APE | `80001` | `F0001` |
| `900` | G | AB1 | AB1 | `90001` | `G0001` |

---

## Parsing Algorithm

```
INPUT: raw_device_user_id (string)
OUTPUT: ParsedMappingResult

1. TRIM whitespace
2. IF empty → EXCLUDED (no mapping)

3. IF format [A-Z][0-9]{4} (e.g., "A0044", "C0669")
   → USE DIRECTLY as employee code
   → confidence = EXACT

4. IF numeric-only:
   a. IF length ≤ 5 → EXCLUDED (short ID, no auto-mapping)
   b. IF starts with valid scanner prefix (001/100/200/300/400/500/600/700/800/900)
      → Strip 3-digit prefix
      → Take last 4 digits of remaining
      → Pad left with zeros to 4 digits
      → Prepend with locCode
      → confidence = STRONG
   c. ELSE (long numeric without valid prefix) → NONE (needs direct DB lookup)

5. ELSE (non-numeric, non-standard) → EXCLUDED
```

### Step-by-Step Example

**Input**: `5000040`

```
1. Trim → "5000040"
2. Not empty ✓
3. Not [A-Z][0-9]{4} format
4. Numeric-only ✓
5. length = 7 > 5 ✓
6. Starts with "500" ✓ → locCode = "C"
7. Strip "500" → "0040"
8. Take last 4 digits → "0040"
9. Pad left → "0040" (already 4 digits)
10. Prepend locCode "C" → "C0040"
OUTPUT: parsedEmployeeCode = "C0040", confidence = STRONG
```

**Input**: `5000669`

```
1-5. Same process
6. Strip "500" → "0669"
7. Take last 4 → "0669"
8. Pad → "0669"
9. Prepend "C" → "C0669"
OUTPUT: "C0669", confidence = STRONG
```

**Input**: `40` (too short)

```
1-4. Trim, not empty, not standard format, numeric-only
5. length = 2 ≤ 5
OUTPUT: EXCLUDED, allowAutoMap = false
```

---

## ID Length Rules (BR-003)

| Length | Example | Status | Reason |
|--------|---------|--------|--------|
| ≤ 5 digits | `"40"`, `"100"`, `"0040"`, `"669"` | **EXCLUDED** | Too short to parse |
| 5 digits + scanner prefix | `"10040"` | **MAPPED** | Valid: A0040 |
| 6 digits + scanner prefix | `"500040"` | **MAPPED** | Valid: C0040 |
| 7 digits + scanner prefix | `"5000669"` | **MAPPED** | Valid: C0669 |
| > 5 digits, no prefix | `"1234567"` | **NEED_REVIEW** | No scanner prefix, needs DB lookup |

**CRITICAL**: IDs longer than 5 digits that DON'T have a scanner prefix are **EXCLUDED from auto-mapping**. They must go through direct database lookup (exact match or override table).

---

## Name Validation Rules

Mapping tidak boleh hanya berdasarkan angka. Sistem harus membandingkan nama ZKTeco dengan nama HR employee.

### Algorithm

```
validateNameMatch(zktecoName, hrName):
  1. Normalize both names:
     - Uppercase
     - Trim whitespace
     - Collapse multiple spaces to single
     - Remove text inside parentheses () — e.g., "PAIMIN (KIYEM)" → "PAIMIN"
     - Remove non-alphanumeric

  2. Calculate Levenshtein distance
  3. Similarity = 1 - (distance / max_length)

  4. Confidence:
     - similarity >= 0.8  → STRONG_NAME_MATCH (auto-map OK)
     - similarity >= 0.5  → WEAK_NAME_MATCH (map, flag NEED_REVIEW)
     - similarity < 0.5   → NAME_MISMATCH (BLOCK auto-map)
     - no name data      → NO_NAME_DATA (proceed with caution)
```

### Example: PAIMIN vs PANJI ADITIA ROSA

```
zktecoName = "PAIMIN"
hrName = "PANJI ADITIA ROSA"

Normalize:
  "PAIMIN"
  "PANJI ADITIA ROSA"

Levenshtein distance = 16
max_length = 17
similarity = 1 - 16/17 = 0.059 → NAME_MISMATCH (< 0.5)

RESULT: BLOCK auto-mapping. Must be reviewed manually.
```

### Example: SUBHANA NUGRAHA vs SUBHANA NUGRAHA (ROHANA)

```
zktecoName = "SUBHANA NUGRAHA"
hrName = "SUBHANA NUGRAHA (ROHANA)"

Normalize:
  "SUBHANA NUGRAHA"
  "SUBHANA NUGRAHA"

Similarity = 1.0 (identical after stripping parentheses)
RESULT: STRONG_NAME_MATCH — auto-map OK
```

---

## Combined Mapping Flow

```
Input: raw_device_user_id, machineCode, machineLocCode,
       machineScannerCode, zktecoUserName

Step 1: parseZktecoUserIdToEmployeeCode()
        → parsedEmployeeCode, confidence, scannerPrefix

Step 2: IF allowAutoMap = false → UNMAPPED (done)

Step 3: verifyParsedCodeInHrMaster()
        → check if parsedEmployeeCode exists in db_ptrj.HR_EMPLOYEE
        → NOT found → UNMAPPED (done)

Step 4: validateNameMatch(zktecoUserName, hrEmployeeName)
        → NAME_MISMATCH → BLOCK (need manual review)
        → WEAK_NAME_MATCH → allow but flag NEED_REVIEW
        → STRONG_NAME_MATCH → MAPPED

Step 5: Final Confidence
        - EXACT code + STRONG name → EXACT
        - STRONG code + STRONG name → STRONG
        - Any + WEAK/NO_DATA → WEAK
        - NAME_MISMATCH → NEED_REVIEW
```

---

## Parsing Confidence Levels

| Level | Arti | Auto-Map? |
|-------|------|----------|
| `EXACT` | ID already in [A-Z][0-9]{4} format | Yes |
| `STRONG` | Valid scanner prefix + HR master found | Yes |
| `WEAK` | Code found but name weak/no data | Yes (flag review) |
| `NEED_REVIEW` | Name mismatch or ambiguous | No (manual) |
| `NONE` | Not found in HR master | No |
| `EXCLUDED` | Short ID or unsupported format | No |

---

## 3 Places Where Scanner Prefix Map Must Stay In Sync

| File | Variable | Line |
|------|----------|------|
| `src/modules/mapping/zkteco-employee-code-parser.ts` | `SCANNER_PREFIX_MAP` | ~47 |
| `src/modules/employees/employee-mapping.service.ts` | `scannerPrefixLocMap` | ~59 |
| `src/scripts/sync-machines.ts` | `scannerPrefixLocMap` | ~40 |

**Aturan**: Jika menambah scanner prefix baru, update KE 3 file tersebut secara bersamaan.

---

## Test Cases

```
parseZktecoUserIdToEmployeeCode("10044")   → A0044  (EXACT via [A-Z][0-9]{4} check)
parseZktecoUserIdToEmployeeCode("100044")  → A0044  (strip prefix 100 → 0044)
parseZktecoUserIdToEmployeeCode("300232")  → B0232  (strip prefix 300 → 0232)
parseZktecoUserIdToEmployeeCode("40029")   → H0029  (strip prefix 400 → 0029)
parseZktecoUserIdToEmployeeCode("50040")   → C0040  (strip prefix 500 → 0040)
parseZktecoUserIdToEmployeeCode("5000669") → C0669  (strip prefix 500 → 0669)
parseZktecoUserIdToEmployeeCode("600123")  → D0123  (strip prefix 600 → 0123)
parseZktecoUserIdToEmployeeCode("700040")  → E0040  (strip prefix 700 → 0040)
parseZktecoUserIdToEmployeeCode("8000012") → F0012  (strip prefix 800 → 0012)
parseZktecoUserIdToEmployeeCode("9009999") → G9999  (strip prefix 900 → 9999)
parseZktecoUserIdToEmployeeCode("A0044")   → A0044  (already in correct format)
parseZktecoUserIdToEmployeeCode("C0669")   → C0669  (already in correct format)
parseZktecoUserIdToEmployeeCode("40")      → EXCLUDED (length 2)
parseZktecoUserIdToEmployeeCode("669")     → EXCLUDED (length 3)
parseZktecoUserIdToEmployeeCode("0040")    → EXCLUDED (length 4)
parseZktecoUserIdToEmployeeCode("")        → EXCLUDED (empty)

validateNameMatch("PAIMIN", "PANJI ADITIA ROSA")     → NAME_MISMATCH (0.059)
validateNameMatch("SUBHANA NUGRAHA", "SUBHANA NUGRAHA (ROHANA)") → STRONG_NAME_MATCH (1.0)
validateNameMatch("PAIMIN ( KIYEM )", "PAIMIN ( KIYEM )") → STRONG_NAME_MATCH (1.0)
validateNameMatch(null, null) → NO_NAME_DATA
validateNameMatch("JOHN", null) → NO_NAME_DATA
```
