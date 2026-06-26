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
  console.log('Connecting to DB_PTRJ...');
  const hr = await mssql.connect(hrDb);
  console.log('Connected!');

  console.log('Querying HR_EMPLOYEE...');
  try {
    const result = await hr.request().query('SELECT TOP 5 RTRIM(EmpCode) as EmpCode FROM dbo.HR_EMPLOYEE');
    console.log('Success! Records:', result.recordset.length);
    result.recordset.forEach((e: any) => console.log('  ', e.EmpCode));
  } catch (err: any) {
    console.log('Error:', err.message);
  }

  await hr.close();
  console.log('Done');
}

main().catch((err: any) => {
  console.error('Fatal:', err.message);
});
