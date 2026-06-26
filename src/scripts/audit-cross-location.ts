/**
 * Cross-Location Attendance Audit Script
 *
 * Purpose: Audit semua mesin untuk mendeteksi employee yang terdaftar
 * di mesin yang salah (cross-location scanning)
 *
 * Usage: ts-node src/scripts/audit-cross-location.ts
 *
 * Output: Laporan detail per mesin + summary
 */

import { query, closeDbPool } from '../lib/db';

interface MachineAuditResult {
  machineCode: string;
  machineName: string;
  expectedPrefix: string | null;
  actualPrefixes: Map<string, number>;
  crossLocationEmployees: string[];
  totalScans: number;
  status: 'OK' | 'WARNING' | 'CRITICAL';
}

interface CrossLocationDetail {
  employeeCode: string;
  employeeName: string | null;
  machineCode: string;
  homeDivision: string;
  empPrefix: string;
  scanCount: number;
  lastScan: string;
}

// Expected prefix per machine from scanner codes
const scannerToPrefix: Record<number, string> = {
  100: 'A',  // P1A
  200: 'J',  // ARC
  300: 'B',  // P1B
  400: 'H',  // AB2
  500: 'C',  // P2A
  600: 'D',  // P2B
  700: 'E',  // DME
  800: 'F',  // ARA
  900: 'G',  // AB1
};

const prefixToDivision: Record<string, string> = {
  'A': 'P1A',
  'B': 'P1B',
  'C': 'P2A',
  'D': 'P2B',
  'E': 'DME',
  'F': 'ARA',
  'G': 'AB1',
  'H': 'AB2',
  'J': 'ARC',
  'L': 'IJL/PGE',
};

async function getMachineUsers(): Promise<Map<string, Set<string>>> {
  console.log('📡 Fetching machine enrollment data...\n');

  const result = await query<any>(`
    SELECT
      m.machine_code,
      s.raw_device_user_id
    FROM machine_user_raw s
    JOIN mst_machine m ON m.machine_id = s.machine_id
    WHERE m.is_active = 1
  `);

  const machineUsers = new Map<string, Set<string>>();

  for (const row of result) {
    const machineCode = row.machine_code;
    const userId = row.raw_device_user_id;

    if (!machineUsers.has(machineCode)) {
      machineUsers.set(machineCode, new Set());
    }
    machineUsers.get(machineCode)!.add(userId);
  }

  return machineUsers;
}

async function getMachineConfig(): Promise<Map<string, { scannerCode: number; locCode: string }>> {
  const result = await query<any>(`
    SELECT
      machine_code,
      scanner_code,
      loc_code
    FROM mst_machine
    WHERE is_active = 1
  `);

  const config = new Map<string, { scannerCode: number; locCode: string }>();

  for (const row of result) {
    config.set(row.machine_code, {
      scannerCode: row.scanner_code || 0,
      locCode: row.loc_code || ''
    });
  }

  return config;
}

async function getCrossLocationScans(): Promise<CrossLocationDetail[]> {
  console.log('🔍 Analyzing attendance records...\n');

  const result = await query<CrossLocationDetail>(`
    SELECT
      s.parsed_employee_code AS employeeCode,
      e.emp_name AS employeeName,
      s.machine_code,
      LEFT(s.parsed_employee_code, 1) AS empPrefix,
      COUNT(*) AS scanCount,
      MAX(s.scan_date) AS lastScan
    FROM attendance_scan_logs s
    LEFT JOIN mst_employee e ON e.emp_code = s.parsed_employee_code
    WHERE s.parsed_employee_code IS NOT NULL
      AND LEFT(s.parsed_employee_code, 1) IN ('A','B','C','D','E','F','G','H','J','L')
    GROUP BY
      s.parsed_employee_code,
      e.emp_name,
      s.machine_code,
      LEFT(s.parsed_employee_code, 1)
    ORDER BY s.machine_code, COUNT(*) DESC
  `);

  return result;
}

async function auditAllMachines(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     CROSS-LOCATION ATTENDANCE AUDIT');
  console.log('     Generated: ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════════\n');

  const machineConfig = await getMachineConfig();
  const crossLocationScans = await getCrossLocationScans();

  // Group scans by machine
  const scansByMachine = new Map<string, CrossLocationDetail[]>();
  for (const scan of crossLocationScans) {
    if (!scansByMachine.has(scan.machineCode)) {
      scansByMachine.set(scan.machineCode, []);
    }
    scansByMachine.get(scan.machineCode)!.push(scan);
  }

  const results: MachineAuditResult[] = [];

  for (const [machineCode, scans] of scansByMachine) {
    const config = machineConfig.get(machineCode);
    const expectedPrefix = config?.scannerCode
      ? scannerToPrefix[config.scannerCode] || null
      : null;

    const actualPrefixes = new Map<string, number>();
    const crossLocationEmployees: string[] = [];

    for (const scan of scans) {
      const prefix = scan.empPrefix;
      actualPrefixes.set(prefix, (actualPrefixes.get(prefix) || 0) + scan.scanCount);

      if (expectedPrefix && prefix !== expectedPrefix) {
        crossLocationEmployees.push(scan.employeeCode);
      }
    }

    let status: 'OK' | 'WARNING' | 'CRITICAL' = 'OK';
    if (crossLocationEmployees.length > 0) {
      status = crossLocationEmployees.length > 10 ? 'CRITICAL' : 'WARNING';
    }

    results.push({
      machineCode,
      machineName: machineCode,
      expectedPrefix,
      actualPrefixes,
      crossLocationEmployees,
      totalScans: scans.reduce((sum, s) => sum + s.scanCount, 0),
      status
    });
  }

  // Print results
  console.log('📊 AUDIT RESULTS BY MACHINE\n');
  console.log('─────────────────────────────────────────────────────────────────');

  for (const r of results) {
    const statusIcon = r.status === 'OK' ? '✅' : r.status === 'WARNING' ? '⚠️' : '❌';

    console.log(`\n${statusIcon} ${r.machineCode}`);
    console.log(`   Expected Prefix: ${r.expectedPrefix || 'N/A'} (${r.expectedPrefix ? prefixToDivision[r.expectedPrefix] : ''})`);
    console.log(`   Total Scans: ${r.totalScans}`);
    console.log(`   Prefix Distribution:`);

    for (const [prefix, count] of r.actualPrefixes) {
      const division = prefixToDivision[prefix] || 'Unknown';
      const isCorrect = prefix === r.expectedPrefix;
      const icon = isCorrect ? '✓' : '✗';
      console.log(`      ${icon} ${prefix} (${division}): ${count} scans`);
    }

    if (r.crossLocationEmployees.length > 0) {
      console.log(`   ❌ WRONG PREFIX EMPLOYEES: ${r.crossLocationEmployees.length}`);
      console.log(`      Sample: ${r.crossLocationEmployees.slice(0, 5).join(', ')}${r.crossLocationEmployees.length > 5 ? '...' : ''}`);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const okCount = results.filter(r => r.status === 'OK').length;
  const warningCount = results.filter(r => r.status === 'WARNING').length;
  const criticalCount = results.filter(r => r.status === 'CRITICAL').length;

  console.log(`   ✅ OK:           ${okCount} machines`);
  console.log(`   ⚠️  WARNING:     ${warningCount} machines`);
  console.log(`   ❌ CRITICAL:    ${criticalCount} machines`);

  // Detailed cross-location employees
  if (criticalCount > 0 || warningCount > 0) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🔴 CROSS-LOCATION EMPLOYEE DETAILS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const r of results) {
      if (r.crossLocationEmployees.length > 0) {
        const machineScans = crossLocationScans.filter(
          s => s.machineCode === r.machineCode && r.crossLocationEmployees.includes(s.employeeCode)
        );

        console.log(`\n📍 ${r.machineCode} (expected: ${r.expectedPrefix || 'N/A'})\n`);

        const sortedScans = machineScans.sort((a, b) => b.scanCount - a.scanCount);

        for (const scan of sortedScans.slice(0, 20)) {
          const homeDivision = prefixToDivision[scan.empPrefix] || 'Unknown';
          console.log(`   ${scan.employeeCode} (${scan.employeeName || 'Unknown'})`);
          console.log(`      Home: ${homeDivision} | Scans: ${scan.scanCount} | Last: ${scan.lastScan}`);
        }

        if (sortedScans.length > 20) {
          console.log(`   ... and ${sortedScans.length - 20} more employees`);
        }
      }
    }
  }

  // Recommendations
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔧 RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (criticalCount > 0 || warningCount > 0) {
    console.log('1. CLEAN MACHINE ENROLLMENT:');
    for (const r of results) {
      if (r.crossLocationEmployees.length > 0 && r.expectedPrefix) {
        console.log(`   - ${r.machineCode}: Remove ${r.crossLocationEmployees.length} employees with prefix != "${r.expectedPrefix}"`);
      }
    }

    console.log('\n2. VERIFY AT ZKTECO MACHINE:');
    console.log('   - Go to each machine');
    console.log('   - Check User Management > View All');
    console.log('   - Delete users with wrong prefix');

    console.log('\n3. RECOMMENDED PREFIX PER MACHINE:');
    for (const [machineCode, config] of machineConfig) {
      const expected = config.scannerCode ? scannerToPrefix[config.scannerCode] : '?';
      console.log(`   - ${machineCode}: Scanner ${config.scannerCode} → Prefix "${expected}"`);
    }
  } else {
    console.log('   ✅ All machines are correctly configured!');
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  await closeDbPool();
}

// Run
auditAllMachines().catch(err => {
  console.error('❌ Audit failed:', err);
  process.exit(1);
});
