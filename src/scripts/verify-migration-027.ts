/**
 * Verify Migration 027 - Check if data was fixed
 */
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

  const pool = await mssql.connect({
    server: process.env.DB_SERVER ?? '10.0.0.110',
    port: Number(process.env.DB_PORT ?? '1433'),
    user: process.env.DB_USER ?? 'sa',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'rebinmas_absensi_monitoring',
    options: { trustServerCertificate: true },
  });

  console.log('=== VERIFICATION: Checking 50040 -> C0040 ===\n');

  const rows = await pool.request().query(`
    SELECT TOP 15
      id,
      machine_code,
      raw_device_user_id,
      parsed_employee_code,
      mapping_status,
      mapping_reason,
      scan_date
    FROM attendance_scan_logs
    WHERE raw_device_user_id IN ('50040', '5000669', '700040', '10044', '50001')
    ORDER BY raw_device_user_id, scan_date DESC
  `);

  console.table(rows.recordset);

  console.log('\n=== Expected: 50040 -> C0040, 5000669 -> C0669 ===');

  const countFixed = await pool.request().query(`
    SELECT COUNT(*) as cnt
    FROM attendance_scan_logs
    WHERE raw_device_user_id = '50040'
      AND parsed_employee_code = 'C0040'
  `);
  console.log(`\nRecords with 50040 -> C0040: ${countFixed.recordset[0].cnt}`);

  const countWrong = await pool.request().query(`
    SELECT COUNT(*) as cnt
    FROM attendance_scan_logs
    WHERE raw_device_user_id = '50040'
      AND parsed_employee_code <> 'C0040'
  `);
  console.log(`Records still wrong (not C0040): ${countWrong.recordset[0].cnt}`);

  await pool.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
