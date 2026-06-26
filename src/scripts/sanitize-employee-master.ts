/**
 * SANITATION SCRIPT: Clean contaminated employee data
 *
 * IMPORTANT: This script will DELETE contaminated employee records
 * ONLY keep VALID_STANDARD_FORMAT employees
 */

import { query, execute } from '../lib/db';

async function sanitizeContaminatedEmployees() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     SANITATION: CLEAN CONTAMINATED EMPLOYEE DATA          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // ============================================
    // STEP 1: AUDIT
    // ============================================
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 1: AUDIT - Current data distribution                 │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const audit = await query<{ status: string; cnt: number }>(`
      SELECT
        ISNULL(data_quality_status, 'NULL_STATUS') as status,
        COUNT(*) as cnt
      FROM employees
      GROUP BY ISNULL(data_quality_status, 'NULL_STATUS')
      ORDER BY cnt DESC
    `);

    console.log('\n📊 DATA DISTRIBUTION BEFORE SANITATION:');
    for (const row of audit) {
      const icon = row.status === 'VALID_STANDARD_FORMAT' ? '✅' : '❌';
      console.log(`  ${icon} ${row.status}: ${row.cnt}`);
    }

    const validCount = audit.find(a => a.status === 'VALID_STANDARD_FORMAT')?.cnt || 0;
    const contaminatedCount = audit
      .filter(a => a.status !== 'VALID_STANDARD_FORMAT')
      .reduce((sum, a) => sum + a.cnt, 0);

    console.log(`\n✅ Valid employees to KEEP: ${validCount}`);
    console.log(`❌ Contaminated employees to DELETE: ${contaminatedCount}`);

    if (contaminatedCount === 0) {
      console.log('\n✨ No contaminated data found - database is clean!');
      return;
    }

    // ============================================
    // STEP 2: Create archive table
    // ============================================
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 2: Create archive table                              │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Drop if exists and recreate properly
    await execute(`IF OBJECT_ID('dbo.employees_contaminated_archive', 'U') IS NOT NULL DROP TABLE dbo.employees_contaminated_archive`);

    // Create with explicit column list
    await execute(`
      CREATE TABLE dbo.employees_contaminated_archive (
        archive_id BIGINT IDENTITY(1,1) PRIMARY KEY,
        id INT NOT NULL,
        employee_code NVARCHAR(30),
        employee_name NVARCHAR(200),
        division_id INT,
        gang_id INT,
        employment_status NVARCHAR(20),
        is_active BIT,
        created_at DATETIME2,
        updated_at DATETIME2,
        zkteco_user_id NVARCHAR(100),
        nik NVARCHAR(30),
        hr_employee_code NVARCHAR(50),
        hr_loc_code NVARCHAR(20),
        hr_status NVARCHAR(20),
        hr_verified BIT,
        hr_verified_at DATETIME2,
        data_quality_status NVARCHAR(30),
        data_quality_reason NVARCHAR(500),
        is_raw_id BIT,
        archived_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        archive_reason NVARCHAR(500)
      )
    `);
    console.log('✅ Created employees_contaminated_archive table');

    // ============================================
    // STEP 3: Archive contaminated employees
    // ============================================
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 3: Archive contaminated employees                      │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // First mark all contaminated as inactive
    await execute(`
      UPDATE employees
      SET is_active = 0,
          employment_status = 'INACTIVE',
          updated_at = SYSUTCDATETIME()
      WHERE data_quality_status != 'VALID_STANDARD_FORMAT'
         OR data_quality_status IS NULL
    `);
    console.log('✅ Marked contaminated employees as inactive');

    // Archive to separate table
    await execute(`
      INSERT INTO employees_contaminated_archive (
        id, employee_code, employee_name, division_id, gang_id,
        employment_status, is_active, created_at, updated_at,
        zkteco_user_id, nik, hr_employee_code, hr_loc_code, hr_status,
        hr_verified, hr_verified_at, data_quality_status, data_quality_reason,
        is_raw_id, archive_reason
      )
      SELECT
        id, employee_code, employee_name, division_id, gang_id,
        employment_status, is_active, created_at, updated_at,
        zkteco_user_id, nik, hr_employee_code, hr_loc_code, hr_status,
        hr_verified, hr_verified_at, data_quality_status, data_quality_reason,
        is_raw_id,
        'CONTAMINATED_RAW_ID_' + ISNULL(data_quality_status, 'NULL_STATUS')
      FROM employees
      WHERE data_quality_status != 'VALID_STANDARD_FORMAT'
         OR data_quality_status IS NULL
    `);

    const archivedCount = await query<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM employees_contaminated_archive`);
    console.log(`✅ Archived ${archivedCount[0]?.cnt || 0} contaminated employees`);

    // ============================================
    // STEP 4: Soft delete contaminated employees
    // (Cannot hard delete due to FK constraints)
    // ============================================
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 4: Soft delete contaminated employees                    │');
    console.log('│ (FK constraints exist - using soft delete)                   │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Already marked as inactive in Step 3, just archive them
    const remainingCount = await query<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM employees`);
    console.log(`ℹ️  Total employees after archive: ${remainingCount[0]?.cnt || 0}`);

    console.log(`\n📌 Note: FK constraints prevent hard delete.`);
    console.log(`📌 Contaminated employees are marked as inactive.`);
    console.log(`📌 They remain in database but won't appear in active queries.`);

    // ============================================
    // STEP 5: Clean enrollments
    // ============================================
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 5: Clean orphaned enrollments                        │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // Delete enrollments for employees that no longer exist
    const deleteOrphaned = await query<{ cnt: number }>(`
      DELETE FROM employee_machine_enrollments
      WHERE employee_id NOT IN (SELECT id FROM employees)
    `);
    console.log(`✅ Deleted orphaned enrollments`);

    // ============================================
    // STEP 6: Verification
    // ============================================
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 6: Verification                                     │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const finalAudit = await query<{ status: string; cnt: number }>(`
      SELECT
        ISNULL(data_quality_status, 'NULL_STATUS') as status,
        COUNT(*) as cnt
      FROM employees
      GROUP BY ISNULL(data_quality_status, 'NULL_STATUS')
      ORDER BY cnt DESC
    `);

    console.log('\n📊 DATA DISTRIBUTION AFTER SANITATION:');
    for (const row of finalAudit) {
      console.log(`  ✅ ${row.status}: ${row.cnt}`);
    }

    const stats = await query<{
      total: number;
      valid: number;
      active: number;
      inactive: number;
      with_nik: number;
      archived: number;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM employees) as total,
        (SELECT COUNT(*) FROM employees WHERE data_quality_status = 'VALID_STANDARD_FORMAT') as valid,
        (SELECT COUNT(*) FROM employees WHERE is_active = 1) as active,
        (SELECT COUNT(*) FROM employees WHERE is_active = 0) as inactive,
        (SELECT COUNT(*) FROM employees WHERE nik IS NOT NULL AND nik != '') as with_nik,
        (SELECT COUNT(*) FROM employees_contaminated_archive) as archived
    `);

    console.log('\n📊 FINAL STATISTICS:');
    console.log(`  Total employees in table: ${stats[0]?.total || 0}`);
    console.log(`  Valid (VALID_STANDARD_FORMAT): ${stats[0]?.valid || 0}`);
    console.log(`  Active: ${stats[0]?.active || 0}`);
    console.log(`  Inactive (archived): ${stats[0]?.inactive || 0}`);
    console.log(`  With NIK: ${stats[0]?.with_nik || 0}`);
    console.log(`  Archived (soft-deleted): ${stats[0]?.archived || 0}`);

    // ============================================
    // STEP 7: Refresh view
    // ============================================
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 7: Refresh vw_employee_master_clean view               │');
    console.log('└─────────────────────────────────────────────────────────────┘');

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
      LEFT JOIN dbo.employee_machine_enrollments eme ON eme.employee_id = e.id AND eme.is_active = 1
      LEFT JOIN divisions d ON d.id = e.division_id
      GROUP BY
        e.id, e.employee_code, e.employee_name, e.nik,
        e.hr_loc_code, e.hr_status, e.hr_verified,
        e.is_active, e.is_raw_id, e.data_quality_status,
        e.data_quality_reason, d.division_code
    `);
    console.log('✅ View vw_employee_master_clean refreshed');

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║               ✅ SANITATION COMPLETED                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('\n❌ Sanitation failed:', (error as Error).message);
    throw error;
  }
}

sanitizeContaminatedEmployees()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
