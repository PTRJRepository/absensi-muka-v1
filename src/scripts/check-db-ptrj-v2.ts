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
  // Try with DATABASE_PROFILES_SERVER_PROFILE_1 credentials
  const db = {
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD || process.env.DB_PASSWORD || '',
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true },
  };

  console.log('Trying to connect to:', db.server);
  console.log('With user:', db.user);

  try {
    const pool = await mssql.connect(db);
    console.log('Connected!');

    // List all databases
    const dbs = await pool.request().query(`
      SELECT name
      FROM sys.databases
      WHERE state_desc = 'ONLINE'
      ORDER BY name
    `);
    console.log('\nDatabases:');
    dbs.recordset.forEach((d, i) => console.log(`  ${i + 1}. ${d.name}`));

    // Check for DB_PTRJ
    if (dbs.recordset.find(d => d.name === 'DB_PTRJ')) {
      console.log('\n=== Found DB_PTRJ! ===');

      const tables = await pool.request().query(`
        SELECT TABLE_NAME
        FROM DB_PTRJ.INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
      `);
      console.log('Tables:');
      tables.recordset.forEach(t => console.log(`  - ${t.TABLE_NAME}`));
    }

    await pool.close();
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
