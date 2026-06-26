// Script: cleanup-scan-log-duplicates-batch.ts
// Purpose: Batch delete duplicates from attendance_scan_logs (keep lowest ID per group)
// Then add UNIQUE constraint uq_scan_logs_dedup
// @ts-ignore
import mssql from 'mssql';

function loadEnv() {
  const fs = require('fs');
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
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
    requestTimeout: 300000,
    connectionTimeout: 30000,
  };
}

async function getRowCount(pool: any): Promise<number> {
  const r = await pool.request().query('SELECT COUNT(*) as cnt FROM attendance_scan_logs');
  return Number(r.recordset[0].cnt);
}

async function getDupGroupCount(pool: any): Promise<number> {
  const r = await pool.request().query(`
    SELECT COUNT_BIG(*) as dup_count
    FROM (
      SELECT machine_code, raw_device_user_id, raw_record_time
      FROM attendance_scan_logs WITH (NOLOCK)
      GROUP BY machine_code, raw_device_user_id, raw_record_time
      HAVING COUNT(*) > 1
    ) AS dup_groups
  `);
  return Number(r.recordset[0].dup_count);
}

async function run() {
  loadEnv();
  const pool = await mssql.connect(dbConfig());

  const before = await getRowCount(pool);
  const dupCount = await getDupGroupCount(pool);
  console.log(`Rows before: ${before}`);
  console.log(`Duplicate groups: ${dupCount}`);

  if (dupCount === 0) {
    console.log('No duplicates found');
  } else {
    const BATCH_SIZE = 2000;
    let totalDeleted = 0;
    let iteration = 0;
    const MAX_ITERATIONS = 200;

    console.log(`\n=== Batch deleting (keep lowest ID, batch=${BATCH_SIZE}) ===`);

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      const result = await pool.request().query(`
        WITH dup_cte AS (
          SELECT TOP (${BATCH_SIZE})
            id,
            ROW_NUMBER() OVER (
              PARTITION BY machine_code, raw_device_user_id, raw_record_time
              ORDER BY id ASC
            ) AS rn
          FROM attendance_scan_logs WITH (NOLOCK)
        )
        DELETE FROM dup_cte WHERE rn > 1
      `);

      const deleted = result.rowsAffected[0];
      totalDeleted += deleted;
      process.stdout.write(`  Iter ${iteration}: deleted ${deleted} (cumulative: ${totalDeleted})\n`);

      if (deleted === 0) {
        console.log('\n  No more duplicates to delete');
        break;
      }
    }

    const after = await getRowCount(pool);
    const remainingDupes = await getDupGroupCount(pool);

    console.log(`\n=== Cleanup Done ===`);
    console.log(`Total deleted: ${totalDeleted}`);
    console.log(`Rows after: ${after}`);
    console.log(`Expected: ${before - totalDeleted}, Actual: ${after}`);
    console.log(`Duplicate groups remaining: ${remainingDupes}`);
  }

  // Add UNIQUE constraint
  console.log(`\n=== Adding UNIQUE constraint ===`);
  try {
    await pool.request().query(`
      ALTER TABLE dbo.attendance_scan_logs
      ADD CONSTRAINT uq_scan_logs_dedup UNIQUE (machine_code, raw_device_user_id, raw_record_time)
    `);
    console.log('[OK] UNIQUE constraint uq_scan_logs_dedup added');
  } catch (err: any) {
    const msg = err.message.toLowerCase();
    if (msg.includes('contains') || msg.includes('already exists')) {
      console.log('[SKIP] UNIQUE constraint already exists');
    } else {
      console.error('[FAIL]', err.message);
    }
  }

  // Final verification
  console.log(`\n=== Final State ===`);
  console.log(`Total rows: ${await getRowCount(pool)}`);

  await pool.close();
  console.log('Done');
}

run().catch((err: Error) => { console.error('Failed:', err.message); process.exit(1); });
