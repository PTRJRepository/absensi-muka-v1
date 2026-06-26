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

  // Search for any table containing "ATTN" in DB_PTRJ
  console.log('=== All ATTN-related tables in DB_PTRJ ===');
  const attnTables = await hr.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    AND TABLE_NAME LIKE '%ATTN%'
    ORDER BY TABLE_NAME
  `);
  attnTables.recordset.forEach(t => console.log(`  ${t.TABLE_NAME}`));

  // Check HR_FIXED_AD_ATTN (might contain device mapping)
  console.log('\n=== HR_FIXED_AD_ATTN structure ===');
  const cols = await hr.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'HR_FIXED_AD_ATTN'
    ORDER BY ORDINAL_POSITION
  `);
  cols.recordset.forEach(c => {
    const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
  });

  // Sample data
  console.log('\n=== HR_FIXED_AD_ATTN sample data ===');
  const sample = await hr.request().query(`SELECT TOP 10 * FROM HR_FIXED_AD_ATTN`);
  console.table(sample.recordset);

  // Check IF_MOBILE_DEVICE - might have device enrollment
  console.log('\n=== IF_MOBILE_DEVICE structure ===');
  try {
    const cols = await hr.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'IF_MOBILE_DEVICE'
      ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
    });
    const sample = await hr.request().query(`SELECT TOP 10 * FROM IF_MOBILE_DEVICE`);
    console.table(sample.recordset);
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  await hr.close();
}

main().catch(console.error);
