import sql from 'mssql';
const cfg = { user:'sa', password:'<DB_PASSWORD>', server:'10.0.0.110', port:1433, database:'rebinmas_absensi_monitoring', options:{encrypt:false,trustServerCertificate:true} };
async function run() {
  const pool = await sql.connect(cfg);
  console.log("Connected");

  // Step 1: Fix codes with letter prefix followed by >4 digits
  const r1 = await pool.request().query("UPDATE attendance_scan_logs SET parsed_employee_code = LEFT(parsed_employee_code, 1) + RIGHT(parsed_employee_code, 4) WHERE parsed_employee_code IS NOT NULL AND parsed_employee_code LIKE '[A-Z]%' AND LEN(parsed_employee_code) > 5 AND mapping_status = 'MAPPED'");
  console.log("Step 1: Fixed letter-prefixed codes, rows affected:", r1.rowsAffected);

  // Step 2: Fix PGE codes (locCode=A, no scanner)
  const r2 = await pool.request().query("UPDATE s SET s.parsed_employee_code = 'A' + RIGHT(s.raw_device_user_id, 4), s.mapping_status = 'MAPPED', s.mapping_reason = 'Fixed: PGE locCode=A + last4' FROM attendance_scan_logs s WHERE s.machine_code = 'PGE' AND s.parsed_employee_code NOT LIKE '[A-Z]%' AND s.raw_device_user_id IS NOT NULL AND s.raw_device_user_id LIKE '[0-9]%'");
  console.log("Step 2: Fixed PGE codes, rows affected:", r2.rowsAffected);

  // Step 3: Fix ARE codes
  const r3 = await pool.request().query("UPDATE s SET s.parsed_employee_code = 'A' + RIGHT(s.raw_device_user_id, 4), s.mapping_status = 'MAPPED', s.mapping_reason = 'Fixed: ARE locCode=A + last4' FROM attendance_scan_logs s WHERE s.machine_code = 'ARE' AND s.parsed_employee_code NOT LIKE '[A-Z]%' AND s.raw_device_user_id IS NOT NULL AND s.raw_device_user_id LIKE '[0-9]%'");
  console.log("Step 3: Fixed ARE codes, rows affected:", r3.rowsAffected);

  // Step 4: Fix OFFICE_APE codes
  const r4 = await pool.request().query("UPDATE s SET s.parsed_employee_code = 'A' + RIGHT(s.raw_device_user_id, 4), s.mapping_status = 'MAPPED', s.mapping_reason = 'Fixed: OFFICE_APE last4 with A prefix' FROM attendance_scan_logs s WHERE s.machine_code = 'OFFICE_APE' AND s.parsed_employee_code IS NULL AND s.raw_device_user_id IS NOT NULL AND s.raw_device_user_id LIKE '[0-9]%'");
  console.log("Step 4: Fixed OFFICE_APE codes, rows affected:", r4.rowsAffected);

  // Step 5: Fix IJL direct match
  const r5 = await pool.request().query("UPDATE s SET s.parsed_employee_code = s.raw_device_user_id, s.mapping_status = 'MAPPED', s.mapping_reason = 'Fixed: IJL direct raw_user_id match' FROM attendance_scan_logs s WHERE s.machine_code = 'IJL' AND s.parsed_employee_code IS NULL AND s.raw_device_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM employees e WHERE e.employee_code = s.raw_device_user_id)");
  console.log("Step 5: Fixed IJL direct match, rows affected:", r5.rowsAffected);

  // Step 6: Fix IJL remaining with L + last4
  const r6 = await pool.request().query("UPDATE s SET s.parsed_employee_code = 'L' + RIGHT(s.raw_device_user_id, 4), s.mapping_status = 'MAPPED', s.mapping_reason = 'Fixed: IJL L prefix + last4' FROM attendance_scan_logs s WHERE s.machine_code = 'IJL' AND s.parsed_employee_code IS NULL AND s.raw_device_user_id IS NOT NULL AND s.raw_device_user_id LIKE '[0-9]%' AND LEN(s.raw_device_user_id) >= 4");
  console.log("Step 6: Fixed IJL remaining, rows affected:", r6.rowsAffected);

  // Step 7: Mark unmatched MAPPED codes as NEED_REVIEW
  const r7 = await pool.request().query("UPDATE attendance_scan_logs SET mapping_status = 'NEED_REVIEW' WHERE mapping_status = 'MAPPED' AND parsed_employee_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.employee_code = parsed_employee_code)");
  console.log("Step 7: Marked unmatched as NEED_REVIEW, rows affected:", r7.rowsAffected);

  // Verify
  console.log("\n=== Mapping status by machine ===");
  const v = await pool.request().query("SELECT machine_code, mapping_status, COUNT(*) as cnt FROM attendance_scan_logs GROUP BY machine_code, mapping_status ORDER BY machine_code, mapping_status");
  console.table(v.recordset);

  console.log("\n=== Sample fixed codes ===");
  const v2 = await pool.request().query("SELECT TOP 20 machine_code, raw_device_user_id, parsed_employee_code, mapping_status FROM attendance_scan_logs WHERE mapping_status = 'MAPPED' ORDER BY id DESC");
  console.table(v2.recordset);

  await pool.close();
  console.log("Done");
}
run().catch(e=>console.error(e));
