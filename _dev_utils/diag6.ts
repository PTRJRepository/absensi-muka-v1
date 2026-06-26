import sql from 'mssql';
const cfg = { user:'sa', password:'<DB_PASSWORD>', server:'10.0.0.110', port:1433, database:'rebinmas_absensi_monitoring', options:{encrypt:false,trustServerCertificate:true} };
async function check() {
  const pool = await sql.connect(cfg);

  console.log("=== Employee 4000105 details ===");
  const r1 = await pool.request().query("SELECT e.employee_code, e.employee_name, e.division_id, d.division_code FROM employees e JOIN divisions d ON d.id = e.division_id WHERE e.employee_code = '4000105'");
  console.log(r1.recordset);

  console.log("\n=== AB2 employees (H-prefix) sample ===");
  const r2 = await pool.request().query("SELECT TOP 20 e.employee_code, e.employee_name, d.division_code FROM employees e JOIN divisions d ON d.id = e.division_id WHERE d.division_code = 'AB2'");
  for (const r of r2.recordset) console.log(r.employee_code, "|", r.employee_name, "|", r.division_code);

  console.log("\n=== What division do numeric employees belong to? ===");
  const r3 = await pool.request().query("SELECT d.division_code, COUNT(*) as cnt FROM employees e JOIN divisions d ON d.id = e.division_id WHERE e.employee_code NOT LIKE '[A-Z]%' GROUP BY d.division_code ORDER BY d.division_code");
  console.table(r3.recordset);

  console.log("\n=== AB2 MAPPED scan_logs vs AB2 employees ===");
  const r4 = await pool.request().query("SELECT TOP 5 s.parsed_employee_code, s.scan_date FROM attendance_scan_logs s WHERE s.machine_code = 'AB2' AND s.mapping_status = 'MAPPED'");
  for (const r of r4.recordset) {
    const emp = await pool.request().input('ec', r.parsed_employee_code).query("SELECT e.employee_code, d.division_code FROM employees e JOIN divisions d ON d.id = e.division_id WHERE e.employee_code = @ec");
    console.log("scan:", r.parsed_employee_code, "| employee division:", emp.recordset[0]?.division_code || 'NOT FOUND');
  }

  console.log("\n=== AB2 scan_logs where parsed matches AB2 employees ===");
  const r5 = await pool.request().query("SELECT COUNT(*) as cnt FROM attendance_scan_logs s WHERE s.machine_code = 'AB2' AND s.mapping_status = 'MAPPED' AND EXISTS (SELECT 1 FROM employees e JOIN divisions d ON d.id = e.division_id WHERE e.employee_code = s.parsed_employee_code AND d.division_code = 'AB2')");
  console.log("AB2 scans matching AB2 employees:", r5.recordset);

  console.log("\n=== AB2 scan_logs where parsed matches ANY employee ===");
  const r6 = await pool.request().query("SELECT COUNT(*) as cnt FROM attendance_scan_logs s WHERE s.machine_code = 'AB2' AND s.mapping_status = 'MAPPED' AND EXISTS (SELECT 1 FROM employees e WHERE e.employee_code = s.parsed_employee_code)");
  console.log("AB2 scans matching any employee:", r6.recordset);

  console.log("\n=== Total AB2 MAPPED scans ===");
  const r7 = await pool.request().query("SELECT COUNT(*) as cnt FROM attendance_scan_logs WHERE machine_code = 'AB2' AND mapping_status = 'MAPPED'");
  console.log("Total AB2 MAPPED:", r7.recordset);

  await pool.close();
}
check().catch(e=>console.error(e));
