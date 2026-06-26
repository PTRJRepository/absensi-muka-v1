import sql from 'mssql';
const cfg = { user:'sa', password:'<DB_PASSWORD>', server:'10.0.0.110', port:1433, database:'rebinmas_absensi_monitoring', options:{encrypt:false,trustServerCertificate:true} };
async function check() {
  const pool = await sql.connect(cfg);
  console.log("=== Matrix view - ALL divisions (June 2026) ===");
  try {
    const r = await pool.request().query("SELECT division_code, COUNT(*) as total, SUM(CASE WHEN final_status = 'PRESENT' THEN 1 ELSE 0 END) as present FROM vw_attendance_monthly_matrix WHERE attendance_year = 2026 AND attendance_month = 6 GROUP BY division_code ORDER BY division_code");
    console.table(r.recordset);
  } catch(e:any) { console.log("View error:", e.message); }

  console.log("\n=== H0200 exists? ===");
  const r2 = await pool.request().query("SELECT employee_code, employee_name FROM employees WHERE employee_code = 'H0200'");
  console.log(r2.recordset);

  console.log("\n=== H-prefix max code ===");
  const r3 = await pool.request().query("SELECT MAX(employee_code) as max_code, COUNT(*) as cnt FROM employees WHERE employee_code LIKE 'H%'");
  console.log(r3.recordset);

  console.log("\n=== Sample MAPPED AB2 codes vs employees ===");
  const r4 = await pool.request().query("SELECT TOP 10 s.parsed_employee_code, e.employee_code as emp_exists FROM attendance_scan_logs s LEFT JOIN employees e ON e.employee_code = s.parsed_employee_code WHERE s.machine_code = 'AB2' AND s.mapping_status = 'MAPPED'");
  for (const r of r4.recordset) console.log("scan:", r.parsed_employee_code, "| employee exists:", r.emp_exists);

  console.log("\n=== attendance_imports status ===");
  const r5 = await pool.request().query("SELECT division_code, source, COUNT(*) as cnt FROM attendance_imports GROUP BY division_code, source ORDER BY division_code");
  console.table(r5.recordset);

  await pool.close();
}
check().catch(e=>console.error(e));
