import { Socket } from 'net';

export type TcpAccessibilityStatus =
  | 'ACCESSIBLE'
  | 'PORT_BLOCKED'
  | 'NETWORK_UNREACHABLE'
  | 'TIMEOUT'
  | 'OFFLINE';

export interface TcpAccessibilityResult {
  status: TcpAccessibilityStatus;
  latencyMs?: number;
  error?: string;
  testedAt: string;
}

export type TcpCacheEntry = {
  result: TcpAccessibilityResult;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 60 * 1000; // 1 minute (real-time refresh)
const DEFAULT_TIMEOUT_MS = 5000;

const cache = new Map<string, TcpCacheEntry>();

// ─────────────────────────────────────────────────────────────────────────────
// Error classification
// ─────────────────────────────────────────────────────────────────────────────

export function classifyConnectionError(err: NodeJS.ErrnoException): TcpAccessibilityStatus {
  switch (err.code) {
    case 'ECONNREFUSED':
      return 'PORT_BLOCKED';
    case 'ENETUNREACH':
    case 'EHOSTUNREACH':
      return 'NETWORK_UNREACHABLE';
    case 'ETIMEDOUT':
      return 'TIMEOUT';
    case 'EADDRNOTAVAIL':
    case 'ECONNRESET':
    case 'EPIPE':
      return 'OFFLINE';
    default:
      return 'OFFLINE';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core TCP test
// ─────────────────────────────────────────────────────────────────────────────

function testTcpConnection(
  ip: string,
  port: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<TcpAccessibilityResult> {
  const testedAt = new Date().toISOString();

  return new Promise((resolve) => {
    const socket = new Socket();
    const start = Date.now();

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.destroy();
      resolve({ status: 'ACCESSIBLE', latencyMs: Date.now() - start, testedAt });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ status: 'TIMEOUT', error: 'Connection timed out', testedAt });
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      socket.destroy();
      resolve({
        status: classifyConnectionError(err),
        error: err.message,
        testedAt,
      });
    });

    socket.connect(port, ip);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Test TCP accessibility of a ZKTeco machine.
 * Results are cached for `ttlMs` milliseconds (default 5 minutes).
 */
export async function testMachineAccessibility(
  ip: string | null | undefined,
  port: number | null | undefined,
  ttlMs: number = DEFAULT_TTL_MS,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<TcpAccessibilityResult> {
  const testedAt = new Date().toISOString();

  // Validate inputs
  if (!ip || !port || typeof port !== 'number' || port <= 0 || port > 65535) {
    return { status: 'OFFLINE', error: 'Invalid IP or port', testedAt };
  }

  // Basic IP validation
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Pattern.test(ip)) {
    return { status: 'OFFLINE', error: 'Invalid IP address format', testedAt };
  }

  const cacheKey = `${ip}:${port}`;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  try {
    const result = await testTcpConnection(ip, port, timeoutMs);

    cache.set(cacheKey, {
      result,
      expiresAt: now + ttlMs,
    });

    return result;
  } catch (err: any) {
    // Unexpected error - return OFFLINE with error message
    const result = { status: 'OFFLINE' as TcpAccessibilityStatus, error: err?.message ?? 'Unknown error', testedAt };

    cache.set(cacheKey, {
      result,
      expiresAt: now + ttlMs,
    });

    return result;
  }
}

/**
 * Invalidate cached result for a specific machine.
 * Call this after a successful sync to refresh the cache.
 */
export function invalidateCache(ip: string, port: number): void {
  cache.delete(`${ip}:${port}`);
}

/**
 * Clear all cached results.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get cache statistics (for debugging/monitoring).
 */
export function getCacheStats(): { size: number; entries: Record<string, { expiresAt: number; status: TcpAccessibilityStatus }> } {
  const now = Date.now();
  const entries: Record<string, { expiresAt: number; status: TcpAccessibilityStatus }> = {};
  for (const [key, entry] of cache.entries()) {
    entries[key] = { expiresAt: entry.expiresAt, status: entry.result.status };
  }
  return { size: cache.size, entries };
}

/**
 * Batch-test multiple machines and return results with machine metadata.
 */
export async function testMachinesBatch(
  machines: Array<{ machineCode: string; ipAddress: string; port: number }>,
  ttlMs: number = DEFAULT_TTL_MS,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Map<string, TcpAccessibilityResult>> {
  const results = await Promise.all(
    machines.map(async (m) => ({
      machineCode: m.machineCode,
      result: await testMachineAccessibility(m.ipAddress, m.port, ttlMs, timeoutMs),
    }))
  );

  const map = new Map<string, TcpAccessibilityResult>();
  for (const { machineCode, result } of results) {
    map.set(machineCode, result);
  }
  return map;
}
