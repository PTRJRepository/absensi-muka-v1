/**
 * Summary Service
 * 
 * Generates daily summary statistics for monitoring dashboard
 */

import { SqlClient } from '../../shared/database/sql-client';

export interface DailySummary {
  summary_id: number;
  summary_date: Date;
  division_id?: number;
  estate_id?: number;
  total_employee: number;
  total_present: number;
  total_absent: number;
  total_cuti: number;
  total_sakit: number;
  total_holiday: number;
  total_no_checkin: number;
  total_no_checkout: number;
  total_cross_division: number;
  total_unmapped: number;
  total_anomaly: number;
  machine_log_count: number;
  api_record_count: number;
  generated_at: Date;
}

export class SummaryService {
  constructor(private sqlClient: SqlClient) {}

  /**
   * Generate daily summary for all divisions
   */
  async generateDailySummary(date: Date): Promise<{
    total: number;
    byDivision: number;
    byEstate: number;
  }> {
    // Generate global summary
    await this.generateGlobalSummary(date);

    // Generate per-division summary
    const divisions = await this.sqlClient.select<{ division_id: number }>(
      'mst_division',
      'division_id',
      'is_active = 1'
    );

    for (const division of divisions) {
      await this.generateDivisionSummary(date, division.division_id);
    }

    // Generate per-estate summary
    const estates = await this.sqlClient.select<{ estate_id: number }>(
      'mst_estate',
      'estate_id',
      'is_active = 1'
    );

    for (const estate of estates) {
      await this.generateEstateSummary(date, estate.estate_id);
    }

    return {
      total: 1,
      byDivision: divisions.length,
      byEstate: estates.length,
    };
  }

  /**
   * Generate global summary (all divisions)
   */
  private async generateGlobalSummary(date: Date): Promise<void> {
    const stats = await this.calculateDailyStats(date, null, null);

    // Check if summary exists
    const existing = await this.sqlClient.select(
      'monitoring_daily_summary',
      'summary_id',
      `summary_date = '${this.formatDate(date)}' AND division_id IS NULL AND estate_id IS NULL`
    );

    if (existing.length > 0) {
      await this.sqlClient.update(
        'monitoring_daily_summary',
        { ...stats, generated_at: new Date() },
        `summary_id = ${existing[0].summary_id}`
      );
    } else {
      await this.sqlClient.insert('monitoring_daily_summary', {
        summary_date: date,
        division_id: null,
        estate_id: null,
        ...stats,
      });
    }
  }

  /**
   * Generate division summary
   */
  private async generateDivisionSummary(date: Date, divisionId: number): Promise<void> {
    const stats = await this.calculateDailyStats(date, divisionId, null);

    const existing = await this.sqlClient.select(
      'monitoring_daily_summary',
      'summary_id',
      `summary_date = '${this.formatDate(date)}' AND division_id = ${divisionId}`
    );

    if (existing.length > 0) {
      await this.sqlClient.update(
        'monitoring_daily_summary',
        { ...stats, generated_at: new Date() },
        `summary_id = ${existing[0].summary_id}`
      );
    } else {
      await this.sqlClient.insert('monitoring_daily_summary', {
        summary_date: date,
        division_id: divisionId,
        estate_id: null,
        ...stats,
      });
    }
  }

  /**
   * Generate estate summary
   */
  private async generateEstateSummary(date: Date, estateId: number): Promise<void> {
    const stats = await this.calculateDailyStats(date, null, estateId);

    const existing = await this.sqlClient.select(
      'monitoring_daily_summary',
      'summary_id',
      `summary_date = '${this.formatDate(date)}' AND estate_id = ${estateId}`
    );

    if (existing.length > 0) {
      await this.sqlClient.update(
        'monitoring_daily_summary',
        { ...stats, generated_at: new Date() },
        `summary_id = ${existing[0].summary_id}`
      );
    } else {
      await this.sqlClient.insert('monitoring_daily_summary', {
        summary_date: date,
        division_id: null,
        estate_id: estateId,
        ...stats,
      });
    }
  }

  /**
   * Calculate daily statistics
   */
  private async calculateDailyStats(
    date: Date,
    divisionId?: number | null,
    estateId?: number | null
  ): Promise<Partial<DailySummary>> {
    let whereClause = `work_date = '${this.formatDate(date)}'`;
    
    if (divisionId) {
      whereClause += ` AND final_division_id = ${divisionId}`;
    }
    
    if (estateId) {
      whereClause += ` AND final_division_id IN (SELECT division_id FROM mst_division WHERE estate_id = ${estateId})`;
    }

    const sql = `
      SELECT 
        COUNT(*) AS total_employee,
        SUM(CASE WHEN attendance_status = 'PRESENT' THEN 1 ELSE 0 END) AS total_present,
        SUM(CASE WHEN attendance_status = 'ABSENT' THEN 1 ELSE 0 END) AS total_absent,
        SUM(CASE WHEN is_cuti = 1 THEN 1 ELSE 0 END) AS total_cuti,
        SUM(CASE WHEN is_sakit = 1 THEN 1 ELSE 0 END) AS total_sakit,
        SUM(CASE WHEN is_holiday = 1 THEN 1 ELSE 0 END) AS total_holiday,
        SUM(CASE WHEN scan_count = 0 THEN 1 ELSE 0 END) AS total_no_checkin,
        SUM(CASE WHEN attendance_status = 'NO_CHECKOUT' THEN 1 ELSE 0 END) AS total_no_checkout,
        SUM(CASE WHEN is_cross_division_scan = 1 THEN 1 ELSE 0 END) AS total_cross_division,
        SUM(CASE WHEN has_machine_log = 1 THEN 1 ELSE 0 END) AS machine_log_count,
        SUM(CASE WHEN has_api_data = 1 THEN 1 ELSE 0 END) AS api_record_count
      FROM attendance_daily_process
      WHERE ${whereClause}
    `;

    const result = await this.sqlClient.query<any>(sql);
    const stats = result[0] || {};

    // Get unmapped count
    const unmappedSql = `
      SELECT COUNT(DISTINCT l.machine_user_id) AS total_unmapped
      FROM attendance_raw_log l
      LEFT JOIN machine_user_map m ON l.machine_id = m.machine_id AND l.machine_user_id = m.machine_user_id
      WHERE l.record_date = '${this.formatDate(date)}'
        AND m.map_id IS NULL
    `;

    const unmappedResult = await this.sqlClient.query<{ total_unmapped: number }>(unmappedSql);
    const totalUnmapped = unmappedResult[0]?.total_unmapped || 0;

    // Get anomaly count
    let anomalyWhereClause = `work_date = '${this.formatDate(date)}' AND status = 'OPEN'`;
    if (divisionId) {
      anomalyWhereClause += ` AND division_id = ${divisionId}`;
    }

    const anomalySql = `SELECT COUNT(*) AS total_anomaly FROM attendance_anomaly WHERE ${anomalyWhereClause}`;
    const anomalyResult = await this.sqlClient.query<{ total_anomaly: number }>(anomalySql);
    const totalAnomaly = anomalyResult[0]?.total_anomaly || 0;

    return {
      total_employee: stats.total_employee || 0,
      total_present: stats.total_present || 0,
      total_absent: stats.total_absent || 0,
      total_cuti: stats.total_cuti || 0,
      total_sakit: stats.total_sakit || 0,
      total_holiday: stats.total_holiday || 0,
      total_no_checkin: stats.total_no_checkin || 0,
      total_no_checkout: stats.total_no_checkout || 0,
      total_cross_division: stats.total_cross_division || 0,
      total_unmapped: totalUnmapped,
      total_anomaly: totalAnomaly,
      machine_log_count: stats.machine_log_count || 0,
      api_record_count: stats.api_record_count || 0,
    };
  }

  /**
   * Get summary for date
   */
  async getSummary(date: Date, divisionId?: number, estateId?: number): Promise<DailySummary | null> {
    let whereClause = `summary_date = '${this.formatDate(date)}'`;
    
    if (divisionId) {
      whereClause += ` AND division_id = ${divisionId}`;
    } else if (estateId) {
      whereClause += ` AND estate_id = ${estateId}`;
    } else {
      whereClause += ' AND division_id IS NULL AND estate_id IS NULL';
    }

    const results = await this.sqlClient.select<DailySummary>(
      'monitoring_daily_summary',
      '*',
      whereClause
    );

    return results[0] || null;
  }

  /**
   * Get summary trend (last N days)
   */
  async getSummaryTrend(days: number = 7, divisionId?: number): Promise<DailySummary[]> {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    let whereClause = `summary_date >= '${this.formatDate(dateFrom)}'`;
    
    if (divisionId) {
      whereClause += ` AND division_id = ${divisionId}`;
    } else {
      whereClause += ' AND division_id IS NULL AND estate_id IS NULL';
    }

    return this.sqlClient.select<DailySummary>(
      'monitoring_daily_summary',
      '*',
      whereClause,
      'summary_date DESC'
    );
  }

  /**
   * Format date to SQL Server format
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
