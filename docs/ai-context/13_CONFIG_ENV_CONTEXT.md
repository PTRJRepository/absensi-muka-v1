---
tags: [ai-context, configuration]
created: 2026-06-07
---

# Configuration & Environment Context

## Configuration Files

### 1. config.ts (Primary Configuration)

**Location:** `_dev_utils/src/config.ts`

**Purpose:** Central configuration for all system settings.

```typescript
export const config = {
  // SQL Gateway Configuration
  sqlGateway: {
    baseUrl: "http://10.0.0.110:8001/v1/query",
    apiKey: "REDACTED", // Actual key stored
    server: "SERVER_PROFILE_1",
    database: "extend_db_ptrj",
  },

  // Absensi API Configuration
  absensiApi: {
    baseUrl: "http://10.0.0.110:5176",
    apiKey: "REDACTED", // Same key
  },

  // Sync Configuration
  sync: {
    intervalMinutes: 15,  // Sync every 15 minutes
    batchSize: 100,       // Records per batch
    modes: ["hk", "ot"], // Work day and overtime modes
  },

  // Divisions to sync
  divisions: [
    "PG1A", "PG1B", "PG2A", "PG2B", "DME", "ARA", "ARB1", "ARB2",
    "INFRA", "AREC", "IJL", "STF-OFFICE", "SECURITY"
  ],
};
```

---

### 2. machine-config.ts (Machine Configuration)

**Location:** `_dev_utils/src/machine-config.ts`

**Purpose:** Configuration for 15 attendance machines.

```typescript
export const machineServers: Record<string, {
  ip: string;
  port: number;
  ipLocal?: string;
  scannerCode?: number | null;
  locCode?: string | null;
  suffix: string;
  type: string;
}> = {
  "PGE":    { ip: "10.0.0.232",     port: 4370, ... },
  "MILL":   { ip: "103.127.66.32",  port: 4370, ... },
  "DME_01": { ip: "103.144.228.42", port: 4700, ... },
  // ... 15 machines total
};

// Scanner code to division mapping
export const scannerCodeMap: Record<string, number> = {
  "P1A": 100, "ARC": 200, "P1B": 300, "AB2": 400,
  "P2A": 500, "P2B": 600, "DME": 700, "ARA": 800, "AB1": 900,
};

// Location code to employee code prefix
export const locCodeMap: Record<string, string> = {
  "P1A": "A", "P1B": "B", "P2A": "C", "P2B": "D",
  "DME": "E", "ARA": "F", "AB1": "G", "AB2": "H",
  "ARC": "J", "IJL": "L", "PGE": "A",
};
```

---

### 3. .env (Environment Variables)

**Location:** `.env`

**Purpose:** Environment-specific configuration.

```
# Currently empty or minimal
# Consider adding:
# SQL_GATEWAY_URL=http://10.0.0.110:8001/v1/query
# ABSENSI_API_URL=http://10.0.0.110:5176
# API_KEY=REDACTED
```

---

### 4. tsconfig.json (TypeScript Configuration)

**Location:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "_dev_utils/src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

### 5. package.json (Project Dependencies)

**Location:** `package.json`

```json
{
  "name": "absensi-muka",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "sync": "bun run src/sync.ts",
    "sync:schedule": "bun run src/scheduler.ts"
  },
  "dependencies": {
    "mssql": "^12.5.5",
    "node-zklib": "1.3.0"
  }
}
```

---

## Database Configuration (absen_config table)

```sql
-- Default configurations stored in database
INSERT INTO absen_config (config_key, config_value, description) VALUES
 ('sync_interval_minutes', '15', 'Interval sync dalam menit'),
    ('last_sync', NULL, 'Timestamp sync terakhir'),
    ('sync_enabled', 'true', 'Aktifkan auto sync'),
    ('api_base_url', 'http://10.0.0.110:5176', 'URL API Absensi');
```

---

## Configuration by Environment

### Development
- Local machine testing
- Direct machine connections
- Debug logging enabled

### Production
- Scheduled sync every 15 minutes
- Error logging to sync_log
- API key secured

---

## Configuration Loading

```typescript
// All modules import from config.ts
import { config } from "./config.ts";

// Usage
const baseUrl = config.sqlGateway.baseUrl;
const divisions = config.divisions;
const interval = config.sync.intervalMinutes;
```

---

## Secrets Management

**Current State:**
- API keys stored in `config.ts`
- Not in .env or gitignore
- Visible in source code

**Recommendations:**
1. Move secrets to `.env` file
2. Add `.env` to `.gitignore`
3. Use environment variables in production
4. Consider secrets manager for production

---

## Related Files

- `_dev_utils/src/config.ts` - Main configuration
- `_dev_utils/src/machine-config.ts` - Machine settings
- `.env` - Environment variables
- `tsconfig.json` - TypeScript config
- `package.json` - Dependencies
