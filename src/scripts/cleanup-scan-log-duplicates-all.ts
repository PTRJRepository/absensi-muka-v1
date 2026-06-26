// Script: cleanup-scan-log-duplicates-all.ts
// Purpose: Delete ALL duplicates from attendance_scan_logs in one targeted pass
// Strategy: ROW_NUMBER() per group, delete all rows where rn > 1
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
    requestTimeout: 600000,
    connectionTimeout: 30000,
  };
}

async function run() {
  loadEnv();
  const pool = await mssql.connect(dbConfig());

  // Get current state
  const before = await pool.request().query('SELECT COUNT(*) as cnt FROM attendance_scan_logs');
  const dupGroups = await pool.request().query(`
    SELECT COUNT_BIG(*) as cnt
    FROM (
      SELECT machine_code, raw_device_user_id, raw_record_time
      FROM attendance_scan_logs WITH (NOLOCK)
      GROUP BY machine_code, raw_device_user_id, raw_record_time
      HAVING COUNT(*) > 1
    ) g
  `);

  console.log(`Rows before: ${before.recordset[0].cnt}`);
  console.log(`Duplicate groups: ${dupGroups.recordset[0].cnt}`);

  if (Number(dupGroups.recordset[0].cnt) === 0) {
    console.log('No duplicates — adding constraint directly');
  } else {
    console.log('\n=== Deleting ALL duplicates in one pass (keep lowest ID per group) ===');
    const start = Date.now();

    const result = await pool.request().query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY machine_code, raw_device_user_id, raw_record_time
            ORDER BY id ASC
          ) AS rn
        FROM attendance_scan_logs WITH (NOLOCK)
      )
      DELETE FROM ranked WHERE rn > 1
    `);

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`Deleted: ${result.rowsAffected[0]} rows`);
    console.log(`Time: ${elapsed}s`);
  }

  // Verify no more duplicates
  const remaining = await pool.request().query(`
    SELECT COUNT_BIG(*) as remaining_dup_count
    FROM (
      SELECT machine_code, raw_device_user_id, raw_record_time
      FROM attendance_scan_logs WITH (NOLOCK)
      GROUP BY machine_code, raw_device_user_id, raw_record_time
      HAVING COUNT(*) > 1
    ) g
  `);

  const after = await pool.request().query('SELECT COUNT(*) as cnt FROM attendance_scan_logs');
  console.log(`\nDuplicate groups remaining: ${remaining.recordset[0].remaining_dup_count}`);
  console.log(`Rows after: ${after.recordset[0].cnt}`);

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

  await pool.close();
  console.log('\nDone');
}

run().catch((err: Error) => { console.error('Failed:', err.message); process.exit(1); });
