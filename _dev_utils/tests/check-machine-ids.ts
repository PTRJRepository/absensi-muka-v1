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

  console.log('=== machine_id in attendance_machines ===');
  const machines = await pool.request().query(`
    SELECT id, machine_code, location_name FROM attendance_machines
  `);
  for (const m of machines.recordset) {
    console.log(`  id = ${m.id}, code = ${m.machine_code}, loc = ${m.location_name}`);
  }

  console.log('\n=== machine_id in attendance_scan_logs_backup_20260623_233022 ===');
  const backupMachines = await pool.request().query(`
    SELECT DISTINCT machine_id, machine_code FROM attendance_scan_logs_backup_20260623_233022
  `);
  for (const bm of backupMachines.recordset) {
    console.log(`  machine_id = ${bm.machine_id}, machine_code = ${bm.machine_code}`);
  }

  console.log('\n=== machine_id in mst_machine ===');
  try {
    const mst = await pool.request().query(`
      SELECT machine_id, machine_code FROM mst_machine
    `);
    for (const m of mst.recordset) {
      console.log(`  machine_id = ${m.machine_id}, code = ${m.machine_code}`);
    }
  } catch (err: any) {
    console.log(`  ERROR reading mst_machine: ${err.message}`);
  }

  await pool.close();
}

main().catch(console.error);
