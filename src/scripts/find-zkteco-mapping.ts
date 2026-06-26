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

  // Look for tables with potential fingerprint/biometric data
  console.log('=== Tables with ATTN/DEVICE/FINGER/BIOMETRIC ===');
  const tables = await hr.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    AND (
      TABLE_NAME LIKE '%ATTN%'
      OR TABLE_NAME LIKE '%DEVICE%'
      OR TABLE_NAME LIKE '%FINGER%'
      OR TABLE_NAME LIKE '%BIO%'
      OR TABLE_NAME LIKE '%CARD%'
      OR TABLE_NAME LIKE '%TEMPLATE%'
      OR TABLE_NAME LIKE '%ENROLL%'
      OR TABLE_NAME LIKE '%USER%'
    )
    ORDER BY TABLE_NAME
  `);
  tables.recordset.forEach(t => console.log(`  ${t.TABLE_NAME}`));

  // Check HR_EMPATTN if exists
  console.log('\n=== Checking HR_EMPATTN ===');
  try {
    const cols = await hr.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'HR_EMPATTN'
      ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
    });
    const sample = await hr.request().query(`SELECT TOP 10 * FROM HR_EMPATTN`);
    console.table(sample.recordset);
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  // Check PR tables for attendance/device mapping
  console.log('\n=== PR tables ===');
  const prTables = await hr.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    AND TABLE_NAME LIKE 'PR%'
    ORDER BY TABLE_NAME
  `);
  prTables.recordset.forEach(t => console.log(`  ${t.TABLE_NAME}`));

  // Check PR_EMP_ATTN_ARC structure
  console.log('\n=== PR_EMP_ATTN_ARC structure ===');
  try {
    const cols = await hr.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'PR_EMP_ATTN_ARC'
      ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
    });
    const sample = await hr.request().query(`SELECT TOP 10 * FROM PR_EMP_ATTN_ARC`);
    console.table(sample.recordset);
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  await hr.close();
}

main().catch(console.error);
