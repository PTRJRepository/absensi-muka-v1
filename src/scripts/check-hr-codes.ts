import mssql from 'mssql';

const hrDb = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'DB_PTRJ',
  options: { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const hr = await mssql.connect(hrDb);

  // Get all HR EmpCodes
  console.log('=== Sample of HR_EMPLOYEE EmpCodes ===');
  const hrCodes = await hr.request().query(`
    SELECT TOP 100 RTRIM(EmpCode) as EmpCode, RTRIM(EmpName) as EmpName
    FROM HR_EMPLOYEE
    WHERE Status = '1'
    ORDER BY EmpCode
  `);
  hrCodes.recordset.forEach(r => console.log(`  ${r.EmpCode} - ${r.EmpName.substring(0, 30)}`));

  // Get EmpCodes starting with common prefixes from ZKTeco
  console.log('\n=== HR EmpCodes starting with A (sample) ===');
  const hrA = await hr.request().query(`
    SELECT TOP 50 RTRIM(EmpCode) as EmpCode
    FROM HR_EMPLOYEE
    WHERE Status = '1' AND RTRIM(EmpCode) LIKE 'A%'
    ORDER BY EmpCode
  `);
  hrA.recordset.forEach(r => console.log(`  ${r.EmpCode}`));

  console.log('\n=== HR EmpCodes starting with H (sample) ===');
  const hrH = await hr.request().query(`
    SELECT TOP 50 RTRIM(EmpCode) as EmpCode
    FROM HR_EMPLOYEE
    WHERE Status = '1' AND RTRIM(EmpCode) LIKE 'H%'
    ORDER BY EmpCode
  `);
  hrH.recordset.forEach(r => console.log(`  ${r.EmpCode}`));

  console.log('\n=== HR EmpCodes starting with 9 (sample) ===');
  const hr9 = await hr.request().query(`
    SELECT TOP 50 RTRIM(EmpCode) as EmpCode
    FROM HR_EMPLOYEE
    WHERE Status = '1' AND RTRIM(EmpCode) LIKE '9%'
    ORDER BY EmpCode
  `);
  hr9.recordset.forEach(r => console.log(`  ${r.EmpCode}`));

  // Check specific ZKTeco codes
  console.log('\n=== Direct match test ===');
  const testCodes = ['A10188', 'A20023', 'H50106', 'H000012', '9000582', 'A0001', 'A0150'];
  for (const code of testCodes) {
    const match = await hr.request().query(`SELECT COUNT(*) as cnt FROM HR_EMPLOYEE WHERE RTRIM(EmpCode) = '${code}'`);
    console.log(`  '${code}': ${match.recordset[0].cnt > 0 ? 'FOUND' : 'NOT FOUND'}`);
  }

  await hr.close();
}

main().catch(console.error);
