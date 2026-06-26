import fs from 'fs';
// @ts-ignore
import mssql from 'mssql';

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function main() {
  loadEnv();
  const db = {
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
    options: { encrypt: false, trustServerCertificate: true },
  };

  const pool = await mssql.connect(db);

  // Check for mapping tables
  console.log('=== All tables containing "map" or "mapping" ===');
  const tables = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    AND (TABLE_NAME LIKE '%map%' OR TABLE_NAME LIKE '%mapping%')
  `);
  console.table(tables.recordset);

  // Check employee_mapping_overrides
  console.log('\n=== employee_mapping_overrides sample ===');
  const mapping = await pool.request().query(`
    SELECT TOP 10 *
    FROM employee_mapping_overrides
  `);
  console.table(mapping.recordset);

  // Check if there's a device_user_id column in employees or a link table
  console.log('\n=== employee_mapping_overrides columns ===');
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'employee_mapping_overrides'
    ORDER BY ORDINAL_POSITION
  `);
  console.log(cols.recordset.map(c => c.COLUMN_NAME).join(', '));

  await pool.close();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
