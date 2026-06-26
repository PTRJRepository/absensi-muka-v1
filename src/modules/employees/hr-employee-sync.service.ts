/**
 * HR Employee Sync Service
 *
 * Syncs employee data from db_ptrj.HR_EMPLOYEE to local employees table.
 * This is the authoritative source for HR-verified employee data.
 *
 * PRD: Refactor Master Employee - Sync HR from db_ptrj
 *
 * NOTE: This service uses db_ptrj via linked server through local SQL Server.
 * The HR_DB_SERVER env var must match the linked server name configured in SQL Server.
 */

import { query, execute, sql } from '../../lib/db';

export interface HREmployee {
  EmpCode: string;
  EmpName: string;
  NewICNo: string;
  LocCode: string;
  Status: string;
}

export interface SyncResult {
  batchId: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/** Linked server name for HR database (configured in SQL Server) */
const HR_DB_SERVER = process.env.HR_DB_SERVER ?? '10.0.0.110';
const HR_DB = `[${HR_DB_SERVER}].DB_PTRJ.dbo.HR_EMPLOYEE`;

/**
 * Generate unique batch ID for audit trail
 */
function generateBatchId(): string {
  return `HR_SYNC_${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

/**
 * Normalize employee code (trim, uppercase)
 */
function normalizeEmpCode(code: string): string {
  return code?.trim().toUpperCase() || '';
}

/**
 * Normalize employee name (trim, uppercase, remove extra spaces)
 */
function normalizeEmpName(name: string): string {
  return name?.trim().replace(/\s+/g, ' ').toUpperCase() || '';
}

/**
 * Normalize NIK (remove spaces, trim)
 */
function normalizeNik(nik: string): string {
  return nik?.trim().replace(/\s/g, '') || '';
}

/**
 * Map LocCode from HR to division_code
 * HR uses "P1A", "P2B" etc, we use single letter codes
 */
function mapLocCode(locCode: string): string {
  const loc = locCode?.trim().toUpperCase() || '';
  const locCodeMap: Record<string, string> = {
    'P1A': 'A',
    'P1B': 'B',
    'P2A': 'C',
    'P2B': 'D',
    'DME': 'E',
    'ARA': 'F',
    'AB1': 'G',
    'AB2': 'H',
    'ARC': 'J',
    'IJL': 'L',
  };
  return locCodeMap[loc] || loc.charAt(0);
}

/**
 * Map HR Status to employment status
 */
function mapHrStatus(status: string): string {
  const s = status?.trim() || '';
  // Status '1' = Active in HR
  if (s === '1') return 'ACTIVE';
  if (s === '3' || s === '4') return 'INACTIVE';
  return 'UNKNOWN';
}

/**
 * Check if employee is active in HR
 */
function isActiveInHr(status: string): boolean {
  return status?.trim() === '1';
}

/**
 * Sync all employees from db_ptrj
 * This is idempotent - safe to run multiple times
 */
export async function syncHrEmployees(): Promise<SyncResult> {
  const batchId = generateBatchId();
  const result: SyncResult = {
    batchId,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  try {
    console.log(`[HR Sync] Starting batch ${batchId}`);

    // 1. Get all employees from HR database
    const hrEmployees = await query<HREmployee>(`
      SELECT
        LTRIM(RTRIM(EmpCode)) as EmpCode,
        LTRIM(RTRIM(EmpName)) as EmpName,
        LTRIM(RTRIM(REPLACE(NewICNo, ' ', ''))) as NewICNo,
        LTRIM(RTRIM(LocCode)) as LocCode,
        LTRIM(RTRIM(Status)) as Status
      FROM ${HR_DB}
      WHERE EmpCode IS NOT NULL AND EmpCode != ''
    `);

    console.log(`[HR Sync] Found ${hrEmployees.length} employees in db_ptrj`);

    // 2. Get existing local employees
    const existingEmployees = await query<{ employee_code: string; id: number }>(`
      SELECT employee_code, id FROM employees WHERE employee_code IS NOT NULL
    `);
    const existingMap = new Map(
      existingEmployees.map(e => [e.employee_code.toUpperCase(), e.id])
    );

    // 3. Get divisions for FK — key by division_code (P1A, P2B, etc.)
    const divisions = await query<{ division_code: string; id: number }>(`
      SELECT division_code, id FROM divisions
    `);
    // Also build a map by loc_code (A, B, C...) for parsed_division_code fallback
    const locCodeMap = new Map<string, number>();
    const divisionCodeMap = new Map<string, number>();
    divisions.forEach(d => {
      divisionCodeMap.set(d.division_code.toUpperCase(), d.id);
    });

    // 4. Process each HR employee
    for (const hr of hrEmployees) {
      try {
        const empCode = normalizeEmpCode(hr.EmpCode);
        const empName = normalizeEmpName(hr.EmpName);
        const nik = normalizeNik(hr.NewICNo);
        const locCode = normalizeEmpCode(hr.LocCode);
        const divisionCode = mapLocCode(hr.LocCode);
        const hrStatus = mapHrStatus(hr.Status);
        const isActive = isActiveInHr(hr.Status);

        // Get division_id — look up by raw locCode (P1A, P2B) NOT the single-letter mapped value
        // divisionCodeMap key = division_code (P1A, P2B, DME, etc.)
        const divisionId = divisionCodeMap.get(locCode.toUpperCase()) || null;

        const existingId = existingMap.get(empCode);

        if (existingId) {
          // UPDATE existing employee
          await execute(`
            UPDATE employees
            SET
              employee_name = @empName,
              nik = @nik,
              hr_employee_code = @empCode,
              hr_loc_code = @locCode,
              hr_status = @hrStatus,
              hr_verified = 1,
              hr_verified_at = SYSUTCDATETIME(),
              employment_status = @hrStatus,
              is_active = @isActive,
              data_quality_status = 'VALID_STANDARD_FORMAT',
              data_quality_reason = 'HR Verified from db_ptrj',
              updated_at = SYSUTCDATETIME()
            WHERE id = @id
          `, [
            { name: 'id', type: sql.Int, value: existingId },
            { name: 'empName', type: sql.NVarChar, value: empName },
            { name: 'nik', type: sql.NVarChar, value: nik || null },
            { name: 'empCode', type: sql.NVarChar, value: empCode },
            { name: 'locCode', type: sql.NVarChar, value: locCode },
            { name: 'hrStatus', type: sql.NVarChar, value: hrStatus },
            { name: 'isActive', type: sql.Bit, value: isActive },
          ]);
          result.updated++;

          // Write audit
          await writeAudit(batchId, empCode, 'UPDATE', null, null, 'SUCCESS', 'Updated from HR');
        } else {
          // INSERT new employee
          await execute(`
            INSERT INTO employees (
              employee_code, employee_name, division_id, nik,
              hr_employee_code, hr_loc_code, hr_status,
              hr_verified, hr_verified_at,
              employment_status, is_active,
              data_quality_status, data_quality_reason,
              first_seen_at, last_seen_at
            ) VALUES (
              @empCode, @empName, @divisionId, @nik,
              @empCode, @locCode, @hrStatus,
              1, SYSUTCDATETIME(),
              @hrStatus, @isActive,
              'VALID_STANDARD_FORMAT', 'HR Verified from db_ptrj',
              SYSUTCDATETIME(), SYSUTCDATETIME()
            )
          `, [
            { name: 'empCode', type: sql.NVarChar, value: empCode },
            { name: 'empName', type: sql.NVarChar, value: empName },
            { name: 'divisionId', type: sql.Int, value: divisionId },
            { name: 'nik', type: sql.NVarChar, value: nik || null },
            { name: 'locCode', type: sql.NVarChar, value: locCode },
            { name: 'hrStatus', type: sql.NVarChar, value: hrStatus },
            { name: 'isActive', type: sql.Bit, value: isActive },
          ]);
          result.inserted++;

          // Write audit
          await writeAudit(batchId, empCode, 'INSERT', null, null, 'SUCCESS', 'New employee from HR');
        }
      } catch (err) {
        const error = err as Error;
        result.errors.push(`${hr.EmpCode}: ${error.message}`);
        await writeAudit(batchId, hr.EmpCode, 'ERROR', null, null, 'ERROR', error.message);
      }
    }

    // 5. Deactivate employees that no longer exist in HR
    await execute(`
      UPDATE employees
      SET
        is_active = 0,
        employment_status = 'INACTIVE',
        hr_verified = 0,
        data_quality_status = 'NOT_IN_HR',
        data_quality_reason = 'Employee no longer found in db_ptrj.HR_EMPLOYEE',
        updated_at = SYSUTCDATETIME()
      WHERE hr_verified = 1
        AND employee_code NOT IN (
          SELECT LTRIM(RTRIM(EmpCode)) FROM ${HR_DB}
        )
        AND is_active = 1
    `);

    const deactivated = await query<{ count: number }>(`
      SELECT COUNT(*) as count FROM employees
      WHERE data_quality_status = 'NOT_IN_HR'
        AND updated_at >= DATEADD(MINUTE, -1, SYSUTCDATETIME())
    `);
    result.skipped = deactivated[0]?.count || 0;

    console.log(`[HR Sync] Batch ${batchId} completed:`, result);
  } catch (err) {
    const error = err as Error;
    result.errors.push(`Batch failed: ${error.message}`);
    console.error(`[HR Sync] Batch ${batchId} failed:`, error);
  }

  return result;
}

/**
 * Write audit record
 */
async function writeAudit(
  batchId: string,
  employeeCode: string,
  actionType: string,
  oldValue: string | null,
  newValue: string | null,
  status: string,
  reason: string
): Promise<void> {
  try {
    await execute(`
      INSERT INTO employee_hr_sync_audit (
        sync_batch_id, employee_code, action_type,
        old_value, new_value, sync_status, sync_reason
      ) VALUES (
        @batchId, @empCode, @actionType,
        @oldValue, @newValue, @status, @reason
      )
    `, [
      { name: 'batchId', type: sql.NVarChar, value: batchId },
      { name: 'empCode', type: sql.NVarChar, value: employeeCode },
      { name: 'actionType', type: sql.NVarChar, value: actionType },
      { name: 'oldValue', type: sql.NVarChar, value: oldValue },
      { name: 'newValue', type: sql.NVarChar, value: newValue },
      { name: 'status', type: sql.NVarChar, value: status },
      { name: 'reason', type: sql.NVarChar, value: reason },
    ]);
  } catch {
    // Audit write failure is not critical
  }
}

/**
 * Get sync status
 */
export async function getSyncStatus(): Promise<{
  lastSyncBatch?: string;
  lastSyncAt?: Date;
  stats: {
    total: number;
    verified: number;
    notVerified: number;
    active: number;
    inactive: number;
    hasNik: number;
    noNik: number;
  };
}> {
  const stats = await query<{
    total: number;
    verified: number;
    notVerified: number;
    active: number;
    inactive: number;
    hasNik: number;
    noNik: number;
    lastBatchId: string | null;
    lastSyncAt: Date | null;
  }>(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN hr_verified = 1 THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN hr_verified = 0 THEN 1 ELSE 0 END) as notVerified,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive,
      SUM(CASE WHEN nik IS NOT NULL AND nik != '' THEN 1 ELSE 0 END) as hasNik,
      SUM(CASE WHEN nik IS NULL OR nik = '' THEN 1 ELSE 0 END) as noNik,
      (SELECT TOP 1 sync_batch_id FROM employee_hr_sync_audit ORDER BY created_at DESC) as lastBatchId,
      (SELECT TOP 1 created_at FROM employee_hr_sync_audit ORDER BY created_at DESC) as lastSyncAt
    FROM employees
  `);

  const s = stats[0] || {
    total: 0, verified: 0, notVerified: 0,
    active: 0, inactive: 0, hasNik: 0, noNik: 0,
    lastBatchId: null, lastSyncAt: null,
  };

  return {
    lastSyncBatch: s.lastBatchId || undefined,
    lastSyncAt: s.lastSyncAt || undefined,
    stats: {
      total: s.total,
      verified: s.verified,
      notVerified: s.notVerified,
      active: s.active,
      inactive: s.inactive,
      hasNik: s.hasNik,
      noNik: s.noNik,
    },
  };
}
