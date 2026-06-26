import sql from 'mssql';
const cfg = { user:'sa', password:'<DB_PASSWORD>', server:'10.0.0.110', port:1433, database:'rebinmas_absensi_monitoring', options:{encrypt:false,trustServerCertificate:true} };
async function check() {
  const pool = await sql.connect(cfg);
  console.log("=== Employees with pure numeric codes ===");
  const r1 = await pool.request().query("SELECT TOP 20 employee_code, employee_name, division_id FROM employees WHERE employee_code NOT LIKE '[A-Z]%' ORDER BY employee_code");
  for (const r of r1.recordset) console.log(r.employee_code, "|", r.employee_name, "| div:", r.division_id);

  console.log("\n=== Employee code format distribution ===");
  const r2 = await pool.request().query("SELECT CASE WHEN employee_code LIKE '[A-Z]%' THEN LEFT(employee_code,1) ELSE 'NUMERIC' END as prefix, COUNT(*) as cnt, MIN(employee_code) as sample FROM employees GROUP BY CASE WHEN employee_code LIKE '[A-Z]%' THEN LEFT(employee_code,1) ELSE 'NUMERIC' END ORDER BY prefix");
  for (const r of r2.recordset) console.log("prefix:", r.prefix, "| cnt:", r.cnt, "| sample:", r.sample);

  console.log("\n=== Divisions table ===");
  const r3 = await pool.request().query("SELECT id, division_code, division_name FROM divisions ORDER BY id");
  for (const r of r3.recordset) console.log("id:", r.id, "|", r.division_code, "|", r.division_name);

  console.log("\n=== MILL scan_logs sample ===");
  const r4 = await pool.request().query("SELECT TOP 5 raw_device_user_id, parsed_employee_code, mapping_status FROM attendance_scan_logs WHERE machine_code='MILL' ORDER BY id DESC");
  for (const r of r4.recordset) console.log("raw:", r.raw_device_user_id, "| parsed:", r.parsed_employee_code, "| status:", r.mapping_status);

  console.log("\n=== OFFICE_APE scan_logs sample ===");
  const r5 = await pool.request().query("SELECT TOP 5 raw_device_user_id, parsed_employee_code, mapping_status FROM attendance_scan_logs WHERE machine_code='OFFICE_APE' ORDER BY id DESC");
  for (const r of r5.recordset) console.log("raw:", r.raw_device_user_id, "| parsed:", r.parsed_employee_code, "| status:", r.mapping_status);

  console.log("\n=== attendance_machines table ===");
  const r6 = await pool.request().query("SELECT machine_code, loc_code, scanner_code, access_status FROM attendance_machines ORDER BY machine_code");
  for (const r of r6.recordset) console.log(r.machine_code, "| loc:", r.loc_code, "| scanner:", r.scanner_code, "| access:", r.access_status);

  await pool.close();
}
check().catch(e=>console.error(e));
