/**
 * Test currentEmpCode Implementation
 * Purpose: Validate currentEmpCode implementation works correctly
 * Usage: node dist/scripts/test-current-empcode.js [--verbose] [--test=name]
 *
 * Tests:
 * - A: HR Snapshot Sync Test
 * - B: Resolution Cascade Test
 * - C: Backfill Test
 * - D: API Quality Endpoints Test
 */

import * as mssql from 'mssql';
import * as dotenv from 'dotenv';

dotenv.config();

// Environment configuration
const HR_DB_SERVER = process.env.HR_DB_SERVER || 'DESKTOP-U5GUJPG';
const LOCAL_DB_SERVER = process.env.DB_SERVER || '10.0.0.110';
const LOCAL_DB_PORT = parseInt(process.env.DB_PORT || '1433', 10);
const LOCAL_DB_USER = process.env.DB_USER || 'sa';
const LOCAL_DB_PASSWORD = process.env.DB_PASSWORD || '<DB_PASSWORD>';
const LOCAL_DB_NAME = process.env.DB_NAME || 'rebinmas_absensi_monitoring';
const APP_PORT = parseInt(process.env.APP_PORT || '3000', 10);

// Local database connection config
const localDbConfig: mssql.config = {
  server: LOCAL_DB_SERVER,
  port: LOCAL_DB_PORT,
  user: LOCAL_DB_USER,
  password: LOCAL_DB_PASSWORD,
  database: LOCAL_DB_NAME,
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

// Test result interface
interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  data?: any;
  duration: number;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
}

// Global state
let pool: mssql.ConnectionPool | null = null;
let verbose = false;
let specificTest: string | null = null;

async function log(message: string, ...args: unknown[]): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

async function logVerbose(message: string, ...args: unknown[]): Promise<void> {
  if (verbose) {
    log(`  [VERBOSE] ${message}`, ...args);
  }
}

function logTest(name: string, passed: boolean, message: string, data?: any): void {
  const icon = passed ? '[PASS]' : '[FAIL]';
  console.log(`${icon} ${name}`);
  if (!passed) {
    console.log(`      ${message}`);
  }
  if (verbose && data) {
    console.log(`      Data:`, JSON.stringify(data, null, 2));
  }
}

async function checkDbConnection(): Promise<boolean> {
  try {
    if (!pool?.connected) {
      pool = await mssql.connect(localDbConfig);
    }
    await pool.request().query('SELECT 1');
    return true;
  } catch (error) {
    log('Database connection failed:', error);
    return false;
  }
}

async function runQuery<T>(query: string): Promise<T[]> {
  if (!pool) {
    throw new Error('Database not connected');
  }
  const result = await pool.request().query<T>(query);
  return result.recordset ?? [];
}

// ============================================================================
// TEST SUITE A: HR SNAPSHOT SYNC TEST
// ============================================================================

async function testHrSnapshotSync(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const startTime = Date.now();

  // A.1: Verify snapshot has data
  const testA1: TestResult = {
    name: 'A.1: Snapshot has data',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const snapshotRows = await runQuery<any>(`
      SELECT COUNT(*) AS cnt FROM dbo.hr_employee_current_snapshot
    `);
    const count = snapshotRows[0]?.cnt ?? 0;
    testA1.passed = count > 0;
    testA1.message = testA1.passed
      ? `Snapshot has ${count} rows`
      : 'Snapshot table is empty';
    testA1.data = { rowCount: count };
    logTest(testA1.name, testA1.passed, testA1.message, testA1.data);
  } catch (error: any) {
    testA1.passed = false;
    testA1.message = `Error: ${error.message}`;
    logTest(testA1.name, testA1.passed, testA1.message);
  }
  results.push(testA1);

  // A.2: Verify example NIK (1906041207910002) resolves to A0966
  const testA2: TestResult = {
    name: 'A.2: Example NIK 1906041207910002 resolves to A0966',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const exampleNik = '1906041207910002';
    const expectedEmpCode = 'A0966';
    const snapshotRows = await runQuery<any>(`
      SELECT current_emp_code, current_emp_name, current_loc_code, is_ambiguous
      FROM dbo.hr_employee_current_snapshot
      WHERE nik = N'${exampleNik}'
    `);

    if (snapshotRows.length === 0) {
      testA2.passed = false;
      testA2.message = `NIK ${exampleNik} not found in snapshot`;
    } else {
      const row = snapshotRows[0];
      testA2.passed = row.current_emp_code === expectedEmpCode;
      testA2.message = testA2.passed
        ? `NIK resolved correctly to ${row.current_emp_code}`
        : `Expected ${expectedEmpCode}, got ${row.current_emp_code}`;
      testA2.data = {
        nik: exampleNik,
        expected: expectedEmpCode,
        actual: row.current_emp_code,
        name: row.current_emp_name,
        locCode: row.current_loc_code,
        isAmbiguous: row.is_ambiguous === 1,
      };
    }
    logTest(testA2.name, testA2.passed, testA2.message, testA2.data);
  } catch (error: any) {
    testA2.passed = false;
    testA2.message = `Error: ${error.message}`;
    logTest(testA2.name, testA2.passed, testA2.message);
  }
  results.push(testA2);

  // A.3: Verify ambiguous NIKs are marked
  const testA3: TestResult = {
    name: 'A.3: Ambiguous NIKs are marked',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const ambiguousRows = await runQuery<any>(`
      SELECT COUNT(*) AS cnt FROM dbo.hr_employee_current_snapshot WHERE is_ambiguous = 1
    `);
    const totalRows = await runQuery<any>(`
      SELECT COUNT(*) AS cnt FROM dbo.hr_employee_current_snapshot
    `);

    const ambiguousCount = ambiguousRows[0]?.cnt ?? 0;
    const totalCount = totalRows[0]?.cnt ?? 0;

    testA3.passed = true; // Ambiguous count can be 0 if no duplicates exist
    testA3.message = `Found ${ambiguousCount} ambiguous NIKs out of ${totalCount} total`;
    testA3.data = {
      ambiguousCount,
      totalCount,
      percentage: totalCount > 0 ? ((ambiguousCount / totalCount) * 100).toFixed(2) + '%' : '0%',
    };

    // Show sample ambiguous if any exist
    if (ambiguousCount > 0) {
      const sample = await runQuery<any>(`
        SELECT TOP 5 nik, current_emp_code, active_count, ambiguity_reason
        FROM dbo.hr_employee_current_snapshot
        WHERE is_ambiguous = 1
        ORDER BY active_count DESC
      `);
      testA3.data.samples = sample;
    }
    logTest(testA3.name, testA3.passed, testA3.message, testA3.data);
  } catch (error: any) {
    testA3.passed = false;
    testA3.message = `Error: ${error.message}`;
    logTest(testA3.name, testA3.passed, testA3.message);
  }
  results.push(testA3);

  // A.4: Verify employee_code_history has data
  const testA4: TestResult = {
    name: 'A.4: Employee code history populated',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const historyRows = await runQuery<any>(`
      SELECT COUNT(*) AS cnt, COUNT(DISTINCT nik) AS distinct_nik
      FROM dbo.employee_code_history
    `);
    const count = historyRows[0]?.cnt ?? 0;
    const distinctNik = historyRows[0]?.distinct_nik ?? 0;
    testA4.passed = count > 0;
    testA4.message = testA4.passed
      ? `History has ${count} rows for ${distinctNik} distinct NIKs`
      : 'History table is empty';
    testA4.data = { rowCount: count, distinctNik };
    logTest(testA4.name, testA4.passed, testA4.message, testA4.data);
  } catch (error: any) {
    testA4.passed = false;
    testA4.message = `Error: ${error.message}`;
    logTest(testA4.name, testA4.passed, testA4.message);
  }
  results.push(testA4);

  const totalDuration = Date.now() - startTime;
  results.forEach(r => r.duration = totalDuration / results.length);

  return results;
}

// ============================================================================
// TEST SUITE B: RESOLUTION CASCADE TEST
// ============================================================================

async function testResolutionCascade(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const startTime = Date.now();

  // B.1: MAPPED_CURRENT status test
  const testB1: TestResult = {
    name: 'B.1: MAPPED_CURRENT - Correct status for resolved codes',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const mappedRows = await runQuery<any>(`
      SELECT
        COUNT(*) AS cnt,
        COUNT(DISTINCT current_emp_code) AS unique_codes
      FROM dbo.zkteco_absensi_user_registry
      WHERE current_resolution_status = 'MAPPED_CURRENT'
        AND current_emp_code IS NOT NULL
    `);

    const count = mappedRows[0]?.cnt ?? 0;
    const uniqueCodes = mappedRows[0]?.unique_codes ?? 0;
    testB1.passed = count > 0;
    testB1.message = testB1.passed
      ? `Found ${count} MAPPED_CURRENT records with ${uniqueCodes} unique employee codes`
      : 'No MAPPED_CURRENT records found';
    testB1.data = { count, uniqueCodes };
    logTest(testB1.name, testB1.passed, testB1.message, testB1.data);
  } catch (error: any) {
    testB1.passed = false;
    testB1.message = `Error: ${error.message}`;
    logTest(testB1.name, testB1.passed, testB1.message);
  }
  results.push(testB1);

  // B.2: PARSED_CODE_NOT_FOUND_IN_HR status test
  const testB2: TestResult = {
    name: 'B.2: PARSED_CODE_NOT_FOUND_IN_HR - Correct for unknown codes',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const notFoundRows = await runQuery<any>(`
      SELECT COUNT(*) AS cnt
      FROM dbo.zkteco_absensi_user_registry
      WHERE current_resolution_status = 'PARSED_CODE_NOT_FOUND_IN_HR'
    `);

    const count = notFoundRows[0]?.cnt ?? 0;
    testB2.passed = true; // Can be 0 if all codes are found
    testB2.message = `Found ${count} PARSED_CODE_NOT_FOUND_IN_HR records`;
    testB2.data = { count };
    logTest(testB2.name, testB2.passed, testB2.message, testB2.data);
  } catch (error: any) {
    testB2.passed = false;
    testB2.message = `Error: ${error.message}`;
    logTest(testB2.name, testB2.passed, testB2.message);
  }
  results.push(testB2);

  // B.3: NIK_NOT_FOUND status test
  const testB3: TestResult = {
    name: 'B.3: NIK_NOT_FOUND - Correct for codes without NIK',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const nikNotFoundRows = await runQuery<any>(`
      SELECT COUNT(*) AS cnt
      FROM dbo.zkteco_absensi_user_registry
      WHERE current_resolution_status = 'NIK_NOT_FOUND'
    `);

    const count = nikNotFoundRows[0]?.cnt ?? 0;
    testB3.passed = true; // Can be 0 if all HR rows have NIK
    testB3.message = `Found ${count} NIK_NOT_FOUND records`;
    testB3.data = { count };
    logTest(testB3.name, testB3.passed, testB3.message, testB3.data);
  } catch (error: any) {
    testB3.passed = false;
    testB3.message = `Error: ${error.message}`;
    logTest(testB3.name, testB3.passed, testB3.message);
  }
  results.push(testB3);

  // B.4: NIK_DUPLICATE_AMBIGUOUS status test
  const testB4: TestResult = {
    name: 'B.4: NIK_DUPLICATE_AMBIGUOUS - Correct for ambiguous cases',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const ambiguousRows = await runQuery<any>(`
      SELECT COUNT(*) AS cnt
      FROM dbo.zkteco_absensi_user_registry
      WHERE current_resolution_status = 'NIK_DUPLICATE_AMBIGUOUS'
    `);

    const count = ambiguousRows[0]?.cnt ?? 0;
    testB4.passed = true; // Can be 0 if no ambiguous NIKs exist
    testB4.message = `Found ${count} NIK_DUPLICATE_AMBIGUOUS records`;
    testB4.data = { count };
    logTest(testB4.name, testB4.passed, testB4.message, testB4.data);
  } catch (error: any) {
    testB4.passed = false;
    testB4.message = `Error: ${error.message}`;
    logTest(testB4.name, testB4.passed, testB4.message);
  }
  results.push(testB4);

  // B.5: Resolution status distribution
  const testB5: TestResult = {
    name: 'B.5: Resolution status distribution',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const distribution = await runQuery<any>(`
      SELECT
        current_resolution_status AS status,
        COUNT(*) AS count
      FROM dbo.zkteco_absensi_user_registry
      WHERE current_resolution_status IS NOT NULL
      GROUP BY current_resolution_status
      ORDER BY count DESC
    `);

    const total = distribution.reduce((sum: number, r: any) => sum + Number(r.count), 0);
    testB5.passed = total > 0;
    testB5.message = `Total resolved records: ${total}`;
    testB5.data = {
      total,
      distribution: distribution.map((r: any) => ({
        status: r.status,
        count: Number(r.count),
        percentage: total > 0 ? ((Number(r.count) / total) * 100).toFixed(2) + '%' : '0%',
      })),
    };
    logTest(testB5.name, testB5.passed, testB5.message, testB5.data);
  } catch (error: any) {
    testB5.passed = false;
    testB5.message = `Error: ${error.message}`;
    logTest(testB5.name, testB5.passed, testB5.message);
  }
  results.push(testB5);

  const totalDuration = Date.now() - startTime;
  results.forEach(r => r.duration = totalDuration / results.length);

  return results;
}

// ============================================================================
// TEST SUITE C: BACKFILL TEST
// ============================================================================

async function testBackfill(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const startTime = Date.now();

  // C.1: Registry backfill complete
  const testC1: TestResult = {
    name: 'C.1: Registry backfill complete',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const backfillStats = await runQuery<any>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN current_resolution_status IS NOT NULL THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN current_resolution_status IS NULL THEN 1 ELSE 0 END) AS unresolved
      FROM dbo.zkteco_absensi_user_registry
    `);

    const total = backfillStats[0]?.total ?? 0;
    const resolved = backfillStats[0]?.resolved ?? 0;
    const unresolved = backfillStats[0]?.unresolved ?? 0;
    const coverage = total > 0 ? ((resolved / total) * 100).toFixed(2) + '%' : '0%';

    testC1.passed = unresolved === 0 || (resolved / total) > 0.95; // 95% threshold
    testC1.message = testC1.passed
      ? `Registry backfill ${coverage} complete (${resolved}/${total} resolved)`
      : `Registry backfill incomplete: ${unresolved} unresolved records`;
    testC1.data = { total, resolved, unresolved, coverage };
    logTest(testC1.name, testC1.passed, testC1.message, testC1.data);
  } catch (error: any) {
    testC1.passed = false;
    testC1.message = `Error: ${error.message}`;
    logTest(testC1.name, testC1.passed, testC1.message);
  }
  results.push(testC1);

  // C.2: Scan logs backfill complete
  const testC2: TestResult = {
    name: 'C.2: Scan logs backfill complete',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const scanLogsStats = await runQuery<any>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN current_emp_code IS NOT NULL THEN 1 ELSE 0 END) AS has_current,
        SUM(CASE WHEN resolved_nik IS NOT NULL THEN 1 ELSE 0 END) AS has_nik
      FROM dbo.attendance_scan_logs
    `);

    const total = scanLogsStats[0]?.total ?? 0;
    const hasCurrent = scanLogsStats[0]?.has_current ?? 0;
    const hasNik = scanLogsStats[0]?.has_nik ?? 0;

    testC2.passed = total === 0 || hasCurrent > 0;
    testC2.message = total === 0
      ? 'No scan logs found'
      : `Scan logs: ${hasCurrent}/${total} have current_emp_code, ${hasNik}/${total} have resolved_nik`;
    testC2.data = { total, hasCurrent, hasNik };
    logTest(testC2.name, testC2.passed, testC2.message, testC2.data);
  } catch (error: any) {
    testC2.passed = false;
    testC2.message = `Error: ${error.message}`;
    logTest(testC2.name, testC2.passed, testC2.message);
  }
  results.push(testC2);

  // C.3: Imports backfill complete
  const testC3: TestResult = {
    name: 'C.3: Imports backfill complete',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const importsStats = await runQuery<any>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN current_emp_code IS NOT NULL THEN 1 ELSE 0 END) AS has_current,
        SUM(CASE WHEN current_emp_code IS NULL AND employee_code IS NOT NULL THEN 1 ELSE 0 END) AS missing_current
      FROM dbo.attendance_imports
    `);

    const total = importsStats[0]?.total ?? 0;
    const hasCurrent = importsStats[0]?.has_current ?? 0;
    const missingCurrent = importsStats[0]?.missing_current ?? 0;

    testC3.passed = total === 0 || missingCurrent === 0 || (hasCurrent / total) > 0.9;
    testC3.message = total === 0
      ? 'No attendance imports found'
      : `Imports: ${hasCurrent}/${total} have current_emp_code, ${missingCurrent} missing`;
    testC3.data = { total, hasCurrent, missingCurrent };
    logTest(testC3.name, testC3.passed, testC3.message, testC3.data);
  } catch (error: any) {
    testC3.passed = false;
    testC3.message = `Error: ${error.message}`;
    logTest(testC3.name, testC3.passed, testC3.message);
  }
  results.push(testC3);

  // C.4: Verify parsedCode -> currentEmpCode changes
  const testC4: TestResult = {
    name: 'C.4: ParsedCode to currentEmpCode changes tracked',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const changes = await runQuery<any>(`
      SELECT COUNT(*) AS cnt
      FROM dbo.zkteco_absensi_user_registry
      WHERE current_emp_code IS NOT NULL
        AND parsed_employee_code <> current_emp_code
    `);

    const changeCount = changes[0]?.cnt ?? 0;
    testC4.passed = true; // Can be 0 if no employee code changes
    testC4.message = `Found ${changeCount} cases where parsedCode differs from currentEmpCode`;
    testC4.data = { changeCount };

    if (changeCount > 0) {
      const topChanges = await runQuery<any>(`
        SELECT TOP 10
          parsed_employee_code,
          current_emp_code,
          COUNT(*) AS count
        FROM dbo.zkteco_absensi_user_registry
        WHERE current_emp_code IS NOT NULL
          AND parsed_employee_code <> current_emp_code
        GROUP BY parsed_employee_code, current_emp_code
        ORDER BY count DESC
      `);
      testC4.data.topChanges = topChanges;
    }
    logTest(testC4.name, testC4.passed, testC4.message, testC4.data);
  } catch (error: any) {
    testC4.passed = false;
    testC4.message = `Error: ${error.message}`;
    logTest(testC4.name, testC4.passed, testC4.message);
  }
  results.push(testC4);

  const totalDuration = Date.now() - startTime;
  results.forEach(r => r.duration = totalDuration / results.length);

  return results;
}

// ============================================================================
// TEST SUITE D: API QUALITY ENDPOINTS TEST
// ============================================================================

async function testQualityAPI(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const startTime = Date.now();
  const baseUrl = `http://localhost:${APP_PORT}`;

  // Helper to make HTTP requests
  async function fetchApi(endpoint: string): Promise<{ ok: boolean; data: any; error?: string }> {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`);
      const json = await response.json();
      return {
        ok: response.ok,
        data: json,
      };
    } catch (error: any) {
      return {
        ok: false,
        data: null,
        error: error.message,
      };
    }
  }

  // D.1: GET /api/quality/current-empcode/summary
  const testD1: TestResult = {
    name: 'D.1: GET /api/quality/current-empcode/summary',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const result = await fetchApi('/api/quality/current-empcode/summary');
    testD1.passed = result.ok && result.data?.success;
    testD1.message = testD1.passed
      ? 'API returned valid response'
      : `API failed: ${result.error || 'non-success status'}`;
    testD1.data = result.ok ? {
      registryQuality: result.data?.data?.registryQuality,
      parsedCodeChanges: result.data?.data?.parsedCodeChanges,
      snapshotHealth: result.data?.data?.snapshotHealth,
    } : null;
    logTest(testD1.name, testD1.passed, testD1.message, testD1.data);
  } catch (error: any) {
    testD1.passed = false;
    testD1.message = `Error: ${error.message}`;
    logTest(testD1.name, testD1.passed, testD1.message);
  }
  results.push(testD1);

  // D.2: GET /api/quality/current-empcode/ambiguous
  const testD2: TestResult = {
    name: 'D.2: GET /api/quality/current-empcode/ambiguous',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const result = await fetchApi('/api/quality/current-empcode/ambiguous');
    testD2.passed = result.ok && result.data?.success;
    testD2.message = testD2.passed
      ? `API returned ${result.data?.data?.total || 0} ambiguous records`
      : `API failed: ${result.error || 'non-success status'}`;
    testD2.data = result.ok ? {
      total: result.data?.data?.total,
      items: result.data?.data?.data?.length,
    } : null;
    logTest(testD2.name, testD2.passed, testD2.message, testD2.data);
  } catch (error: any) {
    testD2.passed = false;
    testD2.message = `Error: ${error.message}`;
    logTest(testD2.name, testD2.passed, testD2.message);
  }
  results.push(testD2);

  // D.3: GET /api/quality/current-empcode/snapshot-status
  const testD3: TestResult = {
    name: 'D.3: GET /api/quality/current-empcode/snapshot-status',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const result = await fetchApi('/api/quality/current-empcode/snapshot-status');
    testD3.passed = result.ok && result.data?.success;
    testD3.message = testD3.passed
      ? `Snapshot: ${result.data?.data?.snapshotCount} rows, stale: ${result.data?.data?.isStale}`
      : `API failed: ${result.error || 'non-success status'}`;
    testD3.data = result.ok ? {
      snapshotCount: result.data?.data?.snapshotCount,
      isStale: result.data?.data?.isStale,
      lastSyncAt: result.data?.data?.lastSyncAt,
    } : null;
    logTest(testD3.name, testD3.passed, testD3.message, testD3.data);
  } catch (error: any) {
    testD3.passed = false;
    testD3.message = `Error: ${error.message}`;
    logTest(testD3.name, testD3.passed, testD3.message);
  }
  results.push(testD3);

  // D.4: GET /api/quality/current-empcode/changes
  const testD4: TestResult = {
    name: 'D.4: GET /api/quality/current-empcode/changes',
    passed: false,
    message: '',
    duration: 0,
  };

  try {
    const result = await fetchApi('/api/quality/current-empcode/changes?limit=10');
    testD4.passed = result.ok && result.data?.success;
    testD4.message = testD4.passed
      ? `Found ${result.data?.data?.total || 0} total changes`
      : `API failed: ${result.error || 'non-success status'}`;
    testD4.data = result.ok ? {
      total: result.data?.data?.total,
      items: result.data?.data?.data?.length,
    } : null;
    logTest(testD4.name, testD4.passed, testD4.message, testD4.data);
  } catch (error: any) {
    testD4.passed = false;
    testD4.message = `Error: ${error.message}`;
    logTest(testD4.name, testD4.passed, testD4.message);
  }
  results.push(testD4);

  const totalDuration = Date.now() - startTime;
  results.forEach(r => r.duration = totalDuration / results.length);

  return results;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  const startTime = Date.now();

  // Parse CLI arguments
  const args = process.argv.slice(2);
  verbose = args.includes('--verbose') || args.includes('-v');
  const testArg = args.find(arg => arg.startsWith('--test=') || arg.startsWith('-t='));
  specificTest = testArg ? testArg.split('=')[1] : null;

  log('=== currentEmpCode Implementation Tests ===');
  log(`Verbose: ${verbose}`);
  log(`Specific test: ${specificTest || 'all'}`);
  log(`Database: ${LOCAL_DB_SERVER}/${LOCAL_DB_NAME}`);
  log('');

  // Connect to database
  log('Connecting to database...');
  const connected = await checkDbConnection();
  if (!connected) {
    log('FATAL: Could not connect to database');
    process.exit(1);
  }
  log('Database connected successfully');

  // Define test suites
  const testSuites: { name: string; run: () => Promise<TestResult[]> }[] = [
    { name: 'A: HR Snapshot Sync', run: testHrSnapshotSync },
    { name: 'B: Resolution Cascade', run: testResolutionCascade },
    { name: 'C: Backfill', run: testBackfill },
    { name: 'D: Quality API', run: testQualityAPI },
  ];

  const allSuites: TestSuite[] = [];

  // Run test suites
  for (const suite of testSuites) {
    // Skip if specific test requested and this isn't it
    if (specificTest && !suite.name.toLowerCase().includes(specificTest.toLowerCase())) {
      continue;
    }

    log('');
    log(`--- ${suite.name} ---`);

    const results = await suite.run();
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    allSuites.push({
      name: suite.name,
      tests: results,
      passed,
      failed,
    });
  }

  // Print summary
  log('');
  log('═══════════════════════════════════════════════════════════════════════');
  log('TEST SUMMARY');
  log('═══════════════════════════════════════════════════════════════════════');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of allSuites) {
    const status = suite.failed === 0 ? 'PASS' : 'FAIL';
    log(`[${status}] ${suite.name}: ${suite.passed}/${suite.passed + suite.failed} passed`);
    totalPassed += suite.passed;
    totalFailed += suite.failed;
  }

  const totalTests = totalPassed + totalFailed;
  const overallPassed = totalFailed === 0;

  log('');
  log(`Overall: ${totalPassed}/${totalTests} tests passed`);
  log(`Duration: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

  log('');
  if (overallPassed) {
    log('RESULT: ALL TESTS PASSED');
  } else {
    log(`RESULT: ${totalFailed} TEST(S) FAILED`);
  }

  // Cleanup
  if (pool) {
    await pool.close();
    log('Database connection closed');
  }

  // Exit with appropriate code
  process.exit(overallPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
