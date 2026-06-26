---
tags: [ai-context, api, deprecated]
created: 2026-06-07
updated: 2026-06-26
---

# API Client Architecture

## ⚠️ DEPRECATED (2026-06-25)

**IT Solution REST API is non-operational.** The `AbsensiApiClient` class and all IT Solution API integration code is deprecated.

**All attendance data now comes from ZKTeco machines via direct TCP connection.**

This document is kept for historical reference.

---

## Historical: IT Solution API Client

**Original Base URL:** `http://10.0.0.110:5176`

The `AbsensiApiClient` class handled HTTP requests to the IT Solution API:

```typescript
// _dev_utils/src/absensi-client.ts
export class AbsensiApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.absensiApi.baseUrl;
    this.apiKey = config.absensiApi.apiKey;
  }
}
```

**Methods:** `getDivisions()`, `getAvailableMonths()`, `getAttendance()`, `getLatestAttendance()`

---

## Current: ZKTeco-Only Data Flow

All data now comes from ZKTeco machines via `node-zklib@1.3.0` TCP connection:

```
ZKTeco Machine (port 4370)
    ↓ TCP socket
node-zklib → fetchAttendanceRecords()
    ↓
attendance_scan_logs
    ↓ NIK cascade enrichment
attendance_imports
    ↓
Monthly Matrix API → Frontend
```

**Key classes:**
- `sync-orchestrator.service.ts` — orchestrates machine sync
- `zkteco-employee-code-parser.ts` — SSOT employee code mapping
- `attendance-process-import.service.ts` — scan_logs → attendance_imports pipeline

---

## IT Solution API References

| Reference | Status |
|-----------|--------|
| `_dev_utils/src/absensi-client.ts` | DEPRECATED — do not use |
| `_dev_utils/src/api-attendance-import.service.ts` | DEPRECATED |
| `config.absensiApi` | DEPRECATED |
| IT Solution API Base URL | Non-operational |

**No IT Solution API fallback exists.** If a ZKTeco machine is inaccessible, data is simply not captured until network is restored.
