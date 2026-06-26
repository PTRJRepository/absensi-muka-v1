/**
 * Sync HR Employee Current Snapshot
 * Purpose: Populate hr_employee_current_snapshot and employee_code_history
 * Schedule: Run daily or on-demand
 * Usage: node dist/scripts/sync-hr-current-snapshot.js [--dry-run] [--full-sync]
 *
 * HR Resolution Rule:
 *   ROW_NUMBER() OVER (
 *     PARTITION BY LTRIM(RTRIM(NewICNo))
 *     ORDER BY
 *       CASE WHEN LTRIM(RTRIM(Status)) = '1' THEN 0 ELSE 1 END,
 *       UpdateDate DESC,
 *       CreateDate DESC,
 *       EmpCode DESC
 *   ) AS current_rank
 */

import * as mssql from 'mssql';
import * as dotenv from 'dotenv';

dotenv.config();

// CLI flags
const dryRun = process.argv.includes('--dry-run');
const fullSync = process.argv.includes('--full-sync');

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

// HR database connection config (db_ptrj)
const hrDbConfig: mssql.config = {
  server: HR_DB_SERVER,
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'DB_PTRJ',
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

/**
 * Normalize NIK: trim whitespace and remove extra spaces
 */
function normalizeNik(nik: string | null | undefined): string {
  return nik?.trim().replace(/\s+/g, '') ?? '';
}

/**
 * Escape single quotes for SQL string literals
 */
function escapeSqlString(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str).replace(/'/g, "''");
}

/**
 * Format datetime for SQL or null
 */
function formatDateTime(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

interface HREmployeeRow {
  EmpCode: string;
  EmpName: string;
  LocCode: string;
  NewICNo: string;
  Status: string;
  CreateDate: Date | null;
  UpdateDate: Date | null;
}

interface HREmployeeWithRank extends HREmployeeRow {
  current_rank: number;
  nik_normalized: string;
  is_active: number;
}

interface SyncSummary {
  total_hr_rows: number;
  total_distinct_nik: number;
  missing_nik: number;
  duplicate_nik: number;
  ambiguous_nik: number;
  snapshot_rows: number;
  history_rows: number;
}

async function log(message: string, ...args: unknown[]): Promise<void> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

async function main(): Promise<void> {
  const startTime = Date.now();
  log('=== HR Employee Current Snapshot Sync ===');
  log(`Dry run: ${dryRun}`);
  log(`Full sync: ${fullSync}`);
  log(`HR DB Server: ${HR_DB_SERVER}`);
  log(`Local DB Server: ${LOCAL_DB_SERVER}`);
  log('');

  let hrPool: mssql.ConnectionPool | null = null;
  let localPool: mssql.ConnectionPool | null = null;

  try {
    // Step 1: Fetch all HR_EMPLOYEE rows with ranking
    log('');
    log('Step 1: Fetching HR_EMPLOYEE data with current_rank...');

    const hrQuery = `
      SELECT
        RTRIM(LTRIM(EmpCode)) AS EmpCode,
        RTRIM(LTRIM(EmpName)) AS EmpName,
        RTRIM(LTRIM(LocCode)) AS LocCode,
        RTRIM(LTRIM(NewICNo)) AS NewICNo,
        RTRIM(LTRIM(Status)) AS Status,
        CreateDate,
        UpdateDate,
        -- Ranking to determine current row per NIK
        ROW_NUMBER() OVER (
          PARTITION BY LTRIM(RTRIM(NewICNo))
          ORDER BY
            CASE WHEN LTRIM(RTRIM(Status)) = '1' THEN 0 ELSE 1 END,
            UpdateDate DESC,
            CreateDate DESC,
            EmpCode DESC
        ) AS current_rank,
        -- Normalized NIK for joins
        LTRIM(RTRIM(NewICNo)) AS nik_normalized,
        -- Is active flag
        CASE WHEN LTRIM(RTRIM(Status)) = '1' THEN 1 ELSE 0 END AS is_active
      FROM dbo.HR_EMPLOYEE
    `;

    log('Connecting to HR database (db_ptrj)...');
    hrPool = await mssql.connect(hrDbConfig);
    log('HR database connected successfully');
    const hrResult = await hrPool.request().query<HREmployeeWithRank>(hrQuery);
    const allRows = hrResult.recordset;
    await hrPool.close();
    log('HR database connection closed');

    // Connect to local database
    log('Connecting to local database...');
    localPool = await mssql.connect(localDbConfig);
    log('Local database connected successfully');

    log(`  Total HR rows fetched: ${allRows.length}`);

    // Analyze data
    const nikGroups = new Map<string, HREmployeeWithRank[]>();
    let missingNik = 0;
    let duplicateNik = 0;

    for (const row of allRows) {
      const nik = row.nik_normalized;
      if (!nik) {
        missingNik++;
        continue;
      }
      const group = nikGroups.get(nik) || [];
      group.push(row);
      nikGroups.set(nik, group);
    }

    // Count NIKs with multiple EmpCodes (potential duplicates)
    for (const group of Array.from(nikGroups.values())) {
      if (group.length > 1) {
        // Check if all rows have different EmpCodes
        const empCodes = new Set(group.map(r => r.EmpCode));
        if (empCodes.size > 1) {
          duplicateNik++;
        }
      }
    }

    const totalDistinctNik = nikGroups.size;

    log(`  Distinct NIKs: ${totalDistinctNik}`);
    log(`  Rows with missing NIK: ${missingNik}`);
    log(`  NIKs with multiple EmpCodes: ${duplicateNik}`);

    // Step 2: Clear tables based on sync mode
    log('');
    log('Step 2: Preparing destination tables...');

    if (fullSync) {
      log('  Full sync mode: Truncating tables...');
      if (!dryRun) {
        await localPool.request().query(`
          TRUNCATE TABLE dbo.hr_employee_current_snapshot;
          TRUNCATE TABLE dbo.employee_code_history;
        `);
        log('  Tables truncated successfully');
      } else {
        log('  [DRY RUN] Tables would be truncated');
      }
    } else {
      log('  Incremental sync mode: Tables will be upserted');
    }

    // Step 3: Populate employee_code_history (ALL rows)
    log('');
    log('Step 3: Populating employee_code_history...');

    const historyRows = allRows.filter(r => r.nik_normalized); // Skip rows without NIK

    if (dryRun) {
      log(`  [DRY RUN] Would insert ${historyRows.length} history rows`);
    } else {
      // Batch insert for better performance
      const batchSize = 500;
      let insertedHistory = 0;

      for (let i = 0; i < historyRows.length; i += batchSize) {
        const batch = historyRows.slice(i, i + batchSize);
        const values = batch.map(row => {
          return `(
            N'${escapeSqlString(row.nik_normalized)}',
            N'${escapeSqlString(row.EmpCode)}',
            N'${escapeSqlString(row.EmpName)}',
            N'${escapeSqlString(row.LocCode)}',
            N'${escapeSqlString(row.Status)}',
            ${row.CreateDate ? `'${formatDateTime(row.CreateDate)}'` : 'NULL'},
            ${row.UpdateDate ? `'${formatDateTime(row.UpdateDate)}'` : 'NULL'},
            ${Number(row.current_rank) === 1 ? 1 : 0},
            N'db_ptrj.dbo.HR_EMPLOYEE',
            SYSUTCDATETIME()
          )`;
        }).join(',\n');

        const insertQuery = `
          INSERT INTO dbo.employee_code_history (
            nik, emp_code, emp_name, loc_code, hr_status,
            create_date, update_date, is_current, source_table, synced_at
          )
          VALUES ${values}
        `;

        if (fullSync) {
          await localPool.request().query(insertQuery);
        } else {
          // For incremental, use MERGE
          await localPool.request().query(`
            MERGE INTO dbo.employee_code_history AS target
            USING (
              SELECT
                nik, emp_code, emp_name, loc_code, hr_status,
                create_date, update_date, is_current, source_table, synced_at
              FROM (
                VALUES ${values}
              ) AS src (
                nik, emp_code, emp_name, loc_code, hr_status,
                create_date, update_date, is_current, source_table, synced_at
              )
            ) AS source ON (
              target.nik = source.nik AND
              target.emp_code = source.emp_code AND
              target.source_table = 'db_ptrj.dbo.HR_EMPLOYEE'
            )
            WHEN MATCHED THEN
              UPDATE SET
                emp_name = source.emp_name,
                loc_code = source.loc_code,
                hr_status = source.hr_status,
                create_date = source.create_date,
                update_date = source.update_date,
                is_current = source.is_current,
                synced_at = source.synced_at
            WHEN NOT MATCHED THEN
              INSERT (nik, emp_code, emp_name, loc_code, hr_status, create_date, update_date, is_current, source_table, synced_at)
              VALUES (source.nik, source.emp_code, source.emp_name, source.loc_code, source.hr_status, source.create_date, source.update_date, source.is_current, source.source_table, source.synced_at);
          `);
        }

        insertedHistory += batch.length;
        if (insertedHistory % 1000 === 0 || insertedHistory === historyRows.length) {
          log(`  Inserted ${insertedHistory}/${historyRows.length} history rows`);
        }
      }
    }

    // Step 4: Populate hr_employee_current_snapshot (only current rows)
    log('');
    log('Step 4: Populating hr_employee_current_snapshot...');

    // Get current rows (current_rank = 1)
    const currentRows = allRows.filter(r => Number(r.current_rank) === 1 && r.nik_normalized);

    // For each NIK, calculate active_count and check for ambiguity
    const nikStats = new Map<string, { activeCount: number; rowCount: number }>();
    for (const row of allRows) {
      if (!row.nik_normalized) continue;
      const stats = nikStats.get(row.nik_normalized) || { activeCount: 0, rowCount: 0 };
      stats.rowCount++;
      if (row.is_active === 1) stats.activeCount++;
      nikStats.set(row.nik_normalized, stats);
    }

    // Identify ambiguous NIKs (multiple active rows)
    let ambiguousNik = 0;
    for (const [nik, stats] of Array.from(nikStats.entries())) {
      if (stats.activeCount > 1) {
        ambiguousNik++;
      }
    }

    log(`  Current rows to insert: ${currentRows.length}`);
    log(`  Ambiguous NIKs (multiple active rows): ${ambiguousNik}`);

    if (dryRun) {
      log(`  [DRY RUN] Would insert ${currentRows.length} snapshot rows`);
    } else {
      // Clear and repopulate snapshot table
      if (fullSync) {
        await localPool.request().query('DELETE FROM dbo.hr_employee_current_snapshot');
      }

      // Batch insert
      const batchSize = 500;
      let insertedSnapshot = 0;

      for (let i = 0; i < currentRows.length; i += batchSize) {
        const batch = currentRows.slice(i, i + batchSize);
        const values = batch.map(row => {
          const stats = nikStats.get(row.nik_normalized) || { activeCount: 0, rowCount: 0 };
          const isAmbiguous = stats.activeCount > 1 ? 1 : 0;
          const ambiguityReason = isAmbiguous
            ? `Multiple active rows (${stats.activeCount}) - tiebreaker used: UpdateDate DESC, CreateDate DESC, EmpCode DESC`
            : null;

          return `(
            N'${escapeSqlString(row.nik_normalized)}',
            N'${escapeSqlString(row.EmpCode)}',
            N'${escapeSqlString(row.EmpName)}',
            N'${escapeSqlString(row.LocCode)}',
            N'${escapeSqlString(row.Status)}',
            ${row.CreateDate ? `'${formatDateTime(row.CreateDate)}'` : 'NULL'},
            ${row.UpdateDate ? `'${formatDateTime(row.UpdateDate)}'` : 'NULL'},
            ${stats.activeCount},
            ${stats.rowCount},
            ${isAmbiguous},
            ${ambiguityReason ? `N'${escapeSqlString(ambiguityReason)}'` : 'NULL'},
            SYSUTCDATETIME()
          )`;
        }).join(',\n');

        const insertQuery = `
          INSERT INTO dbo.hr_employee_current_snapshot (
            nik, current_emp_code, current_emp_name, current_loc_code, current_status,
            current_create_date, current_update_date, active_count, row_count,
            is_ambiguous, ambiguity_reason, synced_at
          )
          VALUES ${values}
        `;

        if (fullSync) {
          await localPool.request().query(insertQuery);
        } else {
          // For incremental, use MERGE
          await localPool.request().query(`
            MERGE INTO dbo.hr_employee_current_snapshot AS target
            USING (
              SELECT * FROM (
                VALUES ${values}
              ) AS src (
                nik, current_emp_code, current_emp_name, current_loc_code, current_status,
                current_create_date, current_update_date, active_count, row_count,
                is_ambiguous, ambiguity_reason, synced_at
              )
            ) AS source ON target.nik = source.nik
            WHEN MATCHED THEN
              UPDATE SET
                current_emp_code = source.current_emp_code,
                current_emp_name = source.current_emp_name,
                current_loc_code = source.current_loc_code,
                current_status = source.current_status,
                current_create_date = source.current_create_date,
                current_update_date = source.current_update_date,
                active_count = source.active_count,
                row_count = source.row_count,
                is_ambiguous = source.is_ambiguous,
                ambiguity_reason = source.ambiguity_reason,
                synced_at = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN
              INSERT (nik, current_emp_code, current_emp_name, current_loc_code, current_status, current_create_date, current_update_date, active_count, row_count, is_ambiguous, ambiguity_reason, synced_at)
              VALUES (source.nik, source.current_emp_code, source.current_emp_name, source.current_loc_code, source.current_status, source.current_create_date, source.current_update_date, source.active_count, source.row_count, source.is_ambiguous, source.ambiguity_reason, source.synced_at);
          `);
        }

        insertedSnapshot += batch.length;
        if (insertedSnapshot % 1000 === 0 || insertedSnapshot === currentRows.length) {
          log(`  Inserted ${insertedSnapshot}/${currentRows.length} snapshot rows`);
        }
      }
    }

    // Step 5: Final summary
    log('');
    log('Step 5: Generating summary...');

    let snapshotRows = 0;
    let historyRowsCount = 0;

    if (!dryRun) {
      const snapshotCount = await localPool.request().query<{ cnt: number }>(
        'SELECT COUNT(*) AS cnt FROM dbo.hr_employee_current_snapshot'
      );
      snapshotRows = snapshotCount.recordset[0]?.cnt ?? 0;

      const historyCount = await localPool.request().query<{ cnt: number }>(
        'SELECT COUNT(*) AS cnt FROM dbo.employee_code_history'
      );
      historyRowsCount = historyCount.recordset[0]?.cnt ?? 0;
    }

    const summary: SyncSummary = {
      total_hr_rows: allRows.length,
      total_distinct_nik: totalDistinctNik,
      missing_nik: missingNik,
      duplicate_nik: duplicateNik,
      ambiguous_nik: ambiguousNik,
      snapshot_rows: snapshotRows,
      history_rows: historyRowsCount,
    };

    const elapsedMs = Date.now() - startTime;

    log('');
    log('=== Sync Summary ===');
    log(`  total_hr_rows: ${summary.total_hr_rows}`);
    log(`  total_distinct_nik: ${summary.total_distinct_nik}`);
    log(`  missing_nik: ${summary.missing_nik}`);
    log(`  duplicate_nik: ${summary.duplicate_nik}`);
    log(`  ambiguous_nik: ${summary.ambiguous_nik}`);
    log(`  snapshot_rows: ${summary.snapshot_rows}`);
    log(`  history_rows: ${summary.history_rows}`);
    log(`  elapsed_ms: ${elapsedMs}`);
    log('');
    log('Sync completed successfully!');

  } catch (error) {
    log('');
    log('ERROR: Sync failed!');
    log(String(error));
    process.exit(1);
  } finally {
    if (localPool) {
      await localPool.close();
      log('Local database connection closed');
    }
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
