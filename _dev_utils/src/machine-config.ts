// Konfigurasi Mesin Absensi - Updated 2026-06-15
// Tested via ZKTeco protocol - results included

export interface MachineConfig {
  ip: string;
  port: number;
  ipLocal?: string;
  scannerCode?: number | null;
  locCode?: string | null;
  suffix: string;
  type: string;
  // Test results (2026-06-15)
  accessible?: boolean;
  users?: number;
  attendances?: number;
  error?: string | null;
}

export const machineServers: Record<string, MachineConfig> = {
  // ========================================
  // CANONICAL MACHINES (16 physical ZKTeco devices)
  // ========================================

  "OFFICE_PGE": {
    ip: "223.25.98.220",
    port: 4370,
    ipLocal: "10.0.0.232",
    scannerCode: null,
    locCode: "A",
    suffix: "PGE",
    type: "office",
    accessible: true,
    users: 1653,
    attendances: 6547,
  },

  "OFFICE_APE": {
    ip: "103.144.208.154",
    port: 4370,
    ipLocal: "192.168.1.233",
    scannerCode: null,
    locCode: "F",
    suffix: "APE",
    type: "office",
    accessible: true,
    users: 1083,
    attendances: 11423,
  },

  "MILL": {
    ip: "103.127.66.32",
    port: 4370,
    ipLocal: null,
    scannerCode: null,
    locCode: null,
    suffix: "MILL",
    type: "office",
    accessible: true,
    users: 569,
    attendances: 3273,
  },

  "IJL": {
    ip: "103.144.211.226",
    port: 4370,
    ipLocal: null,
    scannerCode: null,
    locCode: "L",
    suffix: "IJL",
    type: "absensi",
    accessible: true,
    users: 166,
    attendances: 4910,
  },

  "AB2": {
    ip: "103.144.208.154",
    port: 4400,
    ipLocal: "192.168.1.232",
    scannerCode: 400,
    locCode: "H",
    suffix: "AB2",
    type: "absensi",
    accessible: true,
    users: 233,
    attendances: 3944,
  },

  "P1A": {
    ip: "10.0.0.90",
    port: 4100,
    ipLocal: "10.0.0.90",
    scannerCode: 100,
    locCode: "A",
    suffix: "P1A",
    type: "absensi",
    accessible: true,
    users: 792,
    attendances: 2681,
  },

  "P1B": {
    ip: "10.0.0.91",
    port: 4300,
    ipLocal: "10.0.0.91",
    scannerCode: 300,
    locCode: "B",
    suffix: "P1B",
    type: "absensi",
    accessible: true,
    users: 792,
    attendances: 2675,
  },

  // ========================================
  // INACCESSIBLE / RETRYABLE MACHINES (9 machines)
  // ========================================
  // Note: Some may be blocked by firewall/port forwarding

  "DME_01": {
    ip: "103.144.228.42",
    port: 4700,
    ipLocal: "192.168.1.10",
    scannerCode: 700,
    locCode: "E",
    suffix: "DME",
    type: "absensi",
    accessible: false,
    error: "Connection failed - port not reachable",
  },

  "DME_02": {
    ip: "103.144.228.42",
    port: 4701,
    ipLocal: "192.168.1.11",
    scannerCode: 700,
    locCode: "E",
    suffix: "DME",
    type: "absensi",
    accessible: false,
    error: "Connection failed - port not reachable",
  },

  "ARC_01": {
    ip: "103.144.208.154",
    port: 4200,
    ipLocal: "192.168.1.235",
    scannerCode: 200,
    locCode: "J",
    suffix: "ARC",
    type: "absensi",
    accessible: false,
    error: "Connection failed - port not reachable",
  },

  "ARC_02": {
    ip: "103.144.208.154",
    port: 4201,
    ipLocal: "192.168.1.236",
    scannerCode: 200,
    locCode: "J",
    suffix: "ARC",
    type: "absensi",
    accessible: false,
    error: "Connection failed - port not reachable",
  },

  "ARA": {
    ip: "103.144.208.154",
    port: 4800,
    ipLocal: "192.168.1.230",
    scannerCode: 800,
    locCode: "F",
    suffix: "ARA",
    type: "absensi",
    accessible: false,
    error: "Connection failed - port not reachable",
  },

  "AB1": {
    ip: "103.144.208.154",
    port: 4900,
    ipLocal: "192.168.1.231",
    scannerCode: 900,
    locCode: "G",
    suffix: "AB1",
    type: "absensi",
    accessible: false,
    error: "Connection failed - port not reachable",
  },

  "P2A_01": {
    ip: "10.0.0.92",
    port: 4500,
    ipLocal: "10.0.0.92",
    scannerCode: 500,
    locCode: "C",
    suffix: "P2A",
    type: "absensi",
    accessible: false,
    error: "Connection failed - network unreachable",
  },

  "P2B": {
    ip: "10.0.0.93",
    port: 4600,
    ipLocal: "10.0.0.93",
    scannerCode: 600,
    locCode: "D",
    suffix: "P2B",
    type: "absensi",
    accessible: false,
    error: "Connection failed - network unreachable",
  },

  "P2A_02": {
    ip: "10.0.0.94",
    port: 4501,
    ipLocal: "10.0.0.94",
    scannerCode: 500,
    locCode: "C",
    suffix: "P2A",
    type: "absensi",
    accessible: false,
    error: "Connection failed - network unreachable",
  },
};

// Scanner Code Suffix → Number Prefix
export const scannerCodeMap: Record<string, number> = {
  "P1A": 100, "ARC": 200, "P1B": 300, "AB2": 400,
  "P2A": 500, "P2B": 600, "DME": 700, "ARA": 800, "AB1": 900,
};

// locCode → Employee Code Prefix
export const locCodeMap: Record<string, string> = {
  "P1A": "A", "P1B": "B", "P2A": "C", "P2B": "D",
  "DME": "E", "ARA": "F", "AB1": "G", "AB2": "H",
  "ARC": "J", "IJL": "L", "PGE": "A", "APE": "F",
};

// ========================================
// MACHINE HEALTH THRESHOLDS
// Used by src/api/routes/ops.routes.ts for SLA classification
// ========================================
export const MACHINE_HEALTH_THRESHOLDS = {
  // Quality Score bands
  QUALITY_HEALTHY: 80,    // >= 80 = HEALTHY / ONLINE
  QUALITY_DEGRADED: 50,   // 50-79  = DEGRADED / WARNING
  QUALITY_CRITICAL: 50,   // < 50   = CRITICAL (also triggers on BLOCKED/UNREACHABLE)

  // Sync staleness
  STALE_MINUTES: 60,              // > 60 min since last sync = STALE
  SEVERELY_STALE_HOURS: 24,       // > 24 hours since last sync = SEVERELY_STALE

  // Severity trigger: unreachable duration (minutes)
  CRITICAL_UNREACHABLE_MINUTES: 240,  // > 4 hours unreachable = CRITICAL
  HIGH_OFFLINE_MINUTES: 60,          // > 1 hour offline = HIGH

  // Incident retention (days)
  INCIDENT_RETENTION_DAYS: 30,

  // Connection retry policy
  RETRY_INITIAL_DELAY_MS: 3000,      // 3 seconds
  RETRY_MAX_RETRIES: 5,
  RETRY_BACKOFF_MULTIPLIER: 3,       // exponential: 3s, 9s, 27s, 81s, 243s
  RETRY_TOTAL_TIMEOUT_MS: 300000,    // 5 minutes total
};

/**
 * Calculate retry delay for a given attempt number (1-indexed)
 * Uses exponential backoff: delay = initial * (multiplier ^ (attempt - 1))
 */
export function getRetryDelayMs(attempt: number): number {
  return (
    MACHINE_HEALTH_THRESHOLDS.RETRY_INITIAL_DELAY_MS *
    Math.pow(MACHINE_HEALTH_THRESHOLDS.RETRY_BACKOFF_MULTIPLIER, attempt - 1)
  );
}

/**
 * Classify sync staleness based on last sync timestamp
 */
export function classifySyncStaleness(
  lastSyncAt: Date | string | null,
): 'CURRENT' | 'STALE' | 'SEVERELY_STALE' {
  if (!lastSyncAt) return 'SEVERELY_STALE';
  const ageMs = Date.now() - new Date(lastSyncAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours >= MACHINE_HEALTH_THRESHOLDS.SEVERELY_STALE_HOURS) return 'SEVERELY_STALE';
  if (ageMs > MACHINE_HEALTH_THRESHOLDS.STALE_MINUTES * 60 * 1000) return 'STALE';
  return 'CURRENT';
}

/**
 * Classify quality score into health band
 */
export function classifyQualityHealth(score: number): 'HEALTHY' | 'DEGRADED' | 'CRITICAL' {
  if (score >= MACHINE_HEALTH_THRESHOLDS.QUALITY_HEALTHY) return 'HEALTHY';
  if (score >= MACHINE_HEALTH_THRESHOLDS.QUALITY_DEGRADED) return 'DEGRADED';
  return 'CRITICAL';
}

/** Get all machine configs */
export function getAllMachines(): Array<{ code: string; } & MachineConfig> {
  return Object.entries(machineServers).map(([code, cfg]) => ({ code, ...cfg }));
}

/** Get only accessible machines */
export function getAccessibleMachines(): Array<{ code: string; } & MachineConfig> {
  return getAllMachines().filter(m => m.accessible === true);
}

/** Get machine config by division/location code */
export function getMachineByDivision(division: string) {
  return machineServers[division] || null;
}

/** Get division dari machine ID (berdasarkan scanner suffix) */
export function getDivisionFromMachineId(machineId: number | string): string | null {
  const id = String(machineId);
  const suffix = parseInt(id.slice(-3));
  for (const [div, code] of Object.entries(scannerCodeMap)) {
    if (code === suffix) return div;
  }
  return null;
}

/** Konversi Machine ID ke Employee Code */
export function convertMachineIdToEmpCode(machineId: number | string, division?: string): string {
  const id = String(machineId);
  if (/^[A-Z]\d+$/.test(id)) return id;
  const div = division || getDivisionFromMachineId(id) || "P1A";
  const empPrefix = locCodeMap[div] || "X";
  const numPart = id.slice(-4).replace(/^0+/, "") || "0";
  return `${empPrefix}${numPart.padStart(4, "0")}`;
}
