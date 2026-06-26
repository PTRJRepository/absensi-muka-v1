import sql from 'mssql';
const cfg = { user:'sa', password:'<DB_PASSWORD>', server:'10.0.0.110', port:1433, database:'rebinmas_absensi_monitoring', options:{encrypt:false,trustServerCertificate:true} };

const machineLocMap: Record<string,string> = {
  AB1:'G', AB2:'H', ARA:'F', ARC_01:'J', ARC_02:'J', ARE:'A',
  DME_01:'E', DME_02:'E', IJL:'L', P1A:'A', P1B:'B', P2A:'C', P2B:'D', PGE:'A', OFFICE_APE:'A'
};

async function run() {
  const pool = await sql.connect(cfg);

  // Fix numeric parsed_employee_code for machines with locCode
  for (const [machine, loc] of Object.entries(machineLocMap)) {
    if (machine === 'MILL') continue; // MILL has no data
    const r = await pool.request()
      .input('machine', machine)
      .input('loc', loc)
      .query(UPDATE attendance_scan_logs 
              SET parsed_employee_code = @loc + RIGHT(parsed_employee_code, 4),
                  mapping_status = 'MAPPED',
                  mapping_reason = 'Fixed: numeric code with ' + @loc + ' prefix'
              WHERE machine_code = @machine
                AND mapping_status = 'MAPPED'
                AND parsed_employee_code NOT LIKE '[A-Z]%'
                AND ISNUMERIC(parsed_employee_code) = 1
                AND LEN(parsed_employee_code) >= 5);
    if (r.rowsAffected[0] > 0) console.log(${machine}: fixed  numeric codes);
  }

  // Mark remaining unmatched MAPPED as NEED_REVIEW
  const r7 = await pool.request().query("UPDATE attendance_scan_logs SET mapping_status = 'NEED_REVIEW' WHERE mapping_status = 'MAPPED' AND parsed_employee_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.employee_code = parsed_employee_code)");
  console.log("Marked unmatched as NEED_REVIEW:", r7.rowsAffected[0]);

  // Verify AB2
  console.log("\n=== AB2 scan matching AB2 employees ===");
  const v1 = await pool.request().query("SELECT COUNT(*) as cnt FROM attendance_scan_logs s WHERE s.machine_code = 'AB2' AND s.mapping_status = 'MAPPED' AND EXISTS (SELECT 1 FROM employees e JOIN divisions d ON d.id = e.division_id WHERE e.employee_code = s.parsed_employee_code AND d.division_code = 'AB2')");
  console.log("AB2 scans → AB2 employees:", v1.recordset[0].cnt);

  // Matrix check
  console.log("\n=== Matrix view ALL divisions ===");
  try {
    const v2 = await pool.request().query("SELECT division_code, COUNT(*) as total, SUM(CASE WHEN final_status = 'PRESENT' THEN 1 ELSE 0 END) as present FROM vw_attendance_monthly_matrix WHERE attendance_year = 2026 AND attendance_month = 6 GROUP BY division_code ORDER BY division_code");
    console.table(v2.recordset);
  } catch(e:any) { console.log("View error:", e.message); }

  // Mapping status summary
  console.log("\n=== Mapping status by machine ===");
  const v3 = await pool.request().query("SELECT machine_code, mapping_status, COUNT(*) as cnt FROM attendance_scan_logs GROUP BY machine_code, mapping_status ORDER BY machine_code");
  console.table(v3.recordset);

  await pool.close();
}
run().catch(e=>console.error(e));
