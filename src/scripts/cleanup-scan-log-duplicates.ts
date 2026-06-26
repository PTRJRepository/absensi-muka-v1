// Script: cleanup-scan-log-duplicates.ts
// Purpose: Find and remove duplicate rows before adding UNIQUE constraint
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
  };
}

async function run() {
  loadEnv();
  const pool = await mssql.connect(dbConfig());

  console.log('=== Finding duplicate groups ===');

  const dupes = await pool.request().query(`
    SELECT machine_code, raw_device_user_id, raw_record_time, COUNT(*) as cnt
    FROM attendance_scan_logs
    GROUP BY machine_code, raw_device_user_id, raw_record_time
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);

  console.log(`Found ${dupes.recordset.length} duplicate groups`);
  if (dupes.recordset.length > 0) {
    dupes.recordset.slice(0, 5).forEach((r: any) => {
      console.log(`  ${r.machine_code} / ${r.raw_device_user_id} / ${r.raw_record_time} => ${r.cnt} rows`);
    });
  }

  if (dupes.recordset.length === 0) {
    console.log('No duplicates found — safe to add UNIQUE constraint');
  } else {
    console.log('\n=== Cleaning duplicates (keep lowest ID per group) ===');
    const result = await pool.request().query(`
      DELETE FROM a
      FROM attendance_scan_logs a
      INNER JOIN (
        SELECT machine_code, raw_device_user_id, raw_record_time, MIN(id) AS keep_id
        FROM attendance_scan_logs
        GROUP BY machine_code, raw_device_user_id, raw_record_time
        HAVING COUNT(*) > 1
      ) dup
        ON a.machine_code = dup.machine_code
       AND a.raw_device_user_id = dup.raw_device_user_id
       AND a.raw_record_time = dup.raw_record_time
      WHERE a.id > dup.keep_id
    `);
    console.log(`Deleted ${result.rowsAffected[0]} duplicate rows`);
  }

  // Now add constraint
  console.log('\n=== Adding UNIQUE constraint ===');
  try {
    await pool.request().query(`
      ALTER TABLE dbo.attendance_scan_logs
      ADD CONSTRAINT uq_scan_logs_dedup UNIQUE (machine_code, raw_device_user_id, raw_record_time)
    `);
    console.log('[OK] UNIQUE constraint added');
  } catch (err: any) {
    if (err.message.includes('contains')) {
      console.log('[SKIP] UNIQUE constraint already exists');
    } else {
      console.error('[FAIL]', err.message);
    }
  }

  // Verification
  console.log('\n=== Final verification ===');
  const colCheck = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='attendance_scan_logs' AND COLUMN_NAME='zkteco_user_name'
  `);
  const constrCheck = await pool.request().query(`
    SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='attendance_scan_logs' AND CONSTRAINT_NAME='uq_scan_logs_dedup'
  `);
  const count = await pool.request().query('SELECT COUNT(*) as cnt FROM attendance_scan_logs');

  console.log(`zkteco_user_name: ${colCheck.recordset.length > 0 ? 'EXISTS' : 'MISSING'}`);
  console.log(`uq_scan_logs_dedup: ${constrCheck.recordset.length > 0 ? 'EXISTS' : 'MISSING'}`);
  console.log(`Final row count: ${count.recordset[0].cnt}`);

  await pool.close();
  console.log('\nDone');
}

run().catch((err: Error) => { console.error('Failed:', err.message); process.exit(1); });
