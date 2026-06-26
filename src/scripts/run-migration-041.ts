/**
 * Run Migration 041: sanitize short raw IDs and build long raw absensi registry.
 *
 * Usage:
 *   npx tsx src/scripts/run-migration-041.ts
 *   npx tsx src/scripts/run-migration-041.ts --apply
 */

import fs from 'fs';
// @ts-ignore - mssql package ships without local types in this repo
import mssql from 'mssql';

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

function envValue(primary: string, fallback?: string, defaultValue?: string) {
  const clean = (value: string | undefined) => value?.trim().replace(/^['"]|['"]$/g, '');
  return clean(process.env[primary]) || (fallback ? clean(process.env[fallback]) : undefined) || defaultValue;
}

function dbConfig() {
  return {
    server: envValue('DB_SERVER', 'DATABASE_PROFILES_SERVER_PROFILE_1_SERVER', '10.0.0.110')!,
    port: Number(envValue('DB_PORT', 'DATABASE_PROFILES_SERVER_PROFILE_1_PORT', '1433')),
    user: envValue('DB_USER', 'DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME', 'sa')!,
    password: envValue('DB_PASSWORD', 'DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD', '<DB_PASSWORD>')!,
    database: envValue('DB_NAME', undefined, 'rebinmas_absensi_monitoring')!,
    connectionTimeout: Number(envValue('DB_CONNECTION_TIMEOUT_MS', undefined, '30000')),
    requestTimeout: Number(envValue('DB_REQUEST_TIMEOUT_MS', undefined, '300000')),
    options: {
      encrypt: envValue('DB_ENCRYPT', 'DATABASE_PROFILES_SERVER_PROFILE_1_ENCRYPT', 'false') === 'true',
      trustServerCertificate: envValue('DB_TRUST_SERVER_CERTIFICATE', undefined, 'true') !== 'false',
    },
  };
}

function splitGo(sqlText: string) {
  return sqlText.split(/^\s*GO\s*$/gim).map((part) => part.trim()).filter(Boolean);
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const dbName = envValue('DB_NAME', undefined, 'rebinmas_absensi_monitoring')!;
  const migrationPath = 'migrations/041_sanitize_long_absensi_user_registry.sql';
  const sqlText = fs.readFileSync(migrationPath, 'utf8')
    .replace(/DECLARE @apply BIT = 0;/, `DECLARE @apply BIT = ${apply ? 1 : 0};`)
    .replace(/rebinmas_absensi_monitoring/g, dbName);

  console.log('============================================================');
  console.log('MIGRATION 041: Long raw absensi registry sanitization');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Database: ${dbName}`);
  console.log('============================================================\n');

  const pool = await mssql.connect(dbConfig());
  try {
    let batchNumber = 0;
    for (const batch of splitGo(sqlText)) {
      if (/^USE\s+/i.test(batch)) continue;
      batchNumber++;
      const result = await pool.request().query(batch);
      const recordsets = Array.isArray(result.recordsets)
        ? result.recordsets
        : Object.values((result.recordsets ?? {}) as Record<string, unknown[]>);
      for (const recordset of recordsets) {
        if (recordset.length === 0) continue;
        console.log(`--- Batch ${batchNumber} result (${recordset.length} rows) ---`);
        console.table(recordset.slice(0, 30));
      }
    }
  } finally {
    await pool.close();
  }

  console.log(`\nMigration 041 ${apply ? 'applied' : 'dry run completed'} successfully.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
