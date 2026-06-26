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

  console.log('Testing HR_EMPLOYEE...');
  const emp = await hr.request().query(`SELECT TOP 5 RTRIM(EmpCode) as EmpCode, RTRIM(EmpName) as EmpName FROM dbo.HR_EMPLOYEE ORDER BY EmpCode`);
  console.log('Found:', emp.recordset.length, 'records');
  emp.recordset.forEach(e => console.log(e.EmpCode, '-', e.EmpName.substring(0, 30)));

  await hr.close();
}
main().catch(e => console.error('Error:', e.message));
