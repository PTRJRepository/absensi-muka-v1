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

  // List all HR_EMP* tables
  console.log('=== HR_EMP* tables ===');
  const tables = await hr.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    AND TABLE_NAME LIKE 'HR_EMP%'
    ORDER BY TABLE_NAME
  `);
  tables.recordset.forEach(t => {
    console.log(`  ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
  });

  // Check HR_EMPCODE
  console.log('\n=== HR_EMPCODE structure ===');
  try {
    const cols = await hr.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'HR_EMPCODE'
      ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
    });

    // Sample data
    console.log('\n=== HR_EMPCODE sample data ===');
    const sample = await hr.request().query(`SELECT TOP 10 * FROM HR_EMPCODE`);
    console.table(sample.recordset);
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  // Check HR_EMP_CARD
  console.log('\n=== HR_EMP_CARD structure ===');
  try {
    const cols = await hr.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'HR_EMP_CARD'
      ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
    });

    // Sample data
    console.log('\n=== HR_EMP_CARD sample data ===');
    const sample = await hr.request().query(`SELECT TOP 10 * FROM HR_EMP_CARD`);
    console.table(sample.recordset);
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  await hr.close();
}

main().catch(console.error);
