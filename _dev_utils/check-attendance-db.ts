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

  console.log('=== DATABASE: rebinmas_absensi_monitoring ===\n');

  // List tables
  const tables = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME
  `);
  console.log(`Tables (${tables.recordset.length}):`);
  for (const t of tables.recordset) {
    console.log(`  - ${t.TABLE_NAME}`);
  }

  // Check employees schema
  console.log('\n--- employees columns ---');
  const empCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employees'
  `);
  for (const c of empCols.recordset) {
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`);
  }

  // Check attendance_scan_logs schema
  console.log('\n--- attendance_scan_logs columns ---');
  const scanCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'attendance_scan_logs'
  `);
  for (const c of scanCols.recordset) {
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`);
  }

  // Check divisions schema
  console.log('\n--- divisions columns ---');
  const divCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'divisions'
  `);
  for (const c of divCols.recordset) {
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`);
  }

  // Check data
  console.log('\n--- Current Data ---');
  const empCount = await pool.request().query('SELECT COUNT(*) as cnt FROM employees');
  const attCount = await pool.request().query('SELECT COUNT(*) as cnt FROM attendance_scan_logs');
  const divCount = await pool.request().query('SELECT COUNT(*) as cnt FROM divisions');
  console.log(`employees: ${empCount.recordset[0].cnt}`);
  console.log(`attendance_scan_logs: ${attCount.recordset[0].cnt}`);
  console.log(`divisions: ${divCount.recordset[0].cnt}`);

  await pool.close();
}

main().catch(console.error);
