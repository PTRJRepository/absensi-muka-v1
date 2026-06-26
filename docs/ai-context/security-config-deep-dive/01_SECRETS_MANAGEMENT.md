---
tags: [ai-context, security, secrets]
created: 2026-06-07
updated: 2026-06-26
---

# Secrets Management Documentation

> **Classification:** Internal Use Only
> **Version:** 2.0.0 (post-recovery)
> **Last Updated:** 2026-06-26

## Overview

This document describes how sensitive credentials are stored and managed in the Absensi PT Rebinmas Jaya system.

**Post-recovery changes:**
- SQL Gateway (HTTP endpoint) is **DEPRECATED** — replaced by direct mssql connection
- IT Solution API is **DEPRECATED** — all data from ZKTeco direct TCP
- Secrets now stored in `.env` file (not `config.ts`)

---

## Current Secret Storage

### Location: `.env` (root directory)

**This file must NEVER be committed to version control.**

```bash
DB_SERVER=10.0.0.110
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=<DB_PASSWORD>
DB_NAME=rebinmas_absensi_monitoring
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true

JWT_SECRET=<JWT_SECRET>
JWT_EXPIRES_IN=7d

APP_PORT=8004

ZKTECO_PASSWORD=12345
ZKTECO_TIMEOUT_MS=30000

SYNC_INTERVAL_MINUTES=60

HR_DB_SERVER=10.0.0.110
```

### Configuration Loading

The system uses `src/config/env.ts` with `zod` validation:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  DB_SERVER: z.string(),
  DB_PORT: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_ENCRYPT: z.string(),
  DB_TRUST_SERVER_CERTIFICATE: z.string(),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string(),
  APP_PORT: z.string(),
  ZKTECO_PASSWORD: z.string(),
  ZKTECO_TIMEOUT_MS: z.string(),
  SYNC_INTERVAL_MINUTES: z.string(),
  HR_DB_SERVER: z.string(),
});

export const env = envSchema.parse(process.env);
```

---

## Secret Types (Current)

| Secret | Location | Purpose |
|--------|----------|---------|
| DB_PASSWORD | .env | SQL Server authentication (sa account) |
| JWT_SECRET | .env | Backend JWT signing |
| ZKTECO_PASSWORD | .env | ZKTeco machine authentication |

## Deprecated Secrets

| Secret | Former Location | Status |
|--------|----------------|--------|
| SQL Gateway API Key | `_dev_utils/src/config.ts` | DEPRECATED |
| IT Solution API Key | `_dev_utils/src/config.ts` | DEPRECATED |
| SQL Gateway Base URL | `_dev_utils/src/config.ts` | DEPRECATED |

---

## Security Notes

### Current State (2026-06-26)

1. **Plain text .env** — secrets in `.env` file (standard Node.js pattern)
2. **No encryption at rest** — secrets are plain text
3. **Internal network only** — app server (10.0.0.110) is on internal VPN/network
4. **SQL Server auth** — using `sa` account (standard SQL Server setup)

### Recommended Hardening

#### 1. Move secrets to environment variables at runtime (current approach)
```bash
# Production deployment
export DB_PASSWORD="<DB_PASSWORD>"
node dist/server.js
```

#### 2. Use a secrets manager (future)
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault

#### 3. Restrict .env access (current .gitignore)
```bash
# .gitignore should contain:
.env
.env.local
.env.production
```

---

## Key Rotation

### SQL Server Password

1. Change password in SQL Server Management Studio
2. Update `DB_PASSWORD` in `.env`
3. Restart the application

### JWT Secret

1. Generate new random string: `openssl rand -hex 32`
2. Update `JWT_SECRET` in `.env`
3. All existing JWTs become invalid (users must re-login)

### ZKTeco Machine Password

1. Update password on each machine via ZKTeco software
2. Update `ZKTECO_PASSWORD` in `.env`
3. Restart the application

---

## ZKTeco Device Password

The ZKTeco machines use a shared default password `12345`. This is hardcoded in the ZKTeco protocol but loaded from the `ZKTECO_PASSWORD` environment variable:

```typescript
// src/modules/machines/zkteco.service.ts
await zk.zklibTcp.executeCmd(
  COMMANDS.CMD_AUTH,
  Buffer.from(env.ZKTECO_PASSWORD)  // "12345"
);
```

---

## File Permissions

### Windows (current)

```powershell
# .env file — owner only
icacls "D:\Gawean Rebinmas\Absensi_Muka\.env" /inheritance:r /grant:r "%USERNAME%:(R,W)"

# _dev_utils — should NOT contain secrets anymore (migrated to .env)
```

---

## Related Documentation

- `docs/ai-context/api-integration-deep-dive/01_API_CLIENT_ARCHITECTURE.md` — IT Solution API deprecated
- `docs/ai-context/api-integration-deep-dive/02_ENDPOINTS_REFERENCE.md` — Current internal API endpoints
- `docs/ai-context/07_DATABASE_CONTEXT.md` — DB schema documentation
