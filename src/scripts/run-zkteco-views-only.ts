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
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
    options: { encrypt: false, trustServerCertificate: true },
  };

  const pool = await mssql.connect(db);
  const sql = fs.readFileSync('migrations/013_optimize_views.sql', 'utf8');

  // Split by GO and execute each batch
  const batches = sql.split(/^\s*GO\s*$/gim).filter(b => b.trim() && !b.trim().startsWith('USE '));
  for (const batch of batches) {
    const trimmed = batch.trim();
    if (trimmed) {
      console.log('Executing:', trimmed.substring(0, 80) + '...');
      await pool.request().query(trimmed);
    }
  }

  await pool.close();
  console.log('ZKTeco views created successfully!');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
