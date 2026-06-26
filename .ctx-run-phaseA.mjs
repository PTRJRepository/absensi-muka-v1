import sql from 'mssql'; import dotenv from 'dotenv'; dotenv.config();
const pool = await sql.connect({server:process.env.DB_SERVER,port:+(process.env.DB_PORT||1433),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,options:{encrypt:false,trustServerCertificate:true},requestTimeout:600000});
const stamp='20260626';
const log=(s)=>console.log(`[${new Date().toISOString().slice(11,19)}] ${s}`);
const runSql=async(label,stmt)=>{try{const r=await pool.request().query(stmt);const aff=r.rowsAffected?.[0]??0;log(`${label}: OK (${aff} affected)`);return true;}catch(e){log(`${label}: ERR ${e.message}`);return false;}};

// ===== SAFETY SNAPSHOT (SELECT INTO — in-DB backup, guaranteed) =====
log('=== SAFETY SNAPSHOT ===');
await runSql('snap_scan_logs', `SELECT * INTO dbo.snap_scan_logs_${stamp} FROM dbo.attendance_scan_logs;`);
await runSql('snap_imports', `SELECT * INTO dbo.snap_imports_${stamp} FROM dbo.attendance_imports;`);
await runSql('snap_employees', `SELECT * INTO dbo.snap_employees_${stamp} FROM dbo.employees;`);
await runSql('snap_machines', `SELECT * INTO dbo.snap_machines_${stamp} FROM dbo.attendance_machines;`);
await runSql('snap_machine_user_raw', `SELECT * INTO dbo.snap_machine_user_raw_${stamp} FROM dbo.machine_user_raw;`);
await runSql('snap_gangs', `SELECT * INTO dbo.snap_gangs_${stamp} FROM dbo.gangs;`);
await runSql('snap_divisions', `SELECT * INTO dbo.snap_divisions_${stamp} FROM dbo.divisions;`);
await runSql('snap_hr_snapshot', `SELECT * INTO dbo.snap_hr_snapshot_${stamp} FROM dbo.hr_employee_current_snapshot;`);
await runSql('snap_mst_division', `SELECT * INTO dbo.snap_mst_division_${stamp} FROM dbo.mst_division;`);
await runSql('snap_mst_machine', `SELECT * INTO dbo.snap_mst_machine_${stamp} FROM dbo.mst_machine;`);
await runSql('snap_mst_estate', `SELECT * INTO dbo.snap_mst_estate_${stamp} FROM dbo.mst_estate;`);
await runSql('snap_zkteco_hr_map', `SELECT * INTO dbo.snap_zkteco_hr_map_${stamp} FROM dbo.zkteco_hr_employee_map;`);

// ===== PHASE 0: archive backup tables (rename) =====
log('=== PHASE 0: ARCHIVE BACKUP TABLES ===');
const renames=[
  ['attendance_scan_logs_backup_20260623_233022','arch_scan_logs_bak_20260623a'],
  ['attendance_scan_logs_backup_20260623_233115','arch_scan_logs_bak_20260623b'],
  ['attendance_scan_logs_linked_backup_20260623','arch_scan_logs_linked_20260623'],
  ['attendance_scan_logs_unmapped_backup_20260623','arch_scan_logs_unmapped_20260623'],
  ['scan_logs_backup_current_empcode_20260623','arch_scan_logs_empcode_20260623'],
  ['attendance_scan_logs_state_before_recovery_20260625','arch_scan_logs_state_20260625'],
  ['attendance_imports_backup_before_rebuild_20260625','arch_imports_rebuild_20260625'],
  ['attendance_imports_state_before_recovery_20260625','arch_imports_state_20260625'],
  ['attendance_machines_state_before_recovery_20260625','arch_machines_state_20260625'],
  ['employees_state_before_recovery_20260625','arch_employees_state_20260625'],
  ['employees_backup_20260623','arch_employees_bak_20260623'],
  ['employees_contaminated_archive','arch_employees_contaminated'],
  ['zkteco_absensi_user_registry_backup_current_empcode_20260623','arch_user_registry_empcode_20260623'],
  ['zkteco_hr_employee_map_backup_20260623','arch_hr_emp_map_bak_20260623'],
];
for(const [old,nw] of renames){ await runSql(`rename ${old}`, `EXEC sp_rename 'dbo.${old}', '${nw}';`); }
await runSql('drop arch_imports_state (0 rows)', `IF OBJECT_ID('dbo.arch_imports_state_20260625','U') IS NOT NULL DROP TABLE dbo.arch_imports_state_20260625;`);
await runSql('drop arch_employees_state (0 rows)', `IF OBJECT_ID('dbo.arch_employees_state_20260625','U') IS NOT NULL DROP TABLE dbo.arch_employees_state_20260625;`);

// ===== PHASE A.1: DROP BROKEN VIEWS =====
log('=== PHASE A.1: DROP BROKEN VIEWS ===');
await runSql('drop vw_monthly_matrix', `IF OBJECT_ID('dbo.vw_attendance_monthly_matrix','V') IS NOT NULL DROP VIEW dbo.vw_attendance_monthly_matrix;`);
await runSql('drop vw_employee_master_clean', `IF OBJECT_ID('dbo.vw_employee_master_clean','V') IS NOT NULL DROP VIEW dbo.vw_employee_master_clean;`);
await runSql('drop vw_anomaly_open', `IF OBJECT_ID('dbo.vw_attendance_anomaly_open','V') IS NOT NULL DROP VIEW dbo.vw_attendance_anomaly_open;`);
await runSql('drop vw_monitoring_daily', `IF OBJECT_ID('dbo.vw_attendance_monitoring_daily','V') IS NOT NULL DROP VIEW dbo.vw_attendance_monitoring_daily;`);

// A.2 recreate 3 active views without gangs
log('=== PHASE A.2: RECREATE ACTIVE VIEWS (no gangs) ===');
await runSql('drop vw_attendance_final', `IF OBJECT_ID('dbo.vw_attendance_final','V') IS NOT NULL DROP VIEW dbo.vw_attendance_final;`);
await runSql('create vw_attendance_final', `CREATE VIEW dbo.vw_attendance_final AS SELECT e.employee_code, e.employee_name, d.division_code, 'N/A' AS gang_code, cal.attendance_date, COALESCE(c.attendance_status, i.attendance_status, 'NO_DATA') AS attendance_status, COALESCE(c.has_work, i.has_work, CONVERT(bit,0)) AS has_work, COALESCE(c.is_leave, i.is_leave, CONVERT(bit,0)) AS is_leave, COALESCE(c.is_sick, i.is_sick, CONVERT(bit,0)) AS is_sick, COALESCE(c.is_holiday, i.is_holiday, CONVERT(bit,0)) AS is_holiday, COALESCE(c.overtime_hours, i.overtime_hours, 0) AS overtime_hours, CASE WHEN c.id IS NOT NULL THEN 'MANUAL_CORRECTION' WHEN i.id IS NOT NULL THEN i.source ELSE 'NO_DATA' END AS source, CASE WHEN c.id IS NOT NULL AND i.id IS NOT NULL THEN CONVERT(bit,1) ELSE CONVERT(bit,0) END AS has_conflict, i.id AS import_id, c.id AS correction_id FROM employees e JOIN divisions d ON d.id = e.division_id CROSS APPLY (SELECT DISTINCT attendance_date FROM attendance_imports UNION SELECT DISTINCT attendance_date FROM attendance_manual_corrections WHERE is_deleted = 0) cal LEFT JOIN attendance_imports i ON i.employee_code = e.employee_code AND i.attendance_date = cal.attendance_date LEFT JOIN attendance_manual_corrections c ON c.employee_code = e.employee_code AND c.attendance_date = cal.attendance_date AND c.is_deleted = 0;`);
await runSql('drop vw_zkteco_final', `IF OBJECT_ID('dbo.vw_attendance_zkteco_final','V') IS NOT NULL DROP VIEW dbo.vw_attendance_zkteco_final;`);
await runSql('create vw_zkteco_final', `CREATE VIEW dbo.vw_attendance_zkteco_final AS SELECT e.employee_code, e.employee_name, d.division_code, 'N/A' AS gang_code, cal.attendance_date, CASE WHEN s.id IS NOT NULL THEN 'PRESENT' ELSE 'NO_DATA' END AS attendance_status, CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END AS has_work, 0 AS is_leave, 0 AS is_sick, 0 AS is_holiday, 0 AS overtime_hours, CASE WHEN s.id IS NOT NULL THEN 'DIRECT_ZKTECO' ELSE 'NO_DATA' END AS source, s.machine_code FROM employees e INNER JOIN divisions d ON d.id = e.division_id CROSS APPLY (SELECT DISTINCT CAST(scan_date AS DATE) AS attendance_date FROM attendance_scan_logs WHERE scan_date >= DATEADD(day, -60, GETDATE())) cal LEFT JOIN attendance_scan_logs s ON s.parsed_employee_code = e.employee_code AND s.scan_date = cal.attendance_date;`);
await runSql('drop vw_zkteco_monthly', `IF OBJECT_ID('dbo.vw_attendance_zkteco_monthly_summary','V') IS NOT NULL DROP VIEW dbo.vw_attendance_zkteco_monthly_summary;`);
await runSql('create vw_zkteco_monthly', `CREATE VIEW dbo.vw_attendance_zkteco_monthly_summary AS SELECT YEAR(cal.attendance_date) AS attendance_year, MONTH(cal.attendance_date) AS attendance_month, e.employee_code, e.employee_name, d.division_code, 'N/A' AS gang_code, COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN cal.attendance_date END) AS total_present, COUNT(DISTINCT CASE WHEN s.id IS NULL THEN cal.attendance_date END) AS total_absent, 0 AS total_leave, 0 AS total_sick, 0 AS total_overtime_hours FROM employees e INNER JOIN divisions d ON d.id = e.division_id CROSS APPLY (SELECT DISTINCT CAST(scan_date AS DATE) AS attendance_date FROM attendance_scan_logs WHERE scan_date >= DATEADD(day, -90, GETDATE())) cal LEFT JOIN attendance_scan_logs s ON s.parsed_employee_code = e.employee_code AND s.scan_date = cal.attendance_date WHERE e.is_active = 1 GROUP BY YEAR(cal.attendance_date), MONTH(cal.attendance_date), e.employee_code, e.employee_name, d.division_code;`);

// A.3 drop FKs
log('=== PHASE A.3: DROP FKS ===');
const fks=['fk_employees_gang','fk_gangs_division','FK_machine_user_raw_machine','FK_machine_user_raw_batch','FK_machine_user_map_employee','FK_machine_user_map_machine','FK_mst_division_estate','FK_mst_employee_division','FK_mst_employee_gang','FK_mst_gang_division','FK_mst_machine_division','FK_mst_machine_estate'];
for(const fk of fks){
  const res=await pool.request().query(`SELECT OBJECT_NAME(fk.parent_object_id) AS t FROM sys.foreign_keys fk WHERE fk.name='${fk}'`);
  const owner=res.recordset[0]?.t;
  if(owner) await runSql(`drop FK ${fk}`, `ALTER TABLE dbo.[${owner}] DROP CONSTRAINT [${fk}];`);
}

// A.4-A.8 drop tables
log('=== PHASE A.4-8: DROP UNUSED TABLES ===');
const drops=['api_attendance_raw','attendance_process_detail','attendance_division_reconcile','attendance_anomaly','attendance_manual_adjustment','attendance_raw_log','employee_daily_assignment','employee_division_history','employee_mapping_overrides','employee_schedules','monitoring_daily_summary','shifts','sync_job','import_batch','attendance_daily_process','attendance_time_correction_batch','attendance_time_correction_detail','gangs','mst_employee','mst_gang','mst_machine','mst_division','mst_estate','zkteco_hr_employee_map','app_configs'];
for(const t of drops){ await runSql(`drop ${t}`, `IF OBJECT_ID('dbo.${t}','U') IS NOT NULL DROP TABLE dbo.${t};`); }

// ===== VERIFY =====
log('=== VERIFY ===');
const tc=await pool.request().query(`SELECT COUNT(*) AS c FROM sys.tables`);
log(`tables remaining: ${tc.recordset[0].c}`);
const rc=await pool.request().query(`SELECT 'scan_logs' t, COUNT(*) c FROM attendance_scan_logs UNION ALL SELECT 'imports', COUNT(*) FROM attendance_imports UNION ALL SELECT 'employees', COUNT(*) FROM employees`);
rc.recordset.forEach(r=>log(`  ${r.t}: ${r.c}`));
const views=await pool.request().query(`SELECT name FROM sys.views ORDER BY name`);
log(`views: ${views.recordset.map(v=>v.name).join(', ')}`);
await pool.close();
log('DONE');
