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

  // Check scan_logs for any name field
  console.log('=== Full scan_logs sample with all fields ===');
  const scanSample = await absensi.request().query(`
    SELECT TOP 20 *
    FROM attendance_scan_logs
    WHERE parsed_employee_code IS NOT NULL
    AND parsed_employee_code != ''
    ORDER BY id
  `);
  console.log('Columns:', scanSample.recordset.columns ? Object.keys(scanSample.recordset.columns) : 'N/A');

  // Print one full record
  if (scanSample.recordset.length > 0) {
    console.log('\n=== Sample record ===');
    const record = scanSample.recordset[0];
    Object.keys(record).forEach(key => {
      if (record[key] !== null) {
        console.log(`  ${key}: ${JSON.stringify(record[key])}`);
      }
    });
  }

  // Check attendance_sync_logs for user data
  console.log('\n=== attendance_sync_logs structure ===');
  const syncCols = await absensi.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'attendance_sync_logs'
    ORDER BY ORDINAL_POSITION
  `);
  syncCols.recordset.forEach(c => {
    const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
  });

  // Sample sync_logs
  console.log('\n=== attendance_sync_logs sample ===');
  const syncSample = await absensi.request().query(`SELECT TOP 10 * FROM attendance_sync_logs`);
  console.table(syncSample.recordset);

  await absensi.close();
}

main().catch(console.error);
