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

  // Get all ZKTeco codes from scan_logs (unique)
  console.log('=== Unique parsed_employee_code from scan_logs (sample 50) ===');
  const zkCodes = await absensi.request().query(`
    SELECT DISTINCT TOP 50 parsed_employee_code, COUNT(*) as cnt
    FROM attendance_scan_logs
    WHERE parsed_employee_code IS NOT NULL AND parsed_employee_code != ''
    GROUP BY parsed_employee_code
    ORDER BY cnt DESC
  `);
  zkCodes.recordset.forEach(r => console.log(`  ${r.parsed_employee_code} (${r.cnt})`));

  // Get all HR EmpCodes
  console.log('\n=== All HR_EMPLOYEE EmpCodes (sample 50) ===');
  const hrCodes = await hr.request().query(`
    SELECT TOP 50 RTRIM(EmpCode) as EmpCode, RTRIM(EmpName) as EmpName, RTRIM(LocCode) as LocCode
    FROM HR_EMPLOYEE
    WHERE Status = '1'
    ORDER BY EmpCode
  `);
  hrCodes.recordset.forEach(r => console.log(`  ${r.EmpCode} - ${r.EmpName.substring(0, 30)}`));

  // Get all local employee codes
  console.log('\n=== All local employees employee_code (sample 50) ===');
  const localCodes = await absensi.request().query(`
    SELECT TOP 50 employee_code, employee_name
    FROM employees
    WHERE is_active = 1
    ORDER BY employee_code
  `);
  localCodes.recordset.forEach(r => console.log(`  ${r.employee_code} - ${r.employee_name}`));

  // Try to find direct matches
  console.log('\n=== Direct Match Test ===');
  const testCodes = ['G10044', '9000262', 'A0150', 'A0234', '10002', '10189'];
  for (const code of testCodes) {
    const localMatch = await absensi.request().query(`SELECT COUNT(*) as cnt FROM employees WHERE employee_code = '${code}'`);
    const hrMatch = await hr.request().query(`SELECT COUNT(*) as cnt FROM HR_EMPLOYEE WHERE RTRIM(EmpCode) = '${code}'`);
    console.log(`  '${code}': local=${localMatch.recordset[0].cnt > 0 ? 'FOUND' : 'NOT FOUND'}, hr=${hrMatch.recordset[0].cnt > 0 ? 'FOUND' : 'NOT FOUND'}`);
  }

  await absensi.close();
  await hr.close();
}

main().catch(console.error);
