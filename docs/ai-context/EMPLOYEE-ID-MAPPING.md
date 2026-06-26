# Employee ID Mapping Documentation

## Table of Contents
1. [Overview](#overview)
2. [ID Classification: Short vs Long](#id-classification-short-vs-long)
3. [Scanner Code System](#scanner-code-system)
4. [LocCode System](#loccode-system)
5. [Employee Code Parsing Algorithm](#employee-code-parsing-algorithm)
6. [db_ptrj Lookup Flow](#db_ptrj-lookup-flow)
7. [Complete Flow Diagram](#complete-flow-diagram)
8. [HR_* Tables in db_ptrj](#hr_-tables-in-db_ptrj)
9. [Known Issues and Fixes](#known-issues-and-fixes)

---

## Overview

Sistem absensi Rebinmas menggunakan **dual database**:
- **`db_ptrj`** (source of truth): Database HR dari server `DESKTOP-U5GUJPG`
- **`rebinmas_absensi_monitoring`** (local): Database aplikasi absensi

**Flow utama (post-2026-06-23):**
```
raw_device_user_id → Parse → employee_code (parsed)
                            │
                            ▼
                      Lookup NIK via db_ptrj
                            │
                            ▼
                      current_emp_code (latest from HR via NIK)
                            │
                            ▼
                      Canonical employee (for reports/attendance_imports)
```

**Convention global (WAJIB diterapkan ke SEMUA):**
1. **`employees` table = SSOT** — satu tabel untuk semua data employee identity
2. **Short ID (≤5 digits tanpa prefix)**: `EXCLUDED`, tidak diparse
3. **Long ID (>5 digits)**: diparse dengan scanner prefix → `{locCode}{last4}`
4. **`current_emp_code`** = employee code terbaru dari HR (via NIK)
5. **`nik`** = kunci stabil untuk tracking employee across code changes

---

## ID Classification: Short vs Long

### Short ID (≤5 digits)
- **Contoh**: `44`, `123`, `10044`
- **Status**: `EXCLUDED` - tidak diparse secara otomatis
- **Alasan**: Too short untuk mengandung scanner prefix yang reliable
- **Handling**: Manual review atau card-based mapping

### Long ID (>5 digits)
- **Contoh**: `5000040`, `7000088`, `100123456`
- **Status**: Proses parsing sesuai scanner prefix
- **Handling**: Parse → Lookup db_ptrj

### ID Length Rules (BR-003)

| Length | Example | Status | Action |
|--------|---------|--------|--------|
| 5 digits | `10044` | **LONG** | Parse dengan prefix 100 |
| >5 digits | `5000040` | **LONG** | Parse dengan prefix 500 |
| >5 digits (no prefix) | `1234567890` | **LONG** | Exact lookup required |
| <5 digits | `44` | **SHORT** | EXCLUDED |
| 5 digits (no prefix) | `00044` | **SHORT** | EXCLUDED |

> **Important**: 5 digits AMAN untuk auto-mapping jika memiliki scanner prefix. Tanpa prefix, tidak bisa diparse.

---

## Scanner Code System

Scanner code adalah **3 digit prefix** yang embedded di raw device user ID, berfungsi untuk mengidentifikasi mesin asal employee.

### Scanner Prefix → LocCode Mapping (10 prefixes)

| Scanner Prefix | LocCode | Division | Contoh Input | Employee Code |
|----------------|---------|---------|--------------|---------------|
| `001` | L | IJL | `0010040` | L0040 |
| `100` | A | P1A | `1000040` | A0040 |
| `200` | J | ARC | `2000040` | J0040 |
| `300` | B | P1B | `3000040` | B0040 |
| `400` | H | AB2/MILL | `4000040` | H0040 |
| `500` | C | P2A | `5000040` | C0040 |
| `600` | D | P2B | `6000040` | D0040 |
| `700` | E | DME | `7000040` | E0040 |
| `800` | F | ARA | `8000040` | F0040 |
| `900` | G | AB1 | `9000040` | G0040 |

### Scanner Code Detection Algorithm

```typescript
// Dari: src/modules/mapping/zkteco-employee-code-parser.ts

const SCANNER_PREFIX_MAP: Record<string, string> = {
  '001': 'L',  // IJL
  '100': 'A', // P1A
  '200': 'J', // ARC
  '300': 'B', // P1B
  '400': 'H', // AB2/MILL
  '500': 'C', // P2A
  '600': 'D', // P2B
  '700': 'E', // DME
  '800': 'F', // ARA
  '900': 'G', // AB1
};

function parseWithScannerPrefix(rawId: string): string {
  const prefix = rawId.substring(0, 3);    // Ambil 3 digit pertama
  const locCode = SCANNER_PREFIX_MAP[prefix];  // Map ke locCode
  const suffix = rawId.substring(3);      // Sisa digits
  const paddedSuffix = suffix.padStart(4, '0'); // Pad ke 4 digits
  return locCode + paddedSuffix;
}

// Contoh:
// parseWithScannerPrefix("5000040") → "C0040"
// parseWithScannerPrefix("50040") → "C0040" (padding)
// parseWithScannerPrefix("7000088") → "E0088"
```

### Scanner Code Source

Di database `rebinmas_absensi_monitoring`:
```sql
SELECT machine_code, scanner_code, loc_code
FROM attendance_machines
WHERE scanner_code IS NOT NULL;
```

---

## LocCode System

LocCode adalah **1 huruf** yang merepresentasikan divisi/lokasi dan menjadi prefix employee code.

### LocCode → Division Mapping

| LocCode | Division Code | Division Name | Employee Code Format |
|---------|--------------|--------------|---------------------|
| A | P1A | Pabrik 1 A | Axxxx |
| B | P1B | Pabrik 1 B | Bxxxx |
| C | P2A | Pabrik 2 A | Cxxxx |
| D | P2B | Pabrik 2 B | Dxxxx |
| E | DME | Dwikarya Estate | Exxxx |
| F | ARA | ARA Estate | Fxxxx |
| G | AB1 | Aerial Base 1 | Gxxxx |
| H | AB2 | Aerial Base 2 | Hxxxx |
| J | ARC | Arc Estate | Jxxxx |
| L | IJL | IJL Mill | Lxxxx |

> **Note**: Huruf I, K, M tidak digunakan untuk menghindari confusion dengan angka 1, tidak ada ARE (Astra RE).

### Employee Code Format

**Format**: `{LocCode}{4-digit number}`

| Component | Description | Example |
|-----------|-------------|---------|
| LocCode | 1 huruf prefix | A, B, C, ... L |
| Number | 4 digit, zero-padded | 0001, 0044, 0232 |

**Contoh**:
- `A0044` → LocCode=A, Number=44
- `E0088` → LocCode=E, Number=88
- `C0001` → LocCode=C, Number=1

---

## Employee Code Parsing Algorithm

**SSOT (Single Source of Truth)**: `src/modules/mapping/zkteco-employee-code-parser.ts`

### Algorithm Flowchart

```
raw_device_user_id
        │
        ├── Empty/null → EXCLUDED
        │
        ├── Already [A-Z]\d{4}?
        │       ├── YES → Return as-is (EXACT)
        │       └── NO ↓
        │
        ├── Numeric only?
        │       ├── YES → parseNumericUserId()
        │       └── NO → EXCLUDED
        │
        └── parseNumericUserId():
                │
                ├── Length ≤ 5?
                │       └── YES → EXCLUDED (SHORT)
                │
                └── Length > 5?
                        │
                        ├── Has scanner prefix (100/200/.../900)?
                        │       ├── YES → parseWithScannerPrefix()
                        │       │         Return {locCode}{4digits}
                        │       └── NO → NONE (needs exact lookup)
                        │
                        └── Has scanner prefix (001)?
                                └── YES → parseWithScannerPrefix()
                                          Return {locCode}{4digits}
```

### Parsing Examples

| Raw ID | Length | Scanner Prefix | Parsed Code | Confidence |
|--------|--------|---------------|-------------|------------|
| `A0044` | 5 | N/A | A0044 | EXACT |
| `5000040` | 7 | 500→C | C0040 | STRONG |
| `50040` | 5 | 500→C | C0040 | STRONG |
| `7000088` | 7 | 700→E | E0088 | STRONG |
| `44` | 2 | N/A | EXCLUDED | - |
| `10044` | 5 | 100→A | A0044 | STRONG |
| `0010040` | 7 | 001→L | L0040 | STRONG |
| `12345` | 5 | None | EXCLUDED | - |
| `1234567890` | 10 | None | NONE | - |

### Code Implementation

```typescript
// src/modules/mapping/zkteco-employee-code-parser.ts

export interface ParseResult {
  employeeCode: string | null;
  locCode: string | null;
  confidence: MappingConfidence;
  status: MappingStatus;
  allowAutoMap: boolean;
  rule: string;
}

export function parseZktecoUserIdToEmployeeCode(
  input: ZktecoUserIdInput
): ParseResult {
  const { zktecoUserId } = input;

  // 1. Empty check
  if (!zktecoUserId || zktecoUserId.trim() === '') {
    return { status: 'EXCLUDED', allowAutoMap: false, ... };
  }

  // 2. Already in [A-Z]\d{4} format
  if (/^[A-Z]\d{4}$/.test(zktecoUserId)) {
    return { employeeCode: zktecoUserId, confidence: 'EXACT', ... };
  }

  // 3. Numeric only
  if (/^\d+$/.test(zktecoUserId)) {
    return parseNumericUserId(zktecoUserId);
  }

  // 4. Non-standard format
  return { status: 'EXCLUDED', allowAutoMap: false, ... };
}

function parseNumericUserId(rawId: string): ParseResult {
  // Short ID - EXCLUDED
  if (rawId.length <= 5) {
    return {
      status: 'EXCLUDED',
      confidence: 'NONE',
      allowAutoMap: false,
      rule: 'RAW_ID_TOO_SHORT_EXCLUDED',
    };
  }

  const prefix = rawId.substring(0, 3);

  // Has scanner prefix
  if (SCANNER_PREFIX_MAP[prefix]) {
    return parseWithScannerPrefix(rawId, prefix);
  }

  // Long ID without prefix - needs exact lookup
  return {
    status: 'NONE',
    confidence: 'NONE',
    allowAutoMap: false,
    rule: 'LONG_RAW_ID_NO_PREFIX',
  };
}

function parseWithScannerPrefix(rawId: string, prefix: string): ParseResult {
  const locCode = SCANNER_PREFIX_MAP[prefix];
  const suffix = rawId.substring(3);
  const paddedSuffix = suffix.padStart(4, '0');
  const employeeCode = locCode + paddedSuffix;

  return {
    employeeCode,
    locCode,
    confidence: 'STRONG',
    status: 'MAPPED',
    allowAutoMap: true,
    rule: `SCANNER_PREFIX_${prefix}_${locCode}`,
  };
}
```

---

## db_ptrj Lookup Flow

### Overview

Setelah raw ID diparse menjadi employee code, langkah berikutnya adalah **lookup ke db_ptrj.HR_EMPLOYEE** untuk validasi dan mendapatkan informasi karyawan.

### Lookup Flow

```
Parsed Employee Code (e.g., "C0040")
        │
        ▼
┌─────────────────────────────────────────┐
│ 1. Load employee_codes dari employees   │
│    table ke memory (Set<string>)        │
│                                         │
│    FROM employees                       │
│    WHERE employee_code = 'C0040'        │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ 2. verifyParsedCodeInHrMaster()          │
│                                         │
│    verifyParsedCodeInHrMaster(           │
│      parsedCode: "C0040",               │
│      hrEmployeeCodes: Set {"A0044",...} │
│    ):                                   │
│      return hrEmployeeCodes.has("C0040") │
└─────────────────────────────────────────┘
        │
        ├── EXISTS → CONFIRMED (canonical employee)
        │
        └── NOT EXISTS → NEED_REVIEW
```

### HR Verification Code

```typescript
// src/modules/mapping/zkteco-employee-code-parser.ts

export function verifyParsedCodeInHrMaster(
  parsedCode: string | null,
  hrEmployeeCodes: Set<string>
): { exists: boolean; confidence: MappingConfidence } {
  if (!parsedCode) {
    return { exists: false, confidence: 'NONE' };
  }

  const exists = hrEmployeeCodes.has(parsedCode);

  return {
    exists,
    confidence: exists ? 'EXACT' : 'NONE',
  };
}
```

### HR Employee Codes Pre-loading

```typescript
// src/modules/employees/employee-mapping.service.ts

async loadAllEmployeeCodes(): Promise<Set<string>> {
  const result = await query<{ employee_code: string }>(`
    SELECT employee_code FROM employees WHERE is_active = 1
  `);

  return new Set(result.map(r => r.employee_code));
}
```

### Conversion with Lookup (Primary Method)

```typescript
// src/modules/employees/employee-mapping.service.ts

async convertDeviceUserIdToEmpCodeWithLookup(
  rawUserId: string,
  machineLocCode?: string,
  scannerCode?: number,
  employeeCodes?: Set<string>
): Promise<EmployeeMapping | null> {

  // Step 1: Parse raw ID
  const parseResult = parseZktecoUserIdToEmployeeCode({
    zktecoUserId: rawUserId,
    machineLocCode,
    scannerCode,
  });

  if (!parseResult.allowAutoMap) {
    return null;
  }

  // Step 2: Verify against HR master
  if (employeeCodes) {
    const verification = verifyParsedCodeInHrMaster(
      parseResult.employeeCode,
      employeeCodes
    );

    if (!verification.exists) {
      return null;  // NOT_FOUND
    }
  }

  // Step 3: Return mapping
  return {
    employeeCode: parseResult.employeeCode!,
    locCode: parseResult.locCode!,
    confidence: verification.confidence,
    rule: parseResult.rule,
  };
}
```

### Async Conversion with DB Verification

```typescript
// src/modules/employees/employee-mapping.service.ts

async convertDeviceUserIdToEmpCodeAsync(
  rawUserId: string,
  machineLocCode?: string,
  scannerCode?: number,
  machineCode?: string
): Promise<EmployeeMapping | null> {

  // Step 1: Parse raw ID
  const parseResult = parseZktecoUserIdToEmployeeCode({
    zktecoUserId: rawUserId,
    machineLocCode,
    scannerCode,
  });

  if (!parseResult.allowAutoMap) {
    return null;
  }

  // Step 2: Verify against employees table
  if (parseResult.allowAutoMap && parseResult.employeeCode) {
    const verified = await this.verifyEmpCodeExists(
      parseResult.employeeCode
    );

    if (verified.exists) {
      return {
        employeeCode: parseResult.employeeCode,
        locCode: parseResult.locCode!,
        confidence: verified.confidence,
        rule: parseResult.rule,
      };
    }

    // Step 3: Fallback - exact lookup for long IDs without prefix
    const directMapping = await this.resolveDirectDatabaseEmployeeCode(
      rawUserId
    );

    if (directMapping) {
      return directMapping;
    }
  }

  return null;
}

async verifyEmpCodeExists(empCode: string): Promise<VerificationResult> {
  const result = await query<{ employee_code: string }>(`
    SELECT employee_code
    FROM employees
    WHERE employee_code = @code AND is_active = 1
  `, [{ name: 'code', type: sql.NVarChar, value: empCode }]);

  return {
    exists: result.length > 0,
    confidence: result.length > 0 ? 'EXACT' : 'NONE',
  };
}
```

---

## Complete Flow Diagram

### Sync Orchestrator Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ZKTECO MACHINE SYNC FLOW                            │
└─────────────────────────────────────────────────────────────────────────┘

1. FETCH USERS FROM MACHINE
   └── zktecoService.fetchUsers()
           ↓
2. EXTRACT RAW USER ID
   └── pickAbsensiId() → longest ID dari (deviceUserId, userId, uid, id)
           ↓
3. PRE-LOAD HR EMPLOYEE CODES
   └── employeeMappingService.loadAllEmployeeCodes()
           ↓
4. PARSE RAW ID → EMPLOYEE CODE (SSOT)
   └── parseZktecoUserIdToEmployeeCode()
           │
           ├── Short ID (≤5) → EXCLUDED
           │
           ├── Long ID with scanner prefix → {locCode}{4digits}
           │
           └── Long ID without prefix → NONE (needs exact lookup)
           ↓
5. VERIFY AGAINST HR MASTER
   └── verifyParsedCodeInHrMaster()
           │
           ├── FOUND → MAPPED (confidence: EXACT/STRONG)
           │
           └── NOT FOUND → NEED_REVIEW
           ↓
6. STORE TO DATABASE
   ├── machine_user_raw → raw device user
   ├── machine_user_map → parsed employee code
   └── employees → canonical employee (upsert)
           ↓
7. FETCH ATTENDANCE RECORDS
   └── zktecoService.fetchAttendanceRecords()
           ↓
8. PROCESS ATTENDANCE
   ├── Extract raw_device_user_id
   ├── Parse → Verify → Map
   └── Store to attendance_scan_logs
           ↓
9. POST-PROCESS ATTENDANCE
   └── attendanceProcessService.processScanLogsForBatch()
           │
           └── Convert scan logs → attendance_imports
               (group by employee + date + machine)
```

### Complete Lookup Decision Tree

```
raw_device_user_id
        │
        ├── Is empty/null?
        │       └── YES → INVALID (no processing)
        │
        ├── Is already [A-Z]\d{4}?
        │       ├── YES → Lookup db_ptrj.HR_EMPLOYEE
        │       │         │
        │       │         ├── EXISTS → ACTIVE (MAPPED)
        │       │         │
        │       │         └── NOT EXISTS → NEED_REVIEW
        │       │
        │       └── NO ↓
        │
        ├── Is numeric only?
        │       │
        │       ├── Length ≤ 5?
        │       │       └── YES → EXCLUDED (SHORT_ID)
        │       │
        │       ├── Length > 5, has scanner prefix?
        │       │       └── YES → Parse (e.g., 5000040 → C0040)
        │       │                 └── Lookup db_ptrj
        │       │
        │       └── Length > 5, no prefix?
        │               └── YES → Exact lookup required
        │                         (fallback to direct DB search)
        │
        └── Non-standard format?
                └── YES → EXCLUDED (INVALID_FORMAT)
```

---

## HR_* Tables in db_ptrj

### Source Database

```
Server: DESKTOP-U5GUJPG
Database: DB_PTRJ
```

### HR_EMPLOYEE Table

**Source**: `DB_PTRJ.dbo.HR_EMPLOYEE`

```sql
-- Schema (estimated based on usage)
SELECT
    RTRIM(EmpCode)     AS emp_code,      -- Employee code (e.g., 'A0044')
    RTRIM(EmpName)      AS emp_name,      -- Employee name
    RTRIM(LocCode)     AS loc_code,      -- Location/Division code
    RTRIM(Status)      AS status        -- '1' = Active, '4' = ?
FROM DB_PTRJ.dbo.HR_EMPLOYEE
WHERE Status = '1';  -- Active employees only
```

### Sync to Local Database

```sql
-- migrations/018_sync_employees_from_hr.sql

MERGE INTO employees AS target
USING (
  SELECT
    RTRIM(EmpCode) AS emp_code,
    RTRIM(EmpName) AS emp_name,
    RTRIM(LocCode) AS loc_code
  FROM [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE
  WHERE Status = '1'
) AS source ON target.employee_code = source.emp_code
WHEN MATCHED THEN
  UPDATE SET
    employee_name = source.emp_name,
    division_id = (SELECT TOP 1 id FROM divisions WHERE division_code = source.loc_code),
    is_active = 1,
    updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
  INSERT (
    employee_code, employee_name, division_id, gang_id,
    employment_status, is_active, created_at
  ) VALUES (
    source.emp_code, source.emp_name,
    (SELECT TOP 1 id FROM divisions WHERE division_code = source.loc_code),
    NULL, 'ACTIVE', 1, SYSUTCDATETIME()
  );
```

---

## Local Database Tables (Post-2026-06-23)

### Arsitektur 3-Layer

```
Layer 1 — RAW:
├── attendance_machines          → config mesin ZKTeco
├── attendance_scan_logs        → raw scan dari mesin (immutable)
└── hr_employee_current_snapshot → NIK → EmpCode terbaru dari db_ptrj

Layer 2 — MASTER (SSOT):
└── employees                  → SATU tabel semua data employee identity

Layer 3 — PROCESSED:
├── attendance_imports           → check_in/out per employee per hari
├── attendance_import_batches   → batch audit trail
└── employee_code_history       → riwayat EmpCode per NIK
```

### employees Table (SSOT — 44 kolom)

**Database**: `rebinmas_absensi_monitoring`
**Purpose**: Single Source of Truth untuk semua data employee identity
**Rows**: 1,866 (2026-06-23)

| Kolom | Type | Description |
|-------|------|-------------|
| `id` | INT PK | Auto-increment |
| `employee_code` | NVARCHAR(30) | Kode hasil parsing (historical) |
| `current_emp_code` | NVARCHAR(30) | Kode terbaru dari HR (via NIK) |
| `nik` | NVARCHAR(50) | NIK/NewICNo dari HR |
| `employee_name` | NVARCHAR(150) NULL | Nama employee |
| `parsed_employee_code` | NVARCHAR(30) NULL | Hasil SSOT parser |
| `raw_device_user_id` | NVARCHAR(100) NULL | ID asli dari mesin ZKTeco |
| `zkteco_user_name` | NVARCHAR(150) NULL | Nama di mesin |
| `current_emp_name` | NVARCHAR(150) NULL | Nama terbaru dari HR |
| `machine_codes` | NVARCHAR(500) NULL | "P1A,P1B,ARC_01" |
| `nik` | NVARCHAR(50) NULL | NIK dari HR (stabil) |
| `mapping_status` | NVARCHAR(30) NULL | MAPPED / UNMAPPED / NEED_REVIEW |
| `hr_verified` | BIT | Sudah diverifikasi HR |
| `is_active` | BIT | Active flag |

Indexes baru (migration 056):
- `IX_employees_nik`
- `IX_employees_current_emp_code`
- `IX_employees_raw_device_user_id`
- `IX_employees_parsed_employee_code`
- `IX_employees_mapping_status`

### hr_employee_current_snapshot Table

**Database**: `rebinmas_absensi_monitoring`
**Purpose**: NIK → EmpCode terbaru dari db_ptrj (snapshot, tidak diubah)
**Sync**: `src/modules/employees/hr-current-snapshot.service.ts`

### employee_code_history Table

**Purpose**: Riwayat semua EmpCode per NIK

---

## Identity Resolution Cascade (SSOT)

```
raw_device_user_id masuk
    │
    ├── employee_mapping_overrides? ──→ MANUAL (priority 1)
    │
    ├── employees.raw_device_user_id exact match? ──→ EXACT_MATCH
    │
    ├── employees.parsed_employee_code found? ──→ PARSED_CANDIDATE
    │         │
    │         └── Lookup NIK via db_ptrj.HR_EMPLOYEE
    │                   │
    │                   └── hr_employee_current_snapshot.nik
    │                             │
    │                             ▼
    │                   Ambil EmpCode terbaru (Status='1', UpdateDate DESC)
    │                             │
    │                             ▼
    │                   current_emp_code → attendance_imports / reports
    │
    ├── Panjang > 5 digits tanpa prefix? ──→ NEED_REVIEW
    │
    └── Fallback ──→ NEED_REVIEW
```

---

## DEPRECATED / DROPPED Tables (2026-06-23)

| Table | Status | Notes |
|-------|--------|-------|
| `zkteco_absensi_user_registry` | **DROPPED** | Data dipindahkan ke `employees` |
| `employee_machine_enrollments` | **DROPPED** | Data di `employees.machine_codes` |
| `zkteco_absensi_user_machine` | **DROPPED** | Orphan FK |
| `zkteco_hr_employee_map` | **DROPPED** | Tidak diperlukan lagi |
| `machine_user_map` | Deprecated | Cache lama, tidak dipakai |
| `attendance_imports_old` | **DROPPED** | Archive lama |
| `employee_hr_sync_audit` | **DROPPED** | Archive lama |

### attendance_scan_logs Table

**Database**: `rebinmas_absensi_monitoring`
**Purpose**: Raw attendance scan records

```sql
-- Migration 002
CREATE TABLE attendance_scan_logs (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  machine_id INT NULL,                         -- FK to attendance_machines
  machine_code NVARCHAR(30) NOT NULL,
  raw_device_user_id NVARCHAR(100) NOT NULL,   -- Raw ID from machine
  raw_user_sn NVARCHAR(100) NULL,
  raw_record_time DATETIME2 NOT NULL,
  raw_ip NVARCHAR(64) NULL,
  parsed_employee_code NVARCHAR(30) NULL,      -- Result of parsing
  parsed_division_code NVARCHAR(20) NULL,
  mapping_status NVARCHAR(30) NOT NULL DEFAULT 'NEED_REVIEW',
  mapping_reason NVARCHAR(500) NULL,
  scan_time DATETIME2 NOT NULL,
  scan_date DATE NOT NULL,
  event_type NVARCHAR(50) NULL,
  verify_type NVARCHAR(50) NULL,
  work_code NVARCHAR(50) NULL,
  sync_batch_id BIGINT NULL,                   -- FK to attendance_import_batches
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_scan_logs_machine FOREIGN KEY (machine_id) REFERENCES attendance_machines(id)
);
```

---

## Known Issues and Fixes (Post-2026-06-23)

### Issue 1: Scanner Prefix 001 — NOW FIXED
**Fix (2026-06-22)**: Migration `034_fix_001_ijl_need_review.sql` applied.
SSOT parser di `zkteco-employee-code-parser.ts` sudah memiliki prefix `001 → L`.

### Issue 2: employee_mapping_overrides Table — NOW EXISTS
**Fix**: Table sudah ada di database. Dipakai untuk manual override mapping.

### Issue 3: Cross-Location Contamination
**Fix (2026-06-22)**: Migration `040_fix_cross_location_contamination.sql` applied.

### Issue 4: Dual Schema Confusion — NOW SIMPLIFIED
**Fix (2026-06-23)**: Simplifikasi arsitektur. Semua employee identity di SATU tabel `employees`.

### Current Known Issues (2026-06-23)
Lihat `docs/BUGS-FIXES.md` untuk daftar 22 isu kritis/high/medium/low.

---

## Confidence Levels

| Confidence | Meaning | Action |
|------------|---------|--------|
| EXACT | Code already in correct format, found in HR | Auto-map |
| STRONG | Parsed with scanner prefix, found in HR | Auto-map |
| WEAK | Found in HR but name mismatch | Map with review |
| NONE | Not found in HR | Need review |
| EXCLUDED | Explicitly excluded (short ID, invalid format) | Manual mapping |

---

## Appendix: Migration Scripts Reference (Key Migrations)

| Migration | File | Purpose |
|-----------|------|---------|
| 034 | `034_fix_001_ijl_need_review.sql` | Fix IJL (001) prefix mapping |
| 040 | `040_fix_cross_location_contamination.sql` | Fix cross-location issues |
| 042 | `042_short_long_id_sanitization.sql` | BR-003 enforcement (≤5=SHORT→EXCLUDED) |
| 043 | `043_create_hr_current_snapshot.sql` | Create NIK → EmpCode snapshot table |
| 044 | `044_create_employee_code_history.sql` | EmpCode history per NIK |
| 055 | `055_backfill_employees_current_emp_code.sql` | Backfill current_emp_code from HR snapshot |
| 056 | `056_merge_and_simplify_employee_tables.sql` | Drop old tables, merge registry→employees |

---

*Document Version: 2.0*
*Last Updated: 2026-06-23*
*SSOT: `src/modules/mapping/zkteco-employee-code-parser.ts`*
