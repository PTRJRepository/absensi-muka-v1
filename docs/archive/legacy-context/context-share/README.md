# Sistem Absensi PT Rebinmas Jaya

## Shareable Context Documentation

This folder contains documentation for the Attendance Monitoring System project that can be safely shared.

### Files in this folder:

1. **01-project-overview.md** - Project overview, architecture, status
2. **02-machine-configuration.md** - All 16 machine configurations
3. **03-api-reference.md** - Local App API (port 8004) + IT Solution API
4. **04-database-schema.md** - Database tables, views, employee code formats
5. **05-data-sources.md** - Data source guide (ZKTeco + API)
6. **06-commands.md** - Commands reference

### Key Documentation (in docs/ folder):

| File | Description |
|------|-------------|
| `docs/PRD-REFACTORED.md` | **Main PRD** - 8 sections, Phase 1-2 focus |
| `docs/DATA-DICTIONARY.md` | **Data Dictionary** - Terms, formats, codes |
| `docs/QUICK-REF.md` | **Quick Reference** - 1-page cheat sheet |

### Quick Start:

```bash
# API Server
npm run dev

# Test endpoints
curl http://localhost:8004/api/monitoring/dashboard
curl "http://localhost:8004/api/attendance/daily?date=2026-06-20"
```

### Key Points:

- **Server**: port 8004, database `rebinmas_absensi_monitoring`
- **16 machines**: 7 accessible, 9 blocked/unreachable
- **Dual Employee Code Format** (CRITICAL):
  - IT Solution API: "0010001" (7 digits)
  - ZKTeco: "A0044" (letter + 4 digits)
- **Quality Score Formula**: mapped(50%) + batches(25%) + online(15%) + non-dup(10%)

### For more details:

See the main project documentation in `context_user/` folder.
See complete PRD in `docs/PRD-REFACTORED.md`.
