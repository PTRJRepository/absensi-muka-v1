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

  // List all HR tables
  console.log('=== All HR tables ===');
  const tables = await hr.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    AND TABLE_NAME LIKE 'HR%'
    ORDER BY TABLE_NAME
  `);
  tables.recordset.forEach(t => console.log(`  ${t.TABLE_NAME}`));

  // Check HR_EMPLOYEE structure (without schema prefix)
  console.log('\n=== HR_EMPLOYEE structure ===');
  try {
    const cols = await hr.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'HR_EMPLOYEE'
      ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
    });
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  // Check if there's an EmpCode column that matches ZKTeco format
  console.log('\n=== HR_EMPLOYEE EmpCode samples (sorted) ===');
  try {
    const sample = await hr.request().query(`
      SELECT TOP 100 RTRIM(EmpCode) as EmpCode, RTRIM(EmpName) as EmpName, RTRIM(LocCode) as LocCode, Status
      FROM HR_EMPLOYEE
      WHERE Status = '1'
      ORDER BY EmpCode
    `);
    console.log('Total:', sample.recordset.length);
    sample.recordset.forEach(r => {
      console.log(`  ${r.EmpCode} | ${r.EmpName.substring(0, 25)} | ${r.LocCode}`);
    });
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  // Try matching with scan_logs parsed_employee_code
  console.log('\n=== Matching test with ZKTeco codes ===');
  const zkCodes = ['A10188', 'A20023', 'H50106', 'A0001', '0226'];
  for (const code of zkCodes) {
    try {
      const match = await hr.request().query(`SELECT COUNT(*) as cnt FROM HR_EMPLOYEE WHERE RTRIM(EmpCode) = '${code}'`);
      console.log(`  '${code}': ${match.recordset[0].cnt > 0 ? 'FOUND' : 'NOT FOUND'}`);
    } catch (e: any) {
      console.log(`  '${code}': Error - ${e.message}`);
    }
  }

  await hr.close();
}

main().catch(console.error);
