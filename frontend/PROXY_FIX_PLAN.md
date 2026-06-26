# Vite Proxy Fix Plan

## Problem Summary
Vite dev server proxy was returning HTML (SPA fallback) instead of proxying `/api/*` requests to the backend at `localhost:8004`.

## Root Cause
**Vite 6.x has a bug/incompatibility when parsing TypeScript config files (`vite.config.ts`) for proxy configuration.** The proxy settings in `vite.config.ts` were silently ignored.

## Evidence
```
# Before fix - returns HTML:
$ curl http://localhost:3001/api/attendance/daily?date=2026-06-18
<script type="module" src="/@vite/client"></script>
<div id="root"></div>...

# Direct backend works:
$ curl http://localhost:8004/api/attendance/daily?date=2026-06-18
{"success":true,"data":[...],"message":"OK"}
```

## Solution
**Convert `vite.config.ts` to `vite.config.js`**

## Before (vite.config.ts) - BROKEN
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
});
```

## After (vite.config.js) - WORKING
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
});
```

## Verification Commands
```bash
# Test proxy works
curl http://localhost:3001/api/dashboard/stats
# Expected: JSON response with dashboard stats

curl "http://localhost:3001/api/attendance/daily?date=2026-06-18"
# Expected: JSON array of attendance records

# Test build works
npx vite build
# Expected: Successful build with no errors
```

## Related Issue
This is a known issue with Vite 6.x - TypeScript config files don't properly parse proxy configuration.
- Reference: https://github.com/vitejs/vite/issues/15776

## Files Changed
- **Deleted:** `vite.config.ts`
- **Created:** `vite.config.js`
