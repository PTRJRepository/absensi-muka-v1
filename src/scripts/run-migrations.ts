import fs from 'fs';
import path from 'path';
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
  return sqlText.split(/^\s*GO\s*$/gim).map((part) => part.trim()).filter(Boolean);
}

function envValue(primary: string, fallback?: string, defaultValue?: string) {
  const clean = (value: string | undefined) => value?.trim().replace(/^['"]|['"]$/g, '');
  const primaryValue = clean(process.env[primary]);
  const fallbackValue = fallback ? clean(process.env[fallback]) : undefined;
  return primaryValue || fallbackValue || defaultValue;
}

function dbConfig(database?: string) {
  return {
    server: envValue('DB_SERVER', 'DATABASE_PROFILES_SERVER_PROFILE_1_SERVER', '10.0.0.110')!,
    port: Number(envValue('DB_PORT', 'DATABASE_PROFILES_SERVER_PROFILE_1_PORT', '1433')),
    user: envValue('DB_USER', 'DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME')!,
    password: envValue('DB_PASSWORD', 'DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD')!,
    database: database ?? envValue('DB_NAME', undefined, 'rebinmas_absensi_monitoring'),
    options: { encrypt: envValue('DB_ENCRYPT', 'DATABASE_PROFILES_SERVER_PROFILE_1_ENCRYPT', 'false') === 'true', trustServerCertificate: envValue('DB_TRUST_SERVER_CERTIFICATE', undefined, 'true') !== 'false' },
  };
}
async function connect(database?: string) {
  return mssql.connect(dbConfig(database));
}

async function runFile(file: string) {
  const text = fs.readFileSync(file, 'utf8');
  const dbName = process.env.DB_NAME ?? 'rebinmas_absensi_monitoring';
  const replaced = text.split('rebinmas_absensi_monitoring').join(dbName);
  let pool = await connect(file.endsWith('001_create_database.sql') ? 'master' : dbName);
  try {
    // Split by GO first
    const goBatches = splitGo(replaced);
    for (const goBatch of goBatches) {
      if (!goBatch.trim()) continue;
      // For each GO batch, split individual statements that need their own batch
      // CREATE VIEW/PROC/FUNCTION must be first in a batch
      const statements = splitStatements(goBatch);
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed || /^USE\s+/i.test(trimmed)) continue;
        await pool.request().query(trimmed);
      }
    }
  } finally {
    await pool.close();
  }
}

/** Split a batch into individual statements that need separate execution */
function splitStatements(batch: string): string[] {
  const result: string[] = [];
  let current = '';
  const lines = batch.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Detect standalone CREATE statements that need their own batch
    if (/^(CREATE\s+(VIEW|PROC|PROCEDURE|FUNCTION|TRIGGER))/i.test(trimmed)) {
      if (current.trim()) result.push(current.trim());
      current = trimmed;
    } else {
      current += '\n' + line;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

async function main() {
  loadEnv();

  // Auto-discover all .sql files in migrations folder, sorted alphabetically
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => path.join(migrationsDir, name));

  console.log(`Found ${files.length} migration files`);
  for (const file of files) {
    console.log(`Running ${path.basename(file)}`);
    await runFile(file);
  }
  console.log('Migrations done');
}

main().catch((error) => { console.error('Migration failed:', error.message); process.exit(1); });




