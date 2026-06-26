/**
 * Employee Movement Service
 * 
 * Tracks employee division/location changes over time
 * Handles employee_division_history and employee_daily_assignment
 */

import { SqlClient } from '../../shared/database/sql-client';

export interface EmployeeDivisionHistory {
  history_id: number;
  employee_id: number;
  division_id: number;
  gang_id?: number;
  estate_id?: number;
  effective_start: Date;
  effective_end?: Date;
  assignment_source: string;
  confidence_score: number;
  reason?: string;
  created_by: string;
  created_at: Date;
}

export interface EmployeeDailyAssignment {
  assignment_id: number;
  employee_id: number;
  work_date: Date;
  detected_division_id?: number;
  final_division_id: number;
  detected_gang_id?: number;
  final_gang_id?: number;
  source: string;
  confidence_score: number;
  is_manual_override: boolean;
  override_reason?: string;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export class EmployeeMovementService {
  constructor(private sqlClient: SqlClient) {}

  /**
   * Get current division for employee on specific date
   */
  async getDivisionOnDate(employeeId: number, workDate: Date): Promise<number | null> {
    // Priority 1: Check daily assignment (manual override)
    const dailyAssignment = await this.sqlClient.select<EmployeeDailyAssignment>(
      'employee_daily_assignment',
      'final_division_id',
      `employee_id = ${employeeId} AND work_date = '${this.formatDate(workDate)}'`
    );

    if (dailyAssignment.length > 0) {
      return dailyAssignment[0].final_division_id;
    }

    // Priority 2: Check division history
    const history = await this.sqlClient.select<EmployeeDivisionHistory>(
      'employee_division_history',
      'division_id',
      `employee_id = ${employeeId} 
       AND effective_start <= '${this.formatDate(workDate)}'
       AND (effective_end IS NULL OR effective_end >= '${this.formatDate(workDate)}')`,
      'effective_start DESC',
      1
    );

    if (history.length > 0) {
      return history[0].division_id;
    }

    return null;
  }

  /**
   * Create division history record
   */
  async createDivisionHistory(data: {
    employee_id: number;
    division_id: number;
    gang_id?: number;
    estate_id?: number;
    effective_start: Date;
    effective_end?: Date;
    assignment_source?: string;
    confidence_score?: number;
    reason?: string;
    created_by?: string;
  }): Promise<number> {
    return this.sqlClient.insert('employee_division_history', {
      ...data,
      assignment_source: data.assignment_source || 'SYSTEM_DETECTED',
      confidence_score: data.confidence_score || 100,
      created_by: data.created_by || 'SYSTEM',
    });
  }

  /**
   * Close current division history and create new one (employee moved)
   */
  async recordDivisionChange(
    employeeId: number,
    newDivisionId: number,
    effectiveDate: Date,
    reason: string,
    createdBy: string = 'SYSTEM'
  ): Promise<void> {
    // Close current history
    const currentHistory = await this.sqlClient.select<EmployeeDivisionHistory>(
      'employee_division_history',
      '*',
      `employee_id = ${employeeId} AND effective_end IS NULL`,
      'effective_start DESC',
      1
    );

    if (currentHistory.length > 0) {
      const dayBefore = new Date(effectiveDate);
      dayBefore.setDate(dayBefore.getDate() - 1);

      await this.sqlClient.update(
        'employee_division_history',
        { effective_end: dayBefore },
        `history_id = ${currentHistory[0].history_id}`
      );
    }

    // Create new history
    await this.createDivisionHistory({
      employee_id: employeeId,
      division_id: newDivisionId,
      effective_start: effectiveDate,
      reason,
      created_by: createdBy,
    });

    // Update mst_employee current_division_id
    await this.sqlClient.update(
      'mst_employee',
      { current_division_id: newDivisionId, updated_at: new Date() },
      `employee_id = ${employeeId}`
    );
  }

  /**
   * Set daily assignment (manual override or system detected)
   */
  async setDailyAssignment(data: {
    employee_id: number;
    work_date: Date;
    detected_division_id?: number;
    final_division_id: number;
    detected_gang_id?: number;
    final_gang_id?: number;
    source?: string;
    confidence_score?: number;
    is_manual_override?: boolean;
    override_reason?: string;
    updated_by?: string;
  }): Promise<void> {
    // Check if exists
    const existing = await this.sqlClient.select<EmployeeDailyAssignment>(
      'employee_daily_assignment',
      '*',
      `employee_id = ${data.employee_id} AND work_date = '${this.formatDate(data.work_date)}'`
    );

    if (existing.length > 0) {
      // Update
      await this.sqlClient.update(
        'employee_daily_assignment',
        {
          detected_division_id: data.detected_division_id,
          final_division_id: data.final_division_id,
          detected_gang_id: data.detected_gang_id,
          final_gang_id: data.final_gang_id,
          source: data.source || 'SYSTEM',
          confidence_score: data.confidence_score || 100,
          is_manual_override: data.is_manual_override || false,
          override_reason: data.override_reason,
          updated_by: data.updated_by,
          updated_at: new Date(),
        },
        `employee_id = ${data.employee_id} AND work_date = '${this.formatDate(data.work_date)}'`
      );
    } else {
      // Insert
      await this.sqlClient.insert('employee_daily_assignment', {
        ...data,
        source: data.source || 'SYSTEM',
        confidence_score: data.confidence_score || 100,
        is_manual_override: data.is_manual_override || false,
      });
    }
  }

  /**
   * Detect potential division movement (3+ consecutive days in different division)
   */
  async detectPotentialMovement(
    employeeId: number,
    thresholdDays: number = 3
  ): Promise<{
    detected: boolean;
    currentDivision?: number;
    detectedDivision?: number;
    consecutiveDays?: number;
    startDate?: Date;
  } | null> {
    const sql = `
      SELECT TOP ${thresholdDays + 5}
        work_date,
        detected_division_id,
        final_division_id
      FROM employee_daily_assignment
      WHERE employee_id = ${employeeId}
        AND detected_division_id IS NOT NULL
      ORDER BY work_date DESC
    `;

    const assignments = await this.sqlClient.query<{
      work_date: Date;
      detected_division_id: number;
      final_division_id: number;
    }>(sql);

    if (assignments.length < thresholdDays) return null;

    // Check if detected_division differs from final_division for N consecutive days
    let consecutiveDays = 0;
    let detectedDivision: number | null = null;
    let startDate: Date | null = null;

    for (const assignment of assignments) {
      if (assignment.detected_division_id !== assignment.final_division_id) {
        if (detectedDivision === null) {
          detectedDivision = assignment.detected_division_id;
          startDate = assignment.work_date;
        }

        if (assignment.detected_division_id === detectedDivision) {
          consecutiveDays++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    if (consecutiveDays >= thresholdDays && detectedDivision && startDate) {
      return {
        detected: true,
        currentDivision: assignments[0].final_division_id,
        detectedDivision,
        consecutiveDays,
        startDate,
      };
    }

    return { detected: false };
  }

  /**
   * Format date to SQL Server format
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
