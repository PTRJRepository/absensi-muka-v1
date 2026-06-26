import mssql from 'mssql';

// Connect to Absensi DB
const absensiDb = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

// Connect to HR DB
const hrDb = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'DB_PTRJ',
  options: { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const absensi = await mssql.connect(absensiDb);
  const hr = await mssql.connect(hrDb);

  // Get sample parsed_employee_codes from scan_logs
  console.log('=== Sample parsed_employee_code from scan_logs ===');
  const scanCodes = await absensi.request().query(`
    SELECT TOP 20 parsed_employee_code, COUNT(*) as cnt
    FROM attendance_scan_logs
    WHERE mapping_status IN ('MAPPED', 'NEED_REVIEW')
    GROUP BY parsed_employee_code
    ORDER BY cnt DESC
  `);
  scanCodes.recordset.forEach(r => console.log(`  ${r.parsed_employee_code} (${r.cnt} records)`));

  // Get sample EmpCodes from HR_EMPLOYEE
  console.log('\n=== Sample EmpCode from HR_EMPLOYEE ===');
  const hrCodes = await hr.request().query(`
    SELECT TOP 20 RTRIM(EmpCode) as EmpCode, RTRIM(EmpName) as EmpName, RTRIM(LocCode) as LocCode, Status
    FROM HR_EMPLOYEE
    ORDER BY EmpCode
  `);
  hrCodes.recordset.forEach(r => console.log(`  ${r.EmpCode} | ${r.EmpName.substring(0, 30)} | Loc: ${r.LocCode} | Status: ${r.Status}`));

  // Check total counts
  console.log('\n=== Counts ===');
  const scanCount = await absensi.request().query(`SELECT COUNT(*) as cnt FROM attendance_scan_logs`);
  console.log(`  scan_logs: ${scanCount.recordset[0].cnt}`);
  
  const hrCount = await hr.request().query(`SELECT COUNT(*) as cnt FROM HR_EMPLOYEE`);
  console.log(`  HR_EMPLOYEE: ${hrCount.recordset[0].cnt}`);

  // Try direct matching
  console.log('\n=== Direct Match Test ===');
  const testCodes = ['A0001', 'A0015', 'L0015', '0226', '0340'];
  for (const code of testCodes) {
    const match = await hr.request().query(`SELECT COUNT(*) as cnt FROM HR_EMPLOYEE WHERE RTRIM(EmpCode) = '${code}'`);
    console.log(`  '${code}': ${match.recordset[0].cnt > 0 ? 'FOUND' : 'NOT FOUND'}`);
  }

  await absensi.close();
  await hr.close();
}

main().catch(console.error);
