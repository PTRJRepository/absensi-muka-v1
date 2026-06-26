/**
 * Employee Mapping Service
 * 
 * Maps machine_user_id (deviceUserId) to emp_code
 * Handles scanner code suffix logic from machine-config.ts
 */

import { SqlClient } from '../../shared/database/sql-client';
import {
  parseZktecoUserIdToEmployeeCode,
  verifyParsedCodeInHrMaster,
  validateNameMatch,
  type ZktecoUserIdInput,
} from '../mapping/zkteco-employee-code-parser';

export interface MachineUserMap {
  map_id: number;
  machine_id: number;
  machine_user_id: string;
  employee_id?: number;
  emp_code?: string;
  mapped_by_rule?: string;
  mapped_source: string;
  loc_code?: string;
  scanner_code?: number;
  confidence_score: number;
  is_active: boolean;
  first_seen_at?: Date;
  last_seen_at?: Date;
  verified_by?: string;
  verified_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ScannerCodeMapping {
  suffix: number;
  scannerCode: number;
  locCode: string;
  empCodePrefix: string;
}

export class EmployeeMappingService {
  private scannerMappings: ScannerCodeMapping[] = [
    { suffix: 1, scannerCode: 1, locCode: 'L', empCodePrefix: 'L' },   // IJL (001)
    { suffix: 100, scannerCode: 100, locCode: 'A', empCodePrefix: 'A' },
    { suffix: 200, scannerCode: 200, locCode: 'J', empCodePrefix: 'J' },
    { suffix: 300, scannerCode: 300, locCode: 'B', empCodePrefix: 'B' },
    { suffix: 400, scannerCode: 400, locCode: 'H', empCodePrefix: 'H' },
    { suffix: 500, scannerCode: 500, locCode: 'C', empCodePrefix: 'C' },
    { suffix: 600, scannerCode: 600, locCode: 'D', empCodePrefix: 'D' },
    { suffix: 700, scannerCode: 700, locCode: 'E', empCodePrefix: 'E' },
    { suffix: 800, scannerCode: 800, locCode: 'F', empCodePrefix: 'F' },
    { suffix: 900, scannerCode: 900, locCode: 'G', empCodePrefix: 'G' },
  ];

  constructor(private sqlClient: SqlClient) {}

  private scannerPrefixLocMap: Record<string, string> = {
    '001': 'L',
    '100': 'A',
    '200': 'J',
    '300': 'B',
    '400': 'H',
    '500': 'C',
    '600': 'D',
    '700': 'E',
    '800': 'F',
    '900': 'G',
  };

  private machineCodeLocMap: Record<string, string> = {
    P1A: 'A',
    OFFICE_PGE: 'A',
    PGE: 'A',
    P1B: 'B',
    P2A: 'C',
    P2A_01: 'C',
    P2A_02: 'C',
    P2B: 'D',
    DME: 'E',
    DME_01: 'E',
    DME_02: 'E',
    ARA: 'F',
    OFFICE_APE: 'F',
    AB1: 'G',
    AB2: 'H',
    MILL: 'H',
    IJL: 'L',
    ARC: 'J',
    ARC_01: 'J',
    ARC_02: 'J',
  };

  /**
   * Load all employee codes and names into memory for fast lookup (call once per sync batch)
   */
  async loadAllEmployeeCodes(): Promise<Set<string>> {
    try {
      const results = await this.sqlClient.select<{ employee_code: string }>(
        'employees',
        'employee_code',
        '1=1'
      );
      return new Set(results.map(r => r.employee_code));
    } catch {
      return new Set();
    }
  }

  /**
   * Load all employee names keyed by employee_code for name validation.
   * Use this alongside loadAllEmployeeCodes() for full mapping validation.
   */
  async loadAllEmployeeNames(): Promise<Map<string, string>> {
    try {
      const results = await this.sqlClient.select<{ employee_code: string; employee_name: string }>(
        'employees',
        'employee_code, employee_name',
        '1=1'
      );
      return new Map(results.map(r => [r.employee_code, r.employee_name]));
    } catch {
      return new Map();
    }
  }

  private escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
  }

  private scannerPrefixLocCode(rawDeviceUserId: string): string | null {
    if (!/^\d+$/.test(rawDeviceUserId) || rawDeviceUserId.length <= 5) return null;
    return this.scannerPrefixLocMap[rawDeviceUserId.slice(0, 3)] ?? null;
  }

  private machineLocCode(machineCode?: string, machineLocCode?: string | null): string | null {
    const explicitLoc = machineLocCode?.trim().toUpperCase();
    if (explicitLoc) return explicitLoc;
    const normalizedMachineCode = machineCode?.trim().toUpperCase();
    return normalizedMachineCode ? this.machineCodeLocMap[normalizedMachineCode] ?? null : null;
  }

  private hasScannerPrefixMachineConflict(rawDeviceUserId: string, machineCode?: string, machineLocCode?: string | null): boolean {
    const prefixLoc = this.scannerPrefixLocCode(rawDeviceUserId);
    const machineLoc = this.machineLocCode(machineCode, machineLocCode);
    return Boolean(prefixLoc && machineLoc && prefixLoc !== machineLoc);
  }

  private async resolveDirectDatabaseEmployeeCode(rawDeviceUserId: string, machineCode?: string, machineLocCode?: string | null): Promise<string | null> {
    const userId = rawDeviceUserId.trim();
    if (!userId) return null;

    const escapedUserId = this.escapeSqlLiteral(userId);

    if (machineCode) {
      const escapedMachineCode = this.escapeSqlLiteral(machineCode);
      try {
        const overrideRow = await this.sqlClient.query<{ employee_code: string }>(`
          SELECT TOP 1 employee_code
          FROM employee_mapping_overrides
          WHERE machine_code = '${escapedMachineCode}'
            AND zkteco_user_id = '${escapedUserId}'
          ORDER BY updated_at DESC, id DESC
        `);
        if (overrideRow.length > 0) {
          return overrideRow[0].employee_code;
        }
      } catch {
        try {
          const legacyOverrideRow = await this.sqlClient.query<{ employee_code: string }>(`
            SELECT TOP 1 employee_code
            FROM employee_mapping_overrides
            WHERE machine_code = '${escapedMachineCode}'
              AND raw_device_id = '${escapedUserId}'
            ORDER BY created_at DESC, id DESC
          `);
          if (legacyOverrideRow.length > 0) {
            return legacyOverrideRow[0].employee_code;
          }
        } catch {
          // Override table/columns are optional in older deployments.
        }
      }
    }

    try {
      const directEmployeeRows = await this.sqlClient.query<{ employee_code: string }>(`
        SELECT TOP 1 employee_code
        FROM employees
        WHERE zkteco_user_id = '${escapedUserId}'
          AND COALESCE(is_active, 1) = 1
        ORDER BY id DESC
      `);
      if (directEmployeeRows.length > 0) {
        return directEmployeeRows[0].employee_code;
      }
    } catch {
      // Older employee schemas may not have zkteco_user_id.
    }

    return null;
  }

  /**
   * Synchronous mapping WITH in-memory employee code + name validation.
   * Use this for batch processing.
   *
   * Uses parseZktecoUserIdToEmployeeCode() from zkteco-employee-code-parser.ts
   * which is the SINGLE SOURCE OF TRUTH for all parsing logic.
   *
   * Name validation:
   * - name similarity >= 0.8 → STRONG (auto-map OK)
   * - name similarity >= 0.5 → WEAK (map but flag for review)
   * - name similarity < 0.5 → NEED_REVIEW (BLOCK auto-map)
   *
   * Rule: Scanner prefix (500→C) takes PRIORITY over machineLocCode
   */
  convertDeviceUserIdToEmpCodeWithLookup(
    deviceUserId: string,
    machineLocCode: string | undefined,
    machineScannerCode: number | undefined,
    employeeCodes: Set<string>,
    zktecoUserName: string | undefined,
    employeeNameLookup: (empCode: string) => string | null
  ): { empCode: string; confidence: number; rule: string } | null {
    const input: ZktecoUserIdInput = {
      zktecoUserId: deviceUserId,
      machineLocCode: machineLocCode ?? null,
      machineScannerCode: machineScannerCode ?? null,
    };

    const result = parseZktecoUserIdToEmployeeCode(input);

    // EXCLUDED or NONE → no auto-mapping
    if (!result.allowAutoMap || !result.parsedEmployeeCode) {
      return null;
    }

    // Verify parsed code exists in HR master
    const verification = verifyParsedCodeInHrMaster(result.parsedEmployeeCode, employeeCodes);
    if (!verification.exists) {
      return null;
    }

    // Validate name: zkteco user name vs HR employee name
    const hrEmployeeName = employeeNameLookup(result.parsedEmployeeCode) ?? null;
    const nameResult = validateNameMatch(zktecoUserName ?? null, hrEmployeeName);

    // BLOCK auto-map if name mismatch (PAIMIN ≠ PANJI ADITIA ROSA)
    if (!nameResult.allowAutoMap) {
      return null;
    }

    // Confidence: EXACT (100), STRONG (95), WEAK (85)
    const confidence = result.confidence === 'EXACT' ? 100 : result.confidence === 'STRONG' ? 95 : 85;

    return {
      empCode: result.parsedEmployeeCode,
      confidence,
      rule: result.reason + '_NAME_' + nameResult.confidence,
    };
  }

  /**
   * Verify generated empCode exists in employees table
   * Returns the original code if it exists, null otherwise
   */
  async verifyEmpCodeExists(empCode: string): Promise<{ exists: boolean; actualCode: string | null }> {
    try {
      const results = await this.sqlClient.select<{ employee_code: string }>(
        'employees',
        'employee_code',
        `employee_code = '${empCode}'`
      );
      return {
        exists: results.length > 0,
        actualCode: results.length > 0 ? results[0].employee_code : null,
      };
    } catch {
      return { exists: false, actualCode: null };
    }
  }

  /**
   * Convert deviceUserId to emp_code using the SSOT parser
   * plus exact long-ID lookup for long numeric IDs.
   *
   * Priority: SSOT parser -> HR master verification -> override/exact zkteco_user_id.
   *
   * Rule: Scanner prefix (500→C) in the ID takes PRIORITY over machineLocCode.
   * Long IDs (>5 digits) are never parsed by suffix; they only map by exact long ID.
   */
  async convertDeviceUserIdToEmpCodeAsync(
    deviceUserId: string,
    machineLocCode?: string,
    machineScannerCode?: number,
    machineCode?: string
  ): Promise<{ empCode: string; confidence: number; rule: string } | null> {
    const userId = deviceUserId.trim();
    if (!userId) return null;

    // SSOT: use new parser (scanner prefix in ID takes priority over machineLocCode)
    const result = parseZktecoUserIdToEmployeeCode({
      zktecoUserId: userId,
      machineLocCode: machineLocCode ?? null,
      machineScannerCode: machineScannerCode ?? null,
    });

    // If SSOT parser found a valid parsed code, verify it in HR master
    if (result.allowAutoMap && result.parsedEmployeeCode) {
      const verified = await this.verifyEmpCodeExists(result.parsedEmployeeCode);
      if (verified.exists) {
        const confidence = result.confidence === 'EXACT' ? 100
          : result.confidence === 'STRONG' ? 95
          : 85;
        return {
          empCode: verified.actualCode!,
          confidence,
          rule: result.reason,
        };
      }
      // Parsed code did not exist in HR master. Long IDs only fall through to exact lookup.
    }

    // Fallback: long numeric IDs (>5 digits) need exact lookup.
    // They must not be matched by suffix or parsed into a short employee code.
    if (/^\d+$/.test(userId) && userId.length > 5) {
      const direct = await this.resolveDirectDatabaseEmployeeCode(userId, machineCode, machineLocCode);
      if (direct) {
        return {
          empCode: direct,
          confidence: 100,
          rule: 'exact_long_raw_id_lookup',
        };
      }
    }

    return null;
  }

  /**
   * @deprecated Use convertDeviceUserIdToEmpCodeWithLookup() instead.
   *             This method is kept for backward compatibility only.
   *             It does NOT verify against HR master and uses old scanner prefix logic.
   */
  convertDeviceUserIdToEmpCode(
    deviceUserId: string,
    machineLocCode?: string,
    machineScannerCode?: number
  ): { empCode: string; confidence: number; rule: string } | null {
    const userId = deviceUserId.trim();
    if (!userId) return null;

    const result = parseZktecoUserIdToEmployeeCode({
      zktecoUserId: userId,
      machineLocCode: machineLocCode ?? null,
      machineScannerCode: machineScannerCode ?? null,
    });

    if (!result.allowAutoMap || !result.parsedEmployeeCode) {
      return null;
    }

    const confidence = result.confidence === 'EXACT' ? 100
      : result.confidence === 'STRONG' ? 95
      : 85;

    return {
      empCode: result.parsedEmployeeCode,
      confidence,
      rule: result.reason,
    };
  }

  /**
   * Create or update machine_user_map
   */
  async upsertMapping(data: {
    machine_id: number;
    machine_user_id: string;
    employee_id?: number;
    emp_code?: string;
    mapped_by_rule?: string;
    loc_code?: string;
    scanner_code?: number;
    confidence_score?: number;
  }): Promise<void> {
    // Check if mapping exists
    const existing = await this.sqlClient.select<MachineUserMap>(
      'machine_user_map',
      '*',
      `machine_id = ${data.machine_id} AND machine_user_id = '${data.machine_user_id}'`
    );

    if (existing.length > 0) {
      // Update existing
      await this.sqlClient.update(
        'machine_user_map',
        {
          employee_id: data.employee_id,
          emp_code: data.emp_code,
          mapped_by_rule: data.mapped_by_rule,
          loc_code: data.loc_code,
          scanner_code: data.scanner_code,
          confidence_score: data.confidence_score || 100,
          last_seen_at: new Date(),
          updated_at: new Date(),
        },
        `machine_id = ${data.machine_id} AND machine_user_id = '${data.machine_user_id}'`
      );
    } else {
      // Insert new
      await this.sqlClient.insert('machine_user_map', {
        ...data,
        mapped_source: 'SYSTEM',
        confidence_score: data.confidence_score || 100,
        is_active: true,
        first_seen_at: new Date(),
        last_seen_at: new Date(),
      });
    }
  }

  /**
   * Get emp_code for machine_user_id
   */
  async getEmpCode(machineId: number, machineUserId: string): Promise<string | null> {
    const results = await this.sqlClient.select<MachineUserMap>(
      'machine_user_map',
      'emp_code',
      `machine_id = ${machineId} AND machine_user_id = '${machineUserId}' AND is_active = 1`
    );
    return results[0]?.emp_code || null;
  }

  /**
   * Get all unmapped device users
   */
  async getUnmappedDeviceUsers(): Promise<Array<{
    machine_code: string;
    machine_user_id: string;
    total_scans: number;
    first_scan: Date;
    last_scan: Date;
  }>> {
    const sql = `
      SELECT 
        m.machine_code,
        l.machine_user_id,
        COUNT(*) AS total_scans,
        MIN(l.record_time) AS first_scan,
        MAX(l.record_time) AS last_scan
      FROM attendance_raw_log l
      JOIN mst_machine m ON l.machine_id = m.machine_id
      LEFT JOIN machine_user_map map 
        ON l.machine_id = map.machine_id 
        AND l.machine_user_id = map.machine_user_id
      WHERE map.map_id IS NULL
      GROUP BY m.machine_code, l.machine_user_id
      ORDER BY total_scans DESC
    `;

    return this.sqlClient.query(sql);
  }

  /**
   * Verify mapping manually
   */
  async verifyMapping(
    machineId: number,
    machineUserId: string,
    verifiedBy: string
  ): Promise<void> {
    await this.sqlClient.update(
      'machine_user_map',
      {
        verified_by: verifiedBy,
        verified_at: new Date(),
        confidence_score: 100,
        updated_at: new Date(),
      },
      `machine_id = ${machineId} AND machine_user_id = '${machineUserId}'`
    );
  }
}
