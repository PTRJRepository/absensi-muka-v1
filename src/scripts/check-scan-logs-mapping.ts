import mssql from 'mssql';

const absensiDb = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const absensi = await mssql.connect(absensiDb);

  // List all tables
  console.log('=== All tables in rebinmas_absensi_monitoring ===');
  const tables = await absensi.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);
  tables.recordset.forEach(t => console.log(`  ${t.TABLE_NAME}`));

  // Check scan_logs structure
  console.log('\n=== attendance_scan_logs structure ===');
  const cols = await absensi.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'attendance_scan_logs'
    ORDER BY ORDINAL_POSITION
  `);
  cols.recordset.forEach(c => {
    const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
  });

  // Check raw_device_user_id vs parsed_employee_code
  console.log('\n=== scan_logs: raw vs parsed ===');
  const scanSample = await absensi.request().query(`
    SELECT TOP 30
      raw_device_user_id,
      parsed_employee_code,
      mapping_status
    FROM attendance_scan_logs
    WHERE parsed_employee_code IS NOT NULL
    AND parsed_employee_code != ''
    ORDER BY id
  `);
  scanSample.recordset.forEach(r => {
    console.log(`  raw="${r.raw_device_user_id}" parsed="${r.parsed_employee_code}" status=${r.mapping_status}`);
  });

  await absensi.close();
}

main().catch(console.error);
