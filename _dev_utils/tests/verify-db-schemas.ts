import mssql from 'mssql';

const dbConfig = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const pool = await mssql.connect(dbConfig);

  console.log('=== Backup Table Counts ===');
  const backupTables = [
    'attendance_scan_logs_backup_20260623_233022',
    'employees_backup_20260623',
    'attendance_machines_backup_20260623',
    'zkteco_hr_employee_map_backup_20260623',
    'zkteco_absensi_user_registry_backup_current_empcode_20260623'
  ];

  for (const table of backupTables) {
    try {
      const res = await pool.request().query(`SELECT COUNT(*) as cnt FROM ${table}`);
      console.log(`  - ${table}: ${res.recordset[0].cnt} rows`);
    } catch (err: any) {
      console.log(`  - ${table}: ERROR (${err.message})`);
    }
  }

  console.log('\n=== machine_user_raw Columns ===');
  try {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'machine_user_raw'
    `);
    for (const c of cols.recordset) {
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`);
    }
    const res = await pool.request().query(`SELECT COUNT(*) as cnt FROM machine_user_raw`);
    console.log(`machine_user_raw row count: ${res.recordset[0].cnt}`);
  } catch (err: any) {
    console.log(`ERROR checking machine_user_raw: ${err.message}`);
  }

  console.log('\n=== attendance_machines Columns ===');
  try {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'attendance_machines'
    `);
    for (const c of cols.recordset) {
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`);
    }
    const res = await pool.request().query(`SELECT COUNT(*) as cnt FROM attendance_machines`);
    console.log(`attendance_machines row count: ${res.recordset[0].cnt}`);
  } catch (err: any) {
    console.log(`ERROR checking attendance_machines: ${err.message}`);
  }

  console.log('\n=== attendance_imports Columns ===');
  try {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'attendance_imports'
    `);
    for (const c of cols.recordset) {
      console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`);
    }
    const res = await pool.request().query(`SELECT COUNT(*) as cnt FROM attendance_imports`);
    console.log(`attendance_imports row count: ${res.recordset[0].cnt}`);
  } catch (err: any) {
    console.log(`ERROR checking attendance_imports: ${err.message}`);
  }

  await pool.close();
}

main().catch(console.error);
