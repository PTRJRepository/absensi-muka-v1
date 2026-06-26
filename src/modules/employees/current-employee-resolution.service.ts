/**
 * Current Employee Resolution Service
 *
 * Resolves currentEmpCode from parsedCode using NIK-based lookup.
 * This service handles the case where an employee's code may have changed
 * over time, and we need to resolve the current (latest) employee code.
 *
 * Flow:
 *   raw_device_user_id → parsedCode → lookup HR_EMPLOYEE by parsedCode → get NewICNo (NIK)
 *   → lookup hr_employee_current_snapshot by NIK → currentEmpCode
 *
 * Resolution Status Values:
 *   MAPPED_CURRENT              - Successfully resolved to current employee
 *   PARSED_ONLY                 - parsedCode exists, not yet resolved
 *   PARSED_CODE_NOT_FOUND_IN_HR - parsedCode not in HR_EMPLOYEE
 *   NIK_NOT_FOUND               - parsedCode found, but NewICNo empty
 *   CURRENT_EMP_NOT_FOUND       - NIK found in HR, but no current row
 *   NIK_DUPLICATE_AMBIGUOUS     - Multiple active rows, ambiguous
 *   NEED_REVIEW_CURRENT         - Manual review required
 *   MANUAL_OVERRIDE_CURRENT    - Admin forced mapping
 */

import { query, sql } from '../../lib/db';

// ⚠️ DEPRECATED SERVICE — Not used in current production pipeline
// Linked server name for HR database (configured in SQL Server)
const HR_DB_SERVER = process.env.HR_DB_SERVER ?? '10.0.0.110';
const HR_DB = `[${HR_DB_SERVER}].DB_PTRJ.dbo.HR_EMPLOYEE`;

/**
 * Resolution status types
 */
export type CurrentResolutionStatus =
  | 'MAPPED_CURRENT'                   // Successfully resolved
  | 'PARSED_ONLY'                      // parsedCode exists, not yet resolved
  | 'PARSED_CODE_NOT_FOUND_IN_HR'      // parsedCode not in HR_EMPLOYEE
  | 'NIK_NOT_FOUND'                    // parsedCode found, but NewICNo empty
  | 'CURRENT_EMP_NOT_FOUND'            // NIK found, but no current row
  | 'NIK_DUPLICATE_AMBIGUOUS'          // Multiple active rows, ambiguous
  | 'NEED_REVIEW_CURRENT'             // Manual review required
  | 'MANUAL_OVERRIDE_CURRENT';         // Admin forced mapping

/**
 * Interface for current resolution result
 */
export interface CurrentResolutionResult {
  /** Normalized NIK (NewICNo) */
  resolvedNik: string | null;
  /** Current employee code from hr_employee_current_snapshot */
  currentEmpCode: string | null;
  /** Current employee name */
  currentEmpName: string | null;
  /** HR status (1=Active, 3/4=Inactive, etc.) */
  currentHrStatus: string | null;
  /** Location code */
  currentHrLocCode: string | null;
  /** Create date from HR */
  currentHrCreateDate: Date | null;
  /** Update date from HR */
  currentHrUpdateDate: Date | null;
  /** Resolution status */
  resolutionStatus: CurrentResolutionStatus;
  /** Method used for resolution */
  resolutionMethod: string | null;
  /** Reason for the resolution status */
  resolutionReason: string | null;
  /** Resolution timestamp */
  resolvedAt: Date;
}

/**
 * Interface for code history entry
 */
export interface CodeHistoryEntry {
  nik: string;
  empCode: string;
  empName: string | null;
  locCode: string | null;
  hrStatus: string | null;
  createDate: Date | null;
  updateDate: Date | null;
  isCurrent: boolean;
  sourceTable: string;
  syncedAt: Date;
}

/**
 * Interface for HR_EMPLOYEE row from external database
 */
interface HREmployeeRow {
  EmpCode: string;
  EmpName: string;
  NewICNo: string;
  LocCode: string;
  Status: string;
  CreateDate: Date | null;
  UpdateDate: Date | null;
}

/**
 * Interface for hr_employee_current_snapshot row
 */
interface CurrentSnapshotRow {
  nik: string;
  current_emp_code: string;
  current_emp_name: string | null;
  current_loc_code: string | null;
  current_status: string | null;
  current_create_date: Date | null;
  current_update_date: Date | null;
  is_ambiguous: number;
  ambiguity_reason: string | null;
}

/**
 * Interface for employee_code_history row
 */
interface CodeHistoryRow {
  nik: string;
  emp_code: string;
  emp_name: string | null;
  loc_code: string | null;
  hr_status: string | null;
  create_date: Date | null;
  update_date: Date | null;
  is_current: number;
  source_table: string;
  synced_at: Date;
}

/**
 * Normalize NIK: trim whitespace and remove extra spaces
 */
function normalizeNik(nik: string): string {
  return nik.trim().replace(/\s+/g, '');
}

/**
 * Log resolution attempt for debugging
 */
function logResolution(
  operation: string,
  parsedCode: string,
  status: CurrentResolutionStatus,
  details?: Record<string, unknown>
): void {
  console.log(
    `[CurrentResolution] ${operation} | parsedCode=${parsedCode} | status=${status}`,
    details || ''
  );
}

/**
 * Create a default resolution result for failures
 */
function createFailedResult(
  parsedCode: string,
  status: CurrentResolutionStatus,
  reason: string,
  resolvedNik: string | null = null
): CurrentResolutionResult {
  logResolution('resolve', parsedCode, status, { reason, resolvedNik });
  return {
    resolvedNik,
    currentEmpCode: null,
    currentEmpName: null,
    currentHrStatus: null,
    currentHrLocCode: null,
    currentHrCreateDate: null,
    currentHrUpdateDate: null,
    resolutionStatus: status,
    resolutionMethod: null,
    resolutionReason: reason,
    resolvedAt: new Date(),
  };
}

/**
 * Current Employee Resolution Service
 *
 * Handles resolution of current employee codes from parsed codes.
 * Uses NIK (NewICNo) as the linking key between historical and current records.
 */
export class CurrentEmployeeResolutionService {
  /**
   * Registry for caching resolved results (in-memory cache)
   * Key: parsedCode, Value: CurrentResolutionResult
   */
  private resolutionCache: Map<string, CurrentResolutionResult> = new Map();

  /**
   * Clear the resolution cache
   */
  clearCache(): void {
    this.resolutionCache.clear();
    console.log('[CurrentResolution] Cache cleared');
  }

  /**
   * Get from cache if available and marked as MAPPED_CURRENT
   */
  private getFromCache(parsedCode: string): CurrentResolutionResult | null {
    const cached = this.resolutionCache.get(parsedCode);
    if (cached && cached.resolutionStatus === 'MAPPED_CURRENT') {
      return cached;
    }
    return null;
  }

  /**
   * Store result in cache
   */
  private storeInCache(parsedCode: string, result: CurrentResolutionResult): void {
    // Store in memory cache (bounded to prevent memory issues)
    if (this.resolutionCache.size > 10000) {
      // Clear oldest entries when cache is full
      const keysToDelete = Array.from(this.resolutionCache.keys()).slice(0, 1000);
      keysToDelete.forEach((key) => this.resolutionCache.delete(key));
    }
    this.resolutionCache.set(parsedCode, result);
  }

  /**
   * Resolve current employee code from parsed code.
   *
   * Flow:
   * 1. Check cache for existing MAPPED_CURRENT result
   * 2. Lookup parsedCode in db_ptrj.HR_EMPLOYEE → get NewICNo (NIK)
   * 3. If NewICNo empty → PARSED_CODE_NOT_FOUND_IN_HR or NIK_NOT_FOUND
   * 4. Lookup hr_employee_current_snapshot by NIK → get current_emp_code
   * 5. If NIK ambiguous → NIK_DUPLICATE_AMBIGUOUS
   * 6. Return MAPPED_CURRENT with currentEmpCode
   *
   * @param parsedCode - The parsed employee code (e.g., 'A0044', 'C0232')
   * @returns CurrentResolutionResult with resolution details
   */
  async resolveCurrentEmpCode(parsedCode: string): Promise<CurrentResolutionResult> {
    const normalizedParsedCode = parsedCode.trim().toUpperCase();

    if (!normalizedParsedCode) {
      return createFailedResult(
        parsedCode,
        'PARSED_CODE_NOT_FOUND_IN_HR',
        'Empty parsed code provided'
      );
    }

    // Step 1: Check cache
    const cached = this.getFromCache(normalizedParsedCode);
    if (cached) {
      logResolution('resolve', normalizedParsedCode, 'MAPPED_CURRENT', {
        cached: true,
        currentEmpCode: cached.currentEmpCode,
      });
      return cached;
    }

    logResolution('resolve', normalizedParsedCode, 'PARSED_ONLY', { step: 'lookup_hr' });

    // Step 2: Lookup parsedCode in HR_EMPLOYEE to get NewICNo
    const hrEmployee = await this.lookupHrEmployeeByEmpCode(normalizedParsedCode);

    if (!hrEmployee) {
      const result = createFailedResult(
        normalizedParsedCode,
        'PARSED_CODE_NOT_FOUND_IN_HR',
        `Employee code '${normalizedParsedCode}' not found in HR_EMPLOYEE table`
      );
      this.storeInCache(normalizedParsedCode, result);
      return result;
    }

    // Step 3: Extract and normalize NIK
    const resolvedNik = normalizeNik(hrEmployee.NewICNo);

    if (!resolvedNik) {
      const result = createFailedResult(
        normalizedParsedCode,
        'NIK_NOT_FOUND',
        `Employee code '${normalizedParsedCode}' found in HR but NewICNo (NIK) is empty`,
        null
      );
      this.storeInCache(normalizedParsedCode, result);
      return result;
    }

    logResolution('resolve', normalizedParsedCode, 'NIK_NOT_FOUND', {
      resolvedNik,
      step: 'lookup_snapshot',
    });

    // Step 4: Lookup hr_employee_current_snapshot by NIK
    const snapshot = await this.lookupCurrentSnapshotByNik(resolvedNik);

    if (!snapshot) {
      const result = createFailedResult(
        normalizedParsedCode,
        'CURRENT_EMP_NOT_FOUND',
        `NIK '${resolvedNik}' not found in hr_employee_current_snapshot`,
        resolvedNik
      );
      this.storeInCache(normalizedParsedCode, result);
      return result;
    }

    // Step 5: Check for ambiguity
    if (snapshot.is_ambiguous === 1) {
      const result: CurrentResolutionResult = {
        resolvedNik,
        currentEmpCode: snapshot.current_emp_code,
        currentEmpName: snapshot.current_emp_name,
        currentHrStatus: snapshot.current_status,
        currentHrLocCode: snapshot.current_loc_code,
        currentHrCreateDate: snapshot.current_create_date,
        currentHrUpdateDate: snapshot.current_update_date,
        resolutionStatus: 'NIK_DUPLICATE_AMBIGUOUS',
        resolutionMethod: 'snapshot_lookup_ambiguous',
        resolutionReason:
          snapshot.ambiguity_reason ||
          `NIK '${resolvedNik}' has multiple active rows - tiebreaker used: UpdateDate DESC, CreateDate DESC, EmpCode DESC`,
        resolvedAt: new Date(),
      };
      logResolution('resolve', normalizedParsedCode, 'NIK_DUPLICATE_AMBIGUOUS', {
        resolvedNik,
        currentEmpCode: snapshot.current_emp_code,
      });
      this.storeInCache(normalizedParsedCode, result);
      return result;
    }

    // Step 6: Successfully resolved
    const result: CurrentResolutionResult = {
      resolvedNik,
      currentEmpCode: snapshot.current_emp_code,
      currentEmpName: snapshot.current_emp_name,
      currentHrStatus: snapshot.current_status,
      currentHrLocCode: snapshot.current_loc_code,
      currentHrCreateDate: snapshot.current_create_date,
      currentHrUpdateDate: snapshot.current_update_date,
      resolutionStatus: 'MAPPED_CURRENT',
      resolutionMethod: 'snapshot_lookup',
      resolutionReason: `Successfully resolved via NIK '${resolvedNik}' from hr_employee_current_snapshot`,
      resolvedAt: new Date(),
    };

    logResolution('resolve', normalizedParsedCode, 'MAPPED_CURRENT', {
      resolvedNik,
      currentEmpCode: snapshot.current_emp_code,
      currentEmpName: snapshot.current_emp_name,
    });

    this.storeInCache(normalizedParsedCode, result);
    return result;
  }

  /**
   * Resolve current employee code from raw device user ID.
   *
   * This is a convenience method that first parses the raw ID to get the
   * parsed code, then resolves the current employee code.
   *
   * Note: This method requires the raw device user ID to be a valid
   * 5-digit scanner ID that can be parsed to an employee code.
   * For example: '50044' → parsedCode 'C0044' → resolve current
   *
   * @param rawDeviceUserId - Raw device user ID (e.g., '50044')
   * @returns CurrentResolutionResult with resolution details
   */
  async resolveByRawId(rawDeviceUserId: string): Promise<CurrentResolutionResult> {
    const normalizedRawId = rawDeviceUserId.trim();

    if (!normalizedRawId) {
      return createFailedResult(
        rawDeviceUserId,
        'PARSED_CODE_NOT_FOUND_IN_HR',
        'Empty raw device user ID provided'
      );
    }

    // Parse raw ID to employee code using scanner prefix logic
    const parsedCode = this.parseRawDeviceUserId(normalizedRawId);

    if (!parsedCode) {
      return createFailedResult(
        normalizedRawId,
        'NEED_REVIEW_CURRENT',
        `Raw device user ID '${normalizedRawId}' cannot be parsed to employee code (need manual review)`
      );
    }

    logResolution('resolveByRawId', normalizedRawId, 'PARSED_ONLY', {
      parsedCode,
    });

    // Delegate to resolveCurrentEmpCode
    return this.resolveCurrentEmpCode(parsedCode);
  }

  /**
   * Parse raw device user ID to employee code using scanner prefix logic.
   *
   * Scanner prefix → locCode mapping:
   *   100 → A (P1A)
   *   200 → J (ARC)
   *   300 → B (P1B)
   *   400 → H (AB2)
   *   500 → C (P2A)
   *   600 → D (P2B)
   *   700 → E (DME)
   *   800 → F (ARA)
   *   900 → G (AB1)
   *
   * @param rawDeviceUserId - Raw device user ID (e.g., '50044')
   * @returns Parsed employee code (e.g., 'C0044') or null if cannot parse
   */
  private parseRawDeviceUserId(rawDeviceUserId: string): string | null {
    // Must be numeric and at least 5 digits
    if (!/^\d+$/.test(rawDeviceUserId) || rawDeviceUserId.length < 5) {
      return null;
    }

    const scannerPrefixLocMap: Record<string, string> = {
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

    const prefix = rawDeviceUserId.substring(0, 3);
    const locCode = scannerPrefixLocMap[prefix];

    if (!locCode) {
      return null;
    }

    // Get last 4 digits and pad with zeros
    const suffix = rawDeviceUserId.slice(-4).padStart(4, '0');
    return `${locCode}${suffix}`;
  }

  /**
   * Get code history by NIK.
   *
   * Returns all employee codes that have been associated with the given NIK
   * over time, ordered by is_current DESC, then by synced_at DESC.
   *
   * @param nik - Normalized NIK (NewICNo)
   * @returns Array of CodeHistoryEntry sorted by recency
   */
  async getCodeHistoryByNik(nik: string): Promise<CodeHistoryEntry[]> {
    const normalizedNik = normalizeNik(nik);

    if (!normalizedNik) {
      console.warn(`[CurrentResolution] getCodeHistoryByNik: empty NIK provided`);
      return [];
    }

    const rows = await query<CodeHistoryRow>(
      `SELECT
        nik,
        emp_code,
        emp_name,
        loc_code,
        hr_status,
        create_date,
        update_date,
        is_current,
        source_table,
        synced_at
      FROM dbo.employee_code_history
      WHERE nik = @nik
      ORDER BY is_current DESC, update_date DESC, create_date DESC, emp_code DESC`,
      [{ name: 'nik', type: sql.NVarChar, value: normalizedNik }]
    );

    return rows.map((row) => ({
      nik: row.nik,
      empCode: row.emp_code,
      empName: row.emp_name,
      locCode: row.loc_code,
      hrStatus: row.hr_status,
      createDate: row.create_date,
      updateDate: row.update_date,
      isCurrent: row.is_current === 1,
      sourceTable: row.source_table,
      syncedAt: row.synced_at,
    }));
  }

  /**
   * Batch resolve multiple parsed codes.
   *
   * Uses the resolution cascade for each code and returns a Map
   * for efficient lookup.
   *
   * @param parsedCodes - Array of parsed employee codes
   * @returns Map of parsedCode → CurrentResolutionResult
   */
  async batchResolve(
    parsedCodes: string[]
  ): Promise<Map<string, CurrentResolutionResult>> {
    const results = new Map<string, CurrentResolutionResult>();
    const uncachedCodes: string[] = [];

    // Check cache first
    for (const code of parsedCodes) {
      const normalized = code.trim().toUpperCase();
      if (!normalized) continue;

      const cached = this.getFromCache(normalized);
      if (cached) {
        results.set(normalized, cached);
      } else {
        uncachedCodes.push(normalized);
      }
    }

    // Process uncached codes in batches
    const batchSize = 50;
    for (let i = 0; i < uncachedCodes.length; i += batchSize) {
      const batch = uncachedCodes.slice(i, i + batchSize);
      const batchResults = await this.batchResolveFromDb(batch);

      for (const [code, result] of Array.from(batchResults.entries())) {
        results.set(code, result);
        this.storeInCache(code, result);
      }
    }

    return results;
  }

  /**
   * Batch resolve from database (internal method)
   */
  private async batchResolveFromDb(
    parsedCodes: string[]
  ): Promise<Map<string, CurrentResolutionResult>> {
    const results = new Map<string, CurrentResolutionResult>();

    if (parsedCodes.length === 0) {
      return results;
    }

    // Step 1: Batch lookup in HR_EMPLOYEE
    const empCodeList = parsedCodes.map((code) => `'${code.replace(/'/g, "''")}'`).join(',');

    const hrEmployees = await query<{
      EmpCode: string;
      NewICNo: string;
    }>(
      `SELECT
        RTRIM(LTRIM(EmpCode)) AS EmpCode,
        RTRIM(LTRIM(REPLACE(NewICNo, ' ', ''))) AS NewICNo
      FROM ${HR_DB}
      WHERE RTRIM(LTRIM(EmpCode)) IN (${empCodeList})`,
      []
    );

    const hrEmployeeMap = new Map<string, string>();
    const notFoundInHr = new Set<string>();

    for (const emp of hrEmployees) {
      hrEmployeeMap.set(emp.EmpCode, normalizeNik(emp.NewICNo));
    }

    for (const code of parsedCodes) {
      if (!hrEmployeeMap.has(code)) {
        notFoundInHr.add(code);
        results.set(
          code,
          createFailedResult(
            code,
            'PARSED_CODE_NOT_FOUND_IN_HR',
            `Employee code '${code}' not found in HR_EMPLOYEE table`
          )
        );
      }
    }

    // Step 2: Batch lookup in hr_employee_current_snapshot
    const niksToLookup = Array.from(hrEmployeeMap.entries())
      .filter(([code]) => !notFoundInHr.has(code) && hrEmployeeMap.get(code))
      .map(([, nik]) => nik)
      .filter((nik) => nik.length > 0);

    if (niksToLookup.length > 0) {
      const nikList = niksToLookup.map((nik) => `'${nik.replace(/'/g, "''")}'`).join(',');

      const snapshots = await query<CurrentSnapshotRow>(
        `SELECT
          nik,
          current_emp_code,
          current_emp_name,
          current_loc_code,
          current_status,
          current_create_date,
          current_update_date,
          is_ambiguous,
          ambiguity_reason
        FROM dbo.hr_employee_current_snapshot
        WHERE nik IN (${nikList})`,
        []
      );

      const snapshotMap = new Map<string, CurrentSnapshotRow>();
      for (const snap of snapshots) {
        snapshotMap.set(snap.nik, snap);
      }

      // Map empCode → result
      for (const [empCode, nik] of Array.from(hrEmployeeMap.entries())) {
        if (notFoundInHr.has(empCode)) continue;

        if (!nik) {
          results.set(
            empCode,
            createFailedResult(
              empCode,
              'NIK_NOT_FOUND',
              `Employee code '${empCode}' found in HR but NewICNo (NIK) is empty`,
              null
            )
          );
          continue;
        }

        const snapshot = snapshotMap.get(nik);

        if (!snapshot) {
          results.set(
            empCode,
            createFailedResult(
              empCode,
              'CURRENT_EMP_NOT_FOUND',
              `NIK '${nik}' not found in hr_employee_current_snapshot`,
              nik
            )
          );
          continue;
        }

        if (snapshot.is_ambiguous === 1) {
          results.set(empCode, {
            resolvedNik: nik,
            currentEmpCode: snapshot.current_emp_code,
            currentEmpName: snapshot.current_emp_name,
            currentHrStatus: snapshot.current_status,
            currentHrLocCode: snapshot.current_loc_code,
            currentHrCreateDate: snapshot.current_create_date,
            currentHrUpdateDate: snapshot.current_update_date,
            resolutionStatus: 'NIK_DUPLICATE_AMBIGUOUS',
            resolutionMethod: 'snapshot_lookup_ambiguous',
            resolutionReason:
              snapshot.ambiguity_reason ||
              `NIK '${nik}' has multiple active rows - tiebreaker used`,
            resolvedAt: new Date(),
          });
          continue;
        }

        // Successfully resolved
        results.set(empCode, {
          resolvedNik: nik,
          currentEmpCode: snapshot.current_emp_code,
          currentEmpName: snapshot.current_emp_name,
          currentHrStatus: snapshot.current_status,
          currentHrLocCode: snapshot.current_loc_code,
          currentHrCreateDate: snapshot.current_create_date,
          currentHrUpdateDate: snapshot.current_update_date,
          resolutionStatus: 'MAPPED_CURRENT',
          resolutionMethod: 'snapshot_lookup',
          resolutionReason: `Successfully resolved via NIK '${nik}' from hr_employee_current_snapshot`,
          resolvedAt: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * Lookup employee in HR_EMPLOYEE by employee code
   */
  private async lookupHrEmployeeByEmpCode(
    empCode: string
  ): Promise<HREmployeeRow | null> {
    const rows = await query<HREmployeeRow>(
      `SELECT TOP 1
        RTRIM(LTRIM(EmpCode)) AS EmpCode,
        RTRIM(LTRIM(EmpName)) AS EmpName,
        RTRIM(LTRIM(REPLACE(NewICNo, ' ', ''))) AS NewICNo,
        RTRIM(LTRIM(LocCode)) AS LocCode,
        RTRIM(LTRIM(Status)) AS Status,
        CreateDate,
        UpdateDate
      FROM ${HR_DB}
      WHERE RTRIM(LTRIM(EmpCode)) = @empCode`,
      [{ name: 'empCode', type: sql.NVarChar, value: empCode }]
    );

    return rows[0] || null;
  }

  /**
   * Lookup current snapshot by NIK
   */
  private async lookupCurrentSnapshotByNik(nik: string): Promise<CurrentSnapshotRow | null> {
    const rows = await query<CurrentSnapshotRow>(
      `SELECT TOP 1
        nik,
        current_emp_code,
        current_emp_name,
        current_loc_code,
        current_status,
        current_create_date,
        current_update_date,
        is_ambiguous,
        ambiguity_reason
      FROM dbo.hr_employee_current_snapshot
      WHERE nik = @nik`,
      [{ name: 'nik', type: sql.NVarChar, value: nik }]
    );

    return rows[0] || null;
  }

  /**
   * Get resolution statistics
   */
  async getResolutionStats(): Promise<{
    totalSnapshots: number;
    ambiguousNik: number;
    totalHistoryRows: number;
    cacheSize: number;
  }> {
    const [snapshotStats] = await query<{ total: number; ambiguous: number }>(`
      SELECT
        COUNT(*) AS total,
        SUM(is_ambiguous) AS ambiguous
      FROM dbo.hr_employee_current_snapshot
    `);

    const [historyCount] = await query<{ count: number }>(`
      SELECT COUNT(*) AS count FROM dbo.employee_code_history
    `);

    return {
      totalSnapshots: snapshotStats?.total || 0,
      ambiguousNik: snapshotStats?.ambiguous || 0,
      totalHistoryRows: historyCount?.count || 0,
      cacheSize: this.resolutionCache.size,
    };
  }
}

// Default singleton instance for convenience
export const currentEmployeeResolutionService = new CurrentEmployeeResolutionService();
