/**
 * Run specific migrations for Employee Master Refactor
 */
const { query, execute, sql } = require('../lib/db');

async function runMigrations() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     EXECUTING EMPLOYEE MASTER REFACTOR MIGRATIONS        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ============================================
  // MIGRATION 042: Add NIK and HR fields
  // ============================================
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│ MIGRATION 042: Add NIK and HR fields to employees         │');
  console.log('└─────────────────────────────────────────────────────────────┘');

  try {
    // Step 1: Backup
    console.log('\nStep 1: Creating backup...');
    await execute(`
      IF OBJECT_ID('dbo.employees_backup_20260623', 'U') IS NOT NULL DROP TABLE dbo.employees_backup_20260623;
      SELECT * INTO dbo.employees_backup_20260623 FROM dbo.employees;
    `);
    console.log('✓ Backup created: employees_backup_20260623');

    // Step 2: Add columns
    console.log('\nStep 2: Adding new columns...');
    const columnsToAdd = [
      { name: 'nik', sql: 'nik NVARCHAR(30) NULL' },
      { name: 'hr_employee_code', sql: 'hr_employee_code NVARCHAR(50) NULL' },
      { name: 'hr_loc_code', sql: 'hr_loc_code NVARCHAR(20) NULL' },
      { name: 'hr_status', sql: 'hr_status NVARCHAR(20) NULL' },
      { name: 'hr_verified', sql: 'hr_verified BIT NOT NULL DEFAULT 0' },
      { name: 'hr_verified_at', sql: 'hr_verified_at DATETIME2 NULL' },
      { name: 'data_quality_status', sql: 'data_quality_status NVARCHAR(30) NULL' },
      { name: 'data_quality_reason', sql: 'data_quality_reason NVARCHAR(500) NULL' },
      { name: 'is_raw_id', sql: 'is_raw_id BIT NOT NULL DEFAULT 0' },
    ];

    for (const col of columnsToAdd) {
      const exists = await query(`
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'employees' AND COLUMN_NAME = '${col.name}'
      `);
      if (exists.length === 0) {
        await execute(`ALTER TABLE dbo.employees ADD ${col.sql}`);
        console.log(`  ✓ Added: ${col.name}`);
      } else {
        console.log(`  ○ Already exists: ${col.name}`);
      }
    }

    // Step 3: Sync NIK from db_ptrj
    console.log('\nStep 3: Syncing NIK from db_ptrj...');
    const syncResult = await query(`
      UPDATE employees
      SET
        nik = LTRIM(RTRIM(REPLACE(hr.NewICNo, ' ', ''))),
        hr_employee_code = LTRIM(RTRIM(hr.EmpCode)),
        hr_loc_code = LTRIM(RTRIM(hr.LocCode)),
        hr_status = LTRIM(RTRIM(hr.Status)),
        hr_verified = 1,
        hr_verified_at = SYSUTCDATETIME()
      OUTPUT inserted.employee_code
      FROM dbo.employees e
      INNER JOIN [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE hr
        ON LTRIM(RTRIM(e.employee_code)) = LTRIM(RTRIM(hr.EmpCode));
    `);
    console.log(`  ✓ Synced NIK for ${syncResult.length} employees`);

    // Step 4: Mark raw ID employees
    console.log('\nStep 4: Marking raw ID employees...');

    // Short raw IDs (5 digits)
    const shortRawResult = await query(`
      UPDATE employees
      SET is_raw_id = 1, data_quality_status = 'RAW_ID_SHORT',
          data_quality_reason = 'Short raw ID (5 digits) - should be EXCLUDED from auto-mapping per SSOT rules'
      OUTPUT inserted.employee_code
      WHERE employee_code LIKE '%[0-9]%'
        AND LEN(employee_code) = 5
        AND employee_code NOT LIKE '%[A-Z]%'
        AND data_quality_status IS NULL
    `);
    console.log(`  ✓ Marked ${shortRawResult.length} short raw ID employees`);

    // Long raw IDs (6+ digits)
    const longRawResult = await query(`
      UPDATE employees
      SET is_raw_id = 1, data_quality_status = 'RAW_ID_LONG',
          data_quality_reason = 'Long raw ID (6+ digits) - needs direct lookup or exclusion'
      OUTPUT inserted.employee_code
      WHERE employee_code LIKE '%[0-9]%'
        AND LEN(employee_code) >= 6
        AND employee_code NOT LIKE '%[A-Z]%'
        AND data_quality_status IS NULL
    `);
    console.log(`  ✓ Marked ${longRawResult.length} long raw ID employees`);

    // Step 5: Create indexes
    console.log('\nStep 5: Creating indexes...');
    const indexes = [
      { name: 'IX_employees_nik', sql: 'CREATE INDEX IX_employees_nik ON dbo.employees(nik) WHERE nik IS NOT NULL' },
      { name: 'IX_employees_hr_verified', sql: 'CREATE INDEX IX_employees_hr_verified ON dbo.employees(hr_verified, is_active)' },
      { name: 'IX_employees_is_raw_id', sql: 'CREATE INDEX IX_employees_is_raw_id ON dbo.employees(is_raw_id) WHERE is_raw_id = 1' },
    ];

    for (const idx of indexes) {
      const exists = await query(`
        SELECT 1 FROM sys.indexes WHERE name = '${idx.name}' AND object_id = OBJECT_ID('employees')
      `);
      if (exists.length === 0) {
        await execute(idx.sql);
        console.log(`  ✓ Created index: ${idx.name}`);
      } else {
        console.log(`  ○ Already exists: ${idx.name}`);
      }
    }

    // Step 6: Create audit table
    console.log('\nStep 6: Creating employee_hr_sync_audit table...');
    const auditTableExists = await query(`
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'employee_hr_sync_audit'
    `);

    if (auditTableExists.length === 0) {
      await execute(`
        CREATE TABLE dbo.employee_hr_sync_audit (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          sync_batch_id NVARCHAR(100) NOT NULL,
          employee_code NVARCHAR(30) NOT NULL,
          action_type NVARCHAR(30) NOT NULL,
          old_value NVARCHAR(MAX) NULL,
          new_value NVARCHAR(MAX) NULL,
          sync_status NVARCHAR(30) NOT NULL,
          sync_reason NVARCHAR(500) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_employee_hr_sync_audit_batch ON dbo.employee_hr_sync_audit(sync_batch_id);
        CREATE INDEX IX_employee_hr_sync_audit_code ON dbo.employee_hr_sync_audit(employee_code);
      `);
      console.log('  ✓ Created table: employee_hr_sync_audit');
    } else {
      console.log('  ○ Already exists: employee_hr_sync_audit');
    }

    console.log('\n✅ Migration 042 completed successfully!');
  } catch (err: unknown) {
    console.error('\n❌ Migration 042 failed:', (err as Error).message);
    return;
  }

  // ============================================
  // MIGRATION 043: Create employee_machine_enrollments
  // ============================================
  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│ MIGRATION 043: Create employee_machine_enrollments           │');
  console.log('└─────────────────────────────────────────────────────────────┘');

  try {
    // Backup existing mapping tables
    console.log('\nStep 1: Creating backups...');
    await execute(`
      IF OBJECT_ID('dbo.zkteco_hr_employee_map_backup_20260623', 'U') IS NOT NULL DROP TABLE dbo.zkteco_hr_employee_map_backup_20260623;
      SELECT * INTO dbo.zkteco_hr_employee_map_backup_20260623 FROM dbo.zkteco_hr_employee_map;
    `);
    console.log('  ✓ Backup created: zkteco_hr_employee_map_backup_20260623');

    // Create table
    console.log('\nStep 2: Creating employee_machine_enrollments table...');
    const tableExists = await query(`
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'employee_machine_enrollments'
    `);

    if (tableExists.length === 0) {
      await execute(`
        CREATE TABLE dbo.employee_machine_enrollments (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          employee_id INT NOT NULL,
          employee_code NVARCHAR(30) NOT NULL,
          machine_id INT NULL,
          machine_code NVARCHAR(30) NOT NULL,
          raw_device_user_id NVARCHAR(100) NOT NULL,
          zkteco_user_name NVARCHAR(200) NULL,
          parsed_employee_code NVARCHAR(30) NULL,
          scanner_prefix NVARCHAR(3) NULL,
          loc_code NVARCHAR(20) NULL,
          mapping_status NVARCHAR(30) NOT NULL DEFAULT 'MAPPED',
          mapping_confidence NVARCHAR(30) NULL,
          mapping_reason NVARCHAR(500) NULL,
          name_similarity_score DECIMAL(6,4) NULL,
          is_primary_machine BIT NOT NULL DEFAULT 0,
          is_active BIT NOT NULL DEFAULT 1,
          first_seen_at DATETIME2 NULL,
          last_seen_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NULL,
          CONSTRAINT FK_employee_machine_enrollments_employee
            FOREIGN KEY (employee_id) REFERENCES dbo.employees(id)
        );
      `);
      console.log('  ✓ Created table: employee_machine_enrollments');

      // Create indexes
      console.log('\nStep 3: Creating indexes...');
      await execute(`
        CREATE UNIQUE INDEX UX_employee_machine_raw
        ON dbo.employee_machine_enrollments(machine_code, raw_device_user_id)
        WHERE is_active = 1;

        CREATE INDEX IX_employee_machine_employee
        ON dbo.employee_machine_enrollments(employee_id, is_active);

        CREATE INDEX IX_employee_machine_code
        ON dbo.employee_machine_enrollments(employee_code, machine_code);

        CREATE INDEX IX_employee_machine_raw_id
        ON dbo.employee_machine_enrollments(raw_device_user_id);
      `);
      console.log('  ✓ Created indexes');
    } else {
      console.log('  ○ Already exists: employee_machine_enrollments');
    }

    // Create view
    console.log('\nStep 4: Creating vw_employee_master_clean view...');
    await execute(`IF OBJECT_ID('dbo.vw_employee_master_clean', 'V') IS NOT NULL DROP VIEW dbo.vw_employee_master_clean`);
    await execute(`
      CREATE VIEW dbo.vw_employee_master_clean AS
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.employee_name,
        e.nik,
        e.hr_loc_code,
        e.hr_status,
        e.hr_verified,
        e.is_active,
        e.is_raw_id,
        e.data_quality_status,
        e.data_quality_reason,
        d.division_code,
        STRING_AGG(CAST(eme.machine_code AS NVARCHAR(MAX)), ',') WITHIN GROUP (ORDER BY eme.machine_code) AS machine_codes,
        COUNT(DISTINCT eme.machine_code) AS machine_count,
        MIN(eme.first_seen_at) AS first_seen_at,
        MAX(eme.last_seen_at) AS last_seen_at
      FROM dbo.employees e
      LEFT JOIN dbo.employee_machine_enrollments eme
        ON eme.employee_id = e.id AND eme.is_active = 1
      LEFT JOIN divisions d ON d.id = e.division_id
      GROUP BY
        e.id, e.employee_code, e.employee_name, e.nik,
        e.hr_loc_code, e.hr_status, e.hr_verified,
        e.is_active, e.is_raw_id, e.data_quality_status,
        e.data_quality_reason, d.division_code;
    `);
    console.log('  ✓ Created view: vw_employee_master_clean');

    // Add employee_id to attendance_scan_logs
    console.log('\nStep 5: Adding employee_id to attendance_scan_logs...');
    const colExists = await query(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'attendance_scan_logs' AND COLUMN_NAME = 'employee_id'
    `);

    if (colExists.length === 0) {
      await execute(`ALTER TABLE dbo.attendance_scan_logs ADD employee_id INT NULL`);
      await execute(`CREATE INDEX IX_scan_logs_employee_date ON dbo.attendance_scan_logs(employee_id, scan_date)`);
      console.log('  ✓ Added employee_id to attendance_scan_logs');
    } else {
      console.log('  ○ Already exists: employee_id in attendance_scan_logs');
    }

    console.log('\n✅ Migration 043 completed successfully!');
  } catch (err: unknown) {
    console.error('\n❌ Migration 043 failed:', (err as Error).message);
    return;
  }

  // ============================================
  // MIGRATION 044: Backfill enrollments
  // ============================================
  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│ MIGRATION 044: Backfill employee_machine_enrollments       │');
  console.log('└─────────────────────────────────────────────────────────────┘');

  try {
    console.log('\nStep 1: Backfilling from zkteco_hr_employee_map...');
    const backfillResult = await query(`
      INSERT INTO dbo.employee_machine_enrollments (
        employee_id, employee_code, machine_id, machine_code,
        raw_device_user_id, zkteco_user_name, mapping_status,
        mapping_confidence, mapping_reason, is_primary_machine,
        is_active, first_seen_at, last_seen_at, created_at, updated_at
      )
      OUTPUT inserted.id
      SELECT
        e.id,
        e.employee_code,
        m.id,
        zm.machine_code,
        zm.zkteco_user_id,
        zm.zkteco_user_name,
        CASE
          WHEN zm.match_confidence = 'EXACT' THEN 'MAPPED'
          WHEN zm.match_confidence = 'STRONG' THEN 'MAPPED'
          WHEN zm.match_confidence = 'WEAK' THEN 'NEED_REVIEW'
          WHEN zm.match_confidence = 'NONE' THEN 'UNMAPPED'
          ELSE zm.match_confidence
        END,
        zm.match_confidence,
        zm.match_method + ' mapping from legacy',
        1,
        zm.is_active,
        zm.created_at,
        zm.updated_at,
        zm.created_at,
        zm.updated_at
      FROM dbo.zkteco_hr_employee_map zm
      INNER JOIN dbo.employees e ON e.employee_code = zm.hr_employee_code
      LEFT JOIN dbo.attendance_machines m ON m.machine_code = zm.machine_code
      WHERE zm.hr_employee_code IS NOT NULL
        AND zm.hr_employee_code != ''
        AND zm.is_active = 1
        AND e.id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM dbo.employee_machine_enrollments eme2
          WHERE eme2.employee_id = e.id
            AND eme2.machine_code = zm.machine_code
            AND eme2.raw_device_user_id = zm.zkteco_user_id
        );
    `);
    console.log(`  ✓ Backfilled ${backfillResult.length} enrollments`);

    console.log('\nStep 2: Marking primary machines...');
    await execute(`
      WITH PrimaryMachines AS (
        SELECT employee_id, machine_code,
          ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY COUNT(*) DESC, MAX(last_seen_at) DESC) as rn
        FROM dbo.employee_machine_enrollments
        WHERE is_active = 1
        GROUP BY employee_id, machine_code
      )
      UPDATE eme
      SET is_primary_machine = 1
      FROM dbo.employee_machine_enrollments eme
      INNER JOIN PrimaryMachines pm ON pm.employee_id = eme.employee_id AND pm.machine_code = eme.machine_code
      WHERE pm.rn = 1;
    `);
    console.log('  ✓ Primary machines marked');

    console.log('\nStep 3: Backfilling employee_id to attendance_scan_logs...');
    const scanResult = await query(`
      UPDATE s
      SET s.employee_id = e.id
      OUTPUT inserted.id
      FROM dbo.attendance_scan_logs s
      INNER JOIN dbo.employees e ON e.employee_code = s.parsed_employee_code
      WHERE s.employee_id IS NULL
        AND s.mapping_status = 'MAPPED'
        AND e.id IS NOT NULL;
    `);
    console.log(`  ✓ Linked ${scanResult.length} scan logs to employee_id`);

    console.log('\n✅ Migration 044 completed successfully!');
  } catch (err: unknown) {
    console.error('\n❌ Migration 044 failed:', (err as Error).message);
    return;
  }

  // ============================================
  // MIGRATION 045: Clean invalid employee codes
  // ============================================
  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│ MIGRATION 045: Clean invalid employee codes                │');
  console.log('└─────────────────────────────────────────────────────────────┘');

  try {
    console.log('\nStep 1: Handling IJL format (0xxxxxx -> Lxxxx)...');
    // First, check how many would conflict
    const conflicts = await query(`
      SELECT COUNT(*) as cnt FROM employees e1
      WHERE e1.employee_code LIKE '0%'
        AND LEN(e1.employee_code) = 7
        AND EXISTS (
          SELECT 1 FROM employees e2
          WHERE e2.employee_code = 'L' + RIGHT(e1.employee_code, 4)
        )
    `);
    console.log(`  ℹ Found ${conflicts[0]?.cnt || 0} IJL records that would conflict with existing employees`);
    console.log(`  ℹ These will be marked as RAW_ID_IJL_DUPLICATE instead of normalized`);

    // Update non-conflicting IJL records
    const ijlResult = await query(`
      UPDATE employees
      SET employee_code = 'L' + RIGHT(employee_code, 4),
          data_quality_status = 'NORMALIZED_IJL_FORMAT',
          data_quality_reason = 'Converted from IJL raw format to standard format'
      OUTPUT inserted.employee_code
      WHERE employee_code LIKE '0%'
        AND LEN(employee_code) = 7
        AND employee_code NOT LIKE '%[A-Z]%'
        AND 'L' + RIGHT(employee_code, 4) NOT IN (
          SELECT employee_code FROM employees WHERE employee_code LIKE '[A-Z]%'
        )
    `);
    console.log(`  ✓ Normalized ${ijlResult.length} IJL format employees (non-conflicting)`);

    // Mark conflicting IJL records as duplicates
    const duplicateResult = await query(`
      UPDATE employees
      SET data_quality_status = 'RAW_ID_IJL_CONFLICT',
          data_quality_reason = 'IJL raw ID conflicts with existing employee code after normalization'
      OUTPUT inserted.employee_code
      WHERE employee_code LIKE '0%'
        AND LEN(employee_code) = 7
        AND employee_code NOT LIKE '%[A-Z]%'
        AND data_quality_status IS NULL
    `);
    console.log(`  ✓ Marked ${duplicateResult.length} conflicting IJL records`);

    console.log('\nStep 2: Marking standard format employees as VALID...');
    const validResult = await query(`
      UPDATE employees
      SET data_quality_status = 'VALID_STANDARD_FORMAT',
          data_quality_reason = 'Standard employee code format [A-Z][0-9]{4}'
      OUTPUT inserted.employee_code
      WHERE employee_code LIKE '%[A-Z]%'
        AND LEN(employee_code) = 5
        AND data_quality_status IS NULL
        AND is_raw_id = 0
    `);
    console.log(`  ✓ Marked ${validResult.length} standard format employees as VALID`);

    console.log('\n✅ Migration 045 completed successfully!');
  } catch (err: unknown) {
    console.error('\n❌ Migration 045 failed:', (err as Error).message);
    return;
  }

  // ============================================
  // FINAL VERIFICATION
  // ============================================
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL VERIFICATION                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    const stats = await query(`
      SELECT
        (SELECT COUNT(*) FROM employees) as total_employees,
        (SELECT COUNT(*) FROM employees WHERE hr_verified = 1) as hr_verified,
        (SELECT COUNT(*) FROM employees WHERE nik IS NOT NULL AND nik != '') as has_nik,
        (SELECT COUNT(*) FROM employees WHERE data_quality_status = 'VALID_STANDARD_FORMAT') as valid_format,
        (SELECT COUNT(*) FROM employees WHERE data_quality_status = 'RAW_ID_SHORT') as short_raw_id,
        (SELECT COUNT(*) FROM employees WHERE data_quality_status = 'RAW_ID_LONG') as long_raw_id,
        (SELECT COUNT(*) FROM employee_machine_enrollments) as total_enrollments,
        (SELECT COUNT(DISTINCT employee_id) FROM employee_machine_enrollments) as employees_with_enrollments,
        (SELECT COUNT(*) FROM attendance_scan_logs WHERE employee_id IS NOT NULL) as scan_logs_linked;
    `);

    console.log('\n📊 EMPLOYEE MASTER STATS:');
    console.log(JSON.stringify(stats[0], null, 2));

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║               ✅ ALL MIGRATIONS COMPLETED                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
  } catch (err: unknown) {
    console.error('\n❌ Verification failed:', (err as Error).message);
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
