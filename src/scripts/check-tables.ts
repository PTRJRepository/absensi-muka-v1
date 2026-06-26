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

  // List all tables
  const result = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);

  console.log('Tables in database:');
  for (const row of result.recordset) {
    console.log(`  ${row.TABLE_SCHEMA}.${row.TABLE_NAME}`);
  }

  // List all views
  const views = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.VIEWS
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);

  console.log('\nViews in database:');
  for (const row of views.recordset) {
    console.log(`  ${row.TABLE_SCHEMA}.${row.TABLE_NAME}`);
  }

  await pool.close();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
