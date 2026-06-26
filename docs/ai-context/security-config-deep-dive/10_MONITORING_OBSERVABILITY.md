# Monitoring and Observability Documentation

> **Classification:** Internal Use Only  
> **Version:** 1.0.0  
> **Last Updated:** 2026-06-07

---

## Overview

This document describes how to monitor the Absensi sync process, track operations, and maintain system observability.

---

## Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MONITORING STACK                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Sync Logs      │  │  Database Logs  │  │  System Metrics │  │
│  │  (absen_sync_log)│  │ (absen_change_log)│ │   (CPU, Mem)   │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│ │ │ │              │
│ │ └──────────────┼──────────────┘              │
│ │ ▼              │                                │
│ │ ┌──────────────────────────────────────────────────┐ │       │
│ │ │         QUERY INTERFACES                    │ │       │
│ │ │  - SQL Gateway / SSMS                         │ │       │
│ │ │  - Dashboard (future)                         │ │       │
│ │ │  - Alerting System (future)                  │ │       │
│ │ └──────────────────────────────────────────────────┘ │       │
│ │                                                              │
│ └──────────────────────────────────────────────────────────────┘
```

---

## Log Tables

### absen_sync_log

Tracks all sync operations:

```sql
CREATE TABLE absen_sync_log (
  id INT IDENTITY(1,1) PRIMARY KEY,
  sync_date DATETIME DEFAULT GETDATE(),
  division NVARCHAR(50),
  year INT,
  month INT,
  mode NVARCHAR(10),
  records_synced INT DEFAULT 0,
  status NVARCHAR(50) DEFAULT 'SUCCESS',
  error_message NVARCHAR(MAX),
  duration_ms INT DEFAULT 0
);
```

### absen_import_batch

Tracks batch import operations:

```sql
CREATE TABLE absen_import_batch (
  id INT IDENTITY(1,1) PRIMARY KEY,
  batch_id NVARCHAR(100) UNIQUE NOT NULL,
  division NVARCHAR(50) NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  total_records INT DEFAULT 0,
  imported_records INT DEFAULT 0,
  status NVARCHAR(50) DEFAULT 'PENDING',
  import_started_at DATETIME DEFAULT GETDATE(),
  import_completed_at DATETIME,
  error_message NVARCHAR(MAX),
  imported_by NVARCHAR(100) DEFAULT 'SYSTEM'
);
```

### absen_change_log

Tracks all data modifications:

```sql
CREATE TABLE absen_change_log (
  id INT IDENTITY(1,1) PRIMARY KEY,
  emp_code NVARCHAR(50) NOT NULL,
  division NVARCHAR(50) NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  day INT NOT NULL,
  field_name NVARCHAR(50),
  old_value NVARCHAR(MAX),
  new_value NVARCHAR(MAX),
  change_type NVARCHAR(20) NOT NULL,
  source_table NVARCHAR(50),
  changed_by NVARCHAR(100),
  changed_at DATETIME DEFAULT GETDATE()
);
```

---

## Monitoring Queries

### 1. Sync Health Dashboard

```sql
-- Last 24 hours sync summary
SELECT
    COUNT(*) as total_syncs,
    SUM(records_synced) as total_records,
    SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
    AVG(duration_ms) as avg_duration_ms,
    MIN(sync_date) as first_sync,
    MAX(sync_date) as last_sync
FROM absen_sync_log
WHERE sync_date >= DATEADD(HOUR, -24, GETDATE());
```

### 2. Division Sync Status

```sql
-- Per-division sync status
SELECT
    division,
    COUNT(*) as sync_count,
    SUM(records_synced) as records_synced,
    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failures,
    MAX(sync_date) as last_sync
FROM absen_sync_log
WHERE sync_date >= DATEADD(DAY, -7, GETDATE())
GROUP BY division
ORDER BY division;
```

### 3. Failed Sync Details

```sql
-- Recent failed syncs
SELECT TOP 20
    sync_date,
    division,
    year,
    month,
    mode,
    error_message,
    duration_ms
FROM absen_sync_log
WHERE status = 'FAILED'
ORDER BY sync_date DESC;
```

### 4. Sync Latency Trend

```sql
-- Average sync duration by hour
SELECT
    DATEPART(HOUR, sync_date) as hour,
    AVG(duration_ms) as avg_duration,
    MAX(duration_ms) as max_duration,
    MIN(duration_ms) as min_duration,
    COUNT(*) as sync_count
FROM absen_sync_log
WHERE sync_date >= DATEADD(DAY, -7, GETDATE())
GROUP BY DATEPART(HOUR, sync_date)
ORDER BY hour;
```

### 5. Data Completeness Check

```sql
-- Check for missing data by division
SELECT
    division,
    year,
    month,
    COUNT(DISTINCT emp_code) as employee_count,
    COUNT(*) as record_count,
    MAX(day) as max_day
FROM absen_import
WHERE year = 2026 AND month = 6
GROUP BY division, year, month
ORDER BY division;
```

---

## Alert Configuration

### Alert Thresholds

| Alert Type | Threshold | Severity |
|------------|-----------|----------|
| Sync Failure | 1 consecutive | Critical |
| High Latency | > 60 seconds | Warning |
| No Sync | > 30 minutes | Critical |
| Low Records | < 50% expected | Warning |
| High Error Rate | > 10% errors | Critical |

### Alert Query Examples

```sql
-- Alert: No successful sync in last 30 minutes
SELECT TOP 1 sync_date, status
FROM absen_sync_log
WHERE status = 'SUCCESS'
ORDER BY sync_date DESC;

-- If result is NULL or > 30 minutes ago → ALERT

-- Alert: High failure rate
SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failures,
    CAST(SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 as failure_rate
FROM absen_sync_log
WHERE sync_date >= DATEADD(HOUR, -1, GETDATE());

-- If failure_rate > 10 → ALERT
```

---

## Health Check Implementation

### HTTP Health Endpoint

```typescript
// health-check.ts
import { sqlClient } from "./sql-client.ts";
import { config } from "./config.ts";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  components: {
    sqlGateway: ComponentHealth;
    absensiApi: ComponentHealth;
    database: ComponentHealth;
  };
  lastSync: LastSyncInfo | null;
  uptime: {
    lastRestart: string;
    hoursRunning: number;
  };
}

interface ComponentHealth {
  status: "up" | "down" | "unknown";
  latencyMs?: number;
  error?: string;
}

interface LastSyncInfo {
  division: string;
  syncDate: string;
  status: string;
  recordsSynced: number;
}

async function checkHealth(): Promise<HealthStatus> {
  const components: HealthStatus["components"] = {
    sqlGateway: { status: "unknown" },
    absensiApi: { status: "unknown" },
    database: { status: "unknown" },
  };

  let lastSync: LastSyncInfo | null = null;

  // Check SQL Gateway
  const startSql = Date.now();
  try {
    const response = await fetch(config.sqlGateway.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.sqlGateway.apiKey,
      },
      body: JSON.stringify({
        sql: "SELECT 1",
        server: config.sqlGateway.server,
        db: config.sqlGateway.database,
      }),
    });

    components.sqlGateway = {
      status: response.ok ? "up" : "down",
      latencyMs: Date.now() - startSql,
    };
  } catch (e: any) {
    components.sqlGateway = {
      status: "down",
      error: e.message,
    };
  }

  // Check IT Solution API
  const startApi = Date.now();
  try {
    const response = await fetch(`${config.absensiApi.baseUrl}/api/divisions`, {
      headers: { "x-api-key": config.absensiApi.apiKey },
    });

    components.absensiApi = {
      status: response.ok ? "up" : "down",
      latencyMs: Date.now() - startApi,
    };
  } catch (e: any) {
    components.absensiApi = {
      status: "down",
      error: e.message,
    };
  }

  // Check database tables
  try {
    const tables = await sqlClient.getTables();
    const requiredTables = [
      "absen_import", "absen_machine_input", "absen_change_log",
      "absen_sync_log", "absen_import_batch"
    ];

    const missingTables = requiredTables.filter(t => !tables.includes(t));

    components.database = {
      status: missingTables.length === 0 ? "up" : "degraded",
      error: missingTables.length > 0 ? `Missing tables: ${missingTables.join(", ")}` : undefined,
    };
  } catch (e: any) {
    components.database = {
      status: "down",
      error: e.message,
    };
  }

  // Get last sync info
  try {
    const lastSyncResult = await sqlClient.query(`
      SELECT TOP 1 division, sync_date, status, records_synced
      FROM absen_sync_log
      WHERE status = 'SUCCESS'
      ORDER BY sync_date DESC
    `);

    if (lastSyncResult?.recordset?.[0]) {
      const sync = lastSyncResult.recordset[0];
      lastSync = {
        division: sync.division,
        syncDate: sync.sync_date,
        status: sync.status,
        recordsSynced: sync.records_synced,
      };
    }
  } catch (e) {
    // Ignore
  }

  // Determine overall status
  const componentStatuses = Object.values(components).map(c => c.status);
  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

  if (componentStatuses.includes("down")) {
    overallStatus = "unhealthy";
  } else if (componentStatuses.includes("degraded")) {
    overallStatus = "degraded";
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    components,
    lastSync,
    uptime: {
      lastRestart: process.env.LAST_RESTART || new Date().toISOString(),
      hoursRunning: process.uptime() / 3600,
    },
  };
}

// Export for use
export { checkHealth };
```

### Prometheus Metrics

```typescript
// metrics.ts
import { Registry, Counter, Gauge, Histogram } from "prom-client";

// Create registry
const register = new Registry();

// Define metrics
const syncOperationsTotal = new Counter({
  name: "absensi_sync_operations_total",
  help: "Total number of sync operations",
  labelNames: ["division", "status"],
  registers: [register],
});

const recordsSyncedTotal = new Counter({
  name: "absensi_records_synced_total",
  help: "Total number of records synced",
  labelNames: ["division", "source"],
  registers: [register],
});

const syncDuration = new Histogram({
  name: "absensi_sync_duration_seconds",
  help: "Duration of sync operations in seconds",
  labelNames: ["division"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

const lastSyncTimestamp = new Gauge({
  name: "absensi_last_sync_timestamp",
  help: "Timestamp of last successful sync",
  labelNames: ["division"],
  registers: [register],
});

// Export metrics
export { register, syncOperationsTotal, recordsSyncedTotal, syncDuration, lastSyncTimestamp };
```

---

## Log Aggregation

### Structured Logging

```typescript
// logger.ts
interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  service: string;
  message: string;
  metadata?: Record<string, any>;
}

function log(level: LogEntry["level"], message: string, metadata?: Record<string, any>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: "absensi-sync",
    message,
    metadata,
  };

  // Output to console (for container logs)
  console.log(JSON.stringify(entry));

  // Send to log aggregation service
  sendToLogAggregator(entry);
}

// Usage
log("INFO", "Starting sync", { division: "PG1A", year: 2026, month: 6 });
log("WARN", "High latency detected", { division: "MILL", durationMs: 15000 });
log("ERROR", "Sync failed", { division: "DME", error: "Connection timeout" });
```

---

## Dashboard Visualization

### Recommended Metrics

| Metric | Visualization | Refresh |
|--------|---------------|---------|
| Sync Success Rate | Gauge (%) | 1 minute |
| Records Synced | Counter graph | 5 minutes |
| Sync Duration | Line chart | 1 minute |
| Last Sync Time | Single stat | 1 minute |
| Error Rate | Bar chart | 5 minutes |

### Grafana Dashboard JSON

```json
{
  "dashboard": {
    "title": "Absensi Sync Monitor",
    "panels": [
      {
        "title": "Sync Success Rate",
        "type": "gauge",
        "targets": [
          {
            "expr": "sum(absensi_sync_operations_total{status='SUCCESS'}) / sum(absensi_sync_operations_total) * 100"
          }
        ]
      },
      {
        "title": "Records Synced (Last Hour)",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(absensi_records_synced_total[5m])) by (division)"
          }
        ]
      },
      {
        "title": "Sync Duration",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(absensi_sync_duration_seconds_bucket[5m])) by (le, division))"
          }
        ]
      }
    ]
  }
}
```

---

## Incident Response

### Runbook: Sync Failure

1. **Check SQL Gateway connectivity**
   ```bash
   curl -X POST http://10.0.0.110:8001/v1/query \
     -H "x-api-key: REDACTED" \
     -d '{"sql":"SELECT 1"}'
   ```

2. **Check IT Solution API**
   ```bash
   curl http://10.0.0.110:5176/api/divisions \
     -H "x-api-key: REDACTED"
   ```

3. **Check database tables**
   ```sql
   SELECT COUNT(*) FROM absen_import;
   ```

4. **Review error logs**
   ```sql
   SELECT TOP 10 * FROM absen_sync_log
   WHERE status = 'FAILED'
   ORDER BY sync_date DESC;
   ```

5. **Manual retry if needed**
   ```bash
   bun run src/sync.ts --division <failed_division>
   ```

---

## Related Documentation

- [05_CHANGE_AUDIT.md](./05_CHANGE_AUDIT.md) - Audit logging
- [07_CONFIGURATION_REFERENCE.md](./07_CONFIGURATION_REFERENCE.md) - Full config reference
- [09_DEPLOYMENT_STEPS.md](./09_DEPLOYMENT_STEPS.md) - Deployment procedures