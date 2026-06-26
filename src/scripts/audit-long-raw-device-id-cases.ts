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

async function main() {
  loadEnv();
  const pool = await mssql.connect(dbConfig());
  try {
    const result = await pool.request().query(`
      WITH cases AS (
        SELECT *
        FROM (VALUES
          ('P1A', '1000012'),
          ('P1A', '4000012'),
          ('AB2', '4000012'),
          ('P1A', '500130'),
          ('DME_01', '7000130'),
          ('DME_02', '7000130')
        ) v(machine_code, raw_device_user_id)
      ),
      rows AS (
        SELECT
          c.machine_code,
          c.raw_device_user_id,
          COUNT(s.id) AS scan_count,
          MAX(s.parsed_employee_code) AS parsed_employee_code,
          MAX(s.mapping_status) AS mapping_status,
          MAX(s.mapping_reason) AS mapping_reason,
          MAX(NULLIF(zm.zkteco_user_name, '')) AS map_user_name,
          MAX(zm.hr_employee_code) AS map_employee_code,
          MAX(NULLIF(zm.hr_employee_name, '')) AS map_employee_name,
          MAX(zm.match_method) AS map_method,
          MAX(zm.match_confidence) AS map_confidence,
          MAX(e.employee_code) AS direct_employee_code,
          MAX(NULLIF(e.employee_name, '')) AS direct_employee_name,
          CASE
            WHEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
              LTRIM(RTRIM(CASE
                WHEN CHARINDEX('(', COALESCE(MAX(NULLIF(zm.zkteco_user_name, '')), '')) > 0
                  THEN LEFT(COALESCE(MAX(NULLIF(zm.zkteco_user_name, '')), ''), CHARINDEX('(', COALESCE(MAX(NULLIF(zm.zkteco_user_name, '')), '')) - 1)
                ELSE COALESCE(MAX(NULLIF(zm.zkteco_user_name, '')), '')
              END)),
              ' ', ''), '.', ''), ',', ''), '-', ''), '''', ''), '"', '')) <> ''
             AND UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
              LTRIM(RTRIM(CASE
                WHEN CHARINDEX('(', COALESCE(MAX(NULLIF(e.employee_name, '')), MAX(NULLIF(zm.hr_employee_name, '')), '')) > 0
                  THEN LEFT(COALESCE(MAX(NULLIF(e.employee_name, '')), MAX(NULLIF(zm.hr_employee_name, '')), ''), CHARINDEX('(', COALESCE(MAX(NULLIF(e.employee_name, '')), MAX(NULLIF(zm.hr_employee_name, '')), '')) - 1)
                ELSE COALESCE(MAX(NULLIF(e.employee_name, '')), MAX(NULLIF(zm.hr_employee_name, '')), '')
              END)),
              ' ', ''), '.', ''), ',', ''), '-', ''), '''', ''), '"', '')) <> ''
             AND (
              UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                LTRIM(RTRIM(CASE
                  WHEN CHARINDEX('(', COALESCE(MAX(NULLIF(zm.zkteco_user_name, '')), '')) > 0
                    THEN LEFT(COALESCE(MAX(NULLIF(zm.zkteco_user_name, '')), ''), CHARINDEX('(', COALESCE(MAX(NULLIF(zm.zkteco_user_name, '')), '')) - 1)
                  ELSE COALESCE(MAX(NULLIF(zm.zkteco_user_name, '')), '')
                END)),
                ' ', ''), '.', ''), ',', ''), '-', ''), '''', ''), '"', ''))
              =
              UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                LTRIM(RTRIM(CASE
                  WHEN CHARINDEX('(', COALESCE(MAX(NULLIF(e.employee_name, '')), MAX(NULLIF(zm.hr_employee_name, '')), '')) > 0
                    THEN LEFT(COALESCE(MAX(NULLIF(e.employee_name, '')), MAX(NULLIF(zm.hr_employee_name, '')), ''), CHARINDEX('(', COALESCE(MAX(NULLIF(e.employee_name, '')), MAX(NULLIF(zm.hr_employee_name, '')), '')) - 1)
                  ELSE COALESCE(MAX(NULLIF(e.employee_name, '')), MAX(NULLIF(zm.hr_employee_name, '')), '')
                END)),
                ' ', ''), '.', ''), ',', ''), '-', ''), '''', ''), '"', ''))
             )
              THEN 1
            ELSE 0
          END AS direct_name_match,
          CASE LEFT(c.raw_device_user_id, 3)
            WHEN '100' THEN 'A'
            WHEN '200' THEN 'J'
            WHEN '300' THEN 'B'
            WHEN '400' THEN 'H'
            WHEN '500' THEN 'C'
            WHEN '600' THEN 'D'
            WHEN '700' THEN 'E'
            WHEN '800' THEN 'F'
            WHEN '900' THEN 'G'
            ELSE NULL
          END AS raw_prefix_loc,
          COALESCE(
            MAX(UPPER(NULLIF(am.loc_code, ''))),
            CASE UPPER(c.machine_code)
              WHEN 'P1A' THEN 'A'
              WHEN 'OFFICE_PGE' THEN 'A'
              WHEN 'PGE' THEN 'A'
              WHEN 'P1B' THEN 'B'
              WHEN 'P2A' THEN 'C'
              WHEN 'P2A_01' THEN 'C'
              WHEN 'P2A_02' THEN 'C'
              WHEN 'P2B' THEN 'D'
              WHEN 'DME' THEN 'E'
              WHEN 'DME_01' THEN 'E'
              WHEN 'DME_02' THEN 'E'
              WHEN 'ARA' THEN 'F'
              WHEN 'OFFICE_APE' THEN 'F'
              WHEN 'AB1' THEN 'G'
              WHEN 'AB2' THEN 'H'
              WHEN 'MILL' THEN 'H'
              WHEN 'IJL' THEN 'L'
              WHEN 'ARC' THEN 'J'
              WHEN 'ARC_01' THEN 'J'
              WHEN 'ARC_02' THEN 'J'
              ELSE NULL
            END
          ) AS machine_loc,
          CASE
            WHEN LEN(c.raw_device_user_id) > 5
              AND c.raw_device_user_id NOT LIKE '%[^0-9]%'
              AND CASE LEFT(c.raw_device_user_id, 3)
                WHEN '100' THEN 'A'
                WHEN '200' THEN 'J'
                WHEN '300' THEN 'B'
                WHEN '400' THEN 'H'
                WHEN '500' THEN 'C'
                WHEN '600' THEN 'D'
                WHEN '700' THEN 'E'
                WHEN '800' THEN 'F'
                WHEN '900' THEN 'G'
                ELSE NULL
              END IS NOT NULL
              AND COALESCE(MAX(UPPER(NULLIF(am.loc_code, ''))), CASE UPPER(c.machine_code)
                WHEN 'P1A' THEN 'A'
                WHEN 'OFFICE_PGE' THEN 'A'
                WHEN 'PGE' THEN 'A'
                WHEN 'P1B' THEN 'B'
                WHEN 'P2A' THEN 'C'
                WHEN 'P2A_01' THEN 'C'
                WHEN 'P2A_02' THEN 'C'
                WHEN 'P2B' THEN 'D'
                WHEN 'DME' THEN 'E'
                WHEN 'DME_01' THEN 'E'
                WHEN 'DME_02' THEN 'E'
                WHEN 'ARA' THEN 'F'
                WHEN 'OFFICE_APE' THEN 'F'
                WHEN 'AB1' THEN 'G'
                WHEN 'AB2' THEN 'H'
                WHEN 'MILL' THEN 'H'
                WHEN 'IJL' THEN 'L'
                WHEN 'ARC' THEN 'J'
                WHEN 'ARC_01' THEN 'J'
                WHEN 'ARC_02' THEN 'J'
                ELSE NULL
              END) IS NOT NULL
              AND CASE LEFT(c.raw_device_user_id, 3)
                WHEN '100' THEN 'A'
                WHEN '200' THEN 'J'
                WHEN '300' THEN 'B'
                WHEN '400' THEN 'H'
                WHEN '500' THEN 'C'
                WHEN '600' THEN 'D'
                WHEN '700' THEN 'E'
                WHEN '800' THEN 'F'
                WHEN '900' THEN 'G'
                ELSE NULL
              END <> COALESCE(MAX(UPPER(NULLIF(am.loc_code, ''))), CASE UPPER(c.machine_code)
                WHEN 'P1A' THEN 'A'
                WHEN 'OFFICE_PGE' THEN 'A'
                WHEN 'PGE' THEN 'A'
                WHEN 'P1B' THEN 'B'
                WHEN 'P2A' THEN 'C'
                WHEN 'P2A_01' THEN 'C'
                WHEN 'P2A_02' THEN 'C'
                WHEN 'P2B' THEN 'D'
                WHEN 'DME' THEN 'E'
                WHEN 'DME_01' THEN 'E'
                WHEN 'DME_02' THEN 'E'
                WHEN 'ARA' THEN 'F'
                WHEN 'OFFICE_APE' THEN 'F'
                WHEN 'AB1' THEN 'G'
                WHEN 'AB2' THEN 'H'
                WHEN 'MILL' THEN 'H'
                WHEN 'IJL' THEN 'L'
                WHEN 'ARC' THEN 'J'
                WHEN 'ARC_01' THEN 'J'
                WHEN 'ARC_02' THEN 'J'
                ELSE NULL
              END)
              THEN 1
            ELSE 0
          END AS loc_conflict,
          CASE
            WHEN LEN(c.raw_device_user_id) > 5
              AND c.raw_device_user_id NOT LIKE '%[^0-9]%'
              AND MAX(e.employee_code) IS NOT NULL
              AND NOT (
                CASE LEFT(c.raw_device_user_id, 3)
                  WHEN '100' THEN 'A'
                  WHEN '200' THEN 'J'
                  WHEN '300' THEN 'B'
                  WHEN '400' THEN 'H'
                  WHEN '500' THEN 'C'
                  WHEN '600' THEN 'D'
                  WHEN '700' THEN 'E'
                  WHEN '800' THEN 'F'
                  WHEN '900' THEN 'G'
                  ELSE NULL
                END IS NOT NULL
                AND COALESCE(MAX(UPPER(NULLIF(am.loc_code, ''))), CASE UPPER(c.machine_code)
                  WHEN 'P1A' THEN 'A'
                  WHEN 'OFFICE_PGE' THEN 'A'
                  WHEN 'PGE' THEN 'A'
                  WHEN 'P1B' THEN 'B'
                  WHEN 'P2A' THEN 'C'
                  WHEN 'P2A_01' THEN 'C'
                  WHEN 'P2A_02' THEN 'C'
                  WHEN 'P2B' THEN 'D'
                  WHEN 'DME' THEN 'E'
                  WHEN 'DME_01' THEN 'E'
                  WHEN 'DME_02' THEN 'E'
                  WHEN 'ARA' THEN 'F'
                  WHEN 'OFFICE_APE' THEN 'F'
                  WHEN 'AB1' THEN 'G'
                  WHEN 'AB2' THEN 'H'
                  WHEN 'MILL' THEN 'H'
                  WHEN 'IJL' THEN 'L'
                  WHEN 'ARC' THEN 'J'
                  WHEN 'ARC_01' THEN 'J'
                  WHEN 'ARC_02' THEN 'J'
                  ELSE NULL
                END) IS NOT NULL
                AND CASE LEFT(c.raw_device_user_id, 3)
                  WHEN '100' THEN 'A'
                  WHEN '200' THEN 'J'
                  WHEN '300' THEN 'B'
                  WHEN '400' THEN 'H'
                  WHEN '500' THEN 'C'
                  WHEN '600' THEN 'D'
                  WHEN '700' THEN 'E'
                  WHEN '800' THEN 'F'
                  WHEN '900' THEN 'G'
                  ELSE NULL
                END <> COALESCE(MAX(UPPER(NULLIF(am.loc_code, ''))), CASE UPPER(c.machine_code)
                  WHEN 'P1A' THEN 'A'
                  WHEN 'OFFICE_PGE' THEN 'A'
                  WHEN 'PGE' THEN 'A'
                  WHEN 'P1B' THEN 'B'
                  WHEN 'P2A' THEN 'C'
                  WHEN 'P2A_01' THEN 'C'
                  WHEN 'P2A_02' THEN 'C'
                  WHEN 'P2B' THEN 'D'
                  WHEN 'DME' THEN 'E'
                  WHEN 'DME_01' THEN 'E'
                  WHEN 'DME_02' THEN 'E'
                  WHEN 'ARA' THEN 'F'
                  WHEN 'OFFICE_APE' THEN 'F'
                  WHEN 'AB1' THEN 'G'
                  WHEN 'AB2' THEN 'H'
                  WHEN 'MILL' THEN 'H'
                  WHEN 'IJL' THEN 'L'
                  WHEN 'ARC' THEN 'J'
                  WHEN 'ARC_01' THEN 'J'
                  WHEN 'ARC_02' THEN 'J'
                  ELSE NULL
                END)
              )
              THEN MAX(e.employee_code)
            ELSE NULL
          END AS guarded_resolved_employee_code
        FROM cases c
        LEFT JOIN attendance_machines am
          ON am.machine_code = c.machine_code
        LEFT JOIN attendance_scan_logs s
          ON s.machine_code = c.machine_code
         AND s.raw_device_user_id = c.raw_device_user_id
        LEFT JOIN zkteco_hr_employee_map zm
          ON zm.machine_code = c.machine_code
         AND zm.zkteco_user_id = c.raw_device_user_id
         AND zm.is_active = 1
        LEFT JOIN employees e
          ON e.zkteco_user_id = c.raw_device_user_id
        GROUP BY c.machine_code, c.raw_device_user_id
      )
      SELECT *
      FROM rows
      ORDER BY machine_code, raw_device_user_id;
    `);

    for (const row of result.recordset) {
      console.log(JSON.stringify(row));
    }
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
