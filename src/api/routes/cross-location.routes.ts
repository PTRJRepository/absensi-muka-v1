/**
 * Cross-Location Monitoring API Endpoint
 * Add to: src/api/routes/monitoring.routes.ts
 *
 * GET /api/monitoring/cross-location
 * GET /api/monitoring/cross-location/:machineCode
 */

import { query, sql } from '../../lib/db';

// Expected scanner code to prefix mapping
const SCANNER_TO_PREFIX: Record<number, string> = {
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

const PREFIX_TO_DIVISION: Record<string, string> = {
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

// Get expected prefix for a machine
function getExpectedPrefix(scannerCode: number | null): string | null {
  if (!scannerCode) return null;
  return SCANNER_TO_PREFIX[scannerCode] || null;
}

// Check if employee prefix matches machine
function isCrossLocation(
  machineCode: string,
  employeePrefix: string,
  scannerCode: number | null
): boolean {
  const expected = getExpectedPrefix(scannerCode);
  if (!expected) {
    // Office machines (IJL, PGE, MILL, APE) allow all prefixes
    const officeMachines = ['IJL', 'OFFICE_PGE', 'OFFICE_APE', 'MILL'];
    if (officeMachines.includes(machineCode)) {
      return false; // Not cross-location for office machines
    }
    return false; // Unknown machine, not flagged
  }
  return employeePrefix !== expected;
}

/**
 * GET /api/monitoring/cross-location
 * Get cross-location summary for all machines
 */
export async function getCrossLocationSummary(ctx: any) {
  const days = parseInt(ctx.query.get('days') || '7');

  const machines = await query<any>(`
    SELECT
      m.machine_code,
      m.scanner_code,
      m.machine_name,
      LEFT(s.parsed_employee_code, 1) AS emp_prefix,
      COUNT(DISTINCT s.parsed_employee_code) AS unique_employees,
      COUNT(*) AS total_scans,
      MIN(s.scan_date) AS first_scan,
      MAX(s.scan_date) AS last_scan
    FROM attendance_machines m
    LEFT JOIN attendance_scan_logs s ON s.machine_code = m.machine_code
      AND s.scan_date >= DATEADD(day, -${days}, GETDATE())
      AND s.parsed_employee_code IS NOT NULL
      AND LEFT(s.parsed_employee_code, 1) IN ('A','B','C','D','E','F','G','H','J','L')
    WHERE m.is_active = 1
    GROUP BY m.machine_code, m.scanner_code, m.machine_name
    ORDER BY m.machine_code
  `);

  // Calculate cross-location status for each machine
  const summary = machines.map((m: any) => {
    const expectedPrefix = getExpectedPrefix(m.scanner_code);
    const prefixes = machines
      .filter((x: any) => x.machine_code === m.machine_code)
      .map((x: any) => x.emp_prefix);

    const uniquePrefixes = [...new Set(prefixes.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0))];
    const isMixed = uniquePrefixes.length > 1;

    // Calculate cross-location employees
    const crossLocationPrefixes = uniquePrefixes.filter(
      (p: string) => expectedPrefix && p !== expectedPrefix
    );

    return {
      machineCode: m.machine_code,
      machineName: m.machine_name,
      scannerCode: m.scanner_code,
      expectedPrefix,
      expectedDivision: expectedPrefix ? PREFIX_TO_DIVISION[expectedPrefix] : null,
      uniquePrefixes,
      uniquePrefixCount: uniquePrefixes.length,
      isMixed: isMixed && uniquePrefixes.length > 0,
      crossLocationPrefixes,
      crossLocationCount: crossLocationPrefixes.length,
      status: isMixed ? 'WARNING' : 'OK'
    };
  });

  ctx.body = {
    success: true,
    data: {
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      machines: summary,
      totalMachines: summary.length,
      mixedMachines: summary.filter((m: any) => m.isMixed).length,
      cleanMachines: summary.filter((m: any) => !m.isMixed).length
    }
  };
}

/**
 * GET /api/monitoring/cross-location/:machineCode
 * Get detailed cross-location employees for a specific machine
 */
export async function getMachineCrossLocation(ctx: any) {
  const machineCode = ctx.params.machineCode;
  const days = parseInt(ctx.query.get('days') || '7');
  const limit = parseInt(ctx.query.get('limit') || '100');

  // Get machine config
  const machines = await query<any>(`
    SELECT machine_code, scanner_code, machine_name
    FROM attendance_machines
    WHERE machine_code = @machineCode
  `, [{ name: 'machineCode', type: sql.NVarChar, value: machineCode }]);

  if (machines.length === 0) {
    ctx.status = 404;
    ctx.body = { success: false, error: { code: 'NOT_FOUND', message: 'Machine not found' } };
    return;
  }

  const machine = machines[0];
  const expectedPrefix = getExpectedPrefix(machine.scanner_code);

  // Get all employee prefixes at this machine
  const employees = await query<any>(`
    SELECT
      s.parsed_employee_code AS employeeCode,
      e.emp_name AS employeeName,
      LEFT(s.parsed_employee_code, 1) AS empPrefix,
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
        WHEN 'L' THEN 'IJL/PGE'
      END AS homeDivision,
      COUNT(*) AS totalScans,
      MIN(s.scan_date) AS firstScan,
      MAX(s.scan_date) AS lastScan
    FROM attendance_scan_logs s
    LEFT JOIN mst_employee e ON e.emp_code = s.parsed_employee_code
    WHERE s.machine_code = @machineCode
      AND s.scan_date >= DATEADD(day, -${days}, GETDATE())
      AND s.parsed_employee_code IS NOT NULL
      AND LEFT(s.parsed_employee_code, 1) IN ('A','B','C','D','E','F','G','H','J','L')
    GROUP BY s.parsed_employee_code, e.emp_name, LEFT(s.parsed_employee_code, 1)
    ORDER BY COUNT(*) DESC
  `, [{ name: 'machineCode', type: sql.NVarChar, value: machineCode }]);

  // Separate correct vs cross-location
  const correctEmployees = [];
  const crossLocationEmployees = [];

  for (const emp of employees) {
    const isCross = isCrossLocation(machineCode, emp.empPrefix, machine.scanner_code);
    if (isCross) {
      crossLocationEmployees.push(emp);
    } else {
      correctEmployees.push(emp);
    }
  }

  ctx.body = {
    success: true,
    data: {
      machine: {
        code: machine.machine_code,
        name: machine.machine_name,
        scannerCode: machine.scanner_code,
        expectedPrefix,
        expectedDivision: expectedPrefix ? PREFIX_TO_DIVISION[expectedPrefix] : null
      },
      period: `Last ${days} days`,
      summary: {
        totalEmployees: employees.length,
        correctEmployees: correctEmployees.length,
        crossLocationEmployees: crossLocationEmployees.length
      },
      crossLocationEmployees: crossLocationEmployees.slice(0, limit),
      correctEmployees: correctEmployees.slice(0, limit)
    }
  };
}

/**
 * GET /api/monitoring/cross-location/report
 * Generate detailed cross-location report
 */
export async function getCrossLocationReport(ctx: any) {
  const startDate = ctx.query.get('startDate');
  const endDate = ctx.query.get('endDate');

  const dateFilter = startDate && endDate
    ? `AND s.scan_date BETWEEN '${startDate}' AND '${endDate}'`
    : `AND s.scan_date >= DATEADD(day, -30, GETDATE())`;

  const crossLocation = await query<any>(`
    SELECT
      m.machine_code,
      m.scanner_code,
      m.machine_name,
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
        WHEN 'L' THEN 'IJL/PGE'
      END AS home_division,
      CASE
        WHEN m.scanner_code = 100 AND LEFT(s.parsed_employee_code, 1) != 'A' THEN 1
        WHEN m.scanner_code = 200 AND LEFT(s.parsed_employee_code, 1) != 'J' THEN 1
        WHEN m.scanner_code = 300 AND LEFT(s.parsed_employee_code, 1) != 'B' THEN 1
        WHEN m.scanner_code = 400 AND LEFT(s.parsed_employee_code, 1) != 'H' THEN 1
        WHEN m.scanner_code = 500 AND LEFT(s.parsed_employee_code, 1) != 'C' THEN 1
        WHEN m.scanner_code = 600 AND LEFT(s.parsed_employee_code, 1) != 'D' THEN 1
        WHEN m.scanner_code = 700 AND LEFT(s.parsed_employee_code, 1) != 'E' THEN 1
        WHEN m.scanner_code = 800 AND LEFT(s.parsed_employee_code, 1) != 'F' THEN 1
        WHEN m.scanner_code = 900 AND LEFT(s.parsed_employee_code, 1) != 'G' THEN 1
        ELSE 0
      END AS is_cross_location,
      s.parsed_employee_code AS employee_code,
      e.emp_name AS employee_name,
      COUNT(*) AS scan_count,
      MIN(s.scan_date) AS first_scan,
      MAX(s.scan_date) AS last_scan
    FROM attendance_machines m
    JOIN attendance_scan_logs s ON s.machine_code = m.machine_code
    LEFT JOIN mst_employee e ON e.emp_code = s.parsed_employee_code
    WHERE m.is_active = 1
      AND s.parsed_employee_code IS NOT NULL
      AND LEFT(s.parsed_employee_code, 1) IN ('A','B','C','D','E','F','G','H','J','L')
      ${dateFilter}
    GROUP BY
      m.machine_code, m.scanner_code, m.machine_name,
      LEFT(s.parsed_employee_code, 1),
      s.parsed_employee_code, e.emp_name
    HAVING
      CASE
        WHEN m.scanner_code = 100 AND LEFT(s.parsed_employee_code, 1) != 'A' THEN 1
        WHEN m.scanner_code = 200 AND LEFT(s.parsed_employee_code, 1) != 'J' THEN 1
        WHEN m.scanner_code = 300 AND LEFT(s.parsed_employee_code, 1) != 'B' THEN 1
        WHEN m.scanner_code = 400 AND LEFT(s.parsed_employee_code, 1) != 'H' THEN 1
        WHEN m.scanner_code = 500 AND LEFT(s.parsed_employee_code, 1) != 'C' THEN 1
        WHEN m.scanner_code = 600 AND LEFT(s.parsed_employee_code, 1) != 'D' THEN 1
        WHEN m.scanner_code = 700 AND LEFT(s.parsed_employee_code, 1) != 'E' THEN 1
        WHEN m.scanner_code = 800 AND LEFT(s.parsed_employee_code, 1) != 'F' THEN 1
        WHEN m.scanner_code = 900 AND LEFT(s.parsed_employee_code, 1) != 'G' THEN 1
        ELSE 0
      END = 1
    ORDER BY m.machine_code, COUNT(*) DESC
  `);

  ctx.body = {
    success: true,
    data: {
      period: startDate && endDate ? `${startDate} to ${endDate}` : 'Last 30 days',
      generatedAt: new Date().toISOString(),
      totalCrossLocationRecords: crossLocation.length,
      employees: crossLocation,
      recommendations: [
        'Review and clean ZKTeco machine enrollment',
        'Remove employees with wrong prefix from each machine',
        'Run this report weekly to monitor cross-location issues'
      ]
    }
  };
}
