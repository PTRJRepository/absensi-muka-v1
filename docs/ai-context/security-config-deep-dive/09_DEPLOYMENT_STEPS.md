# Deployment Steps Documentation

> **Classification:** Internal Use Only  
> **Version:** 1.0.0  
> **Last Updated:** 2026-06-07

---

## Overview

This document describes how to deploy and run the Absensi PT Rebinmas Jaya system in various environments.

---

## Deployment Modes

### Mode 1: Manual Sync (On-Demand)

Suitable for:
- Initial data import
- One-time sync operations
- Testing and debugging

### Mode 2: Scheduled Sync (Automated)

Suitable for:
- Production environments
- Regular daily sync
- Continuous data updates

### Mode 3: Service Mode (Daemon)

Suitable for:
- Production servers
- Long-running operations
- Automatic restarts

---

## Pre-Deployment Checklist

### Infrastructure

- [ ] Server with Node.js v22+ installed
- [ ] Network access to SQL Gateway (10.0.0.110:8001)
- [ ] Network access to IT Solution API (10.0.0.110:5176)
- [ ] Network access to ZKTeco machines
- [ ] Sufficient disk space for logs

### Configuration

- [ ] API keys configured
- [ ] Database tables created
- [ ] Environment variables set
- [ ] Firewall rules configured

### Testing

- [ ] Connectivity tests passed
- [ ] Database schema verified
- [ ] Sync operations tested

---

## Deployment Procedures

### Step 1: Build Application

```bash
# Navigate to project
cd "D:\Gawean Rebinmas\Absensi_Muka\_dev_utils"

# Install dependencies (if not done)
bun install
# or
npm install

# Build TypeScript
bun run build
# or
npm run build
```

### Step 2: Verify Build Output

```bash
# Check compiled files
ls -la dist/

# Verify main entry point exists
ls -la dist/index.js
```

### Step 3: Configure Environment

```bash
# Create production environment file
cat > .env.production << 'EOF'
SQL_GATEWAY_URL=http://10.0.0.110:8001/v1/query
SQL_GATEWAY_API_KEY=REDACTED
SQL_SERVER_PROFILE=SERVER_PROFILE_1
SQL_DATABASE=extend_db_ptrj
ABSENSI_API_URL=http://10.0.0.110:5176
ABSENSI_API_KEY=REDACTED
SYNC_INTERVAL_MINUTES=15
EOF
```

### Step 4: Initialize Database

```bash
# Initialize database tables
bun run dist/database-init.js
# or
node dist/database-init.js

# Expected output:
# Creating tables in extend_db_ptrj...
#   ✓ Table absen_import created
#   ✓ Table absen_machine_input created
#   ✓ Table absen_change_log created
#   ✓ Table absen_import_batch created
#   ✓ Table absen_config created
#   ✓ Table absen_sync_log created
# All tables created successfully!
```

### Step 5: Initial Data Sync

```bash
# Run initial sync for all divisions
bun run dist/sync.js

# Or sync specific division
bun run dist/sync.js --division PG1A

# With specific date range
bun run dist/sync.js --division PG1A --year 2026 --month 6
```

---

## Running Modes

### Mode 1: One-Time Sync

```bash
# Single sync operation
cd _dev_utils
bun run src/sync.ts --division PG1A --year 2026 --month 6

# Output:
# ==================================================
# 🚀 Starting Absensi Sync
# ==================================================
# 📥 Syncing: PG1A - 6/2026 (mode: hk)
#   ✅ Synced 150 records in 2340ms
# ✅ Sync completed! Total: 150 records in 2340ms
```

### Mode 2: Continuous Scheduler

```bash
# Start scheduler (runs every 15 minutes)
cd _dev_utils
bun run src/scheduler.ts

# Output:
# ╔══════════════════════════════════════════════════════════════╗
# ║     Monitoring Absensi - Auto Sync Scheduler                ║
# ╠══════════════════════════════════════════════════════════════╣
# ║  Interval: every 15 minutes                                ║
# ║  Divisions: PG1A, PG1B, PG2A...                             ║
# ║  Modes: hk, ot                                             ║
# ╚══════════════════════════════════════════════════════════════╝
# ⏰ Scheduler started. Next sync in 15 minutes...
```

### Mode 3: Windows Service (Production)

```powershell
# Create Windows Service using NSSM
# Download nssm.exe and place in PATH

# Install service
nssm install AbsensiSync "C:\Program Files\nodejs\node.exe"
    -AppParameters "D:\Gawean Rebinmas\Absensi_Muka\_dev_utils\dist\scheduler.js"
    -AppDirectory "D:\Gawean Rebinmas\Absensi_Muka\_dev_utils"
    -DisplayName "Absensi Sync Service"
    -Description "PT Rebinmas Jaya Attendance Sync Service"

# Configure startup
nssm set AbsensiSync Start SERVICE_AUTO_START

# Start service
nssm start AbsensiSync
```

### Mode 4: Linux Systemd Service

```ini
# /etc/systemd/system/absensi-sync.service
[Unit]
Description=PT Rebinmas Jaya Attendance Sync Service
After=network.target

[Service]
Type=simple
User=absensi
WorkingDirectory=/opt/absensi/_dev_utils
ExecStart=/usr/bin/bun run src/scheduler.ts
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Install and enable service
sudo systemctl enable absensi-sync
sudo systemctl start absensi-sync
sudo systemctl status absensi-sync
```

---

## Docker Deployment

### Build Image

```bash
# Build Docker image
docker build -t absensi-sync:latest .

# Tag for registry
docker tag absensi-sync:latest registry.example.com/absensi-sync:v1.0.0
```

### Run Container

```bash
# Run with environment variables
docker run -d \
  --name absensi-sync \
  -e SQL_GATEWAY_API_KEY=REDACTED \
  -e ABSENSI_API_KEY=REDACTED \
  -e SYNC_INTERVAL_MINUTES=15 \
  -v /var/log/absensi:/app/logs \
  absensi-sync:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  absensi-sync:
    image: absensi-sync:latest
    container_name: absensi-sync
    environment:
      - NODE_ENV=production
      - SQL_GATEWAY_URL=http://10.0.0.110:8001/v1/query
      - SQL_GATEWAY_API_KEY=REDACTED
      - SQL_SERVER_PROFILE=SERVER_PROFILE_1
      - SQL_DATABASE=extend_db_ptrj
      - ABSENSI_API_URL=http://10.0.0.110:5176
      - ABSENSI_API_KEY=REDACTED
      - SYNC_INTERVAL_MINUTES=15
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    networks:
      - absensi-network

networks:
  absensi-network:
    driver: bridge
```

---

## Post-Deployment Verification

### 1. Check Service Status

```bash
# Check if sync is running
ps aux | grep absensi
# or
tasklist | findstr node

# Check logs
tail -f logs/sync.log
```

### 2. Verify Data Sync

```sql
-- Check latest sync
SELECT TOP 10 * FROM absen_sync_log
ORDER BY sync_date DESC;

-- Check record counts by division
SELECT division, COUNT(*) as record_count
FROM absen_import
GROUP BY division;
```

### 3. Test Connectivity

```bash
# Manual sync test
curl -X POST http://localhost:3000/sync \
  -H "Content-Type: application/json" \
  -d '{"division":"PG1A","year":2026,"month":6}'

# Expected response:
# {"success":true,"recordsSynced":150,"duration":2340}
```

---

## Rollback Procedures

### If Issues Occur

1. **Stop the service**
   ```bash
   # Stop scheduler
   pkill -f "scheduler.ts"
   # or
   nssm stop AbsensiSync
   # or
   docker stop absensi-sync
   ```

2. **Check last known good state**
   ```sql
   SELECT TOP 10 * FROM absen_sync_log
   WHERE status = 'SUCCESS'
   ORDER BY sync_date DESC;
   ```

3. **Restore from backup if needed**
   ```bash
   # Restore database from backup
   # (contact DBA for restore procedure)
   ```

4. **Restart service**
   ```bash
   # Restart scheduler
   bun run src/scheduler.ts
   ```

---

## Monitoring Deployment

### Health Check Endpoint

```typescript
// Add to your application
app.get("/health", async (req, res) => {
  try {
    // Check database connection
    await sqlClient.query("SELECT 1");

    // Check last sync time
    const lastSync = await sqlClient.query(`
      SELECT TOP 1 sync_date, status
      FROM absen_sync_log
      ORDER BY sync_date DESC
    `);

    res.json({
      status: "healthy",
      lastSync: lastSync?.recordset?.[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});
```

---

## Security Hardening

### Production Checklist

- [ ] Use environment variables for secrets
- [ ] Enable HTTPS for external endpoints
- [ ] Restrict file permissions on config files
- [ ] Enable audit logging
- [ ] Configure log rotation
- [ ] Set up monitoring alerts
- [ ] Implement rate limiting

### Log Rotation

```bash
# Linux: /etc/logrotate.d/absensi
/var/log/absensi/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 absensi absensi
}
```

---

## Related Documentation

- [08_ENVIRONMENT_SETUP.md](./08_ENVIRONMENT_SETUP.md) - Environment setup
- [10_MONITORING_OBSERVABILITY.md](./10_MONITORING_OBSERVABILITY.md) - Monitoring setup
- [01_SECRETS_MANAGEMENT.md](./01_SECRETS_MANAGEMENT.md) - Secrets handling
- [04_SQL_GATEWAY_SECURITY.md](./04_SQL_GATEWAY_SECURITY.md) - Gateway security