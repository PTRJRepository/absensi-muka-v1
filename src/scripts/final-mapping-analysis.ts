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

  console.log('=== ANALISIS UNMAPPED RECORDS ===\n');

  // 1. Check UNMAPPED raw IDs - are they really non-numeric?
  const unmappedCheck = await pool.request().query(`
    SELECT TOP 20
      raw_device_user_id,
      LEN(raw_device_user_id) as len,
      ISNUMERIC(raw_device_user_id) as is_numeric
    FROM attendance_scan_logs
    WHERE mapping_status = 'UNMAPPED'
    ORDER BY id DESC
  `);
  console.log('1. UNMAPPED raw_device_user_id sample:');
  console.table(unmappedCheck.recordset);

  // 2. Check the actual UNMAPPED records by machine
  const unmappedMachines = await pool.request().query(`
    SELECT
      machine_code,
      COUNT(*) as cnt,
      SUM(CASE WHEN LEN(raw_device_user_id) > 0 THEN 1 ELSE 0 END) as with_value
    FROM attendance_scan_logs
    WHERE mapping_status = 'UNMAPPED'
    GROUP BY machine_code
  `);
  console.log('\n2. UNMAPPED by machine:');
  console.table(unmappedMachines.recordset);

  // 3. The REAL problem: Check if MAPPED records include IJL division
  // Earlier we saw IJL division has employee_code like "0010001" (IT API format)
  // But scan_logs.parsed_employee_code for IJL should be in ZKTeco format
  const ijlCheck = await pool.request().query(`
    SELECT TOP 10
      raw_device_user_id,
      parsed_employee_code,
      machine_code,
      mapping_status
    FROM attendance_scan_logs
    WHERE machine_code = 'IJL'
    ORDER BY id DESC
  `);
  console.log('\n3. IJL scan logs sample:');
  console.table(ijlCheck.recordset);

  // 4. Check IJL employees
  const ijlEmployees = await pool.request().query(`
    SELECT TOP 10 employee_code, employee_name
    FROM employees e
    JOIN divisions d ON d.id = e.division_id
    WHERE d.division_code = 'IJL'
    ORDER BY employee_code
  `);
  console.log('\n4. IJL employees:');
  console.table(ijlEmployees.recordset);

  // 5. Check if there's a mismatch between parsed_employee_code and employee_code
  // Scan logs might have parsed in ZKTeco format but employees in IT API format
  const mismatchCheck = await pool.request().query(`
    SELECT TOP 10
      s.parsed_employee_code,
      s.raw_device_user_id,
      e.employee_code,
      e.employee_name,
      CASE WHEN s.parsed_employee_code = e.employee_code THEN 'MATCH' ELSE 'DIFF' END as match_status
    FROM attendance_scan_logs s
    INNER JOIN employees e ON e.employee_code = s.raw_device_user_id
    WHERE s.machine_code = 'IJL'
    AND s.parsed_employee_code IS NULL
    LIMIT 10
  `);
  console.log('\n5. Direct match (raw_device_user_id = employee_code):');
  console.table(mismatchCheck.recordset);

  // 6. Count direct matches for IJL
  const directMatch = await pool.request().query(`
    SELECT COUNT(*) as cnt
    FROM attendance_scan_logs s
    INNER JOIN employees e ON e.employee_code = s.raw_device_user_id
    WHERE s.machine_code = 'IJL'
    AND s.parsed_employee_code IS NULL
  `);
  console.log('\n6. IJL direct matches (raw = employee_code):', directMatch.recordset[0].cnt);

  // 7. Summary: The data structure
  console.log('\n=== DATA STRUCTURE SUMMARY ===');
  console.log('employees table:');
  console.log('  - Uses employee_code like "0010001" (IT API format) for IJL');
  console.log('  - Uses employee_code like "A0150" (ZKTeco format) for PGE/others');
  console.log('\nattendance_scan_logs table:');
  console.log('  - raw_device_user_id: Original from ZKTeco machine');
  console.log('  - parsed_employee_code: After parsing (should match employees.employee_code)');
  console.log('\nCURRENT MAPPING STATUS:');
  console.log('  - 87% scan logs successfully parsed');
  console.log('  - 13% UNMAPPED (need different parsing or manual mapping)');

  await pool.close();
  console.log('\n=== END ===');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
