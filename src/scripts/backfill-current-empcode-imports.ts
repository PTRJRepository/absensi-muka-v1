/**
 * Backfill currentEmpCode to attendance_imports
 * Purpose: Update final attendance records with current employee codes
 * Usage: node dist/scripts/backfill-current-empcode-imports.js [--dry-run] [--batch-size=2000]
 */

import * as mssql from 'mssql';
import * as dotenv from 'dotenv';

dotenv.config();

// CLI flags
const dryRun = process.argv.includes('--dry-run');

// Parse --batch-size argument
let batchSize = 2000;
const batchSizeArg = process.argv.find(arg => arg.startsWith('--batch-size='));
if (batchSizeArg) {
  const parsed = parseInt(batchSizeArg.split('=')[1], 10);
  if (!isNaN(parsed) && parsed > 0) {
    batchSize = parsed;
  }
}

// Environment configuration
const DB_SERVER = process.env.DB_SERVER || '10.0.0.110';
const DB_PORT = parseInt(process.env.DB_PORT || '1433', 10);
const DB_USER = process.env.DB_USER || 'sa';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'rebinmas_absensi_monitoring';
const DB_ENCRYPT = process.env.DB_ENCRYPT === 'true';
const DB_TRUST_SERVER_CERTIFICATE = process.env.DB_TRUST_SERVER_CERTIFICATE === 'true';

// Database connection config
const dbConfig: mssql.config = {
  server: DB_SERVER,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  options: {
    encrypt: DB_ENCRYPT,
    trustServerCertificate: DB_TRUST_SERVER_CERTIFICATE,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

interface BackfillSummary {
  total_imports: number;
  with_scan_log: number;
  mapped_current: number;
  updated_rows: number;
  skipped_rows: number;
  dry_run: boolean;
}

async function log(message: string, ...args: unknown[]): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

async function main(): Promise<void> {
  const startTime = Date.now();
  log('=== Backfill currentEmpCode to attendance_imports ===');
  log(`Dry run: ${dryRun}`);
  log(`Batch size: ${batchSize}`);
  log(`Database: ${DB_SERVER}/${DB_NAME}`);
  log('');

  let pool: mssql.ConnectionPool | null = null;

  try {
    // Connect to database
    log('Connecting to database...');
    pool = await mssql.connect(dbConfig);
    log('Database connected successfully');

    // Step 1: Get current counts
    log('');
    log('Step 1: Analyzing current data...');

    const totalImportsResult = await pool.request().query<{ cnt: number }>(`
      SELECT COUNT(*) as cnt FROM dbo.attendance_imports
    `);
    const totalImports = totalImportsResult.recordset[0]?.cnt ?? 0;
    log(`  Total attendance_imports: ${totalImports.toLocaleString()}`);

    const withScanLogResult = await pool.request().query<{ cnt: number }>(`
      SELECT COUNT(*) as cnt
      FROM dbo.attendance_imports ai
      INNER JOIN dbo.attendance_scan_logs s ON s.id = ai.raw_scan_log_id
    `);
    const withScanLog = withScanLogResult.recordset[0]?.cnt ?? 0;
    log(`  With scan_log reference: ${withScanLog.toLocaleString()}`);

    const mappedCurrentResult = await pool.request().query<{ cnt: number }>(`
      SELECT COUNT(*) as cnt
      FROM dbo.attendance_imports ai
      INNER JOIN dbo.attendance_scan_logs s ON s.id = ai.raw_scan_log_id
      WHERE s.current_mapping_status = 'MAPPED_CURRENT'
    `);
    const mappedCurrent = mappedCurrentResult.recordset[0]?.cnt ?? 0;
    log(`  With MAPPED_CURRENT status: ${mappedCurrent.toLocaleString()}`);

    const toUpdateResult = await pool.request().query<{ cnt: number }>(`
      SELECT COUNT(*) as cnt
      FROM dbo.attendance_imports ai
      INNER JOIN dbo.attendance_scan_logs s ON s.id = ai.raw_scan_log_id
      WHERE s.current_mapping_status = 'MAPPED_CURRENT'
        AND ai.current_emp_code IS NULL
    `);
    const toUpdate = toUpdateResult.recordset[0]?.cnt ?? 0;
    log(`  Rows needing update: ${toUpdate.toLocaleString()}`);

    const alreadyUpdatedResult = await pool.request().query<{ cnt: number }>(`
      SELECT COUNT(*) as cnt
      FROM dbo.attendance_imports ai
      INNER JOIN dbo.attendance_scan_logs s ON s.id = ai.raw_scan_log_id
      WHERE s.current_mapping_status = 'MAPPED_CURRENT'
        AND ai.current_emp_code IS NOT NULL
    `);
    const alreadyUpdated = alreadyUpdatedResult.recordset[0]?.cnt ?? 0;
    log(`  Already updated: ${alreadyUpdated.toLocaleString()}`);

    // Step 2: Process in batches
    log('');
    log('Step 2: Processing batches...');

    let updatedRows = 0;
    let skippedRows = 0;
    let processedRows = 0;
    let lastProcessedId = 0;
    let hasMoreRows = true;

    while (hasMoreRows) {
      // Count eligible rows in this batch
      const countResult = await pool.request()
        .input('lastId', mssql.BigInt, BigInt(lastProcessedId))
        .input('batchSize', mssql.Int, batchSize)
        .query<{ cnt: number }>(`
          SELECT COUNT(*) as cnt
          FROM dbo.attendance_imports ai
          INNER JOIN dbo.attendance_scan_logs s ON s.id = ai.raw_scan_log_id
          WHERE s.current_mapping_status = 'MAPPED_CURRENT'
            AND ai.current_emp_code IS NULL
            AND ai.id > @lastId
        `);

      const batchCount = countResult.recordset[0]?.cnt ?? 0;

      if (batchCount === 0) {
        hasMoreRows = false;
        break;
      }

      log(`  Processing batch starting from id ${lastProcessedId} (${batchCount} rows)...`);

      if (dryRun) {
        // In dry run, just show what would be updated
        const sampleResult = await pool.request()
          .input('lastId', mssql.BigInt, BigInt(lastProcessedId))
          .input('batchSize', mssql.Int, Math.min(batchSize, 5))
          .query<any>(`
            SELECT TOP (@batchSize)
              ai.id,
              ai.employee_code as old_emp_code,
              s.current_emp_code as new_emp_code,
              s.parsed_employee_code,
              s.resolved_nik
            FROM dbo.attendance_imports ai
            INNER JOIN dbo.attendance_scan_logs s ON s.id = ai.raw_scan_log_id
            WHERE s.current_mapping_status = 'MAPPED_CURRENT'
              AND ai.current_emp_code IS NULL
              AND ai.id > @lastId
            ORDER BY ai.id
          `);

        if (processedRows === 0) {
          log('    [DRY RUN] Sample of rows that would be updated:');
          for (const row of sampleResult.recordset) {
            log(`      id=${row.id}: ${row.old_emp_code} -> ${row.new_emp_code} (NIK: ${row.resolved_nik})`);
          }
        }

        updatedRows += batchCount;
      } else {
        // Execute the update for this batch
        const updateResult = await pool.request()
          .input('lastId', mssql.BigInt, BigInt(lastProcessedId))
          .query(`
            UPDATE ai
            SET
              ai.parsed_employee_code = s.parsed_employee_code,
              ai.resolved_nik = s.resolved_nik,
              ai.current_emp_code = s.current_emp_code,
              ai.current_employee_id = e.id,
              ai.mapping_version = 'CURRENT_EMP_BY_NIK_V1',
              ai.employee_code = s.current_emp_code
            FROM dbo.attendance_imports ai
            INNER JOIN dbo.attendance_scan_logs s
              ON s.id = ai.raw_scan_log_id
            LEFT JOIN dbo.employees e
              ON e.nik = s.resolved_nik
            WHERE s.current_mapping_status = 'MAPPED_CURRENT'
              AND ai.current_emp_code IS NULL
              AND ai.id > @lastId
          `);

        const rowsAffected = updateResult.rowsAffected;
        updatedRows += Array.isArray(rowsAffected) ? rowsAffected.reduce((a, b) => a + b, 0) : (rowsAffected || 0);
      }

      processedRows += batchCount;

      // Get the last processed ID for next batch
      const lastIdResult = await pool.request()
        .input('lastId', mssql.BigInt, BigInt(lastProcessedId))
        .query<{ max_id: bigint }>(`
          SELECT MAX(ai.id) as max_id
          FROM dbo.attendance_imports ai
          INNER JOIN dbo.attendance_scan_logs s ON s.id = ai.raw_scan_log_id
          WHERE s.current_mapping_status = 'MAPPED_CURRENT'
            AND ai.current_emp_code IS NULL
            AND ai.id > @lastId
        `);

      const newLastId = lastIdResult.recordset[0]?.max_id;
      if (newLastId !== null && newLastId !== undefined) {
        lastProcessedId = Number(newLastId);
      } else {
        hasMoreRows = false;
      }

      // Progress update
      if (processedRows % (batchSize * 5) === 0 || !hasMoreRows) {
        log(`  Progress: ${processedRows}/${toUpdate} rows processed`);
      }
    }

    // Step 3: Count skipped rows (those without MAPPED_CURRENT status)
    log('');
    log('Step 3: Counting skipped rows...');

    const skippedResult = await pool.request().query<{ cnt: number }>(`
      SELECT COUNT(*) as cnt
      FROM dbo.attendance_imports ai
      INNER JOIN dbo.attendance_scan_logs s ON s.id = ai.raw_scan_log_id
      WHERE ai.current_emp_code IS NULL
        AND s.current_mapping_status != 'MAPPED_CURRENT'
    `);
    skippedRows = skippedResult.recordset[0]?.cnt ?? 0;
    log(`  Skipped rows (not MAPPED_CURRENT): ${skippedRows.toLocaleString()}`);

    // Step 4: Final verification
    log('');
    log('Step 4: Verification...');

    let remainingToUpdate = 0;
    let finalUpdated = 0;

    if (!dryRun) {
      const remainingResult = await pool.request().query<{ cnt: number }>(`
        SELECT COUNT(*) as cnt
        FROM dbo.attendance_imports ai
        INNER JOIN dbo.attendance_scan_logs s ON s.id = ai.raw_scan_log_id
        WHERE s.current_mapping_status = 'MAPPED_CURRENT'
          AND ai.current_emp_code IS NULL
      `);
      remainingToUpdate = remainingResult.recordset[0]?.cnt ?? 0;

      const finalResult = await pool.request().query<{ cnt: number }>(`
        SELECT COUNT(*) as cnt
        FROM dbo.attendance_imports
        WHERE current_emp_code IS NOT NULL
      `);
      finalUpdated = finalResult.recordset[0]?.cnt ?? 0;
    }

    // Calculate elapsed time
    const elapsedMs = Date.now() - startTime;
    const elapsedSeconds = (elapsedMs / 1000).toFixed(2);

    // Summary
    const summary: BackfillSummary = {
      total_imports: totalImports,
      with_scan_log: withScanLog,
      mapped_current: mappedCurrent,
      updated_rows: updatedRows,
      skipped_rows: skippedRows,
      dry_run: dryRun,
    };

    log('');
    log('╔══════════════════════════════════════════════════════════════╗');
    log('║               BACKFILL SUMMARY                           ║');
    log('╚══════════════════════════════════════════════════════════════╝');
    log('');
    log(`  total_imports:      ${summary.total_imports.toLocaleString()}`);
    log(`  with_scan_log:      ${summary.with_scan_log.toLocaleString()}`);
    log(`  mapped_current:     ${summary.mapped_current.toLocaleString()}`);
    log(`  updated_rows:       ${summary.updated_rows.toLocaleString()}`);
    log(`  skipped_rows:       ${summary.skipped_rows.toLocaleString()}`);
    log('');
    if (dryRun) {
      log('  Mode: DRY RUN - No changes were made');
    } else {
      log(`  remaining_to_update: ${remainingToUpdate.toLocaleString()}`);
      log(`  final_updated:        ${finalUpdated.toLocaleString()}`);
    }
    log(`  elapsed_seconds:    ${elapsedSeconds}s`);
    log('');
    log('Backfill completed successfully!');

  } catch (error) {
    log('');
    log('ERROR: Backfill failed!');
    log(String(error));
    process.exit(1);
  } finally {
    // Cleanup connection
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
