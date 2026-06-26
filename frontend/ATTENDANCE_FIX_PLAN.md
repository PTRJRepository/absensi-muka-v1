# ATTENDANCE_FIX_PLAN.md

## Root Cause

**The Vite dev server has NO proxy configuration.** Without `vite.config.ts`, when the browser requests `/api/attendance/daily`, Vite serves HTML instead of forwarding to the backend on port 8004.

Evidence:
- `curl http://localhost:3001/api/dashboard/stats` returns HTML (`<script>...`)
- No `vite.config.ts` or proxy configuration exists in `frontend/`
- Frontend built JS hardcodes `localhost:8004`, which only works in production when the backend serves static files

## Files to Create

### 1. `vite.config.ts` — Add proxy configuration

**Location:** `D:\Gawean Rebinmas\Absensi_Muka\frontend\vite.config.ts`

**Current state:** File does NOT exist

**Fix:** Create the config file with proxy rules

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
      '/auth': {
        target: 'http://localhost:8004',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
```

**Why this works:**
- During development, Vite proxies `/api/*` requests to `http://localhost:8004`
- Browser sees responses from `localhost:3001` → no CORS issues
- Production build uses hardcoded `localhost:8004` → backend serves static files + API

## Verification Steps

1. **Start the backend:**
   ```bash
   cd D:\Gawean Rebinmas\Absensi_Muka
   npm run dev
   ```

2. **Verify backend is running:**
   ```bash
   curl http://localhost:8004/api/dashboard/stats
   # Should return JSON like: {"success":true,"data":{...}}
   ```

3. **Restart the frontend dev server** (to load new vite.config.ts)

4. **Test proxy:**
   ```bash
   curl http://localhost:3001/api/dashboard/stats
   # Should return JSON (same as backend), NOT HTML
   ```

5. **Build verification:**
   ```bash
   cd D:\Gawean Rebinmas\Absensi_Muka\frontend
   npx vite build
   # Must succeed without errors
   ```

6. **Browser test:**
   - Navigate to http://localhost:3001/absensi
   - Should see attendance data (not 0 records)
   - Dashboard should also work

## Additional Notes

- The `api.ts` file already handles both wrapped and unwrapped responses (good!)
- The `AttendancePage.tsx` already uses yesterday's date by default (good!)
- The `RealtimePage.tsx` already uses `/api/attendance/daily` (good!)
- Only missing piece: **vite.config.ts proxy configuration**
