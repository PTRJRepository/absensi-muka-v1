# Absensi_Muka - Sistem Absensi PT Rebinmas Jaya

## Dokumentasi Lengkap v1.1 | Di-generate: 2026-06-22

---

## 📋 Daftar Isi

1. [Ringkasan Proyek](#ringkasan-proyek)
2. [Arsitektur](#arsitektur)
3. [Fitur](#fitur)
4. [Database](#database)
5. [API Endpoints](#api-endpoints)
6. [Masalah Diketahui](#masalah-diketahui)
7. [Troubleshooting](#troubleshooting)
8. [Panduan Pengembangan](#panduan-pengembangan)

---

## Ringkasan Proyek

**Nama Proyek:** Sistem Absensi PT Rebinmas Jaya  
**Tujuan:** Monitoring dan penyimpanan data absensi dari 16 mesin absensi ZKTeco  
**Lokasi:** Berbagai lokasi perkebunan kelapa sawit

### Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Backend | Node.js v22+ / TypeScript |
| Frontend | React / TypeScript / Vite |
| Database | SQL Server (mssql) |
| Biometrics | ZKTeco via node-zklib@1.3.0 |
| Config | Environment variables (zod) |

### Mesin ZKTeco

| Status | Jumlah | Mesin |
|--------|--------|-------|
| **Accessible** | 7 | OFFICE_PGE, OFFICE_APE, MILL, IJL, AB2, P1A, P1B |
| **Inaccessible** | 9 | DME_01, DME_02, ARC_01, ARC_02, ARA, AB1, P2A_01, P2B, P2A_02 |

---

## ⚠️ PERINGATAN KRITIS

```
IMPORTANT: IT Solution API DOES NOT EXIST
All attendance data comes from ZKTeco machines only.
The `api-attendance-import.service.ts` file is DEPRECATED.
```

---

## Struktur Direktori

```
Absensi_Muka/
├── src/
│   ├── api/                    # HTTP API layer
│   │   ├── router.ts          # Route registration
│   │   ├── routes/           # 22 API endpoint definitions
│   │   ├── middleware/        # Auth middleware
│   │   └── services/         # API-specific services
│   ├── modules/              # Business logic modules
│   │   ├── machines/         # Machine management
│   │   ├── employees/       # Employee data
│   │   ├── import/          # Data import
│   │   ├── attendance/      # Attendance processing
│   │   ├── monitoring/     # Dashboard, anomaly, quality
│   │   └── audit/          # Audit logging
│   ├── shared/               # Shared utilities
│   │   └── database/       # SQL Client (legacy)
│   ├── lib/                 # Core utilities
│   │   ├── db.ts           # Direct MSSQL connection
│   │   └── realtime-emitter.ts  # SSE event system
│   ├── config/              # Environment validation
│   ├── types/               # TypeScript type definitions
│   ├── scripts/            # CLI scripts & audit tools
│   └── seed/               # Database seeding
├── frontend/                 # React frontend (Vite)
├── migrations/              # 23 SQL migrations
├── _dev_utils/             # Development utilities
└── docs/                   # This documentation
```

---

## Command Reference

```bash
# Backend
npm run build           # Compile TypeScript
npm run start           # Start production server
npm run dev             # Start development (ts-node)

# Database
npm run db:migrate      # Run migrations
npm run db:check        # Check database status

# Sync & Seed
npm run sync:machines   # Sync from all machines
npm run seed:machines   # Seed machine inventory
npm run seed:dummy      # Seed dummy data

# Frontend
npm run frontend:dev    # Start frontend dev server
npm run frontend:build  # Build frontend
```

### API Routes (22 registered)

| Route File | Base Path | Description |
|------------|-----------|-------------|
| auth.routes | /api/auth | Authentication |
| dashboard.routes | /api/dashboard | Dashboard stats |
| employees.routes | /api/employees | Employee CRUD |
| attendance.routes | /api/attendance | Attendance data |
| sync.routes | /api/sync | Machine sync control |
| machines.routes | /api/machines | Machine management |
| mapping.routes | /api/mapping | Employee-device mapping |
| audit.routes | /api/audit | Audit logs |
| reports.routes | /api/reports | Report generation |
| quality.routes | /api/quality | Data quality checks |
| division.routes | /api/division | Division management |
| realtime.routes | /api/realtime | SSE live feed |
| scheduler.routes | /api/scheduler | Job scheduling |
| import.routes | /api/import | Manual import |
| alert.routes | /api/alert | Alert configuration |
| ops.routes | /api/ops | Ops summary/incidents |
| monitoring.routes | /api/monitoring | Monitoring stats |
| machine-employee.routes | /api/machine-employee | Machine-employee view |
| import-control.routes | /api/import-control | Import control |
| attendance-process.routes | /api/attendance-process | Process imports |
| cross-location.routes | /api/cross-location | Cross-location audit |
| realtime-status.routes | /api/realtime-status | Real-time machine status |

---

## Environment Variables

```env
# Database
DB_SERVER=10.0.0.110
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=<password>
DB_NAME=rebinmas_absensi_monitoring

# Auth
JWT_SECRET=<secret>
JWT_EXPIRES_IN=1d

# ZKTeco
ZKTECO_PASSWORD=12345
ZKTECO_TIMEOUT_MS=30000
```

---

## Kontak & Dukungan

Untuk pertanyaan teknis, hubungi tim IT PT Rebinmas Jaya.
