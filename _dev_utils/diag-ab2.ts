import sql from 'mssql';
const config = { user:'sa', password:'<DB_PASSWORD>', server:'10.0.0.110', port:1433, database:'rebinmas_absensi_monitoring', options:{ encrypt:false, trustServerCertificate:true } };
async function diagnose() {
  const pool = await sql.connect(config);
  console.log('Connected');
  console.log('\n=== 1. AB2 machine ===');
  const r1 = await pool.request().query("SELECT machine_code, location_name, ip_address, port, access_status, data_source FROM attendance_machines WHERE machine_code = 'AB2'");
  console.table(r1.recordset);
  console.log('\n=== 2. AB2 scan_logs ===');
  const r2 = await pool.request().query("SELECT TOP 5 id, machine_code, raw_device_user_id, parsed_employee_code, scan_date, mapping_status, sync_batch_id FROM attendance_scan_logs WHERE machine_code='AB2' ORDER BY scan_date DESC");
  console.table(r2.recordset);
  console.log('\n=== 3. H-prefix employees ===');
  const r3 = await pool.request().query("SELECT TOP 10 id, employee_code, employee_name FROM employees WHERE employee_code LIKE 'H%'");
  console.table(r3.recordset);
  console.log('\n=== 4. All machines in scan_logs ===');
  const r4 = await pool.request().query("SELECT machine_code, COUNT(*) as cnt, MIN(scan_date) as earliest, MAX(scan_date) as latest FROM attendance_scan_logs GROUP BY machine_code ORDER BY machine_code");
  console.table(r4.recordset);
  console.log('\n=== 5. Mapping status ===');
  const r5 = await pool.request().query("SELECT machine_code, mapping_status, COUNT(*) as cnt FROM attendance_scan_logs GROUP BY machine_code, mapping_status ORDER BY machine_code");
  console.table(r5.recordset);
  console.log('\n=== 6. Imports by division ===');
  const r6 = await pool.request().query("SELECT division_code, source, COUNT(*) as cnt FROM attendance_imports GROUP BY division_code, source ORDER BY division_code");
  console.table(r6.recordset);
  console.log('\n=== 7. Matrix all divisions ===');
  try { const r7 = await pool.request().query("SELECT division_code, COUNT(*) as total, SUM(CASE WHEN final_status='PRESENT' THEN 1 ELSE 0 END) as present FROM vw_attendance_monthly_matrix WHERE attendance_year=2026 AND attendance_month=6 GROUP BY division_code ORDER BY division_code"); console.table(r7.recordset); }
  catch(e:any) { console.log('matrix err:', e.message); }
  await pool.close();
}
diagnose().catch(e=>console.error(e));
