---
tags: [ai-context, deployment]
created: 2026-06-07
---

# Deployment Context

## Deployment Overview

The Sistem Absensi PT Rebinmas Jaya is a Node.js application that can run on any system with Node.js v22+ or Bun runtime.

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | v22.0.0 | v22.14.0 |
| RAM | 512MB | 1GB |
| Disk | 1GB | 2GB |
| Network | Internet access | Stable connection to10.0.0.110 |

### External Services

| Service | URL | Required |
|---------|-----|----------|
| IT Solution API | http://10.0.0.110:5176 | Yes |
| SQL Gateway | http://10.0.0.110:8001/v1/query | Yes |
| ZKTeco Machines | Various IPs | For direct sync |

---

## Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd Absensi_Muka
```

### 2. Install Dependencies

```bash
npm install
# or
bun install
```

### 3. Configure Environment

```bash
# Create .env file
cat > .env << 'EOF'
API_KEY=your-api-key-here
SQL_GATEWAY_URL=http://10.0.0.110:8001/v1/query
ABSENSI_API_URL=http://10.0.0.110:5176
EOF
```

### 4. Initialize Database

```bash
# Run database initialization
bun run _dev_utils/src/init-db.ts
# or
bun run _dev_utils/src/database.ts
```

---

## Running the Application

### Development Mode

```bash
# Run sync manually
npm run sync
# or
bun run _dev_utils/src/sync.ts

# Run with custom parameters
bun run _dev_utils/src/sync.ts --division PG1A --year 2026 --month 6
```

### Production Mode

```bash
# Start scheduler (runs continuously)
npm run sync:schedule
# or
bun run _dev_utils/src/scheduler.ts
```

### One-time Import

```bash
# Import from API
bun run _dev_utils/src/absensi-import.ts --division PG1A --year 2026 --month 6
```

---

## Deployment Scenarios

### Scenario 1: Single Server Deployment

**Setup:**
- One server running the sync scheduler
- Connects to IT Solution API and SQL Gateway
- Scheduled sync every 15 minutes

**Configuration:**
```typescript
// config.ts
export const config = {
  sync: {
    intervalMinutes: 15,
  },
  // ...
};
```

**Commands:**
```bash
# Start scheduler
npm run sync:schedule
```

---

### Scenario 2: Multiple Server Deployment

**Setup:**
- Multiple servers for redundancy
- Each runs scheduler independently
- Use database locking to prevent conflicts

**Configuration:**
```typescript
// Add server_id to prevent duplicate syncs
const serverId = process.env.SERVER_ID || 'server-1';
```

---

### Scenario 3: Cloud Deployment

**Setup:**
- Deploy to cloud VM or container
- Requires VPN for internal network access
- Auto-restart on failure

**Dockerfile:**
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["npm", "run", "sync:schedule"]
```

---

## Configuration Management

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEY` | SQL Gateway and API key | - |
| `SQL_GATEWAY_URL` | SQL Gateway URL | http://10.0.0.110:8001/v1/query |
| `ABSENSI_API_URL` | IT Solution API URL | http://10.0.0.110:5176 |
| `SERVER_ID` | Unique server identifier | server-1 |
| `LOG_LEVEL` | Logging level | info |

### Runtime Configuration

```bash
# Using environment variables
export API_KEY="your-key"
export LOG_LEVEL="debug"
bun run _dev_utils/src/sync.ts
```

---

## Monitoring

### Health Check

```bash
# Check if scheduler is running
ps aux | grep scheduler

# Check last sync
curl -X POST http://10.0.0.110:8001/v1/query \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{"sql":"SELECT TOP 1 * FROM absen_sync_log ORDER BY sync_date DESC","server":"SERVER_PROFILE_1","db":"extend_db_ptrj"}'
```

### Log Monitoring

```bash
# View recent logs
tail -f /var/log/absensi-sync.log

# Check error logs
grep ERROR /var/log/absensi-sync.log
```

---

## Backup& Recovery

### Database Backup

```bash
# Backup SQL Server database
sqlcmd -S SERVER_PROFILE_1 -d extend_db_ptrj -Q "BACKUP DATABASE extend_db_ptrj TO DISK='backup.bak'"
```

### Configuration Backup

```bash
# Backup configuration
cp _dev_utils/src/config.ts config.backup.ts
```

---

## Troubleshooting

### Service Won't Start

**Symptom:** Scheduler exits immediately

**Solution:**
1. Check network connectivity to SQL Gateway
2. Verify API key is correct
3. Check logs for errors

### Sync Not Running

**Symptom:** No new records in database

**Solution:**
1. Check sync_log table for errors
2. Verify IT Solution API is responding
3. Check network connectivity

### Duplicate Records

**Symptom:** Multiple records for same employee/day

**Solution:**
1. Check batch_id uniqueness
2. Use MERGE instead of INSERT
3. Clean up duplicates manually

---

## Related Files

- `_dev_utils/src/scheduler.ts` - Scheduler entry point
- `_dev_utils/src/sync.ts` - Sync logic
- `_dev_utils/src/config.ts` - Configuration
- `_dev_utils/src/database.ts` - Database initialization
- `package.json` - Scripts
