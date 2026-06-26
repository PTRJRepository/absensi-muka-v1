// Run migration_v2 directly via mssql (bypass HTTP gateway which has DB routing bugs)
// Target: extend_db_ptrj

import mssql from 'mssql';
import fs from 'fs';

const CONFIG = {
  server:   '10.0.0.110',
  port:     1433,
  database: 'extend_db_ptrj',
  user:     'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  options:  { encrypt: false, trustServerCertificate: true }
};

async function runMigration() {
  console.log('Connecting to extend_db_ptrj...');
  const pool = await mssql.connect(CONFIG);
  console.log('Connected.\n');

  const sql = fs.readFileSync('./migration_v2_employee_attendance.sql', 'utf8');

  // Split by GO statements
  const batches = sql.split(/\nGO\s*\n/im)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const label = batch.split('\n')[0].replace(/^--/, '').trim() || `[Batch ${i+1}]`;
    const display = label.length > 80 ? label.substring(0, 77) + '...' : label;

    // Skip comment-only batches
    if (batch.startsWith('--') && !batch.includes('SELECT') && !batch.includes('INSERT') && !batch.includes('CREATE') && !batch.includes('GO')) {
      console.log(`  SKIP: ${display}`);
      continue;
    }

    process.stdout.write(`[${String(i+1).padStart(2)}/${batches.length}] ${display}... `);

    try {
      await pool.query(batch);
      console.log('OK');
      success++;
    } catch(e) {
      // Handle GO-only batches
      if (e.message.includes('GO') || batch.trim() === '') {
        console.log('SKIP');
        continue;
      }
      console.log(`FAIL: ${e.message}`);
      failed++;
      // Continue despite errors
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n--- Verification ---');
  const tables = await pool.query`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_CATALOG = 'extend_db_ptrj'
    ORDER BY TABLE_NAME
  `;

  console.log(`\nTables in extend_db_ptrj (${tables.recordset.length} found):`);
  tables.recordset.forEach(t => console.log(' +', t.TABLE_NAME));

  await pool.close();
  console.log(`\nDone. Success: ${success}, Failed: ${failed}`);
}

runMigration().catch(e => { console.error(e); process.exit(1); });