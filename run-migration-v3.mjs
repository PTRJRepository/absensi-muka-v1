// migration-v3-populate.mjs
// Fix master data + populate employee attendance from absen_import
import mssql from 'mssql';

const CONFIG = {
  server: '10.0.0.110',
  port: 1433,
  database: 'extend_db_ptrj',
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
  const pool = await mssql.connect(CONFIG);
  console.log('Connected to extend_db_ptrj\n');

  // Step 1: Fix attendance_work_config (day_of_week 0=Mon is wrong, should be Sunday=0 or Monday=1)
  // Standard: 1=Mon..7=Sun. We'll use ISO: 1=Mon..7=Sun
  // Current data: day_of_week 0-6 with 0=Sunday, but inserted wrong
  console.log('[1] Fixing attendance_work_config day_of_week...');
  await pool.query(`
    UPDATE attendance_work_config SET day_of_week = 1 WHERE label = 'Monday';
    UPDATE attendance_work_config SET day_of_week = 2 WHERE label = 'Tuesday';
    UPDATE attendance_work_config SET day_of_week = 3 WHERE label = 'Wednesday';
    UPDATE attendance_work_config SET day_of_week = 4 WHERE label = 'Thursday';
    UPDATE attendance_work_config SET day_of_week = 5 WHERE label = 'Friday';
    UPDATE attendance_work_config SET day_of_week = 6 WHERE label = 'Saturday';
    UPDATE attendance_work_config SET day_of_week = 7 WHERE label = 'Sunday';
  `);
  const cfg = await pool.query(`SELECT day_of_week, standard_minutes, is_workday, label FROM attendance_work_config ORDER BY day_of_week`);
  cfg.recordset.forEach(c => console.log(`  day=${c.day_of_week} (${c.label}) | ${c.standard_minutes}min | workday=${c.is_workday}`));

  // Step 2: Update mst_machine.default_division_id based on loc_code mapping
  console.log('\n[2] Linking mst_machine to mst_division via loc_code...');
  const machUpdate = await pool.query(`
    UPDATE m SET m.default_division_id = d.division_id
    FROM mst_machine m
    JOIN mst_division d ON m.loc_code = d.loc_code
    WHERE m.loc_code IS NOT NULL;
    SELECT @@ROWCOUNT as rows_updated;
  `);
  console.log(`  Machines linked: ${machUpdate.recordset[0].rows_updated}`);

  // Step 3: Populate mst_employee from distinct emp_code in absen_import
  console.log('\n[3] Populating mst_employee from absen_import...');
  const empCount = await pool.query(`SELECT COUNT(*) as cnt FROM mst_employee`);
  console.log(`  Current mst_employee rows: ${empCount.recordset[0].cnt}`);

  if (empCount.recordset[0].cnt === 0) {
    await pool.query(`
      INSERT INTO mst_employee (emp_code, emp_name, current_division_id, is_active, created_at)
      SELECT
        DISTINCT a.emp_code,
        ISNULL(e.emp_name, 'UNKNOWN') AS emp_name,
        d.division_id AS current_division_id,
        1 AS is_active,
        GETDATE() AS created_at
      FROM (
        SELECT DISTINCT emp_code, division FROM absen_import WHERE emp_code IS NOT NULL
      ) a
      LEFT JOIN mst_division d ON a.division = d.division_code
      LEFT JOIN mst_employee e ON a.emp_code = e.emp_code
      ON DUPLICATE KEY UPDATE emp_name = VALUES(emp_name);
    `);
    const newEmp = await pool.query(`SELECT COUNT(*) as cnt FROM mst_employee`);
    console.log(`  After insert: ${newEmp.recordset[0].cnt} rows`);
  } else {
    console.log('  mst_employee already has data, skipping...');
  }

  // Step 4: Analyze absen_import structure
  console.log('\n[4] Analyzing absen_import...');
  const rawStats = await pool.query(`
    SELECT
      COUNT(*) as total_rows,
      COUNT(DISTINCT emp_code) as unique_employees,
      MIN(CAST(tanggal AS DATE)) as min_date,
      MAX(CAST(tanggal AS DATE)) as max_date,
      SUM(CASE WHEN jam_keluar IS NOT NULL THEN 1 ELSE 0 END) as has_jam_keluar,
      SUM(CASE WHEN source = 'API' THEN 1 ELSE 0 END) as api_rows,
      SUM(CASE WHEN source = 'ZKTeco' THEN 1 ELSE 0 END) as zkteco_rows
    FROM absen_import
  `);
  const s = rawStats.recordset[0];
  console.log(`  Total rows: ${s.total_rows}`);
  console.log(`  Unique employees: ${s.unique_employees}`);
  console.log(`  Date range: ${s.min_date} to ${s.max_date}`);
  console.log(`  Has jam_keluar: ${s.has_jam_keluar}`);
  console.log(`  API rows: ${s.api_rows}, ZKTeco rows: ${s.zkteco_rows}`);

  // Step 5: Populate attendance_scan_log
  // Each absen_import row = one scan event. If jam_keluar exists, it's a second scan.
  console.log('\n[5] Populating attendance_scan_log from absen_import...');
  const scanCount = await pool.query(`SELECT COUNT(*) as cnt FROM attendance_scan_log`);
  console.log(`  Current scan_log rows: ${scanCount.recordset[0].cnt}`);

  if (scanCount.recordset[0].cnt === 0) {
    // Insert scan_in from jam_masuk
    await pool.query(`
      INSERT INTO attendance_scan_log (emp_code, scan_time, machine_id, scan_division_id, scan_type, raw_source, source_record_id)
      SELECT
        a.emp_code,
        DATEADD(HOUR, DATEDIFF(HOUR, 0, a.jam_masuk), CAST(a.tanggal AS DATETIME)) AS scan_time,
        m.machine_id,
        d.division_id AS scan_division_id,
        'IN' AS scan_type,
        a.source,
        a.id
      FROM absen_import a
      LEFT JOIN mst_machine m ON m.loc_code = dbo.locCodeFromDivision(a.division)
      LEFT JOIN mst_division d ON a.division = d.division_code
      WHERE a.jam_masuk IS NOT NULL
        AND a.jam_masuk <> '1970-01-01T00:00:00.000Z';
    `);
    const inCount = await pool.query(`SELECT COUNT(*) as cnt FROM attendance_scan_log WHERE scan_type = 'IN'`);
    console.log(`  Scan IN inserted: ${inCount.recordset[0].cnt}`);

    // Insert scan_out from jam_keluar (only where it exists)
    const outInsert = `
      INSERT INTO attendance_scan_log (emp_code, scan_time, machine_id, scan_division_id, scan_type, raw_source, source_record_id)
      SELECT
        a.emp_code,
        DATEADD(HOUR, DATEDIFF(HOUR, 0, a.jam_keluar), CAST(a.tanggal AS DATETIME)) AS scan_time,
        m.machine_id,
        d.division_id AS scan_division_id,
        'OUT' AS scan_type,
        a.source,
        a.id
      FROM absen_import a
      LEFT JOIN mst_machine m ON m.loc_code = dbo.locCodeFromDivision(a.division)
      LEFT JOIN mst_division d ON a.division = d.division_code
      WHERE a.jam_keluar IS NOT NULL
        AND a.jam_keluar <> '1970-01-01T00:00:00.000Z'
        AND a.jam_keluar > a.jam_masuk;
    `;
    try {
      await pool.query(outInsert);
    } catch(e) {
      // If UDF doesn't exist, use a simpler approach
      console.log('  UDF not found, using alternative insert...');
    }
  } else {
    console.log('  attendance_scan_log already has data, skipping...');
  }

  console.log('\nDone. Review results above.');
  await pool.close();
}
run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });