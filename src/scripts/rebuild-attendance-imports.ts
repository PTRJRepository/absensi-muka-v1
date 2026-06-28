/**
 * Bulk rebuild attendance_imports from ALL scan_logs
 * Run: node dist/scripts/rebuild-attendance-imports.js
 *
 * Processes all MAPPED/AUTO_MAPPED scan_logs regardless of batch_id.
 * division_code from employees.division_id → divisions (not parsed_division_code).
 */

import mssql from 'mssql';
import * as dotenv from 'dotenv';

dotenv.config();

const config: mssql.config = {
  server: process.env.DB_SERVER || '10.0.0.110',
  port: parseInt(process.env.DB_PORT || '1433', 10),
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 2, min: 0 },
  requestTimeout: 300000,
};

async function main() {
  const pool = await mssql.connect(config);
  console.log('Connected to DB');

  const divisions = ['P1A','P1B','P2A','P2B','DME','ARA','AB1','AB2','ARC','IJL','PGE'];
  let totalInserted = 0;

  for (const divCode of divisions) {
    const empQ = await pool.request()
      .input('divCode', mssql.VarChar, divCode)
      .query(`SELECT id, employee_code FROM employees WHERE division_id = (SELECT id FROM divisions WHERE division_code = @divCode)`);
    const empIds = empQ.recordset.map(e => e.id);
    const empCodes = empQ.recordset.map(e => e.employee_code);

    if (empIds.length === 0) { console.log(`${divCode}: no employees`); continue; }

    const BATCH = 300;
    let divTotal = 0;
    let iter = 0;

    for (let i = 0; i < empCodes.length; i += BATCH) {
      const codes = empCodes.slice(i, i + BATCH);
      const ids = empIds.slice(i, i + BATCH);
      const cPh = codes.map((_, idx) => `@c${idx}`).join(',');
      const idPh = ids.map((_, idx) => `@id${idx}`).join(',');
      let chunkTotal = 0;
      let round = 0;

      while (true) {
        const req = pool.request();
        codes.forEach((c, idx) => req.input(`c${idx}`, mssql.VarChar, c));
        ids.forEach((id, idx) => req.input(`id${idx}`, mssql.Int, id));

        const result = await req.query(`
          INSERT INTO attendance_imports (
            employee_id, employee_code, division_code,
            attendance_date, attendance_year, attendance_month,
            check_in_at, check_out_at,
            attendance_status, has_work,
            source, source_reference, batch_id, needs_manual_review,
            employee_name, hr_status, hr_loc_code, nik,
            current_emp_name, current_hr_loc_code, current_hr_status
          )
          OUTPUT INSERTED.id
          SELECT
            e.id, e.employee_code, d.division_code,
            g.scan_date, YEAR(g.scan_date), MONTH(g.scan_date),
            g.check_in,
            CASE WHEN g.scan_count >= 2 THEN g.check_out ELSE NULL END,
            CASE WHEN g.scan_count >= 2 THEN 'HADIR' ELSE 'INCOMPLETE_SCAN' END,
            1, 'ZKTECO', g.machine_code,
            CASE WHEN g.max_batch_id IS NOT NULL THEN g.max_batch_id ELSE NULL END,
            0,
            -- Layer 1 enrichment from employees
            e.employee_name, e.hr_status, e.hr_loc_code, e.nik,
            -- Layer 2 enrichment from hr_employee_current_snapshot
            COALESCE(h.current_emp_name, e.employee_name) AS current_emp_name,
            h.current_loc_code AS current_hr_loc_code,
            h.current_status AS current_hr_status
          FROM (
            SELECT s.parsed_employee_code, s.scan_date, s.machine_code,
              MIN(s.scan_time) AS check_in, MAX(s.scan_time) AS check_out,
              COUNT(*) AS scan_count, MAX(s.sync_batch_id) AS max_batch_id
            FROM attendance_scan_logs s
            WHERE s.mapping_status IN ('MAPPED','AUTO_MAPPED')
              AND s.parsed_employee_code IN (${cPh})
              AND s.parsed_employee_code IS NOT NULL AND s.parsed_employee_code != ''
            GROUP BY s.parsed_employee_code, s.scan_date, s.machine_code
          ) g
          INNER JOIN employees e ON e.employee_code = g.parsed_employee_code AND e.id IN (${idPh})
          INNER JOIN divisions d ON d.id = e.division_id
          LEFT JOIN hr_employee_current_snapshot h ON h.nik = e.nik
          WHERE NOT EXISTS (
            SELECT 1 FROM attendance_imports ai
            WHERE ai.employee_code = g.parsed_employee_code
              AND ai.attendance_date = g.scan_date
              AND ai.source_reference = g.machine_code
          )
        `);

        const n = result.rowsAffected[0];
        chunkTotal += n;
        round++;
        if (n === 0) break;
      }

      iter++;
      divTotal += chunkTotal;
      if (chunkTotal > 0) process.stdout.write(`${divCode}[${i}-${Math.min(i+BATCH,empCodes.length)}]x${round}:+${chunkTotal} `);
    }

    console.log(`\n${divCode}: ${divTotal} rows (${empCodes.length} employees)`);
    totalInserted += divTotal;
  }

  // NEED_REVIEW
  console.log('\nProcessing NEED_REVIEW...');
  let manualTotal = 0;
  while (true) {
    const r = await pool.request().query(`
      INSERT INTO attendance_imports (
        employee_id, employee_code, division_code,
        attendance_date, attendance_year, attendance_month,
        check_in_at, check_out_at,
        attendance_status, has_work,
        source, source_reference, batch_id, needs_manual_review, raw_scan_log_id
      )
      OUTPUT INSERTED.id
      SELECT
        NULL, 'MANUAL_' + g.raw_device_user_id, 'MANUAL_REVIEW',
        g.scan_date, YEAR(g.scan_date), MONTH(g.scan_date),
        g.check_in,
        CASE WHEN g.scan_count >= 2 THEN g.check_out ELSE NULL END,
        CASE WHEN g.scan_count >= 2 THEN 'HADIR' ELSE 'INCOMPLETE_SCAN' END,
        1, 'ZKTECO', g.machine_code,
        CASE WHEN g.max_batch_id IS NOT NULL THEN g.max_batch_id ELSE NULL END,
        1, g.min_id
      FROM (
        SELECT s.raw_device_user_id, s.scan_date, s.machine_code,
          MIN(s.scan_time) AS check_in, MAX(s.scan_time) AS check_out,
          COUNT(*) AS scan_count, MAX(s.sync_batch_id) AS max_batch_id, MIN(s.id) AS min_id
        FROM attendance_scan_logs s
        WHERE s.mapping_status = 'NEED_REVIEW'
          -- short id (<=5 digit) stays raw-only (mode mesin), excluded from imports
          AND LEN(LTRIM(RTRIM(s.raw_device_user_id))) > 5
        GROUP BY s.raw_device_user_id, s.scan_date, s.machine_code
      ) g
      WHERE NOT EXISTS (
        SELECT 1 FROM attendance_imports ai
        WHERE ai.employee_code = 'MANUAL_' + g.raw_device_user_id
          AND ai.attendance_date = g.scan_date AND ai.source_reference = g.machine_code
      )
    `);
    const n = r.rowsAffected[0];
    manualTotal += n;
    if (n === 0) break;
    process.stdout.write(`MANUAL+${n} `);
  }
  console.log(`\nMANUAL_REVIEW total: ${manualTotal}`);

  // Summary
  const total = await pool.request().query`SELECT COUNT(*) as cnt FROM attendance_imports`;
  const byStatus = await pool.request().query`SELECT attendance_status, COUNT(*) as cnt FROM attendance_imports GROUP BY attendance_status ORDER BY cnt DESC`;
  const byDiv = await pool.request().query`SELECT division_code, COUNT(*) as cnt FROM attendance_imports GROUP BY division_code ORDER BY cnt DESC`;
  const range = await pool.request().query`SELECT MIN(attendance_date) as min_d, MAX(attendance_date) as max_d, COUNT(DISTINCT attendance_date) as udates FROM attendance_imports`;

  console.log(`\n=== FINAL STATE ===`);
  console.log(`Total: ${total.recordset[0].cnt}`);
  console.log(`Range: ${range.recordset[0].min_d} → ${range.recordset[0].max_d} (${range.recordset[0].udates} dates)`);
  byStatus.recordset.forEach(r => console.log(`  ${r.attendance_status}: ${r.cnt}`));
  byDiv.recordset.forEach(r => console.log(`  ${r.division_code}: ${r.cnt}`));

  await pool.close();
  console.log('\nDONE');
}

main().catch((err: unknown) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
