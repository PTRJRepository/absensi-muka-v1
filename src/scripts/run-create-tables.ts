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
  const sqlContent = fs.readFileSync('migrations/014_create_missing_tables.sql', 'utf8');

  // Split by GO and execute
  const batches = sqlContent.split(/^\s*GO\s*$/gim).filter(b => b.trim() && !b.trim().startsWith('USE ') && !b.trim().startsWith('PRINT'));
  for (const batch of batches) {
    const trimmed = batch.trim();
    if (trimmed && !trimmed.startsWith('--')) {
      console.log('Executing batch...');
      try {
        await pool.request().query(trimmed);
      } catch (err: any) {
        console.error('Error:', err.message);
      }
    }
  }

  // Verify tables
  const tables = await pool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    AND TABLE_NAME IN ('attendance_sync_logs', 'machine_connection_logs')
  `);
  console.log('Created tables:', tables.recordset.map(r => r.TABLE_NAME));

  await pool.close();
  console.log('Done!');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
