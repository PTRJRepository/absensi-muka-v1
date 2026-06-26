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

  // Check UNMAPPED scan logs that have IT API format raw IDs
  // These might match employees directly!
  console.log('=== UNMAPPED scan logs with IT API format ===');
  const unmapped = await pool.request().query(`
    SELECT TOP 20
      raw_device_user_id,
      parsed_employee_code,
      machine_code,
      COUNT(*) as cnt
    FROM attendance_scan_logs
    WHERE mapping_status = 'UNMAPPED'
    AND LEN(raw_device_user_id) = 7
    AND raw_device_user_id LIKE '00%'
    GROUP BY raw_device_user_id, parsed_employee_code, machine_code
    ORDER BY cnt DESC
  `);
  console.table(unmapped.recordset);

  // Check if these match employee codes
  console.log('\n=== Check if unmapped raw IDs match employee codes ===');
  const matches = await pool.request().query(`
    SELECT TOP 20
      e.employee_code AS emp_code,
      e.employee_name,
      s.raw_device_user_id AS scan_raw_id,
      s.machine_code
    FROM attendance_scan_logs s
    JOIN employees e ON e.employee_code = s.raw_device_user_id
    WHERE s.mapping_status = 'UNMAPPED'
    LIMIT 20
  `);
  console.table(matches.recordset);

  // Check count of potential direct matches
  console.log('\n=== Direct match count ===');
  const countResult = await pool.request().query(`
    SELECT COUNT(DISTINCT s.raw_device_user_id) as match_count
    FROM attendance_scan_logs s
    JOIN employees e ON e.employee_code = s.raw_device_user_id
    WHERE s.mapping_status = 'UNMAPPED'
  `);
  console.log('Potential direct matches:', countResult.recordset[0].match_count);

  await pool.close();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
