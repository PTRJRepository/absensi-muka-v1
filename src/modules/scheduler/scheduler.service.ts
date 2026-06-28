/**
 * Scheduler Service
 *
 * In-memory scheduler for automated sync jobs
 * Persists configuration to src/config/schedule.json
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const SCHEDULE_CONFIG_PATH = path.join(process.cwd(), 'src', 'config', 'schedule.json');

export interface ScheduledJob {
  id: string;
  name: string;
  machines: string[];
  intervalMinutes: number;
  enabled: boolean;
  /** Custom script path (e.g., 'dist/scripts/sync-hr-current-snapshot.js') */
  script?: string;
  /** Environment variables to pass to the script (e.g., { HR_DB_SERVER: '...' }) */
  env?: Record<string, string>;
  /** Enable dry-run mode for this job */
  dryRun?: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

export interface ScheduleConfig {
  enabled: boolean;
  intervalMinutes: number;
  machines: string[];
  jobs: ScheduledJob[];
}

interface RunningJob {
  name: string;
  intervalId: NodeJS.Timeout;
  machine?: string;
}

class SchedulerService {
  private config: ScheduleConfig;
  private runningJobs: Map<string, RunningJob> = new Map();
  private globalIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): ScheduleConfig {
    try {
      if (fs.existsSync(SCHEDULE_CONFIG_PATH)) {
        const content = fs.readFileSync(SCHEDULE_CONFIG_PATH, 'utf-8');
        return JSON.parse(content);
      }
    } catch (err) {
      console.error('[Scheduler] Error loading config:', err);
    }
    return {
      enabled: true,
      intervalMinutes: 60,
      machines: [],
      jobs: []
    };
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(SCHEDULE_CONFIG_PATH, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error('[Scheduler] Error saving config:', err);
    }
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private triggerSync(machineCode?: string, batchCode?: string): void {
    const args = ['dist/scripts/sync-machines.js'];
    if (machineCode) {
      args.push(`--machine=${machineCode}`);
    }
    if (batchCode) {
      args.push(`--batch=${batchCode}`);
    }

    const cwd = process.cwd();
    console.log(`[Scheduler] Triggering sync: node ${args.join(' ')}`);

    const proc = spawn('node', args, { cwd });

    proc.stdout.on('data', (data) => {
      console.log(`[Sync ${batchCode ?? 'default'}] ${data}`);
    });

    proc.stderr.on('data', (data) => {
      console.error(`[Sync ${batchCode ?? 'default'} ERROR] ${data}`);
    });

    proc.on('error', (err) => {
      console.error(`[Scheduler] Failed to start sync process:`, err);
    });
  }

  /**
   * Trigger HR snapshot sync job
   * Runs dist/scripts/sync-hr-current-snapshot.js with optional dry-run and env vars
   */
  private triggerHrSnapshotSync(job: ScheduledJob): void {
    const script = job.script ?? 'dist/scripts/sync-hr-current-snapshot.js';
    const args = [script];

    if (job.dryRun) {
      args.push('--dry-run');
    }

    // Merge custom env vars with HR_DB_SERVER (filter out undefined values)
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    env.HR_DB_SERVER = job.env?.HR_DB_SERVER ?? process.env.HR_DB_SERVER ?? '10.0.0.110';

    // Add any additional custom env vars
    if (job.env) {
      for (const [key, value] of Object.entries(job.env)) {
        if (key !== 'HR_DB_SERVER') {
          env[key] = value;
        }
      }
    }

    const jobName = job.name;
    console.log(`[Scheduler] Triggering HR snapshot sync: node ${args.join(' ')}`);
    console.log(`[Scheduler] HR_DB_SERVER: ${env.HR_DB_SERVER}`);

    const proc = spawn('node', args, {
      cwd: process.cwd(),
      env,
    });

    proc.stdout.on('data', (data) => {
      console.log(`[HR Snapshot] ${data}`);
    });

    proc.stderr.on('data', (data) => {
      console.error(`[HR Snapshot ERROR] ${data}`);
    });

    proc.on('error', (err) => {
      console.error(`[Scheduler] Failed to start HR snapshot sync:`, err);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`[Scheduler] HR snapshot sync completed successfully`);
        job.lastRun = new Date().toISOString();
        this.saveConfig();
      } else {
        console.error(`[Scheduler] HR snapshot sync failed with code ${code}`);
      }
    });
  }

  /**
   * Trigger a generic script job
   */
  private triggerScriptJob(job: ScheduledJob): void {
    const script = job.script;
    if (!script) {
      console.error(`[Scheduler] Job ${job.name} has no script defined`);
      return;
    }

    const args = [script];

    if (job.dryRun) {
      args.push('--dry-run');
    }

    // Build env with custom vars (filter out undefined values)
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    if (job.env) {
      for (const [key, value] of Object.entries(job.env)) {
        env[key] = value;
      }
    }

    console.log(`[Scheduler] Triggering script job ${job.name}: node ${args.join(' ')}`);

    const proc = spawn('node', args, {
      cwd: process.cwd(),
      env,
    });

    proc.stdout.on('data', (data) => {
      console.log(`[${job.name}] ${data}`);
    });

    proc.stderr.on('data', (data) => {
      console.error(`[${job.name} ERROR] ${data}`);
    });

    proc.on('error', (err) => {
      console.error(`[Scheduler] Failed to start script job ${job.name}:`, err);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`[Scheduler] Script job ${job.name} completed successfully`);
        job.lastRun = new Date().toISOString();
        this.saveConfig();
      } else {
        console.error(`[Scheduler] Script job ${job.name} failed with code ${code}`);
      }
    });
  }

  startAll(): void {
    console.log('[Scheduler] Starting all jobs...');

    // Start global interval if enabled
    if (this.config.enabled && this.config.intervalMinutes > 0) {
      this.startGlobalScheduler();
    }

    // Start individual jobs (only if scheduler globally enabled)
    if (this.config.enabled) {
      for (const job of this.config.jobs) {
        if (job.enabled) {
          this.startJob(job.name);
        }
      }
    }
  }

  stopAll(): void {
    console.log('[Scheduler] Stopping all jobs...');

    if (this.globalIntervalId) {
      clearInterval(this.globalIntervalId);
      this.globalIntervalId = null;
    }

    for (const [name, running] of this.runningJobs) {
      clearInterval(running.intervalId);
      console.log(`[Scheduler] Stopped job: ${name}`);
    }
    this.runningJobs.clear();
  }

  startJob(name: string): boolean {
    const job = this.config.jobs.find(j => j.name === name);
    if (!job) {
      console.error(`[Scheduler] Job not found: ${name}`);
      return false;
    }

    if (this.runningJobs.has(name)) {
      console.log(`[Scheduler] Job already running: ${name}`);
      return true;
    }

    const intervalMs = job.intervalMinutes * 60 * 1000;
    const batchCode = `SCHED_${Date.now()}_${name.replace(/\s+/g, '_').toUpperCase()}`;

    console.log(`[Scheduler] Starting job: ${name} (interval: ${job.intervalMinutes}min)`);

    // Determine job type and run accordingly
    if (job.script) {
      // Custom script job (e.g., HR snapshot sync)
      this.runCustomScriptJob(job);

      // Schedule next runs
      const intervalId = setInterval(() => {
        this.runCustomScriptJob(job);
        job.lastRun = new Date().toISOString();
        job.nextRun = new Date(Date.now() + intervalMs).toISOString();
        this.saveConfig();
      }, intervalMs);

      this.runningJobs.set(name, { name, intervalId });
      job.nextRun = new Date(Date.now() + intervalMs).toISOString();
      this.saveConfig();
    } else {
      // Default machine sync job
      this.triggerSync(job.machines[0], batchCode);

      // Schedule next runs
      const intervalId = setInterval(() => {
        const newBatchCode = `SCHED_${Date.now()}_${name.replace(/\s+/g, '_').toUpperCase()}`;
        this.triggerSync(job.machines[0], newBatchCode);
        job.lastRun = new Date().toISOString();
        job.nextRun = new Date(Date.now() + intervalMs).toISOString();
        this.saveConfig();
      }, intervalMs);

      this.runningJobs.set(name, { name, intervalId, machine: job.machines[0] });
      job.nextRun = new Date(Date.now() + intervalMs).toISOString();
      this.saveConfig();
    }

    return true;
  }

  /**
   * Run a custom script job (non-machine sync)
   */
  private runCustomScriptJob(job: ScheduledJob): void {
    if (job.script?.includes('sync-hr-current-snapshot')) {
      this.triggerHrSnapshotSync(job);
    } else {
      this.triggerScriptJob(job);
    }
  }

  stopJob(name: string): boolean {
    const running = this.runningJobs.get(name);
    if (!running) {
      return false;
    }

    clearInterval(running.intervalId);
    this.runningJobs.delete(name);

    const job = this.config.jobs.find(j => j.name === name);
    if (job) {
      job.nextRun = undefined;
      this.saveConfig();
    }

    console.log(`[Scheduler] Stopped job: ${name}`);
    return true;
  }

  isRunning(name: string): boolean {
    return this.runningJobs.has(name);
  }

  private startGlobalScheduler(): void {
    if (this.globalIntervalId) {
      clearInterval(this.globalIntervalId);
    }

    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    const batchCode = `SYNC_${Date.now()}_GLOBAL`;

    console.log(`[Scheduler] Starting global scheduler (interval: ${this.config.intervalMinutes}min)`);

    // Run immediately on start
    this.triggerSync(undefined, batchCode);

    this.globalIntervalId = setInterval(() => {
      const newBatchCode = `SYNC_${Date.now()}_GLOBAL`;
      this.triggerSync(undefined, newBatchCode);
    }, intervalMs);
  }

  // Configuration management
  getConfig(): ScheduleConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<ScheduleConfig>): ScheduleConfig {
    if (typeof updates.enabled === 'boolean') {
      this.config.enabled = updates.enabled;
    }
    if (typeof updates.intervalMinutes === 'number') {
      this.config.intervalMinutes = Math.max(5, Math.min(1440, updates.intervalMinutes));
    }
    if (Array.isArray(updates.machines)) {
      this.config.machines = updates.machines;
    }

    this.saveConfig();

    // Restart global scheduler if settings changed
    if (this.config.enabled) {
      this.startGlobalScheduler();
    } else if (this.globalIntervalId) {
      clearInterval(this.globalIntervalId);
      this.globalIntervalId = null;
    }

    return this.getConfig();
  }

  createJob(data: {
    name: string;
    machines?: string[];
    intervalMinutes: number;
    enabled?: boolean;
    script?: string;
    env?: Record<string, string>;
    dryRun?: boolean;
  }): ScheduledJob | null {
    if (this.config.jobs.some(j => j.name === data.name)) {
      console.error(`[Scheduler] Job already exists: ${data.name}`);
      return null;
    }

    const newJob: ScheduledJob = {
      id: this.generateJobId(),
      name: data.name,
      machines: data.machines ?? [],
      intervalMinutes: Math.max(5, Math.min(1440, data.intervalMinutes)),
      enabled: data.enabled ?? true,
      script: data.script,
      env: data.env,
      dryRun: data.dryRun,
      createdAt: new Date().toISOString()
    };

    this.config.jobs.push(newJob);
    this.saveConfig();

    if (newJob.enabled) {
      this.startJob(newJob.name);
    }

    return newJob;
  }

  deleteJob(name: string): boolean {
    const index = this.config.jobs.findIndex(j => j.name === name);
    if (index === -1) {
      return false;
    }

    this.stopJob(name);
    this.config.jobs.splice(index, 1);
    this.saveConfig();

    return true;
  }

  updateJob(name: string, updates: Partial<Omit<ScheduledJob, 'id' | 'createdAt'>>): ScheduledJob | null {
    const job = this.config.jobs.find(j => j.name === name);
    if (!job) {
      return null;
    }

    const wasRunning = this.isRunning(name);

    if (wasRunning) {
      this.stopJob(name);
    }

    if (Array.isArray(updates.machines)) {
      job.machines = updates.machines;
    }
    if (typeof updates.intervalMinutes === 'number') {
      job.intervalMinutes = Math.max(5, Math.min(1440, updates.intervalMinutes));
    }
    if (typeof updates.enabled === 'boolean') {
      job.enabled = updates.enabled;
    }
    if (typeof updates.script === 'string') {
      job.script = updates.script;
    }
    if (typeof updates.dryRun === 'boolean') {
      job.dryRun = updates.dryRun;
    }
    if (updates.env !== undefined) {
      job.env = updates.env;
    }

    this.saveConfig();

    if (job.enabled && !wasRunning) {
      this.startJob(name);
    }

    return job;
  }

  getRunningJobs(): string[] {
    return Array.from(this.runningJobs.keys());
  }
}

// Singleton instance
let schedulerInstance: SchedulerService | null = null;

export function getSchedulerService(): SchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService();
  }
  return schedulerInstance;
}

export function startSchedulerService(): void {
  const scheduler = getSchedulerService();
  scheduler.startAll();
}

export function stopSchedulerService(): void {
  if (schedulerInstance) {
    schedulerInstance.stopAll();
  }
}
