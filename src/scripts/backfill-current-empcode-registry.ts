/**
 * Backfill currentEmpCode to zkteco_absensi_user_registry
 * Purpose: Populate current_emp_code from existing parsed_employee_code
 * Usage: node dist/scripts/backfill-current-empcode-registry.js [--dry-run] [--batch-size=1000] [--since=YYYY-MM-DD]
 */

import * as mssql from 'mssql';
import * as dotenv from 'dotenv';

dotenv.config();

// CLI flags parsing
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 1000;
const sinceArg = args.find(arg => arg.startsWith('--since='));
const sinceDate = sinceArg ? sinceArg.split('=')[1] : null;

// Environment configuration
const HR_DB_SERVER = process.env.HR_DB_SERVER || 'DESKTOP-U5GUJPG';
const LOCAL_DB_SERVER = process.env.DB_SERVER || '10.0.0.110';
const LOCAL_DB_PORT = parseInt(process.env.DB_PORT || '1433', 10);
const LOCAL_DB_USER = process.env.DB_USER || 'sa';
const LOCAL_DB_PASSWORD = process.env.DB_PASSWORD || '<DB_PASSWORD>';
const LOCAL_DB_NAME = process.env.DB_NAME || 'rebinmas_absensi_monitoring';

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

interface RegistryRow {
  id: number;
  parsed_employee_code: string;
  current_resolution_status: string | null;
}

interface ResolutionResult {
  id: number;
  parsed_employee_code: string;
  resolved_nik: string | null;
  current_emp_code: string | null;
  current_emp_name: string | null;
  current_hr_status: string | null;
  current_hr_loc_code: string | null;
  current_hr_create_date: Date | null;
  current_hr_update_date: Date | null;
  current_resolution_status: string;
  current_resolution_method: string;
  current_resolution_reason: string;
}

interface Summary {
  total_rows: number;
  updated_rows: number;
  skipped_rows: number;
  by_status: Record<string, number>;
}

async function log(message: string, ...args: unknown[]): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

function parseArgs(): { dryRun: boolean; batchSize: number; sinceDate: string | null } {
  return {
    dryRun,
    batchSize,
    sinceDate,
  };
}

async function getRegistryRows(
  pool: mssql.ConnectionPool,
  batchSize: number,
  lastId: number,
  sinceDate: string | null
): Promise<RegistryRow[]> {
  let query = `
    SELECT TOP ${batchSize} id, parsed_employee_code, current_resolution_status
    FROM dbo.zkteco_absensi_user_registry
    WHERE parsed_employee_code IS NOT NULL
      AND LTRIM(RTRIM(parsed_employee_code)) != ''
  `;

  if (sinceDate) {
    query += ` AND created_at >= '${sinceDate}'`;
  }

  query += ` AND (current_resolution_status IS NULL OR current_resolution_status = '')`;
  query += ` AND id > ${lastId}`;
  query += ` ORDER BY id`;

  const result = await pool.request().query<RegistryRow>(query);
  return result.recordset;
}

async function getTotalRowCount(
  pool: mssql.ConnectionPool,
  sinceDate: string | null
): Promise<number> {
  let query = `
    SELECT COUNT(*) as total
    FROM dbo.zkteco_absensi_user_registry
    WHERE parsed_employee_code IS NOT NULL
      AND LTRIM(RTRIM(parsed_employee_code)) != ''
  `;

  if (sinceDate) {
    query += ` AND created_at >= '${sinceDate}'`;
  }

  query += ` AND (current_resolution_status IS NULL OR current_resolution_status = '')`;

  const result = await pool.request().query<{ total: number }>(query);
  return result.recordset[0]?.total ?? 0;
}

function determineResolutionStatus(
  hrEmpCodeFound: boolean,
  newIcNoFound: boolean,
  currentSnapshotFound: boolean,
  isAmbiguous: boolean
): string {
  if (!hrEmpCodeFound) return 'PARSED_CODE_NOT_FOUND_IN_HR';
  if (!newIcNoFound) return 'NIK_NOT_FOUND';
  if (!currentSnapshotFound) return 'CURRENT_EMP_NOT_FOUND';
  if (isAmbiguous) return 'NIK_DUPLICATE_AMBIGUOUS';
  return 'MAPPED_CURRENT';
}

function determineResolutionMethod(currentEmpCodeFound: boolean): string {
  return currentEmpCodeFound ? 'PARSED_CODE_TO_NIK_TO_CURRENT' : 'FAILED';
}

function determineResolutionReason(
  hrEmpCodeFound: boolean,
  newIcNoFound: boolean,
  currentSnapshotFound: boolean,
  isAmbiguous: boolean,
  parsedCode: string,
  currentEmpCode: string | null
): string {
  if (!hrEmpCodeFound) return 'Parsed code not found in HR_EMPLOYEE';
  if (!newIcNoFound) return 'Parsed HR row has no NewICNo/NIK';
  if (!currentSnapshotFound) return 'No current HR snapshot row found for NIK';
  if (isAmbiguous) return 'NIK has ambiguous current HR rows';
  if (currentEmpCode && parsedCode !== currentEmpCode) {
    return 'Parsed code resolved to newer currentEmpCode by NIK';
  }
  return 'Parsed code is already currentEmpCode';
}

async function resolveRow(
  pool: mssql.ConnectionPool,
  row: RegistryRow
): Promise<ResolutionResult> {
  const parsedCode = row.parsed_employee_code.trim();

  // Step 1: Lookup HR_EMPLOYEE by parsed_employee_code to get NewICNo
  let newIcNo: string | null = null;
  let hrEmpCodeFound = false;

  try {
    const hrResult = await pool.request().input('empCode', mssql.NVarChar, parsedCode).query<{ NewICNo: string | null }>(`
      SELECT LTRIM(RTRIM(NewICNo)) AS NewICNo
      FROM db_ptrj.dbo.HR_EMPLOYEE
      WHERE LTRIM(RTRIM(EmpCode)) = @empCode
    `);

    if (hrResult.recordset.length > 0) {
      hrEmpCodeFound = true;
      newIcNo = hrResult.recordset[0]?.NewICNo ?? null;
    }
  } catch (error) {
    log(`  WARNING: Failed to query HR_EMPLOYEE for ${parsedCode}: ${error}`);
  }

  const newIcNoFound = newIcNo !== null && newIcNo.trim() !== '';

  // Step 2: Lookup hr_employee_current_snapshot by NewICNo
  let currentEmpCode: string | null = null;
  let currentEmpName: string | null = null;
  let currentHrStatus: string | null = null;
  let currentHrLocCode: string | null = null;
  let currentHrCreateDate: Date | null = null;
  let currentHrUpdateDate: Date | null = null;
  let currentSnapshotFound = false;
  let isAmbiguous = false;

  if (newIcNoFound) {
    try {
      const snapshotResult = await pool.request().input('nik', mssql.NVarChar, newIcNo!.trim()).query<{
        current_emp_code: string | null;
        current_emp_name: string | null;
        current_status: string | null;
        current_loc_code: string | null;
        current_create_date: Date | null;
        current_update_date: Date | null;
        is_ambiguous: number;
      }>(`
        SELECT
          current_emp_code,
          current_emp_name,
          current_status,
          current_loc_code,
          current_create_date,
          current_update_date,
          is_ambiguous
        FROM dbo.hr_employee_current_snapshot
        WHERE LTRIM(RTRIM(nik)) = @nik
      `);

      if (snapshotResult.recordset.length > 0) {
        const snapshot = snapshotResult.recordset[0];
        currentSnapshotFound = true;
        currentEmpCode = snapshot.current_emp_code;
        currentEmpName = snapshot.current_emp_name;
        currentHrStatus = snapshot.current_status;
        currentHrLocCode = snapshot.current_loc_code;
        currentHrCreateDate = snapshot.current_create_date;
        currentHrUpdateDate = snapshot.current_update_date;
        isAmbiguous = snapshot.is_ambiguous === 1;
      }
    } catch (error) {
      log(`  WARNING: Failed to query hr_employee_current_snapshot for ${newIcNo}: ${error}`);
    }
  }

  const resolutionStatus = determineResolutionStatus(
    hrEmpCodeFound,
    newIcNoFound,
    currentSnapshotFound,
    isAmbiguous
  );

  const resolutionMethod = determineResolutionMethod(currentSnapshotFound && currentEmpCode !== null);

  const resolutionReason = determineResolutionReason(
    hrEmpCodeFound,
    newIcNoFound,
    currentSnapshotFound,
    isAmbiguous,
    parsedCode,
    currentEmpCode
  );

  return {
    id: row.id,
    parsed_employee_code: parsedCode,
    resolved_nik: newIcNoFound ? newIcNo!.trim() : null,
    current_emp_code: currentEmpCode,
    current_emp_name: currentEmpName,
    current_hr_status: currentHrStatus,
    current_hr_loc_code: currentHrLocCode,
    current_hr_create_date: currentHrCreateDate,
    current_hr_update_date: currentHrUpdateDate,
    current_resolution_status: resolutionStatus,
    current_resolution_method: resolutionMethod,
    current_resolution_reason: resolutionReason,
  };
}

async function updateRow(
  pool: mssql.ConnectionPool,
  result: ResolutionResult
): Promise<void> {
  const query = `
    UPDATE r
    SET
      r.resolved_nik = ${result.resolved_nik !== null ? `N'${result.resolved_nik.replace(/'/g, "''")}'` : 'NULL'},
      r.current_emp_code = ${result.current_emp_code !== null ? `N'${result.current_emp_code.replace(/'/g, "''")}'` : 'NULL'},
      r.current_emp_name = ${result.current_emp_name !== null ? `N'${result.current_emp_name.replace(/'/g, "''")}'` : 'NULL'},
      r.current_hr_status = ${result.current_hr_status !== null ? `N'${result.current_hr_status.replace(/'/g, "''")}'` : 'NULL'},
      r.current_hr_loc_code = ${result.current_hr_loc_code !== null ? `N'${result.current_hr_loc_code.replace(/'/g, "''")}'` : 'NULL'},
      r.current_hr_create_date = ${result.current_hr_create_date !== null ? `'${result.current_hr_create_date.toISOString()}'` : 'NULL'},
      r.current_hr_update_date = ${result.current_hr_update_date !== null ? `'${result.current_hr_update_date.toISOString()}'` : 'NULL'},
      r.current_resolution_status = N'${result.current_resolution_status}',
      r.current_resolution_method = N'${result.current_resolution_method}',
      r.current_resolution_reason = N'${result.current_resolution_reason.replace(/'/g, "''")}',
      r.current_resolved_at = SYSUTCDATETIME()
    FROM dbo.zkteco_absensi_user_registry r
    WHERE r.id = ${result.id}
  `;

  await pool.request().query(query);
}

async function checkPrerequisites(pool: mssql.ConnectionPool): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check zkteco_absensi_user_registry columns
  const registryColumns = await pool.request().query<{ COLUMN_NAME: string }>(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'zkteco_absensi_user_registry'
  `);
  const registryCols = new Set(registryColumns.recordset.map(r => r.COLUMN_NAME));

  const requiredRegistryCols = [
    'parsed_employee_code',
    'resolved_nik',
    'current_emp_code',
    'current_emp_name',
    'current_hr_status',
    'current_hr_loc_code',
    'current_hr_create_date',
    'current_hr_update_date',
    'current_resolution_status',
    'current_resolution_method',
    'current_resolution_reason',
    'current_resolved_at',
    'created_at',
  ];

  for (const col of requiredRegistryCols) {
    if (!registryCols.has(col)) {
      errors.push(`Missing column in zkteco_absensi_user_registry: ${col}`);
    }
  }

  // Check hr_employee_current_snapshot table exists
  const snapshotTables = await pool.request().query<{ TABLE_NAME: string }>(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'hr_employee_current_snapshot'
  `);

  if (snapshotTables.recordset.length === 0) {
    errors.push('Table hr_employee_current_snapshot does not exist. Run sync-hr-current-snapshot.ts first.');
  }

  return { valid: errors.length === 0, errors };
}

async function main(): Promise<void> {
  const options = parseArgs();
  const startTime = Date.now();

  log('=== Backfill currentEmpCode to zkteco_absensi_user_registry ===');
  log(`Dry run: ${options.dryRun}`);
  log(`Batch size: ${options.batchSize}`);
  log(`Since date: ${options.sinceDate ?? 'all rows'}`);
  log(`HR DB Server: ${HR_DB_SERVER}`);
  log(`Local DB Server: ${LOCAL_DB_SERVER}`);
  log('');

  let pool: mssql.ConnectionPool | null = null;

  const summary: Summary = {
    total_rows: 0,
    updated_rows: 0,
    skipped_rows: 0,
    by_status: {},
  };

  try {
    // Connect to local database
    log('Connecting to local database...');
    pool = await mssql.connect(localDbConfig);
    log('Local database connected successfully');

    // Check prerequisites
    log('');
    log('Checking prerequisites...');
    const prereqs = await checkPrerequisites(pool);

    if (!prereqs.valid) {
      log('');
      log('PREREQUISITES NOT MET:');
      for (const error of prereqs.errors) {
        log(`  - ${error}`);
      }
      log('');
      log('Please run the required migrations first:');
      log('  1. Run: npm run sync:hr-current-snapshot (to create hr_employee_current_snapshot table)');
      log('  2. Run: npm run db:migrate (to add required columns to zkteco_absensi_user_registry)');
      log('');
      log('Exiting.');
      process.exit(1);
    }

    log('Prerequisites check passed.');

    // Get total row count
    const totalRows = await getTotalRowCount(pool, options.sinceDate);
    summary.total_rows = totalRows;
    log(`Total rows to process: ${totalRows}`);

    if (totalRows === 0) {
      log('No rows to process. Exiting.');
      return;
    }

    // Process in batches
    let lastId = 0;
    let processedCount = 0;
    const sampleChanges: ResolutionResult[] = [];

    while (true) {
      const batchStartTime = Date.now();
      log('');
      log(`--- Batch: lastId=${lastId}, batchSize=${options.batchSize} ---`);

      const rows = await getRegistryRows(pool, options.batchSize, lastId, options.sinceDate);

      if (rows.length === 0) {
        break;
      }

      const batchResults: ResolutionResult[] = [];

      // Resolve each row
      for (const row of rows) {
        try {
          const result = await resolveRow(pool, row);
          batchResults.push(result);

          // Track sample changes for dry-run display
          if (options.dryRun && sampleChanges.length < 5) {
            sampleChanges.push(result);
          }
        } catch (error) {
          log(`  ERROR processing row ${row.id}: ${error}`);
          summary.skipped_rows++;
        }
      }

      // Update rows (skip if dry-run)
      if (!options.dryRun) {
        for (const result of batchResults) {
          try {
            await updateRow(pool, result);
            summary.updated_rows++;
          } catch (error) {
            log(`  ERROR updating row ${result.id}: ${error}`);
            summary.skipped_rows++;
          }
        }
      } else {
        summary.updated_rows += batchResults.length;
      }

      // Aggregate status counts
      for (const result of batchResults) {
        const status = result.current_resolution_status;
        summary.by_status[status] = (summary.by_status[status] || 0) + 1;
      }

      processedCount += rows.length;
      const lastRow = rows[rows.length - 1];
      lastId = lastRow.id;
      const batchElapsed = Date.now() - batchStartTime;
      log(`  Processed ${processedCount}/${totalRows} rows in ${batchElapsed}ms, lastId=${lastId}`);

      // If fewer rows than batch size, we're done
      if (rows.length < options.batchSize) {
        break;
      }
    }

    // Show sample changes in dry-run mode
    if (options.dryRun && sampleChanges.length > 0) {
      log('');
      log('=== Sample Changes (Dry Run) ===');
      for (const change of sampleChanges) {
        log(`  ID: ${change.id}`);
        log(`    parsed_employee_code: ${change.parsed_employee_code}`);
        log(`    resolved_nik: ${change.resolved_nik ?? 'NULL'}`);
        log(`    current_emp_code: ${change.current_emp_code ?? 'NULL'}`);
        log(`    current_resolution_status: ${change.current_resolution_status}`);
        log(`    current_resolution_reason: ${change.current_resolution_reason}`);
        log('');
      }
    }

    // Final summary
    const elapsedMs = Date.now() - startTime;

    log('');
    log('=== Final Summary ===');
    log(`  total_rows: ${summary.total_rows}`);
    log(`  updated_rows: ${summary.updated_rows}`);
    log(`  skipped_rows: ${summary.skipped_rows}`);
    log(`  by_status:`);
    for (const [status, count] of Object.entries(summary.by_status)) {
      log(`    ${status}: ${count}`);
    }
    log(`  elapsed_ms: ${elapsedMs}`);
    log('');
    log('Backfill completed successfully!');

  } catch (error) {
    log('');
    log('ERROR: Backfill failed!');
    log(String(error));
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      log('Database connection closed');
    }
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
