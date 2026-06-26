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

  // Check PR_EMP_ATTN_DEVICE structure
  console.log('=== PR_EMP_ATTN_DEVICE structure ===');
  const cols = await hr.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'PR_EMP_ATTN_DEVICE'
    ORDER BY ORDINAL_POSITION
  `);
  cols.recordset.forEach(c => {
    const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
  });

  // Sample data
  console.log('\n=== PR_EMP_ATTN_DEVICE sample data ===');
  const sample = await hr.request().query(`SELECT TOP 20 * FROM PR_EMP_ATTN_DEVICE`);
  console.table(sample.recordset);

  // Get distinct device codes
  console.log('\n=== Distinct DeviceCode ===');
  const devices = await hr.request().query(`SELECT DISTINCT DeviceCode FROM PR_EMP_ATTN_DEVICE`);
  devices.recordset.forEach(d => console.log(`  ${d.DeviceCode}`));

  // Count
  console.log('\n=== Total records ===');
  const count = await hr.request().query(`SELECT COUNT(*) as cnt FROM PR_EMP_ATTN_DEVICE`);
  console.log(`  Total: ${count.recordset[0].cnt}`);

  await hr.close();
}

main().catch(console.error);
