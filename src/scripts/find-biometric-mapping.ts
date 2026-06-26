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

  // Search for tables with CARD, FINGER, BIO, ENROLL, DEVICE, ZKTECO keywords
  console.log('=== Searching for biometric/card mapping tables ===');
  const tables = await hr.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    AND (
      TABLE_NAME LIKE '%CARD%'
      OR TABLE_NAME LIKE '%FINGER%'
      OR TABLE_NAME LIKE '%BIO%'
      OR TABLE_NAME LIKE '%ENROLL%'
      OR TABLE_NAME LIKE '%DEVICE%'
      OR TABLE_NAME LIKE '%ZKTECO%'
      OR TABLE_NAME LIKE '%ATTN%'
      OR TABLE_NAME LIKE '%ATTEND%'
    )
    ORDER BY TABLE_NAME
  `);
  tables.recordset.forEach(t => console.log(`  ${t.TABLE_NAME}`));

  // Check HR_FINGER or similar
  console.log('\n=== Checking tables with "FINGER" ===');
  const fingerTables = await hr.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    AND TABLE_NAME LIKE '%FING%'
  `);
  fingerTables.recordset.forEach(t => console.log(`  ${t.TABLE_NAME}`));

  // Check HR_HS (might be finger?)
  console.log('\n=== HR_HS structure ===');
  try {
    const cols = await hr.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'HR_HS'
      ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
    });

    const sample = await hr.request().query(`SELECT TOP 5 * FROM HR_HS`);
    console.log('\nSample:');
    console.table(sample.recordset);
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  // Check HR_GPH
  console.log('\n=== HR_GPH structure (might be photo/fingerprint?) ===');
  try {
    const cols = await hr.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'HR_GPH'
      ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
    });

    const sample = await hr.request().query(`SELECT TOP 5 * FROM HR_GPH`);
    console.log('\nSample:');
    console.table(sample.recordset);
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  await hr.close();
}

main().catch(console.error);
