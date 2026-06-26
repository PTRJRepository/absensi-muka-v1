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
  // Connect to DB_PTRJ directly
  const db = {
    server: '10.0.0.110',
    port: 1433,
    user: 'sa',
    password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
    database: 'DB_PTRJ',
    options: { encrypt: false, trustServerCertificate: true },
  };

  console.log('Connecting to DB_PTRJ...');

  try {
    const pool = await mssql.connect(db);
    console.log('Connected!\n');

    // List tables
    const tables = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);
    console.log('=== Tables in DB_PTRJ ===');
    tables.recordset.forEach(t => console.log(`  ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`));

    // Look for HR_EMPLOYEE or similar
    const hrTables = tables.recordset.filter(t =>
      t.TABLE_NAME.toUpperCase().includes('HR') ||
      t.TABLE_NAME.toUpperCase().includes('EMPLOYEE') ||
      t.TABLE_NAME.toUpperCase().includes('KARYAWAN')
    );

    if (hrTables.length > 0) {
      console.log('\n=== HR-related tables ===');
      hrTables.forEach(t => console.log(`  ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`));

      // Check first HR table
      const hrTable = hrTables[0];
      console.log(`\n=== Checking ${hrTable.TABLE_NAME} ===`);

      const cols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${hrTable.TABLE_NAME}'
        ORDER BY ORDINAL_POSITION
      `);
      console.log('Columns:');
      cols.recordset.forEach(c => {
        console.log(`  - ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''})`);
      });

      // Sample data
      const sample = await pool.request().query(`SELECT TOP 5 * FROM ${hrTable.TABLE_SCHEMA}.${hrTable.TABLE_NAME}`);
      console.log('\nSample data:');
      console.table(sample.recordset);
    }

    await pool.close();
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
