import * as dotenv from 'dotenv';
import mssql from 'mssql';

dotenv.config();

async function main() {
  console.log('DB_NAME:', process.env.DB_NAME);
  console.log('DB_SERVER:', process.env.DB_SERVER);
  console.log('LOCAL_DB_NAME:', process.env.DB_NAME || 'rebinmas_absensi_monitoring');

  const pool = await mssql.connect({
    server: process.env.DB_SERVER || '10.0.0.110',
    port: 1433,
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
    database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
    options: { encrypt: false, trustServerCertificate: true }
  });

  try {
    const dbName = await pool.query("SELECT DB_NAME() as dbname");
    console.log('Connected to DB:', dbName.recordset[0].dbname);

    const tables = await pool.query("SELECT name FROM sys.tables WHERE type='U' AND name IN ('hr_employee_current_snapshot', 'employee_code_history')");
    console.log('Tables found:', tables.recordset.length);
    tables.recordset.forEach((t: any) => console.log(' -', t.name));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error('Failed:', error.message);
  process.exitCode = 1;
});
