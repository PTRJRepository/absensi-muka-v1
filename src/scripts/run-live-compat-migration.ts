import fs from 'fs';
// @ts-ignore - mssql package ships without local types in this repo
import mssql from 'mssql';

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

function splitGo(sqlText: string) {
  return sqlText
    .split(/^\s*GO\s*$/gim)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function main() {
  loadEnv();
  const db = {
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
    options: {
      encrypt: (process.env.DB_ENCRYPT || 'false') === 'true',
      trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE || 'true') !== 'false',
    },
  };

  const pool = await mssql.connect(db);
  const migrationSql = fs
    .readFileSync('migrations/023_live_attendance_compat.sql', 'utf8')
    .replace(/USE\s+rebinmas_absensi_monitoring\s*;?/i, '');

  for (const batch of splitGo(migrationSql)) {
    await pool.request().query(batch);
  }

  const verify = await pool.request().query(`
    SELECT name, type_desc
    FROM sys.objects
    WHERE name IN ('attendance_imports', 'attendance_imports_old', 'attendance_manual_corrections')
    ORDER BY name
  `);
  console.log(JSON.stringify(verify.recordset, null, 2));

  await pool.close();
  console.log('Live compatibility migration completed.');
}

main().catch((error) => {
  console.error('Live compatibility migration failed:', error.message);
  process.exit(1);
});
