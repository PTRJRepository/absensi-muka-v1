/**
 * Import Job Service
 * 
 * Manages sync_job and import_batch lifecycle
 */

import { SqlClient } from '../../shared/database/sql-client';

export interface SyncJob {
  sync_job_id: number;
  job_code: string;
  sync_type: string;
  trigger_type: string;
  period_start?: Date;
  period_end?: Date;
  status: string;
  started_at: Date;
  completed_at?: Date;
  total_batch: number;
  success_batch: number;
  failed_batch: number;
  error_message?: string;
  created_by: string;
}

export interface ImportBatch {
  import_batch_id: number;
  batch_code: string;
  sync_job_id?: number;
  source_type: string;
  machine_id?: number;
  division_id?: number;
  source_name?: string;
  year?: number;
  month?: number;
  date_from?: Date;
  date_to?: Date;
  total_records: number;
  inserted_records: number;
  duplicate_records: number;
  error_records: number;
  status: string;
  started_at: Date;
  completed_at?: Date;
  raw_payload_path?: string;
  error_message?: string;
  imported_by: string;
}

export class ImportJobService {
  constructor(private sqlClient: SqlClient) {}

  /**
   * Create new sync job
   */
  async createSyncJob(data: {
    sync_type: 'DIRECT_MACHINE' | 'MIXED' | 'REPROCESS';
    trigger_type?: string;
    period_start?: Date;
    period_end?: Date;
    created_by?: string;
  }): Promise<number> {
    const jobCode = this.generateJobCode(data.sync_type);

    return this.sqlClient.insert('sync_job', {
      job_code: jobCode,
      sync_type: data.sync_type,
      trigger_type: data.trigger_type || 'MANUAL',
      period_start: data.period_start,
      period_end: data.period_end,
      status: 'PENDING',
      total_batch: 0,
      success_batch: 0,
      failed_batch: 0,
      created_by: data.created_by || 'SYSTEM',
    });
  }

  /**
   * Create import batch
   */
  async createImportBatch(data: {
    sync_job_id?: number;
    source_type: 'DIRECT_MACHINE' | 'MANUAL_USB';
    machine_id?: number;
    division_id?: number;
    source_name?: string;
    year?: number;
    month?: number;
    date_from?: Date;
    date_to?: Date;
    imported_by?: string;
  }): Promise<number> {
    const batchCode = this.generateBatchCode(data.source_type, data.source_name || '');

    return this.sqlClient.insert('import_batch', {
      batch_code: batchCode,
      sync_job_id: data.sync_job_id,
      source_type: data.source_type,
      machine_id: data.machine_id,
      division_id: data.division_id,
      source_name: data.source_name,
      year: data.year,
      month: data.month,
      date_from: data.date_from,
      date_to: data.date_to,
      total_records: 0,
      inserted_records: 0,
      duplicate_records: 0,
      error_records: 0,
      status: 'PENDING',
      imported_by: data.imported_by || 'SYSTEM',
    });
  }

  /**
   * Update batch progress
   */
  async updateBatchProgress(
    batchId: number,
    data: {
      total_records?: number;
      inserted_records?: number;
      duplicate_records?: number;
      error_records?: number;
    }
  ): Promise<void> {
    await this.sqlClient.update('import_batch', data, `import_batch_id = ${batchId}`);
  }

  /**
   * Complete batch and update machine sync timestamp
   */
  async completeBatch(
    batchId: number,
    status: 'SUCCESS' | 'FAILED' | 'PARTIAL',
    errorMessage?: string
  ): Promise<void> {
    // Update batch status
    await this.sqlClient.update(
      'import_batch',
      {
        status,
        completed_at: new Date(),
        error_message: errorMessage,
      },
      `import_batch_id = ${batchId}`
    );

    // Update machine last_sync_at timestamp
    try {
      const statusVal = status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
      const errorVal = errorMessage ?? null;
      await this.sqlClient.query(`
        UPDATE attendance_machines
        SET last_sync_at = SYSUTCDATETIME(),
            last_sync_status = '${statusVal}',
            last_error_message = ${errorVal === null ? 'NULL' : "'" + errorVal.replace(/'/g, "''") + "'"}
        WHERE machine_id = (SELECT machine_id FROM import_batch WHERE import_batch_id = ${batchId})
      `);
    } catch (e) {
      console.error('Failed to update machine sync timestamp:', e);
    }
  }

  /**
   * Update sync job progress based on batch results
   */
  async updateSyncJobProgress(syncJobId: number): Promise<void> {
    const sql = `
      SELECT 
        COUNT(*) AS total_batch,
        SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_batch,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_batch
      FROM import_batch
      WHERE sync_job_id = ${syncJobId}
    `;

    const result = await this.sqlClient.query<{
      total_batch: number;
      success_batch: number;
      failed_batch: number;
    }>(sql);

    if (result.length > 0) {
      await this.sqlClient.update(
        'sync_job',
        {
          total_batch: result[0].total_batch,
          success_batch: result[0].success_batch,
          failed_batch: result[0].failed_batch,
        },
        `sync_job_id = ${syncJobId}`
      );
    }
  }

  /**
   * Complete sync job
   */
  async completeSyncJob(
    syncJobId: number,
    status: 'SUCCESS' | 'FAILED' | 'PARTIAL',
    errorMessage?: string
  ): Promise<void> {
    await this.updateSyncJobProgress(syncJobId);

    await this.sqlClient.update(
      'sync_job',
      {
        status,
        completed_at: new Date(),
        error_message: errorMessage,
      },
      `sync_job_id = ${syncJobId}`
    );
  }

  /**
   * Get sync job by ID
   */
  async getSyncJob(syncJobId: number): Promise<SyncJob | null> {
    const results = await this.sqlClient.select<SyncJob>(
      'sync_job',
      '*',
      `sync_job_id = ${syncJobId}`
    );
    return results[0] || null;
  }

  /**
   * Get batches for sync job
   */
  async getBatchesForJob(syncJobId: number): Promise<ImportBatch[]> {
    return this.sqlClient.select<ImportBatch>(
      'import_batch',
      '*',
      `sync_job_id = ${syncJobId}`,
      'started_at'
    );
  }

  /**
   * Generate unique job code
   */
  private generateJobCode(syncType: string): string {
    const timestamp = Date.now();
    const prefix = syncType.substring(0, 3).toUpperCase();
    return `${prefix}_${timestamp}`;
  }

  /**
   * Generate unique batch code
   */
  private generateBatchCode(sourceType: string, sourceName: string): string {
    const timestamp = Date.now();
    const prefix = sourceType === 'DIRECT_MACHINE' ? 'MACH' : 'API';
    const source = sourceName.replace(/[^A-Z0-9]/gi, '').substring(0, 10).toUpperCase();
    return `${prefix}_${source}_${timestamp}`;
  }
}
