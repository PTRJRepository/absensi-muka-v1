import mssql from 'mssql';

const absensiDb = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

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

  // Get distinct parsed_employee_codes from scan_logs (top 50 by count)
  console.log('=== Top 50 parsed_employee_code from scan_logs ===');
  const scanCodes = await absensi.request().query(`
    SELECT TOP 50 parsed_employee_code, COUNT(*) as cnt
    FROM attendance_scan_logs
    WHERE parsed_employee_code IS NOT NULL AND parsed_employee_code != ''
    GROUP BY parsed_employee_code
    ORDER BY cnt DESC
  `);
  scanCodes.recordset.forEach(r => console.log(`  ${r.parsed_employee_code} (${r.cnt})`));

  // Get distinct EmpCodes from HR_EMPLOYEE (top 50)
  console.log('\n=== Sample EmpCode from HR_EMPLOYEE ===');
  const hrCodes = await hr.request().query(`
    SELECT TOP 50 RTRIM(EmpCode) as EmpCode, RTRIM(EmpName) as EmpName, RTRIM(LocCode) as LocCode
    FROM dbo.HR_EMPLOYEE
    ORDER BY EmpCode
  `);
  hrCodes.recordset.forEach(r => console.log(`  ${r.EmpCode} | ${r.EmpName.substring(0, 30)}`));

  // Check total counts
  console.log('\n=== Counts ===');
  const scanCount = await absensi.request().query(`SELECT COUNT(DISTINCT parsed_employee_code) as cnt FROM attendance_scan_logs WHERE parsed_employee_code IS NOT NULL`);
  console.log(`  Unique scan_logs codes: ${scanCount.recordset[0].cnt}`);

  const hrCount = await hr.request().query(`SELECT COUNT(*) as cnt FROM dbo.HR_EMPLOYEE`);
  console.log(`  HR_EMPLOYEE total: ${hrCount.recordset[0].cnt}`);

  // Try to find direct matches
  console.log('\n=== Testing Direct Matches ===');
  const testCodes = ['A0001', 'A0002', 'A0015', 'A1001', '0226', '0239', '0340', 'H50106', 'H000012'];
  for (const code of testCodes) {
    const match = await hr.request().query(`SELECT COUNT(*) as cnt FROM dbo.HR_EMPLOYEE WHERE RTRIM(EmpCode) = '${code}'`);
    console.log(`  '${code}': ${match.recordset[0].cnt > 0 ? 'FOUND' : 'NOT FOUND'}`);
  }

  // Try with prefix patterns
  console.log('\n=== Checking if scan codes are substrings of HR codes ===');
  // Check A1001 pattern - maybe HR has A01001 or similar
  const hrLikeA = await hr.request().query(`SELECT RTRIM(EmpCode) as EmpCode FROM dbo.HR_EMPLOYEE WHERE RTRIM(EmpCode) LIKE 'A%' ORDER BY EmpCode`);
  console.log('HR EmpCodes starting with A:');
  hrLikeA.recordset.slice(0, 30).forEach(r => console.log(`  ${r.EmpCode}`));

  await absensi.close();
  await hr.close();
}

main().catch(console.error);
