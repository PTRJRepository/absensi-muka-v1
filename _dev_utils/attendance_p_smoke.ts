import dotenv from 'dotenv';
import mssql from 'mssql';

dotenv.config();

async function main() {
  const pool = await mssql.connect({
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
    options: {
      encrypt: (process.env.DB_ENCRYPT || 'false') === 'true',
      trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE || 'true') !== 'false',
    },
  });

  const result = await pool.request().query(`
    SELECT
      machine_code,
      COUNT(*) AS raw_count,
      COUNT(DISTINCT parsed_employee_code) AS employee_count,
      MAX(scan_date) AS last_scan_date
    FROM attendance_scan_logs
    WHERE machine_code IN ('P1A','P1B','P2A_01','P2B','P2A_02')
    GROUP BY machine_code
    ORDER BY machine_code
  `);

  console.table(result.recordset);
  await pool.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
