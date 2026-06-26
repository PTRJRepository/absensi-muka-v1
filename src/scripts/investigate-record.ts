/**
 * Investigation Script: Machine Clock & Long Raw ID Verification
 * Run: node dist/scripts/investigate-record.js
 */

import mssql from 'mssql';

const config: mssql.config = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: { max: 1, min: 0 },
};

async function runQuery(name: string, queryStr: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`QUERY: ${name}`);
  console.log('='.repeat(70));
  try {
    const pool = await mssql.connect(config);
    const result = await pool.request().query(queryStr);
    if (result.recordset.length === 0) {
      console.log('⚠️  0 rows returned');
    } else {
      console.table(result.recordset);
      console.log(`Total: ${result.recordset.length} rows`);
    }
    await pool.close();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ ERROR: ${msg}`);
  }
}

async function main() {
  console.log('🔍 MACHINE CLOCK & LONG RAW ID INVESTIGATION');
  console.log(`Started: ${new Date().toISOString()}`);

  // Query 1: Apakah 3000193 enrolled di mesin P1B?
  await runQuery('1 - Enrollment di P1B untuk ID 3000193', `
    SELECT
      machine_code,
      machine_uid,
      machine_user_id,
      user_name,
      card_no,
      created_at
    FROM machine_user_raw
    WHERE machine_code = 'P1B'
      AND (
        machine_user_id = '3000193'
        OR machine_uid = '3000193'
        OR card_no = '3000193'
      )
  `);

  // Query 2: Employee B0193 di HR
  await runQuery('2 - Employee B0193 di DB_PTRJ', `
    SELECT TOP 5
      EmpCode AS employee_code,
      EmpName AS employee_name,
      LocCode AS location_code,
      Status,
      CONVERT(DATE, CreateDate) AS created_date
    FROM DB_PTRJ.dbo.HR_EMPLOYEE
    WHERE EmpCode = 'B0193'
  `);

  // Query 3: Semua scan dari 3000193
  await runQuery('3 - Semua scan dari ID 3000193', `
    SELECT TOP 20
      machine_code,
      scan_time,
      scan_date,
      raw_device_user_id,
      parsed_employee_code,
      zkteco_user_name,
      mapping_reason,
      created_at
    FROM attendance_scan_logs
    WHERE raw_device_user_id = '3000193'
    ORDER BY scan_time DESC
  `);

  // Query 4: Registry 041
  await runQuery('4 - Registry 041 untuk 3000193', `
    SELECT
      raw_device_user_id,
      raw_id_length,
      scanner_prefix,
      parsed_employee_code,
      hr_employee_code,
      hr_employee_name,
      hr_loc_code,
      machine_count,
      scan_count,
      mapping_status,
      mapping_reason
    FROM zkteco_absensi_user_registry
    WHERE raw_device_user_id = '3000193'
  `);

  // Query 5: Suffix collision
  await runQuery('5 - Suffix collision untuk 0193', `
    SELECT TOP 20
      raw_device_user_id,
      LEFT(raw_device_user_id, 3) AS prefix,
      RIGHT(raw_device_user_id, 4) AS suffix,
      parsed_employee_code,
      hr_employee_code,
      machine_count,
      mapping_reason
    FROM zkteco_absensi_user_registry
    WHERE RIGHT(raw_device_user_id, 4) = '0193'
      AND LEN(raw_device_user_id) > 5
    ORDER BY machine_count DESC
  `);

  // Query 6: Clock drift comparison
  await runQuery('6 - Clock comparison P1B vs mesin lain', `
    SELECT TOP 50
      machine_code,
      scan_date,
      MIN(scan_time) AS earliest_scan,
      MAX(scan_time) AS latest_scan,
      COUNT(*) AS total_scans,
      DATEPART(HOUR, MIN(scan_time)) AS earliest_hour,
      DATEPART(HOUR, MAX(scan_time)) AS latest_hour
    FROM attendance_scan_logs
    WHERE scan_date BETWEEN '2026-06-01' AND '2026-06-05'
    GROUP BY machine_code, scan_date
    ORDER BY scan_date, machine_code
  `);

  // Query 7: Nama dari mesin vs HR
  await runQuery('7 - Nama dari mesin vs HR untuk 3000193', `
    SELECT
      r.raw_device_user_id,
      r.hr_employee_code,
      r.hr_employee_name AS nama_dari_hr,
      m.user_name AS nama_dari_mesin,
      m.machine_code AS enrolled_di_mesin,
      CASE
        WHEN m.user_name IS NULL THEN 'TIDAK ADA DI MESIN'
        WHEN r.hr_employee_name <> m.user_name THEN 'NAMA TIDAK SAMA'
        ELSE 'SAMA'
      END AS status
    FROM zkteco_absensi_user_registry r
    LEFT JOIN zkteco_absensi_user_machine m ON m.registry_id = r.id
    WHERE r.raw_device_user_id = '3000193'
  `);

  console.log(`\n${'='.repeat(70)}`);
  console.log('INVESTIGATION COMPLETE');
  console.log(`Finished: ${new Date().toISOString()}`);
  process.exit(0);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('Fatal error:', msg);
  process.exit(1);
});
