# Technical Documentation

This folder contains functional and technical documentation for the whole API.

## Index

- Setup and run:
  - `docs/setup.md`
- Architecture and modules:
  - `docs/architecture.md`
- Data models:
  - `docs/data-models.md`
- Automation:
  - `docs/automation.md`
- API reference:
  - `docs/api/auth.md`
  - `docs/api/admin.md`
  - `docs/api/users.md`
  - `docs/api/boxes.md`
  - `docs/api/products.md`
  - `docs/api/billing.md`
  - `docs/api/credit.md`
- Workflows:
  - `docs/workflows/tenant-onboarding.md`
  - `docs/workflows/billing-invoices.md`

## Auto-generated references

- Endpoint inventory:
  - `docs/api/endpoints.generated.md`
- OpenAPI generated skeleton:
  - `docs/openapi/openapi.generated.json`

## Keeping docs updated

Run once:
```bash
npm run docs:generate
```

Run continuously during development:
```bash
npm run docs:watch
```
