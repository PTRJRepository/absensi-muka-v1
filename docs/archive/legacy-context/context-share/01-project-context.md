# Project Overview - Absensi_Muka

## Project Identity

| Field | Value |
|-------|-------|
| **Project Name** | Sistem Absensi PT Rebinmas Jaya |
| **Type** | Attendance Monitoring System |
| **Purpose** | Monitor and store attendance data from 16 ZKTeco biometric machines |
| **Location** | Palm oil plantation locations |
| **Last Audit** | 2026-06-21 |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js v22+ |
| **Language** | TypeScript |
| **Backend** | Express-like custom router |
| **Frontend** | React 18 + Vite |
| **Database** | SQL Server (mssql) |
| **Biometrics** | ZKTeco via node-zklib@1.3.0 |
| **Auth** | JWT |

---

## Quick Stats

| Metric | Value |
|--------|-------|
| Total Machines | 16 |
| Accessible Machines | 7 |
| Inaccessible Machines | 9 |
| API Endpoints | 72 |
| Route Files | 20 |
| Frontend Pages | 10 |
| Backend Modules | 8 |

---

## Critical Warnings

1. **IT Solution API DOES NOT EXIST** - All data from ZKTeco only
2. **Dual Database Target** - `extend_db_ptrj` (legacy) vs `rebinmas_absensi_monitoring` (new)
3. **Alert Notifications NOT IMPLEMENTED** - Email/SMS/Webhook are placeholders
4. **Unmapped Users Dropped** - Not stored during sync

---

## Documentation Files

- [README.md](README.md) - Project overview
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [FEATURES.md](FEATURES.md) - Feature status
- [DATABASE.md](DATABASE.md) - Database schema
- [API.md](API.md) - API endpoints
- [BUGS-FIXES.md](BUGS-FIXES.md) - Known issues
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Problem solving

---

## Related Context Files

- [[01-project-context]] - Project overview (this file)
- [[02-system-architecture]] - Detailed architecture
- [[03-database-schema]] - Database tables and relationships
- [[04-api-endpoints]] - Complete API reference
- [[05-machine-integration]] - ZKTeco integration details
- [[06-attendance-matrix]] - Monthly matrix feature
- [[07-alert-system]] - Alert system status
- [[08-employee-mapping]] - Employee code mapping
- [[09-known-issues]] - All known bugs and fixes
- [[10-quick-fixes]] - Critical fixes needed
