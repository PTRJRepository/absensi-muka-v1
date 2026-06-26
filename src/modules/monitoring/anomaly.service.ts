/**
 * Anomaly Service
 * 
 * Detects and manages attendance anomalies
 */

import { SqlClient } from '../../shared/database/sql-client';

export interface AttendanceAnomaly {
  anomaly_id: number;
  process_id?: number;
  employee_id?: number;
  work_date?: Date;
  anomaly_type: string;
  severity: string;
  title: string;
  description?: string;
  machine_id?: number;
  division_id?: number;
  status: string;
  detected_at: Date;
  resolved_by?: string;
  resolved_at?: Date;
  resolution_note?: string;
}

export class AnomalyService {
  constructor(private sqlClient: SqlClient) {}

  /**
   * Detect anomalies for date range
   */
  async detectAnomalies(dateFrom: Date, dateTo: Date): Promise<{
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  }> {
    const processes = await this.sqlClient.select<{
      process_id: number;
      employee_id: number;
      emp_code: string;
      work_date: Date;
      attendance_status: string;
      scan_count: number;
      machine_count: number;
      reconcile_status: string;
    }>(
      'attendance_daily_process',
      '*',
      `work_date >= '${this.formatDate(dateFrom)}' AND work_date <= '${this.formatDate(dateTo)}'`
    );

    let total = 0;
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const process of processes) {
      const anomalies = await this.detectProcessAnomalies(process);
      
      for (const anomaly of anomalies) {
        await this.createAnomaly(anomaly);
        total++;
        
        const at = anomaly.anomaly_type ?? 'UNKNOWN';
        const sev = anomaly.severity ?? 'UNKNOWN';
        byType[at] = (byType[at] || 0) + 1;
        bySeverity[sev] = (bySeverity[sev] || 0) + 1;
      }
    }

    return { total, byType, bySeverity };
  }

  /**
   * Detect anomalies for single process
   */
  private async detectProcessAnomalies(process: any): Promise<Partial<AttendanceAnomaly>[]> {
    const anomalies: Partial<AttendanceAnomaly>[] = [];

    // NO_CHECKIN
    if (process.scan_count === 0) {
      anomalies.push({
        process_id: process.process_id,
        employee_id: process.employee_id,
        work_date: process.work_date,
        anomaly_type: 'NO_CHECKIN',
        severity: 'HIGH',
        title: `No check-in for ${process.emp_code}`,
        description: `Employee ${process.emp_code} has no attendance scan on ${this.formatDate(process.work_date)}`,
      });
    }

    // NO_CHECKOUT
    if (process.attendance_status === 'NO_CHECKOUT') {
      anomalies.push({
        process_id: process.process_id,
        employee_id: process.employee_id,
        work_date: process.work_date,
        anomaly_type: 'NO_CHECKOUT',
        severity: 'MEDIUM',
        title: `No check-out for ${process.emp_code}`,
        description: `Employee ${process.emp_code} checked in but did not check out`,
      });
    }

    // INCOMPLETE_SCAN
    if (process.attendance_status === 'INCOMPLETE_SCAN') {
      anomalies.push({
        process_id: process.process_id,
        employee_id: process.employee_id,
        work_date: process.work_date,
        anomaly_type: 'INCOMPLETE_SCAN',
        severity: 'MEDIUM',
        title: `Incomplete scan for ${process.emp_code}`,
        description: `Employee ${process.emp_code} has incomplete attendance scan`,
      });
    }

    // MULTIPLE_LOCATION_SAME_DAY
    if (process.machine_count > 2) {
      anomalies.push({
        process_id: process.process_id,
        employee_id: process.employee_id,
        work_date: process.work_date,
        anomaly_type: 'MULTIPLE_LOCATION_SAME_DAY',
        severity: 'LOW',
        title: `Multiple locations for ${process.emp_code}`,
        description: `Employee ${process.emp_code} scanned at ${process.machine_count} different machines`,
      });
    }

    // CROSS_DIVISION_SCAN - check both reconcile mismatch and new field
    if (process.reconcile_status === 'MISMATCH' || process.is_cross_division_scan) {
      anomalies.push({
        process_id: process.process_id,
        employee_id: process.employee_id,
        work_date: process.work_date,
        anomaly_type: 'CROSS_DIVISION_SCAN',
        severity: 'MEDIUM',
        title: `Cross-division scan for ${process.emp_code}`,
        description: process.cross_division_note || `Employee ${process.emp_code} scanned at different division than expected`,
        division_id: process.final_division_id,
      });
    }

    return anomalies;
  }

  /**
   * Create anomaly record
   */
  async createAnomaly(data: Partial<AttendanceAnomaly>): Promise<number> {
    // Check if anomaly already exists
    const existing = await this.sqlClient.select(
      'attendance_anomaly',
      'anomaly_id',
      `process_id = ${data.process_id} AND anomaly_type = '${data.anomaly_type}' AND status = 'OPEN'`
    );

    if (existing.length > 0) {
      return existing[0].anomaly_id;
    }

    return this.sqlClient.insert('attendance_anomaly', {
      ...data,
      status: 'OPEN',
    });
  }

  /**
   * Get open anomalies
   */
  async getOpenAnomalies(limit: number = 100): Promise<AttendanceAnomaly[]> {
    return this.sqlClient.select<AttendanceAnomaly>(
      'attendance_anomaly',
      '*',
      'status = \'OPEN\'',
      'detected_at DESC',
      limit
    );
  }

  /**
   * Get anomalies by type
   */
  async getAnomaliesByType(anomalyType: string, limit: number = 50): Promise<AttendanceAnomaly[]> {
    return this.sqlClient.select<AttendanceAnomaly>(
      'attendance_anomaly',
      '*',
      `anomaly_type = '${anomalyType}' AND status = 'OPEN'`,
      'detected_at DESC',
      limit
    );
  }

  /**
   * Resolve anomaly
   */
  async resolveAnomaly(
    anomalyId: number,
    resolvedBy: string,
    resolutionNote: string
  ): Promise<void> {
    await this.sqlClient.update(
      'attendance_anomaly',
      {
        status: 'RESOLVED',
        resolved_by: resolvedBy,
        resolved_at: new Date(),
        resolution_note: resolutionNote,
      },
      `anomaly_id = ${anomalyId}`
    );
  }

  /**
   * Get anomaly statistics
   */
  async getAnomalyStats(): Promise<{
    total_open: number;
    total_resolved: number;
    by_type: Array<{ anomaly_type: string; count: number }>;
    by_severity: Array<{ severity: string; count: number }>;
  }> {
    const totalOpenSql = `SELECT COUNT(*) AS total FROM attendance_anomaly WHERE status = 'OPEN'`;
    const totalResolvedSql = `SELECT COUNT(*) AS total FROM attendance_anomaly WHERE status = 'RESOLVED'`;
    const byTypeSql = `
      SELECT anomaly_type, COUNT(*) AS count 
      FROM attendance_anomaly 
      WHERE status = 'OPEN'
      GROUP BY anomaly_type 
      ORDER BY count DESC
    `;
    const bySeveritySql = `
      SELECT severity, COUNT(*) AS count 
      FROM attendance_anomaly 
      WHERE status = 'OPEN'
      GROUP BY severity 
      ORDER BY count DESC
    `;

    const [totalOpen, totalResolved, byType, bySeverity] = await Promise.all([
      this.sqlClient.query<{ total: number }>(totalOpenSql),
      this.sqlClient.query<{ total: number }>(totalResolvedSql),
      this.sqlClient.query<{ anomaly_type: string; count: number }>(byTypeSql),
      this.sqlClient.query<{ severity: string; count: number }>(bySeveritySql),
    ]);

    return {
      total_open: totalOpen[0]?.total || 0,
      total_resolved: totalResolved[0]?.total || 0,
      by_type: byType,
      by_severity: bySeverity,
    };
  }

  /**
   * Format date to SQL Server format
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
