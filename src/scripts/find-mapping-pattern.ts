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

  // Get sample IJL scan logs
  console.log('=== IJL Scan logs sample ===');
  const ijlScans = await pool.request().query(`
    SELECT TOP 20 parsed_employee_code, machine_code, scan_date
    FROM attendance_scan_logs
    WHERE machine_code = 'IJL'
    ORDER BY scan_date DESC
  `);
  console.table(ijlScans.recordset);

  // Check machine config for IJL loc_code
  console.log('\n=== Machine IJL config ===');
  const ijlMachine = await pool.request().query(`
    SELECT machine_code, loc_code, scanner_code
    FROM attendance_machines
    WHERE machine_code = 'IJL'
  `);
  console.table(ijlMachine.recordset);

  // IJL employees
  console.log('\n=== IJL Employees (division_id=15) ===');
  const ijlEmps = await pool.request().query(`
    SELECT TOP 20 employee_code, employee_name
    FROM employees
    WHERE division_id = 15
    ORDER BY employee_code
  `);
  console.table(ijlEmps.recordset);

  // Check if there's a relationship between employee_code and parsed_employee_code
  // e.g., 0010001 -> L0041 (strip leading zeros and add loc code?)
  console.log('\n=== Trying to find pattern ===');
  const pattern = await pool.request().query(`
    SELECT TOP 10
      e.employee_code,
      e.employee_name,
      s.parsed_employee_code
    FROM employees e
    LEFT JOIN attendance_scan_logs s ON s.machine_code = 'IJL'
    WHERE e.division_id = 15
    LIMIT 10
  `);
  console.table(pattern.recordset);

  await pool.close();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
