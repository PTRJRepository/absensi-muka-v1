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
    requestTimeout: 120000,
  };

  const pool = await mssql.connect(db);

  // Check data counts
  console.log('=== Check data counts ===');

  const scanCount = await pool.request().query(`
    SELECT COUNT(*) as cnt FROM attendance_scan_logs
  `);
  console.log('Total scan logs:', scanCount.recordset[0].cnt);

  const empCount = await pool.request().query(`
    SELECT COUNT(*) as cnt FROM employees WHERE is_active = 1
  `);
  console.log('Total employees:', empCount.recordset[0].cnt);

  // Check date range in scan logs
  const dateRange = await pool.request().query(`
    SELECT MIN(scan_date) as min_date, MAX(scan_date) as max_date
    FROM attendance_scan_logs
  `);
  console.log('Scan logs date range:', dateRange.recordset[0]);

  // Check if June 2026 has data
  const juneCheck = await pool.request().query(`
    SELECT COUNT(DISTINCT scan_date) as cnt
    FROM attendance_scan_logs
    WHERE YEAR(scan_date) = 2026 AND MONTH(scan_date) = 6
  `);
  console.log('June 2026 dates with data:', juneCheck.recordset[0].cnt);

  // Check May 2026
  const mayCheck = await pool.request().query(`
    SELECT COUNT(DISTINCT scan_date) as cnt
    FROM attendance_scan_logs
    WHERE YEAR(scan_date) = 2026 AND MONTH(scan_date) = 5
  `);
  console.log('May 2026 dates with data:', mayCheck.recordset[0].cnt);

  await pool.close();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
