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
  const db = {
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true },
  };

  const pool = await mssql.connect(db);

  console.log('=== Checking databases on 10.0.0.110 ===\n');

  // List all databases
  const dbs = await pool.request().query(`
    SELECT name, database_id, create_date
    FROM sys.databases
    WHERE state_desc = 'ONLINE'
    ORDER BY name
  `);
  console.log('Available databases:');
  dbs.recordset.forEach((db, i) => {
    console.log(`  ${i + 1}. ${db.name}`);
  });

  // Look for HR-related databases
  const hrDbs = dbs.recordset.filter(db =>
    db.name.toUpperCase().includes('HR') ||
    db.name.toUpperCase().includes('PTRJ') ||
    db.name.toUpperCase().includes('REBIN') ||
    db.name.toUpperCase().includes('PAYROLL') ||
    db.name.toUpperCase().includes('EMPLOYEE')
  );

  if (hrDbs.length > 0) {
    console.log('\n=== Potential HR databases ===');
    hrDbs.forEach(db => console.log(`  - ${db.name}`));
  }

  // Check for tables named HR_EMPLOYEE or similar
  console.log('\n=== Searching for HR_EMPLOYEE tables ===');
  for (const dbRow of dbs.recordset.slice(0, 20)) {  // Check first 20 databases
    try {
      const tables = await pool.request().query(`
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM ${dbRow.name}.INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        AND (TABLE_NAME LIKE '%HR%' OR TABLE_NAME LIKE '%EMPLOYEE%' OR TABLE_NAME LIKE '%KARYAWAN%')
      `);
      if (tables.recordset.length > 0) {
        console.log(`\n${dbRow.name}:`);
        tables.recordset.forEach(t => console.log(`  - ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`));
      }
    } catch (e) {
      // Skip databases we can't access
    }
  }

  await pool.close();
  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
