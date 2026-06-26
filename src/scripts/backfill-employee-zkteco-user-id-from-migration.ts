import fs from 'fs';
import path from 'path';
// @ts-ignore - mssql package ships without local types in this repo
import mssql from 'mssql';

type Mapping = {
  employeeCode: string;
  employeeName: string;
  zktecoUserId: string;
};

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

function dbConfig() {
  return {
    server: process.env.DB_SERVER ?? '10.0.0.110',
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USER ?? 'sa',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'rebinmas_absensi_monitoring',
    options: {
      encrypt: (process.env.DB_ENCRYPT ?? 'false') === 'true',
      trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') !== 'false',
    },
  };
}

function parseMigrationMappings(): Mapping[] {
  const filePath = path.join('_dev_utils', 'migration_execute.sql');
  const sqlText = fs.readFileSync(filePath, 'utf8');
  const mappings: Mapping[] = [];
  const tuplePattern = /\(\s*\d+\s*,\s*'([^']+)'\s*,\s*'((?:''|[^'])*)'\s*,\s*\d+\s*,\s*'[^']*'\s*,\s*'([^']+)'\s*,\s*1\s*,/g;
  for (const match of sqlText.matchAll(tuplePattern)) {
    const employeeCode = match[1].trim();
    const employeeName = match[2].replace(/''/g, "'").trim();
    const zktecoUserId = match[3].trim();
    if (/^[A-Z]\d+$/.test(employeeCode) && /^\d{6,}$/.test(zktecoUserId)) {
      mappings.push({ employeeCode, employeeName, zktecoUserId });
    }
  }
  return mappings;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const mappings = parseMigrationMappings();
  const pool = await mssql.connect(dbConfig());

  try {
    console.log(`Official long-ID mappings in migration_execute.sql: ${mappings.length}`);
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY_RUN'}`);

    const sampleCodes = ['E0130', 'H0012'];
    for (const code of sampleCodes) {
      const mapping = mappings.find((item) => item.employeeCode === code);
      const row = await pool.request()
        .input('employeeCode', mssql.NVarChar, code)
        .query(`
          SELECT TOP 1 employee_code, employee_name, zkteco_user_id, is_active
          FROM employees
          WHERE employee_code = @employeeCode
        `);
      console.log(JSON.stringify({ reference: mapping ?? null, current: row.recordset[0] ?? null }));
    }

    if (!apply) {
      console.log('Dry run complete. Re-run with --apply to update employees.zkteco_user_id from the reference file.');
      return;
    }

    let updated = 0;
    let missing = 0;
    for (let index = 0; index < mappings.length; index++) {
      const mapping = mappings[index];
      const result = await pool.request()
        .input('employeeCode', mssql.NVarChar, mapping.employeeCode)
        .input('zktecoUserId', mssql.NVarChar, mapping.zktecoUserId)
        .query(`
          UPDATE employees
          SET zkteco_user_id = @zktecoUserId
          WHERE employee_code = @employeeCode
        `);
      const rows = result.rowsAffected?.[0] ?? 0;
      if (rows > 0) updated += rows;
      else missing++;
    }

    console.log(`Updated employees zkteco_user_id rows: ${updated}`);
    console.log(`Skipped because employee code was not found: ${missing}`);
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
