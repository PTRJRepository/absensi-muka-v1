# SQL Gateway Removal Checklist

## Replace
- [x] New API uses `src/lib/db.ts` with direct `mssql` pool.
- [x] New env uses `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- [x] Default database is `rebinmas_absensi_monitoring`.
- [x] New migrations create database and schema directly.
- [x] Seeder dummy targets new schema.

## Keep as legacy reference only
- [ ] `src/shared/database/sql-client.ts` references SQL Gateway.
- [ ] `src/shared/config/app-config.ts` references SQL Gateway and `extend_db_ptrj`.
- [ ] Old migration scripts target `extend_db_ptrj`.
- [ ] Old docs mention SQL Gateway.

## Owner confirmation needed
Status: perlu konfirmasi owner before deleting or archiving legacy pipeline files.

## Verification commands
```powershell
rg -n "SQL Gateway|10\.0\.0\.110:8001|/v1/query" -S .
rg -n "extend_db_ptrj" -S .
rg -n "SQL_GATEWAY|SQL_DATABASE" -S src
```
Expected: matches only in legacy docs/files and migration-plan references, not new API target.
