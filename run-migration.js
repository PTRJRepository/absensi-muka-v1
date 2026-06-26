/**
 * Migration Runner - Direct SQL Server via mssql
 * Runs migration_v1_employee_attendance.sql against extend_db_ptrj
 *
 * Usage: node run-migration.js
 */

import { readFileSync } from 'fs';
import sql from 'mssql';

// Load .env manually
const envPath = process.argv[2] || '.env';
const envLines = readFileSync(envPath, 'utf8').split('\n');

const profile = {};
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx < 0) continue;
  const key = trimmed.slice(0, idx).trim();
  const val = trimmed.slice(idx + 1).trim();
  if (key.startsWith('DATABASE_PROFILES_')) {
    const rest = key.replace('DATABASE_PROFILES_', '');
    const last_ = rest.lastIndexOf('_');
    const section = rest.slice(0, last_);
    const field = rest.slice(last_ + 1).toLowerCase();
    if (!profile[section]) profile[section] = {};
    profile[section][field] = val;
  }
}

const key = Object.keys(profile).find(k => k.includes('SERVER_PROFILE_1')) || Object.keys(profile)[0];
const db = profile[key];

const config = {
  server: db.server,
  port: parseInt(db.port) || 1433,
  user: db.username,
  password: db.password,
  database: 'extend_db_ptrj',
  options: {
    encrypt: db.encrypt === 'true',
    trustServerCertificate: true,
  },
  connectionTimeout: 30000,
  requestTimeout: 60000,
};

const dbName = 'extend_db_ptrj';
console.log(`Connecting to: ${config.server}:${config.port}/${dbName}`);
console.log(`Driver: ${db.driver}\n`);

async function run() {
  let pool;
  try {
    pool = await sql.connect(config);
    console.log('Connected.\n');

    const sqlFilePath = '_dev_utils/migration_v1_employee_attendance.sql';
    const sqlText = readFileSync(sqlFilePath, 'utf8');

    // Split by GO batches (case-insensitive)
    const batches = sqlText
      .split(/\n[Gg][Oo]\s*\n/)
      .map(b => b.trim())
      .filter(Boolean);

    console.log(`Executing ${batches.length} batch(es)...\n`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      // Extract PRINT messages for progress
      const printLines = [...batch.matchAll(/PRINT\s+'([^']*)'/g)].map(m => m[1]);
      for (const msg of printLines) {
        console.log(msg);
      }

      if (printLines.length) process.stdout.write('\n');

      try {
        await pool.request().query(batch);
      } catch (err) {
        if (err.message.includes('already exists') ||
            err.message.includes('There is already an object') ||
            err.message.includes('CREATE TABLE') && batch.includes('IF OBJECT_ID')) {
          // Already exists, continue
          continue;
        }
        console.error(`  ERROR: ${err.message}`);
        // Don't abort — continue with next batch
      }
    }

    console.log('Migration complete.');
  } finally {
    if (pool) await pool.close();
  }
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
