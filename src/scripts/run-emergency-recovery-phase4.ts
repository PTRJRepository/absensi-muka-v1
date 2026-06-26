/**
 * Emergency Recovery — Phase 4-11 only (Phases 0-3 already completed)
 *
 * Usage: npx ts-node src/scripts/run-emergency-recovery-phase4.ts
 *
 * Pre-existing state:
 *   - attendance_scan_logs: 788k+ rows restored
 *   - employees: 3761 rows (all divisions)
 *   - attendance_machines: 16 rows
 *   - machine_user_raw: 1228 rows
 *   - scheduler: disabled
 */

import fs from 'fs';
import path from 'path';
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

function envValue(primary: string, fallback?: string, defaultValue?: string) {
  const clean = (value: string | undefined) => value?.trim().replace(/^['"]|['"]$/g, '');
  return clean(process.env[primary]) || (fallback ? clean(process.env[fallback]) : undefined) || defaultValue;
}

function dbConfig(database?: string) {
  return {
    server: envValue('DB_SERVER', undefined, '10.0.0.110')!,
    port: Number(envValue('DB_PORT', undefined, '1433')),
    user: envValue('DB_USER')!,
    password: envValue('DB_PASSWORD')!,
    database: database ?? envValue('DB_NAME', undefined, 'rebinmas_absensi_monitoring'),
    options: {
      encrypt: envValue('DB_ENCRYPT', undefined, 'false') === 'true',
      trustServerCertificate: envValue('DB_TRUST_SERVER_CERTIFICATE', undefined, 'true') !== 'false',
    },
    requestTimeout: 600_000,
    connectionTimeout: 30_000,
  };
}

async function connect(database?: string) {
  const config = dbConfig(database);
  return mssql.connect(config);
}

function splitGo(sqlText: string): string[] {
  return sqlText.split(/^\s*GO\s*$/gim).map((part) => part.trim()).filter(Boolean);
}

function splitStatements(batch: string): string[] {
  const result: string[] = [];
  let current = '';
  const lines = batch.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
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

async function runFile(filePath: string): Promise<number> {
  const text = fs.readFileSync(filePath, 'utf8');
  const dbName = envValue('DB_NAME', undefined, 'rebinmas_absensi_monitoring')!;
  const replaced = text.split('rebinmas_absensi_monitoring').join(dbName);

  const pool = await connect(dbName);
  let batchCount = 0;
  try {
    const goBatches = splitGo(replaced);
    for (let i = 0; i < goBatches.length; i++) {
      const goBatch = goBatches[i];
      if (!goBatch.trim()) continue;
      const statements = splitStatements(goBatch);
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed || /^USE\s+/i.test(trimmed)) continue;
        try {
          await pool.request().query(trimmed);
          batchCount++;
        } catch (err: any) {
          const shortMsg = err.message?.substring(0, 300) ?? String(err);
          console.error(`\n  ❌ Batch ${i + 1}/${goBatches.length} failed: ${shortMsg}`);
          console.error(`  SQL: ${trimmed.substring(0, 300)}...`);
          throw err;
        }
      }
      if (goBatches.length > 5 && (i + 1) % Math.max(1, Math.floor(goBatches.length / 10)) === 0) {
        process.stdout.write(`  ${Math.round(((i + 1) / goBatches.length) * 100)}%...`);
      }
    }
    if (goBatches.length > 5) console.log('');
  } finally {
    await pool.close();
  }
  return batchCount;
}

const PHASES = [
  { file: '067_emergency_recovery_phase_4_schema.sql', label: 'Phase 4', desc: 'Schema setup: machine_user_raw, indexes, audit log' },
  { file: '068_emergency_recovery_phase_5_8_enrich_rebuild.sql', label: 'Phase 5-8', desc: 'Enrich names → UTC→WIB → Rebuild imports', warning: '⚠️  LONG RUN (~10-20 min) — DO NOT CANCEL' },
  { file: '069_emergency_recovery_phase_9_backend_harden.sql', label: 'Phase 9', desc: 'Backend hardening: name priority fix' },
  { file: '070_emergency_recovery_phase_10_validation.sql', label: 'Phase 10', desc: 'API + frontend validation queries' },
  { file: '071_emergency_recovery_phase_11_enable_scheduler.sql', label: 'Phase 11', desc: 'Re-enable scheduler + monitoring' },
];

async function main() {
  loadEnv();
  const migrationsDir = path.join(process.cwd(), 'migrations');

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     EMERGENCY RECOVERY — PHASES 4 → 11                          ║');
  console.log('║     (Phases 0-3 already completed)                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  let success = 0;
  let fail = 0;

  for (const phase of PHASES) {
    const filePath = path.join(migrationsDir, phase.file);
    console.log('┌──────────────────────────────────────────────────────────────────┐');
    console.log(`│ ${phase.label}: ${phase.desc.padEnd(52)}│`);
    console.log('└──────────────────────────────────────────────────────────────────┘');
    if (phase.warning) console.log(`  ${phase.warning}`);

    const phaseStart = Date.now();
    try {
      const batches = await runFile(filePath);
      const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
      console.log(`  ✅ ${phase.label} complete — ${batches} batches in ${elapsed}s\n`);
      success++;
    } catch (err: any) {
      const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
      console.error(`  ❌ ${phase.label} FAILED after ${elapsed}s: ${err.message?.substring(0, 300)}`);
      fail++;
      break;
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  COMPLETE: ${success}/${PHASES.length} phases in ${totalElapsed}s`);
  if (fail > 0) {
    console.log(`  FAILED: ${fail} phase(s) — fix error and re-run`);
  } else {
    console.log('  ✅ All phases complete.');
    console.log('');
    console.log('  Remaining:');
    console.log('  1. Sync getUsers() on 7 accessible machines');
    console.log('  2. npm run build');
    console.log('  3. Set schedule.json enabled=true');
    console.log('  4. npm run start');
    console.log('  5. Monitor 3 days');
  }
  console.log('══════════════════════════════════════════════════════════════════');
}

main().catch((error) => {
  console.error('Fatal:', error.message);
  process.exit(1);
});