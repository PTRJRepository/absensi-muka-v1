import fs from 'fs';
// @ts-ignore - mssql package ships without local types in this repo
import mssql from 'mssql';

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

function dbConfig() {
  return {
    server: process.env.DB_SERVER ?? '10.0.0.110',
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USER ?? 'sa',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'rebinmas_absensi_monitoring',
    options: {
      encrypt: (process.env.DB_ENCRYPT ?? 'false') === 'true',
      trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') !== 'false',
    },
  };
}

const trustedManualMapPredicate = `
  (
    UPPER(COALESCE(zm.match_method, '')) IN ('EMPLOYEE_MAPPING_OVERRIDES', 'MANUAL_OVERRIDE', 'MANUAL')
    OR UPPER(COALESCE(zm.match_confidence, '')) = 'MANUAL'
  )
`;

const staleAutoMapPredicate = `
  (
    NULLIF(zm.hr_employee_code, '') IS NOT NULL
    AND UPPER(COALESCE(zm.match_method, '')) NOT IN ('EMPLOYEE_MAPPING_OVERRIDES', 'MANUAL_OVERRIDE', 'MANUAL')
    AND UPPER(COALESCE(zm.match_confidence, '')) NOT IN ('MANUAL', 'DIRECT')
  )
`;

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const pool = await mssql.connect(dbConfig());

  try {
    const before = await pool.request().query(`
      SELECT
        s.machine_code,
        s.raw_device_user_id,
        MAX(s.parsed_employee_code) AS stale_parsed_employee_code,
        COUNT(*) AS scan_count,
        MIN(s.scan_time) AS first_scan,
        MAX(s.scan_time) AS last_scan
      FROM attendance_scan_logs s
      LEFT JOIN zkteco_hr_employee_map zm
        ON zm.machine_code = s.machine_code
       AND zm.zkteco_user_id = s.raw_device_user_id
       AND zm.is_active = 1
       AND NULLIF(zm.hr_employee_code, '') IS NOT NULL
       AND ${trustedManualMapPredicate}
      LEFT JOIN employee_mapping_overrides emo
        ON emo.machine_code = s.machine_code
       AND emo.raw_device_id = s.raw_device_user_id
       AND NULLIF(emo.employee_code, '') IS NOT NULL
      LEFT JOIN employees e
        ON e.zkteco_user_id = s.raw_device_user_id
       AND COALESCE(e.is_active, 1) = 1
      WHERE s.raw_device_user_id LIKE '%[0-9]%'
        AND s.raw_device_user_id NOT LIKE '%[^0-9]%'
        AND LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))) > 5
        AND s.parsed_employee_code IS NOT NULL
        AND zm.hr_employee_code IS NULL
        AND emo.employee_code IS NULL
        AND e.employee_code IS NULL
      GROUP BY s.machine_code, s.raw_device_user_id
      ORDER BY scan_count DESC
    `);

    console.log(`Long raw IDs with stale parsed employee code: ${before.recordset.length}`);
    for (const row of before.recordset.slice(0, 20)) {
      console.log(`${row.machine_code} ${row.raw_device_user_id} -> ${row.stale_parsed_employee_code} (${row.scan_count} scans)`);
    }

    if (!apply) {
      console.log('Dry run only. Re-run with --apply to update attendance_scan_logs.');
      return;
    }

    let totalScanRows = 0;
    for (;;) {
      const update = await pool.request().query(`
        UPDATE TOP (5000) s
        SET
          parsed_employee_code = NULL,
          parsed_division_code = NULL,
          mapping_status = 'NEED_REVIEW',
          mapping_reason = 'LONG_RAW_ID_LOOKUP_REQUIRED'
        FROM attendance_scan_logs s
        LEFT JOIN zkteco_hr_employee_map zm
          ON zm.machine_code = s.machine_code
         AND zm.zkteco_user_id = s.raw_device_user_id
         AND zm.is_active = 1
         AND NULLIF(zm.hr_employee_code, '') IS NOT NULL
         AND ${trustedManualMapPredicate}
        LEFT JOIN employee_mapping_overrides emo
          ON emo.machine_code = s.machine_code
         AND emo.raw_device_id = s.raw_device_user_id
         AND NULLIF(emo.employee_code, '') IS NOT NULL
        LEFT JOIN employees e
          ON e.zkteco_user_id = s.raw_device_user_id
         AND COALESCE(e.is_active, 1) = 1
        WHERE s.raw_device_user_id LIKE '%[0-9]%'
          AND s.raw_device_user_id NOT LIKE '%[^0-9]%'
          AND LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))) > 5
          AND s.parsed_employee_code IS NOT NULL
          AND zm.hr_employee_code IS NULL
          AND emo.employee_code IS NULL
          AND e.employee_code IS NULL
      `);
      const rows = update.rowsAffected?.[0] ?? 0;
      totalScanRows += rows;
      if (rows === 0) break;
      console.log(`Updated attendance_scan_logs batch: ${rows}`);
    }

    console.log(`Updated attendance_scan_logs rows: ${totalScanRows}`);

    const reasonUpdate = await pool.request().query(`
      UPDATE attendance_scan_logs
      SET
        mapping_status = 'NEED_REVIEW',
        mapping_reason = 'LONG_RAW_ID_LOOKUP_REQUIRED',
        parsed_employee_code = NULL,
        parsed_division_code = NULL
      WHERE raw_device_user_id LIKE '%[0-9]%'
        AND raw_device_user_id NOT LIKE '%[^0-9]%'
        AND LEN(LTRIM(RTRIM(CAST(raw_device_user_id AS NVARCHAR(100))))) > 5
        AND (
          mapping_reason LIKE 'EXCLUDED_LONG_ABSENSI_ID_LENGTH_%'
          OR mapping_reason = 'LONG_NUMERIC_ID_REQUIRES_LOOKUP'
          OR (
            mapping_status = 'MAPPED'
            AND parsed_employee_code IS NULL
          )
        )
    `);
    console.log(`Normalized long-ID attendance_scan_logs rows: ${reasonUpdate.rowsAffected?.[0] ?? 0}`);

    const exactEmployeeUpdate = await pool.request().query(`
      UPDATE s
      SET
        parsed_employee_code = e.employee_code,
        parsed_division_code = LEFT(e.employee_code, 1),
        mapping_status = 'MAPPED',
        mapping_reason = 'Mapped via exact employees.zkteco_user_id'
      FROM attendance_scan_logs s
      INNER JOIN employees e
        ON e.zkteco_user_id = s.raw_device_user_id
       AND COALESCE(e.is_active, 1) = 1
      WHERE s.raw_device_user_id LIKE '%[0-9]%'
        AND s.raw_device_user_id NOT LIKE '%[^0-9]%'
        AND LEN(LTRIM(RTRIM(CAST(s.raw_device_user_id AS NVARCHAR(100))))) > 5
        AND (
          s.parsed_employee_code IS NULL
          OR s.parsed_employee_code <> e.employee_code
          OR s.mapping_status <> 'MAPPED'
          OR COALESCE(s.mapping_reason, '') NOT IN ('Mapped via exact employees.zkteco_user_id', 'manual_override')
        )
    `);
    console.log(`Mapped exact employees.zkteco_user_id attendance_scan_logs rows: ${exactEmployeeUpdate.rowsAffected?.[0] ?? 0}`);

    let totalMapRows = 0;
    for (;;) {
      const staleMapUpdate = await pool.request().query(`
        UPDATE TOP (500) zm
        SET
          hr_employee_code = NULL,
          hr_employee_name = COALESCE(NULLIF(zm.zkteco_user_name, ''), zm.hr_employee_name),
          match_confidence = 'UNMATCHED',
          match_method = 'LONG_RAW_ID_LOOKUP_REQUIRED',
          updated_at = SYSUTCDATETIME()
        FROM zkteco_hr_employee_map zm
        LEFT JOIN employee_mapping_overrides emo
          ON emo.machine_code = zm.machine_code
         AND emo.raw_device_id = zm.zkteco_user_id
         AND NULLIF(emo.employee_code, '') IS NOT NULL
        WHERE zm.zkteco_user_id LIKE '%[0-9]%'
          AND zm.zkteco_user_id NOT LIKE '%[^0-9]%'
          AND LEN(LTRIM(RTRIM(CAST(zm.zkteco_user_id AS NVARCHAR(100))))) > 5
          AND emo.employee_code IS NULL
          AND ${staleAutoMapPredicate}
      `);
      const rows = staleMapUpdate.rowsAffected?.[0] ?? 0;
      totalMapRows += rows;
      if (rows === 0) break;
      console.log(`Updated zkteco_hr_employee_map batch: ${rows}`);
    }

    console.log(`Updated stale zkteco_hr_employee_map rows: ${totalMapRows}`);
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
