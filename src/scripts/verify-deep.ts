/**
 * Deep verification for B0193 attendance
 * Run: node dist/scripts/verify-deep.js
 */

import mssql from 'mssql';

const config: mssql.config = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 1, min: 0 },
};

async function run(name: string, q: string) {
  console.log(`\n--- ${name} ---`);
  try {
    const pool = await mssql.connect(config);
    const r = await pool.request().query(q);
    if (!r.recordset.length) { console.log('0 rows'); await pool.close(); return; }
    console.table(r.recordset);
    console.log(`Total: ${r.recordset.length} rows`);
    await pool.close();
  } catch (e: unknown) {
    console.error('ERR:', e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  console.log('DEEP VERIFICATION: B0193 attendance_imports');

  // Q1: attendance_imports untuk B0193, tanpa filter source_reference
  await run('Q1 - attendance_imports B0193 ALL', `
    SELECT TOP 50
      id,
      employee_code,
      employee_id,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      source,
      source_reference,
      batch_id,
      division_code,
      needs_manual_review,
      created_at
    FROM attendance_imports
    WHERE employee_code = 'B0193'
      OR employee_code LIKE '%B0193%'
      OR raw_scan_log_id IN (SELECT id FROM attendance_scan_logs WHERE raw_device_user_id = '3000193')
    ORDER BY attendance_date DESC
  `);

  // Q2: attendance_imports yang punya raw_scan_log_id = 66667
  await run('Q2 - attendance_imports dengan raw_scan_log_id=66667', `
    SELECT TOP 20
      id,
      employee_code,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      source,
      source_reference,
      batch_id,
      raw_scan_log_id,
      created_at
    FROM attendance_imports
    WHERE raw_scan_log_id = 66667
       OR raw_scan_log_id IN (SELECT id FROM attendance_scan_logs WHERE id = 66667)
    ORDER BY created_at DESC
  `);

  // Q3: attendance_imports yang batch_id dari batch 62
  await run('Q3 - attendance_imports batch_id=62', `
    SELECT TOP 20
      id,
      employee_code,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      batch_id,
      raw_scan_log_id,
      created_at
    FROM attendance_imports
    WHERE batch_id = 62
       OR batch_id IN (SELECT TOP 5 id FROM import_batch WHERE id = 62)
    ORDER BY created_at DESC
  `);

  // Q4: import_batch table untuk batch 62
  await run('Q4 - import_batch id=62', `
    SELECT TOP 10 * FROM import_batch WHERE id = 62`);

  // Q5: attendance_imports terbaru (semua employee) untuk cek apakah tabel ini überhaupt terisi
  await run('Q5 - attendance_imports terbaru 20 record', `
    SELECT TOP 20
      id,
      employee_code,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      source,
      batch_id,
      created_at
    FROM attendance_imports
    ORDER BY created_at DESC
  `);

  // Q6: Cek attendance_imports untuk employee yang sama mesin dengan 3000193
  await run('Q6 - attendance_imports random sample untuk cek struktur', `
    SELECT TOP 10
      id,
      employee_code,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      source,
      source_reference,
      batch_id,
      raw_scan_log_id,
      needs_manual_review
    FROM attendance_imports
    ORDER BY NEWID()
  `);

  // Q7: Cek semua import_batch terbaru
  await run('Q7 - import_batch terbaru', `
    SELECT TOP 10
      id,
      batch_code,
      machine_id,
      source_type,
      imported_by,
      status,
      total_records,
      started_at,
      completed_at,
      created_at
    FROM import_batch
    ORDER BY created_at DESC
  `);

  // Q8: Cek attendance_import_batches (bukan import_batch)
  await run('Q8 - attendance_import_batches terbaru', `
    SELECT TOP 10
      id,
      batch_code,
      machine_code,
      status,
      records_total,
      records_success,
      started_at,
      finished_at
    FROM attendance_import_batches
    ORDER BY started_at DESC
  `);

  // Q9: Cek apakah attendance_imports überhaupt ada record
  await run('Q9 - Total count attendance_imports', `
    SELECT COUNT(*) AS total_imports,
           MIN(created_at) AS oldest,
           MAX(created_at) AS newest
    FROM attendance_imports`);

  // Q10: Cek attendance_imports berdasarkan parsed_employee_code = B0193, scan_date JUNI
  await run('Q10 - attendance_imports via JOIN scan_logs B0193', `
    SELECT TOP 30
      ai.id,
      ai.employee_code,
      ai.attendance_date,
      ai.check_in_at,
      ai.check_out_at,
      ai.attendance_status,
      ai.source,
      ai.batch_id,
      ai.raw_scan_log_id,
      ai.created_at
    FROM attendance_imports ai
    INNER JOIN attendance_scan_logs sl ON sl.id = ai.raw_scan_log_id
    WHERE sl.parsed_employee_code = 'B0193'
      AND sl.scan_date BETWEEN '2026-06-01' AND '2026-06-10'
    ORDER BY sl.scan_date ASC
  `);

  process.exit(0);
}

main().catch((e: unknown) => { console.error('Fatal:', e instanceof Error ? e.message : String(e)); process.exit(1); });
