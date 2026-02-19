# Documentation Automation

## Objective

Keep API endpoint documentation updated whenever new features are coded.

## Commands

Generate once:
```bash
npm run docs:generate
```

Watch `src/` and regenerate on every `.js` change:
```bash
npm run docs:watch
```

## What is generated automatically

- `docs/api/endpoints.generated.md`
- `docs/openapi/openapi.generated.json`

The generator scans:
- `src/routes.js` for mounted routers
- each mounted route file for `router.get/post/put/patch/delete(...)`

## Recommended team process

1. Start watcher during development:
   - `npm run docs:watch`
2. Add/update business docs manually in:
   - `docs/api/*.md`
   - `docs/workflows/*.md`
3. Before commit:
   - run `npm run docs:generate`
   - commit updated docs.
