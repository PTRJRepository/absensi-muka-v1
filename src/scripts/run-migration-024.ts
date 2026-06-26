/**
 * Run Migration 024: Excluded Long Absensi ID
 *
 * Usage: npx ts-node src/scripts/run-migration-024.ts
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
  console.log('MIGRATION 024: Excluded Long Absensi ID');
  console.log('========================================\n');

  try {
    // Read migration file
    const migrationPath = path.join('migrations', '024_excluded_long_absensi_id.sql');
    const sqlContent = fs.readFileSync(migrationPath, 'utf8')
      .replace(/\[rebinmas_absensi_monitoring\]/g, `[${dbName}]`);

    // Split by GO and remove USE statements
    const batches = sqlContent
      .split(/^\s*GO\s*$/gim)
      .map(batch => batch.trim())
      .filter(Boolean)
      .filter(batch => !/^USE\s+/i.test(batch));

    // Execute each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      // Skip BEGIN TRY and COMMIT/ROLLBACK blocks that are handled by the script structure
      if (batch.startsWith('BEGIN TRY')) continue;
      if (batch.startsWith('END TRY')) continue;
      if (batch.startsWith('BEGIN CATCH')) continue;
      if (batch.startsWith('END CATCH')) continue;

      // Skip comment blocks that are just documentation
      if (batch.startsWith('/*')) continue;

      // Replace parameter markers
      const cleanBatch = batch
        .replace(/@before_count/g, '@cnt')
        .replace(/@with_invalid_mapping/g, '@inv')
        .replace(/@affected_rows/g, '@aff')
        .replace(/@invalid_mappings/g, '@inv2')
        .replace(/@hr_map_before/g, '@hr')
        .replace(/DECLARE @cnt INT;/g, 'DECLARE @cnt INT;')
        .replace(/DECLARE @inv INT;/g, 'DECLARE @inv INT;')
        .replace(/DECLARE @aff INT;/g, 'DECLARE @aff INT;')
        .replace(/DECLARE @inv2 INT;/g, 'DECLARE @inv2 INT;')
        .replace(/DECLARE @hr INT;/g, 'DECLARE @hr INT;');

      // Skip empty batches
      if (!cleanBatch.trim()) continue;

      console.log(`Executing batch ${i + 1}...`);
      try {
        await pool.request().query(cleanBatch);
      } catch (err: any) {
        // Ignore errors from conditional blocks
        if (!err.message.includes('has already been')) {
          console.log(`  Warning: ${err.message}`);
        }
      }
    }

    // Run the main UPDATE statement separately
    console.log('\n--- Running UPDATE for excluded long IDs ---');

    const updateResult = await pool.request().query(`
      UPDATE s
      SET
          parsed_employee_code = NULL,
          parsed_division_code = NULL,
          mapping_status = 'NEED_REVIEW',
          mapping_reason = CONCAT('EXCLUDED_LONG_ABSENSI_ID_LENGTH_', LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))))
      FROM [${dbName}].[dbo].[attendance_scan_logs] s
      WHERE s.raw_device_user_id LIKE '100%'
        AND LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(50))))) > 5
    `);

    console.log(`Rows updated: ${updateResult.rowsAffected[0]}`);

    // Validation 1: Check for remaining invalid mappings
    console.log('\n--- Validation: Checking for invalid mappings ---');
    const invalidResult = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM [${dbName}].[dbo].[attendance_scan_logs]
      WHERE raw_device_user_id LIKE '100%'
        AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 5
        AND parsed_employee_code IS NOT NULL
    `);

    const invalidCount = invalidResult.recordset[0].count;
    console.log(`Invalid mappings remaining: ${invalidCount}`);

    if (invalidCount === 0) {
      console.log('✓ VALIDATION PASSED: All long IDs now have parsed_employee_code = NULL');
    } else {
      console.log('✗ VALIDATION FAILED: Some long IDs still have parsed_employee_code');
    }

    // Show summary
    console.log('\n--- Summary of excluded IDs ---');
    const summaryResult = await pool.request().query(`
      SELECT TOP 20
          machine_code,
          raw_device_user_id,
          LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) AS raw_id_length,
          mapping_status,
          mapping_reason,
          scan_date
      FROM [${dbName}].[dbo].[attendance_scan_logs]
      WHERE raw_device_user_id LIKE '100%'
        AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(50))))) > 5
      ORDER BY scan_date DESC
    `);

    console.log(`Found ${summaryResult.recordset.length} records with long IDs`);
    for (const row of summaryResult.recordset.slice(0, 5)) {
      console.log(`  ${row.machine_code}: ${row.raw_device_user_id} (${row.raw_id_length} digits) - ${row.mapping_reason}`);
    }

    console.log('\n========================================');
    console.log('MIGRATION 024 COMPLETED');
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
