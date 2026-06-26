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
  const sql = fs.readFileSync('migrations/012_fix_scan_log_mapping.sql', 'utf8');

  console.log('Running migration 012...');

  // Split by GO and execute each batch
  const batches = sql.split(/^\s*GO\s*$/gim).filter(b => b.trim() && !b.trim().startsWith('USE ') && !b.trim().startsWith('PRINT'));
  for (const batch of batches) {
    const trimmed = batch.trim();
    if (trimmed && !trimmed.startsWith('--')) {
      console.log('Executing batch...');
      try {
        await pool.request().query(trimmed);
      } catch (err: any) {
        console.error('Error:', err.message);
      }
    }
  }

  // Test the result
  console.log('\n=== Testing monthly view (June 2026, IJL) ===');
  const result = await pool.request().query(`
    SELECT TOP 10 employee_code, employee_name, division_code, total_present, total_absent
    FROM vw_attendance_zkteco_monthly_summary
    WHERE attendance_year = 2026 AND attendance_month = 6 AND division_code = 'IJL'
    ORDER BY employee_code
  `);
  console.table(result.recordset);

  await pool.close();
  console.log('\nMigration completed!');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
