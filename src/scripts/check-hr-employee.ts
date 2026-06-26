import mssql from 'mssql';

const db = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'DB_PTRJ',
  options: { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const pool = await mssql.connect(db);

  // Get HR_EMPLOYEE columns
  console.log('=== HR_EMPLOYEE Columns ===');
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'HR_EMPLOYEE'
    ORDER BY ORDINAL_POSITION
  `);
  cols.recordset.forEach(c => {
    const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len} ${c.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL'}`);
  });

  // Sample data
  console.log('\n=== HR_EMPLOYEE Sample Data (Top 5) ===');
  const sample = await pool.request().query(`SELECT TOP 5 * FROM HR_EMPLOYEE`);
  console.table(sample.recordset);

  // Check for employee code columns
  console.log('\n=== Employee Code Candidates ===');
  const empCodeCols = cols.recordset.filter(c => 
    c.COLUMN_NAME.toUpperCase().includes('EMP') && 
    c.COLUMN_NAME.toUpperCase().includes('CODE')
  );
  empCodeCols.forEach(c => console.log(`  ${c.COLUMN_NAME}`));

  await pool.close();
}

main().catch(console.error);
