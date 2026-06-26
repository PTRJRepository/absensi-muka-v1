/**
 * LINK SCAN LOGS TO EMPLOYEES
 * Links MAPPED scan logs to their corresponding employees
 * Handles both active employees and resign employees
 */

import { query, execute } from '../lib/db';

async function linkScanLogs() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        LINKING SCAN LOGS TO EMPLOYEES                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // STEP 1: Current status
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 1: Current Status                                    │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const before = await query<any>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN employee_id IS NOT NULL THEN 1 ELSE 0 END) as linked,
        SUM(CASE WHEN employee_id IS NULL THEN 1 ELSE 0 END) as unlinked
      FROM attendance_scan_logs
    `);

    console.log(`\n📊 Before linking:`);
    console.log(`  Total scan logs: ${before[0].total.toLocaleString()}`);
    console.log(`  Already linked: ${before[0].linked.toLocaleString()}`);
    console.log(`  Unlinked: ${before[0].unlinked.toLocaleString()}`);

    // STEP 2: Link MAPPED entries to employees
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 2: Link MAPPED entries                               │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    // First, check how many can be linked
    const mappable = await query<any>(`
      SELECT COUNT(DISTINCT s.parsed_employee_code) as cnt
      FROM attendance_scan_logs s
      INNER JOIN employees e ON e.employee_code = s.parsed_employee_code
      WHERE s.employee_id IS NULL
        AND s.mapping_status = 'MAPPED'
    `);
    console.log(`\n📊 Entries that CAN be linked (MAPPED + employee exists): ${mappable[0].cnt}`);

    // Do the linking
    const linkResult = await execute(`
      UPDATE s
      SET s.employee_id = e.id
      FROM attendance_scan_logs s
      INNER JOIN employees e ON e.employee_code = s.parsed_employee_code
      WHERE s.employee_id IS NULL
        AND s.mapping_status = 'MAPPED'
    `);
    console.log(`✅ Linked MAPPED entries to employees`);

    // STEP 3: Check unmapped entries
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 3: Analyze UNMAPPED entries                          │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const unmapped = await query<any>(`
      SELECT COUNT(*) as cnt FROM attendance_scan_logs
      WHERE employee_id IS NULL
        AND mapping_status = 'UNMAPPED'
    `);
    console.log(`\n📊 UNMAPPED entries: ${unmapped[0].cnt.toLocaleString()}`);

    // Check if any unmapped are in HR with Status 4 (resign)
    const resignInHR = await query<any>(`
      SELECT COUNT(DISTINCT s.parsed_employee_code) as cnt
      FROM attendance_scan_logs s
      INNER JOIN [DESKTOP-U5GUJPG].DB_PTRJ.dbo.HR_EMPLOYEE hr
        ON RTRIM(hr.EmpCode) = s.parsed_employee_code
      WHERE s.employee_id IS NULL
        AND s.mapping_status = 'UNMAPPED'
        AND hr.Status = '4'
    `);
    console.log(`📊 UNMAPPED that exist in HR with Status 4 (resign): ${resignInHR[0].cnt}`);

    // STEP 4: Final verification
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ STEP 4: Verification                                     │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const after = await query<any>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN employee_id IS NOT NULL THEN 1 ELSE 0 END) as linked,
        SUM(CASE WHEN employee_id IS NULL THEN 1 ELSE 0 END) as unlinked
      FROM attendance_scan_logs
    `);

    console.log(`\n📊 After linking:`);
    console.log(`  Total scan logs: ${after[0].total.toLocaleString()}`);
    console.log(`  Linked: ${after[0].linked.toLocaleString()}`);
    console.log(`  Unlinked: ${after[0].unlinked.toLocaleString()}`);

    const increase = after[0].linked - before[0].linked;
    console.log(`\n✅ Newly linked: ${increase.toLocaleString()} records`);

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║               ✅ LINKING COMPLETED                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    throw error;
  }
}

linkScanLogs()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
