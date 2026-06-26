import mssql from 'mssql';

const absensiDb = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const absensi = await mssql.connect(absensiDb);

  // Get all unique employee code patterns
  console.log('=== Employee codes starting with A (sorted) ===');
  const empA = await absensi.request().query(`
    SELECT TOP 100 employee_code
    FROM employees
    WHERE is_active = 1 AND employee_code LIKE 'A%'
    ORDER BY employee_code
  `);
  empA.recordset.forEach((e: any) => console.log(`  ${e.employee_code}`));

  // Check for codes in range A0200-A0300
  console.log('\n=== Employee codes A0200-A0300 ===');
  const empRange = await absensi.request().query(`
    SELECT employee_code, employee_name
    FROM employees
    WHERE is_active = 1 AND employee_code LIKE 'A02%'
    ORDER BY employee_code
  `);
  empRange.recordset.forEach((e: any) => console.log(`  ${e.employee_code} - ${e.employee_name}`));

  // Check if A0229 exists
  console.log('\n=== Checking specific codes ===');
  const codes = ['A0229', 'A0188', 'A0189', 'A0226', 'A0239'];
  for (const code of codes) {
    const result = await absensi.request().query(`SELECT COUNT(*) as cnt FROM employees WHERE employee_code = '${code}'`);
    console.log(`  ${code}: ${result.recordset[0].cnt > 0 ? 'EXISTS' : 'NOT FOUND'}`);
  }

  await absensi.close();
}

main().catch(console.error);
