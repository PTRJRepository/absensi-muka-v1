---
tags: [ai-context, folder-structure]
created: 2026-06-07
---

# Folder Structure

## Root Directory

```
D:/Gawean Rebinmas/Absensi_Muka/
├── .claude/                    # Claude Code configuration
├── .env                       # Environment variables
├── .remember/                  # Memory storage
├── context_user/              # User documentation
├── docs/                      # AI documentation (this folder)
├── Dokumentasi/              # Raw documentation
├── migrations/                # Database migrations
├── node_modules/             # Dependencies
├── src/                       # Main source code
├── _dev_utils/               # Development utilities
├── CLAUDE.md                  # Project context
├── AGENTS.md                  # Agent instructions
├── package.json               # Project dependencies
├── package-lock.json         # Lock file
└── tsconfig.json             # TypeScript config
```

## _dev_utils/ (Development Utilities)

```
_dev_utils/
├── src/                       # Source scripts
│   ├── config.ts             # Configuration (API keys, URLs)
│   ├── machine-config.ts     # 15 machine configurations
│   ├── absensi-client.ts     # IT Solution API client
│   ├── absensi-import.ts     # Import pipeline (API → DB)
│   ├── sql-client.ts         # SQL Gateway client
│   ├── database.ts           # Schema definitions
│   ├── absensi-service.ts    # Service layer
│   ├── sync.ts              # Main sync logic
│   ├── scheduler.ts         # Auto-sync scheduler
│   ├── machine-client.ts    # Machine connection helpers
│   ├── machine-sync.ts      # ZKTeco machine sync
│   ├── init-db.ts           # Database initialization
│   ├── init-attendance-tables.ts
│   ├── seed-master-data.ts  # Master data seeding
│   ├── run-migration.ts     # Migration runner
│   ├── execute-migration.ts
│   ├── migrate-v1.ts
│   ├── db-tool.ts
│   ├── db-diag.ts
│   ├── check-tables.ts
│   ├── check-tables2.ts
│   ├── debug-fetch.ts
│   └── test-*.ts            # Various test scripts
├── schema.sql                # Full database schema
├── schema-absensi.sql        # Alternative schema
├── migration_*.sql          # Migration files
├── attendance-*.json        # Exported attendance data
├── users-*.json             # Exported user data
├── attendance-export.json   # Combined export
├── users-export.json        # Combined user export
└── node_modules/            # Development dependencies
```

## Key File Purposes

| File | Purpose |
|------|---------|
| `config.ts` | API keys, SQL gateway, sync settings |
| `machine-config.ts` | 15 machine IP/port/scanner mapping |
| `absensi-client.ts` | IT Solution REST API client |
| `absensi-import.ts` | API → Database import pipeline |
| `sql-client.ts` | HTTP-based SQL Server client |
| `sync.ts` | MERGE-based upsert sync logic |
| `scheduler.ts` | setInterval-based auto-sync |
| `database.ts` | Table schema definitions |
| `schema.sql` | Complete SQL Server schema |

## Configuration Files

| File | Description |
|------|-------------|
| `.env` | Environment variables |
| `tsconfig.json` | TypeScript configuration |
| `package.json` | Project dependencies |
