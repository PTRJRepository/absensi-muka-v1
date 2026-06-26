// Script: run-057-migration.ts
// Purpose: Backup attendance_scan_logs + run migration 057
import fs from 'fs';
import path from 'path';
// @ts-ignore
import mssql from 'mssql';

function loadEnv() {
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

function splitGo(sqlText: string) {
  return sqlText.split(/^\s*GO\s*$/gim).map((part) => part.trim()).filter(Boolean);
}

async function run() {
  loadEnv();
  const pool = await mssql.connect(dbConfig());

  console.log('=== STEP 1: Backup attendance_scan_logs ===');

  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const timeStr = `${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
  const backupTable = `attendance_scan_logs_backup_${dateStr}_${timeStr}`;
  const rowCountResult = await pool.request().query('SELECT COUNT(*) as cnt FROM attendance_scan_logs');
  const totalRows = rowCountResult.recordset[0].cnt;
  console.log(`Total rows to backup: ${totalRows}`);

  if (totalRows > 0) {
    const backupSql = `SELECT * INTO [dbo].[${backupTable}] FROM [dbo].[attendance_scan_logs]`;
    await pool.request().query(backupSql);
    console.log(`[OK] Backup table created: ${backupTable}`);
  } else {
    console.log('[SKIP] No rows to backup');
  }

  console.log('\n=== STEP 2: Run migration 057 (manual) ===');

  // Step 2a: Add zkteco_user_name column
  const colExists = await pool.request().query(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND COLUMN_NAME = 'zkteco_user_name'
  `);
  if (colExists.recordset.length === 0) {
    await pool.request().query(`
      ALTER TABLE dbo.attendance_scan_logs ADD zkteco_user_name NVARCHAR(150) NULL
    `);
    console.log('[OK] Added zkteco_user_name column');
  } else {
    console.log('[SKIP] zkteco_user_name column already exists');
  }

  // Step 2b: Add UNIQUE constraint (skip dedup cleanup since scan_logs already has dedup via INSERT IF NOT EXISTS)
  const constrExists = await pool.request().query(`
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND CONSTRAINT_NAME = 'uq_scan_logs_dedup'
  `);
  if (constrExists.recordset.length === 0) {
    await pool.request().query(`
      ALTER TABLE dbo.attendance_scan_logs
      ADD CONSTRAINT uq_scan_logs_dedup UNIQUE (machine_code, raw_device_user_id, raw_record_time)
    `);
    console.log('[OK] Added UNIQUE constraint uq_scan_logs_dedup');
  } else {
    console.log('[SKIP] UNIQUE constraint already exists');
  }

  console.log('\n=== STEP 3: Verification ===');

  // Check zkteco_user_name column
  const colCheck = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND COLUMN_NAME = 'zkteco_user_name'
  `);
  if (colCheck.recordset.length > 0) {
    console.log('[OK] zkteco_user_name column exists');
  } else {
    console.error('[FAIL] zkteco_user_name column missing!');
  }

  // Check UNIQUE constraint
  const constraintCheck = await pool.request().query(`
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'attendance_scan_logs'
      AND CONSTRAINT_NAME = 'uq_scan_logs_dedup'
  `);
  if (constraintCheck.recordset.length > 0) {
    console.log('[OK] UNIQUE constraint uq_scan_logs_dedup exists');
  } else {
    console.error('[FAIL] UNIQUE constraint uq_scan_logs_dedup missing!');
  }

  // Row count
  const finalCount = await pool.request().query('SELECT COUNT(*) as cnt FROM attendance_scan_logs');
  console.log(`[INFO] Final row count: ${finalCount.recordset[0].cnt}`);

  await pool.close();
  console.log('\n=== Done ===');
}

run().catch((err: Error) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
