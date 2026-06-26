/**
 * Emergency Recovery Migration Runner
 *
 * Runs migrations 063-071 in sequence against the production database.
 * Usage: npx ts-node src/scripts/run-emergency-recovery.ts
 *
 * ⚠️  WARNING: This script restores 788k+ rows and rebuilds attendance_imports.
 *     Run during LOW-TRAFFIC hours. Phases 3 and 5-8 take 5-20 minutes each.
 *     DO NOT CANCEL mid-execution.
 */

import fs from 'fs';
import path from 'path';
// @ts-ignore - mssql package ships without local types in this repo
import mssql from 'mssql';

// ── Env loader ──────────────────────────────────────────────────────────────────

function loadEnv() {
  if (!fs.existsSync('.env')) {
    console.warn('⚠️  No .env file found, using existing env vars');
    return;
  }
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

// ── DB connection ───────────────────────────────────────────────────────────────

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
    requestTimeout: 600_000, // 10 min per request for large operations
    connectionTimeout: 30_000,
  };
}

async function connect(database?: string) {
  const config = dbConfig(database);
  console.log(`  Connecting to ${config.server}:${config.port}/${config.database}...`);
  return mssql.connect(config);
}

// ── SQL execution ───────────────────────────────────────────────────────────────

function splitGo(sqlText: string): string[] {
  return sqlText
    .split(/^\s*GO\s*$/gim)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Split a batch into individual statements that need separate execution */
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

async function runFile(filePath: string, label: string): Promise<number> {
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
          const shortMsg = err.message?.substring(0, 200) ?? String(err);
          console.error(`\n  ❌ Batch ${i + 1}/${goBatches.length} failed: ${shortMsg}`);
          // Print first 300 chars of the failing statement for context
          console.error(`  SQL: ${trimmed.substring(0, 300)}...`);
          throw err;
        }
      }

      // Progress indicator for large files
      if (goBatches.length > 5 && (i + 1) % Math.max(1, Math.floor(goBatches.length / 10)) === 0) {
        const pct = Math.round(((i + 1) / goBatches.length) * 100);
        process.stdout.write(`  ${pct}%...`);
      }
    }
    if (goBatches.length > 5) console.log(''); // newline after progress
  } finally {
    await pool.close();
  }
  return batchCount;
}

// ── Phase definitions ───────────────────────────────────────────────────────────

const PHASES: { file: string; label: string; description: string; warning?: string }[] = [
  {
    file: '063_emergency_recovery_phase_0_3.sql',
    label: 'Phase 0',
    description: 'Freeze scheduler + snapshot empty state',
  },
  {
    file: '064_emergency_recovery_phase_1_discovery.sql',
    label: 'Phase 1',
    description: 'Backup table discovery + schema validation',
  },
  {
    file: '065_emergency_recovery_phase_2_restore_master.sql',
    label: 'Phase 2',
    description: 'Restore attendance_machines + employees',
  },
  {
    file: '066_emergency_recovery_phase_3_restore_scanlogs.sql',
    label: 'Phase 3',
    description: 'Restore 788k scan logs (IDENTITY_INSERT)',
    warning: '⚠️  LONG RUN (~5-15 min) — DO NOT CANCEL',
  },
  {
    file: '067_emergency_recovery_phase_4_schema.sql',
    label: 'Phase 4',
    description: 'Schema setup: machine_user_raw, indexes, audit log',
  },
  {
    file: '068_emergency_recovery_phase_5_8_enrich_rebuild.sql',
    label: 'Phase 5-8',
    description: 'Enrich names → UTC→WIB correction → Rebuild attendance_imports',
    warning: '⚠️  LONG RUN (~10-20 min) — DO NOT CANCEL',
  },
  {
    file: '069_emergency_recovery_phase_9_backend_harden.sql',
    label: 'Phase 9',
    description: 'Backend hardening: name priority fix + MachineTimeProfile',
  },
  {
    file: '070_emergency_recovery_phase_10_validation.sql',
    label: 'Phase 10',
    description: 'API + frontend validation queries',
  },
  {
    file: '071_emergency_recovery_phase_11_enable_scheduler.sql',
    label: 'Phase 11',
    description: 'Re-enable scheduler + monitoring checklist',
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv();

  const migrationsDir = path.join(process.cwd(), 'migrations');

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║       EMERGENCY RECOVERY — MIGRATIONS 063 → 071                 ║');
  console.log('║       Target: rebinmas_absensi_monitoring                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Verify all files exist
  const missing: string[] = [];
  for (const phase of PHASES) {
    const filePath = path.join(migrationsDir, phase.file);
    if (!fs.existsSync(filePath)) missing.push(phase.file);
  }
  if (missing.length > 0) {
    console.error(`❌ Missing migration files: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Confirm before proceeding
  const dbServer = envValue('DB_SERVER', undefined, '10.0.0.110');
  const dbName = envValue('DB_NAME', undefined, 'rebinmas_absensi_monitoring');
  console.log(`Target: ${dbServer}/${dbName}`);
  console.log(`Phases: ${PHASES.length} (063 → 071)`);
  console.log('');
  console.log('⚠️  WARNING: This will restore 788k+ rows and rebuild attendance_imports.');
  console.log('   Phases 3 and 5-8 are LONG-RUNNING (5-20 min each).');
  console.log('   Ensure backend is STOPPED before proceeding.');
  console.log('');

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (const phase of PHASES) {
    const filePath = path.join(migrationsDir, phase.file);
    console.log('┌──────────────────────────────────────────────────────────────────┐');
    console.log(`│ ${phase.label}: ${phase.description.padEnd(52)}│`);
    console.log('└──────────────────────────────────────────────────────────────────┘');
    if (phase.warning) console.log(`  ${phase.warning}`);

    const phaseStart = Date.now();
    try {
      const batches = await runFile(filePath, phase.label);
      const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
      console.log(`  ✅ ${phase.label} complete — ${batches} batches in ${elapsed}s\n`);
      successCount++;
    } catch (err: any) {
      const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
      console.error(`  ❌ ${phase.label} FAILED after ${elapsed}s: ${err.message?.substring(0, 300)}`);
      failCount++;
      console.error(`\n⚠️  Recovery halted at ${phase.label}. Fix the error above, then re-run from ${phase.label}.`);
      break;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  COMPLETE: ${successCount}/${PHASES.length} phases in ${totalElapsed}s`);
  if (failCount > 0) {
    console.log(`  FAILED: ${failCount} phase(s) — see errors above`);
    console.log('');
    console.log('  Next steps:');
    console.log('  1. Fix the error in the failed phase');
    console.log('  2. Re-run: npx ts-node src/scripts/run-emergency-recovery.ts');
    console.log('     (already-completed phases are idempotent — safe to re-run)');
  } else {
    console.log('  ✅ All emergency recovery phases completed successfully.');
    console.log('');
    console.log('  Remaining manual tasks:');
    console.log('  1. Run getUsers() sync on all 7 accessible machines');
    console.log('     (machine_user_raw is empty until this runs)');
    console.log('  2. Rebuild: npm run build');
    console.log('  3. Re-enable scheduler: set schedule.json enabled=true');
    console.log('  4. Start backend: npm run start');
    console.log('  5. Monitor for 3 days');
    console.log('');
    console.log('  Run Phase 10 validation queries for detailed checks:');
    console.log(`  File: migrations/070_emergency_recovery_phase_10_validation.sql`);
  }
  console.log('══════════════════════════════════════════════════════════════════');
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});