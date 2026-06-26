/**
 * Audit Service
 * 
 * Tracks all changes to critical entities for compliance and debugging
 */

import { SqlClient } from '../../shared/database/sql-client';

export interface AuditLog {
  audit_id: number;
  entity_name: string;
  entity_id?: string;
  action_type: string;
  old_value?: string;
  new_value?: string;
  changed_by: string;
  changed_at: Date;
  ip_address?: string;
  user_agent?: string;
}

export class AuditService {
  constructor(private sqlClient: SqlClient) {}

  /**
   * Log entity change
   */
  async logChange(data: {
    entity_name: string;
    entity_id?: string;
    action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'RECONCILE' | 'RESOLVE';
    old_value?: any;
    new_value?: any;
    changed_by: string;
    ip_address?: string;
    user_agent?: string;
  }): Promise<number> {
    return this.sqlClient.insert('audit_log', {
      entity_name: data.entity_name,
      entity_id: data.entity_id,
      action_type: data.action_type,
      old_value: data.old_value ? JSON.stringify(data.old_value) : null,
      new_value: data.new_value ? JSON.stringify(data.new_value) : null,
      changed_by: data.changed_by,
      ip_address: data.ip_address,
      user_agent: data.user_agent,
    });
  }

  /**
   * Get audit logs for entity
   */
  async getEntityAuditLog(
    entityName: string,
    entityId: string,
    limit: number = 50
  ): Promise<AuditLog[]> {
    return this.sqlClient.select<AuditLog>(
      'audit_log',
      '*',
      `entity_name = '${entityName}' AND entity_id = '${entityId}'`,
      'changed_at DESC',
      limit
    );
  }

  /**
   * Get recent audit logs
   */
  async getRecentLogs(limit: number = 100): Promise<AuditLog[]> {
    return this.sqlClient.select<AuditLog>(
      'audit_log',
      '*',
      null,
      'changed_at DESC',
      limit
    );
  }

  /**
   * Get audit logs by user
   */
  async getLogsByUser(changedBy: string, limit: number = 50): Promise<AuditLog[]> {
    return this.sqlClient.select<AuditLog>(
      'audit_log',
      '*',
      `changed_by = '${changedBy}'`,
      'changed_at DESC',
      limit
    );
  }

  /**
   * Get audit logs by date range
   */
  async getLogsByDateRange(dateFrom: Date, dateTo: Date): Promise<AuditLog[]> {
    return this.sqlClient.select<AuditLog>(
      'audit_log',
      '*',
      `changed_at >= '${dateFrom.toISOString()}' AND changed_at <= '${dateTo.toISOString()}'`,
      'changed_at DESC'
    );
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(): Promise<{
    total_logs: number;
    by_action: Array<{ action_type: string; count: number }>;
    by_entity: Array<{ entity_name: string; count: number }>;
    by_user: Array<{ changed_by: string; count: number }>;
  }> {
    const totalSql = `SELECT COUNT(*) AS total FROM audit_log`;
    const byActionSql = `
      SELECT action_type, COUNT(*) AS count 
      FROM audit_log 
      GROUP BY action_type 
      ORDER BY count DESC
    `;
    const byEntitySql = `
      SELECT entity_name, COUNT(*) AS count 
      FROM audit_log 
      GROUP BY entity_name 
      ORDER BY count DESC
    `;
    const byUserSql = `
      SELECT TOP 10 changed_by, COUNT(*) AS count 
      FROM audit_log 
      GROUP BY changed_by 
      ORDER BY count DESC
    `;

    const [total, byAction, byEntity, byUser] = await Promise.all([
      this.sqlClient.query<{ total: number }>(totalSql),
      this.sqlClient.query<{ action_type: string; count: number }>(byActionSql),
      this.sqlClient.query<{ entity_name: string; count: number }>(byEntitySql),
      this.sqlClient.query<{ changed_by: string; count: number }>(byUserSql),
    ]);

    return {
      total_logs: total[0]?.total || 0,
      by_action: byAction,
      by_entity: byEntity,
      by_user: byUser,
    };
  }

  /**
   * Clean old audit logs (retention policy)
   */
  async cleanOldLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    await this.sqlClient.delete(
      'audit_log',
      `changed_at < '${cutoffDate.toISOString()}'`
    );

    return 1; // SQL Gateway doesn't return affected rows
  }
}
