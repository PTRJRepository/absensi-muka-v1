import ZKLib from 'node-zklib';
import { env } from '../../config/env';
import { testMachineAccessibility, classifyConnectionError } from './tcp-accessibility.service';

export type ZktecoErrorCode = 'CONNECTION_REFUSED' | 'PORT_FORWARDING_NEEDED' | 'NOT_ZKTECO_DEVICE' | 'NETWORK_UNREACHABLE' | 'TIMEOUT' | 'AUTH_FAILED' | 'UNKNOWN_ERROR';
export { classifyConnectionError };

export interface ZktecoMachineConfig {
  machineCode: string;
  ipAddress: string;
  port: number;
  password?: string | null;
  timeoutMs?: number | null;
}

export interface ZktecoResult<T> {
  success: boolean;
  data?: T;
  error?: { code: ZktecoErrorCode; message: string };
}

export type ZktecoAccessibilityResult = {
  success: boolean;
  data?: {
    status: 'ACCESSIBLE' | 'PORT_BLOCKED' | 'NETWORK_UNREACHABLE' | 'TIMEOUT' | 'OFFLINE';
    latencyMs?: number;
    error?: string;
  };
  error?: { code: string; message: string };
};

function classifyError(error: unknown): ZktecoErrorCode {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('refused')) return 'CONNECTION_REFUSED';
  if (message.includes('timeout') || message.includes('timed out')) return 'TIMEOUT';
  if (message.includes('unreachable') || message.includes('ehostunreach')) return 'NETWORK_UNREACHABLE';
  if (message.includes('auth') || message.includes('password')) return 'AUTH_FAILED';
  if (message.includes('protocol') || message.includes('zk')) return 'NOT_ZKTECO_DEVICE';
  return 'UNKNOWN_ERROR';
}

export class ZktecoService {
  private client: any | null = null;

  constructor(private readonly config: ZktecoMachineConfig) {}

  async connect(): Promise<ZktecoResult<void>> {
    try {
      this.client = new ZKLib(
        this.config.ipAddress,
        this.config.port,
        this.config.timeoutMs ?? env.ZKTECO_TIMEOUT_MS,
        4000,
        this.config.password ?? env.ZKTECO_PASSWORD ?? '12345'
      );
      // createSocket uses callbacks - need to wrap in promise
      await new Promise<void>((resolve, reject) => {
        this.client.createSocket(
          (err: any) => { if (err) reject(err); },
          () => {}  // close callback - ignore
        );
        // Give socket time to connect before resolving
        setTimeout(resolve, 1000);
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: { code: classifyError(error), message: error instanceof Error ? error.message : 'Unknown ZKTeco connection error' } };
    }
  }

  /**
   * Quick TCP accessibility test without full ZKTeco handshake.
   * Uses the shared TCP accessibility service with caching.
   */
  async testAccessibility(): Promise<ZktecoAccessibilityResult> {
    try {
      const result = await testMachineAccessibility(
        this.config.ipAddress,
        this.config.port,
        5 * 60 * 1000, // 5-minute TTL
        5000           // 5-second timeout
      );
      if (result.status === 'ACCESSIBLE') {
        return { success: true, data: result };
      }
      return { success: false, error: { code: result.status, message: result.error ?? result.status }, data: result };
    } catch (error) {
      return { success: false, error: { code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } };
    }
  }

  async fetchUsers(): Promise<ZktecoResult<unknown[]>> {
    try {
      await this.client?.disableDevice?.();
      const users = await this.client?.getUsers();
      return { success: true, data: users?.data ?? users ?? [] };
    } catch (error) {
      return { success: false, error: { code: classifyError(error), message: error instanceof Error ? error.message : 'Unknown ZKTeco users error' } };
    } finally {
      try { await this.client?.enableDevice?.(); } catch {}
    }
  }

  async fetchAttendanceRecords(): Promise<ZktecoResult<unknown[]>> {
    try {
      await this.client?.disableDevice?.();
      const records = await this.client?.getAttendances();
      return { success: true, data: records?.data ?? records ?? [] };
    } catch (error) {
      return { success: false, error: { code: classifyError(error), message: error instanceof Error ? error.message : 'Unknown ZKTeco attendance error' } };
    } finally {
      try { await this.client?.enableDevice?.(); } catch {}
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client?.disconnect();
    } catch {
      // Safe disconnect: never crash sync during cleanup.
    } finally {
      this.client = null;
    }
  }
}
