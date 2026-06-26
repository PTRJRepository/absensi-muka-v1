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

  // How many MANUAL_REVIEW records are there and do they have raw_scan_log_id?
  const manual_review = await pool.request().query(`
    SELECT
      SUM(CASE WHEN raw_scan_log_id IS NOT NULL THEN 1 ELSE 0 END) AS mr_with,
      SUM(CASE WHEN raw_scan_log_id IS NULL THEN 1 ELSE 0 END) AS mr_without,
      COUNT(*) AS total
    FROM attendance_imports
    WHERE division_code = 'MANUAL_REVIEW'
  `);

  // How many of the 10,020 with raw_scan_log_id are MANUAL_REVIEW vs real divisions?
  const with_id_breakdown = await pool.request().query(`
    SELECT division_code, attendance_status, COUNT(*) AS cnt
    FROM attendance_imports
    WHERE raw_scan_log_id IS NOT NULL
    GROUP BY division_code, attendance_status
    ORDER BY cnt DESC
  `);

  // Count of out-of-range rows total in attendance_imports
  const oor_count = await pool.request().query(`
    SELECT COUNT(*) AS cnt FROM attendance_imports
    WHERE attendance_date < '2020-01-01' OR attendance_date > '2030-01-01'
  `);

  // Count of out-of-range rows in scan_logs
  const oor_logs_count = await pool.request().query(`
    SELECT COUNT(*) AS cnt FROM attendance_scan_logs
    WHERE scan_date_wib < '2020-01-01' OR scan_date_wib > '2030-01-01'
  `);

  // How many ZKTECO-HADIR records WITHOUT raw_scan_log_id
  const zircon_hadir = await pool.request().query(`
    SELECT COUNT(*) AS cnt FROM attendance_imports
    WHERE source = 'ZKTECO' AND attendance_status = 'HADIR' AND raw_scan_log_id IS NULL
  `);

  // Check: do records WITHOUT raw_scan_log_id have check_in_at times?
  const null_inat = await pool.request().query(`
    SELECT TOP 5 id, employee_code, attendance_date, check_in_at, check_out_at,
           DATEDIFF(HOUR, check_in_at, check_out_at) AS hours_diff
    FROM attendance_imports
    WHERE raw_scan_log_id IS NULL AND check_out_at IS NOT NULL
    ORDER BY id
  `);

  await pool.close();

  console.log('=== MANUAL_REVIEW records ===');
  const mr = manual_review.recordset[0];
  console.log(`  Total: ${mr.total}, with raw_scan_log_id: ${mr.mr_with}, without: ${mr.mr_without}`);

  console.log('\n=== BREAKDOWN of rows WITH raw_scan_log_id ===');
  console.table(with_id_breakdown.recordset);

  console.log('\n=== OUT-OF-RANGE counts ===');
  console.log(`  attendance_imports: ${oor_count.recordset[0].cnt}`);
  console.log(`  attendance_scan_logs: ${oor_logs_count.recordset[0].cnt}`);

  console.log('\n=== ZKTECO+HADIR without raw_scan_log_id ===');
  console.log(`  ${zircon_hadir.recordset[0].cnt} rows`);

  console.log('\n=== Sample ZKTECO-HADIR rows without raw_scan_log_id (have check_out) ===');
  console.table(null_inat.recordset);
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
