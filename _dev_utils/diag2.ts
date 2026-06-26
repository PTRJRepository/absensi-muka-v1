import sql from 'mssql';
const cfg = { user:'sa', password:'<DB_PASSWORD>', server:'10.0.0.110', port:1433, database:'rebinmas_absensi_monitoring', options:{encrypt:false,trustServerCertificate:true} };
async function check() {
  const pool = await sql.connect(cfg);
  console.log("=== scan_logs sample by machine ===");
  const r = await pool.request().query("SELECT machine_code, parsed_employee_code, LEN(parsed_employee_code) as code_len, COUNT(*) as cnt FROM attendance_scan_logs WHERE mapping_status='MAPPED' GROUP BY machine_code, parsed_employee_code, LEN(parsed_employee_code) ORDER BY machine_code, cnt DESC");
  for (const row of r.recordset.slice(0,50)) console.log(row.machine_code, "|", row.parsed_employee_code, "| len:", row.code_len, "| cnt:", row.cnt);
  await pool.close();
}
check().catch(e=>console.error(e));
