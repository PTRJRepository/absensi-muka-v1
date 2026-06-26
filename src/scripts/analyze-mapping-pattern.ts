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

  console.log('=== ANALISIS POLA MAPPING ===\n');

  // 1. Check machine columns
  const machineCols = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'attendance_machines'
  `);
  console.log('1. attendance_machines columns:', machineCols.recordset.map(r => r.COLUMN_NAME).join(', '));

  // 2. Check machine loc_codes
  const machines = await pool.request().query(`
    SELECT machine_code, loc_code, scanner_code
    FROM attendance_machines
    WHERE loc_code IS NOT NULL
  `);
  console.log('\n2. Machine dengan loc_code:');
  console.table(machines.recordset);

  // 3. Sample UNMAPPED scan logs per machine
  const unmappedPerMachine = await pool.request().query(`
    SELECT machine_code, COUNT(*) as cnt
    FROM attendance_scan_logs
    WHERE mapping_status = 'UNMAPPED'
    GROUP BY machine_code
  `);
  console.log('\n3. UNMAPPED logs per machine:');
  console.table(unmappedPerMachine.recordset);

  // 4. Analyze UNMAPPED raw IDs pattern for PGE
  const unmappedPattern = await pool.request().query(`
    SELECT TOP 30
      raw_device_user_id,
      machine_code,
      LEN(raw_device_user_id) as raw_len,
      LEFT(raw_device_user_id, 1) as first_digit
    FROM attendance_scan_logs
    WHERE mapping_status = 'UNMAPPED'
    AND machine_code = 'PGE'
    ORDER BY id DESC
  `);
  console.log('\n4. Sample UNMAPPED patterns for PGE:');
  console.table(unmappedPattern.recordset);

  // 5. Sample employees for PGE division (employee_code starts with 'A')
  const pgeEmployees = await pool.request().query(`
    SELECT TOP 20 employee_code, employee_name
    FROM employees
    WHERE employee_code LIKE 'A%'
    ORDER BY employee_code
  `);
  console.log('\n5. Sample employees with code starting with A:');
  console.table(pgeEmployees.recordset);

  // 6. Try pattern: Strip first digit, add loc_code
  // raw_id='3000117' → 'A00117' (strip '3', add 'A')
  const patternMatch = await pool.request().query(`
    SELECT TOP 20
      s.raw_device_user_id,
      'A' + SUBSTRING(s.raw_device_user_id, 2, LEN(s.raw_device_user_id) - 1) as parsed_try,
      SUBSTRING(s.raw_device_user_id, 2, LEN(s.raw_device_user_id) - 1) as last_6_digits,
      e.employee_code as matched_employee,
      e.employee_name
    FROM attendance_scan_logs s
    INNER JOIN employees e ON e.employee_code = 'A' + SUBSTRING(s.raw_device_user_id, 2, LEN(s.raw_device_user_id) - 1)
    WHERE s.mapping_status = 'UNMAPPED'
    AND s.machine_code = 'PGE'
    AND LEN(s.raw_device_user_id) = 7
  `);
  console.log('\n6. Pattern test: raw="3000117" → "A000117" (strip first digit, add A):');
  console.table(patternMatch.recordset);

  // 7. Count fixable
  const fixCount = await pool.request().query(`
    SELECT COUNT(*) as cnt
    FROM attendance_scan_logs s
    INNER JOIN employees e ON e.employee_code = 'A' + SUBSTRING(s.raw_device_user_id, 2, LEN(s.raw_device_user_id) - 1)
    WHERE s.mapping_status = 'UNMAPPED'
    AND s.machine_code = 'PGE'
    AND LEN(s.raw_device_user_id) = 7
  `);
  console.log('\n7. Fixable count (PGE with pattern A+last6):', fixCount.recordset[0].cnt);

  // 8. Check all machines with this pattern
  const fixByMachine = await pool.request().query(`
    SELECT
      s.machine_code,
      m.loc_code,
      COUNT(*) as cnt
    FROM attendance_scan_logs s
    INNER JOIN attendance_machines m ON m.machine_code = s.machine_code
    INNER JOIN employees e ON e.employee_code = m.loc_code + SUBSTRING(s.raw_device_user_id, 2, LEN(s.raw_device_user_id) - 1)
    WHERE s.mapping_status = 'UNMAPPED'
    AND LEN(s.raw_device_user_id) = 7
    AND m.loc_code IS NOT NULL
    GROUP BY s.machine_code, m.loc_code
  `);
  console.log('\n8. Fixable UNMAPPED by machine:');
  console.table(fixByMachine.recordset);

  await pool.close();
  console.log('\n=== END ===');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
