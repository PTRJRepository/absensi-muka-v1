---
tags: [ai-context, documentation, index]
created: 2026-06-07
---

# AI Context Documentation Index

This folder contains comprehensive AI-ready documentation for the Sistem Absensi PT Rebinmas Jaya project.

## Documentation Files

### Overview Documents

| File | Description |
|------|-------------|
| `00_EXECUTIVE_SUMMARY.md` | High-level project summary |
| `01_PROJECT_OVERVIEW.md` | Project purpose and scope |
| `02_TECH_STACK.md` | Technology stack details |
| `03_FOLDER_STRUCTURE.md` | Project file organization |
| `04_MODULE_MAP.md` | Module inventory and dependencies |

### Architecture Documents

| File | Description |
|------|-------------|
| `05_FRONTEND_CONTEXT.md` | Frontend analysis (N/A - backend only) |
| `06_BACKEND_CONTEXT.md` | Backend architecture and data flow |
| `07_DATABASE_CONTEXT.md` | Database schema and queries |
| `08_API_CONTEXT.md` | API endpoints and integrations |

### Security & Operations

| File | Description |
|------|-------------|
| `09_AUTH_PERMISSION_CONTEXT.md` | Authentication analysis |
| `13_CONFIG_ENV_CONTEXT.md` | Configuration management |
| `14_SECURITY_PRIVACY_AUDIT.md` | Security audit findings |
| `15_ERROR_HANDLING_LOGGING.md` | Error patterns and logging |

### Process Documents

| File | Description |
|------|-------------|
| `10_BUSINESS_FLOW.md` | Business process flows |
| `11_UI_UX_FLOW.md` | User journey (N/A - backend only) |
| `12_INTEGRATION_CONTEXT.md` | External integrations |

### Quality & Deployment

| File | Description |
|------|-------------|
| `16_TESTING_CONTEXT.md` | Test coverage and scripts |
| `17_DEPLOYMENT_CONTEXT.md` | Deployment guide |

### Status & Planning

| File | Description |
|------|-------------|
| `18_CURRENT_STATUS.md` | Current project status |
| `19_KNOWN_ISSUES_AND_TECH_DEBT.md` | Issues and technical debt |
| `20_NEXT_DEVELOPMENT_PLAN.md` | Roadmap and phases |

### Special Documents

| File | Description |
|------|-------------|
| `21_AI_HANDOFF_CONTEXT.md` | Safe-to-share project summary |
| `README.md` | This documentation index |

---

## Quick Reference

### For New AI Agent

Start with these files:
1. `21_AI_HANDOFF_CONTEXT.md` - Safe overview
2. `01_PROJECT_OVERVIEW.md` - Project details
3. `06_BACKEND_CONTEXT.md` - Architecture
4. `07_DATABASE_CONTEXT.md` - Database schema

### For Development Tasks

1. `04_MODULE_MAP.md` - Find relevant module
2. `08_API_CONTEXT.md` - API usage
3. `15_ERROR_HANDLING_LOGGING.md` - Error handling
4. `16_TESTING_CONTEXT.md` - Testing approach

### For Debugging

1. `14_SECURITY_PRIVACY_AUDIT.md` - Security considerations
2. `15_ERROR_HANDLING_LOGGING.md` - Error patterns
3. `18_CURRENT_STATUS.md` - Current issues
4. `19_KNOWN_ISSUES_AND_TECH_DEBT.md` - Known problems

---

## Documentation Standards

### Tags

All documents include YAML frontmatter with tags:
```yaml
---
tags: [ai-context, category, documentation]
created: 2026-06-07
---
```

### Categories

| Category | Description |
|----------|-------------|
| ai-context | AI context documents |
| executive-summary | High-level overview |
| project-overview | Project details |
| tech-stack | Technology details |
| backend | Backend architecture |
| database | Database schema |
| api | API documentation |
| security | Security analysis |
| deployment | Deployment guide |
| status | Project status |
| tech-debt | Technical debt |
| roadmap | Development plan |

---

## Related Documentation

### User Documentation (`context_user/`)

- `01-project-overview.md` - Project overview
- `02-machine-configuration.md` - Machine details
- `03-data-sources.md` - Data access guide
- `04-database-schema.md` - Database schema
- `05-access-guide.md` - Troubleshooting
- `06-current-status.md` - Current status
- `07-api-reference.md` - API reference

### Source Code (`_dev_utils/src/`)

- `config.ts` - Configuration
- `machine-config.ts` - Machine mappings
- `absensi-client.ts` - API client
- `sql-client.ts` - Database client
- `sync.ts` - Sync logic
- `scheduler.ts` - Scheduler
- `database.ts` - Schema
- `absensi-service.ts` - Service layer

---

## Generation Info

- **Generated:** 2026-06-07
- **Project:** Sistem Absensi PT Rebinmas Jaya
- **Files:** 23 documents
- **Total Size:** Comprehensive coverage

---

*For questions or updates, refer to the project CLAUDE.md file.*
