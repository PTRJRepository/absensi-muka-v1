/**
 * Application Configuration
 * 
 * Loads configuration from _dev_utils/src/config.ts
 * DO NOT hardcode API keys or sensitive data here
 */

import { SqlClient } from '../database/sql-client';

export interface AppConfig {
  sqlGateway: {
    url: string;
    apiKey: string;
    server: string;
    database: string;
  };
  sync: {
    intervalMinutes: number;
    machineTimeoutMs: number;
    defaultSourcePriority: string[];
  };
  detection: {
    autoDetectEmployeeMovement: boolean;
    crossDivisionThresholdDays: number;
  };
}

/**
 * Load configuration from environment or config file
 */
export function loadConfig(): AppConfig {
  // Import from existing config
  // In production, use environment variables
  const config: AppConfig = {
    sqlGateway: {
      url: process.env.SQL_GATEWAY_URL || 'http://10.0.0.110:8001/v1/query',
      apiKey: process.env.SQL_GATEWAY_API_KEY || '',
      server: process.env.SQL_SERVER || 'SERVER_PROFILE_1',
      database: process.env.SQL_DATABASE || 'extend_db_ptrj',
    },
    sync: {
      intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '15'),
      machineTimeoutMs: parseInt(process.env.MACHINE_TIMEOUT_MS || '30000'),
      defaultSourcePriority: (process.env.DEFAULT_SOURCE_PRIORITY || 'MACHINE,MANUAL').split(','),
    },
    detection: {
      autoDetectEmployeeMovement: process.env.AUTO_DETECT_EMPLOYEE_MOVEMENT === 'true',
      crossDivisionThresholdDays: parseInt(process.env.CROSS_DIVISION_THRESHOLD_DAYS || '3'),
    },
  };

  return config;
}

/**
 * Create SQL Client instance from config
 */
export function createSqlClient(config: AppConfig): SqlClient {
  return new SqlClient(
    config.sqlGateway.url,
    config.sqlGateway.apiKey,
    config.sqlGateway.server,
    config.sqlGateway.database
  );
}

/**
 * Load app_config from database
 */
export async function loadAppConfigFromDb(sqlClient: SqlClient): Promise<Record<string, string>> {
  const rows = await sqlClient.select<{ config_key: string; config_value: string }>(
    'app_config',
    'config_key, config_value'
  );

  const configMap: Record<string, string> = {};
  for (const row of rows) {
    configMap[row.config_key] = row.config_value;
  }

  return configMap;
}
