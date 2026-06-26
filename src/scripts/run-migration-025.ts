/**
 * Run Migration 025: Delete Short Absensi ID (< 5 digits)
 *
 * Usage: npx ts-node src/scripts/run-migration-025.ts
 */

import fs from 'fs';
import path from 'path';
// @ts-ignore
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
  const primaryValue = clean(process.env[primary]);
  const fallbackValue = fallback ? clean(process.env[fallback]) : undefined;
  return primaryValue || fallbackValue || defaultValue;
}

function dbConfig() {
  return {
    server: envValue('DB_SERVER', 'DATABASE_PROFILES_SERVER_PROFILE_1_SERVER', '10.0.0.110')!,
    port: Number(envValue('DB_PORT', 'DATABASE_PROFILES_SERVER_PROFILE_1_PORT', '1433')),
    user: envValue('DB_USER', 'DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME')!,
    password: envValue('DB_PASSWORD', 'DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD')!,
    database: envValue('DB_NAME', undefined, 'rebinmas_absensi_monitoring'),
    options: {
      encrypt: envValue('DB_ENCRYPT', 'DATABASE_PROFILES_SERVER_PROFILE_1_ENCRYPT', 'false') === 'true',
      trustServerCertificate: envValue('DB_TRUST_SERVER_CERTIFICATE', undefined, 'true') !== 'false'
    },
  };
}

async function main() {
  loadEnv();
  const dbName = process.env.DB_NAME ?? 'rebinmas_absensi_monitoring';
  const pool = await mssql.connect(dbConfig());

  console.log('========================================');
  console.log('MIGRATION 025: Delete Short Absensi ID');
  console.log('========================================\n');

  try {
    // Check how many short IDs exist
    console.log('--- Checking for short ID records (< 5 digits) ---');
    const countResult = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM [${dbName}].[dbo].[attendance_scan_logs]
      WHERE LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) < 5
        AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 0
    `);

    const shortCount = countResult.recordset[0].count;
    console.log(`Found ${shortCount} records with short IDs\n`);

    if (shortCount === 0) {
      console.log('No short ID records found. Nothing to delete.');
    } else {
      // Show sample
      console.log('--- Sample of records to be deleted ---');
      const sampleResult = await pool.request().query(`
        SELECT TOP 10
            id,
            machine_code,
            raw_device_user_id,
            LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) AS raw_id_length,
            parsed_employee_code,
            mapping_status,
            scan_date
        FROM [${dbName}].[dbo].[attendance_scan_logs]
        WHERE LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) < 5
          AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 0
        ORDER BY scan_date DESC
      `);

      for (const row of sampleResult.recordset) {
        console.log(`  ${row.machine_code}: "${row.raw_device_user_id}" (${row.raw_id_length} digit) - parsed: ${row.parsed_employee_code || 'NULL'}`);
      }

      // First, delete from child table (attendance_imports_old) that references these scan logs
      console.log('\n--- Deleting from attendance_imports_old (child table) ---');
      const deleteChildResult = await pool.request().query(`
        DELETE FROM [${dbName}].[dbo].[attendance_imports_old]
        WHERE raw_scan_log_id IN (
          SELECT id FROM [${dbName}].[dbo].[attendance_scan_logs]
          WHERE LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) < 5
            AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 0
        )
      `);
      console.log(`Child records deleted: ${deleteChildResult.rowsAffected[0]}`);

      // Also check attendance_imports if it exists and has the same constraint
      console.log('\n--- Deleting from attendance_imports (if exists) ---');
      try {
        const deleteImportsResult = await pool.request().query(`
          DELETE FROM [${dbName}].[dbo].[attendance_imports]
          WHERE raw_scan_log_id IN (
            SELECT id FROM [${dbName}].[dbo].[attendance_scan_logs]
            WHERE LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) < 5
              AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 0
          )
        `);
        console.log(`attendance_imports records deleted: ${deleteImportsResult.rowsAffected[0]}`);
      } catch (e: any) {
        if (!e.message.includes('Invalid object name')) {
          throw e;
        }
        console.log('attendance_imports table not found, skipping');
      }

      // Now delete from attendance_scan_logs
      console.log('\n--- Deleting from attendance_scan_logs ---');
      const deleteResult = await pool.request().query(`
        DELETE FROM [${dbName}].[dbo].[attendance_scan_logs]
        WHERE LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) < 5
          AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 0
      `);

      console.log(`Scan log records deleted: ${deleteResult.rowsAffected[0]}`);
    }

    // Final validation
    console.log('\n--- Final validation ---');
    const remainingResult = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM [${dbName}].[dbo].[attendance_scan_logs]
      WHERE LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) < 5
        AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 0
    `);

    const remaining = remainingResult.recordset[0].count;
    if (remaining === 0) {
      console.log('✓ VALIDATION PASSED: No short ID records remaining');
    } else {
      console.log(`✗ WARNING: ${remaining} short ID records still exist`);
    }

    console.log('\n========================================');
    console.log('MIGRATION 025 COMPLETED');
    console.log('========================================');

  } catch (error: any) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
