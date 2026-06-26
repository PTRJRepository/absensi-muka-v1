/**
 * Verify attendance for B0193 (USWATUL HASANAH) on specific dates
 * Run: node dist/scripts/verify-attendance.js
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

async function runQuery(name: string, queryStr: string) {
  console.log(`\n--- ${name} ---`);
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().query(queryStr);
    if (result.recordset.length === 0) {
      console.log('0 rows');
    } else {
      console.table(result.recordset);
      console.log(`Total: ${result.recordset.length} rows`);
    }
    await pool.close();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`ERROR: ${msg}`);
  }
}

async function main() {
  console.log('VERIFIKASI: USWATUL HASANAH (B0193) - Apakah benar absen di tanggal 2 Juni 2026?');

  // Q1: Cek attendance_imports untuk B0193 di Juni 2026
  await runQuery('Q1 - attendance_imports B0193 Juni 2026', `
    SELECT TOP 30
      employee_code,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      source,
      source_reference,
      needs_manual_review,
      batch_id,
      created_at
    FROM attendance_imports
    WHERE employee_code = 'B0193'
      AND attendance_date BETWEEN '2026-06-01' AND '2026-06-10'
    ORDER BY attendance_date ASC
  `);

  // Q2: Cek semua scan B0193 di Juni 2026 (raw logs)
  await runQuery('Q2 - attendance_scan_logs B0193 Juni 2026', `
    SELECT TOP 50
      id,
      machine_code,
      scan_date,
      scan_time,
      raw_record_time,
      raw_device_user_id,
      parsed_employee_code,
      zkteco_user_name,
      mapping_status,
      mapping_reason,
      created_at,
      sync_batch_id
    FROM attendance_scan_logs
    WHERE parsed_employee_code = 'B0193'
      AND scan_date BETWEEN '2026-06-01' AND '2026-06-10'
    ORDER BY scan_time ASC
  `);

  // Q3: Cek raw_device_user_id=3000193 di attendance_imports
  await runQuery('Q3 - attendance_imports dari ID 3000193', `
    SELECT TOP 30
      employee_code,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      source,
      source_reference,
      batch_id,
      created_at
    FROM attendance_imports
    WHERE source_reference IN ('3000193', 'P1B')
      AND employee_code = 'B0193'
      AND attendance_date BETWEEN '2026-06-01' AND '2026-06-10'
    ORDER BY attendance_date ASC
  `);

  // Q4: Cek attendance_imports untuk B0193 di Juni 2025 (sebagai comparison)
  await runQuery('Q4 - attendance_imports B0193 Juni 2025 (comparison)', `
    SELECT TOP 30
      employee_code,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      source,
      source_reference,
      created_at
    FROM attendance_imports
    WHERE employee_code = 'B0193'
      AND attendance_date BETWEEN '2025-06-01' AND '2025-06-10'
    ORDER BY attendance_date ASC
  `);

  // Q5: Cek scan B0193 di Juni 2025 (comparison)
  await runQuery('Q5 - attendance_scan_logs B0193 Juni 2025 (comparison)', `
    SELECT TOP 30
      machine_code,
      scan_date,
      scan_time,
      raw_device_user_id,
      parsed_employee_code,
      mapping_reason,
      created_at
    FROM attendance_scan_logs
    WHERE parsed_employee_code = 'B0193'
      AND scan_date BETWEEN '2025-06-01' AND '2025-06-10'
    ORDER BY scan_time ASC
  `);

  // Q6: Cek apakah ada MANUAL_CORRECTION untuk B0193 di Juni 2026
  await runQuery('Q6 - Manual corrections B0193 Juni 2026', `
    SELECT TOP 20
      employee_code,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      is_leave,
      is_sick,
      reason,
      created_by,
      created_at
    FROM attendance_manual_corrections
    WHERE employee_code = 'B0193'
      AND attendance_date BETWEEN '2026-06-01' AND '2026-06-10'
      AND is_deleted = 0
    ORDER BY attendance_date ASC
  `);

  // Q7: Cek attendance_imports B0193 Mei 2026
  await runQuery('Q7 - attendance_imports B0193 Mei 2026', `
    SELECT TOP 30
      employee_code,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      source,
      source_reference,
      created_at
    FROM attendance_imports
    WHERE employee_code = 'B0193'
      AND attendance_date BETWEEN '2026-05-01' AND '2026-05-31'
    ORDER BY attendance_date ASC
  `);

  // Q8: Summary attendance_imports B0193 per bulan
  await runQuery('Q8 - Summary B0193 attendance per bulan', `
    SELECT TOP 30
      YEAR(attendance_date) AS tahun,
      MONTH(attendance_date) AS bulan,
      COUNT(*) AS total_hari,
      SUM(CASE WHEN attendance_status = 'HADIR' THEN 1 ELSE 0 END) AS hadir,
      SUM(CASE WHEN attendance_status = 'INCOMPLETE_SCAN' THEN 1 ELSE 0 END) AS incomplete,
      SUM(CASE WHEN attendance_status = 'TIDAK_HADIR' THEN 1 ELSE 0 END) AS tidak_hadir,
      MIN(check_in_at) AS earliest_checkin,
      MAX(check_out_at) AS latest_checkout
    FROM attendance_imports
    WHERE employee_code = 'B0193'
    GROUP BY YEAR(attendance_date), MONTH(attendance_date)
    ORDER BY tahun DESC, bulan DESC
  `);

  // Q9: Cek sync_batch_id 62 (batch dari record mencurigakan)
  await runQuery('Q9 - Batch sync_batch_id=62 detail', `
    SELECT TOP 30
      id,
      batch_code,
      machine_code,
      status,
      records_total,
      records_success,
      started_at,
      finished_at,
      source
    FROM attendance_import_batches
    WHERE id = 62
       OR batch_code LIKE '%62%'
    ORDER BY started_at DESC
  `);

  // Q10: Cek semua scan B0193 di attendance_imports, semua tanggal
  await runQuery('Q10 - Semua attendance_imports B0193 tahun 2026', `
    SELECT TOP 50
      employee_code,
      attendance_date,
      check_in_at,
      check_out_at,
      attendance_status,
      source,
      source_reference,
      batch_id,
      created_at
    FROM attendance_imports
    WHERE employee_code = 'B0193'
      AND YEAR(attendance_date) = 2026
    ORDER BY attendance_date DESC
  `);

  process.exit(0);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('Fatal error:', msg);
  process.exit(1);
});
