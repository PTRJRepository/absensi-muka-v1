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

  // Check attendance_machines columns
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'attendance_machines'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('attendance_machines columns:');
  console.table(cols.recordset);

  // Check sample data
  const sample = await pool.request().query(`SELECT TOP 3 * FROM attendance_machines`);
  console.log('\nSample data:');
  console.table(sample.recordset);

  await pool.close();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
