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

  // Check raw data with different patterns
  console.log('=== IJL Raw scan logs - different patterns ===');
  const rawLogs = await pool.request().query(`
    SELECT TOP 30
      id,
      raw_device_user_id,
      parsed_employee_code,
      mapping_status,
      mapping_reason
    FROM attendance_scan_logs
    WHERE machine_code = 'IJL'
    ORDER BY id DESC
  `);

  for (const row of rawLogs.recordset) {
    console.log(`ID: ${row.id}, Raw: "${row.raw_device_user_id}", Parsed: "${row.parsed_employee_code}", Status: ${row.mapping_status}, Reason: ${row.mapping_reason}`);
  }

  // Statistics on mapping status
  console.log('\n=== Mapping status statistics ===');
  const stats = await pool.request().query(`
    SELECT mapping_status, COUNT(*) as count
    FROM attendance_scan_logs
    WHERE machine_code = 'IJL'
    GROUP BY mapping_status
  `);
  console.table(stats.recordset);

  await pool.close();
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
