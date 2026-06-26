import fs from 'fs';
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

async function main() {
  loadEnv();
  const pool = await mssql.connect({
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
    options: {
      encrypt: (process.env.DB_ENCRYPT || 'false') === 'true',
      trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE || 'true') !== 'false',
    },
  });

  const batch = await pool.request().query(`
    SELECT TOP 12
      b.id,
      b.batch_code,
      m.machine_code,
      b.status,
      b.records_total,
      b.records_success,
      b.records_failed,
      b.started_at,
      b.finished_at,
      b.error_message
    FROM attendance_import_batches b
    LEFT JOIN attendance_machines m ON m.id = b.machine_id
    WHERE b.batch_code LIKE 'SMOKE_AB2%'
       OR b.batch_code LIKE 'SMOKE_IJL%'
       OR b.batch_code LIKE 'SYNC_%_GLOBAL%'
    ORDER BY b.id DESC
  `);

  const counts = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM attendance_scan_logs WHERE machine_code = 'AB2') AS ab2_raw,
      (SELECT COUNT(*) FROM attendance_imports WHERE source IN ('ZKTECO', 'DIRECT_ZKTECO') AND source_reference = 'AB2') AS ab2_imported,
      (SELECT COUNT(*) FROM vw_attendance_monthly_matrix WHERE attendance_year = 2026 AND attendance_month = 6 AND source = 'DIRECT_ZKTECO') AS june_matrix_zkteco
  `);

  const importSources = await pool.request().query(`
    SELECT TOP 20
      source,
      source_reference,
      COUNT(*) AS rows_count,
      MIN(attendance_date) AS min_date,
      MAX(attendance_date) AS max_date
    FROM attendance_imports
    WHERE source IN ('DIRECT_ZKTECO', 'ZKTECO')
       OR source_reference IN ('AB2', 'P1A', 'P1B', 'OFFICE_PGE', 'AB1')
       OR source_reference LIKE 'DIRECT_ZKTECO:%'
    GROUP BY source, source_reference
    ORDER BY rows_count DESC
  `);

  console.log(JSON.stringify({
    batch: batch.recordset,
    counts: counts.recordset[0],
    importSources: importSources.recordset,
  }, null, 2));
  await pool.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
