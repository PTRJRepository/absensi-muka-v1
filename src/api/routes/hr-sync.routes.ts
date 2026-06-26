/**
 * HR Employee Sync Routes
 *
 * API endpoints for HR employee synchronization from db_ptrj
 */

import { route } from '../router';
import { sendJson, sendError } from '../response';
import { syncHrEmployees, getSyncStatus } from '../../modules/employees/hr-employee-sync.service';

/**
 * POST /api/hr-sync/trigger
 * Trigger HR sync from db_ptrj
 */
route('POST', '/api/hr-sync/trigger', async (ctx) => {
  try {
    console.log('[API] Triggering HR sync...');
    const result = await syncHrEmployees();

    sendJson(ctx.res, 200, {
      success: true,
      batchId: result.batchId,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors.slice(0, 10), // Limit errors in response
      errorCount: result.errors.length,
    });
  } catch (error) {
    console.error('[API] HR sync failed:', error);
    sendError(ctx.res, 500, 'SYNC_FAILED', 'HR sync failed');
  }
});

/**
 * GET /api/hr-sync/status
 * Get HR sync status
 */
route('GET', '/api/hr-sync/status', async (ctx) => {
  try {
    const status = await getSyncStatus();

    sendJson(ctx.res, 200, {
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('[API] Get sync status failed:', error);
    sendError(ctx.res, 500, 'STATUS_FAILED', 'Failed to get sync status');
  }
});
