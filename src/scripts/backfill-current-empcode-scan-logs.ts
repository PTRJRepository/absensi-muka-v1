/**
 * Backfill currentEmpCode to attendance_scan_logs
 * Purpose: Copy resolved data from zkteco_absensi_user_registry to scan_logs
 *
 * WARNING: Large table - process during off-peak hours
 * This table may have MILLIONS of rows. Always use batching.
 *
 * Usage:
 *   node dist/scripts/backfill-current-empcode-scan-logs.js [--dry-run] [--batch-size=5000]
 *   node dist/scripts/backfill-current-empcode-scan-logs.js --date-from=2026-01-01 --date-to=2026-06-23
 *   node dist/scripts/backfill-current-empcode-scan-logs.js --dry-run --batch-size=10000
 */

import * as fs from 'fs';
// @ts-ignore - mssql package ships without local types in this repo
import mssql from 'mssql';

interface Summary {
  total_scan_logs: number;
  matched_registry: number;
  updated_rows: number;
  skipped_rows: number;
  by_date_range: { from: string | null; to: string | null };
  mode: string;
  batch_size: number;
  batches_processed: number;
  total_batches: number;
}

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

function dbConfig() {
  return {
    server: process.env.DB_SERVER ?? '10.0.0.110',
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USER ?? 'sa',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'rebinmas_absensi_monitoring',
    options: {
      encrypt: (process.env.DB_ENCRYPT ?? 'false') === 'true',
      trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') !== 'false',
    },
    pool: {
      max: 2,  // Conservative: single operation on large table
      min: 0,
      idleTimeoutMillis: 60000,
    },
  };
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${value}. Use YYYY-MM-DD.`);
  }
  return date;
}

function formatDate(date: Date | undefined): string | undefined {
  if (!date) return undefined;
  return date.toISOString().split('T')[0];
}

async function main() {
  loadEnv();

  // Parse arguments
  const isDryRun = hasArg('dry-run');
  const batchSize = parseInt(arg('batch-size') ?? '5000', 10);
  const dateFrom = parseDate(arg('date-from'));
  const dateTo = parseDate(arg('date-to'));

  if (batchSize <= 0) {
    throw new Error('--batch-size must be a positive integer');
  }

  const mode = isDryRun ? 'DRY_RUN' : 'APPLY';

  console.log('============================================================');
  console.log('Backfill currentEmpCode to attendance_scan_logs');
  console.log('============================================================');
  console.log('');
  console.log('Mode:          ', mode);
  console.log('Batch size:    ', batchSize);
  console.log('Date from:      ', dateFrom ? formatDate(dateFrom) : 'N/A (all records)');
  console.log('Date to:        ', dateTo ? formatDate(dateTo) : 'N/A (all records)');
  console.log('');

  // Safety warnings
  console.log('WARNING: This script modifies attendance_scan_logs table.');
  console.log('WARNING: Large table - ensure off-peak execution window.');
  if (isDryRun) {
    console.log('');
    console.log('DRY RUN MODE: No changes will be made. Use --apply to execute.');
  }
  console.log('');
  console.log('============================================================');
  console.log('');

  const pool = new mssql.ConnectionPool(dbConfig());
  await pool.connect();

  try {
    const summary: Summary = {
      total_scan_logs: 0,
      matched_registry: 0,
      updated_rows: 0,
      skipped_rows: 0,
      by_date_range: {
        from: dateFrom ? formatDate(dateFrom) ?? null : null,
        to: dateTo ? formatDate(dateTo) ?? null : null,
      },
      mode,
      batch_size: batchSize,
      batches_processed: 0,
      total_batches: 0,
    };

    // Get total count of rows needing update
    let countQuery = `
      SELECT COUNT(*) AS total_count
      FROM attendance_scan_logs s
      INNER JOIN zkteco_absensi_user_registry r
        ON r.raw_device_user_id = s.raw_device_user_id
      WHERE s.current_emp_code IS NULL
        AND r.current_resolution_status IS NOT NULL
    `;
    if (dateFrom) {
      countQuery += ` AND s.scan_date >= @dateFrom`;
    }
    if (dateTo) {
      countQuery += ` AND s.scan_date <= @dateTo`;
    }

    const countResult = await pool.request()
      .input('dateFrom', mssql.Date, dateFrom ?? new Date('1900-01-01'))
      .input('dateTo', mssql.Date, dateTo ?? new Date('2100-12-31'))
      .query(countQuery);

    summary.total_scan_logs = countResult.recordset[0]?.total_count ?? 0;
    summary.total_batches = Math.ceil(summary.total_scan_logs / batchSize);

    console.log(`Total scan_logs needing update: ${summary.total_scan_logs}`);
    console.log(`Estimated batches (batch-size=${batchSize}): ${summary.total_batches}`);
    console.log('');

    if (summary.total_scan_logs === 0) {
      console.log('No records need updating. Exiting.');
      return;
    }

    if (isDryRun) {
      console.log('Dry run - showing sample of records that would be updated:');
      const sampleResult = await pool.request()
        .input('dateFrom', mssql.Date, dateFrom ?? new Date('1900-01-01'))
        .input('dateTo', mssql.Date, dateTo ?? new Date('2100-12-31'))
        .query(`
          SELECT TOP 10
            s.id,
            s.raw_device_user_id,
            s.parsed_employee_code,
            r.resolved_nik,
            r.current_emp_code,
            r.current_resolution_status,
            r.current_resolution_reason,
            s.scan_date
          FROM attendance_scan_logs s
          INNER JOIN zkteco_absensi_user_registry r
            ON r.raw_device_user_id = s.raw_device_user_id
          WHERE s.current_emp_code IS NULL
            AND r.current_resolution_status IS NOT NULL
          ORDER BY s.id
        `);

      console.log('');
      for (const row of sampleResult.recordset) {
        console.log(`  id=${row.id} | raw_id=${row.raw_device_user_id} | parsed=${row.parsed_employee_code} | current=${row.current_emp_code} | status=${row.current_resolution_status}`);
      }
      console.log('');
      console.log('Dry run complete. Re-run with --apply to update records.');
      return;
    }

    // Process in batches
    console.log('Starting batch processing...');
    console.log('');

    let batchNumber = 0;
    let hasMoreRows = true;
    let lastId: number | null = null;

    while (hasMoreRows) {
      batchNumber++;

      // Build query with pagination using TOP and WHERE id > lastId
      let batchQuery = `
        SELECT TOP ${batchSize}
          s.id,
          s.raw_device_user_id,
          r.resolved_nik,
          r.current_emp_code,
          r.current_resolution_status AS current_mapping_status,
          r.current_resolution_reason AS current_mapping_reason,
          r.current_resolved_at
        FROM attendance_scan_logs s
        INNER JOIN zkteco_absensi_user_registry r
          ON r.raw_device_user_id = s.raw_device_user_id
        WHERE s.current_emp_code IS NULL
          AND r.current_resolution_status IS NOT NULL
      `;

      const request = pool.request();

      // Add date filters
      if (dateFrom) {
        batchQuery += ` AND s.scan_date >= @dateFrom`;
        request.input('dateFrom', mssql.VarChar, dateFrom.toISOString().split('T')[0]);
      }
      if (dateTo) {
        batchQuery += ` AND s.scan_date <= @dateTo`;
        request.input('dateTo', mssql.VarChar, dateTo.toISOString().split('T')[0]);
      }

      // Add pagination for large table processing
      if (lastId !== null) {
        batchQuery += ` AND s.id > @lastId`;
        request.input('lastId', mssql.Int, Number(lastId));
      }

      batchQuery += ` ORDER BY s.id`;

      const batchResult = await request.query(batchQuery);
      const rows = batchResult.recordset;

      if (rows.length === 0) {
        hasMoreRows = false;
        break;
      }

      // Update this batch
      const idList = rows.map((r) => r.id);
      const maxIdInBatch = Math.max(...idList.map(Number));
      lastId = maxIdInBatch;

      // Build UPDATE statement for this batch
      // Using table-valued constructor for efficient bulk update
      const updateResult = await pool.request()
        .input('resolvedAt', mssql.DateTime2, new Date())
        .query(`
          UPDATE s
          SET
            s.resolved_nik = u.resolved_nik,
            s.current_emp_code = u.current_emp_code,
            s.current_mapping_status = u.current_mapping_status,
            s.current_mapping_reason = u.current_mapping_reason,
            s.current_resolved_at = @resolvedAt
          FROM attendance_scan_logs s
          INNER JOIN (
            SELECT
              id,
              raw_device_user_id,
              resolved_nik,
              current_emp_code,
              current_mapping_status,
              current_mapping_reason
            FROM (
              VALUES ${rows.map((r) => `(
                ${Number(r.id)},
                N'${String(r.raw_device_user_id).replace(/'/g, "''")}',
                ${r.resolved_nik ? `N'${String(r.resolved_nik).replace(/'/g, "''")}'` : 'NULL'},
                ${r.current_emp_code ? `N'${String(r.current_emp_code).replace(/'/g, "''")}'` : 'NULL'},
                ${r.current_mapping_status ? `N'${String(r.current_mapping_status).replace(/'/g, "''")}'` : 'NULL'},
                ${r.current_mapping_reason ? `N'${String(r.current_mapping_reason).replace(/'/g, "''")}'` : 'NULL'}
              )`).join(',')}
            ) AS u(id, raw_device_user_id, resolved_nik, current_emp_code, current_mapping_status, current_mapping_reason)
          ) u ON u.id = s.id
        `);

      const rowsUpdated = updateResult.rowsAffected?.[0] ?? 0;
      summary.updated_rows += rowsUpdated;
      summary.matched_registry += rows.length;
      summary.batches_processed++;
      summary.skipped_rows += (rows.length - rowsUpdated);

      console.log(`Batch ${batchNumber}/${summary.total_batches}: updated=${rowsUpdated}, last_id=${lastId}`);

      // If we got fewer rows than batch size, we're done
      if (rows.length < batchSize) {
        hasMoreRows = false;
      }

      // Small delay between batches to reduce lock contention
      if (hasMoreRows) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log('');
    console.log('============================================================');
    console.log('Backfill Complete');
    console.log('============================================================');
    console.log('');
    console.log('Summary:');
    console.log(`  Mode:              ${summary.mode}`);
    console.log(`  Batch size:        ${summary.batch_size}`);
    console.log(`  Batches processed: ${summary.batches_processed}`);
    console.log(`  Registry matches:  ${summary.matched_registry}`);
    console.log(`  Rows updated:      ${summary.updated_rows}`);
    console.log(`  Rows skipped:       ${summary.skipped_rows}`);
    console.log(`  Date range:        ${summary.by_date_range.from ?? 'N/A'} to ${summary.by_date_range.to ?? 'N/A'}`);
    console.log('');

  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error('');
  console.error('ERROR:', error instanceof Error ? error.message : String(error));
  console.error('');
  process.exit(1);
});
