/**
 * attendance_import_batches audit script
 * Investigates 206K gap between records_total and records_success + records_failed
 */
const sql = require('mssql');
require('dotenv').config();

async function run() {
  const pool = await sql.connect({
    server: process.env.DB_SERVER,
    port: 1433,
    user: 'sa',
    password: process.env.DB_PASSWORD,
    database: 'rebinmas_absensi_monitoring',
    options: { encrypt: false, trustServerCertificate: true }
  });

  console.log('=== Q1: Aggregate sums vs totals ===');
  const q1 = await pool.request().query(`
    SELECT
      COUNT(*) AS batch_count,
      SUM(records_total) AS sum_total,
      SUM(records_success) AS sum_success,
      SUM(records_failed) AS sum_failed,
      SUM(records_success) + SUM(records_failed) AS sum_success_plus_failed,
      SUM(records_total) - (SUM(records_success) + SUM(records_failed)) AS gap
    FROM attendance_import_batches
  `);
  console.log(JSON.stringify(q1.recordset[0], null, 2));

  console.log('\n=== Q2: FAILED batches ===');
  const q2 = await pool.request().query(`
    SELECT TOP(20)
      id, batch_code, division_code, status,
      records_total, records_success, records_failed,
      error_message, started_at, finished_at
    FROM attendance_import_batches
    WHERE status = 'FAILED'
    ORDER BY started_at DESC
  `);
  console.log(`Found ${q2.recordset.length} FAILED batches (showing top 20):`);
  q2.recordset.forEach(r => {
    console.log('  id=' + r.id + ' code=' + r.batch_code + ' div=' + r.division_code + ' total=' + r.records_total + ' success=' + r.records_success + ' failed=' + r.records_failed + ' error="' + r.error_message + '" started=' + r.started_at);
  });

  console.log('\n=== Q3: Suspicious batches (total=0 but not FAILED) ===');
  const q3 = await pool.request().query(`
    SELECT id, batch_code, division_code, status,
      records_total, records_success, records_failed, started_at
    FROM attendance_import_batches
    WHERE records_total = 0 AND status != 'FAILED'
  `);
  console.log(`Found ${q3.recordset.length} batches with records_total=0 but status != FAILED:`);
  q3.recordset.forEach(r => {
    console.log('  id=' + r.id + ' code=' + r.batch_code + ' div=' + r.division_code + ' status=' + r.status + ' success=' + r.records_success + ' failed=' + r.records_failed);
  });

  console.log('\n=== Q4: attendance_imports count ===');
  const q4 = await pool.request().query(`SELECT COUNT(*) AS cnt FROM attendance_imports`);
  console.log(`attendance_imports total count: ${q4.recordset[0].cnt}`);

  console.log('\n=== Q5: Compare attendance_imports vs batch success+failed ===');
  const q5 = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM attendance_imports) AS import_count,
      (SELECT SUM(records_success) + SUM(records_failed) FROM attendance_import_batches) AS batch_processed,
      (SELECT SUM(records_total) FROM attendance_import_batches) AS batch_total
  `);
  console.log(JSON.stringify(q5.recordset[0], null, 2));

  console.log('\n=== Q6: Breakdown by status ===');
  const q6 = await pool.request().query(`
    SELECT status, COUNT(*) AS cnt,
      SUM(records_total) AS sum_total,
      SUM(records_success) AS sum_success,
      SUM(records_failed) AS sum_failed
    FROM attendance_import_batches
    GROUP BY status
    ORDER BY cnt DESC
  `);
  q6.recordset.forEach(r => {
    console.log(`  status=${r.status} batches=${r.cnt} total=${r.sum_total} success=${r.sum_success} failed=${r.sum_failed}`);
  });

  console.log('\n=== Q7: Batches with gap > 0 (total > success+failed) ===');
  const q7 = await pool.request().query(`
    SELECT COUNT(*) AS cnt, SUM(records_total - (records_success + records_failed)) AS total_gap
    FROM attendance_import_batches
    WHERE records_total > (records_success + records_failed)
  `);
  console.log(JSON.stringify(q7.recordset[0], null, 2));

  console.log('\n=== Q8: Batches where success+failed > total ===');
  const q8 = await pool.request().query(`
    SELECT id, batch_code, division_code, status,
      records_total, records_success, records_failed,
      (records_success + records_failed) - records_total AS over_count
    FROM attendance_import_batches
    WHERE (records_success + records_failed) > records_total
  `);
  console.log(`Found ${q8.recordset.length} over-count batches:`);
  q8.recordset.forEach(r => {
    console.log('  id=' + r.id + ' code=' + r.batch_code + ' div=' + r.division_code + ' status=' + r.status + ' total=' + r.records_total + ' success=' + r.records_success + ' failed=' + r.records_failed + ' over=' + r.over_count);
  });

  console.log('\n=== Q9: Suspicious COMPLETED batches with large gaps ===');
  const q9 = await pool.request().query(`
    SELECT TOP(10)
      id, batch_code, division_code, status,
      records_total, records_success, records_failed,
      records_total - (records_success + records_failed) AS gap,
      started_at, finished_at
    FROM attendance_import_batches
    WHERE status = 'COMPLETED'
      AND records_total > (records_success + records_failed)
    ORDER BY (records_total - (records_success + records_failed)) DESC
  `);
  console.log(`Found ${q9.recordset.length} COMPLETED batches with gaps:`);
  q9.recordset.forEach(r => {
    console.log('  id=' + r.id + ' code=' + r.batch_code + ' div=' + r.division_code + ' total=' + r.records_total + ' success=' + r.records_success + ' failed=' + r.records_failed + ' gap=' + r.gap);
  });

  await pool.close();
  console.log('\nDone.');
}

run().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
