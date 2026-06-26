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

  // Check employees structure
  console.log('=== employees structure ===');
  const cols = await absensi.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'employees'
    ORDER BY ORDINAL_POSITION
  `);
  cols.recordset.forEach(c => {
    const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
  });

  // Sample data
  console.log('\n=== employees sample data ===');
  const sample = await absensi.request().query(`SELECT TOP 20 * FROM employees`);
  console.table(sample.recordset);

  // Get distinct division_code from employees
  console.log('\n=== Distinct division_code from employees ===');
  const divs = await absensi.request().query(`SELECT DISTINCT division_code FROM employees`);
  divs.recordset.forEach(d => console.log(`  ${d.division_code}`));

  // Compare employee_code formats
  console.log('\n=== Sample employee_code by division ===');
  const byDiv = await absensi.request().query(`
    SELECT TOP 10 division_code, employee_code, employee_name
    FROM employees
    WHERE is_active = 1
    ORDER BY division_code, employee_code
  `);
  byDiv.recordset.forEach(r => {
    console.log(`  ${r.division_code}: ${r.employee_code} - ${r.employee_name}`);
  });

  // Total count
  console.log('\n=== Total employees ===');
  const count = await absensi.request().query(`SELECT COUNT(*) as cnt FROM employees`);
  console.log(`  Total: ${count.recordset[0].cnt}`);

  await absensi.close();
}

main().catch(console.error);
