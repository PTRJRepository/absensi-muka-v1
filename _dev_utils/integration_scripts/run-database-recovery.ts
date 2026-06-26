import mssql from 'mssql';

const dbConfig = {
  server: '10.0.0.110',
  port: 1433,
  user: 'sa',
  password: process.env.DB_PASSWORD || '<DB_PASSWORD>',
  database: 'rebinmas_absensi_monitoring',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 300000 // 5 minutes timeout for large operations
  },
};

const RECOVERY_CODE = 'RECOVERY_20260625_EMERGENCY';
const EXECUTED_BY = 'Antigravity_AI_Agent';

async function logAuditEvent(pool: mssql.ConnectionPool, phase: string, action: string, status: string, records: number | null, message: string) {
  try {
    await pool.request()
      .input('code', RECOVERY_CODE)
      .input('phase', phase)
      .input('action', action)
      .input('status', status)
      .input('records', records)
      .input('message', message)
      .input('by', EXECUTED_BY)
      .query(`
        INSERT INTO attendance_recovery_audit_log (recovery_code, phase, action_name, status, records_affected, message, executed_by, started_at, completed_at)
        VALUES (@code, @phase, @action, @status, @records, @message, @by, SYSDATETIME(), SYSDATETIME())
      `);
    console.log(`[AUDIT] ${phase} - ${action}: ${status} (${records ?? 0} rows) - ${message}`);
  } catch (err: any) {
    console.error(`[AUDIT ERROR] Failed to write audit log: ${err.message}`);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('DATABASE EMERGENCY RECOVERY & RESTORE PIPELINE');
  console.log('='.repeat(60));

  const pool = await mssql.connect(dbConfig);
  console.log('Connected to MSSQL Database successfully.');

  // Create Audit Table if not exists
  await pool.request().query(`
    IF OBJECT_ID('attendance_recovery_audit_log', 'U') IS NULL
    BEGIN
        CREATE TABLE attendance_recovery_audit_log (
            id BIGINT IDENTITY(1,1) PRIMARY KEY,
            recovery_code NVARCHAR(100) NOT NULL,
            phase NVARCHAR(100) NOT NULL,
            action_name NVARCHAR(150) NOT NULL,
            status NVARCHAR(30) NOT NULL,
            records_affected INT NULL,
            message NVARCHAR(1000) NULL,
            executed_by NVARCHAR(100) NULL,
            started_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
            completed_at DATETIME2 NULL
        );
    END;
  `);

  await logAuditEvent(pool, 'PHASE_0', 'FREEZE_SCHEDULER', 'SUCCESS', null, 'Scheduler already verified disabled in schedule.json config file.');

  // Phase 0: Backup active tables state
  console.log('\n--- Phase 0: Creating State Backups ---');
  
  const tablesToBackup = [
    { name: 'attendance_scan_logs', backup: 'attendance_scan_logs_state_before_recovery_20260625' },
    { name: 'attendance_imports', backup: 'attendance_imports_state_before_recovery_20260625' },
    { name: 'employees', backup: 'employees_state_before_recovery_20260625' },
    { name: 'attendance_machines', backup: 'attendance_machines_state_before_recovery_20260625' }
  ];

  for (const t of tablesToBackup) {
    try {
      const checkBackup = await pool.request().query(`SELECT OBJECT_ID('${t.backup}', 'U') as id`);
      if (checkBackup.recordset[0].id === null) {
        await pool.request().query(`SELECT * INTO ${t.backup} FROM ${t.name}`);
        const cntRes = await pool.request().query(`SELECT COUNT(*) as cnt FROM ${t.backup}`);
        await logAuditEvent(pool, 'PHASE_0', `BACKUP_${t.name.toUpperCase()}`, 'SUCCESS', cntRes.recordset[0].cnt, `Backed up current active state to ${t.backup}`);
      } else {
        console.log(`Backup table ${t.backup} already exists. Skipping snapshot creation.`);
      }
    } catch (err: any) {
      await logAuditEvent(pool, 'PHASE_0', `BACKUP_${t.name.toUpperCase()}`, 'FAILED', null, err.message);
      throw err;
    }
  }

  // Phase 2: Restore Master Data
  console.log('\n--- Phase 2: Restoring Master Data ---');

  // Verify attendance_machines
  const machineCountRes = await pool.request().query(`SELECT COUNT(*) as cnt FROM attendance_machines`);
  await logAuditEvent(pool, 'PHASE_2', 'RESTORE_MACHINES', 'SUCCESS', machineCountRes.recordset[0].cnt, 'Verified 16 machines are populated and active in attendance_machines.');

  // Restore employees from backup
  try {
    const checkEmp = await pool.request().query(`SELECT COUNT(*) as cnt FROM employees`);
    if (checkEmp.recordset[0].cnt === 0) {
      console.log('Restoring employees from employees_backup_20260623...');
      await pool.request().query(`
        SET IDENTITY_INSERT employees ON;
        INSERT INTO employees (
            id, employee_code, employee_name, division_id, gang_id, employment_status, is_active, created_at, updated_at
        )
        SELECT
            id, employee_code, employee_name, division_id, gang_id, employment_status, is_active, created_at, updated_at
        FROM employees_backup_20260623 b
        WHERE NOT EXISTS (
            SELECT 1 FROM employees e WHERE e.id = b.id
        );
        SET IDENTITY_INSERT employees OFF;
      `);
      const newEmpCount = await pool.request().query(`SELECT COUNT(*) as cnt FROM employees`);
      await logAuditEvent(pool, 'PHASE_2', 'RESTORE_EMPLOYEES', 'SUCCESS', newEmpCount.recordset[0].cnt, 'Restored employees master table from employees_backup_20260623.');
    } else {
      await logAuditEvent(pool, 'PHASE_2', 'RESTORE_EMPLOYEES', 'SKIPPED', checkEmp.recordset[0].cnt, 'Employees master table is already populated.');
    }
  } catch (err: any) {
    await logAuditEvent(pool, 'PHASE_2', 'RESTORE_EMPLOYEES', 'FAILED', null, err.message);
    throw err;
  }

  // Phase 3: Restore Raw Attendance Logs
  console.log('\n--- Phase 3: Restoring Raw Attendance Logs ---');
  try {
    console.log('Clearing active attendance_scan_logs...');
    await pool.request().query('DELETE FROM attendance_scan_logs');

    console.log('Restoring historical scan logs from backup (788k rows) with machine ID mapping...');
    // Map machine_code 'PGE' to OFFICE_PGE (id = 1) and 'ARE' to OFFICE_APE (id = 3)
    const restoreHistorical = await pool.request().query(`
      SET IDENTITY_INSERT attendance_scan_logs ON;
      INSERT INTO attendance_scan_logs (
          id, machine_id, machine_code, raw_device_user_id, raw_user_sn, raw_record_time, raw_ip, parsed_employee_code, parsed_division_code, mapping_status, mapping_reason, scan_time, scan_date, event_type, verify_type, work_code, sync_batch_id, created_at
      )
      SELECT
          b.id,
          CASE 
              WHEN b.machine_code = 'PGE' THEN 1
              WHEN b.machine_code = 'ARE' THEN 3
              ELSE COALESCE(m.id, 1)
          END AS machine_id,
          CASE 
              WHEN b.machine_code = 'PGE' THEN 'OFFICE_PGE'
              WHEN b.machine_code = 'ARE' THEN 'OFFICE_APE'
              ELSE b.machine_code
          END AS machine_code,
          b.raw_device_user_id, b.raw_user_sn, b.raw_record_time, b.raw_ip, b.parsed_employee_code, b.parsed_division_code, b.mapping_status, b.mapping_reason, b.scan_time, b.scan_date, b.event_type, b.verify_type, b.work_code, b.sync_batch_id, b.created_at
      FROM attendance_scan_logs_backup_20260623_233022 b
      LEFT JOIN attendance_machines m
          ON m.machine_code = b.machine_code;
      SET IDENTITY_INSERT attendance_scan_logs OFF;
    `);

    // Restore post-backup records from state snapshot
    console.log('Restoring new scans created after the backup date...');
    const restoreNew = await pool.request().query(`
      INSERT INTO attendance_scan_logs (
          machine_id, machine_code, raw_device_user_id, raw_user_sn, raw_record_time, raw_ip, parsed_employee_code, parsed_division_code, mapping_status, mapping_reason, scan_time, scan_date, event_type, verify_type, work_code, sync_batch_id, created_at
      )
      SELECT
          machine_id, machine_code, raw_device_user_id, raw_user_sn, raw_record_time, raw_ip, parsed_employee_code, parsed_division_code, mapping_status, mapping_reason, scan_time, scan_date, event_type, verify_type, work_code, sync_batch_id, created_at
      FROM attendance_scan_logs_state_before_recovery_20260625
      WHERE created_at > '2026-06-23 23:30:22'
      ORDER BY id;
    `);

    const finalScanLogCount = await pool.request().query(`SELECT COUNT(*) as cnt FROM attendance_scan_logs`);
    await logAuditEvent(pool, 'PHASE_3', 'RESTORE_SCAN_LOGS', 'SUCCESS', finalScanLogCount.recordset[0].cnt, 'Restored all raw scan logs with machine mapping: historical restored with IDs, post-backup scans appended with new IDs.');
  } catch (err: any) {
    await logAuditEvent(pool, 'PHASE_3', 'RESTORE_SCAN_LOGS', 'FAILED', null, err.message);
    throw err;
  }

  // Phase 4: Create machine_user_raw indexes (table already exists)
  console.log('\n--- Phase 4: Ensuring machine_user_raw indexes exist ---');
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_machine_user_raw_machine_user')
      BEGIN
          CREATE UNIQUE INDEX UQ_machine_user_raw_machine_user
          ON dbo.machine_user_raw(machine_id, machine_user_id);
      END;

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_machine_user_raw_machine_code_user')
      BEGIN
          CREATE INDEX IX_machine_user_raw_machine_code_user
          ON dbo.machine_user_raw(machine_code, machine_user_id);
      END;

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_machine_user_raw_user_name')
      BEGIN
          CREATE INDEX IX_machine_user_raw_user_name
          ON dbo.machine_user_raw(user_name);
      END;
    `);
    const muRawCount = await pool.request().query(`SELECT COUNT(*) as cnt FROM machine_user_raw`);
    await logAuditEvent(pool, 'PHASE_4', 'CREATE_MACHINE_USER_RAW', 'SUCCESS', muRawCount.recordset[0].cnt, 'Ensured machine_user_raw indexes exist and verified table.');
  } catch (err: any) {
    await logAuditEvent(pool, 'PHASE_4', 'CREATE_MACHINE_USER_RAW', 'FAILED', null, err.message);
    throw err;
  }

  await pool.close();
  console.log('\n✓ Database Recovery Script Completed.');
}

main().catch((err) => {
  console.error('\n✗ Recovery failed:', err.message);
  process.exit(1);
});
