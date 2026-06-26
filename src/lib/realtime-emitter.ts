/**
 * Real-Time Event Emitter (SSE)
 *
 * Provides Server-Sent Events for real-time updates
 * Part of Phase 3: Real-Time Monitoring
 */

import { ServerResponse } from 'http';

// Event types
export type RealtimeEventType =
  | 'sync.started'
  | 'sync.completed'
  | 'sync.failed'
  | 'machine.online'
  | 'machine.offline'
  | 'machine.error'
  | 'attendance.new'
  | 'quality.alert'
  | 'heartbeat';

export interface RealtimeEvent {
  type: RealtimeEventType;
  data: any;
  timestamp: string;
  machineCode?: string;
  batchId?: number;
}

// SSE Client connection
interface SSEClient {
  id: string;
  res: ServerResponse;
  subscribedEvents: Set<string>;
  createdAt: Date;
  lastPing: Date;
}

// Global client registry
const clients = new Map<string, SSEClient>();

// Event history (for late subscribers)
const eventHistory: RealtimeEvent[] = [];
const MAX_HISTORY_SIZE = 100;

/**
 * Generate unique client ID
 */
function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Register a new SSE client
 */
export function addClient(res: ServerResponse): string {
  const clientId = generateClientId();
  const client: SSEClient = {
    id: clientId,
    res,
    subscribedEvents: new Set(['heartbeat', 'sync.*', 'machine.*', 'attendance.new', 'quality.alert']),
    createdAt: new Date(),
    lastPing: new Date(),
  };
  clients.set(clientId, client);
  console.log(`[SSE] Client connected: ${clientId} (total: ${clients.size})`);
  return clientId;
}

/**
 * Remove SSE client
 */
export function removeClient(clientId: string): void {
  const client = clients.get(clientId);
  if (client) {
    clients.delete(clientId);
    console.log(`[SSE] Client disconnected: ${clientId} (total: ${clients.size})`);
  }
}

/**
 * Update client ping time
 */
export function touchClient(clientId: string): void {
  const client = clients.get(clientId);
  if (client) {
    client.lastPing = new Date();
  }
}

/**
 * Subscribe client to specific events
 */
export function subscribeToEvents(clientId: string, events: string[]): void {
  const client = clients.get(clientId);
  if (client) {
    events.forEach(e => client.subscribedEvents.add(e));
  }
}

/**
 * Check if client should receive this event
 */
function shouldReceiveEvent(client: SSEClient, eventType: RealtimeEventType): boolean {
  // Check exact match
  if (client.subscribedEvents.has(eventType)) {
    return true;
  }

  // Check wildcard subscriptions
  for (const sub of client.subscribedEvents) {
    if (sub.endsWith('.*')) {
      const prefix = sub.slice(0, -1);
      if (eventType.startsWith(prefix)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Send event to a single client
 */
function sendToClient(client: SSEClient, event: RealtimeEvent): boolean {
  try {
    const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    client.res.write(data);
    return true;
  } catch (error) {
    console.error(`[SSE] Failed to send to client ${client.id}:`, error);
    return false;
  }
}

/**
 * Broadcast event to all subscribed clients
 */
export function broadcast(event: RealtimeEvent): void {
  // Store in history
  eventHistory.push(event);
  if (eventHistory.length > MAX_HISTORY_SIZE) {
    eventHistory.shift();
  }

  // Send to all subscribed clients
  let sent = 0;
  let failed = 0;

  clients.forEach((client, clientId) => {
    if (shouldReceiveEvent(client, event.type)) {
      const success = sendToClient(client, event);
      if (success) {
        sent++;
      } else {
        failed++;
        // Remove failed client
        clients.delete(clientId);
      }
    }
  });

  if (sent > 0 || failed > 0) {
    console.log(`[SSE] Broadcast ${event.type}: sent=${sent}, failed=${failed}`);
  }
}

/**
 * Publish sync started event
 */
export function publishSyncStarted(machineCode: string, batchId?: number): void {
  broadcast({
    type: 'sync.started',
    data: { machineCode, batchId },
    timestamp: new Date().toISOString(),
    machineCode,
    batchId,
  });
}

/**
 * Publish sync completed event
 */
export function publishSyncCompleted(
  machineCode: string,
  batchId: number,
  stats: { users: number; attendance: number; duration: number }
): void {
  broadcast({
    type: 'sync.completed',
    data: { machineCode, batchId, ...stats },
    timestamp: new Date().toISOString(),
    machineCode,
    batchId,
  });
}

/**
 * Publish sync failed event
 */
export function publishSyncFailed(
  machineCode: string,
  error: string,
  batchId?: number
): void {
  broadcast({
    type: 'sync.failed',
    data: { machineCode, error, batchId },
    timestamp: new Date().toISOString(),
    machineCode,
    batchId,
  });
}

/**
 * Publish machine online event
 */
export function publishMachineOnline(machineCode: string): void {
  broadcast({
    type: 'machine.online',
    data: { machineCode },
    timestamp: new Date().toISOString(),
    machineCode,
  });
}

/**
 * Publish machine offline event
 */
export function publishMachineOffline(machineCode: string, reason?: string): void {
  broadcast({
    type: 'machine.offline',
    data: { machineCode, reason },
    timestamp: new Date().toISOString(),
    machineCode,
  });
}

/**
 * Publish machine error event
 */
export function publishMachineError(
  machineCode: string,
  errorCode: string,
  errorMessage: string
): void {
  broadcast({
    type: 'machine.error',
    data: { machineCode, errorCode, errorMessage },
    timestamp: new Date().toISOString(),
    machineCode,
  });
}

/**
 * Publish new attendance event
 */
export function publishNewAttendance(
  machineCode: string,
  employeeCode: string,
  scanTime: Date
): void {
  broadcast({
    type: 'attendance.new',
    data: { machineCode, employeeCode, scanTime },
    timestamp: new Date().toISOString(),
    machineCode,
  });
}

/**
 * Publish quality alert
 */
export function publishQualityAlert(
  checkName: string,
  severity: string,
  message: string,
  details?: any
): void {
  broadcast({
    type: 'quality.alert',
    data: { checkName, severity, message, details },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get event history for late subscribers
 */
export function getEventHistory(
  since?: Date,
  types?: string[]
): RealtimeEvent[] {
  let events = eventHistory;

  if (since) {
    events = events.filter(e => new Date(e.timestamp) >= since);
  }

  if (types && types.length > 0) {
    events = events.filter(e => types.includes(e.type));
  }

  return events;
}

/**
 * Get connected clients count
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * Get client info
 */
export function getClientInfo(clientId: string): { subscribedEvents: string[]; connected: boolean } | null {
  const client = clients.get(clientId);
  if (!client) {
    return null;
  }
  return {
    subscribedEvents: Array.from(client.subscribedEvents),
    connected: true,
  };
}

/**
 * Cleanup stale clients (no ping for 5 minutes)
 */
export function cleanupStaleClients(): number {
  const now = new Date();
  const timeout = 5 * 60 * 1000; // 5 minutes
  let removed = 0;

  clients.forEach((client, clientId) => {
    if (now.getTime() - client.lastPing.getTime() > timeout) {
      clients.delete(clientId);
      removed++;
      console.log(`[SSE] Removed stale client: ${clientId}`);
    }
  });

  return removed;
}

// Start heartbeat and cleanup interval
let heartbeatInterval: NodeJS.Timeout | null = null;

export function startHeartbeat(): void {
  if (heartbeatInterval) {
    return; // Already running
  }

  // Heartbeat every 30 seconds
  heartbeatInterval = setInterval(() => {
    const event: RealtimeEvent = {
      type: 'heartbeat',
      data: { clientCount: clients.size, timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    };

    clients.forEach((client) => {
      sendToClient(client, event);
    });

    // Cleanup stale clients
    cleanupStaleClients();
  }, 30000);

  console.log('[SSE] Heartbeat started (30s interval)');
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log('[SSE] Heartbeat stopped');
  }
}
