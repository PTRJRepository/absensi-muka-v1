# TROUBLESHOOTING - Panduan Pemecahan Masalah

## Quick Diagnostics

### Check System Health

```bash
# 1. Check database connection
npm run db:check

# 2. Check machine connectivity
curl http://localhost:3000/api/machines

# 3. Check recent sync batches
curl http://localhost:3000/api/monitoring/batches?limit=10

# 4. Check quality metrics
curl http://localhost:3000/api/quality/summary
```

---

## Common Issues

### Issue: Machine Won't Sync

**Symptoms:**
- Machine shows "offline" status
- Sync times out

**Diagnosis:**
```bash
# Test machine connectivity
curl -X POST http://localhost:3000/api/machines/P1A/test-connection
```

**Solutions:**

1. **Check network connectivity:**
   ```bash
   ping <machine-ip>
   telnet <machine-ip> 4370
   ```

2. **Check machine credentials:**
   ```typescript
   // Verify ZKTECO_PASSWORD in .env
   ZKTECO_PASSWORD=12345
   ```

3. **Check machine status:**
   - Machine may be in "busy" state
   - Power cycle the machine
   - Wait 30 seconds and retry

---

### Issue: Attendance Not Showing

**Symptoms:**
- Employee scanned but attendance not recorded
- Dashboard shows "0" scans

**Diagnosis:**
```bash
# Check raw scan logs
curl "http://localhost:3000/api/monitoring/machine/P1A/raw-data?limit=10"

# Check employee mapping
curl "http://localhost:3000/api/quality/unmapped"
```

**Solutions:**

1. **Employee not mapped:**
   - Employee's device_uid not in `zkteco_hr_employee_map`
   - Map manually via Machine Detail Modal

2. **Mapping algorithm failed:**
   - Device ID format may be unusual
   - Check `employee_mapping.service.ts` logs

3. **Sync not running:**
   - Check scheduler status: `/api/scheduler/status`
   - Restart scheduler if needed

---

### Issue: "Cannot read property of undefined" in Modal

**Symptoms:**
- AttendancePage modal crashes
- Error in browser console

**Cause:** Missing icon imports  
**Fix:** Add to `AttendancePage.tsx`:
```typescript
import { LogIn, LogOut, Activity, Fingerprint, X } from 'lucide-react';
```

---

### Issue: Dashboard Shows Wrong Numbers

**Symptoms:**
- Quality score shows "85" regardless of actual data
- Online/offline machine counts are equal

**Cause:** Hardcoded values in `dashboard.routes.ts`  
**Fix:** See [BUGS-FIXES.md](BUGS-FIXES.md) Issue #10

---

### Issue: SSE Live Feed Stops Working

**Symptoms:**
- Realtime page stops updating
- "Connection closed" message

**Diagnosis:**
```bash
# Check SSE endpoint
curl -N http://localhost:3000/api/realtime/live-feed
```

**Solutions:**

1. **Browser SSE timeout:**
   - Refresh the page
   - Frontend should fall back to polling

2. **Server SSE not working:**
   - Check server logs for errors
   - Restart backend server

---

### Issue: Alerts Not Receiving

**Symptoms:**
- Created alert rule but no notifications
- Dashboard shows alert but no email/SMS

**Cause:** Alert notifications are NOT implemented  
**Fix:** See [BUGS-FIXES.md](BUGS-FIXES.md) Issue #1

**Workaround:**
- Use dashboard alerts (working)
- Monitor `/api/alerts/active` endpoint

---

### Issue: Unmapped Users High Count

**Symptoms:**
- Quality page shows high unmapped count
- Many employees appear unmapped

**Diagnosis:**
```bash
# Get unmapped details
curl "http://localhost:3000/api/quality/unmapped"

# Check machine-employee mapping
curl "http://localhost:3000/api/monitoring/machine/P1A/employees"
```

**Solutions:**

1. **New employees not in system:**
   - Add to `employees` table first
   - Then map via Machine Detail Modal

2. **Device ID format changed:**
   - Check scanner code configuration
   - Verify `machine.scanner_code` matches actual

3. **Office machines (PGE/IJL):**
   - These require manual mapping (by design)
   - Always show as "NEED_REVIEW"

---

### Issue: Import Job Stuck in "RUNNING"

**Symptoms:**
- Batch shows "RUNNING" status for hours
- No new data imported

**Diagnosis:**
```bash
# Check batch details
curl "http://localhost:3000/api/monitoring/batch/{batch_id}"

# Check for stuck processes
ps aux | grep sync
```

**Solutions:**

1. **Mark as failed and retry:**
   ```bash
   # Via API
   curl -X POST "http://localhost:3000/api/import/batch/{id}/retry"
   ```

2. **Kill stuck process:**
   ```bash
   # Find process
   ps aux | grep "sync-machines"
   # Kill by PID
   kill <pid>
   ```

3. **Database lock:**
   - Check for uncommitted transactions
   - SQL Server: `SELECT * FROM sys.dm_exec_requests`

---

### Issue: Database Connection Failed

**Symptoms:**
- "Connection refused" errors
- Backend won't start

**Solutions:**

1. **Check SQL Server is running:**
   ```bash
   # Windows
   Get-Service -Name 'MSSQLSERVER'
   ```

2. **Verify credentials in .env:**
   ```env
   DB_SERVER=10.0.0.110
   DB_PORT=1433
   DB_USER=sa
   DB_PASSWORD=<correct-password>
   DB_NAME=rebinmas_absensi_monitoring
   ```

3. **Test connection:**
   ```bash
   # Via script
   npm run db:check
   ```

---

## Log Locations

| Component | Log Location |
|-----------|-------------|
| Backend (npm start) | Console stdout |
| Backend (pm2) | `~/.pm2/logs/` |
| Scheduler | Console / schedule.json |
| ZKTeco Sync | Console with `[Orchestrator]` prefix |

---

## Environment Variables Reference

```env
# Required
DB_SERVER=10.0.0.110
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=<password>
DB_NAME=rebinmas_absensi_monitoring
JWT_SECRET=<secret>

# ZKTeco
ZKTECO_PASSWORD=12345
ZKTECO_TIMEOUT_MS=30000

# Server
APP_PORT=3000
APP_ENV=development
```

---

## Useful Commands

```bash
# Restart backend
npm run build && npm run start

# Run migrations
npm run db:migrate

# Force sync all machines
curl -X POST http://localhost:3000/api/scheduler/sync-all

# Check scheduler status
curl http://localhost:3000/api/scheduler/status

# View quality summary
curl http://localhost:3000/api/quality/summary
```

---

## Getting Help

1. Check logs for specific error messages
2. Review [BUGS-FIXES.md](BUGS-FIXES.md) for known issues
3. Check GitHub issues for similar problems
4. Contact IT team with:
   - Error message
   - Steps to reproduce
   - Server logs (relevant portions)
