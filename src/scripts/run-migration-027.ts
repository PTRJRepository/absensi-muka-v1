/**
 * Run Migration 027: Fix Wrong Parsed Employee Codes
 * Purpose: Recalculate parsed_employee_code in attendance_scan_logs
 *          using correct SSOT parser algorithm (scanner prefix priority)
 *
 * Usage: npx ts-node src/scripts/run-migration-027.ts
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

function envValue(primary: string, fallback?: string, defaultValue?: string) {
  const clean = (value: string | undefined) => value?.trim().replace(/^['"]|['"]$/g, '');
  const primaryValue = clean(process.env[primary]);
  const fallbackValue = fallback ? clean(process.env[fallback]) : undefined;
  return primaryValue || fallbackValue || defaultValue;
}

async function connect() {
  const config = {
    server: envValue('DB_SERVER', 'DATABASE_PROFILES_SERVER_PROFILE_1_SERVER', '10.0.0.110')!,
    port: Number(envValue('DB_PORT', 'DATABASE_PROFILES_SERVER_PROFILE_1_PORT', '1433')),
    user: envValue('DB_USER', 'DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME')!,
    password: envValue('DB_PASSWORD', 'DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD')!,
    database: envValue('DB_NAME', undefined, 'rebinmas_absensi_monitoring'),
    options: {
      encrypt: envValue('DB_ENCRYPT', 'DATABASE_PROFILES_SERVER_PROFILE_1_ENCRYPT', 'false') === 'true',
      trustServerCertificate: envValue('DB_TRUST_SERVER_CERTIFICATE', undefined, 'true') !== 'false',
    },
  };
  return mssql.connect(config);
}

function splitGo(sqlText: string) {
  return sqlText.split(/^\s*GO\s*$/gim).map((part) => part.trim()).filter(Boolean);
}

async function main() {
  loadEnv();

  console.log('============================================================');
  console.log('MIGRATION 027: Fix Wrong Parsed Employee Codes');
  console.log('============================================================');
  console.log('');

  const dbName = process.env.DB_NAME ?? 'rebinmas_absensi_monitoring';
  const pool = await connect();
  console.log(`Connected to: ${dbName}`);
  console.log('');

  const sqlFile = 'migrations/027_fix_wrong_parsed_employee_codes.sql';
  const sqlText = fs.readFileSync(sqlFile, 'utf8')
    .replace(/rebinmas_absensi_monitoring/g, dbName)
    .replace(/\[\[DB_NAME\]\]/g, dbName);

  const batches = splitGo(sqlText);

  for (const batch of batches) {
    if (/^USE\s+/i.test(batch)) continue;
    if (!batch.trim()) continue;

    try {
      const result = await pool.request().query(batch);
      if (result.recordset && result.recordset.length > 0) {
        console.table(result.recordset);
      }
      if (result.rowsAffected && result.rowsAffected.length > 0 && result.rowsAffected[0] > 0) {
        // Statement affected rows
      }
    } catch (err: any) {
      if (err.message?.includes('already exists') || err.message?.includes('there is already an object')) {
        continue;
      }
      console.error(`SQL Error: ${err.message}`);
    }
  }

  await pool.close();
  console.log('');
  console.log('Migration 027 completed.');
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
