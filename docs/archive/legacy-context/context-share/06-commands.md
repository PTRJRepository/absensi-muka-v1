# Commands Reference

## Development Commands

### Test Machine Connections
```bash
bun run _dev_utils/test-all-machines.ts
```
Test koneksi ZKTeco ke semua 16 mesin.

### Export Attendance Data
```bash
bun run _dev_utils/export-all-machines.ts
```
Export users dan attendance logs dari semua mesin yang accessible.

### Import to Database
```bash
bun run _dev_utils/import-direct-mssql.ts
```
Import data ke database `rebinmas_absensi_monitoring` menggunakan direct MSSQL connection.

### Check Database Status
```bash
bun run _dev_utils/check-attendance-db.ts
```
Cek status database: jumlah employees, records, batches.

### Backend Commands
```bash
npm run build    # Build TypeScript
npm run start    # Start production server
npm run dev      # Start development server
```

---

## Database Commands

### Seed Machine Inventory
```bash
bun run _dev_utils/src/seed/seed-machine-inventory.ts
```
Seed/update data mesin di database.

---

## Troubleshooting Commands

### Test ZKTeco Connection (Single Machine)
```typescript
import ZKLib from 'node-zklib';

const zk = new ZKLib('10.0.0.90', 4100, 30000, 4000, '12345');
await zk.createSocket();
await zk.disableDevice();

const users = await zk.getUsers();
const att = await zk.getAttendances();

console.log(`Users: ${users.data.length}`);
console.log(`Attendance: ${att.data.length}`);

await zk.enableDevice();
await zk.disconnect();
```

### Test API Connection
```bash
curl -X GET "http://10.0.0.110:5176/api/divisions" \
  -H "x-api-key: YOUR_API_KEY"
```

### Check Network Connectivity (PowerShell)
```powershell
# Test P1A
Test-NetConnection 10.0.0.90 -Port 4100

# Test P2A (will fail)
Test-NetConnection 223.25.98.220 -Port 4500
```

---

## File Locations

| File | Path | Purpose |
|------|------|---------|
| Machine Config | `_dev_utils/src/machine-config.ts` | 16 machine configurations |
| Database Config | `_dev_utils/src/config.ts` | DB & API config |
| Test Machines | `_dev_utils/test-all-machines.ts` | Test all connections |
| Export | `_dev_utils/export-all-machines.ts` | Export from machines |
| Import | `_dev_utils/import-direct-mssql.ts` | Import to database |
| Check DB | `_dev_utils/check-attendance-db.ts` | Database status |
| Export Data | `_dev_utils/attendance-all-*.json` | Exported attendance |
| User Data | `_dev_utils/users-all-*.json` | Exported users |
