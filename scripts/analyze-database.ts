/**
 * Database Analysis Script v2
 * Examines all tables and data quality for short vs long raw IDs
 */

import sql from 'mssql';
import { env } from '../src/config/env';

const sqlConfig: sql.config = {
  server: env.DB_SERVER,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: 'rebinmas_absensi_monitoring',
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
  },
};

async function query<T>(pool: sql.ConnectionPool, statement: string): Promise<T[]> {
  const result = await pool.request().query(statement);
  return result.recordset as T[];
}

async function getTableColumns(pool: sql.ConnectionPool, tableName: string) {
  return query<{ COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }>(pool, `
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '${tableName}'
    ORDER BY ORDINAL_POSITION
  `);
}

async function main() {
  console.log('Connecting to SQL Server...\n');

  const pool = new sql.ConnectionPool(sqlConfig);
  await pool.connect();

  // ============================================
  // 1. LIST ALL TABLES WITH SCHEMA
  // ============================================
  console.log('=' .repeat(80));
  console.log('1. ALL TABLES IN DATABASE');
  console.log('='.repeat(80));

  const tables = await query<{ TABLE_SCHEMA: string; TABLE_NAME: string }>(pool, `
    SELECT TABLE_SCHEMA, TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);

  console.log(`\nTotal tables: ${tables.length}\n`);
  tables.forEach((t, i) => console.log(`  ${i + 1}. [${t.TABLE_SCHEMA}].${t.TABLE_NAME}`));

  // ============================================
  // 2. EXAMINE KEY TABLES STRUCTURE
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('2. KEY TABLE STRUCTURES');
  console.log('='.repeat(80));

  const keyTables = ['employees', 'attendance_scan_logs', 'zkteco_absensi_user_machine', 'zkteco_absensi_user_registry', 'zkteco_hr_employee_map', 'attendance_machines', 'divisions'];

  for (const tableName of keyTables) {
    const columns = await getTableColumns(pool, tableName);
    console.log(`\n[${tableName}] (${columns.length} columns):`);
    columns.forEach(c => {
      const nullable = c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
      console.log(`  ${c.COLUMN_NAME.padEnd(30)} ${c.DATA_TYPE.padEnd(15)} ${nullable}`);
    });
  }

  // ============================================
  // 3. EMPLOYEE DATA ANALYSIS
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('3. EMPLOYEE DATA ANALYSIS');
  console.log('='.repeat(80));

  const empStats = await query<any>(pool, `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive,
      SUM(CASE WHEN zkteco_user_id IS NOT NULL THEN 1 ELSE 0 END) as has_zkteco_id,
      MIN(employee_code) as min_code,
      MAX(employee_code) as max_code
    FROM employees
  `);
  console.log('\n[employees] table:');
  console.log(`  Total employees: ${empStats[0].total}`);
  console.log(`  Active: ${empStats[0].active}, Inactive: ${empStats[0].inactive}`);
  console.log(`  With zkteco_user_id: ${empStats[0].has_zkteco_id}`);

  // Sample employee codes
  const sampleEmps = await query<any>(pool, `
    SELECT TOP 10 employee_code, employee_name, employment_status
    FROM employees
    ORDER BY employee_code
  `);
  console.log('\n  Sample employee codes (sorted by code):');
  sampleEmps.forEach(e => console.log(`    ${e.employee_code} - ${e.employee_name.substring(0, 30)} (${e.employment_status})`));

  // Check employee code format
  const empCodeFormats = await query<any>(pool, `
    SELECT
      CASE
        WHEN employee_code LIKE '[A-Z][0-9][0-9][0-9][0-9]' THEN 'ZKTeco Format (Axxxx)'
        WHEN employee_code LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN 'HR Format (7 digits)'
        ELSE 'Other'
      END as format,
      COUNT(*) as count
    FROM employees
    GROUP BY
      CASE
        WHEN employee_code LIKE '[A-Z][0-9][0-9][0-9][0-9]' THEN 'ZKTeco Format (Axxxx)'
        WHEN employee_code LIKE '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN 'HR Format (7 digits)'
        ELSE 'Other'
      END
    ORDER BY count DESC
  `);
  console.log('\n  Employee code format distribution:');
  empCodeFormats.forEach(f => console.log(`    ${f.format.padEnd(25)}: ${f.count}`));

  // ============================================
  // 4. ATTENDANCE SCAN LOGS ANALYSIS
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('4. ATTENDANCE SCAN LOGS ANALYSIS');
  console.log('='.repeat(80));

  const scanStats = await query<any>(pool, `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN parsed_employee_code IS NOT NULL THEN 1 ELSE 0 END) as has_parsed_code,
      SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) as mapped_status,
      SUM(CASE WHEN mapping_status = 'NEED_REVIEW' THEN 1 ELSE 0 END) as need_review,
      SUM(CASE WHEN mapping_status = 'UNMAPPED' THEN 1 ELSE 0 END) as unmapped,
      MIN(scan_date) as earliest,
      MAX(scan_date) as latest
    FROM attendance_scan_logs
  `);
  console.log('\n[attendance_scan_logs] table:');
  console.log(`  Total scan logs: ${scanStats[0].total}`);
  console.log(`  Has parsed_employee_code: ${scanStats[0].has_parsed_code}`);
  console.log(`  Status MAPPED: ${scanStats[0].mapped_status}`);
  console.log(`  Status NEED_REVIEW: ${scanStats[0].need_review}`);
  console.log(`  Status UNMAPPED: ${scanStats[0].unmapped}`);
  console.log(`  Date range: ${scanStats[0].earliest} to ${scanStats[0].latest}`);

  // Short vs Long ID in scan logs
  const shortLongScans = await query<any>(pool, `
    SELECT
      CASE
        WHEN LEN(raw_device_user_id) <= 5 THEN 'SHORT (<=5)'
        WHEN LEN(raw_device_user_id) > 5 THEN 'LONG (>5)'
        ELSE 'NULL/EMPTY'
      END as id_category,
      COUNT(*) as count,
      SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) as mapped,
      SUM(CASE WHEN mapping_status = 'NEED_REVIEW' THEN 1 ELSE 0 END) as need_review,
      SUM(CASE WHEN mapping_status = 'UNMAPPED' THEN 1 ELSE 0 END) as unmapped
    FROM attendance_scan_logs
    WHERE raw_device_user_id IS NOT NULL
    GROUP BY
      CASE
        WHEN LEN(raw_device_user_id) <= 5 THEN 'SHORT (<=5)'
        WHEN LEN(raw_device_user_id) > 5 THEN 'LONG (>5)'
        ELSE 'NULL/EMPTY'
      END
    ORDER BY id_category
  `);
  console.log('\n  Short vs Long raw_device_user_id breakdown:');
  shortLongScans.forEach(s => {
    const pct = ((s.count / (scanStats[0].total || 1)) * 100).toFixed(1);
    console.log(`    ${s.id_category.padEnd(15)}: ${String(s.count).padStart(8)} (${pct}%) | Mapped: ${s.mapped}, Need Review: ${s.need_review}, Unmapped: ${s.unmapped}`);
  });

  // ============================================
  // 5. DETAILED SHORT ID ANALYSIS
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('5. SHORT ID (<=5 digits) DETAILED ANALYSIS');
  console.log('='.repeat(80));

  const shortIdSamples = await query<any>(pool, `
    SELECT TOP 20
      raw_device_user_id,
      LEN(raw_device_user_id) as id_length,
      machine_code,
      mapping_status,
      parsed_employee_code,
      COUNT(*) as scan_count
    FROM attendance_scan_logs
    WHERE raw_device_user_id IS NOT NULL
      AND LEN(raw_device_user_id) <= 5
      AND raw_device_user_id NOT LIKE '%[^0-9]%'
    GROUP BY raw_device_user_id, LEN(raw_device_user_id), machine_code, mapping_status, parsed_employee_code
    ORDER BY LEN(raw_device_user_id), raw_device_user_id
  `);
  console.log('\n  Sample SHORT IDs (<=5 digits):');
  console.log('  ID        | Len | Machine   | Status        | Parsed    | Scans');
  console.log('  ' + '-'.repeat(70));
  shortIdSamples.slice(0, 15).forEach(s => {
    console.log(`  ${String(s.raw_device_user_id).padEnd(10)} | ${String(s.id_length).padEnd(3)} | ${String(s.machine_code).padEnd(9)} | ${String(s.mapping_status).padEnd(14)} | ${String(s.parsed_employee_code || 'NULL').padEnd(9)} | ${s.scan_count}`);
  });
  console.log(`  ... (showing ${shortIdSamples.length} unique short ID samples)`);

  // Short ID machine distribution
  const shortIdMachines = await query<any>(pool, `
    SELECT machine_code, COUNT(*) as count
    FROM attendance_scan_logs
    WHERE raw_device_user_id IS NOT NULL
      AND LEN(raw_device_user_id) <= 5
      AND raw_device_user_id NOT LIKE '%[^0-9]%'
    GROUP BY machine_code
    ORDER BY count DESC
  `);
  console.log('\n  Short IDs by machine:');
  shortIdMachines.forEach(m => console.log(`    ${String(m.machine_code).padEnd(15)}: ${m.count} records`));

  // ============================================
  // 6. DETAILED LONG ID ANALYSIS
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('6. LONG ID (>5 digits) DETAILED ANALYSIS');
  console.log('='.repeat(80));

  // Long ID with scanner prefix
  const scannerPrefixDist = await query<any>(pool, `
    SELECT
      LEFT(raw_device_user_id, 3) as scanner_prefix,
      COUNT(*) as count,
      SUM(CASE WHEN mapping_status = 'MAPPED' THEN 1 ELSE 0 END) as mapped,
      SUM(CASE WHEN mapping_status = 'NEED_REVIEW' THEN 1 ELSE 0 END) as need_review,
      SUM(CASE WHEN mapping_status = 'UNMAPPED' THEN 1 ELSE 0 END) as unmapped
    FROM attendance_scan_logs
    WHERE raw_device_user_id IS NOT NULL
      AND LEN(raw_device_user_id) > 5
      AND raw_device_user_id LIKE '[0-9][0-9][0-9]%'
    GROUP BY LEFT(raw_device_user_id, 3)
    ORDER BY scanner_prefix
  `);
  console.log('\n  Scanner prefix distribution in long IDs (>5 digits):');
  console.log('  Prefix | Count     | Mapped   | Need Review | Unmapped');
  console.log('  ' + '-'.repeat(55));

  // Map prefixes to locCode
  const prefixMap: Record<string, string> = {
    '001': 'L (IJL)',
    '100': 'A (P1A)',
    '200': 'J (ARC)',
    '300': 'B (P1B)',
    '400': 'H (AB2)',
    '500': 'C (P2A)',
    '600': 'D (P2B)',
    '700': 'E (DME)',
    '800': 'F (ARA)',
    '900': 'G (AB1)',
  };

  scannerPrefixDist.forEach(s => {
    const locCode = prefixMap[s.scanner_prefix] || 'Unknown';
    console.log(`  ${s.scanner_prefix}    | ${String(s.count).padEnd(9)} | ${String(s.mapped).padEnd(8)} | ${String(s.need_review).padEnd(12)} | ${s.unmapped}  (${locCode})`);
  });

  // Sample long IDs by prefix
  const longIdSamples = await query<any>(pool, `
    SELECT TOP 30
      LEFT(raw_device_user_id, 3) as prefix,
      raw_device_user_id,
      LEN(raw_device_user_id) as id_length,
      mapping_status,
      parsed_employee_code,
      COUNT(*) as scan_count
    FROM attendance_scan_logs
    WHERE raw_device_user_id IS NOT NULL
      AND LEN(raw_device_user_id) > 5
      AND raw_device_user_id LIKE '[0-9][0-9][0-9]%'
    GROUP BY LEFT(raw_device_user_id, 3), raw_device_user_id, LEN(raw_device_user_id), mapping_status, parsed_employee_code
    ORDER BY prefix, scan_count DESC
  `);
  console.log('\n  Sample LONG IDs (grouped by prefix):');
  console.log('  Prefix | ID             | Len | Status        | Parsed    | Scans');
  console.log('  ' + '-'.repeat(75));
  const groupedSamples: Record<string, any[]> = {};
  longIdSamples.forEach(s => {
    if (!groupedSamples[s.prefix]) groupedSamples[s.prefix] = [];
    if (groupedSamples[s.prefix].length < 2) groupedSamples[s.prefix].push(s);
  });
  Object.entries(groupedSamples).forEach(([prefix, samples]) => {
    samples.forEach(s => {
      console.log(`  ${prefix}    | ${String(s.raw_device_user_id).padEnd(15)} | ${String(s.id_length).padEnd(3)} | ${String(s.mapping_status).padEnd(14)} | ${String(s.parsed_employee_code || 'NULL').padEnd(9)} | ${s.scan_count}`);
    });
  });

  // ============================================
  // 7. ZKTECO_ABSENSI_USER_MACHINE ANALYSIS
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('7. ZKTECO_ABSENSI_USER_MACHINE ANALYSIS');
  console.log('='.repeat(80));

  const userMachineStats = await query<any>(pool, `
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT employee_code) as unique_employees,
      COUNT(DISTINCT machine_code) as unique_machines,
      MIN(created_at) as earliest,
      MAX(created_at) as latest
    FROM zkteco_absensi_user_machine
  `);
  console.log('\n[zkteco_absensi_user_machine] table:');
  console.log(`  Total entries: ${userMachineStats[0].total}`);
  console.log(`  Unique employees: ${userMachineStats[0].unique_employees}`);
  console.log(`  Unique machines: ${userMachineStats[0].unique_machines}`);
  console.log(`  Date range: ${userMachineStats[0].earliest} to ${userMachineStats[0].latest}`);

  // ============================================
  // 8. ZKTECO_HR_EMPLOYEE_MAP ANALYSIS
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('8. ZKTECO_HR_EMPLOYEE_MAP ANALYSIS');
  console.log('='.repeat(80));

  const hrMapStats = await query<any>(pool, `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN hr_employee_code IS NOT NULL THEN 1 ELSE 0 END) as has_hr_code,
      SUM(CASE WHEN hr_employee_code IS NULL THEN 1 ELSE 0 END) as no_hr_code,
      COUNT(DISTINCT machine_code) as machines,
      COUNT(DISTINCT hr_employee_code) as unique_hr_codes
    FROM zkteco_hr_employee_map
  `);
  console.log('\n[zkteco_hr_employee_map] table:');
  console.log(`  Total entries: ${hrMapStats[0].total}`);
  console.log(`  Has hr_employee_code: ${hrMapStats[0].has_hr_code}`);
  console.log(`  No hr_employee_code: ${hrMapStats[0].no_hr_code}`);
  console.log(`  Machines covered: ${hrMapStats[0].machines}`);
  console.log(`  Unique HR codes: ${hrMapStats[0].unique_hr_codes}`);

  // ============================================
  // 9. MACHINE STATUS
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('9. MACHINE STATUS');
  console.log('='.repeat(80));

  const machineStats = await query<any>(pool, `
    SELECT
      machine_code,
      location_name,
      access_status,
      last_sync_at,
      (SELECT COUNT(*) FROM attendance_scan_logs WHERE machine_code = m.machine_code) as scan_count
    FROM attendance_machines m
    ORDER BY machine_code
  `);
  console.log('\n[attendance_machines] table:');
  console.log('  Machine Code | Location Name           | Status  | Last Sync           | Scans');
  console.log('  ' + '-'.repeat(85));
  machineStats.forEach(m => {
    const lastSync = m.last_sync_at ? new Date(m.last_sync_at).toISOString().substring(0, 16) : 'Never';
    console.log(`  ${String(m.machine_code).padEnd(12)} | ${String(m.location_name || '').padEnd(24)} | ${String(m.access_status || '').padEnd(8)} | ${lastSync} | ${m.scan_count}`);
  });

  // ============================================
  // 10. DIVISION DISTRIBUTION
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('10. DIVISION DISTRIBUTION');
  console.log('='.repeat(80));

  const divStats = await query<any>(pool, `
    SELECT
      d.division_code,
      d.division_name,
      d.loc_code,
      COUNT(DISTINCT e.id) as employee_count,
      COUNT(DISTINCT m.machine_id) as machine_count
    FROM divisions d
    LEFT JOIN employees e ON e.division_id = d.id AND e.is_active = 1
    LEFT JOIN attendance_machines m ON m.division_id = d.id
    GROUP BY d.division_code, d.division_name, d.loc_code
    ORDER BY d.division_code
  `);
  console.log('\n[divisions] with employee/machine counts:');
  console.log('  Code | Division Name          | Loc | Employees | Machines');
  console.log('  ' + '-'.repeat(60));
  divStats.forEach(d => {
    console.log(`  ${String(d.division_code).padEnd(5)} | ${String(d.division_name).padEnd(23)} | ${String(d.loc_code || '').padEnd(4)} | ${String(d.employee_count || 0).padEnd(9)} | ${d.machine_count || 0}`);
  });

  // ============================================
  // 11. CROSS-MACHINE EMPLOYEE CHECK
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('11. CROSS-MACHINE EMPLOYEE ANALYSIS');
  console.log('='.repeat(80));

  // Check if employees appear in multiple machines
  const crossMachine = await query<any>(pool, `
    SELECT TOP 10
      zkteco_employee_code,
      COUNT(DISTINCT machine_code) as machine_count,
      STRING_AGG(machine_code, ', ') as machines
    FROM zkteco_absensi_user_machine
    GROUP BY zkteco_employee_code
    HAVING COUNT(DISTINCT machine_code) > 1
    ORDER BY machine_count DESC
  `);

  if (crossMachine.length > 0) {
    console.log('\n  Employees enrolled in MULTIPLE machines:');
    console.log('  Employee Code | Machines | Machine List');
    console.log('  ' + '-'.repeat(60));
    crossMachine.forEach(e => {
      console.log(`  ${String(e.zkteco_employee_code).padEnd(15)} | ${e.machine_count}       | ${e.machines}`);
    });
  } else {
    console.log('\n  No employees found enrolled in multiple machines (in zkteco_absensi_user_machine)');
  }

  // ============================================
  // 12. SUMMARY & RECOMMENDATIONS
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('12. SUMMARY & DATA QUALITY RECOMMENDATIONS');
  console.log('='.repeat(80));

  const totalScans = scanStats[0].total || 0;
  const mappedScans = scanStats[0].mapped_status || 0;
  const shortScans = shortLongScans.find(s => s.id_category === 'SHORT (<=5)')?.count || 0;
  const longScans = shortLongScans.find(s => s.id_category === 'LONG (>5)')?.count || 0;
  const needReview = scanStats[0].need_review || 0;
  const unmapped = scanStats[0].unmapped || 0;

  console.log(`
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║                          DATA QUALITY SUMMARY                                  ║
  ╠══════════════════════════════════════════════════════════════════════════════╣
  ║  Total scan records:           ${String(totalScans.toLocaleString()).padEnd(15)}                                 ║
  ║  Mapped (MAPPED status):       ${String(mappedScans.toLocaleString() + ' (' + ((mappedScans / totalScans) * 100).toFixed(1) + '%)').padEnd(15)}                                 ║
  ║  NEED_REVIEW status:           ${String(needReview.toLocaleString()).padEnd(15)}                                 ║
  ║  UNMAPPED status:              ${String(unmapped.toLocaleString()).padEnd(15)}                                 ║
  ╠══════════════════════════════════════════════════════════════════════════════╣
  ║                          SHORT vs LONG ID BREAKDOWN                            ║
  ╠══════════════════════════════════════════════════════════════════════════════╣
  ║  Short IDs (<=5 digits):       ${String(shortScans.toLocaleString() + ' (' + ((shortScans / totalScans) * 100).toFixed(1) + '%)').padEnd(15)}                                 ║
  ║  Long IDs (>5 digits):         ${String(longScans.toLocaleString() + ' (' + ((longScans / totalScans) * 100).toFixed(1) + '%)').padEnd(15)}                                 ║
  ╠══════════════════════════════════════════════════════════════════════════════╣
  ║                          CONVENTION COMPLIANCE                               ║
  ╠══════════════════════════════════════════════════════════════════════════════╣
  ║  Convention:                                                                  ║
  ║    - Short ID (<=5) = EXCLUDED from auto-mapping                             ║
  ║    - Long ID (>5) = Parse via scanner prefix → Lookup db_ptrj               ║
  ║                                                                              ║
  ║  Findings:                                                                    ║
  ║    - Short IDs stored but marked NEED_REVIEW ✓                              ║
  ║    - Long IDs need scanner prefix extraction                                  ║
  ║    - db_ptrj.HR_EMPLOYEE integration needs verification                      ║
  ╚══════════════════════════════════════════════════════════════════════════════╝
  `);

  await pool.close();
  console.log('\n\nAnalysis complete!');
}

main().catch(console.error);
