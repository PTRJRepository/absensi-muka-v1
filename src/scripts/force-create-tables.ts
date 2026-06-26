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

async function main() {
  loadEnv();
  const db = {
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
    options: { encrypt: false, trustServerCertificate: true },
  };

  const pool = await mssql.connect(db);

  // Check if tables exist
  const existingTables = await pool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
  `);
  console.log('Existing tables:', existingTables.recordset.map(r => r.TABLE_NAME));

  // Create attendance_sync_logs
  console.log('\nCreating attendance_sync_logs...');
  try {
    await pool.request().query(`
      CREATE TABLE attendance_sync_logs (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        sync_type NVARCHAR(40) NOT NULL,
        source NVARCHAR(40) NOT NULL,
        machine_id INT NULL,
        machine_code NVARCHAR(30) NULL,
        division_code NVARCHAR(20) NULL,
        status NVARCHAR(30) NOT NULL,
        failure_category NVARCHAR(50) NULL,
        started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        finished_at DATETIME2 NULL,
        duration_ms INT NULL,
        records_synced INT NOT NULL DEFAULT 0,
        error_message NVARCHAR(1000) NULL,
        is_dry_run BIT NOT NULL DEFAULT 0,
        triggered_by INT NULL
      )
    `);
    console.log('Created attendance_sync_logs');
  } catch (err: any) {
    console.log('attendance_sync_logs:', err.message.includes('already exists') ? 'already exists' : err.message);
  }

  // Create machine_connection_logs
  console.log('\nCreating machine_connection_logs...');
  try {
    await pool.request().query(`
      CREATE TABLE machine_connection_logs (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        machine_id INT NOT NULL,
        machine_code NVARCHAR(30) NOT NULL,
        status NVARCHAR(30) NOT NULL,
        failure_category NVARCHAR(50) NULL,
        error_message NVARCHAR(1000) NULL,
        response_time_ms INT NULL,
        checked_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        checked_by INT NULL
      )
    `);
    console.log('Created machine_connection_logs');
  } catch (err: any) {
    console.log('machine_connection_logs:', err.message.includes('already exists') ? 'already exists' : err.message);
  }

  await pool.close();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
