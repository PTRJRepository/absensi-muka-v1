---
tags: [ai-context, tech-stack]
created: 2026-06-07
---

# Tech Stack

## Runtime Environment

| Component | Version | Notes |
|-----------|--------|-------|
| Node.js | v22.14.0 | Primary runtime |
| Bun | latest | Alternative runtime (used in scripts) |
| TypeScript | 5.8.3 | Language |

## Core Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| `node-zklib` | 1.3.0 | ZKTeco machine communication (TCP) |
| `zklib` | 0.2.11 | Alternative ZKTeco library (UDP) |
| `mssql` | 12.5.5 | SQL Server database driver |
| `mysql2` | 3.20.0 | MySQL driver (unused) |
| `node-cron` | 3.0.3 | Task scheduling |
| `uuid` | latest | Batch ID generation |
| `dotenv` | 17.4.2 | Environment configuration |

## Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/node` | 22.15.21 | TypeScript definitions |
| `@types/bun` | latest | Bun type definitions |
| `@types/node-cron` | 3.0.11 | Cron type definitions |
| `@types/mssql` | 12.3.0 | MSSQL type definitions |
| `ts-node` | 10.9.2 | TypeScript execution |
| `typescript` | 5.8.3 | TypeScript compiler |

## External Services

| Service | URL | Protocol |
|---------|-----|----------|
| IT Solution API | http://10.0.0.110:5176 | REST/HTTP |
| SQL Gateway | http://10.0.0.110:8001/v1/query | HTTP POST |
| ZKTeco Machines | Various IPs | TCP (port 4370+) |

## Database

| Component | Value |
|-----------|-------|
| Type | SQL Server |
| Server | SERVER_PROFILE_1 |
| Database | extend_db_ptrj |
| Access | HTTP Gateway (REST) |
| Authentication | API Key |

## Network Configuration

### ZKTeco Machines
- Default port: 4370
- Alternate ports: 4100, 4200, 4300, 4400, 4500, 4600, 4700, 4800, 4900
- Timeout: 10000-20000ms
- Authentication: Password "12345"

### API Endpoints
- IT Solution: `/api/divisions`, `/api/available-months-by-division`, `/api/attendance-by-division`
- SQL Gateway: `/v1/query`

## Build & Deployment

```bash
# Development
npm run dev          # ts-node src/index.ts

# Build
npm run build         # tsc

# Production
npm run start        # node dist/index.js

# Sync operations
npm run sync          # bun run src/sync.ts
npm run sync:schedule # bun run src/scheduler.ts
```
