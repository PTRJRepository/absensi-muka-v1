---
---
tags: [ai-context, auth]
created: 2026-06-07
---

# Auth & Permission Context

## Overview

**This system does not implement traditional authentication/authorization.**

The Sistem Absensi is a backend data pipeline with:
- No user-facing application
- No login system
- No role-based access control
- No API authentication for consumers

## Authentication Methods

### 1. API Key Authentication (External Services)

Both external services require API key authentication:

**IT Solution API**
```
Header: x-api-key: {API_KEY}
```

**SQL Gateway**
```
Header: x-api-key: {API_KEY}
```

The API key is stored in `config.ts`:
```typescript
const config = {
  sqlGateway: {
    apiKey: "REDACTED" // Actual key stored in config
  },
  absensiApi: {
    apiKey: "REDACTED" // Same key
  }
};
```

### 2. ZKTeco Machine Authentication

All ZKTeco machines use the default password: `12345`

This is hardcoded in the connection logic:
```typescript
const { COMMANDS } = require('node-zklib/constants');
await zk.zklibTcp.executeCmd(COMMANDS.CMD_AUTH, Buffer.from('12345'));
```

### 3. Database Access

SQL Server access is managed through the HTTP Gateway:
- API key authentication at gateway level
- Server and database defined in request body
- No SQL Server native authentication in code

---

## Implied Permissions

Since there is no user authentication, data access is governed by:

1. **Network Access** - Who can access the servers
2. **API Keys** - Who has the API keys
3. **Database Permissions** - Gateway-level SQL Server permissions

---

## Security Considerations

### Current State
- API keys are stored in `config.ts` (not in .env or .gitignore)
- No encryption for stored credentials
- No API key rotation mechanism
- No audit logging of API access

### Recommendations for Future

1. **Move secrets to environment variables**
   - Use `.env` file with proper gitignore
   - Never commit API keys to version control

2. **Implement API key rotation**
   - Schedule periodic key rotation
   - Store old keys for backward compatibility during transition

3. **Add access logging**
   - Log all API access with timestamps
   - Track which divisions are accessed

4. **Consider API Gateway**
   - If exposing APIs externally, implement proper auth
   - JWT or API key authentication for consumers

5. **Database permissions**
   - Use least-privilege principle
   - Separate read-only and read-write access

---

## Related Files

- `_dev_utils/src/config.ts` - API key storage
- `_dev_utils/src/machine-sync.ts` - ZKTeco password
- `.env` - Environment variables (if used)
