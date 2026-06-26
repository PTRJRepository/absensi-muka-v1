import fs from 'fs';
// @ts-ignore
import mssql from 'mssql';

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function main() {
  loadEnv();
  const db = {
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
    database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
    options: { encrypt: false, trustServerCertificate: true },
  };

  console.log('Connecting to', db.server + ':' + db.port, '/', db.database);
  const pool = await mssql.connect(db);
  const sql = fs.readFileSync('migrations/014_monthly_matrix_view.sql', 'utf8');

  const batches = sql.split(/^\s*GO\s*$/gim).filter(b => b.trim() && !b.trim().startsWith('USE '));
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i].trim();
    if (batch) {
      console.log('Executing batch', i + 1, '/', batches.length, ':', batch.substring(0, 100).replace(/\n/g, ' ') + '...');
      await pool.request().query(batch);
      console.log('  OK');
    }
  }

  await pool.close();
  console.log('Migration 014 (monthly matrix views) completed successfully!');
}

main().catch(err => {
  console.error('Migration 014 FAILED:', err.message);
  process.exit(1);
});
