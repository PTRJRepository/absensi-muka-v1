/**
 * Run Migration 029: Fix long raw IDs with scanner prefix
 * Usage: npx ts-node src/scripts/run-migration-029.ts
 */

import fs from 'fs';
// @ts-ignore
import mssql from 'mssql';

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function connect() {
  return mssql.connect({
    server: process.env.DB_SERVER ?? '10.0.0.110',
    port: Number(process.env.DB_PORT ?? '1433'),
    user: process.env.DB_USER ?? 'sa',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'rebinmas_absensi_monitoring',
    options: { trustServerCertificate: true },
  });
}

function splitGo(sqlText: string) {
  return sqlText.split(/^\s*GO\s*$/gim).map((p) => p.trim()).filter(Boolean);
}

async function main() {
  loadEnv();

  console.log('============================================================');
  console.log('MIGRATION 029: Fix long raw IDs with scanner prefix');
  console.log('============================================================');
  console.log('');

  const dbName = process.env.DB_NAME ?? 'rebinmas_absensi_monitoring';
  const pool = await connect();
  console.log(`Connected to: ${dbName}\n`);

  const sqlFile = 'migrations/029_fix_long_raw_ids_with_scanner_prefix.sql';
  const sqlText = fs.readFileSync(sqlFile, 'utf8')
    .replace(/rebinmas_absensi_monitoring/g, dbName)
    .replace(/\[\[DB_NAME\]\]/g, dbName);

  const batches = splitGo(sqlText);
  let batchNum = 0;

  for (const batch of batches) {
    if (/^USE\s+/i.test(batch) || !batch.trim()) continue;
    batchNum++;

    try {
      const result = await pool.request().query(batch);
      if (result.recordset && result.recordset.length > 0) {
        console.log(`--- Batch ${batchNum} results ---`);
        if (result.recordset.length <= 30) {
          console.table(result.recordset);
        } else {
          console.log(`(${result.recordset.length} rows)`);
          console.table(result.recordset.slice(0, 10));
        }
      }
      if (result.rowsAffected?.length > 0 && result.rowsAffected[0] > 0) {
        console.log(`  Rows affected: ${result.rowsAffected[0]}`);
      }
    } catch (err: any) {
      if (!err.message?.includes('already exists') && !err.message?.includes('there is already')) {
        console.error(`Batch ${batchNum} SQL Error: ${err.message}`);
      }
    }
  }

  await pool.close();
  console.log('\nMigration 029 completed.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
