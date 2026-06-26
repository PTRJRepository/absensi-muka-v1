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

  // Check scan logs sample
  console.log('=== Sample scan_logs (parsed_employee_code) ===');
  const scanLogs = await pool.request().query(`
    SELECT TOP 10 id, machine_code, raw_device_user_id, parsed_employee_code, scan_date
    FROM attendance_scan_logs
    ORDER BY id DESC
  `);
  console.table(scanLogs.recordset);

  // Check employees sample
  console.log('\n=== Sample employees (employee_code) ===');
  const employees = await pool.request().query(`
    SELECT TOP 10 id, employee_code, employee_name, division_code
    FROM employees
    ORDER BY employee_code
  `);
  console.table(employees.recordset);

  // Check view result
  console.log('\n=== ZKTeco monthly view (IJL, June 2026) ===');
  const viewResult = await pool.request().query(`
    SELECT TOP 10 employee_code, employee_name, division_code, total_present, total_absent
    FROM vw_attendance_zkteco_monthly_summary
    WHERE attendance_year = 2026 AND attendance_month = 6 AND division_code = 'IJL'
    ORDER BY employee_code
  `);
  console.table(viewResult.recordset);

  await pool.close();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
