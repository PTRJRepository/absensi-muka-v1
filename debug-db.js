#!/usr/bin/env node
require('dotenv').config();
const mssql = require('mssql');

async function main() {
  console.log('DB_NAME:', process.env.DB_NAME);
  console.log('LOCAL_DB_NAME:', process.env.DB_NAME || 'rebinmas_absensi_monitoring');
  console.log('DB_SERVER:', process.env.DB_SERVER);

  const pool = await mssql.connect({
    server: process.env.DB_SERVER || '10.0.0.110',
    port: parseInt(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
    database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
    options: { encrypt: false, trustServerCertificate: true }
  });

  const dbName = await pool.query`SELECT DB_NAME() as dbname`;
  console.log('Connected to DB:', dbName.recordset[0].dbname);

  const tables = await pool.query`SELECT name FROM sys.tables WHERE type='U' AND name IN ('hr_employee_current_snapshot', 'employee_code_history')`;
  console.log('Tables found:', tables.recordset.length);
  tables.recordset.forEach(r => console.log(' -', r.name));

  await pool.close();
}

main().catch(console.error);
