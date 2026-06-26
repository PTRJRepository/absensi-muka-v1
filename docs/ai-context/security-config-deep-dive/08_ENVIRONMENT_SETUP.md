# Environment Setup Documentation

> **Classification:** Internal Use Only  
> **Version:** 1.0.0  
> **Last Updated:** 2026-06-07

---

## Overview

This document describes how to set up the development and production environment for the Absensi PT Rebinmas Jaya system.

---

## Prerequisites

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|----------|-------------|
| Node.js | v22.0.0 | v22.14.0 |
| npm/yarn/bun | Latest | Latest |
| OS | Windows 10+ / Linux / macOS | Windows 11 Pro |
| RAM | 4 GB | 8 GB |
| Disk Space | 500 MB | 1 GB |

### Network Requirements

| Requirement | Description |
|-------------|-------------|
| SQL Gateway | Access to `http://10.0.0.110:8001` |
| IT Solution API | Access to `http://10.0.0.110:5176` |
| ZKTeco Machines | Access to various IPs (see network topology) |

---

## Installation Steps

### 1. Clone or Copy Project

```bash
# If using git
git clone <repository-url> "D:\Gawean Rebinmas\Absensi_Muka"

# Navigate to project
cd "D:\Gawean Rebinmas\Absensi_Muka"
```

### 2. Install Dependencies

```bash
# Using npm
cd _dev_utils
npm install

# Using bun (recommended for faster install)
cd _dev_utils
bun install
```

### 3. Verify Node.js Version

```bash
node --version
# Should output v22.x.x
```

---

## Configuration Setup

### 1. Create Environment File

Create a `.env` file in the `_dev_utils` directory:

```bash
# _dev_utils/.env (create this file)
# DO NOT commit this file to version control

# SQL Gateway Configuration
SQL_GATEWAY_URL=http://10.0.0.110:8001/v1/query
SQL_GATEWAY_API_KEY=REDACTED
SQL_SERVER_PROFILE=SERVER_PROFILE_1
SQL_DATABASE=extend_db_ptrj

# IT Solution API Configuration
ABSENSI_API_URL=http://10.0.0.110:5176
ABSENSI_API_KEY=REDACTED

# Sync Configuration
SYNC_INTERVAL_MINUTES=15
SYNC_BATCH_SIZE=100

# ZKTeco Configuration
ZKTECO_PASSWORD=12345
```

### 2. Update config.ts (Alternative)

If not using environment variables, update `_dev_utils/src/config.ts`:

```typescript
// _dev_utils/src/config.ts
export const config = {
  sqlGateway: {
    baseUrl: "http://10.0.0.110:8001/v1/query",
    apiKey: "REDACTED",  // [REDACTED]
    server: "SERVER_PROFILE_1",
    database: "extend_db_ptrj",
  },
  absensiApi: {
    baseUrl: "http://10.0.0.110:5176",
    apiKey: "REDACTED",  // [REDACTED]
  },
  sync: {
    intervalMinutes: 15,
    batchSize: 100,
    modes: ["hk", "ot"],
  },
  divisions: [
    "PG1A", "PG1B", "PG2A", "PG2B", "DME", "ARA", "ARB1", "ARB2",
    "INFRA", "AREC", "IJL", "STF-OFFICE", "SECURITY"
  ],
};
```

---

## Database Setup

### 1. Verify SQL Gateway Connection

```bash
# Test SQL Gateway connectivity
curl -X POST http://10.0.0.110:8001/v1/query \
  -H "Content-Type: application/json" \
  -H "x-api-key: REDACTED" \
  -d '{"sql":"SELECT 1 as test","server":"SERVER_PROFILE_1","db":"master"}'
```

Expected response:
```json
{"success":true,"data":{"recordset":[{"test":1}]}}
```

### 2. Create Database Tables

```bash
# Using bun
cd _dev_utils
bun run src/database-init.ts

# Or run the service directly
bun run src/sync.ts --init
```

### 3. Verify Tables Created

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'dbo' AND table_name LIKE 'absen_%';
```

Expected tables:
- absen_import
- absen_machine_input
- absen_change_log
- absen_import_batch
- absen_config
- absen_sync_log

---

## Network Connectivity

### 1. Test Internal Network

```bash
# Test SQL Gateway
ping 10.0.0.110

# Test IT Solution API
curl -I http://10.0.0.110:5176/api/divisions
```

### 2. Test External Networks

```bash
# Test MILL machine
ping103.127.66.32

# Test DME machine
ping 103.144.228.42

# Test ARE/ARA machines
ping 103.144.208.154
```

### 3. Test ZKTeco Ports

```bash
# Using netcat (Linux) or PowerShell (Windows)
# Test port connectivity
nc -zv 10.0.0.232 4370  # PGE
nc -zv 103.144.228.42 4700  # DME_01
```

---

## Running the Application

### Development Mode

```bash
# Using ts-node
cd _dev_utils
npm run dev

# Or using bun
cd _dev_utils
bun run src/index.ts
```

### Production Build

```bash
# Build TypeScript
cd _dev_utils
npm run build

# Run compiled JavaScript
npm start
```

### Manual Sync

```bash
# Sync all divisions
bun run src/sync.ts

# Sync specific division
bun run src/sync.ts --division PG1A

# Sync with specific month/year
bun run src/sync.ts --division PG1A --year 2026 --month 6
```

### Auto Sync Scheduler

```bash
# Start scheduler (runs every 15 minutes)
bun run src/scheduler.ts
```

---

## Testing

### 1. Run Connection Tests

```bash
# Test SQL Gateway
bun run src/test.ts --test sql

# Test IT Solution API
bun run src/test.ts --test api

# Test all connections
bun run src/test.ts --test all
```

### 2. Run Unit Tests (if available)

```bash
cd _dev_utils
npm test
# or
bun test
```

---

## Troubleshooting Setup Issues

### Issue: npm install fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue: Cannot connect to SQL Gateway

**Solution:**
1. Verify network connectivity to 10.0.0.110
2. Check firewall rules
3. Verify API key is correct
4. Check SQL Gateway service is running

### Issue: Cannot connect to IT Solution API

**Solution:**
1. Verify network connectivity to 10.0.0.110:5176
2. Check API key matches configuration
3. Verify IT Solution service is running

### Issue: ZKTeco connection timeout

**Solution:**
1. Check machine IP and port are correct
2. Verify machine is powered on
3. Check firewall allows TCP connections
4. Increase timeout value in code

---

## Security Setup

### 1. Set File Permissions

**Windows:**
```powershell
# Make config file read-only for non-admin users
icacls "D:\Gawean Rebinmas\Absensi_Muka\_dev_utils\src\config.ts" /inheritance:r /grant:r "%USERNAME%:(R,W)"
```

**Linux:**
```bash
# Make config file readable only by owner
chmod 600 _dev_utils/src/config.ts
```

### 2. Add to .gitignore

```bash
# .gitignore additions
_env
_dev_utils/.env
_dev_utils/src/config.ts # If storing sensitive data
```

### 3. Enable HTTPS (Production)

```typescript
// For production, use HTTPS endpoints
export const config = {
  sqlGateway: {
    baseUrl: "https://gateway.ptrj.local:8001/v1/query",
    // ...
  },
};
```

---

## Docker Setup (Optional)

### Dockerfile

```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  absensi-sync:
    build: .
    environment:
      - SQL_GATEWAY_URL=http://10.0.0.110:8001/v1/query
      - SQL_GATEWAY_API_KEY=${SQL_GATEWAY_API_KEY}
      - ABSENSI_API_URL=http://10.0.0.110:5176
      - ABSENSI_API_KEY=${ABSENSI_API_KEY}
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs
```

---

## Related Documentation

- [01_SECRETS_MANAGEMENT.md](./01_SECRETS_MANAGEMENT.md) - Secrets handling
- [02_NETWORK_TOPOLOGY.md](./02_NETWORK_TOPOLOGY.md) - Network configuration
- [09_DEPLOYMENT_STEPS.md](./09_DEPLOYMENT_STEPS.md) - Deployment guide
- [10_MONITORING_OBSERVABILITY.md](./10_MONITORING_OBSERVABILITY.md) - Monitoring setup