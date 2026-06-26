const sql = require('mssql');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

async function run() {
  const pool = await sql.connect({
    server: process.env.DB_SERVER,
    port: 1433,
    user: 'sa',
    password: process.env.DB_PASSWORD,
    database: 'rebinmas_absensi_monitoring',
    options: { encrypt: false, trustServerCertificate: true }
  });

  // Issue 1a: Out-of-range attendance_imports
  const oor_imports = await pool.request().query(`
    SELECT TOP 12 id, employee_code, division_code, attendance_date,
           attendance_status, source, check_in_at, check_out_at
    FROM attendance_imports
    WHERE attendance_date < '2020-01-01' OR attendance_date > '2030-01-01'
    ORDER BY attendance_date
  `);

  // Issue 1b: Out-of-range scan_logs
  const oor_logs = await pool.request().query(`
    SELECT TOP 12 id, machine_code, raw_device_user_id, parsed_employee_code,
           scan_date_wib, scan_time_wib, mapping_status, current_emp_code
    FROM attendance_scan_logs
    WHERE scan_date_wib < '2020-01-01' OR scan_date_wib > '2030-01-01'
    ORDER BY scan_date_wib
  `);

  // Issue 2a: raw_scan_log_id coverage
  const coverage = await pool.request().query(`
    SELECT
      SUM(CASE WHEN raw_scan_log_id IS NOT NULL THEN 1 ELSE 0 END) AS with_raw_id,
      SUM(CASE WHEN raw_scan_log_id IS NULL THEN 1 ELSE 0 END) AS without_raw_id,
      COUNT(*) AS total
    FROM attendance_imports
  `);

  // Issue 2b: Sample rows without raw_scan_log_id (non-MANUAL_REVIEW)
  const null_samples = await pool.request().query(`
    SELECT TOP 5 id, employee_code, division_code, attendance_date,
           attendance_status, source, raw_scan_log_id
    FROM attendance_imports
    WHERE raw_scan_log_id IS NULL
      AND (division_code != 'MANUAL_REVIEW' OR division_code IS NULL)
    ORDER BY id
  `);

  // Breakdown: null raw_scan_log_id by source & status
  const null_by_source = await pool.request().query(`
    SELECT source, attendance_status, COUNT(*) AS cnt
    FROM attendance_imports
    WHERE raw_scan_log_id IS NULL
    GROUP BY source, attendance_status
    ORDER BY cnt DESC
  `);

  // Date ranges
  const date_range = await pool.request().query(`
    SELECT MIN(attendance_date) AS min_date, MAX(attendance_date) AS max_date
    FROM attendance_imports
  `);
  const scan_range = await pool.request().query(`
    SELECT MIN(scan_date_wib) AS min_date, MAX(scan_date_wib) AS max_date
    FROM attendance_scan_logs
  `);

  await pool.close();

  const cov = coverage.recordset[0];
  const pct = ((cov.with_raw_id / cov.total) * 100).toFixed(1);

  console.log('OUT-OF-RANGE attendance_imports:');
  console.table(oor_imports.recordset);

  console.log('OUT-OF-RANGE attendance_scan_logs:');
  console.table(oor_logs.recordset);

  console.log('RAW_SCAN_LOG_ID COVERAGE:');
  console.log(`  Total rows:             ${cov.total}`);
  console.log(`  With raw_scan_log_id:   ${cov.with_raw_id} (${pct}%)`);
  console.log(`  Without raw_scan_log_id: ${cov.without_raw_id} (${(100-pct).toFixed(1)}%)`);

  console.log('\nSAMPLES without raw_scan_log_id (non-MANUAL_REVIEW):');
  console.table(null_samples.recordset);

  console.log('NULL raw_scan_log_id breakdown by source/status:');
  console.table(null_by_source.recordset);

  console.log('DATE RANGES:');
  console.log('  attendance_imports:', JSON.stringify(date_range.recordset[0]));
  console.log('  attendance_scan_logs:', JSON.stringify(scan_range.recordset[0]));
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
