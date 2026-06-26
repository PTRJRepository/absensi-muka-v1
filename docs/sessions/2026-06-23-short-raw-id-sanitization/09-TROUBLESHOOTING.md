# Troubleshooting Guide

---

## 1. TypeScript Compilation Errors

### "Cannot find module './src/lib/db'"
```bash
# Jalankan dari root directory
cd D:\Gawean Rebinmas\Absensi_Muka
npx tsc --noEmit

# Atau dengan ts-node
npx ts-node --transpile-only your-script.ts
```

### "getPool is not a function"
```typescript
// ❌ Salah — yang diexport adalah getDbPool
const { getPool } = require('./src/lib/db');

// ✅ Benar
const { getDbPool } = require('./src/lib/db');
```

### "Expected 6 args but got 4" (convertDeviceUserIdToEmpCodeWithLookup)
```typescript
// Function signature (6 args):
convertDeviceUserIdToEmpCodeWithLookup(
  deviceUserId: string,          // 1
  machineLocCode: string | undefined, // 2
  machineScannerCode: number | undefined, // 3
  employeeCodes: Set<string>,     // 4
  zktecoUserName: string | undefined, // 5 — NAME dari ZKTeco
  employeeNameLookup: (code: string) => string | null // 6 — lookup function
)
```

---

## 2. Database Connection Errors

### "Connection refused" / "Cannot connect to SQL Server"
```bash
# Check environment variables
echo $DB_SERVER  # Should be: 10.0.0.110
echo $DB_PORT   # Should be: 1433

# Test connection
npm run db:check
```

### "Login failed for user 'sa'"
```bash
# Check DB_PASSWORD in .env
# Should be: <DB_PASSWORD>
```

### TLS/Encryption warning
```
(DeprecationWarning) Setting TLS ServerName to an IP address is not permitted
```
**Ini hanya warning** — aman diabaikan, tidak 影响 functionality.

---

## 3. ZKTeco Machine Sync Issues

### "Connection refused" ke mesin ZKTeco
```typescript
// Check IP dan port di _dev_utils/src/machine-config.ts
// Contoh: { ip: '10.0.1.131', port: 4370, machine_code: 'P1A' }

// Test manual connection
const zk = new ZKLib('10.0.1.131', 4370, 30000, 4000, '12345');
await zk.createSocket(); // akan throw jika gagal
```

### Machine timeout
```typescript
// Default timeout 30 detik
// Adjust di: ZKTeco constructor 4th parameter (timeoutMs)
const zk = new ZKLib(ip, port, 30000, 60000, '12345'); // 60s timeout
```

### "Get users failed" — empty user list
- Kemungkinan: Mesin belum di-enroll user
- Atau: Password salah (default: 12345)
- Check: `zk.getUsers()` returns `{ data: [], err: null }`

---

## 4. Mapping Issues

### Employee tidak ter-mapping padahal seharusnya

**Step 1**: Check raw_device_user_id format
```sql
SELECT TOP 10 raw_device_user_id, LEN(raw_device_user_id) as len
FROM attendance_scan_logs
WHERE machine_code = 'P1A'
ORDER BY scan_time DESC;
```

**Step 2**: Check apakah scanner prefix valid
```sql
-- Valid prefixes: 001, 100, 200, 300, 400, 500, 600, 700, 800, 900
SELECT raw_device_user_id,
       LEFT(raw_device_user_id, 3) as prefix,
       LEN(raw_device_user_id) as len
FROM attendance_scan_logs
WHERE LEFT(raw_device_user_id, 3) NOT IN ('001','100','200','300','400','500','600','700','800','900');
```

**Step 3**: Check registry
```sql
SELECT * FROM zkteco_absensi_user_registry
WHERE raw_device_user_id = 'YOUR_RAW_ID';
```

**Step 4**: Check db_ptrj.HR_EMPLOYEE
```sql
SELECT * FROM DB_PTRJ.dbo.HR_EMPLOYEE
WHERE EmpCode = 'A0044'  -- your parsed code
  AND Status IN ('1', '4');
```

---

### PAIMIN auto-mapping ke PANJI (salah)

Ini sudah difix dengan name validation. Check:
```typescript
// validateNameMatch() harus return NAME_MISMATCH
import { validateNameMatch } from '../mapping/zkteco-employee-code-parser';

const result = validateNameMatch('PAIMIN', 'PANJI ADITIA ROSA');
console.log(result.confidence); // should be 'NAME_MISMATCH'
console.log(result.allowAutoMap); // should be false
```

---

### Short ID (< 5 digit) masih ter-mapping

```sql
-- Check
SELECT COUNT(*) FROM attendance_scan_logs
WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) <= 5
  AND mapping_status = 'MAPPED';

-- Jika > 0, ada bug — SSOT parser tidak dipanggil
```

---

## 5. Frontend Issues

### Frontend tidak bisa connect ke backend
```bash
# Check backend running
curl http://localhost:8004/api/dashboard/stats

# Check frontend API base URL
# File: frontend/src/lib/api.ts
# Default: http://localhost:8004
```

### React Query error states
```typescript
// Check API response di DevTools Network tab
// 401 → token expired, perlu login
// 404 → endpoint tidak ada
// 500 → server error, check backend logs
```

---

## 6. Migration Issues

### Migration failed — syntax error
```sql
-- Check SQL Server version compatibility
-- NVARCHAR vs VARCHAR usage
-- Date functions (GETDATE vs SYSUTCDATETIME)
```

### "Table already exists" error
```sql
-- Add IF NOT EXISTS sebelum CREATE TABLE
IF OBJECT_ID('dbo.table_name', 'U') IS NULL
BEGIN
  CREATE TABLE ...
END;
```

### "Column does not exist" error
```sql
-- Check schema
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'your_table';
```

---

## 7. Real-time SSE Issues

### SSE connection fails
```bash
# Test SSE endpoint
curl -N http://localhost:8004/api/realtime/events

# Should receive event stream, not JSON error
```

### Events not appearing in frontend
```typescript
// Check event source URL
const es = new EventSource('/api/realtime/events'); // ✅ Benar
const es = new EventSource('http://localhost:8004/api/realtime/events'); // ❌ CORS issue

// Check browser console for CORS errors
// SSE requires no CORS preflight but origin must match
```

---

## 8. Performance Issues

### Slow query — attendance_scan_logs
```sql
-- Check indexes exist
SELECT name FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.attendance_scan_logs');

-- Add missing indexes
CREATE INDEX idx_scan_logs_date_machine ON attendance_scan_logs(scan_date, machine_code);
CREATE INDEX idx_scan_logs_parsed ON attendance_scan_logs(parsed_employee_code);
```

### Slow sync — many attendance records
```typescript
// Batch insert untuk performa
const BATCH_SIZE = 1000;
for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);
  await insertBatch(batch);
}
```

---

## 9. Cross-Location Debugging

### 1 card → multiple machines detected
```sql
-- Find cards appearing at multiple machines
SELECT raw_device_user_id, COUNT(DISTINCT machine_code) as machine_cnt
FROM attendance_scan_logs
WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) > 5
GROUP BY raw_device_user_id
HAVING COUNT(DISTINCT machine_code) > 1
ORDER BY machine_cnt DESC;

-- Check registry cross-location
SELECT * FROM zkteco_absensi_user_registry
WHERE machine_count > 1
ORDER BY machine_count DESC;
```

### Wrong employee mapped due to cross-location
```sql
-- Find same card mapping to different employees
SELECT raw_device_user_id,
       COUNT(DISTINCT parsed_employee_code) as emp_cnt
FROM attendance_scan_logs
WHERE mapping_status = 'MAPPED'
GROUP BY raw_device_user_id
HAVING COUNT(DISTINCT parsed_employee_code) > 1;
```

---

## 10. Common SQL Queries for Debugging

### Check mapping status breakdown
```sql
SELECT
  mapping_status,
  COUNT(*) as cnt,
  COUNT(DISTINCT raw_device_user_id) as unique_ids
FROM attendance_scan_logs
WHERE LEN(LTRIM(RTRIM(raw_device_user_id))) > 5
GROUP BY mapping_status
ORDER BY cnt DESC;
```

### Check registry health
```sql
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) as mapped,
  SUM(CASE WHEN machine_count > 1 THEN 1 ELSE 0 END) as cross_loc
FROM zkteco_absensi_user_registry;
```

### Find employee attendance
```sql
SELECT
  ai.attendance_date,
  ai.attendance_status,
  s.scan_time,
  s.machine_code,
  s.raw_device_user_id
FROM attendance_imports ai
JOIN attendance_scan_logs s ON s.id = ai.raw_scan_log_id
WHERE ai.employee_code = 'A0044'
  AND ai.attendance_date BETWEEN '2026-06-01' AND '2026-06-23'
ORDER BY ai.attendance_date, s.scan_time;
```

### Find unmapped scans by machine
```sql
SELECT
  machine_code,
  COUNT(*) as unmapped_count,
  COUNT(DISTINCT raw_device_user_id) as unique_unmapped
FROM attendance_scan_logs
WHERE mapping_status IN ('NEED_REVIEW', 'UNMAPPED')
GROUP BY machine_code
ORDER BY unmapped_count DESC;
```

---

## Debug Scripts

### Quick health check
```bash
# Check DB
npm run db:check

# Check TypeScript
npx tsc --noEmit

# Check frontend build
cd frontend && npm run build
```

### Test SSOT parser directly
```typescript
// src/scripts/test-parser.ts
import { parseZktecoUserIdToEmployeeCode } from '../modules/mapping/zkteco-employee-code-parser';

const testCases = ['50040', '5000669', '10044', '40', '', 'ABC123'];
for (const id of testCases) {
  const result = parseZktecoUserIdToEmployeeCode({ zktecoUserId: id });
  console.log(`${id} → ${result.parsedEmployeeCode ?? 'NULL'} (${result.confidence})`);
}
```
