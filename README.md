# Mall Management API

REST API for mall operations: authentication, tenant onboarding, box management, products, credits, and billing/invoice workflows.

## Quick Start

```bash
npm install
npm run docs:generate
npm start
```

Server default URL:
- `http://localhost:7878/api`

## Documentation

Start here:
- `docs/README.md`

Main sections:
- `docs/setup.md`
- `docs/architecture.md`
- `docs/data-models.md`
- `docs/api/*.md`
- `docs/workflows/*.md`

Auto-generated endpoint index:
- `docs/api/endpoints.generated.md`
- `docs/openapi/openapi.generated.json`

## Auto Documentation (for future features)

Generate docs manually:
```bash
npm run docs:generate
```

Watch source files and regenerate docs automatically while coding:
```bash
npm run docs:watch
```

`prestart` already runs `docs:generate`, so docs are refreshed before server start.
