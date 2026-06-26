# Quick Reference — Developer Cheat Sheet

## Commands

```bash
# Backend
npm run dev              # Start dev server (port 8004)
npm run build            # Compile TypeScript
npm run db:migrate       # Run migrations
npm run db:check         # Check DB connection
npm run sync:machines    # Sync all machines

# Frontend
cd frontend && npm run dev      # Dev server (port 5173)
cd frontend && npm run build     # Production build
```

## Employee Code Format

Format: `{locCode}{last 4 digits}`

| locCode | Division | Prefix |
|---------|----------|--------|
| A | P1A | 100 |
| B | P1B | 300 |
| C | P2A | 500 |
| D | P2B | 600 |
| E | DME | 700 |
| F | ARA | 800 |
| G | AB1 | 900 |
| H | AB2/MILL | 400 |
| J | ARC | 200 |
| L | IJL | 001 |

## ID Length Rules

| Length | Example | Action |
|--------|---------|--------|
| ≤ 5 | `40`, `100`, `0040` | **EXCLUDED** |
| 6-7 + prefix | `50040`, `5000669` | **MAPPED** |
| > 5, no prefix | `1234567` | **NEED_REVIEW** |

## Mapping Status

```
EXACT  → already correct format (A0044)
STRONG → valid prefix + HR found (50040 → C0040 found in DB)
WEAK   → HR found but name weak/no data
NONE   → HR not found
EXCLUDED → short ID
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `attendance_scan_logs` | Raw scan entry point |
| `attendance_imports` | Processed attendance |
| `employees` | Employee master |
| `zkteco_absensi_user_registry` | Canonical ID registry |
| `zkteco_hr_employee_map` | ZKTeco → HR mapping |
| `attendance_machines` | Machine inventory |

## Key Files

| File | Purpose |
|------|---------|
| `zkteco-employee-code-parser.ts` | **SSOT** — satu-satunya parser |
| `employee-mapping.service.ts` | Mapping dengan name validation |
| `sync-orchestrator.service.ts` | ZKTeco sync orchestration |
| `db.ts` | Direct MSSQL connection |
| `realtime-emitter.ts` | SSE broadcast |

## SSOT Parser Signature

```typescript
parseZktecoUserIdToEmployeeCode({
  zktecoUserId: string,
  machineLocCode?: string | null,
  machineScannerCode?: string | number | null,
  zktecoUserName?: string | null,
}): ParsedMappingResult
```

## Mapping Service Signature

```typescript
convertDeviceUserIdToEmpCodeWithLookup(
  deviceUserId: string,
  machineLocCode?: string,
  machineScannerCode?: number,
  employeeCodes: Set<string>,           // loadAllEmployeeCodes()
  zktecoUserName?: string,             // ZKTeco user name
  employeeNameLookup: (code) => string | null  // loadAllEmployeeNames()
): { empCode: string; confidence: number } | null
```

## Common SQL

```sql
-- Check mapping status
SELECT mapping_status, COUNT(*) FROM attendance_scan_logs GROUP BY mapping_status;

-- Registry summary
SELECT mapping_status, COUNT(*) FROM zkteco_absensi_user_registry GROUP BY mapping_status;

-- Cross-location
SELECT machine_count, COUNT(*) FROM zkteco_absensi_user_registry GROUP BY machine_count;
```

## Environment Variables

```
DB_SERVER=10.0.0.110
DB_PORT=1433
DB_NAME=rebinmas_absensi_monitoring
APP_PORT=8004
JWT_SECRET=<JWT_SECRET>
ZKTECO_PASSWORD=12345
```

## TypeScript Types

```typescript
type MappingConfidence = 'EXACT' | 'STRONG' | 'WEAK' | 'NONE' | 'EXCLUDED';
type NameValidationConfidence = 'STRONG_NAME_MATCH' | 'WEAK_NAME_MATCH' | 'NAME_MISMATCH' | 'NO_NAME_DATA';

interface ParsedMappingResult {
  rawInput: string;
  parsedEmployeeCode: string | null;
  scannerPrefix: string | null;
  locCode: string | null;
  confidence: MappingConfidence;
  reason: string;
  allowAutoMap: boolean;
}
```
