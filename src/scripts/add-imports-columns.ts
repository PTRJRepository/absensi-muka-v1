import fs from 'fs';
import mssql from 'mssql';

function loadEnv() {
  if (fs.existsSync('.env')) {
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

loadEnv();

async function run() {
  console.log('Connecting...');
  console.log('DB:', process.env.DB_NAME);

  const pool = await mssql.connect({
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
    options: { encrypt: false, trustServerCertificate: true }
  });

  console.log('Connected. Adding columns to attendance_imports...');

  const cols = [
    ['parsed_employee_code', 'NVARCHAR(30)'],
    ['resolved_nik', 'NVARCHAR(50)'],
    ['current_emp_code', 'NVARCHAR(30)'],
    ['current_employee_id', 'INT'],
    ['mapping_version', 'NVARCHAR(50)']
  ];

  for (const [name, type] of cols) {
    const exists = await pool.query(
      `SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.attendance_imports') AND name = '${name}'`
    );
    if (exists.recordset.length === 0) {
      await pool.query(
        `ALTER TABLE dbo.attendance_imports ADD ${name} ${type} NULL`
      );
      console.log('Added: ' + name);
    } else {
      console.log('Exists: ' + name);
    }
  }

  await pool.close();
  console.log('Done!');
}

run().catch(console.error);
