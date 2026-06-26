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

  // Check machine_user_raw structure
  console.log('=== machine_user_raw structure ===');
  try {
    const cols = await absensi.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'machine_user_raw'
      ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
    });

    // Sample data
    console.log('\n=== machine_user_raw sample data ===');
    const sample = await absensi.request().query(`SELECT TOP 10 * FROM machine_user_raw`);
    console.table(sample.recordset);
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  // Check machine_user_map
  console.log('\n=== machine_user_map structure ===');
  try {
    const cols = await absensi.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'machine_user_map'
      ORDER BY ORDINAL_POSITION
    `);
    cols.recordset.forEach(c => {
      const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}${len}`);
    });

    // Sample data
    console.log('\n=== machine_user_map sample data ===');
    const sample = await absensi.request().query(`SELECT TOP 10 * FROM machine_user_map`);
    console.table(sample.recordset);
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  // Check scan_logs raw_device_user_id vs parsed_employee_code
  console.log('\n=== scan_logs: raw_device_user_id vs parsed_employee_code ===');
  const scanSample = await absensi.request().query(`
    SELECT TOP 20
      raw_device_user_id,
      parsed_employee_code,
      mapping_status
    FROM attendance_scan_logs
    WHERE parsed_employee_code IS NOT NULL
    AND parsed_employee_code != ''
    LIMIT 20
  `);
  scanSample.recordset.forEach(r => {
    console.log(`  raw="${r.raw_device_user_id}" parsed="${r.parsed_employee_code}" status=${r.mapping_status}`);
  });

  await absensi.close();
}

main().catch(console.error);
