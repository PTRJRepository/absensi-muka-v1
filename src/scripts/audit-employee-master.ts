/**
 * Audit Script untuk PRD: Refactor Master Employee
 * Menjalankan audit database sebelum migrasi
 */

import { query as dbQuery, sql } from '../lib/db';

async function runAudit() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     AUDIT DATABASE SEBELUM REFACTOR EMPLOYEE MASTER         ║');
  console.log('║     Tanggal: ' + new Date().toISOString() + '                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Schema Audit - employees table
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 1. SCHEMA: employees                                        │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    const employeeSchema = await dbQuery(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'employees'
      ORDER BY ORDINAL_POSITION
    `);
    console.log(JSON.stringify(employeeSchema, null, 2));

    // 2. Employee Stats
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 2. EMPLOYEE STATS                                           │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    const employeeStats = await dbQuery(`
      SELECT
        COUNT(*) as total_employees,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive_count,
        SUM(CASE WHEN zkteco_user_id IS NOT NULL THEN 1 ELSE 0 END) as has_zkteco_user_id
      FROM employees
    `);
    console.log(JSON.stringify(employeeStats, null, 2));

    // 3. Employee Code Format Distribution
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 3. EMPLOYEE CODE FORMAT DISTRIBUTION                        │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    const codeDist = await dbQuery(`
      SELECT
        LEFT(employee_code, 1) as first_char,
        LEN(employee_code) as code_length,
        COUNT(*) as count
      FROM employees
      GROUP BY LEFT(employee_code, 1), LEN(employee_code)
      ORDER BY first_char, code_length
    `);
    console.log(JSON.stringify(codeDist, null, 2));

    // 4. Duplicate Employee Codes
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 4. DUPLICATE EMPLOYEE CODES                                 │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    const duplicates = await dbQuery(`
      SELECT employee_code, COUNT(*) as duplicate_count
      FROM employees
      WHERE employee_code IS NOT NULL AND employee_code != ''
      GROUP BY employee_code
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
    `);
    console.log('Duplicate count:', duplicates.length);
    console.log(JSON.stringify(duplicates.slice(0, 10), null, 2));

    // 5. Check available tables for employee-machine mapping
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 5. AVAILABLE MAPPING TABLES                                  │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    const mappingTables = await dbQuery(`
      SELECT TABLE_NAME, TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE '%map%' OR TABLE_NAME LIKE '%enrollment%' OR TABLE_NAME LIKE '%zkteco%'
      ORDER BY TABLE_NAME
    `);
    console.log(JSON.stringify(mappingTables, null, 2));

    // Check zkteco_absensi_user_registry
    const zktecoRegistrySchema = await dbQuery(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'zkteco_absensi_user_registry'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('\nzkteco_absensi_user_registry schema:', JSON.stringify(zktecoRegistrySchema, null, 2));

    const zktecoRegistryStats = await dbQuery(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT raw_device_user_id) as unique_raw_ids,
        SUM(CASE WHEN hr_employee_code IS NULL THEN 1 ELSE 0 END) as unmapped
      FROM zkteco_absensi_user_registry
    `);
    console.log('zkteco_absensi_user_registry stats:', JSON.stringify(zktecoRegistryStats, null, 2));

    // Check zkteco_hr_employee_map
    const zktecoMapSchema = await dbQuery(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'zkteco_hr_employee_map'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('\nzkteco_hr_employee_map schema:', JSON.stringify(zktecoMapSchema, null, 2));

    const zktecoMapStats = await dbQuery(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT machine_code) as unique_machines,
        COUNT(DISTINCT zkteco_user_id) as unique_user_ids
      FROM zkteco_hr_employee_map
    `);
    console.log('zkteco_hr_employee_map stats:', JSON.stringify(zktecoMapStats, null, 2));

    // 6. Scan Logs Stats
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 6. ATTENDANCE_SCAN_LOGS STATS                               │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    const scanStats = await dbQuery(`
      SELECT
        COUNT(*) as total_scan_logs,
        SUM(CASE WHEN employee_id IS NULL THEN 1 ELSE 0 END) as without_employee_id,
        SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) as mapped_count,
        SUM(CASE WHEN mapping_status = 'UNMAPPED' THEN 1 ELSE 0 END) as unmapped_count,
        SUM(CASE WHEN mapping_status = 'NEED_REVIEW' THEN 1 ELSE 0 END) as need_review_count,
        COUNT(DISTINCT raw_device_user_id) as unique_raw_ids
      FROM attendance_scan_logs
    `);
    console.log(JSON.stringify(scanStats, null, 2));

    // 7. Check attendance_imports
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 7. ATTENDANCE_IMPORTS STATS                                 │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    const importStats = await dbQuery(`
      SELECT TOP 1
        COUNT(*) as total_imports,
        SUM(CASE WHEN employee_id IS NULL THEN 1 ELSE 0 END) as without_employee_id
      FROM attendance_imports
    `);
    console.log(JSON.stringify(importStats, null, 2));

    // 8. Sample employees - all
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 8. SAMPLE EMPLOYEES (no nik column yet)                     │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    const sampleEmployees = await dbQuery(`
      SELECT TOP 10 employee_code, employee_name, is_active, zkteco_user_id
      FROM employees
      ORDER BY employee_code
    `);
    console.log(JSON.stringify(sampleEmployees, null, 2));

    // 9. Check db_ptrj structure for NIK
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 9. DB_PTRJ SCHEMA - NIK SEARCH                               │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    try {
      const dbPtrjSchema = await dbQuery(`
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
        FROM [DESKTOP-U5GUJPG].DB_PTRJ.INFORMATION_SCHEMA.COLUMNS
        WHERE COLUMN_NAME LIKE '%NIK%' OR COLUMN_NAME LIKE '%KTP%' OR COLUMN_NAME LIKE '%IDENT%'
        ORDER BY TABLE_NAME, COLUMN_NAME
      `);
      console.log(JSON.stringify(dbPtrjSchema, null, 2));
    } catch (e: unknown) {
      console.log('Error querying db_ptrj:', (e as Error).message);
    }

    // 10. Sample HR_EMPLOYEE from db_ptrj
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ 10. DB_PTRJ.HR_EMPLOYEE SAMPLE                              │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    try {
      const hrSample = await dbQuery(`
        SELECT TOP 10 *
        FROM [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE
      `);
      console.log('Columns:', Object.keys(hrSample[0] || {}).join(', '));
      console.log('Sample:', JSON.stringify(hrSample, null, 2));
    } catch (e: unknown) {
      console.log('Error querying HR_EMPLOYEE:', (e as Error).message);
    }

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    AUDIT COMPLETED                           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
  } catch (error: unknown) {
    console.error('Audit Error:', (error as Error).message);
  }
}

runAudit().then(() => process.exit(0));
