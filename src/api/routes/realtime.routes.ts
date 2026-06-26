/**
 * Real-Time API Routes (SSE)
 *
 * Server-Sent Events endpoints for real-time dashboard updates
 * Part of Phase 3: Real-Time Monitoring
 */

import { ServerResponse } from 'http';
import { route } from '../router';
import {
  addClient,
  removeClient,
  touchClient,
  subscribeToEvents,
  getEventHistory,
  getClientCount,
  startHeartbeat,
} from '../../lib/realtime-emitter';
import { query, sql } from '../../lib/db';

// Start heartbeat on module load
startHeartbeat();

/**
 * GET /api/realtime/sync-status
 * SSE endpoint for sync status updates
 */
route('GET', '/api/realtime/sync-status', async (ctx) => {
  const res = ctx.res as ServerResponse;
  const clientId = addClient(res);

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Send initial connection event
  res.write(`event: connected\ndata: {"clientId":"${clientId}","message":"Connected to sync status stream"}\n\n`);

  // Send recent history for sync events
  const recentSyncEvents = getEventHistory(
    new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
    ['sync.started', 'sync.completed', 'sync.failed']
  );

  for (const event of recentSyncEvents) {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  // Subscribe to sync events
  subscribeToEvents(clientId, ['sync.started', 'sync.completed', 'sync.failed']);

  // Setup ping/keepalive via query param
  const pingInterval = setInterval(() => {
    try {
      touchClient(clientId);
      res.write(`event: ping\ndata: {"timestamp":"${new Date().toISOString()}"}\n\n`);
    } catch {
      clearInterval(pingInterval);
      removeClient(clientId);
    }
  }, 30000);

  // Cleanup on close
  ctx.req.on('close', () => {
    clearInterval(pingInterval);
    removeClient(clientId);
  });
}, { protected: false }); // Public endpoint for dashboard

/**
 * GET /api/realtime/live-feed
 * SSE endpoint for live attendance feed
 */
route('GET', '/api/realtime/live-feed', async (ctx) => {
  const res = ctx.res as ServerResponse;
  const clientId = addClient(res);

  // Get initial data from local DB
  const today = new Date().toISOString().split('T')[0];
  let stats = { last_10_minutes: 0, last_30_minutes: 0, last_1_hour: 0, by_machine: [] };
  let machineStatus: any[] = [];
  let recentBatches: any[] = [];
  let latestScans: any[] = [];
  try {
    const [scanStats, machineRows, batchRows, scanRows] = await Promise.all([
      query<any>('SELECT COUNT(*) as cnt FROM attendance_scan_logs'),
      query<any>('SELECT machine_code, location_name, access_status FROM attendance_machines WHERE is_active = 1'),
      query<any>('SELECT TOP 10 batch_code, status, records_success, started_at FROM attendance_import_batches ORDER BY started_at DESC'),
      query<any>('SELECT TOP 20 raw_device_user_id, machine_code, scan_time, mapping_status FROM attendance_scan_logs WHERE scan_date = @today ORDER BY scan_time DESC', [{ name: 'today', type: sql.NVarChar, value: today }])
    ]);
    stats = { last_10_minutes: scanStats[0]?.cnt || 0, last_30_minutes: scanStats[0]?.cnt || 0, last_1_hour: scanStats[0]?.cnt || 0, by_machine: [] };
    machineStatus = machineRows;
    recentBatches = batchRows;
    latestScans = scanRows;
  } catch (e) {
    console.error('[realtime/live-feed] Failed to load initial data:', e);
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial snapshot
  res.write(`event: connected\ndata: ${JSON.stringify({
    clientId,
    stats,
    machineStatus,
    recentBatches,
    latestScans
  })}\n\n`);

  // Subscribe to events
  subscribeToEvents(clientId, [
    'attendance.new',
    'machine.online',
    'machine.offline',
    'machine.error',
    'sync.completed',
    'sync.failed',
  ]);

  // Ping interval
  const pingInterval = setInterval(() => {
    try {
      touchClient(clientId);
      res.write(`event: ping\ndata: {"timestamp":"${new Date().toISOString()}"}\n\n`);
    } catch {
      clearInterval(pingInterval);
      removeClient(clientId);
    }
  }, 30000);

  ctx.req.on('close', () => {
    clearInterval(pingInterval);
    removeClient(clientId);
  });
}, { protected: false });

/**
 * GET /api/realtime/events
 * SSE endpoint for all events
 */
route('GET', '/api/realtime/events', async (ctx) => {
  const res = ctx.res as ServerResponse;
  const clientId = addClient(res);

  // Parse subscribed events from query
  const eventsParam = ctx.query.get('events');
  const defaultEvents: string[] = ['heartbeat', 'sync.started', 'sync.completed', 'sync.failed', 'attendance.new', 'quality.alert'];
  const subscribedEvents: string[] = eventsParam
    ? eventsParam.split(',')
    : defaultEvents;

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send connection confirmation
  res.write(`event: connected\ndata: {"clientId":"${clientId}","events":${JSON.stringify(subscribedEvents)}}\n\n`);

  // Send recent history
  const since = new Date(Date.now() - 60 * 60 * 1000); // Last hour
  const recentEvents = getEventHistory(since, subscribedEvents);

  for (const event of recentEvents) {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  // Subscribe client
  subscribeToEvents(clientId, subscribedEvents);

  // Ping interval
  const pingInterval = setInterval(() => {
    try {
      touchClient(clientId);
      res.write(`event: ping\ndata: {"timestamp":"${new Date().toISOString()}"}\n\n`);
    } catch {
      clearInterval(pingInterval);
      removeClient(clientId);
    }
  }, 30000);

  ctx.req.on('close', () => {
    clearInterval(pingInterval);
    removeClient(clientId);
  });
}, { protected: false });

/**
 * GET /api/realtime/stats
 * Get real-time connection stats (non-SSE)
 */
route('GET', '/api/realtime/stats', async (ctx) => {
  const clientCount = getClientCount();

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    success: true,
    data: {
      connectedClients: clientCount,
      timestamp: new Date().toISOString(),
    },
  }));
});

/**
 * GET /api/realtime/latest-scans
 * Get latest attendance scans (polling fallback)
 */
route('GET', '/api/realtime/latest-scans', async (ctx) => {
  const limit = parseInt(ctx.query.get('limit') || '50');
  const today = new Date().toISOString().split('T')[0];
  let scans: any[] = [];
  try {
    scans = await query<any>('SELECT TOP ' + limit + ' raw_device_user_id, machine_code, scan_time, parsed_employee_code, mapping_status FROM attendance_scan_logs WHERE scan_date = @today ORDER BY scan_time DESC', [{ name: 'today', type: sql.NVarChar, value: today }]);
  } catch (e) {
    console.error('[realtime/latest-scans] Failed to load scans:', e);
  }

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    success: true,
    data: {
      count: scans.length,
      latestId: scans.length > 0 ? 1 : 0,
      scans,
    },
  }));
});

/**
 * GET /api/realtime/feed-stats
 * Get live feed statistics (polling fallback)
 */
route('GET', '/api/realtime/feed-stats', async (ctx) => {
  let stats = { last_10_minutes: 0, last_30_minutes: 0, last_1_hour: 0, by_machine: [] };
  let machineStatus: any[] = [];
  let recentBatches: any[] = [];
  try {
    const [scanStats, machineRows, batchRows] = await Promise.all([
      query<any>('SELECT COUNT(*) as cnt FROM attendance_scan_logs'),
      query<any>('SELECT machine_code, location_name, access_status FROM attendance_machines WHERE is_active = 1'),
      query<any>('SELECT TOP 10 batch_code, status, records_success, started_at FROM attendance_import_batches ORDER BY started_at DESC')
    ]);
    stats = { last_10_minutes: scanStats[0]?.cnt || 0, last_30_minutes: scanStats[0]?.cnt || 0, last_1_hour: scanStats[0]?.cnt || 0, by_machine: [] };
    machineStatus = machineRows;
    recentBatches = batchRows;
  } catch (e) {
    console.error('[realtime/feed-stats] Failed to load feed stats:', e);
  }

  ctx.res.writeHead(200, { 'Content-Type': 'application/json' });
  ctx.res.end(JSON.stringify({
    success: true,
    data: {
      stats,
      machineStatus,
      recentBatches,
    },
  }));
});
