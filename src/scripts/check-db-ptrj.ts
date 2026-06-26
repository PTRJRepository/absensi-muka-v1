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
  // Use master database
  const db = {
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true },
  };

  console.log('Connecting to:', db.server);
  console.log('User:', db.user);
  console.log('Database:', db.database);

  try {
    const pool = await mssql.connect(db);

    console.log('\n=== Checking databases on 10.0.0.110 ===\n');

    // List all databases
    const dbs = await pool.request().query(`
      SELECT name, database_id
      FROM sys.databases
      WHERE state_desc = 'ONLINE'
      ORDER BY name
    `);
    console.log('Available databases:');
    dbs.recordset.forEach((db, i) => {
      console.log(`  ${i + 1}. ${db.name}`);
    });

    // Check for DB_PTRJ
    const ptrjDb = dbs.recordset.find(db => db.name === 'DB_PTRJ');
    if (ptrjDb) {
      console.log('\n=== Found DB_PTRJ! ===');

      // List tables in DB_PTRJ
      const tables = await pool.request().query(`
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM DB_PTRJ.INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `);
      console.log('\nTables in DB_PTRJ:');
      tables.recordset.forEach(t => {
        console.log(`  ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
      });

      // Check for HR_EMPLOYEE
      const hrTable = tables.recordset.find(t =>
        t.TABLE_NAME.toUpperCase().includes('HR') ||
        t.TABLE_NAME.toUpperCase().includes('EMPLOYEE') ||
        t.TABLE_NAME.toUpperCase().includes('KARYAWAN')
      );

      if (hrTable) {
        console.log('\n=== Found HR table: ' + hrTable.TABLE_NAME + ' ===');

        // Get columns
        const cols = await pool.request().query(`
          SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
          FROM DB_PTRJ.INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = '${hrTable.TABLE_NAME}'
          ORDER BY ORDINAL_POSITION
        `);
        console.log('\nColumns:');
        cols.recordset.forEach(c => {
          console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''})`);
        });

        // Sample data
        const sample = await pool.request().query(`
          SELECT TOP 10 *
          FROM DB_PTRJ.${hrTable.TABLE_SCHEMA}.${hrTable.TABLE_NAME}
        `);
        console.log('\nSample data:');
        console.table(sample.recordset);
      }
    }

    await pool.close();
  } catch (err: any) {
    console.error('Connection error:', err.message);
  }
}

main().catch((err: any) => {
  console.error('Connection error:', err.message);
});
