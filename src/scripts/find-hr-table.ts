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

  // Find HR tables (case insensitive)
  console.log('=== HR-related tables in DB_PTRJ ===');
  const tables = await hr.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    AND (TABLE_NAME LIKE '%HR%' OR TABLE_NAME LIKE '%EMP%' OR TABLE_NAME LIKE '%EMPLOYEE%')
    ORDER BY TABLE_NAME
  `);
  tables.recordset.forEach(t => {
    console.log(`  ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
  });

  // Try with different case
  console.log('\n=== Trying exact table name ===');
  const exact = await hr.request().query(`SELECT TOP 3 * FROM dbo.HR_EMPLOYEE`);
  console.table(exact.recordset);

  await hr.close();
}

main().catch(console.error);
