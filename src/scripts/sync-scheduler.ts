/**
 * Sync Scheduler
 *
 * Automated sync scheduler using node-cron
 * Manages ZKTeco machine sync and health check jobs
 */

import * as cron from 'node-cron';
import { SyncOrchestrator } from '../modules/import/sync-orchestrator.service';
import { SqlClient } from '../shared/database/sql-client';
import { MachineRepository } from '../modules/machines/machine.repository';
import { ImportJobService } from '../modules/import/import-job.service';
import { ZktecoService } from '../modules/machines/zkteco.service';
import { MachineService } from '../modules/machines/machine.service';
import { EmployeeMappingService } from '../modules/employees/employee-mapping.service';
import { EmployeeRepository } from '../modules/employees/employee.repository';
import {
  publishSyncStarted,
  publishSyncCompleted,
  publishSyncFailed,
  publishMachineOnline,
  publishMachineOffline,
  publishMachineError,
} from '../lib/realtime-emitter';

export interface SchedulerConfig {
  enabled: boolean;
  syncIntervalMinutes: number;
  healthCheckEnabled: boolean;
  healthCheckIntervalMinutes: number;
}

export interface SchedulerStatus {
  running: boolean;
  lastSync: Date | null;
  nextSync: Date | null;
  machinesLastSync: Record<string, Date>;
  syncInProgress: boolean;
  config: SchedulerConfig;
}

export class SyncScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private healthCronJob: cron.ScheduledTask | null = null;
  private orchestrator: SyncOrchestrator;
  private isRunning = false;
  private lastSyncTime: Date | null = null;
  private machineLastSync: Map<string, Date> = new Map();

  constructor() {
    // Initialize dependencies
    const sqlClient = new SqlClient(
      process.env.GATEWAY_URL || 'http://10.0.0.110:8001/v1/query',
      process.env.GATEWAY_API_KEY || ''
    );

    const machineRepo = new MachineRepository(sqlClient);
    const machineService = new MachineService(machineRepo);
    const importJobService = new ImportJobService(sqlClient);
    const employeeMappingService = new EmployeeMappingService(sqlClient);
    const employeeRepo = new EmployeeRepository(sqlClient);

    this.orchestrator = new SyncOrchestrator(
      machineService,
      machineRepo,
      importJobService,
      employeeMappingService,
      employeeRepo,
      sqlClient
    );
  }

  /**
   * Start the scheduler
   */
  start(config?: Partial<SchedulerConfig>): void {
    const fullConfig: SchedulerConfig = {
      enabled: config?.enabled ?? true,
      syncIntervalMinutes: config?.syncIntervalMinutes ?? 15,
      healthCheckEnabled: config?.healthCheckEnabled ?? true,
      healthCheckIntervalMinutes: config?.healthCheckIntervalMinutes ?? 5,
    };

    // Main ZKTeco sync job
    if (fullConfig.enabled) {
      const cronExpression = `*/${fullConfig.syncIntervalMinutes} * * * *`; // Every X minutes

      this.cronJob = cron.schedule(cronExpression, async () => {
        await this.runSyncJob();
      }, {
        timezone: 'Asia/Jakarta',
      });

      console.log(`[Scheduler] Main sync job started: every ${fullConfig.syncIntervalMinutes} minutes`);
    }

    // Health check job
    if (fullConfig.healthCheckEnabled) {
      const healthCronExpression = `*/${fullConfig.healthCheckIntervalMinutes} * * * *`; // Every X minutes

      this.healthCronJob = cron.schedule(healthCronExpression, async () => {
        await this.runHealthCheck();
      }, {
        timezone: 'Asia/Jakarta',
      });

      console.log(`[Scheduler] Health check job started: every ${fullConfig.healthCheckIntervalMinutes} minutes`);
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[Scheduler] Main sync job stopped');
    }
    if (this.healthCronJob) {
      this.healthCronJob.stop();
      this.healthCronJob = null;
      console.log('[Scheduler] Health check job stopped');
    }
  }

  /**
   * Run manual sync for all accessible machines
   */
  async runSyncJob(): Promise<void> {
    if (this.isRunning) {
      console.log('[Scheduler] Sync already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    this.lastSyncTime = new Date();

    try {
      console.log('[Scheduler] Starting scheduled sync...');
      const result = await this.orchestrator.syncAllMachines();

      console.log(`[Scheduler] Sync completed: ${result.success}/${result.total} machines`);
    } catch (error: any) {
      console.error('[Scheduler] Sync failed:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run health check for all machines
   */
  async runHealthCheck(): Promise<void> {
    try {
      const result = await this.orchestrator.healthCheckAllMachines();

      // Update machine online status
      for (const machine of result.machines) {
        const lastSync = this.machineLastSync.get(machine.machineCode);
        if (machine.isOnline && !lastSync) {
          publishMachineOnline(machine.machineCode);
        } else if (!machine.isOnline && lastSync) {
          publishMachineOffline(machine.machineCode, 'Health check failed');
        }
        this.machineLastSync.set(machine.machineCode, new Date());
      }

      console.log(`[Scheduler] Health check completed: ${result.online}/${result.total} machines online`);
    } catch (error: any) {
      console.error('[Scheduler] Health check failed:', error.message);
    }
  }

  /**
   * Run sync for specific machine
   */
  async syncMachine(machineCode: string): Promise<void> {
    publishSyncStarted(machineCode);

    try {
      const result = await this.orchestrator.syncMachine(machineCode);

      if (result.success) {
        publishSyncCompleted(machineCode, result.batchId ?? 0, {
          users: result.usersCount ?? 0,
          attendance: result.attendanceCount ?? 0,
          duration: result.duration ?? 0,
        });
        this.machineLastSync.set(machineCode, new Date());
      } else {
        publishSyncFailed(machineCode, result.error!, result.batchId);
        publishMachineError(machineCode, 'SYNC_FAILED', result.error!);
      }
    } catch (error: any) {
      publishSyncFailed(machineCode, error.message);
      console.error(`[Scheduler] Sync for ${machineCode} failed:`, error.message);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): SchedulerStatus {
    return {
      running: this.cronJob !== null,
      lastSync: this.lastSyncTime,
      nextSync: this.calculateNextSync(),
      machinesLastSync: Object.fromEntries(this.machineLastSync),
      syncInProgress: this.isRunning,
      config: {
        enabled: this.cronJob !== null,
        syncIntervalMinutes: 15,
        healthCheckEnabled: this.healthCronJob !== null,
        healthCheckIntervalMinutes: 5,
      },
    };
  }

  /**
   * Calculate next sync time
   */
  private calculateNextSync(): Date | null {
    if (!this.cronJob) return null;
    // node-cron doesn't expose next run time, so we calculate based on interval
    if (!this.lastSyncTime) return new Date();
    return new Date(this.lastSyncTime.getTime() + 15 * 60 * 1000);
  }
}

// Singleton instance
let schedulerInstance: SyncScheduler | null = null;

export function getScheduler(): SyncScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new SyncScheduler();
  }
  return schedulerInstance;
}

export function startScheduler(config?: Partial<SchedulerConfig>): SyncScheduler {
  const scheduler = getScheduler();
  scheduler.start(config);
  return scheduler;
}

export function stopScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
}
