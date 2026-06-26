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

  // Check employees structure
  console.log('=== employees table structure ===');
  const empCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'employees'
    ORDER BY ORDINAL_POSITION
  `);
  console.table(empCols.recordset);

  // Check employees sample
  console.log('\n=== Sample employees ===');
  const employees = await pool.request().query(`
    SELECT TOP 10 id, employee_code, employee_name, division_id
    FROM employees
    ORDER BY employee_code
  `);
  console.table(employees.recordset);

  // Check divisions
  console.log('\n=== divisions table ===');
  const divisions = await pool.request().query(`SELECT id, division_code, division_name FROM divisions`);
  console.table(divisions.recordset);

  // Check scan_logs machine_code to division mapping
  console.log('\n=== Machines with IJL ===');
  const machines = await pool.request().query(`
    SELECT machine_code, loc_code, data_source
    FROM attendance_machines
    WHERE machine_code LIKE '%IJL%' OR loc_code LIKE '%IJL%'
  `);
  console.table(machines.recordset);

  await pool.close();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
