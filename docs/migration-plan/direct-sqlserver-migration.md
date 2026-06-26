# Direct SQL Server Migration Plan

## Current legacy findings
- Legacy database client: `src/shared/database/sql-client.ts` sends SQL to HTTP SQL Gateway.
- Legacy config: `src/shared/config/app-config.ts` defaults to SQL Gateway URL and `extend_db_ptrj`.
- Legacy migrations: `migrations/001_create_schema.sql`, root `mig_*.sql`, and `run-migration-*.mjs` target `extend_db_ptrj`.
- Legacy docs mention SQL Gateway and `extend_db_ptrj`; keep them as history only.
- Root `.env` exists and is treated as private. It was not copied into source.

## Target architecture
```txt
Frontend dashboard -> Backend API -> mssql connection pool -> rebinmas_absensi_monitoring
```

## Migration strategy
1. Create new database `rebinmas_absensi_monitoring` with new migrations.
2. Replace gateway client usage in new API with `src/lib/db.ts` using `mssql`.
3. Keep old pipeline files as reference until owner approves archive/removal.
4. Store all sensitive values in `.env`; ship only `.env.example` dummy values.
5. Seed safe dummy users, employees, machines, attendance, sync logs, and corrections.
6. Optional future real-data migration belongs in `scripts/migrate-from-legacy.ts` and must not run automatically.

## Status
- SQL Gateway is legacy only.
- `extend_db_ptrj` is legacy only.
- New app writes to `rebinmas_absensi_monitoring` only.
