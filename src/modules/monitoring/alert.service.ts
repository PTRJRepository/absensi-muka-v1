/**
 * Alert Service
 *
 * Alert engine for notifications when issues detected
 * Part of Phase 5: Advanced Features
 */

import { SqlClient } from '../../shared/database/sql-client';
import { DataQualityService } from '../monitoring/data-quality.service';
import { publishQualityAlert } from '../../lib/realtime-emitter';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertChannel = 'EMAIL' | 'SMS' | 'WEBHOOK' | 'DASHBOARD';

export interface AlertRule {
  id: number;
  name: string;
  checkType: string;
  condition: 'GT' | 'LT' | 'EQ' | 'NE' | 'GTE' | 'LTE';
  threshold: number;
  severity: AlertSeverity;
  channels: AlertChannel[];
  enabled: boolean;
  recipients?: string[];
  webhookUrl?: string;
}

export interface Alert {
  id: number;
  ruleId: number;
  ruleName: string;
  severity: AlertSeverity;
  channel: AlertChannel;
  title: string;
  message: string;
  data?: any;
  sentAt: Date;
  status: 'PENDING' | 'SENT' | 'FAILED';
  error?: string;
}

export class AlertService {
  constructor(
    private sqlClient: SqlClient,
    private qualityService: DataQualityService
  ) {}

  /**
   * Get all alert rules
   */
  async getRules(): Promise<AlertRule[]> {
    return this.sqlClient.select<AlertRule>(
      'app_configs',
      '*',
      "config_type = 'ALERT_RULE' AND is_active = 1",
      'id'
    );
  }

  /**
   * Create alert rule
   */
  async createRule(rule: Omit<AlertRule, 'id'>): Promise<number> {
    return this.sqlClient.insert('app_configs', {
      config_type: 'ALERT_RULE',
      config_key: rule.name,
      config_value: JSON.stringify(rule),
      is_active: rule.enabled ? 1 : 0,
    });
  }

  /**
   * Update alert rule
   */
  async updateRule(id: number, rule: Partial<AlertRule>): Promise<void> {
    const existing = await this.sqlClient.select('app_configs', '*', `id = ${id}`);
    if (existing.length === 0) {
      throw new Error(`Rule not found: ${id}`);
    }

    const existingRule = JSON.parse(existing[0].config_value);
    const updatedRule = { ...existingRule, ...rule };

    await this.sqlClient.update('app_configs', {
      config_key: updatedRule.name,
      config_value: JSON.stringify(updatedRule),
      is_active: updatedRule.enabled ? 1 : 0,
    }, `id = ${id}`);
  }

  /**
   * Run alert checks
   */
  async runAlertChecks(): Promise<Alert[]> {
    const rules = await this.getRules();
    const alerts: Alert[] = [];

    // Run quality checks
    const qualityReport = await this.qualityService.runAllChecks();

    for (const rule of rules) {
      if (!rule.enabled) continue;

      try {
        const checkResult = qualityReport.checks.find(c => c.check_name === rule.checkType);
        if (!checkResult) continue;

        const value = checkResult.record_count;
        const shouldAlert = this.evaluateCondition(rule.condition, value, rule.threshold);

        if (shouldAlert) {
          const alert = await this.sendAlert(rule, {
            checkName: checkResult.check_name,
            value,
            threshold: rule.threshold,
            details: checkResult.details,
          });
          alerts.push(alert);
        }
      } catch (e: any) {
        console.error(`[Alert] Rule ${rule.name} failed:`, e.message);
      }
    }

    return alerts;
  }

  /**
   * Evaluate condition
   */
  private evaluateCondition(condition: string, value: number, threshold: number): boolean {
    switch (condition) {
      case 'GT': return value > threshold;
      case 'LT': return value < threshold;
      case 'EQ': return value === threshold;
      case 'NE': return value !== threshold;
      case 'GTE': return value >= threshold;
      case 'LTE': return value <= threshold;
      default: return false;
    }
  }

  /**
   * Send alert via configured channels
   */
  private async sendAlert(rule: AlertRule, data: any): Promise<Alert> {
    const alert: Partial<Alert> = {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      channel: rule.channels[0] || 'DASHBOARD',
      title: `${rule.severity}: ${rule.name}`,
      message: this.formatAlertMessage(rule, data),
      data,
      sentAt: new Date(),
      status: 'PENDING',
    };

    // Send to each channel
    for (const channel of rule.channels) {
      try {
        await this.sendToChannel(channel, rule, alert);
        alert.status = 'SENT';
      } catch (e: any) {
        alert.status = 'FAILED';
        alert.error = e.message;
      }
    }

    // Publish to dashboard
    publishQualityAlert(
      data.checkName,
      rule.severity,
      alert.message!,
      data
    );

    // Save alert
    if (alert.status === 'SENT' || alert.status === 'FAILED') {
      alert.id = await this.saveAlert(alert);
    }

    return alert as Alert;
  }

  /**
   * Send to specific channel
   */
  private async sendToChannel(channel: AlertChannel, rule: AlertRule, alert: Partial<Alert>): Promise<void> {
    switch (channel) {
      case 'EMAIL':
        await this.sendEmail(rule, alert);
        break;
      case 'SMS':
        await this.sendSMS(rule, alert);
        break;
      case 'WEBHOOK':
        await this.sendWebhook(rule, alert);
        break;
      case 'DASHBOARD':
        // Dashboard is handled by publishQualityAlert
        break;
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(rule: AlertRule, alert: Partial<Alert>): Promise<void> {
    const recipients = rule.recipients || [];
    if (recipients.length === 0) return;

    // In production, integrate with email service
    console.log(`[Alert] Email to ${recipients.join(', ')}:`);
    console.log(`  Subject: ${alert.title}`);
    console.log(`  Body: ${alert.message}`);

    // Placeholder for actual email implementation
    // await emailService.send({
    //   to: recipients,
    //   subject: alert.title,
    //   body: alert.message,
    // });
  }

  /**
   * Send SMS notification
   */
  private async sendSMS(rule: AlertRule, alert: Partial<Alert>): Promise<void> {
    const recipients = rule.recipients || [];
    if (recipients.length === 0) return;

    console.log(`[Alert] SMS to ${recipients.join(', ')}:`);
    console.log(`  Message: ${alert.message}`);

    // Placeholder for actual SMS implementation
    // await smsService.send({
    //   to: recipients,
    //   message: alert.message,
    // });
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(rule: AlertRule, alert: Partial<Alert>): Promise<void> {
    if (!rule.webhookUrl) return;

    console.log(`[Alert] Webhook to ${rule.webhookUrl}:`);
    console.log(`  Payload: ${JSON.stringify(alert)}`);

    // Placeholder for actual webhook implementation
    // await fetch(rule.webhookUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(alert),
    // });
  }

  /**
   * Format alert message
   */
  private formatAlertMessage(rule: AlertRule, data: any): string {
    return `${rule.name}: ${data.value} ${rule.condition} ${rule.threshold}. ${data.details || ''}`;
  }

  /**
   * Save alert to database
   */
  private async saveAlert(alert: Partial<Alert>): Promise<number> {
    try {
      return await this.sqlClient.insert('app_configs', {
        config_type: 'ALERT_LOG',
        config_key: alert.ruleName,
        config_value: JSON.stringify(alert),
        is_active: 1,
      });
    } catch (e) {
      console.error('[Alert] Failed to save alert:', e);
      return 0;
    }
  }

  /**
   * Get alert history
   */
  async getAlertHistory(limit: number = 100): Promise<Alert[]> {
    const alerts = await this.sqlClient.select(
      'app_configs',
      '*',
      "config_type = 'ALERT_LOG'",
      'id DESC',
      limit
    );

    return alerts.map(a => JSON.parse(a.config_value));
  }

  /**
   * Get active alerts (from last 24 hours)
   */
  async getActiveAlerts(): Promise<Alert[]> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const alerts = await this.sqlClient.select(
      'app_configs',
      '*',
      `config_type = 'ALERT_LOG' AND created_at >= '${yesterday.toISOString()}'`,
      'id DESC'
    );

    return alerts.map(a => JSON.parse(a.config_value));
  }
}

/**
 * Predefined alert rules for attendance monitoring
 */
export const DEFAULT_ALERT_RULES: Omit<AlertRule, 'id'>[] = [
  {
    name: 'High Unmapped Employees',
    checkType: 'UNMAPPED_EMPLOYEES',
    condition: 'GT',
    threshold: 50,
    severity: 'WARNING',
    channels: ['DASHBOARD', 'EMAIL'],
    enabled: true,
    recipients: ['it@rebinmas.com'],
  },
  {
    name: 'Critical Unmapped Employees',
    checkType: 'UNMAPPED_EMPLOYEES',
    condition: 'GT',
    threshold: 200,
    severity: 'CRITICAL',
    channels: ['DASHBOARD', 'EMAIL', 'SMS'],
    enabled: true,
    recipients: ['it@rebinmas.com', 'hr@rebinmas.com'],
  },
  {
    name: 'High Duplicate Scans',
    checkType: 'DUPLICATE_SCANS',
    condition: 'GT',
    threshold: 500,
    severity: 'WARNING',
    channels: ['DASHBOARD'],
    enabled: true,
  },
  {
    name: 'Unprocessed Logs Backlog',
    checkType: 'UNPROCESSED_LOGS',
    condition: 'GT',
    threshold: 5000,
    severity: 'CRITICAL',
    channels: ['DASHBOARD', 'EMAIL'],
    enabled: true,
    recipients: ['it@rebinmas.com'],
  },
  {
    name: 'Machine Time Drift',
    checkType: 'MACHINE_TIME_DRIFT',
    condition: 'GT',
    threshold: 0,
    severity: 'WARNING',
    channels: ['DASHBOARD'],
    enabled: true,
  },
];
