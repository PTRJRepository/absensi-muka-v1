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
  const batchCode = process.argv[2];
  if (!batchCode) throw new Error('Usage: npx tsx _dev_utils/close-stale-sync-batches.ts <batch_code>');

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

  const result = await pool.request()
    .input('batchCode', mssql.NVarChar, batchCode)
    .query(`
      UPDATE attendance_import_batches
      SET status = 'FAILED',
          finished_at = COALESCE(finished_at, GETDATE()),
          error_message = COALESCE(error_message, 'Stale sync process stopped during deployment of sync import fix')
      OUTPUT INSERTED.id, INSERTED.batch_code, INSERTED.status, INSERTED.finished_at, INSERTED.error_message
      WHERE batch_code = @batchCode
        AND status = 'RUNNING'
    `);

  console.log(JSON.stringify(result.recordset, null, 2));
  await pool.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
