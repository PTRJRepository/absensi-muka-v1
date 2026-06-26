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
  console.log('=== Columns of attendance_scan_logs_backup_20260623_233022 ===');
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'attendance_scan_logs_backup_20260623_233022'
  `);
  for (const c of cols.recordset) {
    console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`);
  }

  console.log('\n=== ID Ranges ===');
  const activeRange = await pool.request().query(`
    SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as cnt, MIN(scan_time) as min_scan, MAX(scan_time) as max_scan, MIN(created_at) as min_created, MAX(created_at) as max_created FROM attendance_scan_logs
  `);
  console.log(`Active: count = ${activeRange.recordset[0].cnt}`);
  console.log(`  min_id = ${activeRange.recordset[0].min_id}, max_id = ${activeRange.recordset[0].max_id}`);
  console.log(`  min_scan = ${activeRange.recordset[0].min_scan}, max_scan = ${activeRange.recordset[0].max_scan}`);
  console.log(`  min_created = ${activeRange.recordset[0].min_created}, max_created = ${activeRange.recordset[0].max_created}`);

  const backupRange = await pool.request().query(`
    SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as cnt, MIN(scan_time) as min_scan, MAX(scan_time) as max_scan, MIN(created_at) as min_created, MAX(created_at) as max_created FROM attendance_scan_logs_backup_20260623_233022
  `);
  console.log(`Backup: count = ${backupRange.recordset[0].cnt}`);
  console.log(`  min_id = ${backupRange.recordset[0].min_id}, max_id = ${backupRange.recordset[0].max_id}`);
  console.log(`  min_scan = ${backupRange.recordset[0].min_scan}, max_scan = ${backupRange.recordset[0].max_scan}`);
  console.log(`  min_created = ${backupRange.recordset[0].min_created}, max_created = ${backupRange.recordset[0].max_created}`);

  const postBackupActive = await pool.request().query(`
    SELECT COUNT(*) as cnt FROM attendance_scan_logs
    WHERE created_at > '2026-06-23 23:30:22'
  `);
  console.log(`\nActive records created after backup time: ${postBackupActive.recordset[0].cnt}`);
  
  await pool.close();
}

main().catch(console.error);
