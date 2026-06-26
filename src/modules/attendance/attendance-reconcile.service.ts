/**
 * Attendance Reconcile Service
 *
 * Reconciles attendance data across different sources (machine, API, manual).
 * Primary sorting logic: employee home division (from emp_code prefix) takes
 * priority over scan location. "Machine location != employee division".
 *
 * Sorting statuses:
 *   MATCH_HOME_DIVISION  — home matches scan location
 *   CROSS_DIVISION_MOVED — home exists, differs from scan location
 *   NO_HOME_DIVISION     — no home division found from emp_code prefix
 *   UNMAPPED_EMPLOYEE    — device user not mapped to emp_code
 *   NEED_MANUAL_REVIEW   — cannot determine automatically
 */

import { SqlClient } from '../../shared/database/sql-client';
import { EmployeeMovementService } from '../employees/employee-movement.service';

export type SortingStatus =
  | 'MATCH_HOME_DIVISION'
  | 'CROSS_DIVISION_MOVED'
  | 'NO_HOME_DIVISION'
  | 'UNMAPPED_EMPLOYEE'
  | 'NEED_MANUAL_REVIEW';

export type SortingRule =
  | 'HOME_DIVISION_PRIORITY'
  | 'API_FALLBACK'
  | 'SCAN_LOCATION_FALLBACK'
  | 'NEEDS_REVIEW';

export interface ReconcileResult {
  process_id: number;
  employee_id: number;
  emp_code: string;
  work_date: Date;
  expected_division?: string;
  detected_division?: string;
  api_division?: string;
  final_division?: string;
  match_status: SortingStatus;
  sorting_status?: string;
  sorting_rule?: SortingRule;
  sorting_note?: string | null;
  is_cross_division_scan?: boolean;
  need_review?: boolean;
  confidence_score: number;
}

export class AttendanceReconcileService {
  constructor(
    private sqlClient: SqlClient,
    private movementService: EmployeeMovementService
  ) {}

  /**
   * Reconcile attendance for specific date range
   */
  async reconcileDateRange(dateFrom: Date, dateTo: Date): Promise<{
    total: number;
    matched: number;
    mismatched: number;
    needReview: number;
  }> {
    const sql = `
      SELECT process_id, employee_id, emp_code, work_date, final_division_id
      FROM attendance_daily_process
      WHERE work_date >= '${this.formatDate(dateFrom)}'
        AND work_date <= '${this.formatDate(dateTo)}'
        AND reconcile_status = 'PENDING'
    `;

    const processes = await this.sqlClient.query<{
      process_id: number;
      employee_id: number;
      emp_code: string;
      work_date: Date;
      final_division_id?: number;
    }>(sql);

    let matched = 0;
    let mismatched = 0;
    let needReview = 0;

    for (const process of processes) {
      const result = await this.reconcileProcess(process);

      if (result.match_status === 'MATCH_HOME_DIVISION') {
        matched++;
      } else if (
        result.match_status === 'NEED_MANUAL_REVIEW' ||
        result.match_status === 'UNMAPPED_EMPLOYEE'
      ) {
        needReview++;
      } else {
        mismatched++;
      }
    }

    return {
      total: processes.length,
      matched,
      mismatched,
      needReview,
    };
  }

  /**
   * Reconcile single attendance process
   */
  async reconcileProcess(process: {
    process_id: number;
    employee_id: number;
    emp_code: string;
    work_date: Date;
    final_division_id?: number;
  }): Promise<ReconcileResult> {
    // Get expected division from emp_code prefix (home division)
    const expectedDivisionId = await this.getHomeDivisionFromEmpCode(process.emp_code);

    // Get detected division from machine scans
    const detectedDivisionId = await this.getDetectedDivisionFromScans(
      process.process_id
    );

    // Get API division
    const apiDivisionId = await this.getApiDivision(
      process.emp_code,
      process.work_date
    );

    // Determine final division using priority rules
    const finalDivisionId = this.determineFinalDivision(
      expectedDivisionId,
      detectedDivisionId,
      apiDivisionId,
      process.final_division_id
    );

    // Determine sorting status
    const sortingStatus = this.determineSortingStatus(
      expectedDivisionId,
      detectedDivisionId,
      apiDivisionId,
      finalDivisionId
    );

    // Determine sorting rule
    const sortingRule = this.determineSortingRule(
      expectedDivisionId,
      detectedDivisionId,
      apiDivisionId
    );

    // Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore(
      expectedDivisionId,
      detectedDivisionId,
      apiDivisionId,
      sortingStatus
    );

    // Generate sorting note
    const sortingNote = this.generateSortingNote(
      process.emp_code,
      expectedDivisionId,
      detectedDivisionId,
      sortingStatus
    );

    // Cross-division: scan location differs from final division
    const isCrossDivisionScan = !!(
      detectedDivisionId &&
      finalDivisionId &&
      detectedDivisionId !== finalDivisionId
    );

    // Need review when status indicates manual intervention
    const needReview = sortingStatus === 'NEED_MANUAL_REVIEW' ? 1 : 0;

    // Insert or update reconcile record
    await this.upsertReconcileRecord({
      process_id: process.process_id,
      employee_id: process.employee_id,
      emp_code: process.emp_code,
      work_date: process.work_date,
      expected_division_id: expectedDivisionId,
      detected_division_id: detectedDivisionId,
      api_division_id: apiDivisionId,
      final_division_id: finalDivisionId,
      match_status: sortingStatus,
      sorting_status: sortingStatus,
      sorting_rule: sortingRule,
      is_cross_division_scan: isCrossDivisionScan ? 1 : 0,
      need_review: needReview,
      cross_division_note: sortingNote,
      confidence_score: confidenceScore,
    });

    // Update attendance_daily_process
    await this.sqlClient.update(
      'attendance_daily_process',
      {
        final_division_id: finalDivisionId,
        reconcile_status: sortingStatus === 'MATCH_HOME_DIVISION' ? 'RECONCILED' : 'MISMATCH',
        updated_at: new Date(),
      },
      `process_id = ${process.process_id}`
    );

    return {
      process_id: process.process_id,
      employee_id: process.employee_id,
      emp_code: process.emp_code,
      work_date: process.work_date,
      match_status: sortingStatus,
      sorting_rule: sortingRule,
      sorting_note: sortingNote,
      confidence_score: confidenceScore,
    };
  }

  /**
   * Get detected division from machine scans
   */
  private async getDetectedDivisionFromScans(processId: number): Promise<number | null> {
    const sql = `
      SELECT TOP 1 m.default_division_id
      FROM attendance_process_detail d
      JOIN mst_machine m ON d.machine_id = m.machine_id
      WHERE d.process_id = ${processId}
        AND m.default_division_id IS NOT NULL
      GROUP BY m.default_division_id
      ORDER BY COUNT(*) DESC
    `;

    const result = await this.sqlClient.query<{ default_division_id: number }>(sql);
    return result[0]?.default_division_id || null;
  }

  /**
   * Get home division from emp_code prefix → loc_code mapping
   */
  private async getHomeDivisionFromEmpCode(empCode: string): Promise<number | null> {
    const locCode = empCode.charAt(0).toUpperCase();
    const result = await this.sqlClient.select<{ division_id: number }>(
      'mst_division',
      'division_id',
      `loc_code = '${locCode}'`
    );
    return result[0]?.division_id || null;
  }

  /**
   * Get API division
   */
  private async getApiDivision(empCode: string, workDate: Date): Promise<number | null> {
    const sql = `
      SELECT TOP 1 division_id
      FROM api_attendance_raw
      WHERE emp_code = '${empCode}'
        AND work_date = '${this.formatDate(workDate)}'
    `;

    const result = await this.sqlClient.query<{ division_id: number }>(sql);
    return result[0]?.division_id || null;
  }

  /**
   * Determine final division using priority rules
   */
  private determineFinalDivision(
    expected?: number | null,
    detected?: number | null,
    api?: number | null,
    current?: number | null
  ): number | null {
    // Priority 1: Expected (from history)
    if (expected) return expected;

    // Priority 2: API
    if (api) return api;

    // Priority 3: Detected (from machine)
    if (detected) return detected;

    // Priority 4: Current
    if (current) return current;

    return null;
  }

  /**
   * Determine sorting status based on division sources
   */
  private determineSortingStatus(
    expected?: number | null,
    detected?: number | null,
    api?: number | null,
    finalDiv?: number | null
  ): SortingStatus {
    // No home division found from emp_code prefix
    if (!expected) {
      if (!api && !detected) {
        return 'NO_HOME_DIVISION';
      }
      return 'NEED_MANUAL_REVIEW';
    }

    // Home division matches scan location — no cross-division
    if (expected && detected && expected === detected) {
      return 'MATCH_HOME_DIVISION';
    }

    // Home division exists but differs from scan location
    if (expected && detected && expected !== detected) {
      return 'CROSS_DIVISION_MOVED';
    }

    // Home exists, no scan division (API-only or manual)
    if (expected && !detected) {
      return 'MATCH_HOME_DIVISION';
    }

    // Fallback
    return 'NEED_MANUAL_REVIEW';
  }

  /**
   * Determine sorting rule based on which source determined the final division
   */
  private determineSortingRule(
    expected?: number | null,
    detected?: number | null,
    api?: number | null
  ): SortingRule {
    if (expected) {
      return 'HOME_DIVISION_PRIORITY';
    }
    if (api) {
      return 'API_FALLBACK';
    }
    if (detected) {
      return 'SCAN_LOCATION_FALLBACK';
    }
    return 'NEEDS_REVIEW';
  }

  /**
   * Calculate confidence score based on sorting status
   */
  private calculateConfidenceScore(
    expected?: number | null,
    detected?: number | null,
    api?: number | null,
    sortingStatus?: string
  ): number {
    if (sortingStatus === 'MATCH_HOME_DIVISION') return 100;
    if (sortingStatus === 'CROSS_DIVISION_MOVED') return 80;
    if (sortingStatus === 'NO_HOME_DIVISION') return 30;
    if (sortingStatus === 'UNMAPPED_EMPLOYEE') return 20;
    if (sortingStatus === 'NEED_MANUAL_REVIEW') return 40;
    return 60;
  }

  /**
   * Generate sorting note explaining the cross-division status
   */
  private generateSortingNote(
    empCode: string,
    expected?: number | null,
    detected?: number | null,
    sortingStatus?: string
  ): string | null {
    if (sortingStatus === 'MATCH_HOME_DIVISION') return null;

    if (sortingStatus === 'CROSS_DIVISION_MOVED') {
      return `Karyawan ${empCode} scan di divisi ${detected}, dihitung ke divisi asal ${expected}`;
    }
    if (sortingStatus === 'NO_HOME_DIVISION') {
      return `Karyawan ${empCode} tidak ditemukan divisi asal dari prefix emp_code`;
    }
    if (sortingStatus === 'UNMAPPED_EMPLOYEE') {
      return `Device user belum dipetakan ke emp_code`;
    }
    if (sortingStatus === 'NEED_MANUAL_REVIEW') {
      return `Data tidak lengkap, perlu review manual`;
    }
    return null;
  }

  /**
   * Upsert reconcile record
   */
  private async upsertReconcileRecord(data: any): Promise<void> {
    const existing = await this.sqlClient.select(
      'attendance_division_reconcile',
      'reconcile_id',
      `employee_id = ${data.employee_id} AND work_date = '${this.formatDate(data.work_date)}'`
    );

    if (existing.length > 0) {
      await this.sqlClient.update(
        'attendance_division_reconcile',
        { ...data, updated_at: new Date() },
        `employee_id = ${data.employee_id} AND work_date = '${this.formatDate(data.work_date)}'`
      );
    } else {
      await this.sqlClient.insert('attendance_division_reconcile', data);
    }
  }

  /**
   * Format date to SQL Server format
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
