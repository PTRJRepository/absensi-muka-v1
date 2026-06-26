# Code Patterns — Important Patterns & Conventions

---

## 1. SSOT Parser — Single Source of Truth

**File**: `src/modules/mapping/zkteco-employee-code-parser.ts`

Ini SATU-SATUNYA tempat parsing employee code. Tidak boleh ada logic parsing duplikat.

```typescript
import {
  parseZktecoUserIdToEmployeeCode,
  validateNameMatch,
  verifyParsedCodeInHrMaster,
} from '../mapping/zkteco-employee-code-parser';

// ✅ BENAR — gunakan SSOT parser
const result = parseZktecoUserIdToEmployeeCode({
  zktecoUserId: rawId,
  machineLocCode: machineLocCode ?? null,
  machineScannerCode: machineScannerCode ?? null,
});

// ❌ SALAH — jangan buat parser baru di tempat lain
const empCode = locCode + last4digits(rawId); // DUPLICATE LOGIC!
```

---

## 2. Database Query Pattern

**Primary**: `src/lib/db.ts` (Direct MSSQL)

```typescript
import { query, sql, withTransaction } from '../lib/db';

// Simple query
const results = await query<{ employee_code: string }>(
  `SELECT employee_code FROM employees WHERE is_active = 1`
);

// With parameters
const results = await query<any>(
  `SELECT * FROM table WHERE col = @paramName`,
  [{ name: 'paramName', type: sql.NVarChar, value: 'value' }]
);

// Transaction
const result = await withTransaction(async (tx) => {
  await tx.request().query(`INSERT INTO table VALUES (@val)`, [{ name: 'val', ... }]);
  return something;
});
```

---

## 3. Sync Orchestrator Pattern

```typescript
async function syncMachine(machine: Machine) {
  // 1. Load employee codes + names into memory (call once per batch)
  const employeeCodes = await this.employeeMappingService.loadAllEmployeeCodes();
  const employeeNames = await this.employeeMappingService.loadAllEmployeeNames();
  const employeeNameLookup = (code: string) => employeeNames.get(code) ?? null;

  // 2. Sync users
  for (const user of users) {
    const result = this.employeeMappingService.convertDeviceUserIdToEmpCodeWithLookup(
      rawUserId,       // device user ID
      locCode,         // machine loc code
      scannerCode,     // machine scanner code
      employeeCodes,    // Set<string> from DB
      userName || undefined,  // ZKTeco user name
      employeeNameLookup      // (code) => name
    );
    // ...
  }
}
```

---

## 4. SSOT Parser Integration Pattern

**File**: `src/modules/employees/employee-mapping.service.ts`

```typescript
convertDeviceUserIdToEmpCodeWithLookup(
  deviceUserId: string,
  machineLocCode: string | undefined,
  machineScannerCode: number | undefined,
  employeeCodes: Set<string>,        // from loadAllEmployeeCodes()
  zktecoUserName: string | undefined, // from ZKTeco user enrollment
  employeeNameLookup: (empCode: string) => string | null  // from loadAllEmployeeNames()
): { empCode: string; confidence: number; rule: string } | null
```

**Returns**: `null` if:
- Short ID (< 5 digit)
- Parsed code not found in HR master
- Name mismatch (PAIMIN vs PANJI ADITIA ROSA → BLOCKED)

---

## 5. SSE Event Publishing Pattern

```typescript
// src/lib/realtime-emitter.ts

// Publish events from anywhere in the app
import { publishSyncStarted, publishSyncCompleted, publishQualityAlert } from '../lib/realtime-emitter';

publishSyncStarted('P1A', batchId);
publishSyncCompleted('P1A', batchId, { users: 5, attendance: 120 });

// Subscribe from frontend
const es = new EventSource('/api/realtime/events');
es.addEventListener('sync.completed', (e) => {
  const { machineCode, batchId } = JSON.parse(e.data);
  console.log(`${machineCode} sync done: ${batchId}`);
});
```

---

## 6. ZKTeco Machine Sync Pattern

```typescript
import ZKLib from 'node-zklib';

async function syncMachine(ip: string, port: number, machineCode: string) {
  const zk = new ZKLib(ip, port, 30000, 4000, '12345');

  try {
    await zk.createSocket();
    await zk.disableDevice();

    const usersResult = await zk.getUsers();
    const attResult = await zk.getAttendances();

    if (usersResult.err) throw usersResult.err;
    if (attResult.err) throw attResult.err;

    const users = usersResult.data || [];
    const attendances = attResult.data || [];

    // Process...
  } finally {
    await zk.enableDevice();
    await zk.disconnect();
  }
}
```

---

## 7. Route Registration Pattern

**Custom router — NOT Express:**

```typescript
// src/api/routes/attendance.routes.ts
import { route, sendJson, sendError } from '../router';

// Parameterized query with mssql types
import { query, sql } from '../../lib/db';

route('GET', '/api/attendance/monthly-matrix', async (ctx) => {
  const { year, month, division } = ctx.query;

  const rows = await query<MonthlyMatrixRow>(`
    SELECT
      e.employee_code,
      e.employee_name,
      d.attendance_date,
      d.attendance_status
    FROM attendance_imports d
    JOIN employees e ON e.employee_code = d.employee_code
    WHERE YEAR(d.attendance_date) = @year
      AND MONTH(d.attendance_date) = @month
    ${division ? 'AND e.division_code = @division' : ''}
  `, [
    { name: 'year', type: sql.Int, value: parseInt(year) },
    { name: 'month', type: sql.Int, value: parseInt(month) },
    ...(division ? [{ name: 'division', type: sql.NVarChar, value: division }] : []),
  ]);

  sendJson(ctx.res, 200, { data: rows });
});

// Error handling
route('GET', '/api/machines/:code', async (ctx) => {
  const { code } = ctx.params;
  const machine = await findMachine(code);
  if (!machine) {
    return sendError(ctx.res, 404, 'MACHINE_NOT_FOUND', `Machine ${code} not found`);
  }
  sendJson(ctx.res, 200, { data: machine });
});
```

---

## 8. Machine Code → locCode Pattern

```typescript
// Machine code selalu uppercase, di-normalisasi sebelum lookup
const normalizedMachineCode = machineCode?.trim().toUpperCase();
const locCode = machineCodeLocMap[normalizedMachineCode] ?? null;

// Atau dengan explicit override
const explicitLoc = machineLocCode?.trim().toUpperCase();
if (explicitLoc) return explicitLoc;
return machineCodeLocMap[normalizedMachineCode] ?? null;
```

---

## 9. Attendance Status Determination

```typescript
function determineAttendanceStatus(scans: ScanRecord[]): string {
  if (scans.length === 0) return 'TIDAK_HADIR';
  if (scans.length === 1) {
    const scan = scans[0];
    const hour = new Date(scan.scan_time).getHours();
    if (hour < 12) return 'NO_CHECKOUT';
    return 'INCOMPLETE_SCAN';
  }
  return 'HADIR';
}
```

---

## 10. React Query Pattern (Frontend)

```typescript
// Frontend: api client with auth
import { api } from '../lib/api';

// API call with type
const data = await api<AttendanceResponse>('/api/attendance/monthly-matrix', {
  params: { year: 2026, month: 6 },
});

// React Query hook
function useMonthlyMatrix(year: number, month: number) {
  return useQuery({
    queryKey: ['attendance', 'monthly', year, month],
    queryFn: () => api<MonthlyMatrixResponse>(
      `/api/attendance/monthly-matrix?year=${year}&month=${month}`
    ),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

---

## 11. Scanner Prefix Parsing (3 Tempat Harus Sinkron)

**Scanner prefix map ada di 3 tempat — HARUS SAMA:**

```typescript
// 1. zkteco-employee-code-parser.ts
const SCANNER_PREFIX_MAP = {
  '001': 'L', '100': 'A', '200': 'J', '300': 'B',
  '400': 'H', '500': 'C', '600': 'D', '700': 'E',
  '800': 'F', '900': 'G',
};

// 2. employee-mapping.service.ts
private scannerPrefixLocMap = {
  '001': 'L', '100': 'A', '200': 'J', '300': 'B',
  '400': 'H', '500': 'C', '600': 'D', '700': 'E',
  '800': 'F', '900': 'G',
};

// 3. sync-machines.ts
const scannerPrefixLocMap = {
  '001': 'L', '100': 'A', '200': 'J', '300': 'B',
  '400': 'H', '500': 'C', '600': 'D', '700': 'E',
  '800': 'F', '900': 'G',
};
```

**Aturan**: Jika menambah scanner prefix baru, update KE 3 file sekaligus.

---

## 12. Name Similarity Pattern

```typescript
import { validateNameMatch } from '../mapping/zkteco-employee-code-parser';

const nameResult = validateNameMatch(
  zktecoUserName ?? null,   // "PAIMIN"
  hrEmployeeName ?? null    // "PANJI ADITIA ROSA"
);

// nameResult.allowAutoMap:
// - true → bisa auto-map
// - false → NAME_MISMATCH → harus manual review
```

---

## Anti-Patterns — Jangan Lakukan

### ❌ Jangan parse employee code di tempat lain

```typescript
// ❌ SALAH — duplicate parsing logic
const empCode = locCode + rawId.slice(-4);

// ✅ BENAR — gunakan SSOT parser
const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: rawId });
```

### ❌ Jangan auto-map short ID

```typescript
// ❌ SALAH — auto-map short ID
if (rawId.length <= 5) {
  empCode = locCode + rawId.padStart(4, '0');
}

// ✅ BENAR — exclude short ID
if (rawId.length <= 5) return null;
```

### ❌ Jangan gunakan SqlClient untuk data baru

```typescript
// ❌ SALAH — legacy connection
const client = new SqlClient();
await client.select(...);

// ✅ BENAR — direct MSSQL
const results = await query(...);
```
