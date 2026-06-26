import sql from 'mssql';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';

dotenv.config();

const cfg = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || '1433', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'rebinmas_absensi_monitoring',
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 120000,
};

const out = {};

async function run(name, stmt) {
  try {
    const r = await pool.request().query(stmt);
    out[name] = r.recordset ?? [];
    console.log(`OK: ${name} -> ${(r.recordset ?? []).length} rows`);
  } catch (e) {
    out[name] = { error: e.message };
    console.log(`ERR: ${name} -> ${e.message}`);
  }
}

let pool;
try {
  pool = await sql.connect(cfg);
  console.log('Connected to', cfg.database, 'at', cfg.server);

  // 1. List all tables
  await run('tables', `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;`);

  // 2. List all views
  await run('views', `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS ORDER BY TABLE_NAME;`);

  // 3. Columns of key tables
  await run('columns', `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, ORDINAL_POSITION FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN ('machine_user_raw','attendance_scan_logs','employees','attendance_imports','attendance_import_batches','attendance_machines','divisions','gangs','hr_employee_current_snapshot','employee_code_history','attendance_manual_corrections','machine_user_map','zkteco_hr_employee_map','zkteco_absensi_user_registry','zkteco_absensi_user_machine') ORDER BY TABLE_NAME, ORDINAL_POSITION;`);

  // 4. Row counts
  const countTables = ['machine_user_raw','attendance_scan_logs','employees','attendance_imports','attendance_import_batches','attendance_machines','divisions','gangs','hr_employee_current_snapshot','employee_code_history','attendance_manual_corrections'];
  const countStmt = countTables.map(t => `SELECT '${t}' AS table_name, COUNT(*) AS total FROM ${t}`).join(' UNION ALL ');
  await run('rowcounts', countStmt);

  // 5. View definitions
  await run('viewdefs', `SELECT v.name AS view_name, m.definition FROM sys.views v JOIN sys.sql_modules m ON m.object_id = v.object_id ORDER BY v.name;`);

  // 6. Foreign keys
  await run('foreignkeys', `SELECT fk.name AS fk_name, OBJECT_NAME(fk.parent_object_id) AS child_table, COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS child_column, OBJECT_NAME(fk.referenced_object_id) AS parent_table, COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS parent_column FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id ORDER BY child_table, parent_table;`);

  // 7. Indexes
  await run('indexes', `SELECT t.name AS table_name, i.name AS index_name, i.is_unique, i.type_desc FROM sys.indexes i JOIN sys.tables t ON t.object_id = i.object_id WHERE t.name IN ('machine_user_raw','attendance_scan_logs','employees','attendance_imports','attendance_machines') AND i.name IS NOT NULL ORDER BY t.name, i.name;`);

  // 8. Data quality
  await run('dq_mapping_status', `SELECT mapping_status, COUNT(*) AS total FROM attendance_scan_logs GROUP BY mapping_status;`);
  await run('dq_attendance_status', `SELECT attendance_status, COUNT(*) AS total FROM attendance_imports GROUP BY attendance_status;`);
  await run('dq_division_code', `SELECT division_code, COUNT(*) AS total FROM attendance_imports GROUP BY division_code ORDER BY division_code;`);
  await run('dq_null_raw_scan_log_id', `SELECT COUNT(*) AS total_imports, SUM(CASE WHEN raw_scan_log_id IS NULL THEN 1 ELSE 0 END) AS null_raw_scan_log_id FROM attendance_imports;`);

  // Extra: legacy table existence check
  const legacyTables = ['zkteco_hr_employee_map','machine_user_map','zkteco_absensi_user_registry','zkteco_absensi_user_machine','absen_import','absen_import_batch','mst_employee','employee_machine_enrollments','zkteco_hr_employee_map_backup_20260623'];
  const legacyStmt = legacyTables.map(t => `SELECT '${t}' AS table_name, CASE WHEN OBJECT_ID('dbo.${t}','U') IS NOT NULL THEN (SELECT COUNT(*) FROM dbo.${t}') ELSE -1 END AS row_count`).join(' UNION ALL ');
  await run('legacy_table_counts', legacyStmt);

  // Extra: current_emp_code resolution data quality
  await run('dq_current_emp_code_employees', `SELECT CASE WHEN current_emp_code IS NULL THEN 'NULL' WHEN current_emp_code = employee_code THEN 'SAME' ELSE 'DIFFERENT' END AS status, COUNT(*) AS total FROM employees GROUP BY CASE WHEN current_emp_code IS NULL THEN 'NULL' WHEN current_emp_code = employee_code THEN 'SAME' ELSE 'DIFFERENT' END;`);

  await run('dq_nik_status', `SELECT CASE WHEN nik IS NULL THEN 'NULL' ELSE 'HAS_NIK' END AS status, COUNT(*) AS total FROM employees GROUP BY CASE WHEN nik IS NULL THEN 'NULL' ELSE 'HAS_NIK' END;`);

  await pool.close();
  writeFileSync('db-audit-results.json', JSON.stringify(out, null, 2));
  console.log('\nResults written to db-audit-results.json');
} catch (e) {
  console.error('FATAL:', e.message);
  out.__fatal = e.message;
  writeFileSync('db-audit-results.json', JSON.stringify(out, null, 2));
  process.exit(1);
}
