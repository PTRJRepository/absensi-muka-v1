import fs from 'fs';
import path from 'path';
import mssql from 'mssql';

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

function splitGo(sqlText: string) {
  return sqlText.split(/^\s*GO\s*$/gim).map((part) => part.trim()).filter(Boolean);
}

function dbConfig(database?: string) {
  return {
    server: process.env.DB_SERVER || '10.0.0.110',
    port: Number(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: database ?? process.env.DB_NAME ?? 'rebinmas_absensi_monitoring',
    options: { encrypt: false, trustServerCertificate: true }
  };
}

async function runFile(filePath: string, isMaster = false) {
  const text = fs.readFileSync(filePath, 'utf8');
  const dbName = process.env.DB_NAME ?? 'rebinmas_absensi_monitoring';
  const pool = await mssql.connect({
    ...dbConfig(isMaster ? 'master' : dbName),
    requestTimeout: 300000, // 5 minutes for large tables
    connectionTimeout: 30000
  });

  try {
    let batchNum = 0;
    for (const batch of splitGo(text.split('rebinmas_absensi_monitoring').join(dbName))) {
      if (/^USE\s+/i.test(batch)) continue;
      batchNum++;
      console.log(`  Batch ${batchNum}...`);
      await pool.request().query(batch);
    }
    console.log(`  ✓ ${path.basename(filePath)}`);
  } catch (err: any) {
    console.error(`  ✗ ${path.basename(filePath)}: ${err.message}`);
    throw err;
  } finally {
    await pool.close();
  }
}

async function main() {
  loadEnv();

  const migrationsDir = path.join(process.cwd(), 'migrations');
  const targetMigrations = [
    '053_create_attendance_imports.sql'
  ];

  console.log('\n=== Running currentEmpCode Migrations (047-052) ===\n');

  for (const file of targetMigrations) {
    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ ${file}: NOT FOUND - skipping`);
      continue;
    }

    console.log(`\n${file}:`);
    await runFile(filePath);
  }

  console.log('\n=== Done ===\n');
}

main().catch(console.error);
