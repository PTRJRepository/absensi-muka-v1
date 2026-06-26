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

  console.log('=== EMPLOYEE & ATTENDANCE DATA ANALYSIS ===\n');

  // 1. Employee count
  const empCount = await pool.request().query('SELECT COUNT(*) as cnt FROM employees');
  console.log('1. Total employees in database:', empCount.recordset[0].cnt);

  // 2. Scan logs count
  const scanCount = await pool.request().query('SELECT COUNT(*) as cnt FROM attendance_scan_logs');
  console.log('2. Total scan logs:', scanCount.recordset[0].cnt);

  // 3. Parsed employee code status
  const parsedStats = await pool.request().query(`
    SELECT
      CASE WHEN parsed_employee_code IS NULL THEN 'NULL' ELSE 'HAS_VALUE' END as status,
      COUNT(*) as cnt
    FROM attendance_scan_logs
    GROUP BY CASE WHEN parsed_employee_code IS NULL THEN 'NULL' ELSE 'HAS_VALUE' END
  `);
  console.log('\n3. Parsed employee code status:');
  console.table(parsedStats.recordset);

  // 4. Mapping status
  const mappingStats = await pool.request().query(`
    SELECT mapping_status, COUNT(*) as cnt
    FROM attendance_scan_logs
    GROUP BY mapping_status
  `);
  console.log('\n4. Mapping status:');
  console.table(mappingStats.recordset);

  // 5. Sample scan logs with IT API format (UNMAPPED)
  const unmappedSamples = await pool.request().query(`
    SELECT TOP 10 raw_device_user_id, parsed_employee_code, mapping_status, machine_code
    FROM attendance_scan_logs
    WHERE mapping_status = 'UNMAPPED'
    AND LEN(raw_device_user_id) = 7
    ORDER BY id DESC
  `);
  console.log('\n5. Sample UNMAPPED scan logs (IT API format):');
  console.table(unmappedSamples.recordset);

  // 6. Check if UNMAPPED raw IDs match employees directly
  const directMatch = await pool.request().query(`
    SELECT COUNT(DISTINCT s.raw_device_user_id) as match_count
    FROM attendance_scan_logs s
    INNER JOIN employees e ON e.employee_code = s.raw_device_user_id
    WHERE s.mapping_status = 'UNMAPPED'
  `);
  console.log('\n6. UNMAPPED raw_device_user_id that DIRECTLY MATCH employee_code:', directMatch.recordset[0].match_count);

  // 7. Sample employees
  const empSamples = await pool.request().query('SELECT TOP 5 id, employee_code, employee_name FROM employees ORDER BY id');
  console.log('\n7. Sample employees:');
  console.table(empSamples.recordset);

  // 8. Check parsed_employee_code sample
  const parsedSamples = await pool.request().query(`
    SELECT TOP 10 parsed_employee_code, raw_device_user_id, machine_code
    FROM attendance_scan_logs
    WHERE parsed_employee_code IS NOT NULL
    ORDER BY id DESC
  `);
  console.log('\n8. Sample scan logs with parsed_employee_code (ZKTeco format):');
  console.table(parsedSamples.recordset);

  // 9. Check if parsed_employee_code matches employees
  const parsedMatch = await pool.request().query(`
    SELECT COUNT(DISTINCT s.parsed_employee_code) as match_count
    FROM attendance_scan_logs s
    INNER JOIN employees e ON e.employee_code = s.parsed_employee_code
    WHERE s.parsed_employee_code IS NOT NULL
  `);
  console.log('\n9. parsed_employee_code that MATCH employee_code:', parsedMatch.recordset[0].match_count);

  await pool.close();
  console.log('\n=== END ANALYSIS ===');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
