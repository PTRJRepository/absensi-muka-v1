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

  console.log('=== ANALISIS LANJUTAN ===\n');

  // 1. Check the range of employee codes
  const empRange = await pool.request().query(`
    SELECT TOP 50 employee_code, employee_name
    FROM employees
    WHERE employee_code LIKE 'A%'
    ORDER BY employee_code
  `);
  console.log('1. Sample employee codes (A prefix):');
  empRange.recordset.forEach(e => console.log(`   ${e.employee_code} - ${e.employee_name}`));

  // 2. Try different patterns for PGE
  // Pattern: Strip first digit and check
  console.log('\n2. Trying patterns for "3000117":');

  // Pattern 1: A + last 4 digits → A0117
  const p1 = await pool.request().query(`
    SELECT * FROM employees WHERE employee_code = 'A' + RIGHT('0000' + SUBSTRING('3000117', 2, 4), 5)
  `);
  console.log('   Pattern A + last 4: ' + (p1.recordset.length > 0 ? p1.recordset[0].employee_name : 'NOT FOUND'));

  // Pattern 2: A + last 5 digits → A00117
  const p2 = await pool.request().query(`
    SELECT * FROM employees WHERE employee_code = 'A' + RIGHT('00000' + SUBSTRING('3000117', 2, 5), 6)
  `);
  console.log('   Pattern A + last 5: ' + (p2.recordset.length > 0 ? p2.recordset[0].employee_name : 'NOT FOUND'));

  // Pattern 3: A + last 6 digits → A000117
  const p3 = await pool.request().query(`
    SELECT * FROM employees WHERE employee_code = 'A' + RIGHT('000000' + SUBSTRING('3000117', 2, 6), 7)
  `);
  console.log('   Pattern A + last 6: ' + (p3.recordset.length > 0 ? p3.recordset[0].employee_name : 'NOT FOUND'));

  // 3. Check if these raw IDs might be in different format (IT API format)
  // raw='3000117' vs employee_code pattern like 'A0150'
  // The IT API format is '0010001' (7 digits)
  const itApiPattern = await pool.request().query(`
    SELECT * FROM employees WHERE employee_code = '0010117'
  `);
  console.log('   IT API format 0010117: ' + (itApiPattern.recordset.length > 0 ? itApiPattern.recordset[0].employee_name : 'NOT FOUND'));

  // 4. Check NEED_REVIEW status - these might need manual mapping
  const needReview = await pool.request().query(`
    SELECT TOP 10 raw_device_user_id, parsed_employee_code, mapping_reason, machine_code
    FROM attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
    ORDER BY id DESC
  `);
  console.log('\n3. Sample NEED_REVIEW records:');
  console.table(needReview.recordset);

  // 5. Check the mapping_reason field for clues
  const reasons = await pool.request().query(`
    SELECT mapping_reason, COUNT(*) as cnt
    FROM attendance_scan_logs
    WHERE mapping_status = 'NEED_REVIEW'
    GROUP BY mapping_reason
  `);
  console.log('\n4. NEED_REVIEW reasons:');
  console.table(reasons.recordset);

  // 6. Check UNMAPPED reasons
  const unmappedReasons = await pool.request().query(`
    SELECT mapping_reason, COUNT(*) as cnt
    FROM attendance_scan_logs
    WHERE mapping_status = 'UNMAPPED'
    GROUP BY mapping_reason
  `);
  console.log('\n5. UNMAPPED reasons:');
  console.table(unmappedReasons.recordset);

  // 7. Total potential mapping coverage
  const coverage = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM attendance_scan_logs WHERE parsed_employee_code IS NOT NULL) as parsed,
      (SELECT COUNT(*) FROM attendance_scan_logs) as total,
      (SELECT COUNT(*) FROM employees) as employees
  `);
  console.log('\n6. Coverage:');
  console.log('   Parsed scan logs:', coverage.recordset[0].parsed);
  console.log('   Total scan logs:', coverage.recordset[0].total);
  console.log('   Total employees:', coverage.recordset[0].employees);
  console.log('   Coverage:', Math.round(coverage.recordset[0].parsed / coverage.recordset[0].total * 100) + '%');

  await pool.close();
  console.log('\n=== END ===');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
