import sql from 'mssql';
const cfg = { user:'sa', password:'<DB_PASSWORD>', server:'10.0.0.110', port:1433, database:'rebinmas_absensi_monitoring', options:{encrypt:false,trustServerCertificate:true} };
async function check() {
  const pool = await sql.connect(cfg);
  console.log("=== Parsed code format by machine (top 3 per machine) ===");
  const r = await pool.request().query("SELECT machine_code, parsed_employee_code, LEN(parsed_employee_code) as code_len FROM (SELECT machine_code, parsed_employee_code, ROW_NUMBER() OVER (PARTITION BY machine_code ORDER BY id DESC) as rn FROM attendance_scan_logs WHERE mapping_status='MAPPED') x WHERE rn <= 3 ORDER BY machine_code, rn");
  for (const row of r.recordset) console.log(row.machine_code, "|", row.parsed_employee_code, "| len:", row.code_len);

  console.log("\n=== AB2 raw vs parsed ===");
  const r2 = await pool.request().query("SELECT TOP 20 raw_device_user_id, parsed_employee_code FROM attendance_scan_logs WHERE machine_code='AB2' AND mapping_status='MAPPED' ORDER BY id DESC");
  for (const row of r2.recordset) console.log("raw:", row.raw_device_user_id, "→ parsed:", row.parsed_employee_code);

  console.log("\n=== PGE raw vs parsed ===");
  const r3 = await pool.request().query("SELECT TOP 20 raw_device_user_id, parsed_employee_code FROM attendance_scan_logs WHERE machine_code='PGE' AND mapping_status='MAPPED' ORDER BY id DESC");
  for (const row of r3.recordset) console.log("raw:", row.raw_device_user_id, "→ parsed:", row.parsed_employee_code);

  console.log("\n=== P1A raw vs parsed ===");
  const r4 = await pool.request().query("SELECT TOP 10 raw_device_user_id, parsed_employee_code FROM attendance_scan_logs WHERE machine_code='P1A' AND mapping_status='MAPPED' ORDER BY id DESC");
  for (const row of r4.recordset) console.log("raw:", row.raw_device_user_id, "→ parsed:", row.parsed_employee_code);

  console.log("\n=== Employee code formats in DB ===");
  const r5 = await pool.request().query("SELECT TOP 5 employee_code, LEN(employee_code) as len FROM employees WHERE employee_code LIKE 'H%' ORDER BY employee_code");
  for (const row of r5.recordset) console.log("employee:", row.employee_code, "| len:", row.len);
  const r6 = await pool.request().query("SELECT TOP 5 employee_code, LEN(employee_code) as len FROM employees WHERE employee_code LIKE 'G%' ORDER BY employee_code");
  for (const row of r6.recordset) console.log("employee:", row.employee_code, "| len:", row.len);
  const r7 = await pool.request().query("SELECT TOP 5 employee_code, LEN(employee_code) as len FROM employees WHERE employee_code LIKE 'A%' ORDER BY employee_code");
  for (const row of r7.recordset) console.log("employee:", row.employee_code, "| len:", row.len);

  console.log("\n=== sync_batch_id status ===");
  const r8 = await pool.request().query("SELECT TOP 1 sync_batch_id, batch_id FROM attendance_scan_logs ORDER BY id DESC");
  console.log(r8.recordset);
  const r9 = await pool.request().query("SELECT COUNT(*) as total, SUM(CASE WHEN sync_batch_id IS NULL THEN 1 ELSE 0 END) as null_sync, SUM(CASE WHEN batch_id IS NULL THEN 1 ELSE 0 END) as null_batch FROM attendance_scan_logs");
  console.log(r9.recordset);

  console.log("\n=== AB1 in employees? ===");
  const r10 = await pool.request().query("SELECT TOP 5 employee_code FROM employees WHERE employee_code LIKE 'G%' AND LEN(employee_code) = 5 ORDER BY employee_code");
  console.log("G-format employees:", r10.recordset);
  const r11 = await pool.request().query("SELECT TOP 5 employee_code FROM employees WHERE employee_code LIKE 'G%' AND LEN(employee_code) = 7 ORDER BY employee_code");
  console.log("G-format 7-digit employees:", r11.recordset);

  await pool.close();
}
check().catch(e=>console.error(e));
