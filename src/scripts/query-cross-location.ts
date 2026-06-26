/**
 * Quick Cross-Location Query Script
 * Run directly: npx ts-node src/scripts/query-cross-location.ts
 */

import { query, closeDbPool } from '../lib/db';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     CROSS-LOCATION QUICK CHECK');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Query 1: Prefix distribution per machine
  console.log('📊 Prefix Distribution by Machine:\n');

  const records1 = await query<any>(`
    SELECT
      s.machine_code,
      LEFT(s.parsed_employee_code, 1) AS emp_prefix,
      COUNT(*) AS scan_count,
      STRING_AGG(DISTINCT LEFT(s.parsed_employee_code, 1), ', ') AS prefixes
    FROM attendance_scan_logs s
    WHERE s.parsed_employee_code IS NOT NULL
      AND LEFT(s.parsed_employee_code, 1) IN ('A','B','C','D','E','F','G','H','J','L')
      AND s.scan_date >= DATEADD(day, -7, GETDATE())
    GROUP BY s.machine_code, LEFT(s.parsed_employee_code, 1)
    ORDER BY s.machine_code, scan_count DESC
  `);

  // Group by machine
  const byMachine = new Map<string, any[]>();
  for (const row of records1) {
    if (!byMachine.has(row.machine_code)) {
      byMachine.set(row.machine_code, []);
    }
    byMachine.get(row.machine_code)!.push(row);
  }

  for (const [machine, rows] of byMachine) {
    const prefixes = rows.map(r => `${r.emp_prefix}(${r.scan_count})`).join(' ');
    const isMixed = rows.length > 1;
    const icon = isMixed ? '❌ MIXED' : '✅';

    console.log(`${icon} ${machine}: ${prefixes}`);

    if (isMixed) {
      console.log(`   ^ Contains employees from OTHER divisions!`);
    }
  }

  // Query 2: Detailed cross-location employees
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔴 Detailed Cross-Location Employees:\n');

  const records2 = await query<any>(`
    SELECT TOP 50
      s.machine_code,
      s.parsed_employee_code AS emp_code,
      e.emp_name AS emp_name,
      LEFT(s.parsed_employee_code, 1) AS emp_prefix,
      CASE LEFT(s.parsed_employee_code, 1)
        WHEN 'A' THEN 'P1A'
        WHEN 'B' THEN 'P1B'
        WHEN 'C' THEN 'P2A'
        WHEN 'D' THEN 'P2B'
        WHEN 'E' THEN 'DME'
        WHEN 'F' THEN 'ARA'
        WHEN 'G' THEN 'AB1'
        WHEN 'H' THEN 'AB2'
        WHEN 'J' THEN 'ARC'
        WHEN 'L' THEN 'IJL'
      END AS home_division,
      COUNT(*) AS scan_count,
      MAX(s.scan_date) AS last_scan
    FROM attendance_scan_logs s
    LEFT JOIN mst_employee e ON e.emp_code = s.parsed_employee_code
    WHERE s.parsed_employee_code IS NOT NULL
      -- Exclude correct combinations
      AND NOT (s.machine_code = 'P1A' AND LEFT(s.parsed_employee_code, 1) = 'A')
      AND NOT (s.machine_code = 'P1B' AND LEFT(s.parsed_employee_code, 1) = 'B')
      AND NOT (s.machine_code LIKE 'P2A%' AND LEFT(s.parsed_employee_code, 1) = 'C')
      AND NOT (s.machine_code = 'P2B' AND LEFT(s.parsed_employee_code, 1) = 'D')
      AND NOT (s.machine_code LIKE 'DME%' AND LEFT(s.parsed_employee_code, 1) = 'E')
      AND NOT (s.machine_code = 'ARA' AND LEFT(s.parsed_employee_code, 1) = 'F')
      AND NOT (s.machine_code = 'AB1' AND LEFT(s.parsed_employee_code, 1) = 'G')
      AND NOT (s.machine_code = 'AB2' AND LEFT(s.parsed_employee_code, 1) = 'H')
      AND NOT (s.machine_code LIKE 'ARC%' AND LEFT(s.parsed_employee_code, 1) = 'J')
      AND NOT (LEFT(s.parsed_employee_code, 1) IN ('A','B','C','D','E','F','G','H','J') AND s.machine_code IN ('IJL','OFFICE_PGE','OFFICE_APE','MILL'))
    GROUP BY
      s.machine_code,
      s.parsed_employee_code,
      e.emp_name,
      LEFT(s.parsed_employee_code, 1)
    ORDER BY s.machine_code, COUNT(*) DESC
  `);

  if (records2.length === 0) {
    console.log('   ✅ No cross-location employees found!');
  } else {
    console.log(`   Found ${records2.length} cross-location employees:\n`);

    for (const row of records2) {
      console.log(`   📍 ${row.machine_code}`);
      console.log(`      Code: ${row.emp_code} (${row.emp_name || 'Unknown'})`);
      console.log(`      Home: ${row.home_division}`);
      console.log(`      Scans: ${row.scan_count} | Last: ${row.last_scan}`);
      console.log('');
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 Summary:\n');

  const totalCrossLocation = records2.length;
  const machinesWithIssues = new Set(records2.map((r: any) => r.machine_code)).size;

  if (totalCrossLocation === 0) {
    console.log('   ✅ ALL CLEAN! No cross-location employees detected.');
  } else {
    console.log(`   ❌ ${totalCrossLocation} cross-location employees found`);
    console.log(`   ❌ Affecting ${machinesWithIssues} machines`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  await closeDbPool();
}

main().catch(err => {
  console.error('❌ Query failed:', err);
  process.exit(1);
});
